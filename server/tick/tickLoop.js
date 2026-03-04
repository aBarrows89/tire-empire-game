import { TICK_MS } from '../config.js';
import { getAllActivePlayers, savePlayerState, getGame, saveGame, upsertLeaderboard, getPlayerListings, updatePlayerListing, getPlayer, removePlayer } from '../db/queries.js';
import { simDay } from '../engine/simDay.js';
import { simAIPlayerDay, isBotPlayer } from '../engine/aiPlayers.js';
import { initAIShops } from '../engine/aiShops.js';
import { getWealth } from '../../shared/helpers/wealth.js';
import { getStorageCap, getLocInv, getLocCap, rebuildGlobalInv, getCap, getInv } from '../../shared/helpers/inventory.js';
import { getCalendar } from '../../shared/helpers/calendar.js';
import { CITIES } from '../../shared/constants/cities.js';
import { TIRES } from '../../shared/constants/tires.js';
import { SOURCES } from '../../shared/constants/sources.js';
import { SUPPLIERS } from '../../shared/constants/suppliers.js';
import { getSupplierRelTier } from '../../shared/constants/supplierRelations.js';
import { P2P_FEES } from '../../shared/constants/marketplace.js';
import { GLOBAL_EVENTS, GLOBAL_EVENT_CHANCE, GLOBAL_EVENT_MAX_CONCURRENT } from '../../shared/constants/globalEvents.js';
import { MONET } from '../../shared/constants/monetization.js';
import { broadcast } from './broadcast.js';
import { checkAndSendPush } from '../notifications/sender.js';
import { updateAIPrices } from '../engine/aiPriceWar.js';
import { saveTournament } from '../db/queries.js';
import { runExchangeTick } from '../engine/exchangeTick.js';

let tickInterval = null;

// ── AI Phase-Out ──
// As real players join, AI shops and AI players gradually go out of business.
// This ensures the economy transitions from AI-populated to fully player-driven.

const AI_SHOPS_PER_REAL_PLAYER = 3;   // Each real player displaces ~3 AI shops
const AI_PLAYERS_PER_REAL_PLAYER = 2; // Each real player displaces ~2 AI players
const MAX_AI_REMOVALS_PER_DAY = 5;    // Don't remove too many at once (gradual)
const MIN_AI_SHOPS = 20;              // Keep a few AI shops so new players have some competition
const MIN_AI_PLAYERS = 0;             // Phase out all legacy AI — stealth bots are admin-managed

/**
 * Gradually phase out AI shops and AI players as real players join.
 * Prioritizes removing AI shops in cities where real players have shops.
 */
async function phaseOutAI(game, players) {
  // Real = not a bot of any kind. Stealth bots count as "real" for phase-out purposes (admin-managed).
  const realPlayers = players.filter(p => !isBotPlayer(p.game_state) && p.game_state.companyName);
  // Only auto-phase-out legacy isAI players (not stealth _botConfig — those are admin-managed)
  const aiPlayers = players.filter(p => p.game_state.isAI && !p.game_state._botConfig);
  const realCount = realPlayers.length;

  if (realCount === 0) return; // No real players yet, keep all AI

  const aiShops = game.ai_shops || [];

  // ── Phase out AI shops ──
  const baseAIShops = 746; // Original seed count
  const targetAIShops = Math.max(MIN_AI_SHOPS, baseAIShops - (realCount * AI_SHOPS_PER_REAL_PLAYER));
  const shopsToRemove = Math.min(MAX_AI_REMOVALS_PER_DAY, aiShops.length - targetAIShops);

  if (shopsToRemove > 0) {
    // Build set of cities where real players have shops — prioritize removing AI from those
    const realCities = new Set();
    for (const p of realPlayers) {
      for (const loc of (p.game_state.locations || [])) {
        realCities.add(loc.cityId);
      }
    }

    // Sort AI shops: those in real-player cities first, then by lowest wealth (weakest go first)
    const ranked = [...aiShops].sort((a, b) => {
      const aInReal = realCities.has(a.cityId) ? 0 : 1;
      const bInReal = realCities.has(b.cityId) ? 0 : 1;
      if (aInReal !== bInReal) return aInReal - bInReal;
      return (a.wealth || 0) - (b.wealth || 0);
    });

    const removeIds = new Set(ranked.slice(0, shopsToRemove).map(s => s.id));
    game.ai_shops = aiShops.filter(s => !removeIds.has(s.id));

    if (shopsToRemove > 0 && game.day % 30 === 0) {
      console.log(`  [AI Phase-Out] Removed ${shopsToRemove} AI shops (${game.ai_shops.length} remain, ${realCount} real players)`);
    }
  }

  // ── Phase out AI players ──
  const targetAIPlayers = Math.max(MIN_AI_PLAYERS, 12 - (realCount * AI_PLAYERS_PER_REAL_PLAYER));
  const aiToRemove = Math.min(1, aiPlayers.length - targetAIPlayers); // Remove max 1 AI player per day

  if (aiToRemove > 0) {
    // Remove the weakest AI player (lowest wealth)
    const sorted = [...aiPlayers].sort((a, b) => {
      const wa = (a.game_state.cash || 0) + (a.game_state.bankBalance || 0);
      const wb = (b.game_state.cash || 0) + (b.game_state.bankBalance || 0);
      return wa - wb;
    });
    const victim = sorted[0];
    if (victim) {
      await removePlayer(victim.id);
      console.log(`  [AI Phase-Out] AI player "${victim.game_state.companyName}" went out of business (${aiPlayers.length - 1} AI players remain)`);
    }
  }
}

/**
 * Apply auto-pricing strategies before simDay runs.
 */
function applyAutoPrice(g) {
  if (!g.autoPrice) return;
  if (!g.staff.pricingAnalyst || g.staff.pricingAnalyst <= 0) return;
  for (const [k, ap] of Object.entries(g.autoPrice)) {
    if (!ap || ap.strategy === 'off') continue;
    const t = TIRES[k];
    if (!t) continue;
    const mkt = (g.marketPrices && g.marketPrices[k]) || t.def;
    let price;
    switch (ap.strategy) {
      case 'undercut': price = mkt - (ap.offset || 1); break;
      case 'above':    price = mkt + (ap.offset || 1); break;
      case 'match':    price = mkt; break;
      case 'max':      price = t.hi; break;
      default: continue;
    }
    g.prices[k] = Math.max(t.lo, Math.min(t.hi, Math.round(price)));
  }
}

/**
 * Auto-source used tires each tick.
 * Loops to keep buying until inventory is full or 50% of cash is spent.
 */
function applyAutoSource(g) {
  if (!g.autoSource) return;
  const src = SOURCES[g.autoSource];
  if (!src) return;
  if (src.rr && g.reputation < src.rr) return;

  // Flea market only operates Fri/Sat/Sun (dayOfWeek 5, 6, 0)
  if (g.autoSource === 'fleaMarket') {
    const cal = getCalendar(g.day);
    if (cal.dayOfWeek !== 0 && cal.dayOfWeek !== 5 && cal.dayOfWeek !== 6) return;
  }

  // Cap auto-source spending: min of 10% cash or $25k per day
  const maxSpend = Math.min(Math.floor(g.cash * 0.10), 25000);
  let spent = 0;
  let totalAdded = 0;

  while (spent + src.c <= maxSpend && g.cash >= src.c) {
    const freeSpace = getCap(g) - getInv(g);
    if (freeSpace <= 0) break;

    g.cash -= src.c;
    spent += src.c;
    const rawQty = Math.floor(Math.random() * (src.max - src.min + 1)) + src.min;
    const qty = Math.min(rawQty, freeSpace);
    if (qty <= 0) continue;

    const usedTypes = Object.keys(TIRES).filter(k => k.startsWith('used_'));
    for (let i = 0; i < qty; i++) {
      const t = usedTypes[Math.floor(Math.random() * usedTypes.length)];
      if (g.hasWarehouse || g.warehouseInventory) {
        g.warehouseInventory = g.warehouseInventory || {};
        g.warehouseInventory[t] = (g.warehouseInventory[t] || 0) + 1;
      } else if (g.locations && g.locations.length > 0) {
        const loc = g.locations[0];
        loc.inventory = loc.inventory || {};
        loc.inventory[t] = (loc.inventory[t] || 0) + 1;
      } else {
        g.warehouseInventory = g.warehouseInventory || {};
        g.warehouseInventory[t] = (g.warehouseInventory[t] || 0) + 1;
      }
    }
    totalAdded += qty;
    rebuildGlobalInv(g); // rebuild after each batch so getInv() sees updated totals
  }

  if (totalAdded > 0) {
    g.log = g.log || [];
    g.log.push({ msg: `Auto-sourced ${totalAdded} tires from ${src.n} (-$${spent})`, cat: 'source' });
  }
}

/**
 * Auto-order from suppliers when stock is low.
 * For each config in g.autoSuppliers, checks total stock across warehouse + locations,
 * and orders if below threshold. Uses up to 50% of cash across all auto-orders.
 */
function applyAutoSupplier(g) {
  if (!g.autoSuppliers || g.autoSuppliers.length === 0) return;

  // Cap auto-supplier spending: min of 15% cash or $50k per day
  const maxSpend = Math.min(Math.floor(g.cash * 0.15), 50000);
  let spent = 0;

  for (const config of g.autoSuppliers) {
    const { supplierIndex, tire, qty, threshold } = config;
    const sup = SUPPLIERS[supplierIndex];
    const t = TIRES[tire];
    if (!sup || !t) continue;
    if (!(g.unlockedSuppliers || []).includes(supplierIndex)) continue;

    // Count current stock of this tire across warehouse + all locations
    const totalStock = (g.warehouseInventory?.[tire] || 0) +
      (g.locations || []).reduce((a, l) => a + (l.inventory?.[tire] || 0), 0);

    if (totalStock >= threshold) continue;

    // Calculate cost
    const orderCost = qty * t.bMin * (1 - sup.disc);
    if (spent + orderCost > maxSpend || g.cash < orderCost) continue;

    // Check free space
    const freeSpace = getCap(g) - getInv(g);
    if (freeSpace < qty) continue;

    // Execute order
    g.cash -= orderCost;
    spent += orderCost;

    if (!g.warehouseInventory) g.warehouseInventory = {};
    const whInv = Object.values(g.warehouseInventory).reduce((a, b) => a + b, 0);
    const whCap = getStorageCap(g);
    const toWh = Math.min(qty, whCap - whInv);
    if (toWh > 0) g.warehouseInventory[tire] = (g.warehouseInventory[tire] || 0) + toWh;
    const overflow = qty - toWh;
    if (overflow > 0 && g.locations.length > 0) {
      const loc = g.locations.find(l => getLocInv(l) < getLocCap(l)) || g.locations[0];
      if (!loc.inventory) loc.inventory = {};
      loc.inventory[tire] = (loc.inventory[tire] || 0) + overflow;
    } else if (overflow > 0) {
      g.warehouseInventory[tire] = (g.warehouseInventory[tire] || 0) + overflow;
    }
    rebuildGlobalInv(g);

    // Track supplier relationship
    if (!g.supplierRelationships) g.supplierRelationships = {};
    const supKey = String(supplierIndex);
    if (!g.supplierRelationships[supKey]) g.supplierRelationships[supKey] = { totalPurchased: 0, level: 0 };
    g.supplierRelationships[supKey].totalPurchased += qty;
    const relTier = getSupplierRelTier(g.supplierRelationships[supKey].totalPurchased);
    g.supplierRelationships[supKey].level = relTier.level;
    if (relTier.discBonus > 0) {
      const refund = Math.floor(qty * t.bMin * relTier.discBonus);
      g.cash += refund;
    }

    g.log = g.log || [];
    g.log.push({ msg: `Auto-ordered ${qty} ${t.n} from ${sup.n} (-$${Math.round(orderCost)})`, cat: 'source' });
  }
}

/**
 * Aggregate player prices across all active players into per-tire averages.
 */
function aggregatePlayerPrices(players) {
  const sums = {};
  const counts = {};
  for (const k of Object.keys(TIRES)) {
    sums[k] = 0;
    counts[k] = 0;
  }
  for (const player of players) {
    const g = player.game_state;
    if (!g || !g.prices) continue;
    for (const [k, price] of Object.entries(g.prices)) {
      if (TIRES[k]) {
        sums[k] += price;
        counts[k]++;
      }
    }
  }
  const avg = {};
  for (const k of Object.keys(TIRES)) {
    avg[k] = counts[k] > 0 ? Math.round(sums[k] / counts[k]) : TIRES[k].def;
  }
  return avg;
}

/**
 * Aggregate AI shop prices into per-tire averages.
 */
function aggregateAIPrices(aiShops) {
  const sums = {};
  const counts = {};
  for (const k of Object.keys(TIRES)) {
    sums[k] = 0;
    counts[k] = 0;
  }
  for (const shop of aiShops) {
    if (!shop.prices) continue;
    for (const [k, price] of Object.entries(shop.prices)) {
      if (TIRES[k]) {
        sums[k] += price;
        counts[k]++;
      }
    }
  }
  const avg = {};
  for (const k of Object.keys(TIRES)) {
    avg[k] = counts[k] > 0 ? Math.round(sums[k] / counts[k]) : TIRES[k].def;
  }
  return avg;
}

/**
 * Resolve expired player marketplace auctions.
 */
async function resolveAuctions(currentDay) {
  try {
    const listings = await getPlayerListings({ status: 'active' });
    for (const listing of listings) {
      // Support both day-based and legacy week-based expiry
      const expiresDay = listing.expiresDay || (listing.expiresWeek || 0) * 7;
      if (expiresDay > currentDay) continue;

      if (listing.highBidder && listing.highBid > 0) {
        const buyer = await getPlayer(listing.highBidder);
        const seller = await getPlayer(listing.sellerId);
        if (buyer && seller) {
          const bg = buyer.game_state;
          const sg = seller.game_state;
          const grossTotal = listing.highBid * listing.qty;

          // Calculate tiered fees
          const sellerTier = sg.hasEcom ? 'ecommerce' : 'basic';
          const fees = P2P_FEES[sellerTier] || P2P_FEES.basic;
          const sellerFee = Math.floor(grossTotal * fees.sellerFee);
          const buyerFee = Math.floor(grossTotal * fees.buyerFee);

          // Buyer pays price + buyer fee
          bg.cash -= (grossTotal + buyerFee);
          if (!bg.warehouseInventory) bg.warehouseInventory = {};
          const whInv = Object.values(bg.warehouseInventory).reduce((a, b) => a + b, 0);
          const whCap = getStorageCap(bg);
          const toWh = Math.min(listing.qty, whCap - whInv);
          if (toWh > 0) bg.warehouseInventory[listing.tireType] = (bg.warehouseInventory[listing.tireType] || 0) + toWh;
          const overflow = listing.qty - toWh;
          if (overflow > 0 && bg.locations.length > 0) {
            const loc = bg.locations.find(l => getLocInv(l) < getLocCap(l)) || bg.locations[0];
            if (!loc.inventory) loc.inventory = {};
            loc.inventory[listing.tireType] = (loc.inventory[listing.tireType] || 0) + overflow;
          } else if (overflow > 0) {
            bg.warehouseInventory[listing.tireType] = (bg.warehouseInventory[listing.tireType] || 0) + overflow;
          }
          rebuildGlobalInv(bg);

          // Seller gets price - seller fee
          sg.cash += (grossTotal - sellerFee);
          sg.log = sg.log || [];
          sg.log.push(`Sold ${listing.qty} ${TIRES[listing.tireType]?.n || listing.tireType} on marketplace for $${grossTotal} (-$${sellerFee} fee)`);
          bg.log = bg.log || [];
          bg.log.push(`Won auction: ${listing.qty} ${TIRES[listing.tireType]?.n || listing.tireType} for $${grossTotal} (+$${buyerFee} buyer fee)`);

          await savePlayerState(listing.highBidder, bg);
          await savePlayerState(listing.sellerId, sg);
        }
        listing.status = 'sold';
      } else {
        const seller = await getPlayer(listing.sellerId);
        if (seller) {
          const sg = seller.game_state;
          if (!sg.warehouseInventory) sg.warehouseInventory = {};
          sg.warehouseInventory[listing.tireType] = (sg.warehouseInventory[listing.tireType] || 0) + listing.qty;
          rebuildGlobalInv(sg);
          sg.log = sg.log || [];
          sg.log.push(`Marketplace listing expired: ${listing.qty} ${TIRES[listing.tireType]?.n || listing.tireType} returned`);
          await savePlayerState(listing.sellerId, sg);
        }
        listing.status = 'expired';
      }
      await updatePlayerListing(listing.id, listing);
    }
  } catch (err) {
    console.error('Auction resolution error:', err);
  }
}

/**
 * Run one tick: advance all active players by one day.
 * @param {Set} clients - WebSocket client set for broadcasting
 */
export async function runTick(clients) {
  try {
    const game = await getGame();
    if (!game) return;

    let players = await getAllActivePlayers();
    // Support both day-based and legacy week-based game state
    const day = (game.day || game.week || 0) + 1;

    // Seed AI shops on first tick if none exist
    if (!game.ai_shops || game.ai_shops.length === 0) {
      console.log('[AI Init] No AI shops found — seeding');
      game.ai_shops = initAIShops();
      await saveGame('default', day - 1, game.economy || {}, game.ai_shops, game.liquidation || []);
      console.log(`[AI Init] Seeded ${game.ai_shops.length} AI shops`);
    }

    // Legacy AI auto-seeding disabled — use admin panel to create stealth bots instead

    const playerPriceAvg = aggregatePlayerPrices(players);
    const aiPriceAvg = aggregateAIPrices(game.ai_shops || []);

    // Calculate total TireCoins in circulation across all players
    const totalTC = players.reduce((sum, p) => sum + (p.game_state.tireCoins || 0), 0);
    // Calculate total bank deposits across all players (drives interest rate dynamics)
    const totalBankDeposits = players.reduce((sum, p) => sum + (p.game_state.bankBalance || 0), 0);

    // Build factory supplier list from all players with isDistributor
    const factorySuppliers = players
      .filter(p => p.game_state.hasFactory && p.game_state.factory?.isDistributor)
      .map(p => ({
        playerId: p.id,
        brandName: p.game_state.factory.brandName,
        brandRep: p.game_state.factory.brandReputation || 0,
        wholesalePrices: p.game_state.factory.wholesalePrices || {},
        qualityRating: p.game_state.factory.qualityRating || 0.80,
        cityId: (p.game_state.locations || [])[0]?.cityId,
      }));

    // Build wholesale supplier list from all players with hasWholesale + prices set
    const wholesaleSuppliers = players
      .filter(p => {
        const gs = p.game_state;
        return gs.hasWholesale && Object.keys(gs.wholesalePrices || {}).length > 0;
      })
      .map(p => ({
        playerId: p.id,
        companyName: p.game_state.companyName || p.game_state.name || 'Unknown',
        reputation: p.game_state.reputation || 0,
        wholesalePrices: p.game_state.wholesalePrices || {},
        cityId: (p.game_state.locations || [])[0]?.cityId || null,
      }));

    // ── GLOBAL EVENT TRIGGERING ──
    if (!game.economy) game.economy = {};
    if (!game.economy.activeGlobalEvents) game.economy.activeGlobalEvents = [];

    // Expire ended events
    game.economy.activeGlobalEvents = game.economy.activeGlobalEvents.filter(e => day <= e.endDay);

    // Roll for new events (max 2 concurrent)
    if (game.economy.activeGlobalEvents.length < GLOBAL_EVENT_MAX_CONCURRENT) {
      const activeIds = new Set(game.economy.activeGlobalEvents.map(e => e.id));
      for (const evt of GLOBAL_EVENTS) {
        if (activeIds.has(evt.id)) continue;
        if (game.economy.activeGlobalEvents.length >= GLOBAL_EVENT_MAX_CONCURRENT) break;
        if (Math.random() < GLOBAL_EVENT_CHANCE) {
          const duration = evt.durationMin + Math.floor(Math.random() * (evt.durationMax - evt.durationMin + 1));
          game.economy.activeGlobalEvents.push({
            id: evt.id,
            startDay: day,
            endDay: day + duration,
          });
          activeIds.add(evt.id);
        }
      }
    }

    // ── TC VALUE FLUCTUATION — multi-factor economic model ──
    if (!game.economy.tcValue) game.economy.tcValue = 50000;
    if (!game.economy.tcMetrics) game.economy.tcMetrics = {};
    if (!game.economy.tcHistory) game.economy.tcHistory = [];

    // Collect economic data from all players
    const realPlayers = players.filter(p => !isBotPlayer(p.game_state));
    const totalCash = players.reduce((sum, p) =>
      sum + (p.game_state.cash || 0) + (p.game_state.bankBalance || 0), 0
    );
    let totalRubberOutput = 0;
    let totalTireProduction = 0;
    let recentFarmLabPurchases = 0;
    let topPlayerId = null;
    let topPlayerWealth = 0;

    for (const p of players) {
      const gs = p.game_state;
      // Rubber production capacity (daily)
      if (gs.factory?.rubberFarm) {
        const fl = gs.factory.rubberFarm.level || 1;
        totalRubberOutput += [0, 5, 15, 30][fl] || 5;
      }
      if (gs.factory?.syntheticLab) {
        const sl = gs.factory.syntheticLab.level || 1;
        totalRubberOutput += [0, 8, 20, 40][sl] || 8;
      }
      // Tire manufacturing (queue items)
      totalTireProduction += (gs.factory?.productionQueue || []).reduce((a, q) => a + (q.qty || 0), 0);
      // Recent high-value TC purchases (farm/lab bought in last 7 days)
      if (gs.factory?.rubberFarm?.purchasedDay && day - gs.factory.rubberFarm.purchasedDay <= 7) recentFarmLabPurchases++;
      if (gs.factory?.syntheticLab?.purchasedDay && day - gs.factory.syntheticLab.purchasedDay <= 7) recentFarmLabPurchases++;
      // Track #1 player by wealth
      const w = getWealth(gs);
      if (w > topPlayerWealth) { topPlayerWealth = w; topPlayerId = p.id; }
    }

    if (day % 7 === 0) {
      const prevTcValue = game.economy.tcValue;

      // ── Factor 1: Per-Capita TC Scarcity (log-scale) ──
      // Baseline: 10 TC per player = neutral (factor 1.0)
      // Uses power-law (exponent 0.35) for gentle scaling across all player counts:
      //   tcPerCapita=1  → factor ≈ 2.2  (scarce)
      //   tcPerCapita=10 → factor = 1.0  (baseline)
      //   tcPerCapita=42 → factor ≈ 0.6  (moderate abundance)
      //   tcPerCapita=100 → factor ≈ 0.45 (abundant)
      //   tcPerCapita=1000 → factor ≈ 0.3  (floor)
      const playerCount = Math.max(1, realPlayers.length);
      const tcPerCapita = totalTC / playerCount;
      const scarcityBaseline = 10; // 10 TC per player = neutral
      const tcSupplyFactor = totalTC > 0
        ? Math.max(0.3, Math.min(3.0, Math.pow(scarcityBaseline / Math.max(0.1, tcPerCapita), 0.35)))
        : 1.0;

      // ── Factor 2: Velocity of Money (Cash Inflation) ──
      // Per-capita cash compared to baseline. More cash per player = inflation = TC worth less in cash terms
      const expectedCashPerPlayer = 50000;
      const cashPerCapita = totalCash / Math.max(1, playerCount);
      const cashRatio = cashPerCapita / expectedCashPerPlayer;
      // cashRatio > 1 = lots of cash = inflation = TC value rises (buys more inflated cash)
      // cashRatio < 1 = cash scarce = deflation = TC value drops
      const velocityFactor = Math.max(0.5, Math.min(2.0, Math.sqrt(Math.max(0.1, cashRatio))));

      // ── Factor 3: Resource Scarcity (Rubber) ──
      // High rubber output + low manufacturing = oversupply = TC cheaper
      // Low rubber output + high manufacturing = shortage = TC more valuable
      const rubberDemandRatio = totalRubberOutput > 0
        ? Math.max(0.1, totalTireProduction / (totalRubberOutput * 7)) // weekly production vs daily output*7
        : 1.0;
      const rubberFactor = Math.max(0.8, Math.min(1.3, 0.85 + rubberDemandRatio * 0.15));

      // ── Factor 4: Player Sentiment (Demand) ──
      // Each recent farm/lab purchase signals TC demand → pushes value up
      const sentimentBoost = 1 + recentFarmLabPurchases * 0.02; // +2% per purchase, up to ~10%
      const sentimentFactor = Math.min(1.15, sentimentBoost);

      // ── Factor 5: Market Maker ──
      // #1 player's TC holdings influence the rate more heavily
      let marketMakerFactor = 1.0;
      if (topPlayerId) {
        const topPlayer = players.find(p => p.id === topPlayerId);
        if (topPlayer) {
          const topTC = topPlayer.game_state.tireCoins || 0;
          // If #1 player is hoarding TC, value rises; if spending, it dips
          const topTcShare = totalTC > 0 ? topTC / totalTC : 0;
          // Share > 0.3 = heavy hoarder = +5% value; < 0.1 = selling = -3% value
          marketMakerFactor = 1 + (topTcShare - 0.2) * 0.15;
          marketMakerFactor = Math.max(0.92, Math.min(1.10, marketMakerFactor));
        }
      }

      // ── Factor 6: Global Event Chaos ──
      let chaosFactor = 1.0;
      for (const ge of (game.economy.activeGlobalEvents || [])) {
        if (ge.id === 'rubber_shortage') chaosFactor *= 1.08;    // scarcity → TC up
        if (ge.id === 'economic_boom') chaosFactor *= 0.95;      // cash flows → TC down
        if (ge.id === 'steel_surplus') chaosFactor *= 0.97;      // cheap materials → TC down
        if (ge.id === 'safety_recall') chaosFactor *= 1.05;      // uncertainty → TC up
      }
      chaosFactor = Math.max(0.85, Math.min(1.20, chaosFactor));

      // ── Random noise ±5% ──
      const tcNoise = 1 + (Math.random() - 0.5) * 0.10;

      // ── Combine factors into a TARGET value, then mean-revert ──
      // Instead of multiplying current value (which compounds and crashes),
      // calculate where the value *should* be, then move 10% toward it each week.
      const baseTargetValue = 50000;
      const targetFactor = tcSupplyFactor * velocityFactor * rubberFactor * sentimentFactor * marketMakerFactor * chaosFactor;
      const targetValue = Math.max(5000, Math.min(500000, baseTargetValue * targetFactor));

      // Mean reversion: move 10% toward target each week + random noise
      const reversionRate = 0.10;
      const newValue = game.economy.tcValue + (targetValue - game.economy.tcValue) * reversionRate;
      game.economy.tcValue = Math.round(
        Math.max(5000, Math.min(500000, newValue * tcNoise))
      );

      // Store metrics for dashboard
      game.economy.tcMetrics = {
        day,
        tcSupplyFactor: +tcSupplyFactor.toFixed(3),
        velocityFactor: +velocityFactor.toFixed(3),
        rubberFactor: +rubberFactor.toFixed(3),
        sentimentFactor: +sentimentFactor.toFixed(3),
        marketMakerFactor: +marketMakerFactor.toFixed(3),
        chaosFactor: +chaosFactor.toFixed(3),
        totalCash: Math.round(totalCash),
        totalRubberOutput,
        totalTireProduction,
        recentFarmLabPurchases,
        topPlayerId,
        prevTcValue,
        tcPerCapita: +tcPerCapita.toFixed(2),
        targetValue: Math.round(targetValue),
      };

      // History for charting (keep last 52 weeks)
      game.economy.tcHistory.push({ day, value: game.economy.tcValue });
      if (game.economy.tcHistory.length > 52) game.economy.tcHistory.shift();
    }

    // ── Dynamic Supplier Pricing with Commodity Cycles ──
    if (!game.economy.supplierPricing) game.economy.supplierPricing = {};
    if (!game.economy.commodities) game.economy.commodities = { rubber: 1.0, steel: 1.0, chemicals: 1.0 };

    // Commodity prices cycle independently (sine waves with different periods + noise)
    const commodities = game.economy.commodities;
    const cycleAmplitude = 0.12; // ±12% swing from commodity cycles
    commodities.rubber    = 1.0 + cycleAmplitude * Math.sin(day / 45 * Math.PI) + (Math.random() - 0.5) * 0.03;
    commodities.steel     = 1.0 + cycleAmplitude * Math.sin(day / 60 * Math.PI + 2.1) + (Math.random() - 0.5) * 0.03;
    commodities.chemicals = 1.0 + cycleAmplitude * Math.sin(day / 75 * Math.PI + 4.2) + (Math.random() - 0.5) * 0.03;

    // Clamp commodities to [0.80, 1.25]
    for (const k of Object.keys(commodities)) {
      commodities[k] = Math.round(Math.max(0.80, Math.min(1.25, commodities[k])) * 1000) / 1000;
    }

    // Commodity sensitivity by tire category (how much each commodity affects price)
    const commodityWeights = {
      // used tires: barely affected (secondhand market)
      used_junk: { rubber: 0.05, steel: 0.02, chemicals: 0.01 },
      used_poor: { rubber: 0.08, steel: 0.03, chemicals: 0.02 },
      used_good: { rubber: 0.10, steel: 0.04, chemicals: 0.03 },
      used_premium: { rubber: 0.12, steel: 0.05, chemicals: 0.03 },
      // standard tires: moderate sensitivity
      allSeason: { rubber: 0.30, steel: 0.15, chemicals: 0.10 },
      performance: { rubber: 0.25, steel: 0.20, chemicals: 0.15 },
      winter: { rubber: 0.30, steel: 0.15, chemicals: 0.20 },
      lightTruck: { rubber: 0.35, steel: 0.20, chemicals: 0.10 },
      commercial: { rubber: 0.35, steel: 0.25, chemicals: 0.10 },
      // specialty: higher sensitivity
      atv: { rubber: 0.25, steel: 0.10, chemicals: 0.10 },
      implement: { rubber: 0.30, steel: 0.20, chemicals: 0.05 },
      tractor: { rubber: 0.40, steel: 0.25, chemicals: 0.10 },
      evTire: { rubber: 0.20, steel: 0.15, chemicals: 0.25 },
      runFlat: { rubber: 0.25, steel: 0.25, chemicals: 0.15 },
      luxuryTouring: { rubber: 0.20, steel: 0.15, chemicals: 0.20 },
      premiumAllWeather: { rubber: 0.25, steel: 0.15, chemicals: 0.20 },
    };

    const totalPurchaseVol = players.reduce((sum, p) => sum + (p.game_state.monthlyPurchaseVol || 0), 0);
    const demandFactor = Math.min(1.0, totalPurchaseVol / 5000);

    for (const tireKey of Object.keys(TIRES)) {
      const prev = game.economy.supplierPricing[tireKey] || 1.0;
      const noise = (Math.random() - 0.5) * 0.03;
      const demandPull = demandFactor * 0.08;

      // Commodity impact: weighted sum of commodity deviations from 1.0
      const w = commodityWeights[tireKey] || { rubber: 0.20, steel: 0.15, chemicals: 0.10 };
      const commodityMod = w.rubber * (commodities.rubber - 1) + w.steel * (commodities.steel - 1) + w.chemicals * (commodities.chemicals - 1);

      // Global events
      let eventMod = 0;
      for (const ge of (game.economy.activeGlobalEvents || [])) {
        const def = GLOBAL_EVENTS.find(d => d.id === ge.id);
        if (def?.effects?.productionCostMult) eventMod += (def.effects.productionCostMult - 1) * 0.5;
      }

      const target = 1.0 + demandPull + noise + commodityMod + eventMod;
      const next = prev + (target - prev) * 0.15;
      // Wider range: ±25% for more market impact
      game.economy.supplierPricing[tireKey] = Math.round(Math.max(0.75, Math.min(1.25, next)) * 1000) / 1000;
    }

    // ── Dynamic Interest Rates (Bank Bot) — global weekly adjustment ──
    // Centralized: all players see the same base rate, driven by macro factors.
    // Per-player tiered deposit bonus is still applied in simDay.
    if (!game.economy.bankRate) game.economy.bankRate = 0.042;
    if (!game.economy.loanRateMult) game.economy.loanRateMult = 1.0;
    if (!game.economy.rateHistory) game.economy.rateHistory = [];

    if (day % 7 === 0) {
      const cal = getCalendar(day);
      const rateSeasonMult = { Spring: 0.92, Summer: 0.88, Fall: 1.08, Winter: 1.12 }[cal.season] || 1;
      const rateNoise = 1 + (Math.random() - 0.5) * 0.10;
      const baseSavingsRate = 0.042 * rateSeasonMult * rateNoise;

      // TC scarcity bonus: less TC in circulation → higher rates (max +2%)
      const tcScarcityBonus = totalTC > 0
        ? Math.min(0.02, Math.max(0, (1 - totalTC / 50000) * 0.02))
        : 0;

      // Deposit abundance: more total deposits → higher savings rate, lower loan rate
      // At $0: factor=0, $5M: ~0.5, $20M+: ~1.0
      const depositFactor = Math.min(1.0, totalBankDeposits / 20000000);
      const depositAbundanceBonus = depositFactor * 0.02;

      // Global event impact on rates
      let eventRateShift = 0;
      for (const ge of (game.economy.activeGlobalEvents || [])) {
        if (ge.id === 'economic_boom') eventRateShift -= 0.005;    // boom → lower rates (stimulate)
        if (ge.id === 'rubber_shortage') eventRateShift += 0.005;  // crisis → higher rates
        if (ge.id === 'safety_recall') eventRateShift += 0.003;    // uncertainty → higher rates
      }

      const newBankRate = baseSavingsRate + tcScarcityBonus + depositAbundanceBonus + eventRateShift;
      game.economy.bankRate = Math.round(Math.max(0.015, Math.min(0.085, newBankRate)) * 10000) / 10000;

      // Loan rate multiplier: high deposits → bank has capital → cheaper loans
      // Range: 1.0 (no deposits) to 0.7 (massive deposits, 30% discount)
      game.economy.loanRateMult = Math.round((1.0 - depositFactor * 0.30) * 1000) / 1000;

      game.economy.tcScarcityBonus = Math.round(tcScarcityBonus * 10000) / 10000;

      // Rate history for charts (keep last 52 weeks)
      game.economy.rateHistory.push({
        day,
        bankRate: game.economy.bankRate,
        loanRateMult: game.economy.loanRateMult,
        depositFactor: +depositFactor.toFixed(3),
        totalDeposits: Math.round(totalBankDeposits),
      });
      if (game.economy.rateHistory.length > 52) game.economy.rateHistory.shift();
    }

    const shared = {
      cities: CITIES,
      aiShops: game.ai_shops || [],
      liquidation: game.liquidation || [],
      playerPriceAvg,
      aiPriceAvg,
      totalTC,
      totalBankDeposits,
      factorySuppliers,
      wholesaleSuppliers,
      globalEvents: game.economy.activeGlobalEvents || [],
      tcValue: game.economy.tcValue || 50000,
      tcMetrics: game.economy.tcMetrics || {},
      supplierPricing: game.economy.supplierPricing || {},
      commodities: game.economy.commodities || { rubber: 1.0, steel: 1.0, chemicals: 1.0 },
      bankRate: game.economy.bankRate,
      loanRateMult: game.economy.loanRateMult,
    };

    const cal = getCalendar(day);

    for (const player of players) {
      const state = player.game_state;
      if (isBotPlayer(state)) {
        // Lightweight bot simulation (legacy isAI + stealth _botConfig)
        try {
          const newState = simAIPlayerDay(state);
          await savePlayerState(player.id, newState);
          await upsertLeaderboard(
            player.id,
            newState.companyName || newState.name || 'Unknown',
            getWealth(newState),
            newState.reputation,
            (newState.locations || []).length,
            newState.day,
            newState.isPremium,
            newState.stockExchange?.ticker || null
          );
        } catch (botErr) {
          console.error(`[Tick] Error processing bot ${player.id}:`, botErr.message);
        }
        continue;
      }
      try {
        applyAutoPrice(state);
        applyAutoSource(state);
        if (state.hasAutoRestock || state.isPremium) applyAutoSupplier(state);
        const newState = simDay(state, shared);
        await savePlayerState(player.id, newState);

        await upsertLeaderboard(
          player.id,
          newState.companyName || newState.name || 'Unknown',
          getWealth(newState),
          newState.reputation,
          newState.locations.length,
          newState.day,
          newState.isPremium,
          newState.stockExchange?.ticker || null
        );
        // Push notifications (non-blocking)
        checkAndSendPush(player.id, newState, day).catch(() => {});
      } catch (playerErr) {
        console.error(`[Tick] Error processing player ${player.id}:`, playerErr.message);
      }
    }

    // Resolve expired marketplace auctions
    await resolveAuctions(day);

    // AI price wars — update weekly (every 7 days)
    if (day % 7 === 0) {
      try {
        const aiShops = game.ai_shops || [];
        updateAIPrices(aiShops, playerPriceAvg);
      } catch (err) {
        console.error('AI price war error:', err);
      }
    }

    // AI phase-out — gradually remove AI as real players join
    try {
      await phaseOutAI(game, players);
    } catch (err) {
      console.error('AI phase-out error:', err);
    }

    // Monthly tournaments — every 30 days, rank players and award TireCoins
    if (day % 30 === 0 && players.length > 0) {
      try {
        const ranked = players
          .map(p => {
            const gs = p.game_state;
            const snapTotalRev = gs.weeklySnapshot?.totalRev ?? gs.totalRev ?? 0;
            const weeklyRevenue = Math.max(0, (gs.totalRev || 0) - snapTotalRev);
            return {
              player_id: p.id,
              name: gs.companyName || gs.name || 'Unknown',
              weeklyRevenue,
              totalRev: gs.totalRev || 0,
              wealth: getWealth(gs),
              locations: (gs.locations || []).length,
              reputation: gs.reputation || 0,
            };
          })
          .sort((a, b) => b.weeklyRevenue - a.weeklyRevenue);

        const prizes = [10, 5, 3, 1];  // Top 4 places get TC (~228 TC/year entering economy)
        for (let i = 0; i < Math.min(ranked.length, prizes.length); i++) {
          const winner = players.find(p => p.id === ranked[i].id);
          if (winner) {
            const ws = winner.game_state;
            let wCap = MONET.tcStorage.baseCap;
            if (ws.isPremium) wCap += MONET.tcStorage.premiumBonus;
            const wLvl = ws.tcStorageLevel || 0;
            for (let j = 0; j < wLvl && j < MONET.tcStorage.upgrades.length; j++) wCap += MONET.tcStorage.upgrades[j].addCap;
            ws.tireCoins = Math.min((ws.tireCoins || 0) + prizes[i], wCap);
            ws.log = ws.log || [];
            ws.log.push({ msg: `🏆 Monthly tournament: #${i + 1} place (+${prizes[i]} TC)`, cat: 'event' });
            await savePlayerState(winner.id, winner.game_state);
          }
        }

        await saveTournament(`month-${Math.floor(day / 30)}`, {
          day,
          rankings: ranked.slice(0, 10),
          prizes,
        });
      } catch (err) {
        console.error('Tournament error:', err);
      }
    }

    // ── Stock Exchange Tick ──
    try {
      // Ensure exchange state is initialized
      if (!game.economy) game.economy = {};
      if (!game.economy.exchange) {
        const { initExchange } = await import('../engine/exchange.js');
        game.economy.exchange = initExchange();
      }
      const exchangeResult = runExchangeTick(
        game.economy.exchange,
        players,
        day
      );
      // Save updated player states from exchange operations (dividends, taxes, fees)
      for (const p of exchangeResult.modifiedPlayers) {
        await savePlayerState(p.id, p.game_state);
      }
      // Store exchange state in economy
      game.economy = game.economy || {};
      game.economy.exchange = exchangeResult.exchangeState;
    } catch (err) {
      console.error('Exchange tick error:', err);
    }

    // Weekly cleanup: remove old chat messages (every 7 game days)
    if (day % 7 === 0) {
      try {
        const { cleanOldChatMessages } = await import('../db/queries.js');
        const cleaned = await cleanOldChatMessages(7);
        if (cleaned > 0) console.log(`[tick] Cleaned ${cleaned} old chat messages`);
      } catch {}
    }

    // Monthly cleanup: remove old analytics events (every 30 game days)
    if (day % 30 === 0) {
      try {
        const { cleanOldAnalytics } = await import('../analytics/tracker.js');
        const cleaned = await cleanOldAnalytics(90);
        if (cleaned > 0) console.log(`[tick] Cleaned ${cleaned} old analytics events`);
      } catch {}
    }

    // Update game day
    await saveGame(
      'default',
      day,
      game.economy || {},
      game.ai_shops || [],
      game.liquidation || []
    );

    // Broadcast tick to all clients
    const exchangeState = game.economy?.exchange;
    // Build global events info for broadcast
    const globalEventsInfo = (game.economy.activeGlobalEvents || []).map(e => {
      const def = GLOBAL_EVENTS.find(d => d.id === e.id);
      return def ? { id: e.id, name: def.name, icon: def.icon, daysLeft: e.endDay - day, description: def.description } : null;
    }).filter(Boolean);

    broadcast(clients, {
      type: 'tick',
      day,
      date: `${cal.dayName} ${cal.monthName} ${cal.dayOfMonth}, Year ${cal.year}`,
      season: cal.season,
      playerCount: players.length,
      timestamp: Date.now(),
      exchange: exchangeState ? {
        indices: exchangeState.indices,
        sentiment: exchangeState.sentiment?.value,
        dayVolume: exchangeState.dayVolume,
        crashActive: exchangeState.sentiment?.crashActive,
      } : null,
      globalEvents: globalEventsInfo,
      tcValue: game.economy.tcValue || 50000,
      tcMetrics: game.economy.tcMetrics || {},
      tcHistory: game.economy.tcHistory || [],
    });

    if (day % 30 === 0) {
      console.log(`Day ${day} (${cal.monthName} Year ${cal.year}): ${players.length} players`);
    }
  } catch (err) {
    console.error('Tick error:', err);
  }
}

let currentTickMs = TICK_MS;

/**
 * Start the tick loop.
 * @param {Set} clients - WebSocket client set
 */
export function startTickLoop(clients) {
  if (tickInterval) return;
  console.log(`Starting tick loop (${currentTickMs}ms interval = 1 game day)`);
  tickInterval = setInterval(() => runTick(clients), currentTickMs);
}

/**
 * Stop the tick loop.
 */
export function stopTickLoop() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
    console.log('Tick loop stopped');
  }
}

/** Change tick speed at runtime. */
export function setTickSpeed(ms, clients) {
  currentTickMs = ms;
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = setInterval(() => runTick(clients), currentTickMs);
    console.log(`Tick speed changed to ${currentTickMs}ms`);
  }
}

export function getTickSpeed() { return currentTickMs; }
export function isTickRunning() { return tickInterval !== null; }
