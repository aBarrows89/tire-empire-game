import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { fmt } from '@shared/helpers/format.js';
import { TIRES } from '@shared/constants/tires.js';
import { CITIES } from '@shared/constants/cities.js';
import { getWealth } from '@shared/helpers/wealth.js';
import { getInv, getCap, getLocCap } from '@shared/helpers/inventory.js';
import { PAY } from '@shared/constants/staff.js';
import { MARKETING } from '@shared/constants/marketing.js';
import { INSURANCE } from '@shared/constants/insurance.js';
import { FACTORY } from '@shared/constants/factory.js';
import { MONET } from '@shared/constants/monetization.js';
import { PROGRESSION_MILESTONES } from '@shared/constants/progression.js';
import { getCalendar } from '@shared/helpers/calendar.js';
import { getTireSeasonMult } from '@shared/constants/tireSeasonal.js';
import VinnieTip from '../VinnieTip.jsx';
import Sparkline from '../Sparkline.jsx';
import TrendArrow from '../TrendArrow.jsx';
import LowStockBanner from '../LowStockBanner.jsx';
import { hapticsLight } from '../../api/haptics.js';
import { postAction, getExchangeOverview } from '../../api/client.js';

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
  factoryWholesale: 'Factory Wholesale',
  gov: 'Gov Contracts',
  van: 'Van Sales',
  services: 'Services',
};

export default function DashboardPanel() {
  const { state, dispatch, refreshState } = useGame();
  const g = state.game;
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [intelBusy, setIntelBusy] = useState(false);
  const [marketReportData, setMarketReportData] = useState(null);

  // Fetch exchange overview for market report summary (throttled — every 10 days)
  const lastExchangeFetch = React.useRef(0);
  useEffect(() => {
    if (g.stockExchange?.hasBrokerage) {
      if (g.day - lastExchangeFetch.current < 10 && marketReportData) return;
      lastExchangeFetch.current = g.day;
      getExchangeOverview().then(ov => {
        if (ov?.marketReport) setMarketReportData(ov.marketReport);
      }).catch(() => {});
    }
  }, [g.stockExchange?.hasBrokerage, g.day]);

  const inv = getInv(g);
  const cap = getCap(g);
  const pct = cap > 0 ? Math.round((inv / cap) * 100) : 0;

  // Memoize expensive calculations that don't need to recalc every render
  const { whInv, locInv, totalInventory, totalDailyExpenses, staffCost, shopRentEst, marketingCost, insuranceCost, loanCost, factoryOverhead, factoryPayroll } = useMemo(() => {
    const whInv = Object.values(g.warehouseInventory || {}).reduce((a, b) => a + b, 0);
    const locInv = (g.locations || []).reduce((sum, loc) => {
      return sum + Object.values(loc.inventory || {}).reduce((a, b) => a + b, 0);
    }, 0);
    const staffCost = Object.entries(g.staff || {}).reduce((a, [k, v]) => a + (PAY[k] || 0) * v, 0) / 30;
    const shopRentEst = (g.locations || []).length * 4500 / 30;
    const marketingCost = (g.locations || []).reduce((a, loc) => {
      const mktg = loc.marketing && MARKETING[loc.marketing];
      return a + (mktg ? (mktg.costPerDay || mktg.dailyCost || 0) : 0);
    }, 0);
    const insuranceCost = g.insurance && INSURANCE[g.insurance] ? INSURANCE[g.insurance].monthlyCost / 30 : 0;
    const loanCost = (g.loans || []).reduce((a, l) => a + (l.weeklyPayment || 0) / 7, 0);
    const factoryOverhead = g.hasFactory ? FACTORY.monthlyOverhead / 30 : 0;
    const factStaff = g.factory?.staff || {};
    const factoryPayroll = g.hasFactory
      ? Object.entries(factStaff).reduce((a, [role, count]) => {
          const def = FACTORY.staff?.[role];
          return a + (def ? def.salary * count : 0);
        }, 0) / 30
      : 0;
    return {
      whInv, locInv, totalInventory: whInv + locInv,
      totalDailyExpenses: staffCost + shopRentEst + marketingCost + insuranceCost + loanCost + factoryOverhead + factoryPayroll,
      staffCost, shopRentEst, marketingCost, insuranceCost, loanCost, factoryOverhead, factoryPayroll,
    };
  }, [g.day]);

  // Staff capacity calculations
  const techs = g.staff?.techs || 0;
  const sales = g.staff?.sales || 0;
  const managers = g.staff?.managers || 0;
  const drivers = g.staff?.drivers || 0;
  const techCap = techs * 12 * (1 + managers * 0.15);
  const salesCap = sales * 8 * (1 + managers * 0.15);
  const effectiveCap = Math.min(techCap, salesCap);

  // Channel data
  const channels = g.dayRevByChannel || {};
  const soldByChannel = g.daySoldByChannel || {};
  const hasChannelData = Object.values(channels).some(v => v > 0);

  // Net daily P&L
  const netPL = (g.dayRev || 0) - totalDailyExpenses;

  // Global events from tick broadcast
  const globalEvents = state.globalEvents || [];
  const tcValue = state.tcValue || 50000;
  const tcMetrics = state.tcMetrics || null;
  const tcHistory = state.tcHistory || [];

  // TC storage cap
  const tcStorageLevel = g.tcStorageLevel || 0;
  let tcCap = MONET.tcStorage.baseCap;
  if (g.isPremium) tcCap += MONET.tcStorage.premiumBonus;
  for (let i = 0; i < tcStorageLevel && i < MONET.tcStorage.upgrades.length; i++) tcCap += MONET.tcStorage.upgrades[i].addCap;
  const tcCurrent = g.tireCoins || 0;
  const tcFillPct = tcCap > 0 ? Math.min(100, Math.round((tcCurrent / tcCap) * 100)) : 0;
  const nextUpgrade = tcStorageLevel < MONET.tcStorage.upgrades.length ? MONET.tcStorage.upgrades[tcStorageLevel] : null;
  const [tcUpgradeBusy, setTcUpgradeBusy] = useState(false);
  const [showTcInfo, setShowTcInfo] = useState(false);

  return (
    <>
      <VinnieTip />

      {/* Active Global Events */}
      {globalEvents.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid #f0c040', borderColor: '#f0c040' }}>
          <div className="card-title" style={{ color: '#f0c040' }}>Global Events</div>
          {globalEvents.map(evt => (
            <div key={evt.id} className="row-between text-sm mb-4">
              <span>
                <span style={{ marginRight: 6 }}>{evt.icon}</span>
                <span className="font-bold">{evt.name}</span>
              </span>
              <span className="text-dim">{evt.daysLeft}d left</span>
            </div>
          ))}
          <div className="text-xs text-dim" style={{ marginTop: 4 }}>
            {globalEvents.map(evt => evt.description).join(' | ')}
          </div>
        </div>
      )}

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
                <span className="text-dim">Gross Revenue</span>
                <span className="font-bold text-green">${fmt(g.dayRev || 0)}</span>
              </div>
              <div className="row-between text-sm mb-4">
                <span className="text-dim">COGS</span>
                <span className="font-bold text-red">-${fmt(Math.max(0, (g.dayRev || 0) - (g.dayProfit || 0)))}</span>
              </div>
              <div className="row-between text-sm mb-4">
                <span className="text-dim">Gross Profit</span>
                <span className={`font-bold ${(g.dayProfit || 0) >= 0 ? 'text-green' : 'text-red'}`}>
                  ${fmt(g.dayProfit || 0)}
                </span>
              </div>
              <div className="row-between text-sm mb-4">
                <span className="text-dim">Expenses</span>
                <span className="font-bold text-red">-${fmt(totalDailyExpenses)}</span>
              </div>
              <div className="row-between text-sm mb-4" style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
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
            const sold = soldByChannel[key] || 0;
            const pctOfTotal = (g.dayRev || 0) > 0 ? Math.round((rev / g.dayRev) * 100) : 0;
            return (
              <div key={key} className="row-between text-sm mb-4">
                <span className="text-dim">{label}</span>
                <span>
                  <span className="font-bold text-green">${fmt(rev)}</span>
                  {sold > 0 && <span className="text-dim" style={{ marginLeft: 6 }}>{sold} tires</span>}
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
            const locCap = getLocCap(loc);
            const fillPct = locCap > 0 ? Math.round((locInvNow / locCap) * 100) : 0;
            const stats = loc.dailyStats || { rev: 0, sold: 0, profit: 0 };
            const loyalty = Math.round(loc.loyalty || 0);
            const isProfitable = stats.profit >= 0;
            const storeAge = loc.openedDay ? Math.max(0, (g.day || 1) - loc.openedDay) : null;
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
                  {storeAge != null && <span className="text-dim">{storeAge}d old</span>}
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

      {/* Market Report Summary (for brokerage holders) */}
      {g.stockExchange?.hasBrokerage && marketReportData && (
        <div className="card">
          <div className="card-title">Market Report</div>
          {(marketReportData.topMovers || []).slice(0, 3).map(m => (
            <div key={m.ticker} className="row-between text-sm mb-4">
              <span className="font-bold">${m.ticker}</span>
              <span style={{ color: m.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {m.change >= 0 ? '+' : ''}{m.change?.toFixed(2)}%
              </span>
            </div>
          ))}
          <button
            className="btn btn-full btn-sm"
            style={{ marginTop: 4 }}
            onClick={() => { hapticsLight(); dispatch({ type: 'SET_PANEL', payload: 'exchange' }); }}
          >
            View Full Report
          </button>
        </div>
      )}

      {/* Market Intel — active */}
      {g.marketIntel && (g.day || 0) < g.marketIntel.expiresDay && (
        <div className="card" style={{ borderLeft: '3px solid #f0c040' }}>
          <div className="card-title">
            Market Intel <span className="text-xs text-dim" style={{ marginLeft: 8 }}>
              {g.marketIntel.expiresDay - (g.day || 0)} days left
            </span>
          </div>
          <div className="text-xs text-dim mb-4">Top 20 cities by seasonal demand</div>
          {(() => {
            const cal = getCalendar((g.startDay || 1) + (g.day || 1) - 1);
            const season = cal.season;
            const mainTireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
            const ranked = CITIES.map(city => {
              const baseDem = city.dem || 10;
              const seasonBoost = mainTireKeys.reduce((sum, tk) => sum + getTireSeasonMult(tk, season), 0) / mainTireKeys.length;
              const winterBoost = season === 'Winter' || season === 'Fall' ? (city.win || 1.0) : 1.0;
              const score = Math.round(baseDem * seasonBoost * winterBoost);
              const topTypes = mainTireKeys
                .map(tk => ({ key: tk, mult: getTireSeasonMult(tk, season) }))
                .sort((a, b) => b.mult - a.mult)
                .slice(0, 3)
                .map(t => TIRES[t.key]?.n || t.key);
              const hasShop = (g.locations || []).some(l => l.cityId === city.id);
              return { city, score, topTypes, hasShop };
            }).sort((a, b) => b.score - a.score).slice(0, 20);
            return ranked.map((r, i) => (
              <div key={r.city.id} className="row-between text-sm mb-4">
                <span>
                  <span className="text-dim" style={{ width: 20, display: 'inline-block' }}>{i + 1}.</span>
                  <span className="font-bold">{r.city.name}, {r.city.state}</span>
                  {r.hasShop && <span className="text-xs text-green" style={{ marginLeft: 4 }}>(you)</span>}
                </span>
                <span className="text-xs text-dim">
                  {r.score} dem · {r.topTypes.join(', ')}
                </span>
              </div>
            ));
          })()}
        </div>
      )}

      {/* Market Intel — purchase card */}
      {(!g.marketIntel || (g.day || 0) >= g.marketIntel.expiresDay) && (
        <div className="card">
          <div className="card-title">Market Intel</div>
          <div className="text-xs text-dim mb-4">
            Buy a 7-day city demand analysis. See which cities have the highest seasonal demand and best tire types to stock.
          </div>
          <button
            className="btn btn-full btn-sm"
            style={{ background: (g.tireCoins || 0) >= 100 ? 'linear-gradient(135deg, #f0c040, #d4a020)' : undefined, color: (g.tireCoins || 0) >= 100 ? '#000' : undefined }}
            disabled={(g.tireCoins || 0) < 100 || intelBusy}
            onClick={async () => {
              if (!window.confirm('Buy Market Intel for 100 TC?\n\nYou\'ll see a 7-day city demand heat map on your dashboard.')) return;
              setIntelBusy(true);
              const result = await postAction('buyMarketIntel', {});
              await refreshState();
              setIntelBusy(false);
              if (result?.error) alert(result.error);
            }}
          >
            {intelBusy ? 'Buying...' : `Buy Intel (100 TC)`}
          </button>
          {(g.tireCoins || 0) < 100 && (
            <div className="text-xs text-dim" style={{ marginTop: 4 }}>Need 100 TC (you have {g.tireCoins || 0})</div>
          )}
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
          <span className="font-bold text-gold">{tcCurrent} / {tcCap}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Avg Margin</span>
          <span className={`font-bold ${g.totalProfit >= 0 ? 'text-green' : 'text-red'}`}>
            {g.totalRev > 0 ? (g.totalProfit / g.totalRev * 100).toFixed(1) : '0.0'}%
          </span>
        </div>
      </div>

      {/* TC Economy */}
      <div className="card" style={{ borderLeft: '3px solid #f0c040' }}>
        <div className="card-title" style={{ color: '#f0c040', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          TireCoin Economy
          <span
            onClick={() => setShowTcInfo(!showTcInfo)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, borderRadius: '50%', fontSize: 12, fontWeight: 700,
              background: showTcInfo ? '#f0c040' : 'rgba(240,192,64,0.15)',
              color: showTcInfo ? '#000' : '#f0c040',
              cursor: 'pointer', lineHeight: 1,
            }}
          >i</span>
        </div>
        {showTcInfo && (
          <div style={{ background: 'rgba(240,192,64,0.08)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 12, lineHeight: 1.5, color: 'var(--text-dim)' }}>
            <div style={{ fontWeight: 600, color: '#f0c040', marginBottom: 4 }}>How TireCoins Work</div>
            <p style={{ margin: '0 0 6px' }}>TireCoins (TC) are the premium currency in Tire Empire. Their value fluctuates based on real market forces:</p>
            <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Supply</b> — More TC in circulation pushes the price down. Scarce TC drives it up.</p>
            <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Velocity</b> — Active spending and trading increases demand and raises the price.</p>
            <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Rubber</b> — Global rubber output affects tire production costs and TC value.</p>
            <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Sentiment</b> — Player reputation levels signal market confidence.</p>
            <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Whale</b> — If one player holds a huge share of TC, it destabilizes the market.</p>
            <p style={{ margin: '0 0 4px' }}><b style={{ color: 'var(--text)' }}>Events</b> — Global events (rubber shortage, trade wars, etc.) cause price swings.</p>
            <p style={{ margin: '6px 0 0', color: 'var(--text)' }}>Upgrade your TC Storage to hold more coins. Buy low, sell high!</p>
          </div>
        )}
        <div className="row-between text-sm mb-4">
          <span className="text-dim">TC Value</span>
          <span className="font-bold text-gold">${fmt(tcValue)}</span>
        </div>
        {tcHistory.length >= 2 && (
          <div className="row-between mb-4">
            <span className="text-sm text-dim">TC Price History</span>
            <span className="sparkline-container">
              <Sparkline data={tcHistory.map(h => h.value)} color="#f0c040" />
            </span>
          </div>
        )}
        <div className="text-xs text-dim mb-4">Storage: {tcCurrent} / {tcCap} TC ({tcFillPct}%)</div>
        <div className="progress-bar mb-4" style={{ height: 6 }}>
          <div className="progress-fill" style={{ width: `${tcFillPct}%`, background: tcFillPct >= 90 ? 'var(--red)' : tcFillPct >= 70 ? '#f0c040' : 'var(--green)' }} />
        </div>
        {nextUpgrade && (
          <button
            className="btn btn-full btn-sm"
            style={{ background: tcCurrent >= nextUpgrade.tcCost ? 'linear-gradient(135deg, #f0c040, #d4a020)' : undefined, color: tcCurrent >= nextUpgrade.tcCost ? '#000' : undefined }}
            disabled={tcCurrent < nextUpgrade.tcCost || tcUpgradeBusy}
            onClick={async () => {
              if (!window.confirm(`Upgrade TC Storage for ${nextUpgrade.tcCost} TC?\n\n+${nextUpgrade.addCap} TC capacity`)) return;
              setTcUpgradeBusy(true);
              const result = await postAction('upgradeTcStorage', {});
              await refreshState();
              setTcUpgradeBusy(false);
              if (result?.error) alert(result.error);
            }}
          >
            {tcUpgradeBusy ? 'Upgrading...' : `Upgrade Storage +${nextUpgrade.addCap} TC (${nextUpgrade.tcCost} TC)`}
          </button>
        )}
        {!nextUpgrade && <div className="text-xs text-dim">Max storage level reached</div>}
        {tcMetrics && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            <div className="text-xs text-dim mb-4">Market Factors</div>
            {[
              ['Supply', tcMetrics.tcSupplyFactor],
              ['Velocity', tcMetrics.velocityFactor],
              ['Rubber', tcMetrics.rubberFactor],
              ['Sentiment', tcMetrics.sentimentFactor],
              ['Whale', tcMetrics.marketMakerFactor],
              ['Events', tcMetrics.chaosFactor],
            ].map(([label, val]) => (
              <div key={label} className="row-between text-xs mb-4">
                <span className="text-dim">{label}</span>
                <span style={{ color: val > 1.02 ? 'var(--green)' : val < 0.98 ? 'var(--red)' : 'var(--text-dim)' }}>
                  {val != null ? (val > 1 ? '+' : '') + ((val - 1) * 100).toFixed(1) + '%' : '--'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progression Roadmap */}
      {(() => {
        const rep = g.reputation || 0;
        const upcoming = PROGRESSION_MILESTONES.filter(m => rep < m.rep).slice(0, 3);
        const lastUnlocked = [...PROGRESSION_MILESTONES].reverse().find(m => rep >= m.rep);
        if (upcoming.length === 0) return null;
        return (
          <div className="card">
            <div className="card-title">Your Roadmap</div>
            <div className="text-xs text-dim mb-4">Features unlock as your reputation grows.</div>
            {lastUnlocked && (
              <div className="roadmap-item" style={{ opacity: 0.7 }}>
                <span className="roadmap-icon">{lastUnlocked.icon}</span>
                <div style={{ flex: 1 }}>
                  <div className="text-sm font-bold">{lastUnlocked.label} <span className="roadmap-check">{'\u2713'}</span></div>
                  <div className="text-xs text-dim">Unlocked!</div>
                </div>
              </div>
            )}
            {upcoming.map(m => (
              <div className="roadmap-item" key={m.panel} onClick={() => { hapticsLight(); dispatch({ type: 'SET_PANEL', payload: m.panel }); }} style={{ cursor: 'pointer' }}>
                <span className="roadmap-icon" style={{ opacity: 0.4 }}>{m.icon}</span>
                <div style={{ flex: 1 }}>
                  <div className="text-sm font-bold">{m.label}</div>
                  <div className="text-xs text-dim">{m.desc} &mdash; Rep {m.rep}</div>
                  <div className="roadmap-bar">
                    <div className="roadmap-fill" style={{ width: `${Math.min(100, (rep / m.rep) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

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

      {/* Tire Sales Report — last 7 days */}
      {(g.salesByType || []).length > 0 && (
        <div className="card">
          <div className="card-title">{'\u{1F4CA}'} Tire Sales Report (Last 7 Days)</div>
          <div className="text-xs text-dim mb-4">Which tires are selling — and which aren't.</div>
          {(() => {
            const recent = (g.salesByType || []).slice(-7);
            const totals = {};
            for (const entry of recent) {
              for (const [k, v] of Object.entries(entry)) {
                if (k === 'day') continue;
                totals[k] = (totals[k] || 0) + v;
              }
            }
            // All tire types the player has in inventory or has sold
            const allTypes = new Set([
              ...Object.keys(totals),
              ...Object.keys(g.warehouseInventory || {}),
              ...(g.locations || []).flatMap(l => Object.keys(l.inventory || {})),
            ]);
            const rows = [...allTypes]
              .map(k => ({ key: k, name: TIRES[k]?.n || k, sold: totals[k] || 0, inStock: (g.warehouseInventory?.[k] || 0) + (g.locations || []).reduce((a, l) => a + (l.inventory?.[k] || 0), 0) }))
              .sort((a, b) => b.sold - a.sold);
            if (rows.length === 0) return <div className="text-xs text-dim">No data yet.</div>;
            const maxSold = Math.max(1, ...rows.map(r => r.sold));
            return (
              <div className="sales-report-table">
                {rows.map(r => (
                  <div key={r.key} className="sales-report-row">
                    <div className="sales-report-name">{r.name}</div>
                    <div className="sales-report-bar-wrap">
                      <div
                        className="sales-report-bar"
                        style={{
                          width: `${(r.sold / maxSold) * 100}%`,
                          background: r.sold === 0 ? 'var(--red)' : r.sold < maxSold * 0.3 ? 'var(--gold)' : 'var(--green)',
                          opacity: r.sold === 0 ? 0.3 : 0.8,
                        }}
                      />
                    </div>
                    <div className="sales-report-nums">
                      <span className="font-bold">{r.sold}</span>
                      <span className="text-dim"> sold</span>
                      <span className="text-dim" style={{ marginLeft: 6 }}>{r.inStock} in stock</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

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
