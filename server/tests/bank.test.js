import { describe, it, expect } from 'vitest';
import { handleBank } from '../routes/actions/bank.js';
import { mockState, mockCtx } from './helpers.js';

describe('handleBank', () => {
  describe('bankDeposit', () => {
    it('deposits cash to bank', () => {
      const g = mockState({ cash: 1000, bankBalance: 0 });
      const ctx = mockCtx();

      const result = handleBank('bankDeposit', { amount: 500 }, g, ctx);
      expect(ctx.failCalled).toBe(false);
      expect(result.cash).toBe(500);
      expect(result.bankBalance).toBe(500);
    });

    it('fails when not enough cash', () => {
      const g = mockState({ cash: 100, bankBalance: 0 });
      const ctx = mockCtx();

      handleBank('bankDeposit', { amount: 500 }, g, ctx);
      expect(ctx.failCalled).toBe(true);
      expect(ctx.failMsg).toMatch(/Not enough cash/);
    });

    it('fails with zero amount', () => {
      const g = mockState({ cash: 1000 });
      const ctx = mockCtx();

      handleBank('bankDeposit', { amount: 0 }, g, ctx);
      expect(ctx.failCalled).toBe(true);
    });
  });

  describe('bankWithdraw', () => {
    it('withdraws from bank to cash', () => {
      const g = mockState({ cash: 0, bankBalance: 1000 });
      const ctx = mockCtx();

      const result = handleBank('bankWithdraw', { amount: 500 }, g, ctx);
      expect(ctx.failCalled).toBe(false);
      expect(result.cash).toBe(500);
      expect(result.bankBalance).toBe(500);
    });

    it('fails when insufficient bank balance', () => {
      const g = mockState({ cash: 0, bankBalance: 100 });
      const ctx = mockCtx();

      handleBank('bankWithdraw', { amount: 500 }, g, ctx);
      expect(ctx.failCalled).toBe(true);
      expect(ctx.failMsg).toMatch(/Insufficient/);
    });
  });

  describe('takeLoan', () => {
    it('takes a valid loan', () => {
      const g = mockState({ cash: 0, loans: [], reputation: 0 });
      const ctx = mockCtx();

      const result = handleBank('takeLoan', { index: 0 }, g, ctx);
      expect(ctx.failCalled).toBe(false);
      expect(result.loans.length).toBe(1);
      expect(result.cash).toBeGreaterThan(0);
    });

    it('fails when max loans reached', () => {
      const g = mockState({
        cash: 0,
        loans: [
          { id: '1', remaining: 100 },
          { id: '2', remaining: 100 },
          { id: '3', remaining: 100 },
        ],
      });
      const ctx = mockCtx();

      handleBank('takeLoan', { index: 0 }, g, ctx);
      expect(ctx.failCalled).toBe(true);
      expect(ctx.failMsg).toMatch(/Max 3/);
    });
  });

  describe('repayLoan', () => {
    it('partially repays a loan', () => {
      const g = mockState({
        cash: 5000,
        loans: [{ id: '1', name: 'Test', remaining: 10000 }],
        log: [],
      });
      const ctx = mockCtx();

      const result = handleBank('repayLoan', { loanIndex: 0, amount: 3000 }, g, ctx);
      expect(ctx.failCalled).toBe(false);
      expect(result.cash).toBe(2000);
      expect(result.loans[0].remaining).toBe(7000);
    });

    it('fully pays off a loan and removes it', () => {
      const g = mockState({
        cash: 20000,
        loans: [{ id: '1', name: 'Test', remaining: 5000 }],
        reputation: 10,
        log: [],
      });
      const ctx = mockCtx();

      const result = handleBank('repayLoan', { loanIndex: 0, amount: 5000 }, g, ctx);
      expect(ctx.failCalled).toBe(false);
      expect(result.loans.length).toBe(0);
      expect(result.reputation).toBe(10.5); // +0.5 for early payoff
    });
  });

  it('returns null for unknown actions', () => {
    const result = handleBank('unknownAction', {}, mockState(), mockCtx());
    expect(result).toBeNull();
  });
});
