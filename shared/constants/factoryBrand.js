/**
 * Factory Brand System Constants
 * Raw materials, discount tiers, R&D projects, certifications, shipping, Vinnie schemes
 */

export const RAW_MATERIALS = {
  rubber:    { base: 1.0, min: 0.7,  max: 1.4,  volatility: 0.05 },
  steel:     { base: 1.0, min: 0.75, max: 1.35, volatility: 0.04 },
  chemicals: { base: 1.0, min: 0.8,  max: 1.3,  volatility: 0.03 },
};

export const LINE_SWITCH_DAYS = 1;

export const FACTORY_DISCOUNT_TIERS_DEFAULT = [
  { min: 0,    disc: 0,    label: 'Standard' },
  { min: 50,   disc: 0.03, label: 'Bronze' },
  { min: 200,  disc: 0.06, label: 'Silver' },
  { min: 500,  disc: 0.10, label: 'Gold' },
  { min: 2000, disc: 0.15, label: 'Platinum' },
];

export const RD_PROJECTS = [
  { id: 'ultraGrip',      name: 'Ultra-Grip Compound',       cost: 500000,  days: 30, qualityBoost: 0.03 },
  { id: 'silentRide',     name: 'Silent Ride Technology',    cost: 750000,  days: 45, qualityBoost: 0.04 },
  { id: 'evOptimized',    name: 'EV Range Optimized',        cost: 1000000, days: 60, unlocksExclusive: 'brand_evPremium' },
  { id: 'commercialHD',   name: 'Heavy-Duty Commercial',     cost: 1200000, days: 60, unlocksExclusive: 'brand_commercialHD' },
  { id: 'allTerrainElite', name: 'All-Terrain Elite',        cost: 800000,  days: 45, unlocksExclusive: 'brand_allTerrainElite' },
];

export const CERTIFICATIONS = [
  { id: 'dot_basic', name: 'DOT Compliance',  cost: 100000, days: 14, repBoost: 5 },
  { id: 'speed_h',   name: 'H Speed Rating',  cost: 250000, days: 21, repBoost: 8,  qualityReq: 0.90 },
  { id: 'speed_v',   name: 'V Speed Rating',  cost: 500000, days: 30, repBoost: 12, qualityReq: 0.95 },
  { id: 'iso_9001',  name: 'ISO 9001',        cost: 400000, days: 45, repBoost: 15, qualityReq: 0.88 },
];

export const SHIPPING_ZONES = [
  { id: 'local',    maxDist: 200,  costPerTire: 3,  deliveryDays: 1 },
  { id: 'regional', maxDist: 800,  costPerTire: 6,  deliveryDays: 2 },
  { id: 'national', maxDist: 9999, costPerTire: 10, deliveryDays: 4 },
];

export const VINNIE_SCHEMES = [
  { id: 'vintage_military', name: 'Vintage Military Surplus',   tireCost: 85,  qty: [200, 500],  sellRate: 0.02, desc: '"These will sell like BOMBS to China, kid!"' },
  { id: 'nascar_rejects',   name: 'NASCAR Reject Lot',          tireCost: 120, qty: [100, 300],  sellRate: 0.05, desc: '"Dale Jr himself touched these tires!"' },
  { id: 'arctic_expedition', name: 'Arctic Expedition Tires',   tireCost: 95,  qty: [150, 400],  sellRate: 0.03, desc: '"Antarctica is opening up, trust me!"' },
  { id: 'gold_rimmed',      name: 'Gold-Rimmed Show Tires',     tireCost: 200, qty: [50, 150],   sellRate: 0.01, desc: '"Rappers are gonna EAT these up!"' },
  { id: 'surplus_army',     name: 'Decommissioned Humvee Tires', tireCost: 65, qty: [300, 800],  sellRate: 0.04, desc: '"The preppers market is HUGE right now!"' },
  { id: 'retro_whitewalls', name: 'Retro Whitewall Collection', tireCost: 110, qty: [100, 250],  sellRate: 0.06, desc: '"Classic car guys pay TOP dollar for these!"' },
];

/** Exclusive tire definitions unlocked by R&D */
export const EXCLUSIVE_TIRES = {
  brand_evPremium:       { n: 'EV Premium',         baseCost: 95,  def: 260, lo: 180, hi: 380 },
  brand_commercialHD:    { n: 'Commercial HD',      baseCost: 120, def: 310, lo: 220, hi: 450 },
  brand_allTerrainElite: { n: 'All-Terrain Elite',   baseCost: 85,  def: 220, lo: 150, hi: 330 },
};

/** CFO staff role — blocks Vinnie schemes 50% of the time */
export const CFO_ROLE = {
  salary: 8000,
  label: 'CFO',
  max: 1,
  vinnieBlockChance: 0.50,
};
