export const SHOP_BASE = 137500;
export const SHOP_MO = 7000;

/** Cost to open a shop in a given city (varies by city cost multiplier) */
export function shopCost(city) {
  return Math.round(SHOP_BASE * (city?.cost || 1));
}

/** Weekly rent for a shop in a given city */
export function shopRent(city) {
  return Math.round(SHOP_MO * (city?.cost || 1) / 4);
}
