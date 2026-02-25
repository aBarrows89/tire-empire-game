import React from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { fmt } from '@shared/helpers/format.js';
import { TIRES } from '@shared/constants/tires.js';
import { getWealth } from '@shared/helpers/wealth.js';
import { getInv, getCap } from '@shared/helpers/inventory.js';
import { PAY } from '@shared/constants/staff.js';
import { MARKETING } from '@shared/constants/marketing.js';
import { INSURANCE } from '@shared/constants/insurance.js';
import VinnieTip from '../VinnieTip.jsx';
import Sparkline from '../Sparkline.jsx';
import TrendArrow from '../TrendArrow.jsx';
import LowStockBanner from '../LowStockBanner.jsx';

const QUICK_ACTIONS = [
  { id: 'source', icon: '\u{1F527}', label: 'Source' },
  { id: 'pricing', icon: '\u{1F4B2}', label: 'Prices' },
  { id: 'shop', icon: '\u{1F3EA}', label: 'Shops' },
  { id: 'bank', icon: '\u{1F3E6}', label: 'Bank' },
  { id: 'supplier', icon: '\u{1F69A}', label: 'Supply' },
  { id: 'staff', icon: '\u{1F465}', label: 'Staff' },
];

export default function DashboardPanel() {
  const { state, dispatch } = useGame();
  const g = state.game;

  const inv = getInv(g);
  const cap = getCap(g);
  const pct = cap > 0 ? Math.round((inv / cap) * 100) : 0;

  // Calculate total inventory across warehouse + all locations
  const whInv = Object.values(g.warehouseInventory || {}).reduce((a, b) => a + b, 0);
  const locInv = (g.locations || []).reduce((sum, loc) => {
    return sum + Object.values(loc.inventory || {}).reduce((a, b) => a + b, 0);
  }, 0);
  const totalInventory = whInv + locInv;

  // Daily expense estimates
  const staffCost = Object.entries(g.staff || {}).reduce((a, [k, v]) => a + (PAY[k] || 0) * v, 0) / 30;
  const shopRentEst = (g.locations || []).length * 4500 / 30; // rough estimate
  const marketingCost = (g.locations || []).reduce((a, loc) => {
    const mktg = loc.marketing && MARKETING[loc.marketing];
    return a + (mktg ? (mktg.costPerDay || mktg.dailyCost || 0) : 0);
  }, 0);
  const insuranceCost = g.insurance && INSURANCE[g.insurance] ? INSURANCE[g.insurance].monthlyCost / 30 : 0;
  const loanCost = (g.loans || []).reduce((a, l) => {
    const wkPmt = l.weeklyPayment || 0;
    return a + wkPmt / 7;
  }, 0);
  const totalDailyExpenses = staffCost + shopRentEst + marketingCost + insuranceCost + loanCost;

  return (
    <>
      <VinnieTip />
      <LowStockBanner
        totalInventory={totalInventory}
        capacity={cap}
        onClick={() => dispatch({ type: 'SET_PANEL', payload: 'source' })}
      />

      {/* Quick Actions Grid */}
      <div className="quick-actions-grid">
        {QUICK_ACTIONS.map(qa => (
          <button
            key={qa.id}
            className={`quick-action-btn${(g.cosmetics || []).includes('vip_dash') ? ' vip-action-btn' : ''}`}
            onClick={() => dispatch({ type: 'SET_PANEL', payload: qa.id })}
          >
            <span style={{ fontSize: 22 }}>{qa.icon}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{qa.label}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Today</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Revenue</span>
          <span className="row gap-8">
            <span className="font-bold text-green">${fmt(g.dayRev || g.weekRev || 0)}</span>
            <TrendArrow current={g.dayRev} previous={g.prevDayRev} />
          </span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Profit</span>
          <span className="row gap-8">
            <span className={`font-bold ${(g.dayProfit || g.weekProfit || 0) >= 0 ? 'text-green' : 'text-red'}`}>
              ${fmt(g.dayProfit || g.weekProfit || 0)}
            </span>
            <TrendArrow current={g.dayProfit} previous={g.prevDayProfit} />
          </span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Tires Sold</span>
          <span className="row gap-8">
            <span className="font-bold">{g.daySold || g.weekSold || 0}</span>
            <TrendArrow current={g.daySold} previous={g.prevDaySold} />
          </span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Margin</span>
          <span className={`font-bold ${(g.dayProfit || g.weekProfit || 0) >= 0 ? 'text-green' : 'text-red'}`}>
            {(g.dayRev || g.weekRev || 0) > 0 ? ((g.dayProfit || g.weekProfit || 0) / (g.dayRev || g.weekRev || 0) * 100).toFixed(1) : '0.0'}%
          </span>
        </div>
        {(g.dayServiceJobs || g.weekServiceJobs || 0) > 0 && (
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Services</span>
            <span className="font-bold text-green">
              {g.dayServiceJobs || g.weekServiceJobs || 0} jobs &middot; ${fmt(g.dayServiceRev || g.weekServiceRev || 0)}
            </span>
          </div>
        )}
      </div>

      {/* Daily Expenses Breakdown */}
      {totalDailyExpenses > 0 && (
        <div className="card">
          <div className="card-title">Daily Expenses</div>
          {staffCost > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Staff</span>
              <span className="text-red">-${fmt(staffCost)}</span>
            </div>
          )}
          {shopRentEst > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Shop Rent</span>
              <span className="text-red">-${fmt(shopRentEst)}</span>
            </div>
          )}
          {marketingCost > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Marketing</span>
              <span className="text-red">-${fmt(marketingCost)}</span>
            </div>
          )}
          {insuranceCost > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Insurance</span>
              <span className="text-red">-${fmt(insuranceCost)}</span>
            </div>
          )}
          {loanCost > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Loan Payments</span>
              <span className="text-red">-${fmt(loanCost)}</span>
            </div>
          )}
          <div className="row-between text-sm font-bold" style={{ borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 4 }}>
            <span>Total</span>
            <span className="text-red">-${fmt(totalDailyExpenses)}/day</span>
          </div>
        </div>
      )}

      {(g.history || []).length >= 2 && (
        <div className="card">
          <div className="card-title">30-Day Trends</div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Revenue</span>
            <span className="sparkline-container">
              <Sparkline data={(g.history || []).map(h => h.rev)} color="#66bb6a" />
            </span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Profit</span>
            <span className="sparkline-container">
              <Sparkline data={(g.history || []).map(h => h.profit)} color="#4fc3f7" />
            </span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Tires Sold</span>
            <span className="sparkline-container">
              <Sparkline data={(g.history || []).map(h => h.sold)} color="#ffd54f" />
            </span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Empire</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Wealth</span>
          <span className="font-bold text-gold">${fmt(getWealth(g))}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Total Revenue</span>
          <span className="font-bold">${fmt(g.totalRev)}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Shops</span>
          <span className="font-bold">{g.locations.length}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">TireCoins</span>
          <span className="font-bold text-gold">{g.tireCoins || 0}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Avg Margin</span>
          <span className={`font-bold ${g.totalProfit >= 0 ? 'text-green' : 'text-red'}`}>
            {g.totalRev > 0 ? (g.totalProfit / g.totalRev * 100).toFixed(1) : '0.0'}%
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Inventory ({inv}/{cap})</div>
        <div className="progress-bar mb-4">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        {Object.entries(TIRES).map(([k, t]) => {
          const qty = g.inventory[k] || 0;
          if (qty === 0) return null;
          return (
            <div key={k} className="row-between text-sm mb-4">
              <span>{t.n}</span>
              <span className="font-bold">{qty}</span>
            </div>
          );
        })}
        {inv === 0 && <div className="text-sm text-dim">No tires in stock. Source some!</div>}
      </div>

      {(g.log || []).length > 0 && (
        <div className="card">
          <div className="card-title">Events</div>
          {g.log.map((entry, i) => (
            <div key={i} className="text-sm mb-4">
              {typeof entry === 'string' ? entry : (entry.msg || '')}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
