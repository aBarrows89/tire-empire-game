import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { LOANS } from '@shared/constants/loans.js';
import { LOAN_INDEX_TO_TIER } from '@shared/constants/bank.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction } from '../../api/client.js';
import { hapticsMedium } from '../../api/haptics.js';
import { playSound } from '../../api/sounds.js';
import { UICard, ProgressBar, SectionHeader, Tag } from '../ui/ui.jsx';

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
    refreshState(); setBusy(null);
  };

  const deposit = async () => {
    const amt = Math.floor(Number(depAmount));
    if (!amt || amt <= 0) return;
    setBusy('dep');
    await postAction('bankDeposit', { amount: amt });
    hapticsMedium(); playSound('cash');
    refreshState(); setDepAmount(''); setBusy(null);
  };

  const withdraw = async () => {
    const amt = Math.floor(Number(wdAmount));
    if (!amt || amt <= 0) return;
    setBusy('wd');
    await postAction('bankWithdraw', { amount: amt });
    hapticsMedium(); playSound('cash');
    refreshState(); setWdAmount(''); setBusy(null);
  };

  const repay = async (loanIdx) => {
    const amt = Math.floor(Number(repayAmounts[loanIdx] || 0));
    if (!amt || amt <= 0) return;
    setBusy(`repay-${loanIdx}`);
    await postAction('repayLoan', { loanIndex: loanIdx, amount: amt });
    hapticsMedium(); refreshState();
    setRepayAmounts(p => ({ ...p, [loanIdx]: '' }));
    setBusy(null);
  };

  const bankBal = g.bankBalance || 0;
  const rate = g.bankRate || 0.042;
  const dailyInterest = Math.round(bankBal * rate / 365);
  const loans = (g.loans || []).filter(l => (l.remaining || 0) > 0);
  const totalDebt = loans.reduce((a, l) => a + (l.remaining || 0), 0);

  // Daily P&L
  const dayRev = g.dayRev || 0;
  const dayProfit = g.dayProfit || 0;
  const dayExpenses = dayRev - dayProfit;

  return (
    <>
      {/* ── BANK BALANCE HERO ── */}
      <UICard style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
          BANK BALANCE
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--green)' }}>${fmt(bankBal)}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
          {(rate * 100).toFixed(1)}% APR {'\u00B7'} Earning ${dailyInterest}/day
        </div>

        {/* Deposit / Withdraw */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <input type="number" placeholder="Deposit $" value={depAmount}
              onChange={e => setDepAmount(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none', marginBottom: 4 }}/>
            <button onClick={deposit} disabled={busy === 'dep' || !depAmount}
              style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: busy === 'dep' || !depAmount ? 0.5 : 1 }}>
              {busy === 'dep' ? '...' : 'Deposit'}
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <input type="number" placeholder="Withdraw $" value={wdAmount}
              onChange={e => setWdAmount(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none', marginBottom: 4 }}/>
            <button onClick={withdraw} disabled={busy === 'wd' || !wdAmount}
              style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: busy === 'wd' || !wdAmount ? 0.5 : 1 }}>
              {busy === 'wd' ? '...' : 'Withdraw'}
            </button>
          </div>
        </div>
      </UICard>

      {/* ── BANK RATE INDICATOR ── */}
      {g._bankState && (
        <UICard style={{ padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Bank Rate: <b style={{ color: 'var(--accent)' }}>{((g._bankState.savingsRate || 0.042) * 100).toFixed(1)}%</b>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {g._bankState.rateDirection === 'up' ? '\u25B2 Rising' : g._bankState.rateDirection === 'down' ? '\u25BC Falling' : '\u25C6 Holding'}
            </div>
          </div>
        </UICard>
      )}

      {/* ── DAILY P&L ── */}
      <UICard>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{'\u{1F4B3}'} Daily P&L</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Revenue</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>+${fmt(dayRev)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Expenses</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>-${fmt(dayExpenses)}</span>
        </div>
        {totalDebt > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Total Debt</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>${fmt(totalDebt)}</span>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Net Profit</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: dayProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
            ${fmt(dayProfit)}
          </span>
        </div>
      </UICard>

      {/* ── ACTIVE LOANS ── */}
      {loans.length > 0 && (
        <>
          <SectionHeader title={`Active Loans (${loans.length})`} icon={'\u{1F4CB}'}/>
          {loans.map((loan, i) => {
            const loanAmt = loan.amt || loan.amount || 0;
            const paidPct = loanAmt > 0 ? Math.round(((loanAmt - (loan.remaining || 0)) / loanAmt) * 100) : 0;
            return (
              <UICard key={loan.id || i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{loan.name || `Loan ${i + 1}`}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      {((loan.r || loan.rate || 0.08) * 100).toFixed(0)}% APR {'\u00B7'} ${fmt(loan.weeklyPayment || 0)}/week
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>${fmt(loan.remaining)}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>remaining</div>
                  </div>
                </div>
                <ProgressBar pct={paidPct} color="var(--accent)"/>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                  <span>${fmt(loanAmt - (loan.remaining || 0))} paid</span>
                  <span>${fmt(loanAmt)} total</span>
                </div>
                {/* Extra payment */}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input type="number" placeholder="Extra $"
                    value={repayAmounts[i] || ''}
                    onChange={e => setRepayAmounts(p => ({ ...p, [i]: e.target.value }))}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11, outline: 'none' }}/>
                  <button onClick={() => repay(i)} disabled={busy === `repay-${i}`}
                    style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                    Pay
                  </button>
                </div>
              </UICard>
            );
          })}
        </>
      )}

      {/* ── AVAILABLE LOANS ── */}
      <SectionHeader title="Available Loans" icon={'\u{1F3E6}'}/>
      {LOANS.map((loan, i) => {
        const canTake = (g.reputation || 0) >= (loan.rr || 0) && loans.length < 5;
        const tierKey = LOAN_INDEX_TO_TIER[i];
        const bankRates = g._bankState?.loanRates || {};
        const dynamicRate = tierKey && bankRates[tierKey] ? bankRates[tierKey] : loan.r * (g._loanRateMult || 1);
        const loanTotal = loan.amt * (1 + dynamicRate);
        const weeklyPay = Math.round(loanTotal / (loan.t * 4));
        return (
          <UICard key={i} style={{ opacity: canTake ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>${fmt(loan.amt)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  {(dynamicRate * 100).toFixed(1)}% APR {'\u00B7'} ${fmt(weeklyPay)}/week {'\u00B7'} {loan.t} months
                  {loan.rr > 0 && ` \u00B7 Rep ${loan.rr}+`}
                </div>
              </div>
              <button onClick={() => take(i)} disabled={busy === `loan-${i}` || !canTake}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: canTake ? 'var(--green)' : 'rgba(255,255,255,0.05)',
                  color: canTake ? '#fff' : 'var(--text-dim)',
                  fontWeight: 700, fontSize: 12, cursor: canTake ? 'pointer' : 'default',
                }}>
                {busy === `loan-${i}` ? '...' : 'Take'}
              </button>
            </div>
          </UICard>
        );
      })}
    </>
  );
}
