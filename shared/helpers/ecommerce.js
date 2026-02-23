import { ECOM_TIERS } from '../constants/ecommerce.js';

export function getEcomTier(totalSpent) {
  let best = ECOM_TIERS[0];
  for (const t of ECOM_TIERS) {
    if (totalSpent >= t.min) best = t;
  }
  return best;
}
