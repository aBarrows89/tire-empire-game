import { TICK_MS } from '../config.js';
import { getAllActivePlayers, savePlayerState, getGame, saveGame, upsertLeaderboard, getPlayerListings, updatePlayerListing, getPlayer, removePlayer, addChatMessage, updatePlayerContract } from '../db/queries.js';
import { uid } from '../../shared/helpers/random.js';
import { simDay } from '../engine/simDay.js';
import { simAIPlayerDay, isBotPlayer } from '../engine/aiPlayers.js';
import { runBotTick, resetBotChatBudget, getPendingBotChats, getBotPhaseOutTargets } from '../engine/botDecision.js';
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
import { tickEmitter } from './tickEmitter.js';
import { checkAndSendPush } from '../notifications/sender.js';
import { updateAIPrices } from '../engine/aiPriceWar.js';
import { saveTournament } from '../db/queries.js';
import { runExchangeTick } from '../engine/exchangeTick.js';
import { CONTRACT_COMMISSION, P2P_DELIVERY_FEE } from '../../shared/constants/contracts.js';
import { getBrandTireKey } from '../../shared/helpers/factoryBrand.js';

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

// ═══════════════════════════════════════
// P2P CONTRACT FULFILLMENT & PAYMENTS
// ═══════════════════════════════════════

/**
 * Process pending contract shipments — transfer tires from seller staging to buyer warehouse.
 */
async function fulfillContractShipments(players, day) {
  for (const seller of players) {
    const sg = seller.game_state;
    if (!sg.factory?.contractStaging) continue;

    for (const contract of (sg.p2pContracts || [])) {
      if (contract.status !== 'active') continue;
      if (!contract._pendingShipment) continue;
      if (!contract.terms) { delete contract._pendingShipment; continue; }

      const shipQty = contract._shipmentQty || 0;
      if (shipQty <= 0) { delete contract._pendingShipment; continue; }

      // Find buyer
      const buyer = players.find(p => p.id === contract.buyerId);
      if (!buyer) { delete contract._pendingShipment; continue; }

      const bg = buyer.game_state;
      const tireKey = getBrandTireKey(contract.terms.tireType);

      // Transfer tires to buyer's warehouse
      if (!bg.warehouseInventory) bg.warehouseInventory = {};
      bg.warehouseInventory[tireKey] = (bg.warehouseInventory[tireKey] || 0) + shipQty;

      // Calculate payment
      const grossPayment = shipQty * contract.terms.pricePerUnit;
      const deliveryFee = shipQty * (contract.terms.deliveryFee || P2P_DELIVERY_FEE);
      const commission = Math.floor(grossPayment * (contract.terms.commission || CONTRACT_COMMISSION));
      const sellerReceives = grossPayment - commission;
      const buyerPays = grossPayment + deliveryFee;

      // Process payment based on terms
      if (contract.terms.paymentTerms === 'on_delivery') {
        bg.cash -= buyerPays;
        sg.cash += sellerReceives;
        bg.log = bg.log || [];
        bg.log.push({ msg: `Contract delivery: ${shipQty} tires received (-$${buyerPays})`, cat: 'contract' });
        sg.log = sg.log || [];
        sg.log.push({ msg: `Contract shipped: ${shipQty} tires (+$${sellerReceives})`, cat: 'contract' });
      } else if (contract.terms.paymentTerms === 'prepaid') {
        // Already paid — just log delivery
        sg.cash += sellerReceives;
        bg.log = bg.log || [];
        bg.log.push({ msg: `Contract delivery: ${shipQty} tires received (prepaid)`, cat: 'contract' });
        sg.log = sg.log || [];
        sg.log.push({ msg: `Contract shipped: ${shipQty} tires (+$${sellerReceives} from prepaid)`, cat: 'contract' });
      } else if (contract.terms.paymentTerms === 'net_30') {
        // Schedule payment for 30 days later
        bg._contractPayables = bg._contractPayables || [];
        bg._contractPayables.push({
          contractId: contract.id, sellerId: seller.id,
          amount: buyerPays, sellerAmount: sellerReceives,
          dueDay: day + 30, shipQty,
        });
        bg.log = bg.log || [];
        bg.log.push({ msg: `Contract delivery: ${shipQty} tires (payment due in 30 days: $${buyerPays})`, cat: 'contract' });
        sg.log = sg.log || [];
        sg.log.push({ msg: `Contract shipped: ${shipQty} tires (payment in 30 days)`, cat: 'contract' });
      }

      // Update contract tracking
      contract.deliveredQty = (contract.deliveredQty || 0) + shipQty;
      contract.totalPaid = (contract.totalPaid || 0) + grossPayment;

      // Clear staging
      if (sg.factory.contractStaging) sg.factory.contractStaging[contract.id] = 0;
      delete contract._pendingShipment;
      delete contract._shipmentQty;

      // Record delivery
      if (!contract.deliveries) contract.deliveries = [];
      contract.deliveries.push({ day, qty: shipQty, payment: grossPayment });

      // Check completion
      if (contract.deliveredQty >= contract.terms.qty) {
        contract.status = 'completed';
        // Clean up factory allocation
        if (sg.factory.contractAllocations?.[contract.id]) {
          const alloc = sg.factory.contractAllocations[contract.id];
          sg.factory.totalAllocatedPercent = Math.max(0, (sg.factory.totalAllocatedPercent || 0) - alloc.percent);
          delete sg.factory.contractAllocations[contract.id];
          delete sg.factory.contractStaging?.[contract.id];
        }
        sg.log.push({ msg: `Contract completed! Delivered ${contract.deliveredQty} tires total`, cat: 'contract' });
      }

      // Sync buyer's contract copy
      const bc = (bg.p2pContracts || []).find(c => c.id === contract.id);
      if (bc) {
        bc.deliveredQty = contract.deliveredQty;
        bc.totalPaid = contract.totalPaid;
        bc.status = contract.status;
        bc.deliveries = contract.deliveries;
      }

      // Save both players
      try {
        await savePlayerState(buyer.id, bg);
        await savePlayerState(seller.id, sg);
        // Update DB record
        if (updatePlayerContract) {
          await updatePlayerContract(contract.id, {
            deliveredQty: contract.deliveredQty,
            totalRevenue: contract.totalPaid,
            status: contract.status,
            deliveries: contract.deliveries,
            completedAt: contract.status === 'completed' ? new Date() : undefined,
          });
        }
      } catch (e) {
        console.error('[contracts] Fulfillment save error:', e.message);
      }
    }
  }
}

/**
 * Process contract payables that are due today (net terms).
 */
async function processContractPayments(players, day) {
  for (const player of players) {
    const g = player.game_state;
    if (!g._contractPayables || g._contractPayables.length === 0) continue;

    const due = g._contractPayables.filter(p => day >= p.dueDay);
    const remaining = g._contractPayables.filter(p => day < p.dueDay);

    for (const payment of due) {
      // Credit seller first — only deduct from buyer if seller exists
      let sellerCredited = false;
      try {
        const seller = await getPlayer(payment.sellerId);
        if (seller) {
          seller.game_state.cash += payment.sellerAmount;
          seller.game_state.log = seller.game_state.log || [];
          seller.game_state.log.push({ msg: `Contract payment received: +$${payment.sellerAmount}`, cat: 'contract' });
          await savePlayerState(payment.sellerId, seller.game_state);
          sellerCredited = true;
        }
      } catch (e) {
        console.error('[contracts] Payment credit error:', e.message);
      }

      if (!sellerCredited) {
        // Skip deducting from buyer if seller couldn't be credited
        remaining.push(payment); // Re-queue for next tick
        continue;
      }

      // Deduct from buyer
      g.cash -= payment.amount;
      g.log = g.log || [];
      g.log.push({ msg: `Contract payment due: -$${payment.amount}`, cat: 'contract' });

      // Late penalty: if buyer cash goes negative, apply 5% penalty
      if (g.cash < 0) {
        const penalty = Math.floor(Math.abs(g.cash) * 0.05);
        g.cash -= penalty;
        g.log.push({ msg: `Late payment penalty: -$${penalty}`, cat: 'contract' });
      }
    }

    if (due.length > 0) {
      g._contractPayables = remaining;
      try {
        await savePlayerState(player.id, g);
      } catch (e) {
        console.error('[contracts] Payable save error:', e.message);
      }
    }
  }
}

/**
 * Run one tick: advance all active players by one day.
 * @param {Set} clients - WebSocket client set for broadcasting
 */
// Tick timing stats (rolling last 100 ticks)
const _tickTimings = [];
export function getTickStats() {
  if (_tickTimings.length === 0) return { lastMs: 0, avgMs: 0, p95Ms: 0 };
  const sorted = [..._tickTimings].sort((a, b) => a - b);
  return {
    lastMs: _tickTimings[_tickTimings.length - 1],
    avgMs: Math.round(_tickTimings.reduce((a, b) => a + b, 0) / _tickTimings.length),
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
  };
}

export async function runTick(clients) {
  const _tickStart = Date.now();
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

    // ── TC VALUE FLUCTUATION — stabilized multi-factor model (Section 14) ──
    if (!game.economy.tcValue) game.economy.tcValue = 50000;
    if (!game.economy.tcMetrics) game.economy.tcMetrics = {};
    if (!game.economy.tcHistory) game.economy.tcHistory = [];
    if (!game.economy.tcReserve) game.economy.tcReserve = {
      cashBalance: MONET.tcReserve.reserveBalance, tcHoldings: 0,
    };
    if (!game.economy.tcCircuitBreaker) game.economy.tcCircuitBreaker = {
      weekStartValue: game.economy.tcValue, weekStartDay: day, frozenUntil: 0,
    };
    if (!game.economy.tcMarketplace) game.economy.tcMarketplace = { listings: [], tradeHistory: [] };

    // Collect economic data from all players
    // Use ALL players (including bots) for economic calculations — bots hold and spend TC too
    const allPlayerCount = Math.max(1, players.length);
    const realPlayers = players.filter(p => !isBotPlayer(p.game_state));
    const activePlayerCount = Math.max(1, realPlayers.length);
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
      if (gs.factory?.rubberFarm) {
        const fl = gs.factory.rubberFarm.level || 1;
        totalRubberOutput += [0, 5, 15, 30][fl] || 5;
      }
      if (gs.factory?.syntheticLab) {
        const sl = gs.factory.syntheticLab.level || 1;
        totalRubberOutput += [0, 8, 20, 40][sl] || 8;
      }
      totalTireProduction += (gs.factory?.productionQueue || []).reduce((a, q) => a + (q.qty || 0), 0);
      if (gs.factory?.rubberFarm?.purchasedDay && day - gs.factory.rubberFarm.purchasedDay <= 7) recentFarmLabPurchases++;
      if (gs.factory?.syntheticLab?.purchasedDay && day - gs.factory.syntheticLab.purchasedDay <= 7) recentFarmLabPurchases++;
      const w = getWealth(gs);
      if (w > topPlayerWealth) { topPlayerWealth = w; topPlayerId = p.id; }
    }

    // ── 14d: Reserve buyback — replenish daily ──
    const reserve = game.economy.tcReserve;
    reserve.cashBalance += MONET.tcReserve.replenishRate;

    // ── 14e: Expire old TC marketplace listings — refund expired orders ──
    const tcMkt = game.economy.tcMarketplace;
    const expiredRefunds = []; // { playerId, type: 'tc'|'cash', amount }
    for (const l of (tcMkt.listings || [])) {
      if (l.status !== 'active') continue;
      if (l.expiresDay <= day) {
        l.status = 'expired';
        if (l.type === 'tc_sell') expiredRefunds.push({ playerId: l.sellerId, type: 'tc', amount: l.tcAmount });
        if (l.type === 'tc_buy') expiredRefunds.push({ playerId: l.buyerId, type: 'cash', amount: l.bidPrice });
      }
    }
    // Apply refunds (batched after loop to avoid mid-iteration saves)
    for (const refund of expiredRefunds) {
      try {
        const rp = await getPlayer(refund.playerId);
        if (rp) {
          if (refund.type === 'tc') rp.game_state.tireCoins = (rp.game_state.tireCoins || 0) + refund.amount;
          else rp.game_state.cash = (rp.game_state.cash || 0) + refund.amount;
          rp.game_state.log = rp.game_state.log || [];
          rp.game_state.log.push({ msg: `TC Market listing expired — refunded ${refund.type === 'tc' ? refund.amount + ' TC' : '$' + refund.amount.toLocaleString()}`, cat: 'exchange' });
          await savePlayerState(refund.playerId, rp.game_state);
        }
      } catch {}
    }
    // Clean up old filled/expired/cancelled listings (keep last 50)
    tcMkt.listings = (tcMkt.listings || []).filter(l => l.status === 'active').concat(
      (tcMkt.listings || []).filter(l => l.status !== 'active').slice(-50)
    );

    // ── Weekly TC value recalculation with EMA smoothing (14c) ──
    const cb = game.economy.tcCircuitBreaker;
    const tcVal = MONET.tcValuation;
    const prevTcValue = game.economy.tcValue;

    if (day % 7 === 0) {
      // Track weekly start for circuit breaker
      cb.weekStartValue = prevTcValue;
      cb.weekStartDay = day;

      // ── Factor 1: Per-Capita TC Scarcity (gentler curve) ──
      // Use ALL players (bots + real) as the denominator — everyone holds TC
      const tcPerCapita = totalTC / allPlayerCount;
      // Baseline: 500 TC per player is "neutral" — at this level value is 1.0x
      // Above 500: value decreases gently. Below 500: value increases.
      const scarcityBaseline = 500;
      const tcSupplyFactor = totalTC > 0
        ? Math.max(0.6, Math.min(2.0, Math.pow(scarcityBaseline / Math.max(1, tcPerCapita), 0.20)))
        : 1.0;

      // ── Factor 2: Velocity of Money (Cash Inflation) ──
      const cashPerCapita = totalCash / allPlayerCount;
      const cashRatio = cashPerCapita / 100000; // $100K per player is "neutral"
      const velocityFactor = Math.max(0.7, Math.min(1.5, Math.sqrt(Math.max(0.1, cashRatio))));

      // ── Factor 3: Resource Scarcity (Rubber) ──
      const rubberDemandRatio = totalRubberOutput > 0
        ? Math.max(0.1, totalTireProduction / (totalRubberOutput * 7))
        : 1.0;
      const rubberFactor = Math.max(0.8, Math.min(1.3, 0.85 + rubberDemandRatio * 0.15));

      // ── Factor 4: Player Sentiment ──
      const sentimentFactor = Math.min(1.15, 1 + recentFarmLabPurchases * 0.02);

      // ── Factor 5: Market Maker ──
      let marketMakerFactor = 1.0;
      if (topPlayerId) {
        const topPlayer = players.find(p => p.id === topPlayerId);
        if (topPlayer) {
          const topTcShare = totalTC > 0 ? (topPlayer.game_state.tireCoins || 0) / totalTC : 0;
          marketMakerFactor = Math.max(0.92, Math.min(1.10, 1 + (topTcShare - 0.2) * 0.15));
        }
      }

      // ── Factor 6: Global Event Chaos ──
      let chaosFactor = 1.0;
      for (const ge of (game.economy.activeGlobalEvents || [])) {
        if (ge.id === 'rubber_shortage') chaosFactor *= 1.08;
        if (ge.id === 'economic_boom') chaosFactor *= 0.95;
        if (ge.id === 'steel_surplus') chaosFactor *= 0.97;
        if (ge.id === 'safety_recall') chaosFactor *= 1.05;
      }
      chaosFactor = Math.max(0.85, Math.min(1.20, chaosFactor));

      // ── Calculate raw target value ──
      const baseTargetValue = 50000;
      const targetFactor = tcSupplyFactor * velocityFactor * rubberFactor * sentimentFactor * marketMakerFactor * chaosFactor;
      const rawTargetValue = Math.max(5000, Math.min(500000, baseTargetValue * targetFactor));

      // ── 14c: EMA smoothing — blend raw target into current price ──
      const smoothed = tcVal.smoothingFactor * rawTargetValue + (1 - tcVal.smoothingFactor) * prevTcValue;

      // ── 14c: Daily move cap (±5%) ──
      const maxChange = prevTcValue * tcVal.maxDailyMove;
      let clamped = Math.max(prevTcValue - maxChange, Math.min(prevTcValue + maxChange, smoothed));

      // ── 14c: Circuit breaker — freeze if weekly move exceeds ±15% ──
      if (day < cb.frozenUntil) {
        clamped = prevTcValue; // Price frozen during cooldown
      }

      // ── 14a: Floor price enforcement ──
      const tcFloor = MONET.tcFloor.absoluteMinimum;
      game.economy.tcValue = Math.round(Math.max(clamped, tcFloor));

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
        targetValue: Math.round(rawTargetValue),
        smoothedValue: Math.round(smoothed),
        reserveCash: Math.round(reserve.cashBalance),
        reserveTC: reserve.tcHoldings,
        circuitBreakerFrozen: day < cb.frozenUntil,
      };

      // History for charting (keep last 52 weeks)
      game.economy.tcHistory.push({ day, value: game.economy.tcValue });
      if (game.economy.tcHistory.length > 52) game.economy.tcHistory.shift();

      // ── 14c: Check weekly circuit breaker ──
      const weeklyMove = Math.abs(game.economy.tcValue - cb.weekStartValue) / Math.max(1, cb.weekStartValue);
      if (weeklyMove > tcVal.maxWeeklyMove) {
        cb.frozenUntil = day + tcVal.circuitBreakerCooldown;
      }
    }

    // ── 14d: Reserve buyback/sell — runs daily ──
    if (MONET.tcReserve.enabled) {
      const tcAvg30 = game.economy.tcHistory.length > 0
        ? game.economy.tcHistory.reduce((s, h) => s + h.value, 0) / game.economy.tcHistory.length
        : game.economy.tcValue;

      // Buy TC when price is below 80% of 30-day average
      if (game.economy.tcValue < tcAvg30 * MONET.tcReserve.buybackThreshold) {
        const buyPrice = Math.round(game.economy.tcValue * (1 - MONET.tcReserve.buybackPriceDiscount));
        const affordable = Math.floor(reserve.cashBalance / Math.max(1, buyPrice));
        const buyQty = Math.min(MONET.tcReserve.maxDailyBuyback, affordable);
        if (buyQty > 0) {
          reserve.cashBalance -= buyQty * buyPrice;
          reserve.tcHoldings += buyQty;
        }
      }
      // Sell TC when price is above 130% of 30-day average (take profit)
      else if (game.economy.tcValue > tcAvg30 * MONET.tcReserve.sellThreshold && reserve.tcHoldings > 0) {
        const sellQty = Math.min(MONET.tcReserve.maxDailySell, reserve.tcHoldings);
        if (sellQty > 0) {
          reserve.cashBalance += sellQty * game.economy.tcValue;
          reserve.tcHoldings -= sellQty;
        }
      }
    }

    // ── Dynamic Supplier Pricing with Commodity Cycles ──
    if (!game.economy.supplierPricing) game.economy.supplierPricing = {};
    if (!game.economy.commodities) game.economy.commodities = { rubber: 1.0, steel: 1.0, chemicals: 1.0, oil: 1.0 };
    if (!game.economy.commodities.oil) game.economy.commodities.oil = 1.0;

    // ── Macro Inflation/Deflation Cycle (90-180 day period) ──
    if (!game.economy.inflationCycle) game.economy.inflationCycle = { phase: 0, period: 135, amplitude: 0.08 };
    const ic = game.economy.inflationCycle;
    // Slowly drift the period (creates irregular cycles)
    if (day % 90 === 0) {
      ic.period = 90 + Math.floor(Math.random() * 90); // 90-180 days
      ic.amplitude = 0.05 + Math.random() * 0.06;       // 5-11% swing
    }
    const inflationIndex = 1.0 + ic.amplitude * Math.sin(day / ic.period * 2 * Math.PI);

    // Commodity prices cycle independently (sine waves with different periods + noise)
    // Inflation index biases ALL commodities up during inflationary periods
    const commodities = game.economy.commodities;
    const cycleAmplitude = 0.12; // ±12% swing from commodity cycles
    const inflBias = (inflationIndex - 1.0) * 0.5; // half of inflation index bleeds into commodities
    commodities.rubber    = 1.0 + cycleAmplitude * Math.sin(day / 45 * Math.PI) + (Math.random() - 0.5) * 0.03 + inflBias;
    commodities.steel     = 1.0 + cycleAmplitude * Math.sin(day / 60 * Math.PI + 2.1) + (Math.random() - 0.5) * 0.03 + inflBias;
    commodities.chemicals = 1.0 + cycleAmplitude * Math.sin(day / 75 * Math.PI + 4.2) + (Math.random() - 0.5) * 0.03 + inflBias;
    commodities.oil       = 1.0 + cycleAmplitude * Math.sin(day / 55 * Math.PI + 1.0) + (Math.random() - 0.5) * 0.04 + inflBias;

    // Global events modify commodities directly
    for (const ge of (game.economy.activeGlobalEvents || [])) {
      if (ge.id === 'rubber_shortage') commodities.rubber += 0.15;
      if (ge.id === 'steel_surplus') commodities.steel -= 0.12;
      if (ge.id === 'winter_storm') commodities.oil += 0.10;
      if (ge.id === 'port_strike') { commodities.oil += 0.08; commodities.rubber += 0.05; }
    }

    // Clamp commodities to [0.75, 1.35]
    for (const k of Object.keys(commodities)) {
      commodities[k] = Math.round(Math.max(0.75, Math.min(1.35, commodities[k])) * 1000) / 1000;
    }

    // Store inflation index in economy for downstream use
    game.economy.inflationIndex = Math.round(inflationIndex * 1000) / 1000;

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

    // Per-supplier pricing: each supplier has unique sensitivity to economic factors
    if (!game.economy.supplierPrices) game.economy.supplierPrices = {};
    const cal2 = getCalendar(day);
    const seasonDemandMult = { Spring: 1.05, Summer: 0.95, Fall: 1.10, Winter: 1.15 }[cal2.season] || 1.0;

    for (let si = 0; si < SUPPLIERS.length; si++) {
      const sup = SUPPLIERS[si];
      const pf = sup.priceFactors || { rubberIndex: 0.35, steelIndex: 0.15, seasonalDemand: 0.20, globalEvents: 0.20, supplyChain: 0.10 };
      if (!game.economy.supplierPrices[si]) game.economy.supplierPrices[si] = {};

      // Supply chain noise: ±3% daily drift, mean-reverting
      if (!game.economy._supplyChainNoise) game.economy._supplyChainNoise = {};
      const prevNoise = game.economy._supplyChainNoise[si] || 0;
      const chainDrift = (Math.random() - 0.5) * 0.06; // ±3%
      game.economy._supplyChainNoise[si] = Math.max(-0.10, Math.min(0.10, prevNoise * 0.85 + chainDrift)); // Mean-reverts

      for (const tireKey of Object.keys(TIRES)) {
        const baseMult = game.economy.supplierPricing[tireKey] || 1.0;
        // Supplier-specific delta from their price factor weights
        const rubberDelta = (commodities.rubber - 1) * pf.rubberIndex;
        const steelDelta = (commodities.steel - 1) * pf.steelIndex;
        const seasonDelta = (seasonDemandMult - 1) * pf.seasonalDemand;
        let eventDelta = 0;
        for (const ge of (game.economy.activeGlobalEvents || [])) {
          const def = GLOBAL_EVENTS.find(d => d.id === ge.id);
          if (def?.effects?.productionCostMult) eventDelta += (def.effects.productionCostMult - 1) * pf.globalEvents;
        }
        const chainNoiseDelta = game.economy._supplyChainNoise[si] * pf.supplyChain;
        const supplierMod = rubberDelta + steelDelta + seasonDelta + eventDelta + chainNoiseDelta;
        const finalMult = Math.round(Math.max(0.70, Math.min(1.35, baseMult + supplierMod)) * 1000) / 1000;
        game.economy.supplierPrices[si][tireKey] = finalMult;
      }
    }

    // ── Dynamic Interest Rates (Bank Bot) — intelligent rate adjustments ──
    if (!game.economy.bankRate) game.economy.bankRate = 0.042;
    if (!game.economy.loanRateMult) game.economy.loanRateMult = 1.0;
    if (!game.economy.rateHistory) game.economy.rateHistory = [];
    if (!game.economy.bankState) game.economy.bankState = {
      savingsRate: 0.042, totalDeposits: 0, totalLoansOutstanding: 0,
      reserveRatio: 0, inflationIndex: 1.0, rateDirection: 'hold',
      lastAdjustmentDay: 0, adjustmentHistory: [],
      loanRates: { micro: 0.14, small: 0.095, sba: 0.07, equipment: 0.065, commercial: 0.055, expansion: 0.05 },
    };

    const bs = game.economy.bankState;
    const totalLoans = players.reduce((sum, p) => sum + (p.game_state.loans || []).reduce((s, l) => s + (l.remaining || 0), 0), 0);
    bs.totalDeposits = Math.round(totalBankDeposits);
    bs.totalLoansOutstanding = Math.round(totalLoans);
    bs.reserveRatio = totalLoans > 0 ? +(totalBankDeposits / totalLoans).toFixed(2) : 999;
    bs.inflationIndex = game.economy.inflationIndex || 1.0;

    // Evaluate every 30 days with 15-day cooldown
    if (day % 30 === 0 && day - bs.lastAdjustmentDay >= 15) {
      const prevRate = bs.savingsRate;
      const cal = getCalendar(day);
      const rateSeasonMult = { Spring: 0.92, Summer: 0.88, Fall: 1.08, Winter: 1.12 }[cal.season] || 1;

      // Factor 1: Deposit level — high deposits → lower rates to discourage hoarding
      const depositFactor = Math.min(1.0, totalBankDeposits / 20000000);
      let signal = 0;
      if (depositFactor > 0.7) signal -= 0.0025;    // Too much saving
      else if (depositFactor < 0.2) signal += 0.0025; // Not enough saving

      // Factor 2: Loan demand — high borrowing → raise rates to cool down
      const loanDemandFactor = Math.min(1.0, totalLoans / 5000000);
      if (loanDemandFactor > 0.6) signal += 0.0025;
      else if (loanDemandFactor < 0.15) signal -= 0.0025;

      // Factor 3: Commodity prices (inflationary pressure)
      const avgCommodity = (commodities.rubber + commodities.steel + commodities.chemicals) / 3;
      if (avgCommodity > 1.10) signal += 0.0025;    // Inflation
      else if (avgCommodity < 0.90) signal -= 0.0025; // Deflation

      // Factor 4: Global events
      for (const ge of (game.economy.activeGlobalEvents || [])) {
        if (ge.id === 'economic_boom') signal -= 0.005;    // Boom → cut
        if (ge.id === 'rubber_shortage') signal += 0.005;   // Crisis → hike
        if (ge.id === 'safety_recall') signal += 0.0025;
      }

      // Factor 5: TC scarcity
      const tcScarcityBonus = totalTC > 0
        ? Math.min(0.005, Math.max(0, (1 - totalTC / 50000) * 0.005))
        : 0;
      signal += tcScarcityBonus;

      // Factor 6: Season
      signal += (rateSeasonMult - 1) * 0.01;

      // Factor 7: Inflation cycle — inflationary periods → raise rates
      if (inflationIndex > 1.04) signal += 0.0025;
      else if (inflationIndex < 0.96) signal -= 0.0025;

      // Mean reversion toward baseline when no strong signals
      const meanReversion = (0.042 - bs.savingsRate) * 0.05;
      signal += meanReversion;

      // Clamp adjustment to ±0.50% in 0.25% increments
      const rawAdj = Math.max(-0.005, Math.min(0.005, signal));
      const adjustment = Math.round(rawAdj / 0.0025) * 0.0025;

      if (adjustment !== 0) {
        bs.savingsRate = Math.round(Math.max(0.010, Math.min(0.080, bs.savingsRate + adjustment)) * 10000) / 10000;
        bs.rateDirection = adjustment > 0 ? 'raising' : 'lowering';
        bs.lastAdjustmentDay = day;
        bs.adjustmentHistory.push({ day, adjustment, newRate: bs.savingsRate });
        if (bs.adjustmentHistory.length > 12) bs.adjustmentHistory.shift();

        // Update per-tier loan rates (savings rate + spread)
        const tierSpreads = { micro: 0.10, small: 0.06, sba: 0.035, equipment: 0.03, commercial: 0.02, expansion: 0.015 };
        for (const [tier, spread] of Object.entries(tierSpreads)) {
          bs.loanRates[tier] = Math.round(Math.max(0.030, Math.min(0.200, bs.savingsRate + spread)) * 10000) / 10000;
        }
      } else {
        bs.rateDirection = 'hold';
      }

      // Sync with legacy fields
      game.economy.bankRate = bs.savingsRate;
      game.economy.loanRateMult = Math.round((1.0 - depositFactor * 0.30) * 1000) / 1000;
      game.economy.tcScarcityBonus = Math.round(tcScarcityBonus * 10000) / 10000;

      // Rate history for charts (keep last 52 entries)
      game.economy.rateHistory.push({
        day,
        bankRate: bs.savingsRate,
        loanRateMult: game.economy.loanRateMult,
        depositFactor: +depositFactor.toFixed(3),
        totalDeposits: Math.round(totalBankDeposits),
        totalLoans: Math.round(totalLoans),
        rateDirection: bs.rateDirection,
      });
      if (game.economy.rateHistory.length > 52) game.economy.rateHistory.shift();
    }

    // Fetch recent chat messages so bots can reply to other players
    let recentChatMessages = [];
    try {
      recentChatMessages = await getChatMessages(15, 'global');
    } catch (e) {
      // Non-critical — bots just won't reply this tick
    }

    const shared = {
      cities: CITIES,
      aiShops: game.ai_shops || [],
      liquidation: game.liquidation || [],
      playerPriceAvg,
      aiPriceAvg,
      totalTC,
      totalBankDeposits,
      activePlayerCount,
      factorySuppliers,
      wholesaleSuppliers,
      globalEvents: game.economy.activeGlobalEvents || [],
      tcValue: game.economy.tcValue || 50000,
      tcMetrics: game.economy.tcMetrics || {},
      supplierPricing: game.economy.supplierPricing || {},
      supplierPrices: game.economy.supplierPrices || {},
      commodities: game.economy.commodities || { rubber: 1.0, steel: 1.0, chemicals: 1.0, oil: 1.0 },
      inflationIndex: game.economy.inflationIndex || 1.0,
      bankRate: game.economy.bankRate,
      loanRateMult: game.economy.loanRateMult,
      bankState: game.economy.bankState || null,
      exchange: game.economy?.exchange || null,
      recentChatMessages,
    };

    const cal = getCalendar(day);

    // Reset bot chat budget for this tick (1-5 messages per day across all bots)
    resetBotChatBudget();

    // Collect player states for WebSocket broadcast (Section 11)
    const playerStatesMap = new Map();

    for (const player of players) {
      const state = player.game_state;
      if (isBotPlayer(state)) {
        // Skip bot simulation if paused by admin
        if (game.economy?.botsPaused) continue;
        try {
          let newState = state;
          if (state._botConfig) {
            // ── Sync global staff from per-location staff (bots store staff per-location) ──
            const syncedStaff = { techs: 0, sales: 0, managers: 0, drivers: state.staff?.drivers || 0, pricingAnalyst: state.staff?.pricingAnalyst || 0 };
            for (const loc of (state.locations || [])) {
              const ls = loc.staff || {};
              syncedStaff.techs += (ls.techs || 0);
              syncedStaff.sales += (ls.sales || 0);
              syncedStaff.managers += (ls.managers || 0);
            }
            // Ensure minimum staff so simDay can generate revenue
            if (syncedStaff.techs === 0 && (state.locations || []).length > 0) syncedStaff.techs = Math.max(1, (state.locations || []).length);
            if (syncedStaff.sales === 0 && (state.locations || []).length > 0) syncedStaff.sales = Math.max(1, (state.locations || []).length);
            state.staff = syncedStaff;

            // Auto-pricing/sourcing — wrap individually so failures don't kill the tick
            try { applyAutoPrice(state); } catch (e) { /* bot may not have all pricing fields */ }
            try { applyAutoSource(state); } catch (e) { /* bot may not have sourcing config */ }

            // Run real economic simulation
            try {
              newState = simDay(state, shared);
            } catch (simErr) {
              console.error(`[Tick] simDay error for bot ${player.id}:`, simErr.message);
              // If simDay fails, still run bot decisions on the original state
              newState = { ...state, day: (state.day || 0) + 1, log: [], _events: [] };
            }

            // Bot cash reality — no safety nets. Bankruptcy is real and teaches us about balance.
            if (newState.cash < -50000 && (newState.locations || []).length === 0 && (newState.bankBalance || 0) <= 0) {
              // Bot is deeply broke with no shops and no savings — true bankruptcy
              if (!newState._botConfig._bankruptDay) {
                newState._botConfig._bankruptDay = newState.day;
                newState._botConfig._bankruptReason = {
                  cash: Math.round(newState.cash),
                  loans: (newState.loans || []).length,
                  loanTotal: (newState.loans || []).reduce((a, l) => a + (l.remaining || 0), 0),
                  shops: 0,
                  dayRev: newState.dayRev || 0,
                  dayProfit: newState.dayProfit || 0,
                  intensity: newState._botConfig.intensity,
                  personality: newState._botConfig.personality,
                  day: newState.day,
                  totalRev: newState.totalRev || 0,
                  reputation: newState.reputation || 0,
                };
                console.log(`[Bot BANKRUPT] "${newState.companyName}" day ${newState.day} | intensity ${newState._botConfig.intensity} | personality: ${newState._botConfig.personality} | cash: $${Math.round(newState.cash)} | loans: ${(newState.loans || []).length}`);
                // Log to DB for admin analysis
                try {
                  const { pool } = await import('../db/pool.js');
                  await pool.query(
                    `INSERT INTO revenue_events (id, player_id, event_type, data) VALUES ($1, $2, 'bot_bankruptcy', $3::jsonb)`,
                    [uid(), player.id, JSON.stringify(newState._botConfig._bankruptReason)]
                  );
                } catch (e) { /* non-critical */ }
              }
            }

            // ALWAYS run bot decisions + chat, even if simDay had issues
            try {
              newState = runBotTick(newState, shared, players);
            } catch (botTickErr) {
              console.error(`[Tick] runBotTick error for bot ${player.id}:`, botTickErr.message);
            }
          } else {
            // Legacy isAI bots (pre-personality system)
            newState = simAIPlayerDay(state);
          }
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

        // Attach dynamic economy data for WS broadcast (mirrors state.js)
        const wsState = { ...newState };
        if (game.economy?.supplierPricing) wsState._supplierPricing = game.economy.supplierPricing;
        if (game.economy?.supplierPrices) wsState._supplierPrices = game.economy.supplierPrices;
        if (game.economy?.commodities) wsState._commodities = game.economy.commodities;
        if (game.economy?.bankRate != null) {
          wsState._bankRate = game.economy.bankRate;
          wsState._loanRateMult = game.economy.loanRateMult;
          wsState._rateHistory = game.economy.rateHistory;
          wsState._bankState = game.economy.bankState;
        }
        if (game.economy?.inflationIndex != null) wsState._inflationIndex = game.economy.inflationIndex;
        playerStatesMap.set(player.id, wsState);

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

    // ── P2P CONTRACT FULFILLMENT — process pending shipments ──
    try {
      await fulfillContractShipments(players, day);
    } catch (err) {
      console.error('Contract fulfillment error:', err);
    }

    // ── P2P CONTRACT PAYMENTS — process payables due today ──
    try {
      await processContractPayments(players, day);
    } catch (err) {
      console.error('Contract payment error:', err);
    }

    // Post bot chat messages accumulated during this tick
    try {
      const botChats = getPendingBotChats();
      for (const msg of botChats) {
        await addChatMessage(msg);
      }
    } catch (chatErr) {
      console.error('[Tick] Bot chat error:', chatErr.message);
    }

    // Resolve expired marketplace auctions
    await resolveAuctions(day);

    // AI price wars — update every 3 days for faster response
    if (day % 3 === 0) {
      try {
        const aiShops = game.ai_shops || [];
        updateAIPrices(aiShops, playerPriceAvg, null, {
          inflationIndex: game.economy.inflationIndex || 1.0,
          commodities: game.economy.commodities || {},
          players,
        });
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

    // New bot phase-out — reduce _botConfig bots as real player count grows
    try {
      const botConfigPlayers = players.filter(p => p.game_state._botConfig);
      const realCount = players.filter(p => !isBotPlayer(p.game_state) && p.game_state.companyName).length;
      const phaseOutIds = getBotPhaseOutTargets(botConfigPlayers, realCount);
      for (const botId of phaseOutIds) {
        await removePlayer(botId);
        const victim = botConfigPlayers.find(p => p.id === botId);
        if (victim && day % 30 === 0) {
          console.log(`  [Bot Phase-Out] "${victim.game_state.companyName}" closed shop (${botConfigPlayers.length - 1} bots remain, ${realCount} real)`);
        }
      }
    } catch (err) {
      console.error('Bot phase-out error:', err);
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

        // 14b: Scale tournament prizes with emission multiplier
        const emissionMult = Math.min(
          MONET.tcEmission.maxMultiplier,
          Math.max(MONET.tcEmission.minMultiplier, MONET.tcEmission.targetPlayerCount / activePlayerCount)
        );
        const prizes = [10, 5, 3, 1].map(p => Math.max(p, Math.round(p * emissionMult)));
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
    }, playerStatesMap);

    // Notify admin SSE listeners
    tickEmitter.emit('tick', { day, playerCount: players.length, timestamp: Date.now() });

    if (day % 30 === 0) {
      console.log(`Day ${day} (${cal.monthName} Year ${cal.year}): ${players.length} players`);
    }
  } catch (err) {
    console.error('Tick error:', err);
  } finally {
    const elapsed = Date.now() - _tickStart;
    _tickTimings.push(elapsed);
    if (_tickTimings.length > 100) _tickTimings.shift();
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
