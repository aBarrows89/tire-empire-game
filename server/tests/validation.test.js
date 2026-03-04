import { describe, it, expect } from 'vitest';
import { ACTION_SCHEMAS, actionBodySchema } from '../validation/actionSchemas.js';

describe('Zod action validation', () => {
  describe('actionBodySchema', () => {
    it('accepts valid action body', () => {
      const result = actionBodySchema.safeParse({ action: 'setPrice', tire: 'allSeason', price: 100 });
      expect(result.success).toBe(true);
    });

    it('rejects missing action field', () => {
      const result = actionBodySchema.safeParse({ tire: 'allSeason', price: 100 });
      expect(result.success).toBe(false);
    });

    it('rejects empty action string', () => {
      const result = actionBodySchema.safeParse({ action: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('setPrice schema', () => {
    it('accepts valid params', () => {
      const schema = ACTION_SCHEMAS.setPrice;
      const result = schema.safeParse({ tire: 'allSeason', price: 100 });
      expect(result.success).toBe(true);
    });

    it('rejects missing tire', () => {
      const schema = ACTION_SCHEMAS.setPrice;
      const result = schema.safeParse({ price: 100 });
      expect(result.success).toBe(false);
    });

    it('rejects missing price', () => {
      const schema = ACTION_SCHEMAS.setPrice;
      const result = schema.safeParse({ tire: 'allSeason' });
      expect(result.success).toBe(false);
    });

    it('coerces string price to number', () => {
      const schema = ACTION_SCHEMAS.setPrice;
      const result = schema.safeParse({ tire: 'allSeason', price: '100' });
      expect(result.success).toBe(true);
      expect(result.data.price).toBe(100);
    });
  });

  describe('bankDeposit schema', () => {
    it('accepts valid amount', () => {
      const schema = ACTION_SCHEMAS.bankDeposit;
      const result = schema.safeParse({ amount: 500 });
      expect(result.success).toBe(true);
    });

    it('rejects missing amount', () => {
      const schema = ACTION_SCHEMAS.bankDeposit;
      const result = schema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('openDistCenter schema', () => {
    it('accepts valid params', () => {
      const schema = ACTION_SCHEMAS.openDistCenter;
      const result = schema.safeParse({ regionId: 'northeast', cityId: 'pittsburgh_pa' });
      expect(result.success).toBe(true);
    });

    it('rejects missing regionId', () => {
      const schema = ACTION_SCHEMAS.openDistCenter;
      const result = schema.safeParse({ cityId: 'pittsburgh_pa' });
      expect(result.success).toBe(false);
    });
  });

  describe('takeLoan schema', () => {
    it('accepts valid loan index', () => {
      const schema = ACTION_SCHEMAS.takeLoan;
      const result = schema.safeParse({ index: 0 });
      expect(result.success).toBe(true);
    });

    it('coerces string index to number', () => {
      const schema = ACTION_SCHEMAS.takeLoan;
      const result = schema.safeParse({ index: '2' });
      expect(result.success).toBe(true);
      expect(result.data.index).toBe(2);
    });
  });

  it('has schemas for key actions', () => {
    const requiredActions = [
      'setPrice', 'setAutoPrice', 'setServicePrice',
      'bankDeposit', 'bankWithdraw', 'takeLoan', 'repayLoan',
      'buyStorage', 'transferTires',
      'openShop', 'hireStaff', 'fireStaff',
      'openDistCenter', 'closeDistCenter',
      'buyMarketingBlitz', 'buyRepBoost',
    ];
    for (const action of requiredActions) {
      expect(ACTION_SCHEMAS[action], `Missing schema for: ${action}`).toBeDefined();
    }
  });
});
