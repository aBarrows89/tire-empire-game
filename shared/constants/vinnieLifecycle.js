// ── Vinnie Lifecycle Stages (Section 15a) ──
// Vinnie's tone evolves with the player's progression.

export const VINNIE_STAGES = [
  {
    id: 'hustler',
    repRange: [0, 10],
    tone: 'street mentor',
    focus: ['sourcing basics', 'first sale', 'pricing', 'saving up for a shop'],
  },
  {
    id: 'shopkeeper',
    repRange: [10, 25],
    tone: 'proud uncle',
    focus: ['shop optimization', 'staff hiring', 'supplier unlocks', 'wholesale tease'],
  },
  {
    id: 'mogul',
    repRange: [25, 50],
    tone: 'business advisor',
    focus: ['wholesale', 'ecommerce', 'exchange', 'multi-location strategy'],
  },
  {
    id: 'tycoon',
    repRange: [50, 75],
    tone: 'equal partner',
    focus: ['factory prep', 'market manipulation', 'competitor acquisition', 'TC strategy'],
  },
  {
    id: 'empire',
    repRange: [75, 100],
    tone: 'consigliere',
    focus: ['factory optimization', 'brand building', 'defensive strategy', 'legacy'],
  },
];

/** Get the player's current Vinnie stage based on reputation */
export function getVinnieStage(reputation) {
  for (let i = VINNIE_STAGES.length - 1; i >= 0; i--) {
    if (reputation >= VINNIE_STAGES[i].repRange[0]) return VINNIE_STAGES[i];
  }
  return VINNIE_STAGES[0];
}
