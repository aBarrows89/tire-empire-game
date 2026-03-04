import { describe, it, expect } from 'vitest';
import { initExchange, generateTicker } from '../engine/exchange.js';

describe('exchange', () => {
  it('should initialize with default commodities', () => {
    const ex = initExchange();
    expect(ex.commodities.RUBR).toBeDefined();
    expect(ex.commodities.STEL).toBeDefined();
    expect(ex.commodities.CHEM).toBeDefined();
  });

  it('should generate unique tickers', () => {
    const existing = new Set(['TIRE', 'RUBB']);
    const t1 = generateTicker('Acme Tire Company', existing);
    expect(t1).not.toBe('TIRE');
    expect(t1).not.toBe('RUBB');
    expect(t1.length).toBeLessThanOrEqual(4);
  });

  it('should generate ticker from company name', () => {
    const t = generateTicker('Big Wheel Tires', new Set());
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(0);
    expect(t.length).toBeLessThanOrEqual(4);
  });

  it('should have valid initial exchange state', () => {
    const ex = initExchange();
    expect(ex.stocks).toBeDefined();
    expect(ex.indices).toBeDefined();
    expect(ex.sentiment).toBeDefined();
  });
});
