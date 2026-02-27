import { Router } from 'express';
import { getPlayer, savePlayerState, getDirectTrades, addDirectTrade, getDirectTradeById, updateDirectTrade } from '../db/queries.js';
import { authMiddleware } from '../middleware/auth.js';
import { uid } from '../../shared/helpers/random.js';
import { TIRES } from '../../shared/constants/tires.js';
import { rebuildGlobalInv, getStorageCap } from '../../shared/helpers/inventory.js';

const router = Router();

/**
 * Direct P2P Trading — NO ESCROW, NO SAFEGUARDS
 *
 * Trade flow:
 * 1. Sender creates offer: "I'll send X tires for $Y" or "I'll wire $Y for X tires"
 * 2. Receiver accepts the offer
 * 3. Each party must independently fulfill:
 *    - Sender ships tires (or wires cash, depending on offer type)
 *    - Receiver wires cash (or ships tires)
 * 4. If either party doesn't fulfill, the other is out of luck.
 *    The marketplace is the safe option.
 *
 * Status flow: pending → accepted → (senderFulfilled/receiverFulfilled) → completed | disputed
 */

// GET /api/trade — list trades involving the current player
router.get('/', authMiddleware, async (req, res) => {
  try {
    const trades = await getDirectTrades({ playerId: req.playerId });
    res.json(trades);
  } catch (err) {
    console.error('GET /api/trade error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/trade/offer — create a new trade offer
router.post('/offer', authMiddleware, async (req, res) => {
  try {
    const { receiverId, offerType, tireType, qty, cashAmount } = req.body;

    if (!receiverId) return res.status(400).json({ error: 'Receiver player ID required' });
    if (receiverId === req.playerId) return res.status(400).json({ error: 'Cannot trade with yourself' });

    const receiver = await getPlayer(receiverId);
    if (!receiver) return res.status(400).json({ error: 'Receiver not found' });

    const sender = await getPlayer(req.playerId);
    if (!sender) return res.status(404).json({ error: 'Player not found' });
    const sg = sender.game_state;

    // offerType: 'sellTires', 'buyTires', 'revShare', or 'tradeTireCoins'
    if (!['sellTires', 'buyTires', 'revShare', 'tradeTireCoins'].includes(offerType)) {
      return res.status(400).json({ error: 'offerType must be sellTires, buyTires, revShare, or tradeTireCoins' });
    }

    // Revenue share offers don't need tires
    if (offerType === 'revShare') {
      const { upfrontCash, revSharePct, revShareDays } = req.body;
      const upfront = Math.floor(Number(upfrontCash) || 0);
      const pct = Math.max(0.01, Math.min(0.50, Number(revSharePct) || 0.05));
      const days = Math.max(7, Math.min(365, Math.floor(Number(revShareDays) || 30)));

      const trade = {
        id: uid(),
        senderId: req.playerId,
        senderName: sg.companyName || sg.name || 'Unknown',
        receiverId,
        receiverName: receiver.game_state.companyName || receiver.game_state.name || 'Unknown',
        offerType: 'revShare',
        upfrontCash: upfront,
        revSharePct: pct,
        revShareDays: days,
        status: 'pending',
        senderFulfilled: false,
        receiverFulfilled: false,
        createdAt: Date.now(),
      };
      await addDirectTrade(trade);
      return res.json({ ok: true, trade });
    }

    // TC trading: sender sends TireCoins, receiver sends cash
    if (offerType === 'tradeTireCoins') {
      const { tcAmount, cashAmount: tcCash } = req.body;
      const tc = Math.max(1, Math.floor(Number(tcAmount) || 0));
      const cash = Math.max(1, Math.floor(Number(tcCash) || 0));
      if ((sg.tireCoins || 0) < tc) return res.status(400).json({ error: 'Not enough TireCoins' });

      const trade = {
        id: uid(),
        senderId: req.playerId,
        senderName: sg.companyName || sg.name || 'Unknown',
        receiverId,
        receiverName: receiver.game_state.companyName || receiver.game_state.name || 'Unknown',
        offerType: 'tradeTireCoins',
        tcAmount: tc,
        cashAmount: cash,
        status: 'pending',
        senderFulfilled: false,
        receiverFulfilled: false,
        createdAt: Date.now(),
      };
      await addDirectTrade(trade);
      return res.json({ ok: true, trade });
    }

    if (!TIRES[tireType]) return res.status(400).json({ error: 'Invalid tire type' });
    const tradeQty = Math.floor(Number(qty));
    if (!tradeQty || tradeQty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    const cash = Math.floor(Number(cashAmount));
    if (!cash || cash <= 0) return res.status(400).json({ error: 'Invalid cash amount' });

    // Basic validation — sender must have what they're offering
    if (offerType === 'sellTires') {
      const totalStock = (sg.warehouseInventory?.[tireType] || 0) +
        (sg.locations || []).reduce((a, l) => a + (l.inventory?.[tireType] || 0), 0);
      if (totalStock < tradeQty) return res.status(400).json({ error: 'Not enough tires in stock' });
    } else {
      if (sg.cash < cash) return res.status(400).json({ error: 'Not enough cash' });
    }

    const trade = {
      id: uid(),
      senderId: req.playerId,
      senderName: sg.companyName || sg.name || 'Unknown',
      receiverId,
      receiverName: receiver.game_state.companyName || receiver.game_state.name || 'Unknown',
      offerType,
      tireType,
      qty: tradeQty,
      cashAmount: cash,
      status: 'pending',
      senderFulfilled: false,
      receiverFulfilled: false,
      createdAt: Date.now(),
    };

    await addDirectTrade(trade);
    res.json({ ok: true, trade });
  } catch (err) {
    console.error('POST /api/trade/offer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/trade/accept — receiver accepts a pending trade
router.post('/accept', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    const trade = await getDirectTradeById(tradeId);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.receiverId !== req.playerId) return res.status(403).json({ error: 'Not the receiver' });
    if (trade.status !== 'pending') return res.status(400).json({ error: 'Trade is not pending' });

    trade.status = 'accepted';
    await updateDirectTrade(tradeId, trade);
    res.json({ ok: true, trade });
  } catch (err) {
    console.error('POST /api/trade/accept error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/trade/decline — receiver declines a pending trade
router.post('/decline', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    const trade = await getDirectTradeById(tradeId);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.receiverId !== req.playerId) return res.status(403).json({ error: 'Not the receiver' });
    if (trade.status !== 'pending') return res.status(400).json({ error: 'Trade is not pending' });

    trade.status = 'declined';
    await updateDirectTrade(tradeId, trade);
    res.json({ ok: true, trade });
  } catch (err) {
    console.error('POST /api/trade/decline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/trade/cancel — sender cancels a pending trade
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    const trade = await getDirectTradeById(tradeId);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.senderId !== req.playerId) return res.status(403).json({ error: 'Not the sender' });
    if (trade.status !== 'pending') return res.status(400).json({ error: 'Trade is not pending' });

    trade.status = 'cancelled';
    await updateDirectTrade(tradeId, trade);
    res.json({ ok: true, trade });
  } catch (err) {
    console.error('POST /api/trade/cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/trade/fulfill — a party fulfills their side (wire cash or ship tires)
// THIS IS THE RISKY PART — no escrow, no protection
router.post('/fulfill', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    const trade = await getDirectTradeById(tradeId);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.status !== 'accepted') return res.status(400).json({ error: 'Trade must be accepted first' });

    const isSender = trade.senderId === req.playerId;
    const isReceiver = trade.receiverId === req.playerId;
    if (!isSender && !isReceiver) return res.status(403).json({ error: 'Not a party to this trade' });

    if (isSender && trade.senderFulfilled) return res.status(400).json({ error: 'Already fulfilled' });
    if (isReceiver && trade.receiverFulfilled) return res.status(400).json({ error: 'Already fulfilled' });

    const player = await getPlayer(req.playerId);
    const g = player.game_state;

    // Handle revenue share trades
    if (trade.offerType === 'revShare') {
      // Receiver accepts: pays upfront cash to sender, sets up rev share on receiver
      if (isReceiver && !trade.receiverFulfilled) {
        if (g.cash < (trade.upfrontCash || 0)) return res.status(400).json({ error: 'Not enough cash for upfront payment' });
        // Pay upfront
        if (trade.upfrontCash > 0) {
          g.cash -= trade.upfrontCash;
          const sender = await getPlayer(trade.senderId);
          if (sender) {
            sender.game_state.cash += trade.upfrontCash;
            sender.game_state.log = sender.game_state.log || [];
            sender.game_state.log.push(`Received $${trade.upfrontCash.toLocaleString()} upfront from rev share deal with ${g.companyName || g.name}`);
            await savePlayerState(trade.senderId, sender.game_state);
          }
        }
        // Set up rev share entry on the receiver (they pay % of daily rev to sender)
        if (!g.tradeRevShares) g.tradeRevShares = [];
        g.tradeRevShares.push({
          partnerId: trade.senderId,
          partnerName: trade.senderName,
          revSharePct: trade.revSharePct,
          daysLeft: trade.revShareDays,
          startDay: g.day || 0,
        });
        trade.receiverFulfilled = true;
        trade.senderFulfilled = true; // auto-complete both sides
        trade.status = 'completed';
        g.log = g.log || [];
        g.log.push(`Rev share deal: paying ${Math.round(trade.revSharePct * 100)}% revenue to ${trade.senderName} for ${trade.revShareDays} days`);
      }
      await updateDirectTrade(tradeId, trade);
      await savePlayerState(req.playerId, g);
      return res.json({ ok: true, trade });
    }

    // Handle TC trades
    if (trade.offerType === 'tradeTireCoins') {
      if (isReceiver && !trade.receiverFulfilled) {
        // Receiver pays cash to sender
        if (g.cash < trade.cashAmount) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= trade.cashAmount;
        const sender = await getPlayer(trade.senderId);
        if (sender) {
          sender.game_state.cash += trade.cashAmount;
          // Sender sends TC to receiver
          if ((sender.game_state.tireCoins || 0) < trade.tcAmount) {
            g.cash += trade.cashAmount; // refund
            return res.status(400).json({ error: 'Sender no longer has enough TireCoins' });
          }
          sender.game_state.tireCoins -= trade.tcAmount;
          g.tireCoins = (g.tireCoins || 0) + trade.tcAmount;
          sender.game_state.log = sender.game_state.log || [];
          sender.game_state.log.push({ msg: `Traded ${trade.tcAmount} TC to ${g.companyName || g.name} for $${trade.cashAmount.toLocaleString()}`, cat: 'event' });
          await savePlayerState(trade.senderId, sender.game_state);
        }
        g.log = g.log || [];
        g.log.push({ msg: `Bought ${trade.tcAmount} TC from ${trade.senderName} for $${trade.cashAmount.toLocaleString()}`, cat: 'event' });
        trade.senderFulfilled = true;
        trade.receiverFulfilled = true;
        trade.status = 'completed';
      }
      await updateDirectTrade(tradeId, trade);
      await savePlayerState(req.playerId, g);
      return res.json({ ok: true, trade });
    }

    // Determine what this party needs to send
    // sellTires: sender sends tires, receiver sends cash
    // buyTires: sender sends cash, receiver sends tires
    const sendsTheTires = (trade.offerType === 'sellTires' && isSender) ||
                          (trade.offerType === 'buyTires' && isReceiver);
    const sendsTheCash = !sendsTheTires;

    if (sendsTheCash) {
      // Wire cash — deducted from this player, added to the other
      if (g.cash < trade.cashAmount) return res.status(400).json({ error: 'Not enough cash' });

      const otherId = isSender ? trade.receiverId : trade.senderId;
      const other = await getPlayer(otherId);
      if (!other) return res.status(400).json({ error: 'Other player not found' });

      g.cash -= trade.cashAmount;
      other.game_state.cash += trade.cashAmount;
      other.game_state.log = other.game_state.log || [];
      other.game_state.log.push(`Received $${trade.cashAmount.toLocaleString()} wire from ${g.companyName || g.name}`);
      await savePlayerState(otherId, other.game_state);

      g.log = g.log || [];
      g.log.push(`Wired $${trade.cashAmount.toLocaleString()} to ${isSender ? trade.receiverName : trade.senderName}`);
    } else {
      // Ship tires — deducted from this player, added to the other
      const totalStock = (g.warehouseInventory?.[trade.tireType] || 0) +
        (g.locations || []).reduce((a, l) => a + (l.inventory?.[trade.tireType] || 0), 0);
      if (totalStock < trade.qty) return res.status(400).json({ error: 'Not enough tires' });

      // Pull from warehouse first, then locations
      let remaining = trade.qty;
      if (g.warehouseInventory?.[trade.tireType] > 0) {
        const take = Math.min(g.warehouseInventory[trade.tireType], remaining);
        g.warehouseInventory[trade.tireType] -= take;
        remaining -= take;
      }
      for (const loc of (g.locations || [])) {
        if (remaining <= 0) break;
        if (!loc.inventory?.[trade.tireType]) continue;
        const take = Math.min(loc.inventory[trade.tireType], remaining);
        loc.inventory[trade.tireType] -= take;
        remaining -= take;
      }
      rebuildGlobalInv(g);

      // Add to other player
      const otherId = isSender ? trade.receiverId : trade.senderId;
      const other = await getPlayer(otherId);
      if (other) {
        const og = other.game_state;
        if (!og.warehouseInventory) og.warehouseInventory = {};
        og.warehouseInventory[trade.tireType] = (og.warehouseInventory[trade.tireType] || 0) + trade.qty;
        rebuildGlobalInv(og);
        og.log = og.log || [];
        og.log.push(`Received ${trade.qty} ${TIRES[trade.tireType]?.n || trade.tireType} shipment from ${g.companyName || g.name}`);
        await savePlayerState(otherId, og);
      }

      g.log = g.log || [];
      g.log.push(`Shipped ${trade.qty} ${TIRES[trade.tireType]?.n || trade.tireType} to ${isSender ? trade.receiverName : trade.senderName}`);
    }

    // Mark this party as fulfilled
    if (isSender) trade.senderFulfilled = true;
    if (isReceiver) trade.receiverFulfilled = true;

    // If both parties fulfilled, mark as completed
    if (trade.senderFulfilled && trade.receiverFulfilled) {
      trade.status = 'completed';
    }

    await updateDirectTrade(tradeId, trade);
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, trade });
  } catch (err) {
    console.error('POST /api/trade/fulfill error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
