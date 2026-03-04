import { describe, it, expect } from 'vitest';
import { init } from '../engine/init.js';
import { simDay } from '../engine/simDay.js';

describe('simDay', () => {
  it('should not crash on fresh player state', () => {
    const g = init('TestPlayer', 1);
    const result = simDay(g, {});
    expect(result.day).toBe(2);
  });

  it('should increment day counter', () => {
    let g = init('TestPlayer', 1);
    for (let i = 0; i < 30; i++) {
      g = simDay(g, {});
    }
    expect(g.day).toBe(31);
  });

  it('should not go negative cash with no expenses', () => {
    const g = init('TestPlayer', 1);
    const result = simDay(g, {});
    expect(result.cash).toBeGreaterThanOrEqual(0);
  });

  it('should not go negative cash over 90 days with no actions', () => {
    let g = init('TestPlayer', 1);
    for (let i = 0; i < 90; i++) {
      g = simDay(g, {});
    }
    expect(g.cash).toBeGreaterThanOrEqual(0);
  });

  it('should accumulate bank interest on savings', () => {
    let g = init('TestPlayer', 1);
    g.bankBalance = 100000;
    const startBalance = g.bankBalance;
    for (let i = 0; i < 30; i++) {
      g = simDay(g, { bankRate: 0.042 });
    }
    expect(g.bankBalance).toBeGreaterThan(startBalance);
  });

  it('should handle missing/undefined fields gracefully', () => {
    const g = { day: 1, cash: 500, reputation: 0, inventory: {}, prices: {}, locations: [], storage: [], staff: {}, log: [] };
    expect(() => simDay(g, {})).not.toThrow();
  });

  it('should preserve essential state fields across ticks', () => {
    let g = init('TestPlayer', 1);
    g.cash = 10000;
    g = simDay(g, {});
    expect(g.name).toBe('TestPlayer');
    expect(g.inventory).toBeDefined();
    expect(g.prices).toBeDefined();
    expect(g.locations).toBeDefined();
    expect(g.staff).toBeDefined();
  });

  it('should track daily revenue and profit', () => {
    let g = init('TestPlayer', 1);
    g = simDay(g, {});
    expect(g.dayRev).toBeDefined();
    expect(g.dayProfit).toBeDefined();
    expect(g.daySold).toBeDefined();
    expect(g.totalRev).toBeDefined();
  });

  it('should apply inflation index to wages when provided', () => {
    let g = init('TestPlayer', 1);
    g.staff = { techs: 2, sales: 2, managers: 0, drivers: 0, pricingAnalyst: 0 };
    g.cash = 100000;

    // Run with high inflation
    const highInfl = simDay({ ...g, log: [] }, { inflationIndex: 1.10 });
    // Run with no inflation
    const noInfl = simDay({ ...g, log: [] }, { inflationIndex: 1.0 });

    // High inflation should cost more (lower ending cash)
    expect(highInfl.cash).toBeLessThan(noInfl.cash);
  });

  it('should apply regional demand profiles to sales', () => {
    // Just verify the import/integration doesn't crash
    let g = init('TestPlayer', 1);
    g.locations = [{
      id: 'test_shop',
      cityId: 'detroit_mi',
      inventory: { allSeason: 100 },
      staff: { techs: 1, sales: 1 },
      loyalty: 10,
    }];
    g.staff = { techs: 2, sales: 2, managers: 0, drivers: 0, pricingAnalyst: 0 };
    g.cash = 50000;
    expect(() => simDay(g, { cities: [{ id: 'detroit_mi', dem: 200, cost: 0.9, win: 1.5 }] })).not.toThrow();
  });

  it('should apply oil commodity to shipping costs without crashing', () => {
    let g = init('TestPlayer', 1);
    g.hasEcom = true;
    g.ecomTier = 1;
    g.cash = 100000;
    expect(() => simDay(g, { commodities: { rubber: 1.1, steel: 1.0, chemicals: 0.95, oil: 1.2 } })).not.toThrow();
  });
});
