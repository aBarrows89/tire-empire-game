import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getPlayer, savePlayerState, getPlayerListings, addPlayerListing, updatePlayerListing, getPlayerListingById, getGame } from '../db/queries.js';
import { RUBBER_STORAGE } from '../../shared/constants/factoryBrand.js';
import { uid } from '../../shared/helpers/random.js';

const router = Router();

// GET /api/rubber-market/listings — browse all active rubber listings
router.get('/listings', authMiddleware, async (req, res) => {
  try {
    const listings = await getPlayerListings({ status: 'active' });
    const rubberListings = listings.filter(l =>
      l.listingType === 'rubber_natural' || l.listingType === 'rubber_synthetic'
    );
    res.json({ listings: rubberListings });
  } catch (err) {
    console.error('GET /api/rubber-market/listings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rubber-market/prices — avg prices, seller count, NPC reference
router.get('/prices', authMiddleware, async (req, res) => {
  try {
    const listings = await getPlayerListings({ status: 'active' });
    const rubberListings = listings.filter(l =>
      l.listingType === 'rubber_natural' || l.listingType === 'rubber_synthetic'
    );

    const game = await getGame('default');
    const rubberIdx = game?.economy?.commodities?.rubber || 1.0;
    const npcNaturalPrice = Math.round(500 * rubberIdx);
    const npcSyntheticPrice = Math.round(600 * rubberIdx);

    const naturalListings = rubberListings.filter(l => l.listingType === 'rubber_natural');
    const syntheticListings = rubberListings.filter(l => l.listingType === 'rubber_synthetic');

    const avgPrice = (arr) => arr.length > 0 ? Math.round(arr.reduce((s, l) => s + l.pricePerUnit, 0) / arr.length) : 0;

    res.json({
      natural: {
        sellerCount: new Set(naturalListings.map(l => l.sellerId)).size,
        avgPrice: avgPrice(naturalListings),
        totalQty: naturalListings.reduce((s, l) => s + l.qty, 0),
        isMonopoly: new Set(naturalListings.map(l => l.sellerId)).size === 1 && naturalListings.length > 0,
      },
      synthetic: {
        sellerCount: new Set(syntheticListings.map(l => l.sellerId)).size,
        avgPrice: avgPrice(syntheticListings),
        totalQty: syntheticListings.reduce((s, l) => s + l.qty, 0),
        isMonopoly: new Set(syntheticListings.map(l => l.sellerId)).size === 1 && syntheticListings.length > 0,
      },
      npcNaturalPrice,
      npcSyntheticPrice,
    });
  } catch (err) {
    console.error('GET /api/rubber-market/prices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rubber-market/list — list rubber for sale (escrow from factory storage)
router.post('/list', authMiddleware, async (req, res) => {
  try {
    const { rubberType, qty: rawQty, pricePerUnit: rawPrice } = req.body;
    if (!['natural', 'synthetic'].includes(rubberType)) {
      return res.status(400).json({ error: 'Invalid rubber type' });
    }
    const qty = Math.max(1, Math.floor(Number(rawQty) || 0));
    const pricePerUnit = Math.max(1, Math.floor(Number(rawPrice) || 0));

    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;

    if (!g.hasFactory || !g.factory?.rubberStorage) {
      return res.status(400).json({ error: 'Need factory with rubber storage' });
    }

    const field = rubberType === 'natural' ? 'naturalRubber' : 'syntheticRubber';
    const available = g.factory[field] || 0;
    if (available < qty) {
      return res.status(400).json({ error: `Only ${available} ${rubberType} rubber available` });
    }

    // Escrow — deduct from storage
    g.factory[field] -= qty;

    const listingType = rubberType === 'natural' ? 'rubber_natural' : 'rubber_synthetic';
    const listing = {
      id: uid(),
      sellerId: req.playerId,
      status: 'active',
      listingType,
      rubberType,
      qty,
      pricePerUnit,
      sellerName: g.companyName || 'Unknown',
    };

    await addPlayerListing(listing);
    await savePlayerState(req.playerId, g);

    g.log = g.log || [];
    g.log.push({ msg: `Listed ${qty} ${rubberType} rubber at $${pricePerUnit}/unit`, cat: 'sale' });
    await savePlayerState(req.playerId, g);

    res.json({ ok: true, listing });
  } catch (err) {
    console.error('POST /api/rubber-market/list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rubber-market/buy — instant buy from listing
router.post('/buy', authMiddleware, async (req, res) => {
  try {
    const { listingId, qty: rawQty } = req.body;
    if (!listingId) return res.status(400).json({ error: 'Missing listingId' });

    const listing = await getPlayerListingById(listingId);
    if (!listing || listing.status !== 'active') {
      return res.status(400).json({ error: 'Listing not found or inactive' });
    }

    const buyQty = rawQty ? Math.min(Math.max(1, Math.floor(Number(rawQty) || 0)), listing.qty) : listing.qty;
    const totalCost = buyQty * listing.pricePerUnit;

    const buyer = await getPlayer(req.playerId);
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
    const bg = buyer.game_state;

    if (!bg.hasFactory || !bg.factory?.rubberStorage) {
      return res.status(400).json({ error: 'Need factory with rubber storage' });
    }

    // Check buyer storage space
    const storageLvl = bg.factory.rubberStorage.level;
    const cap = (RUBBER_STORAGE.levels.find(l => l.level === storageLvl) || RUBBER_STORAGE.levels[0]).capacity;
    const currentTotal = (bg.factory.naturalRubber || 0) + (bg.factory.syntheticRubber || 0);
    if (currentTotal + buyQty > cap) {
      return res.status(400).json({ error: `Not enough storage space (${cap - currentTotal} available)` });
    }

    if (bg.cash < totalCost) {
      return res.status(400).json({ error: `Need $${totalCost.toLocaleString()} (have $${Math.floor(bg.cash).toLocaleString()})` });
    }

    if (listing.sellerId === req.playerId) {
      return res.status(400).json({ error: 'Cannot buy your own listing' });
    }

    // Execute trade
    bg.cash -= totalCost;
    const field = listing.rubberType === 'natural' ? 'naturalRubber' : 'syntheticRubber';
    bg.factory[field] = (bg.factory[field] || 0) + buyQty;
    bg.log = bg.log || [];
    bg.log.push({ msg: `Bought ${buyQty} ${listing.rubberType} rubber from ${listing.sellerName} at $${listing.pricePerUnit}/unit`, cat: 'sale' });
    await savePlayerState(req.playerId, bg);

    // Credit seller
    const seller = await getPlayer(listing.sellerId);
    if (seller) {
      const sg = seller.game_state;
      sg.cash = (sg.cash || 0) + totalCost;
      sg.log = sg.log || [];
      sg.log.push({ msg: `Sold ${buyQty} ${listing.rubberType} rubber to ${bg.companyName} for $${totalCost.toLocaleString()}`, cat: 'sale' });
      await savePlayerState(listing.sellerId, sg);
    }

    // Update listing
    const remainingQty = listing.qty - buyQty;
    if (remainingQty <= 0) {
      await updatePlayerListing(listingId, { status: 'sold', qty: 0 });
    } else {
      await updatePlayerListing(listingId, { qty: remainingQty });
    }

    res.json({ ok: true, bought: buyQty, totalCost });
  } catch (err) {
    console.error('POST /api/rubber-market/buy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rubber-market/cancel — cancel listing, return rubber to seller
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const { listingId } = req.body;
    if (!listingId) return res.status(400).json({ error: 'Missing listingId' });

    const listing = await getPlayerListingById(listingId);
    if (!listing || listing.status !== 'active') {
      return res.status(400).json({ error: 'Listing not found or inactive' });
    }
    if (listing.sellerId !== req.playerId) {
      return res.status(403).json({ error: 'Not your listing' });
    }

    // Return escrowed rubber
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;

    const field = listing.rubberType === 'natural' ? 'naturalRubber' : 'syntheticRubber';
    g.factory[field] = (g.factory[field] || 0) + listing.qty;
    g.log = g.log || [];
    g.log.push({ msg: `Cancelled rubber listing — ${listing.qty} ${listing.rubberType} returned to storage`, cat: 'sale' });
    await savePlayerState(req.playerId, g);

    await updatePlayerListing(listingId, { status: 'cancelled' });

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/rubber-market/cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
