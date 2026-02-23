import { CITIES } from '../constants/cities.js';

export function mileDist(a, b) {
  const D = Math.PI / 180;
  const d = Math.sin((b.lat - a.lat) * D / 2) ** 2 +
    Math.cos(a.lat * D) * Math.cos(b.lat * D) *
    Math.sin((b.lng - a.lng) * D / 2) ** 2;
  return 3959 * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(1 - d));
}

export function findNearestCity(lat, lng) {
  let best = null, bestDist = Infinity;
  for (const c of CITIES) {
    const d = mileDist({ lat, lng }, { lat: c.lat, lng: c.lng });
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return { city: best, dist: Math.round(bestDist) };
}
