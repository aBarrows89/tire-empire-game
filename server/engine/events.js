import { R } from '../../shared/helpers/format.js';
import { C } from '../../shared/helpers/format.js';

/**
 * Event effect handlers — indexed to match shared/constants/events.js order.
 * Each fn takes game state g and returns new state (immutable).
 */
export const EVENT_HANDLERS = [
  // 🌨️ Storm! Winter surge!
  (g) => ({ ...g, _wB: 3 }),

  // 🕳️ Pothole season!
  (g) => ({ ...g, _tB: 1.4 }),

  // 📦 Shipping +15%
  (g) => ({ ...g, _cM: 1.15 }),

  // ⭐ Good review!
  (g) => ({ ...g, _tB: 1.2 }),

  // 🔧 Tech quit!
  (g) => g.staff.techs > 0
    ? { ...g, staff: { ...g.staff, techs: g.staff.techs - 1 } }
    : g,

  // 💰 Fleet inquiry!
  (g) => ({
    ...g,
    _fO: {
      name: ["CityTransit", "DeliveryCo", "SchoolBus", "TaxiFleet"][R(0, 3)],
      qty: 20 + R(0, 40),
      pr: 55 + R(0, 35),
    },
  }),

  // ⚠️ Recall!
  (g) => ({
    ...g,
    cash: g.cash - Math.min(g.cash * .04, 3000),
    reputation: Math.max(0, g.reputation - 1),
  }),

  // 📉 Recession — used up
  (g) => ({ ...g, _uB: 1.6 }),

  // 🎉 Vendor rebate 12%!
  (g) => ({ ...g, _vR: .12 }),

  // 🔥 Competitor closed!
  (g) => ({ ...g, _tB: 1.5, reputation: C(g.reputation + 1, 0, 100) }),

  // 💸 Chargeback $450
  (g) => ({ ...g, cash: g.cash - 450 }),

  // 📱 Bad review
  (g) => ({ ...g, reputation: Math.max(0, g.reputation - 1.5), _tB: .85 }),

  // 🏥 Workers comp
  (g) => ({ ...g, cash: g.cash - 2500 }),

  // 🚔 Junk tire fine!
  (g) => {
    const j = g.inventory.used_junk || 0;
    return j > 10
      ? { ...g, cash: g.cash - j * 5, reputation: Math.max(0, g.reputation - 2) }
      : g;
  },
];
