import { R } from '../../shared/helpers/format.js';
import { uid } from '../../shared/helpers/random.js';
import { GOV_TYPES } from '../../shared/constants/govTypes.js';
import { TIRES } from '../../shared/constants/tires.js';
import { CITIES } from '../../shared/constants/cities.js';

/**
 * Generate a government contract bid opportunity.
 */
export function genGovBid(g) {
  // Filter to gov types the player qualifies for
  const eligible = GOV_TYPES.filter(
    gt => g.reputation >= gt.minRep && g.locations.length >= gt.minLocs
  );
  if (eligible.length === 0) return null;

  const gt = eligible[R(0, eligible.length - 1)];
  const qty = R(gt.qtyMin, gt.qtyMax);
  const tire = gt.tires[R(0, gt.tires.length - 1)];
  const t = TIRES[tire];
  const pricePerTire = Math.round(t.bMax * 1.1 + R(0, 10));

  // Pick a random city from player's location states
  const playerStates = [...new Set(g.locations.map(l => {
    const city = CITIES.find(c => c.id === l.cityId);
    return city?.state;
  }).filter(Boolean))];

  const state = playerStates.length > 0
    ? playerStates[R(0, playerStates.length - 1)]
    : "PA";

  return {
    id: uid(),
    type: gt.type,
    name: gt.name,
    ic: gt.ic,
    tire,
    qty,
    pricePerTire,
    dur: gt.dur,
    state,
    weeksLeft: gt.dur,
    delivered: 0,
    weeklyTarget: Math.ceil(qty / gt.dur),
  };
}
