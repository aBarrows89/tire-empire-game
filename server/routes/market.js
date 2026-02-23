import { Router } from 'express';
import { getGame, getPlayer, savePlayerState, getPlayerListings, addPlayerListing, updatePlayerListing, getPlayerListingById } from '../db/queries.js';
import { authMiddleware } from '../middleware/auth.js';
import { uid } from '../../shared/helpers/random.js';
import { TIRES } from '../../shared/constants/tires.js';
import { getLocInv, getLocCap, getStorageCap, rebuildGlobalInv } from '../../shared/helpers/inventory.js';

const router = Router();

// GET /api/market — shared economy data
router.get('/', async (req, res) => {
  try {
    const game = await getGame();
    if (!game) return res.status(404).json({ error: 'No active game' });

    res.json({
      week: game.week,
      economy: game.economy,
      aiShopCount: (game.ai_shops || []).length,
      liquidationCount: (game.liquidation || []).length,
    });
  } catch (err) {
    console.error('GET /api/market error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/market/city/:cityId — AI shop info for a specific city
router.get('/city/:cityId', async (req, res) => {
  try {
    const game = await getGame();
    if (!game) return res.status(404).json({ error: 'No active game' });

    const shops = (game.ai_shops || []).filter(s => s.cityId === req.params.cityId);
    res.json({
      cityId: req.params.cityId,
      shops: shops.map(s => ({
        name: s.name,
        ic: s.ic,
        personality: s.personality,
        reputation: s.reputation,
      })),
      count: shops.length,
    });
  } catch (err) {
    console.error('GET /api/market/city error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/market/cities — AI shop counts for all cities (summary)
router.get('/cities', async (req, res) => {
  try {
    const game = await getGame();
    if (!game) return res.status(404).json({ error: 'No active game' });

    const counts = {};
    for (const shop of (game.ai_shops || [])) {
      counts[shop.cityId] = (counts[shop.cityId] || 0) + 1;
    }
    res.json(counts);
  } catch (err) {
    console.error('GET /api/market/cities error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PLAYER MARKETPLACE (auction listings) ──

// GET /api/market/listings — all active listings
router.get('/listings', async (req, res) => {
  try {
    const listings = await getPlayerListings({ status: 'active' });
    res.json(listings);
  } catch (err) {
    console.error('GET /api/market/listings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/market/my-listings — current player's listings
router.get('/my-listings', authMiddleware, async (req, res) => {
  try {
    const listings = await getPlayerListings({ sellerId: req.playerId });
    res.json(listings);
  } catch (err) {
    console.error('GET /api/market/my-listings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/market/list — create a new listing (escrow tires from inventory)
router.post('/list', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;

    const { tireType, qty, askPrice, duration } = req.body;
    if (!TIRES[tireType]) return res.status(400).json({ error: 'Invalid tire type' });
    const listQty = Math.floor(Number(qty));
    if (!listQty || listQty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    const ask = Math.floor(Number(askPrice));
    if (!ask || ask <= 0) return res.status(400).json({ error: 'Invalid ask price' });
    const dur = Math.max(1, Math.min(4, Math.floor(Number(duration) || 2)));

    // Check aggregate stock
    const totalStock = (g.warehouseInventory?.[tireType] || 0) +
      (g.locations || []).reduce((a, l) => a + (l.inventory?.[tireType] || 0), 0);
    if (totalStock < listQty) return res.status(400).json({ error: 'Not enough tires in stock' });

    // Escrow: remove tires from inventory (warehouse first, then locations)
    let remaining = listQty;
    if (!g.warehouseInventory) g.warehouseInventory = {};
    if (g.warehouseInventory[tireType] > 0) {
      const take = Math.min(g.warehouseInventory[tireType], remaining);
      g.warehouseInventory[tireType] -= take;
      remaining -= take;
    }
    for (const loc of (g.locations || [])) {
      if (remaining <= 0) break;
      if (!loc.inventory || !loc.inventory[tireType]) continue;
      const take = Math.min(loc.inventory[tireType], remaining);
      loc.inventory[tireType] -= take;
      remaining -= take;
    }
    rebuildGlobalInv(g);

    const game = await getGame();
    const listing = {
      id: uid(),
      sellerId: req.playerId,
      sellerName: g.companyName || g.name || 'Unknown',
      tireType,
      qty: listQty,
      askPrice: ask,
      bids: [],
      highBid: 0,
      highBidder: null,
      expiresWeek: (game?.week || g.week) + dur,
      status: 'active',
      listedWeek: game?.week || g.week,
    };

    await addPlayerListing(listing);
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, listing });
  } catch (err) {
    console.error('POST /api/market/list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/market/bid — place a bid on a listing
router.post('/bid', authMiddleware, async (req, res) => {
  try {
    const { listingId, pricePerTire } = req.body;
    const listing = await getPlayerListingById(listingId);
    if (!listing || listing.status !== 'active') return res.status(400).json({ error: 'Listing not found or not active' });
    if (listing.sellerId === req.playerId) return res.status(400).json({ error: 'Cannot bid on your own listing' });

    const bidPrice = Math.floor(Number(pricePerTire));
    if (!bidPrice || bidPrice <= 0) return res.status(400).json({ error: 'Invalid bid price' });
    if (bidPrice <= listing.highBid) return res.status(400).json({ error: `Bid must be higher than current high bid ($${listing.highBid})` });

    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const totalCost = bidPrice * listing.qty;
    if (g.cash < totalCost) return res.status(400).json({ error: `Not enough cash (need $${totalCost})` });

    const game = await getGame();
    listing.bids.push({
      bidderId: req.playerId,
      bidderName: g.companyName || g.name || 'Unknown',
      pricePerTire: bidPrice,
      week: game?.week || g.week,
    });
    listing.highBid = bidPrice;
    listing.highBidder = req.playerId;

    await updatePlayerListing(listing.id, listing);
    res.json({ ok: true, listing });
  } catch (err) {
    console.error('POST /api/market/bid error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/market/cancel — cancel own listing (only if no bids)
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const { listingId } = req.body;
    const listing = await getPlayerListingById(listingId);
    if (!listing || listing.status !== 'active') return res.status(400).json({ error: 'Listing not found or not active' });
    if (listing.sellerId !== req.playerId) return res.status(400).json({ error: 'Not your listing' });
    if (listing.bids.length > 0) return res.status(400).json({ error: 'Cannot cancel listing with bids' });

    // Return escrowed tires
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.warehouseInventory) g.warehouseInventory = {};
    g.warehouseInventory[listing.tireType] = (g.warehouseInventory[listing.tireType] || 0) + listing.qty;
    rebuildGlobalInv(g);

    listing.status = 'cancelled';
    await updatePlayerListing(listing.id, listing);
    await savePlayerState(req.playerId, g);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/market/cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
