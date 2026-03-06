import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getPlayer, savePlayerState, getGame, saveGame } from '../db/queries.js';
import { COMMODITIES } from '../../shared/constants/exchange.js';
import { uid } from '../../shared/helpers/random.js';

const router = Router();

// GET /api/commodity-market/listings — browse player commodity sale listings
router.get('/listings', authMiddleware, async (req, res) => {
  try {
    const game = await getGame('default');
    const listings = game?.economy?.commodityListings || [];
    const active = listings.filter(l => l.status === 'active');
    res.json({ listings: active });
  } catch (err) {
    console.error('GET /api/commodity-market/listings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/commodity-market/prices — world market prices + contract summary
router.get('/prices', authMiddleware, async (req, res) => {
  try {
    const game = await getGame('default');
    const exchange = game?.economy?.exchange;
    const prices = {};
    for (const [key, def] of Object.entries(COMMODITIES)) {
      const c = exchange?.commodities?.[key];
      prices[key] = {
        spot: c?.price ?? def.basePrice,
        basePrice: def.basePrice,
        worldBuyPrice: Math.round((c?.price ?? def.basePrice) * 0.92),
        shortage: c?.shortage || false,
      };
    }
    const listings = (game?.economy?.commodityListings || []).filter(l => l.status === 'active');
    res.json({ prices, listingCount: listings.length });
  } catch (err) {
    console.error('GET /api/commodity-market/prices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/commodity-market/list — list commodity for sale
router.post('/list', authMiddleware, async (req, res) => {
  try {
    const { commodity, qtyPerDay, pricePerUnit, priceType, durationDays } = req.body;
    if (!COMMODITIES[commodity]) return res.status(400).json({ error: 'Invalid commodity' });
    if (!qtyPerDay || qtyPerDay < 1) return res.status(400).json({ error: 'Invalid quantity' });
    if (!pricePerUnit || pricePerUnit < 1) return res.status(400).json({ error: 'Invalid price' });
    if (!durationDays || durationDays < 1 || durationDays > 90) return res.status(400).json({ error: 'Duration must be 1-90 days' });

    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'Need a factory to sell commodities' });

    // Check they produce this commodity (need rubber farm for rubber, synthetic lab for synthetic chemicals)
    const hasRubber = commodity === 'rubber' && g.factory.rubberFarm;
    const hasSynthetic = commodity === 'chemicals' && g.factory.syntheticLab;
    // Steel is currently not player-produced, but allow listing if they have inventory
    if (!hasRubber && !hasSynthetic && commodity !== 'steel') {
      return res.status(400).json({ error: 'You do not produce this commodity' });
    }

    const game = await getGame('default');
    if (!game.economy.commodityListings) game.economy.commodityListings = [];

    // Limit active listings per player
    const playerListings = game.economy.commodityListings.filter(l => l.sellerPlayerId === req.playerId && l.status === 'active');
    if (playerListings.length >= 5) return res.status(400).json({ error: 'Max 5 active commodity listings' });

    const listing = {
      id: uid(),
      commodity,
      sellerPlayerId: req.playerId,
      sellerName: g.companyName || 'Unknown',
      qtyPerDay,
      pricePerUnit,
      priceType: priceType === 'indexed' ? 'indexed' : 'fixed',
      durationDays,
      status: 'active',
      createdDay: g.day || 0,
    };

    game.economy.commodityListings.push(listing);
    // Save economy update
    await saveGame('default', game.day || 1, game.economy, game.ai_shops || [], game.liquidation || []);

    res.json({ ok: true, listing });
  } catch (err) {
    console.error('POST /api/commodity-market/list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/commodity-market/buy — accept a listing / create contract
router.post('/buy', authMiddleware, async (req, res) => {
  try {
    const { listingId } = req.body;
    if (!listingId) return res.status(400).json({ error: 'Missing listingId' });

    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'Need a factory to buy commodities' });

    const game = await getGame('default');
    if (!game.economy.commodityListings) return res.status(404).json({ error: 'Listing not found' });
    const listing = game.economy.commodityListings.find(l => l.id === listingId && l.status === 'active');
    if (!listing) return res.status(404).json({ error: 'Listing not found or no longer active' });
    if (listing.sellerPlayerId === req.playerId) return res.status(400).json({ error: 'Cannot buy your own listing' });

    // Create contract on both sides
    const contract = {
      id: uid(),
      type: 'commodity_supply',
      commodity: listing.commodity,
      sellerPlayerId: listing.sellerPlayerId,
      buyerType: 'player',
      buyerPlayerId: req.playerId,
      buyerName: g.companyName || 'Unknown',
      sellerName: listing.sellerName,
      qtyPerDay: listing.qtyPerDay,
      pricePerUnit: listing.pricePerUnit,
      priceType: listing.priceType,
      durationDays: listing.durationDays,
      startDay: g.day || 0,
      endDay: (g.day || 0) + listing.durationDays,
      status: 'active',
      autoRenew: false,
    };

    // Add to buyer
    if (!g.commodityContracts) g.commodityContracts = [];
    g.commodityContracts.push(contract);
    g.log = g.log || [];
    g.log.push({ msg: `Signed commodity contract: ${listing.qtyPerDay}/day ${listing.commodity} from ${listing.sellerName} at $${listing.pricePerUnit}/unit`, cat: 'event' });
    await savePlayerState(req.playerId, g);

    // Add to seller
    const seller = await getPlayer(listing.sellerPlayerId);
    if (seller) {
      const sg = seller.game_state;
      if (!sg.commodityContracts) sg.commodityContracts = [];
      sg.commodityContracts.push({ ...contract });
      sg.log = sg.log || [];
      sg.log.push({ msg: `${g.companyName || 'A player'} signed a contract for ${listing.qtyPerDay}/day ${listing.commodity} at $${listing.pricePerUnit}/unit`, cat: 'event' });
      await savePlayerState(listing.sellerPlayerId, sg);
    }

    // Mark listing as taken
    listing.status = 'contracted';
    listing.contractId = contract.id;
    await saveGame('default', game.day || 1, game.economy, game.ai_shops || [], game.liquidation || []);

    res.json({ ok: true, contract });
  } catch (err) {
    console.error('POST /api/commodity-market/buy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/commodity-market/cancel — cancel own listing
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const { listingId } = req.body;
    const game = await getGame('default');
    if (!game.economy.commodityListings) return res.status(404).json({ error: 'Listing not found' });
    const listing = game.economy.commodityListings.find(l => l.id === listingId && l.status === 'active');
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.sellerPlayerId !== req.playerId) return res.status(403).json({ error: 'Not your listing' });
    listing.status = 'cancelled';
    await saveGame('default', game.day || 1, game.economy, game.ai_shops || [], game.liquidation || []);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/commodity-market/cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/commodity-market/sell-world — sell to world market at floor price
router.post('/sell-world', authMiddleware, async (req, res) => {
  try {
    const { commodity, qty } = req.body;
    if (!COMMODITIES[commodity]) return res.status(400).json({ error: 'Invalid commodity' });
    const sellQty = Math.max(1, Math.floor(Number(qty) || 0));

    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'Need a factory' });

    // Check available rubber to sell
    let available = 0;
    if (commodity === 'rubber') {
      available = (g.factory.naturalRubber || 0) + (g.factory.syntheticRubber || 0);
    } else if (commodity === 'chemicals') {
      available = g.factory.syntheticRubber || 0; // synthetic lab produces chemicals-equivalent
    }
    if (sellQty > available) return res.status(400).json({ error: `Only ${available} available` });

    const game = await getGame('default');
    const spotPrice = game?.economy?.exchange?.commodities?.[commodity]?.price ?? COMMODITIES[commodity].basePrice;
    const worldPrice = Math.round(spotPrice * 0.92); // World market discount
    const proceeds = sellQty * worldPrice;

    // Deduct from storage
    if (commodity === 'rubber') {
      let remaining = sellQty;
      const fromNatural = Math.min(g.factory.naturalRubber || 0, remaining);
      g.factory.naturalRubber -= fromNatural;
      remaining -= fromNatural;
      if (remaining > 0) g.factory.syntheticRubber -= remaining;
    } else if (commodity === 'chemicals') {
      g.factory.syntheticRubber -= sellQty;
    }

    g.cash += proceeds;
    g.log = g.log || [];
    g.log.push({ msg: `Sold ${sellQty} ${COMMODITIES[commodity].unit}s of ${COMMODITIES[commodity].name} to world market at $${worldPrice}/unit ($${proceeds.toLocaleString()})`, cat: 'sale' });
    await savePlayerState(req.playerId, g);

    res.json({ ok: true, proceeds, worldPrice, qty: sellQty });
  } catch (err) {
    console.error('POST /api/commodity-market/sell-world error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
