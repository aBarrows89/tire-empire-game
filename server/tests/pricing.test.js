import { describe, it, expect } from 'vitest';
import { handlePricing } from '../routes/actions/pricing.js';
import { TIRES } from '../../shared/constants/tires.js';
import { mockState, mockCtx } from './helpers.js';

describe('handlePricing', () => {
  describe('setPrice', () => {
    it('sets a valid tire price', () => {
      const g = mockState();
      const ctx = mockCtx();
      const tire = Object.keys(TIRES)[0];
      const t = TIRES[tire];
      const price = Math.round((t.lo + t.hi) / 2);

      const result = handlePricing('setPrice', { tire, price }, g, ctx);
      expect(ctx.failCalled).toBe(false);
      expect(result).not.toBeNull();
      expect(result.prices[tire]).toBe(price);
    });

    it('clamps price to tire bounds', () => {
      const g = mockState();
      const ctx = mockCtx();
      const tire = Object.keys(TIRES)[0];
      const t = TIRES[tire];

      const result = handlePricing('setPrice', { tire, price: 999999 }, g, ctx);
      expect(result.prices[tire]).toBe(t.hi);
    });

    it('fails on invalid tire type', () => {
      const g = mockState();
      const ctx = mockCtx();

      const result = handlePricing('setPrice', { tire: 'nonexistent', price: 50 }, g, ctx);
      expect(ctx.failCalled).toBe(true);
      expect(ctx.failMsg).toMatch(/Invalid tire/i);
    });
  });

  describe('setAutoPrice', () => {
    it('fails without pricing analyst', () => {
      const g = mockState();
      const ctx = mockCtx();
      const tire = Object.keys(TIRES)[0];

      handlePricing('setAutoPrice', { tire, strategy: 'undercut', offset: 5 }, g, ctx);
      expect(ctx.failCalled).toBe(true);
      expect(ctx.failMsg).toMatch(/Pricing Analyst/);
    });

    it('sets auto price with pricing analyst hired', () => {
      const g = mockState({ staff: { techs: 0, sales: 0, managers: 0, drivers: 0, pricingAnalyst: 1 } });
      const ctx = mockCtx();
      const tire = Object.keys(TIRES)[0];

      const result = handlePricing('setAutoPrice', { tire, strategy: 'undercut', offset: 5 }, g, ctx);
      expect(ctx.failCalled).toBe(false);
      expect(result.autoPrice[tire]).toEqual({ strategy: 'undercut', offset: 5 });
    });

    it('rejects invalid strategy', () => {
      const g = mockState({ staff: { techs: 0, sales: 0, managers: 0, drivers: 0, pricingAnalyst: 1 } });
      const ctx = mockCtx();
      const tire = Object.keys(TIRES)[0];

      handlePricing('setAutoPrice', { tire, strategy: 'invalid', offset: 5 }, g, ctx);
      expect(ctx.failCalled).toBe(true);
    });
  });

  it('returns null for unknown actions', () => {
    const g = mockState();
    const ctx = mockCtx();
    const result = handlePricing('unknownAction', {}, g, ctx);
    expect(result).toBeNull();
  });
});
