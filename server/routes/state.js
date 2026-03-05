import { Router } from 'express';
import { getPlayer, createPlayer, isCompanyNameTaken, getGame } from '../db/queries.js';
import { init } from '../engine/init.js';
import { authMiddleware } from '../middleware/auth.js';
import { trackEvent } from '../analytics/tracker.js';
import { pool } from '../db/pool.js';

const router = Router();

// ── Profanity filter ──
const PROFANE_WORDS = [
  'fuck', 'shit', 'bitch', 'dick', 'cock', 'pussy', 'cunt',
  'nigger', 'nigga', 'fag', 'faggot', 'retard', 'slut', 'whore',
  'bastard', 'piss', 'penis', 'vagina', 'porn',
  'nazi', 'hitler', 'rape', 'molest', 'pedophile',
  'kike', 'spic', 'chink', 'wetback', 'beaner', 'tranny',
];

function containsProfanity(text) {
  const lower = text.toLowerCase();
  return PROFANE_WORDS.some(word => new RegExp(`\\b${word}\\b`, 'i').test(lower));
}

// GET /api/state — current player game state
router.get('/', authMiddleware, async (req, res) => {
  try {
    let player = await getPlayer(req.playerId);

    if (!player) {
      // Auto-create new player with default state
      const game = await getGame();
      const globalDay = game?.day || game?.week || 1;
      const state = init('Player', globalDay);
      state.id = req.playerId;
      player = await createPlayer(req.playerId, state.name, state);
    }

    trackEvent(req.playerId, 'session_start', { day: player.game_state?.day });
    // Attach dynamic supplier pricing from game economy
    const game = await getGame();
    if (game?.economy?.supplierPricing) {
      player.game_state._supplierPricing = game.economy.supplierPricing;
    }
    if (game?.economy?.supplierPrices) {
      player.game_state._supplierPrices = game.economy.supplierPrices;
    }
    if (game?.economy?.commodities) {
      player.game_state._commodities = game.economy.commodities;
    }
    if (game?.economy?.bankRate != null) {
      player.game_state._bankRate = game.economy.bankRate;
      player.game_state._loanRateMult = game.economy.loanRateMult;
      player.game_state._rateHistory = game.economy.rateHistory;
      player.game_state._bankState = game.economy.bankState;
    }
    if (game?.economy?.inflationIndex != null) {
      player.game_state._inflationIndex = game.economy.inflationIndex;
    }
    res.json(player.game_state);
  } catch (err) {
    console.error('GET /api/state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/state/check-referral/:code — validate referral code before registration
router.get('/check-referral/:code', async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const { rows } = await pool.query(
      'SELECT code, perks, max_uses, current_uses, active FROM referral_codes WHERE UPPER(code) = $1',
      [code]
    );
    if (!rows.length || !rows[0].active) {
      return res.json({ valid: false });
    }
    const ref = rows[0];
    if (ref.max_uses > 0 && ref.current_uses >= ref.max_uses) {
      return res.json({ valid: false });
    }
    // Return perks but strip internal details
    const perks = typeof ref.perks === 'string' ? JSON.parse(ref.perks) : (ref.perks || {});
    res.json({ valid: true, perks });
  } catch (err) {
    console.error('GET /check-referral error:', err);
    res.json({ valid: false });
  }
});

// POST /api/state/register — set player and company name
router.post('/register', authMiddleware, async (req, res) => {
  try {
    const { playerName, companyName, referralCode } = req.body;
    if (!playerName || !companyName) {
      return res.status(400).json({ error: 'playerName and companyName are required' });
    }

    if (companyName.length < 2 || companyName.length > 30) {
      return res.status(400).json({ error: 'Company name must be 2-30 characters' });
    }

    if (containsProfanity(companyName) || containsProfanity(playerName)) {
      return res.status(400).json({ error: 'Name contains inappropriate language' });
    }

    const taken = await isCompanyNameTaken(companyName, req.playerId);
    if (taken) {
      return res.status(400).json({ error: 'Company name is already taken' });
    }

    // Validate referral code if provided
    let referralPerks = null;
    if (referralCode) {
      const code = referralCode.trim().toUpperCase();
      const { rows } = await pool.query(
        'SELECT code, perks, max_uses, current_uses, active FROM referral_codes WHERE UPPER(code) = $1',
        [code]
      );
      if (rows.length && rows[0].active) {
        const ref = rows[0];
        if (ref.max_uses === 0 || ref.current_uses < ref.max_uses) {
          referralPerks = typeof ref.perks === 'string' ? JSON.parse(ref.perks) : (ref.perks || {});
          // Increment usage and record event
          await pool.query('UPDATE referral_codes SET current_uses = current_uses + 1 WHERE code = $1', [ref.code]);
          await pool.query(
            'INSERT INTO referral_events (code, player_id, event_type) VALUES ($1, $2, $3)',
            [ref.code, req.playerId, 'signup']
          );
        }
      }
    }

    let player = await getPlayer(req.playerId);

    if (!player) {
      const game = await getGame();
      const globalDay = game?.day || game?.week || 1;
      const state = init(playerName, globalDay);
      state.id = req.playerId;
      state.companyName = companyName;
      applyReferralPerks(state, referralPerks, globalDay);
      player = await createPlayer(req.playerId, playerName, state);
    } else {
      const oldState = player.game_state;
      // If player had no company name, this is a fresh registration — reset their state
      if (!oldState.companyName) {
        const game = await getGame();
        const globalDay = game?.day || game?.week || 1;
        const fresh = init(playerName, globalDay);
        fresh.id = oldState.id || req.playerId;
        fresh.companyName = companyName;
        fresh.tutorialStep = oldState.tutorialStep || 0;
        fresh.tutorialDone = oldState.tutorialDone || false;
        applyReferralPerks(fresh, referralPerks, globalDay);
        const { savePlayerState } = await import('../db/queries.js');
        await savePlayerState(req.playerId, fresh);
        player.game_state = fresh;
      } else {
        // Update existing player's names (no referral perks for name changes)
        const g = { ...oldState };
        g.name = playerName;
        g.companyName = companyName;
        const { savePlayerState } = await import('../db/queries.js');
        await savePlayerState(req.playerId, g);
        player.game_state = g;
      }
    }

    // Immediately update leaderboard with correct name
    const g = player.game_state;
    const { upsertLeaderboard } = await import('../db/queries.js');
    const { getWealth } = await import('../../shared/helpers/wealth.js');
    await upsertLeaderboard(
      req.playerId,
      g.companyName || g.name || 'Unknown',
      getWealth(g),
      g.reputation || 0,
      (g.locations || []).length,
      g.day || 1
    );

    res.json(g);
  } catch (err) {
    console.error('POST /api/state/register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Apply referral perks to a fresh player state.
 */
function applyReferralPerks(state, perks, currentDay) {
  if (!perks || Object.keys(perks).length === 0) return;

  if (perks.bonusCash) state.cash += perks.bonusCash;
  if (perks.bonusTireCoins) state.tireCoins = (state.tireCoins || 0) + perks.bonusTireCoins;
  if (perks.freeStorageSlots) state.warehouseCapacity = (state.warehouseCapacity || 500) + perks.freeStorageSlots;

  if (perks.premiumDays) {
    state.premium = true;
    state.premiumExpiresDay = currentDay + perks.premiumDays;
  }

  // Time-limited boosts
  if (!state._activeBoosts) state._activeBoosts = {};
  if (perks.repBoost) {
    state._activeBoosts.rep = {
      multiplier: perks.repBoost.multiplier,
      expiresDay: currentDay + (perks.repBoost.days || 14),
    };
  }
  if (perks.revenueBoost) {
    state._activeBoosts.revenue = {
      multiplier: perks.revenueBoost.multiplier,
      expiresDay: currentDay + (perks.revenueBoost.days || 14),
    };
  }

  if (perks.customWelcomeMessage) {
    state._referralWelcome = perks.customWelcomeMessage;
  }

  state._referralApplied = true;
}

export default router;
