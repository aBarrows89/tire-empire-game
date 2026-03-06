/**
 * Global Market Events — economy-wide events that affect all players.
 * Triggered ~2% daily per event, max 2 concurrent.
 */

export const GLOBAL_EVENTS = [
  {
    id: 'rubber_shortage',
    name: 'Rubber Shortage',
    icon: '\u{1F6A8}',
    durationMin: 10,
    durationMax: 14,
    effects: { rubberIndexMod: 0.40, productionCostMult: 1.20 },
    description: 'Global rubber supply disrupted. Raw rubber costs surge.',
  },
  {
    id: 'port_strike',
    name: 'Port Strike',
    icon: '\u{1F6A2}',
    durationMin: 7,
    durationMax: 10,
    effects: { supplierDisabled: true, importDeliveryAdd: 5 },
    description: 'Port workers on strike. Import deliveries delayed.',
  },
  {
    id: 'winter_storm',
    name: 'Winter Storm Warning',
    icon: '\u{2744}\uFE0F',
    durationMin: 5,
    durationMax: 7,
    effects: { winterDemandMult: 1.80, shippingCostMult: 1.50 },
    description: 'Severe winter storm incoming. Winter tire demand surges.',
  },
  {
    id: 'economic_boom',
    name: 'Economic Boom',
    icon: '\u{1F4C8}',
    durationMin: 14,
    durationMax: 21,
    effects: { demandMult: 1.25, priceBoostPct: 0.10 },
    description: 'Economy booming. All tire demand and prices increase.',
  },
  {
    id: 'steel_surplus',
    name: 'Steel Surplus',
    icon: '\u{1F3D7}\uFE0F',
    durationMin: 10,
    durationMax: 14,
    effects: { steelIndexMod: -0.30, productionCostMult: 0.85 },
    description: 'Steel market flooded. Production costs drop.',
  },
  {
    id: 'safety_recall',
    name: 'Tire Safety Recall',
    icon: '\u{26A0}\uFE0F',
    durationMin: 7,
    durationMax: 10,
    effects: { brandedDemandMult: 0.70, usedDemandMult: 1.40 },
    description: 'Major brand recall shakes consumer confidence. Used tire demand spikes.',
  },
  {
    id: 'ev_mandate',
    name: 'EV Mandate',
    icon: '\u{26A1}',
    durationMin: 14,
    durationMax: 21,
    effects: { evDemandMult: 1.60, standardDemandMult: 0.90 },
    description: 'New EV incentives announced. EV tire demand surges.',
  },
  {
    id: 'holiday_rush',
    name: 'Holiday Rush',
    icon: '\u{1F381}',
    durationMin: 5,
    durationMax: 7,
    effects: { demandMult: 1.40, overtimeCostMult: 1.25 },
    description: 'Holiday shopping frenzy. Demand up, overtime costs rise.',
  },
  {
    id: 'earthquake',
    name: 'Earthquake',
    icon: '\u{1F30B}',
    durationMin: 7,
    durationMax: 14,
    effects: { demandMult: 0.60, productionCostMult: 1.50, earthquake: true },
    description: 'Major earthquake! Shops and factories damaged. Repair costs incoming.',
  },
  {
    id: 'plantation_fire',
    name: 'Plantation Fire',
    icon: '\u{1F525}',
    durationMin: 7,
    durationMax: 14,
    effects: { rubberIndexMod: 0.30, naturalOutputMult: 0.30 },
    description: 'Rubber plantations ablaze. Natural rubber prices surge, farm output severely reduced.',
  },
  {
    id: 'synthetic_chemical_shortage',
    name: 'Chemical Shortage',
    icon: '\u{2697}\uFE0F',
    durationMin: 10,
    durationMax: 18,
    effects: { chemicalsIndexMod: 0.25, syntheticOutputMult: 0.50 },
    description: 'Chemical supply chain disrupted. Synthetic rubber production halved.',
  },
  {
    id: 'trade_embargo',
    name: 'Trade Embargo',
    icon: '\u{1F6AB}',
    durationMin: 14,
    durationMax: 28,
    effects: { rubberIndexMod: 0.20, supplierCostMult: 1.15 },
    description: 'International trade embargo. Rubber prices up, supplier costs increase 15%.',
  },
  {
    id: 'new_rubber_source',
    name: 'New Rubber Source Discovered',
    icon: '\u{1F33F}',
    durationMin: 21,
    durationMax: 30,
    effects: { rubberIndexMod: -0.25, naturalOutputMult: 1.50 },
    description: 'New rubber plantations online. Rubber prices drop, farm output boosted 50%.',
  },
  {
    id: 'monsoon_season',
    name: 'Monsoon Season',
    icon: '\u{1F327}\uFE0F',
    durationMin: 10,
    durationMax: 14,
    effects: { rubberIndexMod: 0.15, naturalOutputMult: 0.60, shippingCostMult: 1.30 },
    description: 'Heavy monsoons disrupt rubber harvests and shipping routes.',
  },
];

/** Chance per event per day to trigger (~2%) */
export const GLOBAL_EVENT_CHANCE = 0.02;

/** Max concurrent global events */
export const GLOBAL_EVENT_MAX_CONCURRENT = 2;
