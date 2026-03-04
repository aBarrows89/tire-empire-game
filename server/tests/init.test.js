import { describe, it, expect } from 'vitest';
import { init } from '../engine/init.js';
import { TIRES } from '../../shared/constants/tires.js';

describe('init', () => {
  it('should create valid initial state with all required fields', () => {
    const g = init('Test', 1);
    expect(g.cash).toBe(500);
    expect(g.reputation).toBe(0);
    expect(g.locations).toEqual([]);
    expect(g.day).toBe(1);
    expect(g.storage.length).toBe(1);
    expect(g.storage[0].type).toBe('van');
  });

  it('should initialize all tire types with zero inventory', () => {
    const g = init('Test', 1);
    for (const [key, val] of Object.entries(g.inventory)) {
      expect(val).toBe(0);
    }
  });

  it('should set default prices for all tire types', () => {
    const g = init('Test', 1);
    for (const key of Object.keys(TIRES)) {
      expect(g.prices[key]).toBe(TIRES[key].def);
    }
  });

  it('should initialize contracts and 3PL arrays', () => {
    const g = init('Test', 1);
    expect(g.contracts).toEqual([]);
    expect(g.contractOffers).toEqual([]);
    expect(g.storageListings).toEqual([]);
    expect(g.storageLeases).toEqual([]);
    expect(g.tplInventory).toEqual({});
    expect(g.tplIncome).toBe(0);
  });

  it('should set the globalDay as startDay', () => {
    const g = init('Test', 42);
    expect(g.startDay).toBe(42);
  });

  it('should have empty staff', () => {
    const g = init('Test', 1);
    expect(g.staff.techs).toBe(0);
    expect(g.staff.sales).toBe(0);
    expect(g.staff.managers).toBe(0);
  });

  it('should initialize with zero bank balance', () => {
    const g = init('Test', 1);
    expect(g.bankBalance).toBe(0);
    expect(g.loans).toEqual([]);
  });
});
