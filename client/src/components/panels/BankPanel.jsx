import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { LOANS } from '@shared/constants/loans.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction } from '../../api/client.js';

export default function BankPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);

  const take = async (index) => {
    setBusy(index);
    await postAction('takeLoan', { index });
    refreshState();
    setBusy(null);
  };

  return (
    <>
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

      <div className="card">
        <div className="card-title">Available Loans</div>
        <div className="text-sm text-dim mb-4">Borrow cash to grow faster.</div>
      </div>

      {LOANS.map((loan, index) => {
        const locked = loan.rr > 0 && g.reputation < loan.rr;
        const totalCost = loan.amt * (1 + loan.r);
        const weeklyPay = totalCost / (loan.t * 4);

        return (
          <div key={index} className="card">
            <div className="row-between mb-4">
              <span className="font-bold">{loan.n}</span>
              <span className="text-green font-bold">${fmt(loan.amt)}</span>
            </div>
            <div className="text-xs text-dim mb-4">
              {(loan.r * 100).toFixed(1)}% rate · {loan.t} weeks · ${fmt(weeklyPay)}/wk
              {loan.rr > 0 ? ` · Rep ${loan.rr}+` : ''}
            </div>
            <button
              className="btn btn-full btn-sm"
              disabled={locked || busy === index}
              onClick={() => take(index)}
            >
              {locked ? `Need Rep ${loan.rr}` : busy === index ? 'Processing...' : 'Take Loan'}
            </button>
          </div>
        );
      })}
    </>
  );
}
