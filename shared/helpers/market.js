import { CITIES } from '../constants/cities.js';

export function getCitySlots(city) {
  const total = city.mx;
  const playerReserved = Math.max(2, Math.ceil(total * .3));
  const aiMax = total - playerReserved;
  const perPlayerCap = Math.max(2, Math.floor(total * .4));
  return { total, playerReserved, aiMax, perPlayerCap };
}

export function getCityOccupancy(g, cityId) {
  const aiCount = g.aiShops.filter(s => s.cityId === cityId).length;
  const playerCount = g.locations.filter(l => l.cityId === cityId).length;
  const city = CITIES.find(c => c.id === cityId);
  const slots = city ? getCitySlots(city) : { total: 5, playerReserved: 2, aiMax: 3, perPlayerCap: 1 };
  const openForPlayers = Math.max(0, slots.total - aiCount - playerCount);
  const playerAtCap = playerCount >= slots.perPlayerCap;
  const marketFull = aiCount + playerCount >= slots.total;
  const saturation = Math.min(1, (aiCount + playerCount) / Math.max(1, slots.total));
  return { aiCount, playerCount, total: aiCount + playerCount, openForPlayers, playerAtCap, marketFull, saturation, slots };
}

export function canOpenInCity(g, cityId) {
  const occ = getCityOccupancy(g, cityId);
  if (occ.playerAtCap) return { ok: false, reason: `You already have ${occ.playerCount} shop${occ.playerCount > 1 ? "s" : ""} here (max ${occ.slots.perPlayerCap} per player)` };
  if (occ.marketFull) return { ok: false, reason: `${CITIES.find(c => c.id === cityId)?.name || "City"} market is full (${occ.total}/${occ.slots.total} shops)` };
  return { ok: true };
}
