export function fmt(n) {
  if (n < 0) return `-${fmt(-n)}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.floor(n).toLocaleString()}`;
}

export function R(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

export function Rf(a, b) {
  return Math.random() * (b - a) + a;
}

export function C(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
