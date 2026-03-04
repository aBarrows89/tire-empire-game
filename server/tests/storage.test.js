import { describe, it, expect } from 'vitest';
import { handleStorage } from '../routes/actions/storage.js';
import { STORAGE } from '../../shared/constants/storage.js';
import { mockState, mockCtx } from './helpers.js';

describe('handleStorage', () => {
  describe('buyStorage', () => {
    it('buys a storage unit', () => {
      const type = 'garage';
      const cost = STORAGE[type].c;
      const g = mockState({ cash: cost + 1000 });
      const ctx = mockCtx();

      const result = handleStorage('buyStorage', { type }, g, ctx);
      expect(ctx.failCalled).toBe(false);
      expect(result.cash).toBe(1000);
      expect(result.storage.length).toBe(2); // van + garage
    });

    it('fails when not enough cash', () => {
      const g = mockState({ cash: 0 });
      const ctx = mockCtx();

      handleStorage('buyStorage', { type: 'garage' }, g, ctx);
      expect(ctx.failCalled).toBe(true);
      expect(ctx.failMsg).toMatch(/Not enough cash/);
    });

    it('fails on invalid storage type', () => {
      const g = mockState({ cash: 999999 });
      const ctx = mockCtx();

      handleStorage('buyStorage', { type: 'invalidType' }, g, ctx);
      expect(ctx.failCalled).toBe(true);
    });

    it('sets hasWarehouse for warehouse types', () => {
      const cost = STORAGE.smallWH.c;
      const g = mockState({ cash: cost + 1000 });
      const ctx = mockCtx();

      const result = handleStorage('buyStorage', { type: 'smallWH' }, g, ctx);
      expect(result.hasWarehouse).toBe(true);
      expect(result.warehouseInventory).toBeDefined();
    });
  });

  describe('setDisposalFee', () => {
    it('sets disposal fee within bounds', () => {
      const g = mockState();
      const ctx = mockCtx();

      const result = handleStorage('setDisposalFee', { fee: 8 }, g, ctx);
      expect(result.disposalFee).toBe(8);
    });

    it('clamps fee to max 15', () => {
      const g = mockState();
      const ctx = mockCtx();

      const result = handleStorage('setDisposalFee', { fee: 100 }, g, ctx);
      expect(result.disposalFee).toBe(15);
    });

    it('clamps fee to min 0', () => {
      const g = mockState();
      const ctx = mockCtx();

      const result = handleStorage('setDisposalFee', { fee: -5 }, g, ctx);
      expect(result.disposalFee).toBe(0);
    });
  });

  it('returns null for unknown actions', () => {
    const result = handleStorage('unknownAction', {}, mockState(), mockCtx());
    expect(result).toBeNull();
  });
});
