import { Router } from 'express';
import { getPlayer, getAllActivePlayers, savePlayerState, withPlayerLock } from '../db/queries.js';
import { authMiddleware } from '../middleware/auth.js';
import { uid } from '../../shared/helpers/random.js';
import { TIRES } from '../../shared/constants/tires.js';
import { getStorageCap, getInv, getCap, rebuildGlobalInv } from '../../shared/helpers/inventory.js';
import { MAP_FLOOR, P2P_DELIVERY_FEE, P2P_COMMISSION } from '../../shared/constants/wholesale.js';
import { sanitizeForClient } from '../helpers/sanitizeForClient.js';

const router = Router();

// Middleware: sanitize player state in responses
router.use((req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (body && body.state) sanitizeForClient(body.state);
    return origJson(body);
  };
  next();
});

/**
 * GET /api/wholesale/suppliers
 * Returns all players with hasWholesale: true (excluding requester),
 * plus factory distributors with branded tires.
 */
router.get('/suppliers', authMiddleware, async (req, res) => {
  try {
    const players = await getAllActivePlayers();
    const suppliers = [];

    for (const p of players) {
      if (p.id === req.playerId) continue;
      const g = p.game_state;
      if (!g) continue;

      // Player wholesale suppliers
      if (g.hasWholesale && Object.keys(g.wholesalePrices || {}).length > 0) {
        // Calculate available stock
        const tireTypes = {};
        for (const [k, price] of Object.entries(g.wholesalePrices)) {
          if (!TIRES[k] || price <= 0) continue;
          const stock = (g.warehouseInventory?.[k] || 0) +
            (g.locations || []).reduce((a, l) => a + (l.inventory?.[k] || 0), 0);
          if (stock > 0) {
            tireTypes[k] = { price, stock };
          }
        }
        if (Object.keys(tireTypes).length > 0) {
          suppliers.push({
            playerId: p.id,
            type: 'player',
            companyName: g.companyName || g.name || 'Unknown',
            reputation: g.reputation || 0,
            tireTypes,
            cityId: (g.locations || [])[0]?.cityId || null,
            monthlyVolume: g.monthlyPurchaseVol || 0,
          });
        }
      }

      // Factory distributors with branded tires
      if (g.hasFactory && g.factory?.isDistributor) {
        const fTireTypes = {};
        for (const [k, price] of Object.entries(g.factory.wholesalePrices || {})) {
          if (price <= 0) continue;
          // Check factory inventory (branded tires stored in warehouseInventory)
          const brandKey = k.startsWith('brand_') ? k : `brand_${k}`;
          const stock = (g.warehouseInventory?.[brandKey] || 0) +
            (g.warehouseInventory?.[k] || 0);
          if (stock > 0) {
            fTireTypes[k] = { price, stock, branded: true, brandName: g.factory.brandName };
          }
        }
        if (Object.keys(fTireTypes).length > 0) {
          suppliers.push({
            playerId: p.id,
            type: 'factory',
            companyName: g.companyName || g.name || 'Unknown',
            brandName: g.factory.brandName,
            reputation: g.reputation || 0,
            brandReputation: g.factory.brandReputation || 0,
            tireTypes: fTireTypes,
            cityId: (g.locations || [])[0]?.cityId || null,
            qualityRating: g.factory.qualityRating || 0.80,
          });
        }
      }
    }

    res.json({ ok: true, suppliers });
  } catch (err) {
    console.error('GET /api/wholesale/suppliers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/wholesale/order
 * Buyer places order from another player's wholesale.
 * Body: { supplierId, tireType, qty }
 */
router.post('/order', authMiddleware, async (req, res) => {
  try {
    const { supplierId, tireType, qty: rawQty } = req.body;
    if (!supplierId || !tireType) return res.status(400).json({ error: 'Missing supplierId or tireType' });

    const qty = Math.max(1, Math.floor(Number(rawQty) || 0));
    if (qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    if (supplierId === req.playerId) return res.status(400).json({ error: 'Cannot buy from yourself' });

    // Lock buyer first, then seller inside — consistent order prevents deadlocks
    // (always lock lower playerId first to avoid A→B / B→A deadlock)
    const [firstId, secondId] = [req.playerId, supplierId].sort();
    let _bg, _sg, _buyerVersion, _sellerVersion;

    await withPlayerLock(firstId, async () => {
      await withPlayerLock(secondId, async () => {
        const buyer = await getPlayer(req.playerId);
        if (!buyer) { res.status(404).json({ error: 'Buyer not found' }); return; }
        const seller = await getPlayer(supplierId);
        if (!seller) { res.status(404).json({ error: 'Supplier not found' }); return; }
        _bg = { ...buyer.game_state };
        _sg = { ...seller.game_state };
        _buyerVersion = buyer.version;
        _sellerVersion = seller.version;
      });
    });

    if (!_bg || !_sg) return; // response already sent inside lock
    const bg = _bg, sg = _sg;

    // Determine price and source type
    let unitPrice = 0;
    let sourceKey = tireType;
    let isFactory = false;

    // Check factory wholesale first
    if (sg.hasFactory && sg.factory?.isDistributor && sg.factory.wholesalePrices?.[tireType]) {
      unitPrice = sg.factory.wholesalePrices[tireType];
      isFactory = true;
      const brandKey = tireType.startsWith('brand_') ? tireType : `brand_${tireType}`;
      // Try branded key first, fallback to base key
      const brandStock = (sg.warehouseInventory?.[brandKey] || 0);
      const baseStock = (sg.warehouseInventory?.[tireType] || 0);
      sourceKey = brandStock >= qty ? brandKey : tireType;
    }
    // Check player wholesale
    else if (sg.hasWholesale && sg.wholesalePrices?.[tireType]) {
      unitPrice = sg.wholesalePrices[tireType];
    }
    else {
      return res.status(400).json({ error: 'Supplier does not sell this tire type' });
    }

    if (unitPrice <= 0) return res.status(400).json({ error: 'No price set for this tire' });

    // Check supplier stock across warehouse + locations
    let sellerStock = (sg.warehouseInventory?.[sourceKey] || 0);
    for (const loc of (sg.locations || [])) {
      sellerStock += (loc.inventory?.[sourceKey] || 0);
    }
    if (sellerStock < qty) return res.status(400).json({ error: `Supplier only has ${sellerStock} in stock` });

    // Calculate costs
    const subtotal = qty * unitPrice;
    const deliveryCost = qty * P2P_DELIVERY_FEE;
    const totalBuyerCost = subtotal + deliveryCost;

    if (bg.cash < totalBuyerCost) return res.status(400).json({ error: `Not enough cash (need $${Math.round(totalBuyerCost)})` });

    // Check buyer has storage space
    const buyerFree = getCap(bg) - getInv(bg);
    if (buyerFree < qty) return res.status(400).json({ error: 'Not enough storage space' });

    // === Execute the trade ===

    // 1. Deduct tires from seller (warehouse first, then locations)
    let remaining = qty;
    if (!sg.warehouseInventory) sg.warehouseInventory = {};
    if ((sg.warehouseInventory[sourceKey] || 0) > 0) {
      const take = Math.min(sg.warehouseInventory[sourceKey], remaining);
      sg.warehouseInventory[sourceKey] -= take;
      remaining -= take;
    }
    for (const loc of (sg.locations || [])) {
      if (remaining <= 0) break;
      if (!loc.inventory?.[sourceKey]) continue;
      const take = Math.min(loc.inventory[sourceKey], remaining);
      loc.inventory[sourceKey] -= take;
      remaining -= take;
    }
    rebuildGlobalInv(sg);

    // 2. Add tires to buyer's warehouse
    if (!bg.warehouseInventory) bg.warehouseInventory = {};
    const whInv = Object.values(bg.warehouseInventory).reduce((a, b) => a + b, 0);
    const whCap = getStorageCap(bg);
    const toWh = Math.min(qty, whCap - whInv);
    if (toWh > 0) bg.warehouseInventory[tireType] = (bg.warehouseInventory[tireType] || 0) + toWh;
    const overflow = qty - toWh;
    if (overflow > 0 && bg.locations.length > 0) {
      const loc = bg.locations.find(l => {
        const inv = Object.values(l.inventory || {}).reduce((a, b) => a + b, 0);
        const cap = (l.locStorage || 0) + 100; // base shop cap
        return inv < cap;
      }) || bg.locations[0];
      if (!loc.inventory) loc.inventory = {};
      loc.inventory[tireType] = (loc.inventory[tireType] || 0) + overflow;
    } else if (overflow > 0) {
      bg.warehouseInventory[tireType] = (bg.warehouseInventory[tireType] || 0) + overflow;
    }
    rebuildGlobalInv(bg);

    // 3. Move cash
    const commission = Math.floor(subtotal * P2P_COMMISSION);
    const sellerRevenue = subtotal - commission;
    bg.cash -= totalBuyerCost;
    sg.cash += sellerRevenue;

    // 4. Create order records
    const orderId = uid();
    const orderRecord = {
      id: orderId,
      tireType,
      qty,
      unitPrice,
      subtotal,
      deliveryCost,
      commission,
      day: bg.day || sg.day || 0,
      isFactory,
    };

    // Buyer record
    if (!bg.wholesaleOrdersPlaced) bg.wholesaleOrdersPlaced = [];
    bg.wholesaleOrdersPlaced.unshift({
      ...orderRecord,
      supplierId,
      supplierName: sg.companyName || sg.name || 'Unknown',
      totalPaid: totalBuyerCost,
    });
    if (bg.wholesaleOrdersPlaced.length > 50) bg.wholesaleOrdersPlaced.length = 50;

    // Seller record
    if (!sg.wholesaleOrdersReceived) sg.wholesaleOrdersReceived = [];
    sg.wholesaleOrdersReceived.unshift({
      ...orderRecord,
      buyerId: req.playerId,
      buyerName: bg.companyName || bg.name || 'Unknown',
      revenue: sellerRevenue,
    });
    if (sg.wholesaleOrdersReceived.length > 50) sg.wholesaleOrdersReceived.length = 50;

    // 5. Update stats
    sg.totalWholesaleRevenue = (sg.totalWholesaleRevenue || 0) + sellerRevenue;
    bg.monthlyPurchaseVol = (bg.monthlyPurchaseVol || 0) + qty;

    // 6. Log
    const tireName = TIRES[tireType]?.n || tireType;
    bg.log = bg.log || [];
    bg.log.push(`Bought ${qty} ${tireName} from ${sg.companyName || 'player'} wholesale ($${Math.round(totalBuyerCost)})`);
    sg.log = sg.log || [];
    sg.log.push(`Wholesale order: ${bg.companyName || 'player'} bought ${qty} ${tireName} (+$${Math.round(sellerRevenue)})`);

    // 7. Save both with version locking to prevent tick race conditions
    await withPlayerLock(firstId, async () => {
      await withPlayerLock(secondId, async () => {
        await savePlayerState(req.playerId, bg, _buyerVersion);
        await savePlayerState(supplierId, sg, _sellerVersion);
      });
    });

    res.json({ ok: true, order: orderRecord, buyerState: bg });
  } catch (err) {
    console.error('POST /api/wholesale/order error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/wholesale/set-prices
 * Player sets their wholesale prices per tire type.
 * Body: { prices: { allSeason: 85, performance: 140, ... } }
 */
router.post('/set-prices', authMiddleware, async (req, res) => {
  try {
    const { prices } = req.body;
    if (!prices || typeof prices !== 'object') return res.status(400).json({ error: 'Missing prices object' });

    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = { ...player.game_state };

    if (!g.hasWholesale) return res.status(400).json({ error: 'Wholesale not unlocked' });

    // Validate and set each price
    const validated = {};
    for (const [k, price] of Object.entries(prices)) {
      if (!TIRES[k]) continue;
      const numPrice = Math.floor(Number(price) || 0);
      if (numPrice <= 0) continue;
      // Check MAP floor
      const mapFloor = MAP_FLOOR[k];
      if (mapFloor) {
        const minPrice = Math.round(TIRES[k].bMin * mapFloor);
        if (numPrice < minPrice) {
          return res.status(400).json({ error: `${TIRES[k].n} price must be >= $${minPrice} (MAP floor)` });
        }
      }
      validated[k] = numPrice;
    }

    g.wholesalePrices = validated;
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, wholesalePrices: validated, state: g });
  } catch (err) {
    console.error('POST /api/wholesale/set-prices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
