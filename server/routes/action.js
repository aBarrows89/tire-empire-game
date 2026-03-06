import { Router } from 'express';
import { getPlayer, savePlayerState, getGame, saveGame, addShopSaleListing, removeShopSaleListing, getShopSaleListings, withPlayerLock, VersionConflictError, createPlayerContract, updatePlayerContract, addDM } from '../db/queries.js';
import { authMiddleware } from '../middleware/auth.js';
import { NODE_ENV } from '../config.js';
import { trackEvent } from '../analytics/tracker.js';
import { actionBodySchema, ACTION_SCHEMAS } from '../validation/actionSchemas.js';

import { handlePricing } from './actions/pricing.js';
import { handleSourcing } from './actions/sourcing.js';
import { handleStorage } from './actions/storage.js';
import { handleShop } from './actions/shop.js';
import { handleFranchise } from './actions/franchise.js';
import { handleBank } from './actions/bank.js';
import { handleWholesale } from './actions/wholesale.js';
import { handleEcommerce } from './actions/ecommerce.js';
import { handleFactory } from './actions/factory.js';
import { handleContracts } from './actions/contracts.js';
import { handleShopMarket } from './actions/shopMarket.js';
import { handleMisc } from './actions/misc.js';

const router = Router();

const handlers = [
  handlePricing,
  handleSourcing,
  handleStorage,
  handleShop,
  handleBank,
  handleWholesale,
  handleEcommerce,
  handleFactory,
  handleContracts,
  handleShopMarket,
  handleMisc,
  handleFranchise,
];

// POST /api/action — player actions (serialized per-player to prevent race conditions)
router.post('/', authMiddleware, async (req, res) => {
  // Validate top-level body structure
  const bodyResult = actionBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: bodyResult.error.issues });
  }

  const { action, ...rawParams } = bodyResult.data;

  // Validate action-specific params
  const paramSchema = ACTION_SCHEMAS[action];
  if (paramSchema) {
    const paramResult = paramSchema.safeParse(rawParams);
    if (!paramResult.success) {
      return res.status(400).json({ error: `Invalid params for ${action}`, details: paramResult.error.issues });
    }
  }

  try {
    await withPlayerLock(req.playerId, async () => {
      const player = await getPlayer(req.playerId);
      if (!player) return res.status(404).json({ error: 'Player not found' });
      const playerVersion = player.version || 0;

      let g = { ...player.game_state };
      const params = paramSchema ? paramSchema.parse(rawParams) : rawParams;
      g.log = g.log || [];

      // Block all actions while on vacation, except cancelling
      if (g.paused && g.vacationUntil && action !== 'cancelVacation') {
        const remaining = Math.max(0, g.vacationUntil - Date.now());
        const hours = Math.ceil(remaining / (60 * 60 * 1000));
        return res.status(403).json({
          error: `On vacation (${hours}h remaining). Cancel vacation first.`,
          code: 'ON_VACATION',
          vacationUntil: g.vacationUntil,
        });
      }

      let failed = false;
      const ctx = {
        fail: (msg) => {
          failed = true;
          res.status(400).json({ error: msg });
        },
        playerId: req.playerId,
        NODE_ENV,
        getGame,
        getPlayer,
        savePlayerState,
        saveGame,
        addShopSaleListing,
        removeShopSaleListing,
        getShopSaleListings,
        createPlayerContract,
        updatePlayerContract,
        addDM,
        trackEvent,
      };

      let result = null;
      for (const handler of handlers) {
        result = await handler(action, params, g, ctx);
        if (failed) return;
        if (result !== null) break;
      }

      if (result === null) {
        return res.status(400).json({ error: `Unknown action: ${action}` });
      }

      g = result;
      // Stamp any unstamped log entries with the correct calendar day
      const calDay = (g.day || 0) + (g.startDay || 1) - 1;
      g.log = (g.log || []).map(l => {
        if (typeof l === 'string') return { msg: l, cat: 'other', day: calDay };
        return l.day ? l : { ...l, day: calDay };
      });
      await savePlayerState(req.playerId, g, playerVersion);
      trackEvent(req.playerId, 'action_performed', { action });
      res.json({ ok: true, state: g });
    }); // end withPlayerLock
  } catch (err) {
    if (err instanceof VersionConflictError) {
      console.warn('Version conflict (retrying client-side):', err.message);
      return res.status(409).json({ error: 'State changed, please retry', code: 'VERSION_CONFLICT' });
    }
    console.error('POST /api/action error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
