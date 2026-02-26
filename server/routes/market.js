import { Router } from 'express';
import { getGame, saveGame, getPlayer, savePlayerState, getPlayerListings, addPlayerListing, updatePlayerListing, getPlayerListingById, getAllActivePlayers } from '../db/queries.js';
import { authMiddleware } from '../middleware/auth.js';
import { uid } from '../../shared/helpers/random.js';
import { TIRES } from '../../shared/constants/tires.js';
import { MAP_FLOOR } from '../../shared/constants/wholesale.js';
import { P2P_FEES } from '../../shared/constants/marketplace.js';
import { getLocInv, getLocCap, getStorageCap, rebuildGlobalInv } from '../../shared/helpers/inventory.js';

const router = Router();

// GET /api/market — shared economy data
router.get('/', async (req, res) => {
  try {
    const game = await getGame();
    if (!game) return res.status(404).json({ error: 'No active game' });

    res.json({
      day: game.day || game.week,
      economy: game.economy,
      aiShopCount: (game.ai_shops || []).length,
      liquidationCount: (game.liquidation || []).length,
      aiPhaseOut: true, // AI shops/players phase out as real players join
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

// GET /api/market/cities — shop counts for all cities (AI seed shops + all player locations)
router.get('/cities', async (req, res) => {
  try {
    const game = await getGame();
    if (!game) return res.status(404).json({ error: 'No active game' });

    const counts = {};
    // Count AI seed shops
    for (const shop of (game.ai_shops || [])) {
      counts[shop.cityId] = (counts[shop.cityId] || 0) + 1;
    }
    // Count all player locations (AI players + real players)
    const players = await getAllActivePlayers();
    for (const p of players) {
      for (const loc of (p.game_state?.locations || [])) {
        counts[loc.cityId] = (counts[loc.cityId] || 0) + 1;
      }
    }
    res.json(counts);
  } catch (err) {
    console.error('GET /api/market/cities error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/market/city-shops/:cityId — all shops in a specific city
router.get('/city-shops/:cityId', async (req, res) => {
  try {
    const game = await getGame();
    if (!game) return res.status(404).json({ error: 'No active game' });
    const cityId = req.params.cityId;

    // AI seed shops
    const shops = (game.ai_shops || [])
      .filter(s => s.cityId === cityId)
      .map(s => ({
        id: s.id,
        name: s.name,
        personality: s.personality,
        icon: s.ic,
        reputation: s.reputation,
        wealth: s.wealth,
        forSale: s.forSale || false,
        askingPrice: s.askingPrice || null,
        type: 'ai_seed',
      }));

    // AI player + real player shops in this city
    const players = await getAllActivePlayers();
    for (const p of players) {
      const g = p.game_state;
      if (!g) continue;
      for (const loc of (g.locations || [])) {
        if (loc.cityId !== cityId) continue;
        shops.push({
          id: loc.id,
          name: g.companyName || g.name || 'Unknown',
          personality: g.isAI ? 'AI Competitor' : 'Player',
          icon: g.isAI ? '\u{1F916}' : '\u{1F464}',
          reputation: Math.round((g.reputation || 0) * 10) / 10,
          wealth: 0,
          forSale: false,
          type: g.isAI ? 'ai_player' : 'player',
          playerId: p.id,
        });
      }
    }
    res.json(shops);
  } catch (err) {
    console.error('GET /api/market/city-shops error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/market/offer-ai-shop — send acquisition offer to an AI shop
router.post('/offer-ai-shop', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = { ...player.game_state };
    const { shopId, offerPrice } = req.body;
    const game = await getGame();
    const aiShop = (game.ai_shops || []).find(s => s.id === shopId);
    if (!aiShop) return res.status(400).json({ error: 'Shop not found' });

    const price = Math.floor(Number(offerPrice) || 0);
    if (price <= 0) return res.status(400).json({ error: 'Invalid price' });
    if (g.cash < price) return res.status(400).json({ error: 'Not enough cash' });

    // AI decision: accept if offer >= 80% of their wealth value, with some randomness
    const threshold = aiShop.wealth * (0.7 + Math.random() * 0.3);
    const accepted = price >= threshold;

    if (accepted) {
      // Transfer: remove AI shop, give player a new location
      const { CITIES } = await import('../../shared/constants/cities.js');
      const { uid } = await import('../../shared/helpers/random.js');
      const { canOpenInCity } = await import('../../shared/helpers/market.js');
      const city = CITIES.find(c => c.id === aiShop.cityId);

      const check = canOpenInCity(g, aiShop.cityId);
      if (!check.ok) return res.status(400).json({ error: check.reason });

      g.cash -= price;
      const inv = {};
      // Give some inventory from the AI shop
      for (const [k, qty] of Object.entries(aiShop.inventory || {})) {
        if (qty > 0) inv[k] = Math.min(qty, 30);
      }
      g.locations.push({
        id: uid(), cityId: aiShop.cityId, locStorage: 0, inventory: inv,
        loyalty: Math.min(50, Math.floor((aiShop.reputation || 0) * 0.5)),
        openedDay: g.day,
        dailyStats: { rev: 0, sold: 0, profit: 0 },
        staff: { techs: 1, sales: 1, managers: 0 },
      });

      // Remove AI shop from game
      const idx = game.ai_shops.findIndex(s => s.id === shopId);
      if (idx !== -1) game.ai_shops.splice(idx, 1);
      await saveGame(game.id || 'default', game.day, game.economy || {}, game.ai_shops, game.liquidation || []);
      await savePlayerState(req.playerId, g);

      g.log = g.log || [];
      g.log.push(`Acquired "${aiShop.name}" in ${city?.name} for $${price.toLocaleString()}`);
      await savePlayerState(req.playerId, g);

      res.json({ ok: true, accepted: true, message: `${aiShop.name} accepted your offer! Shop acquired.`, state: g });
    } else {
      // Rejected — tell the player what range might work
      const hint = price < aiShop.wealth * 0.5
        ? 'They laughed at your offer. Try at least double.'
        : 'Close, but they want more. Try increasing your offer.';
      res.json({ ok: true, accepted: false, message: `${aiShop.name} rejected your offer. ${hint}` });
    }
  } catch (err) {
    console.error('POST /api/market/offer-ai-shop error:', err);
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

    // Check marketplace access tier
    const hasEcom = g.hasEcom;
    const hasSpecialist = g.marketplaceSpecialist;
    if (!hasEcom && !hasSpecialist) {
      return res.status(400).json({ error: 'Hire a Marketplace Specialist or unlock E-commerce to list on the marketplace' });
    }
    const tier = hasEcom ? 'ecommerce' : 'basic';
    const fees = P2P_FEES[tier];

    const { tireType, qty, askPrice, duration } = req.body;
    if (!TIRES[tireType]) return res.status(400).json({ error: 'Invalid tire type' });
    const listQty = Math.floor(Number(qty));
    if (!listQty || listQty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    const ask = Math.floor(Number(askPrice));
    if (!ask || ask <= 0) return res.status(400).json({ error: 'Invalid ask price' });

    // MAP enforcement for new tires
    const tire = TIRES[tireType];
    if (!tire.used && MAP_FLOOR[tireType]) {
      const minPrice = Math.ceil(tire.def * MAP_FLOOR[tireType]);
      if (ask < minPrice) {
        return res.status(400).json({ error: `MAP violation: minimum price for ${tire.n} is $${minPrice}` });
      }
    }

    // Enforce max listings per tier
    const myActive = await getPlayerListings({ sellerId: req.playerId, status: 'active' });
    if (myActive.length >= fees.maxListings) {
      return res.status(400).json({ error: `Max ${fees.maxListings} active listings (${tier} tier)` });
    }

    // Enforce duration limits per tier
    const maxDur = Math.max(...fees.listingDuration);
    const dur = Math.max(1, Math.min(maxDur, Math.floor(Number(duration) || 7)));

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
      expiresDay: (game?.day || game?.week || g.day || g.week || 1) + dur,
      status: 'active',
      listedDay: game?.day || game?.week || g.day || g.week || 1,
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
      day: game?.day || game?.week || g.day || g.week || 1,
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
