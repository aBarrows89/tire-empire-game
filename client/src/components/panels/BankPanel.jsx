import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { LOANS } from '@shared/constants/loans.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction } from '../../api/client.js';

export default function BankPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);
  const [depAmount, setDepAmount] = useState('');
  const [wdAmount, setWdAmount] = useState('');

  const take = async (index) => {
    setBusy(`loan-${index}`);
    await postAction('takeLoan', { index });
    refreshState();
    setBusy(null);
  };

  const deposit = async () => {
    const amt = Math.floor(Number(depAmount));
    if (!amt || amt <= 0) return;
    setBusy('dep');
    await postAction('bankDeposit', { amount: amt });
    setDepAmount('');
    refreshState();
    setBusy(null);
  };

  const withdraw = async () => {
    const amt = Math.floor(Number(wdAmount));
    if (!amt || amt <= 0) return;
    setBusy('wd');
    await postAction('bankWithdraw', { amount: amt });
    setWdAmount('');
    refreshState();
    setBusy(null);
  };

  const depositAll = () => setDepAmount(String(Math.floor(g.cash)));
  const withdrawAll = () => setWdAmount(String(Math.floor(g.bankBalance || 0)));

  const annualRate = ((g.bankRate || 0.042) * 100).toFixed(2);
  const weeklyRate = ((g.bankRate || 0.042) / 52 * 100).toFixed(3);
  const balance = g.bankBalance || 0;
  const weeklyInterest = g.bankInterestEarned || 0;
  const totalInterest = g.bankTotalInterest || 0;

  const inputStyle = {
    flex: 1, padding: 8, borderRadius: 6, background: 'var(--surface)',
    color: 'var(--text)', border: '1px solid var(--border)', minHeight: 40,
    fontSize: 14,
  };

  return (
    <>
      {/* Savings Account */}
      <div className="card">
        <div className="card-title">Savings Account</div>
        <div className="text-sm text-dim mb-4">
          Deposit cash to earn interest. Rate fluctuates with the market each week.
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Balance</span>
          <span className="text-green font-bold">${fmt(balance)}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Annual Rate</span>
          <span className="text-accent font-bold">{annualRate}%</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Weekly Rate</span>
          <span className="text-xs">{weeklyRate}%</span>
        </div>
        {weeklyInterest > 0 && (
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Last Interest</span>
            <span className="text-green text-sm">+${fmt(weeklyInterest)}</span>
          </div>
        )}
        {totalInterest > 0 && (
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Total Earned</span>
            <span className="text-sm">${fmt(totalInterest)}</span>
          </div>
        )}
      </div>

      {/* Deposit */}
      <div className="card">
        <div className="card-title" style={{ fontSize: 13 }}>Deposit</div>
        <div className="row gap-8">
          <input
            type="number"
            placeholder="Amount"
            value={depAmount}
            onChange={(e) => setDepAmount(e.target.value)}
            min={1}
            max={Math.floor(g.cash)}
            style={inputStyle}
          />
          <button
            className="btn btn-sm btn-outline"
            onClick={depositAll}
            style={{ whiteSpace: 'nowrap' }}
          >
            Max
          </button>
          <button
            className="btn btn-sm btn-green"
            disabled={!depAmount || Number(depAmount) <= 0 || Number(depAmount) > g.cash || busy === 'dep'}
            onClick={deposit}
          >
            {busy === 'dep' ? '...' : 'Deposit'}
          </button>
        </div>
        <div className="text-xs text-dim mt-8">Cash available: ${fmt(g.cash)}</div>
      </div>

      {/* Withdraw */}
      {balance > 0 && (
        <div className="card">
          <div className="card-title" style={{ fontSize: 13 }}>Withdraw</div>
          <div className="row gap-8">
            <input
              type="number"
              placeholder="Amount"
              value={wdAmount}
              onChange={(e) => setWdAmount(e.target.value)}
              min={1}
              max={Math.floor(balance)}
              style={inputStyle}
            />
            <button
              className="btn btn-sm btn-outline"
              onClick={withdrawAll}
              style={{ whiteSpace: 'nowrap' }}
            >
              All
            </button>
            <button
              className="btn btn-sm btn-red"
              disabled={!wdAmount || Number(wdAmount) <= 0 || Number(wdAmount) > balance || busy === 'wd'}
              onClick={withdraw}
            >
              {busy === 'wd' ? '...' : 'Withdraw'}
            </button>
          </div>
        </div>
      )}

      {/* Active Loans */}
      {(g.loans || []).length > 0 && (
        <div className="card">
          <div className="card-title">Active Loans</div>
          {g.loans.map((loan, i) => (
            <div key={i} className="row-between text-sm mb-4">
              <span>{loan.name}</span>
              <span className="text-red">${fmt(loan.remaining)} left</span>
            </div>
          ))}
        </div>
      )}

      {/* Available Loans */}
      <div className="card">
        <div className="card-title">Available Loans</div>
        <div className="text-sm text-dim mb-4">Borrow cash to grow faster.</div>
      </div>

      {LOANS.map((loan, index) => {
        const locked = loan.rr > 0 && g.reputation < loan.rr;
        const totalCost = loan.amt * (1 + loan.r);
        const weeklyPay = totalCost / (loan.t * 4);

        return (
          <div key={index} className="card" style={locked ? { opacity: 0.6 } : {}}>
            <div className="row-between mb-4">
              <span className="font-bold">{loan.n}</span>
              <span className="text-green font-bold">${fmt(loan.amt)}</span>
            </div>
            <div className="text-xs text-dim mb-4">
              {(loan.r * 100).toFixed(1)}% rate {"\u00B7"} {loan.t} weeks {"\u00B7"} ${fmt(weeklyPay)}/wk
              {loan.rr > 0 ? ` \u00B7 Rep ${loan.rr}+` : ''}
            </div>
            <button
              className="btn btn-full btn-sm"
              disabled={locked || busy === `loan-${index}`}
              onClick={() => take(index)}
            >
              {locked ? `Need Rep ${loan.rr}` : busy === `loan-${index}` ? 'Processing...' : 'Take Loan'}
            </button>
          </div>
        );
      })}
    </>
  );
}
