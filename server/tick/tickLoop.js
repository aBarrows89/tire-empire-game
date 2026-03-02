import { TICK_MS } from '../config.js';
import { getAllActivePlayers, savePlayerState, getGame, saveGame, upsertLeaderboard, getPlayerListings, updatePlayerListing, getPlayer, removePlayer } from '../db/queries.js';
import { simDay } from '../engine/simDay.js';
import { simAIPlayerDay, createAIPlayers } from '../engine/aiPlayers.js';
import { getWealth } from '../../shared/helpers/wealth.js';
import { getStorageCap, getLocInv, getLocCap, rebuildGlobalInv, getCap, getInv } from '../../shared/helpers/inventory.js';
import { getCalendar } from '../../shared/helpers/calendar.js';
import { CITIES } from '../../shared/constants/cities.js';
import { TIRES } from '../../shared/constants/tires.js';
import { SOURCES } from '../../shared/constants/sources.js';
import { SUPPLIERS } from '../../shared/constants/suppliers.js';
import { getSupplierRelTier } from '../../shared/constants/supplierRelations.js';
import { P2P_FEES } from '../../shared/constants/marketplace.js';
import { broadcast } from './broadcast.js';
import { updateAIPrices } from '../engine/aiPriceWar.js';
import { saveTournament } from '../db/queries.js';

let tickInterval = null;

// ── AI Phase-Out ──
// As real players join, AI shops and AI players gradually go out of business.
// This ensures the economy transitions from AI-populated to fully player-driven.

const AI_SHOPS_PER_REAL_PLAYER = 3;   // Each real player displaces ~3 AI shops
const AI_PLAYERS_PER_REAL_PLAYER = 2; // Each real player displaces ~2 AI players
const MAX_AI_REMOVALS_PER_DAY = 5;    // Don't remove too many at once (gradual)
const MIN_AI_SHOPS = 20;              // Keep a few AI shops so new players have some competition
const MIN_AI_PLAYERS = 2;             // Keep a couple AI players for leaderboard variety

/**
 * Gradually phase out AI shops and AI players as real players join.
 * Prioritizes removing AI shops in cities where real players have shops.
 */
async function phaseOutAI(game, players) {
  const realPlayers = players.filter(p => !p.game_state.isAI && p.game_state.companyName);
  const aiPlayers = players.filter(p => p.game_state.isAI);
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

  const maxSpend = Math.floor(g.cash * 0.5);
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

  const maxSpend = Math.floor(g.cash * 0.5);
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

    // Seed AI players on first tick if none exist
    const hasAI = players.some(p => p.game_state.isAI);
    if (!hasAI) {
      console.log('[AI Init] No AI players found — seeding 12 AI players');
      const aiPlayers = createAIPlayers(day, 12);
      for (const ai of aiPlayers) {
        await savePlayerState(ai.id, ai.game_state);
      }
      players = await getAllActivePlayers();
    }

    const playerPriceAvg = aggregatePlayerPrices(players);
    const aiPriceAvg = aggregateAIPrices(game.ai_shops || []);

    // Calculate total TireCoins in circulation across all players
    const totalTC = players.reduce((sum, p) => sum + (p.game_state.tireCoins || 0), 0);

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

    const shared = {
      cities: CITIES,
      aiShops: game.ai_shops || [],
      liquidation: game.liquidation || [],
      playerPriceAvg,
      aiPriceAvg,
      totalTC,
      factorySuppliers,
    };

    const cal = getCalendar(day);

    for (const player of players) {
      const state = player.game_state;
      if (state.isAI) {
        // Lightweight AI player simulation
        const newState = simAIPlayerDay(state);
        await savePlayerState(player.id, newState);
        await upsertLeaderboard(
          player.id,
          newState.companyName || newState.name || 'Unknown',
          getWealth(newState),
          newState.reputation,
          newState.locations.length,
          newState.day,
          newState.isPremium
        );
        continue;
      }
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
        newState.isPremium
      );
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

    // Weekly tournaments — every 7 days, rank players and award TireCoins
    if (day % 7 === 0 && players.length > 0) {
      try {
        const ranked = players
          .map(p => ({
            id: p.id,
            name: p.game_state.companyName || p.game_state.name || 'Unknown',
            revGrowth: (p.game_state.dayRev || 0) - (p.game_state.prevDayRev || 0),
            totalRev: p.game_state.totalRev || 0,
          }))
          .sort((a, b) => b.revGrowth - a.revGrowth);

        const prizes = [20, 10, 5];
        for (let i = 0; i < Math.min(ranked.length, prizes.length); i++) {
          const winner = players.find(p => p.id === ranked[i].id);
          if (winner) {
            winner.game_state.tireCoins = (winner.game_state.tireCoins || 0) + prizes[i];
            winner.game_state.log = winner.game_state.log || [];
            winner.game_state.log.push({ msg: `🏆 Weekly tournament: #${i + 1} place (+${prizes[i]} TC)`, cat: 'event' });
            await savePlayerState(winner.id, winner.game_state);
          }
        }

        await saveTournament(`week-${Math.floor(day / 7)}`, {
          day,
          rankings: ranked.slice(0, 10),
          prizes,
        });
      } catch (err) {
        console.error('Tournament error:', err);
      }
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
    broadcast(clients, {
      type: 'tick',
      day,
      date: `${cal.dayName} ${cal.monthName} ${cal.dayOfMonth}, Year ${cal.year}`,
      season: cal.season,
      playerCount: players.length,
      timestamp: Date.now(),
    });

    if (day % 30 === 0) {
      console.log(`Day ${day} (${cal.monthName} Year ${cal.year}): ${players.length} players`);
    }
  } catch (err) {
    console.error('Tick error:', err);
  }
}

/**
 * Start the tick loop.
 * @param {Set} clients - WebSocket client set
 */
export function startTickLoop(clients) {
  if (tickInterval) return;
  console.log(`Starting tick loop (${TICK_MS}ms interval = 1 game day)`);
  tickInterval = setInterval(() => runTick(clients), TICK_MS);
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
