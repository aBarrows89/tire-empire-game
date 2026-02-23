import { TICK_MS } from '../config.js';
import { getAllActivePlayers, savePlayerState, getGame, saveGame, upsertLeaderboard, getPlayerListings, updatePlayerListing, getPlayer } from '../db/queries.js';
import { simWeek } from '../engine/simWeek.js';
import { getWealth } from '../../shared/helpers/wealth.js';
import { getStorageCap, getLocInv, getLocCap, rebuildGlobalInv, getCap, getInv } from '../../shared/helpers/inventory.js';
import { CITIES } from '../../shared/constants/cities.js';
import { TIRES } from '../../shared/constants/tires.js';
import { SOURCES } from '../../shared/constants/sources.js';
import { broadcast } from './broadcast.js';

let tickInterval = null;

/**
 * Apply auto-pricing strategies before simWeek runs.
 * Requires a pricing analyst on staff; if fired, autoPrice data persists
 * but won't execute until re-hired.
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
 * Auto-source used tires each tick if the player has autoSource set.
 * Buys from the configured source if player can afford it and has space.
 */
function applyAutoSource(g) {
  if (!g.autoSource) return;
  const src = SOURCES[g.autoSource];
  if (!src) return;
  // Check rep requirement
  if (src.rr && g.reputation < src.rr) return;
  // Check cash
  if (g.cash < src.c) return;
  // Check space
  const freeSpace = getCap(g) - getInv(g);
  if (freeSpace <= 0) return;

  g.cash -= src.c;
  const rawQty = Math.floor(Math.random() * (src.max - src.min + 1)) + src.min;
  const qty = Math.min(rawQty, freeSpace);
  if (qty <= 0) return;

  // Pick random used tire types
  const usedTypes = Object.keys(TIRES).filter(k => k.startsWith('used_'));
  const added = {};
  for (let i = 0; i < qty; i++) {
    const t = usedTypes[Math.floor(Math.random() * usedTypes.length)];
    added[t] = (added[t] || 0) + 1;
  }

  // Add to warehouse first, overflow to first location
  for (const [t, count] of Object.entries(added)) {
    if (g.hasWarehouse || g.warehouseInventory) {
      g.warehouseInventory = g.warehouseInventory || {};
      g.warehouseInventory[t] = (g.warehouseInventory[t] || 0) + count;
    } else if (g.locations && g.locations.length > 0) {
      const loc = g.locations[0];
      loc.inventory = loc.inventory || {};
      loc.inventory[t] = (loc.inventory[t] || 0) + count;
    } else {
      g.inventory = g.inventory || {};
      g.inventory[t] = (g.inventory[t] || 0) + count;
    }
  }

  g.log = g.log || [];
  g.log.push(`Auto-sourced ${qty} tires from ${src.n} (-$${src.c})`);
}

/**
 * Aggregate player prices across all active players into per-tire averages.
 * Returns { tireKey: avgPrice, ... }
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
 * Transfers tires to winner, cash to seller. Returns unsold tires if no bids.
 */
async function resolveAuctions(currentWeek) {
  try {
    const listings = await getPlayerListings({ status: 'active' });
    for (const listing of listings) {
      if (listing.expiresWeek > currentWeek) continue;

      if (listing.highBidder && listing.highBid > 0) {
        // Winner found — transfer tires to buyer, cash to seller
        const buyer = await getPlayer(listing.highBidder);
        const seller = await getPlayer(listing.sellerId);
        if (buyer && seller) {
          const bg = buyer.game_state;
          const sg = seller.game_state;
          const totalCost = listing.highBid * listing.qty;

          // Deduct cash from buyer
          bg.cash -= totalCost;
          // Add tires to buyer's warehouse or first location
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

          // Pay seller
          sg.cash += totalCost;
          sg.log = sg.log || [];
          sg.log.push(`Sold ${listing.qty} ${TIRES[listing.tireType]?.n || listing.tireType} on marketplace for $${totalCost}`);
          bg.log = bg.log || [];
          bg.log.push(`Won auction: ${listing.qty} ${TIRES[listing.tireType]?.n || listing.tireType} for $${totalCost}`);

          await savePlayerState(listing.highBidder, bg);
          await savePlayerState(listing.sellerId, sg);
        }
        listing.status = 'sold';
      } else {
        // No bids — return tires to seller
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
 * Run one tick: advance all active players by one week.
 * @param {Set} clients - WebSocket client set for broadcasting
 */
export async function runTick(clients) {
  try {
    const game = await getGame();
    if (!game) return;

    const players = await getAllActivePlayers();
    const week = (game.week || 0) + 1;

    // Aggregate live pricing data from all players and AI shops
    const playerPriceAvg = aggregatePlayerPrices(players);
    const aiPriceAvg = aggregateAIPrices(game.ai_shops || []);

    const shared = {
      cities: CITIES,
      aiShops: game.ai_shops || [],
      liquidation: game.liquidation || [],
      playerPriceAvg,
      aiPriceAvg,
    };

    for (const player of players) {
      const state = player.game_state;
      applyAutoPrice(state);
      applyAutoSource(state);
      const newState = simWeek(state, shared);
      await savePlayerState(player.id, newState);

      // Update leaderboard
      await upsertLeaderboard(
        player.id,
        newState.name || 'Unknown',
        getWealth(newState),
        newState.reputation,
        newState.locations.length,
        newState.week
      );
    }

    // Resolve expired marketplace auctions
    await resolveAuctions(week);

    // Update game week
    await saveGame(
      'default',
      week,
      game.economy || {},
      game.ai_shops || [],
      game.liquidation || []
    );

    // Broadcast tick to all clients
    broadcast(clients, {
      type: 'tick',
      week,
      playerCount: players.length,
      timestamp: Date.now(),
    });

    console.log(`Tick ${week}: ${players.length} players processed`);
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
  console.log(`Starting tick loop (${TICK_MS}ms interval)`);
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
