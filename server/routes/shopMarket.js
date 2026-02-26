import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getPlayer, savePlayerState,
  getShopSaleListings, addShopSaleListing, getShopSaleListingById,
  updateShopSaleListing, removeShopSaleListing,
} from '../db/queries.js';
import { uid } from '../../shared/helpers/random.js';
import { TIRES } from '../../shared/constants/tires.js';
import { CITIES } from '../../shared/constants/cities.js';
import { shopCost } from '../../shared/constants/shop.js';
import { getShopValuation, SHOP_BID } from '../../shared/constants/shopSale.js';
import { getLocInv } from '../../shared/helpers/inventory.js';
import { rebuildGlobalInv } from '../../shared/helpers/inventory.js';

const router = Router();

// GET /api/shop-market/listings — all active shop sale listings
router.get('/listings', async (req, res) => {
  try {
    const listings = await getShopSaleListings({ status: 'active' });
    res.json(listings);
  } catch (err) {
    console.error('GET /shop-market/listings error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/shop-market/my-listings — current player's shop sale listings
router.get('/my-listings', authMiddleware, async (req, res) => {
  try {
    const listings = await getShopSaleListings({ sellerId: req.playerId });
    res.json(listings);
  } catch (err) {
    console.error('GET /shop-market/my-listings error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/shop-market/list — list a shop for sale (mirrors to shared store)
router.post('/list', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = { ...player.game_state };
    const { locationId, askingPrice } = req.body;

    const loc = g.locations.find(l => l.id === locationId);
    if (!loc) return res.status(400).json({ error: 'Invalid location' });
    const city = CITIES.find(c => c.id === loc.cityId);
    const val = getShopValuation(loc, city);
    const price = Math.max(1, Math.floor(Number(askingPrice) || val.totalValue));

    // Add to player state
    if (!g.shopListings) g.shopListings = [];
    if (g.shopListings.some(l => l.locationId === locationId)) {
      return res.status(400).json({ error: 'Shop already listed' });
    }
    g.shopListings.push({ locationId, askingPrice: price, listedDay: g.day });

    // Build inventory summary
    const invEntries = Object.entries(loc.inventory || {}).filter(([, q]) => q > 0);
    const tireTypes = invEntries.map(([k, q]) => `${TIRES[k]?.n || k} x${q}`);
    const totalTires = invEntries.reduce((a, [, q]) => a + q, 0);

    // Mirror to shared store
    const listingId = uid();
    await addShopSaleListing({
      id: listingId,
      sellerId: req.playerId,
      sellerName: g.companyName || g.name || 'Unknown',
      cityId: loc.cityId,
      cityName: city?.name || 'Unknown',
      state: city?.state || '',
      askingPrice: price,
      valuation: val,
      inventorySummary: { totalTires, tireTypes },
      loyalty: loc.loyalty || 0,
      dayRevenue: (loc.dailyStats?.rev) || 0,
      listedDay: g.day,
      status: 'active',
      locationId,
      offers: [],
      messages: [],
    });

    g.log = g.log || [];
    g.log.push(`Listed shop in ${city?.name || 'unknown'} for sale at $${price.toLocaleString()}`);
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, listingId, state: g });
  } catch (err) {
    console.error('POST /shop-market/list error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/shop-market/delist — remove listing
router.post('/delist', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = { ...player.game_state };
    const { locationId } = req.body;

    if (!g.shopListings) g.shopListings = [];
    g.shopListings = g.shopListings.filter(l => l.locationId !== locationId);
    if (!g.shopBids) g.shopBids = [];
    g.shopBids = g.shopBids.filter(b => b.locationId !== locationId);

    // Remove from shared store
    const allListings = await getShopSaleListings({ sellerId: req.playerId });
    const shared = allListings.find(l => l.locationId === locationId);
    if (shared) await removeShopSaleListing(shared.id);

    g.log = g.log || [];
    g.log.push('Delisted shop from marketplace');
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, state: g });
  } catch (err) {
    console.error('POST /shop-market/delist error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/shop-market/offer — place a player bid/offer on a listing
router.post('/offer', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const { listingId, bidPrice, paymentType, downPct, months, revSharePct, revShareMonths, message } = req.body;

    const listing = await getShopSaleListingById(listingId);
    if (!listing || listing.status !== 'active') return res.status(400).json({ error: 'Listing not found or inactive' });
    if (listing.sellerId === req.playerId) return res.status(400).json({ error: 'Cannot bid on your own listing' });

    const price = Math.max(1, Math.floor(Number(bidPrice) || 0));
    if (price <= 0) return res.status(400).json({ error: 'Invalid price' });

    // For cash offers, verify buyer has funds
    if (paymentType === 'cash' && g.cash < price) {
      return res.status(400).json({ error: 'Not enough cash' });
    }

    const offer = {
      id: uid(),
      bidderId: req.playerId,
      bidderName: g.companyName || g.name || 'Unknown',
      bidPrice: price,
      paymentType: paymentType || 'cash',
      downPct: Number(downPct) || 0.2,
      months: Number(months) || 12,
      revSharePct: Number(revSharePct) || 0.1,
      revShareMonths: Number(revShareMonths) || 12,
      status: 'pending',
      day: g.day,
    };

    listing.offers.push(offer);
    await updateShopSaleListing(listingId, { offers: listing.offers });

    // Add message if provided
    if (message && message.trim()) {
      listing.messages.push({
        id: uid(),
        senderId: req.playerId,
        senderName: g.companyName || g.name || 'Unknown',
        text: message.trim().slice(0, 500),
        timestamp: Date.now(),
        offerId: offer.id,
      });
      await updateShopSaleListing(listingId, { messages: listing.messages });
    }

    // Also add as a player bid in the seller's game state
    const seller = await getPlayer(listing.sellerId);
    if (seller) {
      const sg = { ...seller.game_state };
      if (!sg.shopBids) sg.shopBids = [];
      sg.shopBids.push({
        id: offer.id,
        locationId: listing.locationId,
        bidderName: offer.bidderName,
        bidderId: offer.bidderId,
        bidPrice: offer.bidPrice,
        paymentType: offer.paymentType,
        downPct: offer.downPct,
        months: offer.months,
        revSharePct: offer.revSharePct,
        revShareMonths: offer.revShareMonths,
        day: offer.day,
      });
      await savePlayerState(listing.sellerId, sg);
    }

    // WebSocket notification to seller
    if (req.app.locals.wsClients) {
      for (const client of req.app.locals.wsClients) {
        if (client.playerId === listing.sellerId && client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'shopOffer',
            listingId,
            offer,
          }));
        }
      }
    }

    res.json({ ok: true, offerId: offer.id });
  } catch (err) {
    console.error('POST /shop-market/offer error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/shop-market/accept-offer — accept a player's offer (transfer shop)
router.post('/accept-offer', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = { ...player.game_state };
    const { listingId, offerId } = req.body;

    const listing = await getShopSaleListingById(listingId);
    if (!listing || listing.sellerId !== req.playerId) return res.status(400).json({ error: 'Listing not found' });

    const offer = listing.offers.find(o => o.id === offerId);
    if (!offer || offer.status !== 'pending') return res.status(400).json({ error: 'Offer not found or already handled' });

    const buyer = await getPlayer(offer.bidderId);
    if (!buyer) return res.status(400).json({ error: 'Buyer not found' });
    const bg = { ...buyer.game_state };

    // Find seller's location
    const locIdx = g.locations.findIndex(l => l.id === listing.locationId);
    if (locIdx === -1) return res.status(400).json({ error: 'Location not found' });
    const loc = g.locations[locIdx];
    const city = CITIES.find(c => c.id === loc.cityId);

    // Payment handling
    if (offer.paymentType === 'cash') {
      if (bg.cash < offer.bidPrice) return res.status(400).json({ error: 'Buyer does not have enough cash' });
      bg.cash -= offer.bidPrice;
      g.cash += offer.bidPrice;
    } else if (offer.paymentType === 'installment') {
      const downPayment = Math.round(offer.bidPrice * offer.downPct);
      if (bg.cash < downPayment) return res.status(400).json({ error: 'Buyer does not have enough for down payment' });
      bg.cash -= downPayment;
      g.cash += downPayment;
      // Seller gets installment tracking
      if (!g.shopInstallments) g.shopInstallments = [];
      const monthlyPayment = Math.round((offer.bidPrice - downPayment) / offer.months);
      g.shopInstallments.push({
        buyerName: offer.bidderName, buyerId: offer.bidderId,
        monthlyPayment, remaining: offer.months, startDay: g.day,
      });
      // Buyer gets loan-like payment obligation
      if (!bg.loans) bg.loans = [];
      bg.loans.push({
        id: uid(), name: `Shop Payment (${city?.name})`,
        amt: offer.bidPrice - downPayment, r: 0,
        remaining: offer.bidPrice - downPayment,
        weeklyPayment: Math.round(monthlyPayment / 4),
      });
    } else if (offer.paymentType === 'revShare') {
      const upfront = Math.round(offer.bidPrice * 0.1);
      if (bg.cash < upfront) return res.status(400).json({ error: 'Buyer does not have enough for upfront payment' });
      bg.cash -= upfront;
      g.cash += upfront;
      if (!g.shopRevenueShares) g.shopRevenueShares = [];
      g.shopRevenueShares.push({
        buyerName: offer.bidderName, buyerId: offer.bidderId,
        cityId: loc.cityId,
        monthlyEstimate: ((loc.dailyStats?.rev) || 0) * 30,
        revSharePct: offer.revSharePct,
        remaining: offer.revShareMonths, startDay: g.day,
      });
    }

    // Transfer shop to buyer (reset openedDay for new owner)
    bg.locations = bg.locations || [];
    bg.locations.push({ ...loc, openedDay: bg.day || g.day });
    g.locations.splice(locIdx, 1);
    rebuildGlobalInv(g);

    // Clean up seller's listings and bids
    g.shopListings = (g.shopListings || []).filter(l => l.locationId !== listing.locationId);
    g.shopBids = (g.shopBids || []).filter(b => b.locationId !== listing.locationId);

    // Mark offer as accepted, others as rejected
    for (const o of listing.offers) {
      o.status = o.id === offerId ? 'accepted' : 'rejected';
    }
    listing.status = 'sold';
    await updateShopSaleListing(listingId, { status: 'sold', offers: listing.offers });

    g.log = g.log || [];
    g.log.push(`Sold shop in ${city?.name || 'unknown'} to ${offer.bidderName}`);
    bg.log = bg.log || [];
    bg.log.push(`Purchased shop in ${city?.name || 'unknown'} from ${g.companyName || 'seller'}`);

    await savePlayerState(req.playerId, g);
    await savePlayerState(offer.bidderId, bg);

    // WS notification to buyer
    if (req.app.locals.wsClients) {
      for (const client of req.app.locals.wsClients) {
        if (client.playerId === offer.bidderId && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'shopOffer', action: 'accepted', listingId }));
        }
      }
    }

    res.json({ ok: true, state: g });
  } catch (err) {
    console.error('POST /shop-market/accept-offer error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/shop-market/reject-offer — reject an offer
router.post('/reject-offer', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = { ...player.game_state };
    const { listingId, offerId } = req.body;

    const listing = await getShopSaleListingById(listingId);
    if (!listing || listing.sellerId !== req.playerId) return res.status(400).json({ error: 'Listing not found' });

    const offer = listing.offers.find(o => o.id === offerId);
    if (!offer) return res.status(400).json({ error: 'Offer not found' });

    offer.status = 'rejected';
    await updateShopSaleListing(listingId, { offers: listing.offers });

    // Remove from seller's shopBids
    g.shopBids = (g.shopBids || []).filter(b => b.id !== offerId);
    await savePlayerState(req.playerId, g);

    // WS notification to bidder
    if (req.app.locals.wsClients) {
      for (const client of req.app.locals.wsClients) {
        if (client.playerId === offer.bidderId && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'shopOffer', action: 'rejected', listingId, offerId }));
        }
      }
    }

    res.json({ ok: true, state: g });
  } catch (err) {
    console.error('POST /shop-market/reject-offer error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/shop-market/counter — counter an offer with new terms
router.post('/counter', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const { listingId, offerId, bidPrice, paymentType, downPct, months, revSharePct, revShareMonths, message } = req.body;

    const listing = await getShopSaleListingById(listingId);
    if (!listing || listing.sellerId !== req.playerId) return res.status(400).json({ error: 'Listing not found' });

    const originalOffer = listing.offers.find(o => o.id === offerId);
    if (!originalOffer) return res.status(400).json({ error: 'Offer not found' });

    // Mark original as countered
    originalOffer.status = 'countered';

    // Create counter-offer
    const counterOffer = {
      id: uid(),
      bidderId: originalOffer.bidderId,
      bidderName: originalOffer.bidderName,
      bidPrice: Math.max(1, Math.floor(Number(bidPrice) || originalOffer.bidPrice)),
      paymentType: paymentType || originalOffer.paymentType,
      downPct: Number(downPct) || originalOffer.downPct,
      months: Number(months) || originalOffer.months,
      revSharePct: Number(revSharePct) || originalOffer.revSharePct,
      revShareMonths: Number(revShareMonths) || originalOffer.revShareMonths,
      status: 'pending',
      day: g.day,
      isCounter: true,
      counterFrom: 'seller',
    };
    listing.offers.push(counterOffer);

    if (message && message.trim()) {
      listing.messages.push({
        id: uid(),
        senderId: req.playerId,
        senderName: g.companyName || g.name || 'Unknown',
        text: message.trim().slice(0, 500),
        timestamp: Date.now(),
        offerId: counterOffer.id,
      });
    }

    await updateShopSaleListing(listingId, { offers: listing.offers, messages: listing.messages });

    // Update seller's shopBids — replace old bid with counter
    if (!g.shopBids) g.shopBids = [];
    g.shopBids = g.shopBids.filter(b => b.id !== offerId);
    g.shopBids.push({
      id: counterOffer.id, locationId: listing.locationId,
      bidderName: counterOffer.bidderName, bidderId: counterOffer.bidderId,
      bidPrice: counterOffer.bidPrice, paymentType: counterOffer.paymentType,
      downPct: counterOffer.downPct, months: counterOffer.months,
      revSharePct: counterOffer.revSharePct, revShareMonths: counterOffer.revShareMonths,
      day: counterOffer.day, isCounter: true,
    });
    await savePlayerState(req.playerId, g);

    // WS notification
    if (req.app.locals.wsClients) {
      for (const client of req.app.locals.wsClients) {
        if (client.playerId === originalOffer.bidderId && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'shopOffer', action: 'counter', listingId, counterOffer }));
        }
      }
    }

    res.json({ ok: true, counterOfferId: counterOffer.id });
  } catch (err) {
    console.error('POST /shop-market/counter error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/shop-market/messages/:listingId — get negotiation messages
router.get('/messages/:listingId', authMiddleware, async (req, res) => {
  try {
    const listing = await getShopSaleListingById(req.params.listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    // Only seller and offerors can see messages
    const isParty = listing.sellerId === req.playerId ||
      listing.offers.some(o => o.bidderId === req.playerId);
    if (!isParty) return res.status(403).json({ error: 'Not authorized' });
    res.json(listing.messages || []);
  } catch (err) {
    console.error('GET /shop-market/messages error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/shop-market/message — send a negotiation message
router.post('/message', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const { listingId, text } = req.body;

    const listing = await getShopSaleListingById(listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const isParty = listing.sellerId === req.playerId ||
      listing.offers.some(o => o.bidderId === req.playerId);
    if (!isParty) return res.status(403).json({ error: 'Not authorized' });

    const trimmed = (text || '').trim().slice(0, 500);
    if (!trimmed) return res.status(400).json({ error: 'Message cannot be empty' });

    const msg = {
      id: uid(),
      senderId: req.playerId,
      senderName: g.companyName || g.name || 'Unknown',
      text: trimmed,
      timestamp: Date.now(),
      offerId: null,
    };

    if (!listing.messages) listing.messages = [];
    listing.messages.push(msg);
    await updateShopSaleListing(listingId, { messages: listing.messages });

    // WS notification to all parties except sender
    if (req.app.locals.wsClients) {
      const targets = new Set([listing.sellerId, ...listing.offers.map(o => o.bidderId)]);
      targets.delete(req.playerId);
      for (const client of req.app.locals.wsClients) {
        if (targets.has(client.playerId) && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'shopMessage', listingId, message: msg }));
        }
      }
    }

    res.json({ ok: true, message: msg });
  } catch (err) {
    console.error('POST /shop-market/message error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
