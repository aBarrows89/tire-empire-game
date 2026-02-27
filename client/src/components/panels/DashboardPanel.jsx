import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { fmt } from '@shared/helpers/format.js';
import { TIRES } from '@shared/constants/tires.js';
import { CITIES } from '@shared/constants/cities.js';
import { getWealth } from '@shared/helpers/wealth.js';
import { getInv, getCap } from '@shared/helpers/inventory.js';
import { PAY } from '@shared/constants/staff.js';
import { MARKETING } from '@shared/constants/marketing.js';
import { INSURANCE } from '@shared/constants/insurance.js';
import { FACTORY } from '@shared/constants/factory.js';
import VinnieTip from '../VinnieTip.jsx';
import Sparkline from '../Sparkline.jsx';
import TrendArrow from '../TrendArrow.jsx';
import LowStockBanner from '../LowStockBanner.jsx';
import { hapticsLight } from '../../api/haptics.js';

const QUICK_ACTIONS = [
  { id: 'source', icon: '\u{1F527}', label: 'Source' },
  { id: 'pricing', icon: '\u{1F4B2}', label: 'Prices' },
  { id: 'shop', icon: '\u{1F3EA}', label: 'Shops' },
  { id: 'bank', icon: '\u{1F3E6}', label: 'Bank' },
  { id: 'supplier', icon: '\u{1F69A}', label: 'Supply' },
  { id: 'staff', icon: '\u{1F465}', label: 'Staff' },
];

const CHANNEL_LABELS = {
  shops: 'Shops',
  flea: 'Flea Markets',
  carMeets: 'Car Meets',
  ecom: 'E-Commerce',
  wholesale: 'Wholesale',
  gov: 'Gov Contracts',
  van: 'Van Sales',
  services: 'Services',
};

export default function DashboardPanel() {
  const { state, dispatch } = useGame();
  const g = state.game;
  const [summaryOpen, setSummaryOpen] = useState(true);

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
  const shopRentEst = (g.locations || []).length * 4500 / 30;
  const marketingCost = (g.locations || []).reduce((a, loc) => {
    const mktg = loc.marketing && MARKETING[loc.marketing];
    return a + (mktg ? (mktg.costPerDay || mktg.dailyCost || 0) : 0);
  }, 0);
  const insuranceCost = g.insurance && INSURANCE[g.insurance] ? INSURANCE[g.insurance].monthlyCost / 30 : 0;
  const loanCost = (g.loans || []).reduce((a, l) => {
    const wkPmt = l.weeklyPayment || 0;
    return a + wkPmt / 7;
  }, 0);

  // Factory costs
  const factoryOverhead = g.hasFactory ? FACTORY.monthlyOverhead / 30 : 0;
  const factoryStaff = g.factory?.staff || {};
  const factoryPayroll = g.hasFactory
    ? Object.entries(factoryStaff).reduce((a, [role, count]) => {
        const def = FACTORY.staff?.[role];
        return a + (def ? def.salary * count : 0);
      }, 0) / 30
    : 0;

  const totalDailyExpenses = staffCost + shopRentEst + marketingCost + insuranceCost + loanCost + factoryOverhead + factoryPayroll;

  // Staff capacity calculations
  const techs = g.staff?.techs || 0;
  const sales = g.staff?.sales || 0;
  const managers = g.staff?.managers || 0;
  const drivers = g.staff?.drivers || 0;
  const techCap = techs * 8 * (1 + managers * 0.15);
  const salesCap = sales * 5 * (1 + managers * 0.15);
  const effectiveCap = Math.min(techCap, salesCap);

  // Channel data
  const channels = g.dayRevByChannel || {};
  const hasChannelData = Object.values(channels).some(v => v > 0);

  // Net daily P&L
  const netPL = (g.dayRev || 0) - totalDailyExpenses;

  return (
    <>
      <VinnieTip />

      {/* Daily Summary Card */}
      {g.day >= 1 && (
        <div className="card" style={{ borderColor: 'var(--accent)', borderLeft: '3px solid var(--accent)' }}>
          <div
            className="row-between"
            style={{ cursor: 'pointer' }}
            onClick={() => setSummaryOpen(!summaryOpen)}
          >
            <div className="card-title" style={{ marginBottom: 0 }}>
              Day {g.day} Summary
            </div>
            <span className="text-dim">{summaryOpen ? '\u25B2' : '\u25BC'}</span>
          </div>
          {summaryOpen && (
            <div style={{ marginTop: 8 }}>
              <div className="row-between text-sm mb-4">
                <span className="text-dim">Tires Sold</span>
                <span className="font-bold">{g.daySold || 0}</span>
              </div>
              <div className="row-between text-sm mb-4">
                <span className="text-dim">Revenue</span>
                <span className="font-bold text-green">${fmt(g.dayRev || 0)}</span>
              </div>
              <div className="row-between text-sm mb-4">
                <span className="text-dim">Profit</span>
                <span className={`font-bold ${(g.dayProfit || 0) >= 0 ? 'text-green' : 'text-red'}`}>
                  ${fmt(g.dayProfit || 0)}
                </span>
              </div>
              <div className="row-between text-sm mb-4">
                <span className="text-dim">Net P&L</span>
                <span className={`font-bold ${netPL >= 0 ? 'text-green' : 'text-red'}`}>
                  ${fmt(netPL)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

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
            onClick={() => { hapticsLight(); dispatch({ type: 'SET_PANEL', payload: qa.id }); }}
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

      {/* Sales Channel Breakdown */}
      {hasChannelData && (
        <div className="card">
          <div className="card-title">Revenue by Channel</div>
          {Object.entries(CHANNEL_LABELS).map(([key, label]) => {
            const rev = channels[key] || 0;
            if (rev <= 0) return null;
            const pctOfTotal = (g.dayRev || 0) > 0 ? Math.round((rev / g.dayRev) * 100) : 0;
            return (
              <div key={key} className="row-between text-sm mb-4">
                <span className="text-dim">{label}</span>
                <span>
                  <span className="font-bold text-green">${fmt(rev)}</span>
                  <span className="text-dim" style={{ marginLeft: 6 }}>{pctOfTotal}%</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-Location Performance */}
      {(g.locations || []).length > 0 && (
        <div className="card">
          <div className="card-title">Store Performance</div>
          {g.locations.map((loc, i) => {
            const city = CITIES.find(c => c.id === loc.cityId);
            const cityName = city ? `${city.name}, ${city.state}` : (loc.cityId || 'Unknown');
            const locInvNow = Object.values(loc.inventory || {}).reduce((a, b) => a + b, 0);
            const locCap = loc.capacity || 500;
            const fillPct = locCap > 0 ? Math.round((locInvNow / locCap) * 100) : 0;
            const stats = loc.dailyStats || { rev: 0, sold: 0, profit: 0 };
            const loyalty = Math.round(loc.loyalty || 0);
            const isProfitable = stats.profit >= 0;
            return (
              <div key={loc.id || i} style={{ marginBottom: i < g.locations.length - 1 ? 10 : 0, paddingBottom: i < g.locations.length - 1 ? 10 : 0, borderBottom: i < g.locations.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div className="row-between mb-4">
                  <span className="font-bold text-sm">{cityName}</span>
                  <span className={`font-bold text-sm ${isProfitable ? 'text-green' : 'text-red'}`}>
                    ${fmt(stats.rev)}
                  </span>
                </div>
                <div className="row-between text-xs mb-4">
                  <span className="text-dim">Sold: {stats.sold}</span>
                  <span className="text-dim">Loyalty: {loyalty}</span>
                  <span className="text-dim">Stock: {fillPct}%</span>
                </div>
                <div className="progress-bar" style={{ height: 3 }}>
                  <div className="progress-fill" style={{ width: `${fillPct}%`, background: fillPct < 20 ? 'var(--red)' : fillPct < 50 ? 'var(--accent)' : 'var(--green)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Staff Efficiency */}
      {(techs > 0 || sales > 0 || drivers > 0) && (
        <div className="card">
          <div className="card-title">Staff Efficiency</div>
          {techs > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Tech Utilization</span>
              <span className={`font-bold ${techCap > 0 && (g.daySold || 0) / techCap > 0.7 ? 'text-green' : 'text-accent'}`}>
                {g.daySold || 0}/{Math.round(techCap)} ({techCap > 0 ? Math.round(((g.daySold || 0) / techCap) * 100) : 0}%)
              </span>
            </div>
          )}
          {sales > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Sales Coverage</span>
              <span className={`font-bold ${salesCap > 0 && (g.daySold || 0) / salesCap > 0.7 ? 'text-green' : 'text-accent'}`}>
                {g.daySold || 0}/{Math.round(salesCap)} ({salesCap > 0 ? Math.round(((g.daySold || 0) / salesCap) * 100) : 0}%)
              </span>
            </div>
          )}
          {drivers > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Driver Capacity</span>
              <span className="font-bold">{drivers * 40} tires/day</span>
            </div>
          )}
          {effectiveCap > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Bottleneck</span>
              <span className="font-bold text-accent">
                {techCap <= salesCap ? 'Techs (hire more techs)' : 'Sales (hire more sales)'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Daily Expenses Breakdown */}
      {totalDailyExpenses > 0 && (
        <div className="card">
          <div className="card-title">Daily Expenses</div>
          {staffCost > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Store Staff</span>
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
          {factoryOverhead > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Factory Overhead</span>
              <span className="text-red">-${fmt(factoryOverhead)}</span>
            </div>
          )}
          {factoryPayroll > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Factory Staff</span>
              <span className="text-red">-${fmt(factoryPayroll)}</span>
            </div>
          )}
          <div className="row-between text-sm font-bold" style={{ borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 4 }}>
            <span>Total Expenses</span>
            <span className="text-red">-${fmt(totalDailyExpenses)}/day</span>
          </div>
          <div className="row-between text-sm font-bold" style={{ marginTop: 6 }}>
            <span>Net P&L</span>
            <span className={netPL >= 0 ? 'text-green' : 'text-red'}>
              {netPL >= 0 ? '+' : ''}${fmt(netPL)}/day
            </span>
          </div>
        </div>
      )}

      {/* Cash Forecast */}
      {totalDailyExpenses > 0 && (
        <div className="card" style={{ borderLeft: `3px solid ${netPL >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
          <div className="card-title">Cash Forecast</div>
          <div className="row-between text-sm mb-4">
            <span className="text-dim">Current Cash</span>
            <span className="font-bold text-green">${fmt(g.cash)}</span>
          </div>
          <div className="row-between text-sm mb-4">
            <span className="text-dim">Daily Net</span>
            <span className={`font-bold ${netPL >= 0 ? 'text-green' : 'text-red'}`}>
              {netPL >= 0 ? '+' : ''}${fmt(netPL)}
            </span>
          </div>
          <div className="row-between text-sm mb-4">
            <span className="text-dim">7-Day Forecast</span>
            <span className={`font-bold ${(g.cash + netPL * 7) >= 0 ? 'text-green' : 'text-red'}`}>
              ${fmt(g.cash + netPL * 7)}
            </span>
          </div>
          <div className="row-between text-sm mb-4">
            <span className="text-dim">30-Day Forecast</span>
            <span className={`font-bold ${(g.cash + netPL * 30) >= 0 ? 'text-green' : 'text-red'}`}>
              ${fmt(g.cash + netPL * 30)}
            </span>
          </div>
          {netPL < 0 && (() => {
            const daysUntilBroke = Math.floor(g.cash / Math.abs(netPL));
            return (
              <>
                <div className="row-between text-sm mb-4" style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                  <span className="text-dim">Days Until Broke</span>
                  <span className="font-bold text-red">{daysUntilBroke} day{daysUntilBroke !== 1 ? 's' : ''}</span>
                </div>
                {daysUntilBroke < 7 && (
                  <button
                    className="btn btn-full btn-sm"
                    style={{ marginTop: 4 }}
                    onClick={() => { hapticsLight(); dispatch({ type: 'SET_PANEL', payload: 'bank' }); }}
                  >
                    Go to Bank
                  </button>
                )}
              </>
            );
          })()}
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
          const ap = g.autoPrice && g.autoPrice[k];
          const isAuto = (g.staff?.pricingAnalyst || 0) > 0 && ap && ap.strategy !== 'off';
          return (
            <div key={k} className="row-between text-sm mb-4">
              <span>{t.n}{isAuto && <span className="auto-badge pulse-badge">AUTO</span>}</span>
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
