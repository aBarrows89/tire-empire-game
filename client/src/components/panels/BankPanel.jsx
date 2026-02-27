import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { LOANS } from '@shared/constants/loans.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction } from '../../api/client.js';
import { hapticsMedium } from '../../api/haptics.js';
import { playSound } from '../../api/sounds.js';

export default function BankPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);
  const [depAmount, setDepAmount] = useState('');
  const [wdAmount, setWdAmount] = useState('');
  const [repayAmounts, setRepayAmounts] = useState({});

  const take = async (index) => {
    setBusy(`loan-${index}`);
    await postAction('takeLoan', { index });
    hapticsMedium(); playSound('cash');
    refreshState();
    setBusy(null);
  };

  const deposit = async () => {
    const amt = Math.floor(Number(depAmount));
    if (!amt || amt <= 0) return;
    setBusy('dep');
    await postAction('bankDeposit', { amount: amt });
    hapticsMedium(); playSound('cash');
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

  const repayLoan = async (loanIndex, amount) => {
    setBusy(`repay-${loanIndex}`);
    await postAction('repayLoan', { loanIndex, amount });
    setRepayAmounts(prev => ({ ...prev, [loanIndex]: '' }));
    refreshState();
    setBusy(null);
  };

  const vinnieBailout = async () => {
    setBusy('bailout');
    await postAction('vinnieBailout');
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
      {/* Vinnie Bailout */}
      {g.cash < 0 && (g.tireCoins || 0) >= 10000 && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <div className="card-title" style={{ color: 'var(--red)' }}>Emergency Bailout</div>
          <div className="text-xs text-dim mb-4">
            You're in the red! Vinnie can bail you out for 10,000 TireCoins.
          </div>
          <button
            className="btn btn-full btn-sm btn-red"
            disabled={busy === 'bailout'}
            onClick={vinnieBailout}
          >
            {busy === 'bailout' ? 'Processing...' : `Vinnie Bailout (10K TC) — You have ${g.tireCoins || 0} TC`}
          </button>
        </div>
      )}

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

      {/* Active Loans with Repayment */}
      {(g.loans || []).length > 0 && (
        <div className="card">
          <div className="card-title">Active Loans</div>
          {g.loans.map((loan, i) => {
            const repayVal = repayAmounts[i] || '';
            return (
              <div key={i} style={{ borderBottom: i < g.loans.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: 8, marginBottom: 8 }}>
                <div className="row-between text-sm mb-4">
                  <span>{loan.name}</span>
                  <span className="text-red">${fmt(Math.ceil(loan.remaining))} left</span>
                </div>
                <div className="text-xs text-dim mb-4">
                  ${fmt(Math.round(loan.weeklyPayment || 0))}/wk &middot; Pay off: ${fmt(Math.ceil(loan.remaining))} (leaves ${fmt(Math.max(0, Math.floor(g.cash - loan.remaining)))})
                </div>
                <div className="row gap-8">
                  <input
                    type="number"
                    placeholder="Pay Extra"
                    value={repayVal}
                    onChange={(e) => setRepayAmounts(prev => ({ ...prev, [i]: e.target.value }))}
                    min={1}
                    max={Math.min(Math.floor(g.cash), Math.ceil(loan.remaining))}
                    style={{ ...inputStyle, fontSize: 12 }}
                  />
                  <button
                    className="btn btn-sm btn-green"
                    disabled={!repayVal || Number(repayVal) <= 0 || Number(repayVal) > g.cash || busy === `repay-${i}`}
                    onClick={() => repayLoan(i, Number(repayVal))}
                  >
                    {busy === `repay-${i}` ? '...' : 'Pay'}
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    disabled={g.cash < loan.remaining || busy === `repay-${i}`}
                    onClick={() => {
                      const amt = Math.ceil(loan.remaining);
                      const afterCash = Math.floor(g.cash - amt);
                      if (afterCash < 1000 && !window.confirm(`This will leave you with $${afterCash.toLocaleString()}. Continue?`)) return;
                      repayLoan(i, amt);
                    }}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Pay Off
                  </button>
                </div>
              </div>
            );
          })}
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

      {/* Insurance */}
      <div className="card">
        <div className="card-title">Insurance</div>
        <div className="text-sm text-dim mb-4">Protect your business from unexpected events.</div>
      </div>
      {[
        { tier: 'basic', name: 'Basic', cost: '$500/mo', desc: 'Covers theft and minor damage.' },
        { tier: 'business', name: 'Business', cost: '$1,500/mo', desc: 'Covers theft, damage, chargebacks, and minor lawsuits.' },
        { tier: 'premium', name: 'Premium', cost: '$3,000/mo', desc: 'Covers everything including major lawsuits and natural disasters.' },
      ].map(ins => {
        const isActive = g.insurance === ins.tier;
        return (
          <div key={ins.tier} className={`insurance-card${isActive ? ' active' : ''}`}>
            <div className="row-between mb-4">
              <span className="font-bold">{ins.name}</span>
              <span className="text-accent font-bold">{ins.cost}</span>
            </div>
            <div className="text-xs text-dim mb-4">{ins.desc}</div>
            {isActive && <div className="text-xs text-green font-bold mb-4">CURRENT PLAN</div>}
            <button
              className={`btn btn-full btn-sm ${isActive ? 'btn-red' : 'btn-green'}`}
              disabled={busy === `ins-${ins.tier}`}
              onClick={async () => {
                setBusy(`ins-${ins.tier}`);
                await postAction('setInsurance', { tier: isActive ? null : ins.tier });
                refreshState();
                setBusy(null);
              }}
            >
              {busy === `ins-${ins.tier}` ? '...' : isActive ? 'Cancel' : 'Subscribe'}
            </button>
          </div>
        );
      })}
    </>
  );
}
