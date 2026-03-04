export const INSURANCE = {
  basic: {
    name: 'Basic Insurance',
    costPerMonth: 500,
    covers: ['chargeback'],
    icon: '🛡️',
  },
  standard: {
    name: 'Standard Insurance',  // 16j: Mid-tier between basic and business
    costPerMonth: 1000,
    covers: ['chargeback', 'workersComp'],
    icon: '🛡️🛡️',
  },
  business: {
    name: 'Business Insurance',
    costPerMonth: 1500,
    covers: ['chargeback', 'workersComp', 'recall', 'earthquake'],
    icon: '🛡️🛡️🛡️',
  },
  premium: {
    name: 'Premium Insurance',
    costPerMonth: 3000,
    covers: ['chargeback', 'workersComp', 'recall', 'techQuit', 'badReview', 'junkFine', 'shipping', 'earthquake'],
    replacementDiscount: 0.10,
    icon: '🛡️🛡️🛡️',
  },
};

export const EVENT_INSURANCE_MAP = {
  2: 'shipping',
  4: 'techQuit',
  6: 'recall',
  10: 'chargeback',
  11: 'badReview',
  12: 'workersComp',
  13: 'junkFine',
};
