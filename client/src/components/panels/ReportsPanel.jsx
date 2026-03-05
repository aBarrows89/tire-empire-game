import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { fmt } from '@shared/helpers/format.js';
import { getCalendar, formatDateShort, MONTH_NAMES } from '@shared/helpers/calendar.js';
import { CITIES } from '@shared/constants/cities.js';
import { TIRES } from '@shared/constants/tires.js';

// ── Sparkline SVG chart ──────────────────────────────────────
function Sparkline({ data, color = '#4ea8de', height = 32, fill = false }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const path = `M ${pts.join(' L ')}`;
  const fillPath = `${path} L ${w},${h} L 0,${h} Z`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {fill && <path d={fillPath} fill={color} fillOpacity={0.12} />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Last value dot */}
      <circle cx={w} cy={pts[pts.length-1].split(',')[1]} r="2.5" fill={color} />
    </svg>
  );
}

// ── Bar chart ────────────────────────────────────────────────
function BarChart({ data, color = '#4ea8de', height = 48, labelKey, valueKey }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {data.map((d, i) => {
        const pct = ((d[valueKey] || 0) / max) * 100;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ width: '100%', background: color, height: `${pct}%`, minHeight: pct > 0 ? 2 : 0, borderRadius: '2px 2px 0 0', opacity: 0.85 }} />
          </div>
        );
      })}
    </div>
  );
}

// ── Stat row ─────────────────────────────────────────────────
function StatRow({ label, value, sub, color, trend }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #1e1e1e' }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
        {sub && <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{sub}</div>}
      </div>
    </div>
  );
}

function Section({ title, children, accent = '#4ea8de' }) {
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: accent, textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${accent}22` }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────
export default function ReportsPanel() {
  const { state } = useGame();
  const g = state.game;
  if (!g) return null;

  const playerDay = g.day || 1;
  const worldDay = (g.startDay || 1) + playerDay - 1;
  const cal = getCalendar(worldDay);

  // History arrays
  const history = g.history || [];         // last 30 days: {day,rev,profit,sold,cash,rep}
  const revHistory = g.revHistory || [];   // last 60 days by channel
  const salesByType = g.salesByType || []; // last 30 days by tire type

  // ── Derived metrics ──
  const last7 = history.slice(-7);
  const last30 = history.slice(-30);
  const prev7 = history.slice(-14, -7);

  const sum = (arr, key) => arr.reduce((a, d) => a + (d[key] || 0), 0);
  const avg = (arr, key) => arr.length ? sum(arr, key) / arr.length : 0;

  const rev7 = sum(last7, 'rev');
  const rev30 = sum(last30, 'rev');
  const profit7 = sum(last7, 'profit');
  const profit30 = sum(last30, 'profit');
  const sold7 = sum(last7, 'sold');
  const sold30 = sum(last30, 'sold');
  const avgDailyRev = avg(last30, 'rev');
  const avgDailyProfit = avg(last30, 'profit');
  const prevRev7 = sum(prev7, 'rev');
  const revTrend = prevRev7 > 0 ? ((rev7 - prevRev7) / prevRev7) * 100 : 0;
  const margin30 = rev30 > 0 ? (profit30 / rev30) * 100 : 0;

  // Channel breakdown (last 30 days)
  const channels = ['shops', 'wholesale', 'ecom', 'services', 'flea', 'carMeets', 'van', 'factoryWholesale'];
  const channelLabels = { shops: 'Retail Shops', wholesale: 'Wholesale', ecom: 'E-Commerce', services: 'Services', flea: 'Flea Market', carMeets: 'Car Meets', van: 'Van Sales', factoryWholesale: 'Factory Wholesale' };
  const channelColors = { shops: '#4ea8de', wholesale: '#7c6fcd', ecom: '#4db6ac', services: '#81c784', flea: '#ffb74d', carMeets: '#f06292', van: '#aed581', factoryWholesale: '#ff8a65' };
  const channelTotals = channels.map(ch => ({
    channel: ch,
    label: channelLabels[ch],
    total: revHistory.reduce((a, d) => a + (d[ch] || 0), 0),
    color: channelColors[ch],
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const totalChannelRev = channelTotals.reduce((a, c) => a + c.total, 0);

  // Top tire types (last 30 days)
  const tireTotals = {};
  for (const day of salesByType) {
    for (const [type, qty] of Object.entries(day)) {
      if (type === 'day') continue;
      tireTotals[type] = (tireTotals[type] || 0) + qty;
    }
  }
  const topTires = Object.entries(tireTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([type, qty]) => ({ type, qty, label: TIRES[type]?.name || type }));

  // Locations breakdown
  const locations = g.locations || [];
  const locData = locations.map(loc => {
    const city = CITIES.find(c => c.id === loc.cityId);
    const rev = loc.dailyStats?.rev || 0;
    const profit = loc.dailyStats?.profit || 0;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;
    return { loc, city, rev, profit, margin };
  });
  const totalLocRev = locData.reduce((a, l) => a + l.rev, 0);

  // Loans summary
  const loans = g.loans || [];
  const totalOwed = loans.reduce((a, l) => a + (l.remaining || l.balance || 0), 0);
  const monthlyPayments = loans.reduce((a, l) => a + (l.monthlyPayment || 0), 0);
  const dailyDebt = monthlyPayments / 30;

  // Staff summary
  const staff = g.staff || {};
  const staffCount = Object.values(staff).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
  const PAY_RATES = { techs: 3200, sales: 2800, managers: 4500, drivers: 3000, pricingAnalyst: 5500 };
  const monthlyPayroll = Object.entries(staff).reduce((a, [k, v]) => a + (PAY_RATES[k] || 0) * (typeof v === 'number' ? v : 0), 0);

  // Bank
  const bankBal = g.bankBalance || 0;
  const totalInterest = g.bankTotalInterest || 0;

  // Factory
  const factory = g.factory;
  const factoryQuality = factory ? Math.round((factory.qualityRating || 0) * 100) : null;
  const factoryBrandRep = factory ? Math.round(factory.brandReputation || 0) : null;

  // Franchise income
  const franchiseIncome = g.franchiseIncome || {};
  const activeFranchises = (g.franchises || []).filter(f => f.status === 'active').length;

  // Wealth
  const cash = g.cash || 0;
  const wealth = cash + bankBal + (g.stockExchange?.portfolioValue || 0) - totalOwed;

  return (
    <div style={{ paddingBottom: 24 }}>

      {/* Header */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)', marginBottom: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.5, marginBottom: 2 }}>
          {g.companyName}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>
          {cal.dayName.toUpperCase()} · {cal.monthName} {cal.dayOfMonth}, Y{cal.year} · {cal.season} · Rep {Math.floor(g.reputation || 0)}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          {[
            { label: 'NET WORTH', value: `$${fmt(wealth)}`, color: wealth >= 0 ? '#4caf50' : '#ef5350' },
            { label: 'CASH', value: `$${fmt(cash)}`, color: '#4ea8de' },
            { label: 'AVG DAILY REV', value: `$${fmt(Math.floor(avgDailyRev))}`, color: '#7c6fcd' },
            { label: 'MARGIN', value: `${margin30.toFixed(1)}%`, color: margin30 >= 25 ? '#4caf50' : margin30 >= 10 ? '#ffb74d' : '#ef5350' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue trend */}
      <Section title="Revenue — Last 30 Days" accent="#4ea8de">
        <Sparkline data={last30.map(d => d.rev)} color="#4ea8de" height={48} fill />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{last30.length > 0 ? formatDateShort(worldDay - last30.length) : ''}</div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>Today</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 8 }}>
          {[
            { label: 'Last 7d revenue', value: `$${fmt(rev7)}`, sub: revTrend !== 0 ? `${revTrend >= 0 ? '+' : ''}${revTrend.toFixed(0)}% vs prior week` : null, color: revTrend >= 0 ? '#4caf50' : '#ef5350' },
            { label: 'Last 30d revenue', value: `$${fmt(rev30)}` },
            { label: 'Last 7d profit', value: `$${fmt(profit7)}`, color: profit7 >= 0 ? '#4caf50' : '#ef5350' },
            { label: 'Last 30d profit', value: `$${fmt(profit30)}`, color: profit30 >= 0 ? '#4caf50' : '#ef5350' },
            { label: 'Avg daily revenue', value: `$${fmt(Math.floor(avgDailyRev))}` },
            { label: 'Avg daily profit', value: `$${fmt(Math.floor(avgDailyProfit))}`, color: avgDailyProfit >= 0 ? '#4caf50' : '#ef5350' },
            { label: 'Tires sold (7d)', value: sold7.toLocaleString() },
            { label: 'Tires sold (30d)', value: sold30.toLocaleString() },
          ].map(s => (
            <div key={s.label} style={{ padding: '4px 0', borderBottom: '1px solid #1e1e1e' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 9, color: s.color || 'var(--text-dim)' }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      </Section>

      {/* Profit sparkline */}
      <Section title="Profit — Last 30 Days" accent="#4caf50">
        <Sparkline data={last30.map(d => d.profit)} color="#4caf50" height={36} fill />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>Worst: ${fmt(Math.min(...last30.map(d => d.profit || 0)))}</div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>Best: ${fmt(Math.max(...last30.map(d => d.profit || 0)))}</div>
        </div>
      </Section>

      {/* Revenue by channel */}
      {channelTotals.length > 0 && (
        <Section title="Revenue by Channel (All Time)" accent="#7c6fcd">
          {channelTotals.map(c => (
            <div key={c.channel} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <div style={{ fontSize: 11 }}>{c.label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.color }}>
                  ${fmt(c.total)} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({totalChannelRev > 0 ? ((c.total / totalChannelRev) * 100).toFixed(0) : 0}%)</span>
                </div>
              </div>
              <div style={{ background: '#1e1e1e', borderRadius: 2, height: 4, overflow: 'hidden' }}>
                <div style={{ background: c.color, height: '100%', width: `${totalChannelRev > 0 ? (c.total / totalChannelRev) * 100 : 0}%`, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Locations */}
      {locData.length > 0 && (
        <Section title="Locations" accent="#4db6ac">
          {locData.map(({ loc, city, rev, profit, margin }) => (
            <div key={loc.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #1e1e1e' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>
                    {loc.franchise ? `🏢 ${loc.franchise.brandName}` : `🏪 ${city?.name || 'Shop'}`}
                  </div>
                  {loc.franchise && <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>DBA {g.companyName} · {city?.name}</div>}
                  {!loc.franchise && <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{city?.state} · Day {loc.openedDay || '?'}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#4ea8de' }}>${fmt(rev)}/d</div>
                  <div style={{ fontSize: 9, color: profit >= 0 ? '#4caf50' : '#ef5350' }}>
                    {profit >= 0 ? '+' : ''}${fmt(profit)} profit
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                {[
                  { label: 'Margin', value: `${margin.toFixed(0)}%`, color: margin >= 25 ? '#4caf50' : margin >= 10 ? '#ffb74d' : '#ef5350' },
                  { label: 'Loyalty', value: `${Math.floor(loc.loyalty || 0)}%` },
                  { label: 'Insurance', value: loc.insurance || 'None' },
                  { label: 'Staff', value: Object.values(loc.staff || {}).reduce((a, v) => a + v, 0) },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', background: '#111', borderRadius: 4, padding: '3px 0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.value}</div>
                    <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {loc.franchise && (
                <div style={{ marginTop: 4, fontSize: 9, color: '#ff9800' }}>
                  Royalty: {(loc.franchise.royaltyPct * 100).toFixed(1)}% · Fee: ${fmt(loc.franchise.monthlyFee)}/mo
                </div>
              )}
            </div>
          ))}
          <StatRow label="Total daily shop revenue" value={`$${fmt(totalLocRev)}`} color="#4ea8de" />
        </Section>
      )}

      {/* Top tires */}
      {topTires.length > 0 && (
        <Section title="Top Selling Tires (Last 30 Days)" accent="#ffb74d">
          {topTires.map(({ type, qty, label }, i) => (
            <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1e1e1e' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', width: 14 }}>#{i + 1}</div>
                <div style={{ fontSize: 11 }}>{label}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ffb74d' }}>{qty.toLocaleString()} sold</div>
            </div>
          ))}
        </Section>
      )}

      {/* Staff & Payroll */}
      <Section title="Staff & Payroll" accent="#81c784">
        <StatRow label="Total employees" value={staffCount} />
        <StatRow label="Techs" value={staff.techs || 0} />
        <StatRow label="Sales staff" value={staff.sales || 0} />
        <StatRow label="Managers" value={staff.managers || 0} />
        <StatRow label="Drivers" value={staff.drivers || 0} />
        {staff.pricingAnalyst > 0 && <StatRow label="Pricing analysts" value={staff.pricingAnalyst} />}
        <StatRow label="Monthly payroll" value={`$${fmt(monthlyPayroll)}`} color="#ef5350" />
        <StatRow label="Daily payroll cost" value={`$${fmt(Math.floor(monthlyPayroll / 30))}`} color="#ef5350" />
      </Section>

      {/* Finances */}
      <Section title="Finances" accent="#ef5350">
        <StatRow label="Cash on hand" value={`$${fmt(cash)}`} color={cash >= 0 ? '#4caf50' : '#ef5350'} />
        <StatRow label="Bank balance" value={`$${fmt(bankBal)}`} color="#4ea8de" />
        <StatRow label="Interest earned (lifetime)" value={`$${fmt(totalInterest)}`} color="#4caf50" />
        {loans.length > 0 && <>
          <StatRow label="Active loans" value={loans.length} />
          <StatRow label="Total outstanding debt" value={`$${fmt(totalOwed)}`} color="#ef5350" />
          <StatRow label="Monthly debt payments" value={`$${fmt(monthlyPayments)}`} color="#ef5350" />
          <StatRow label="Daily debt burden" value={`$${fmt(Math.floor(dailyDebt))}`} color="#ef5350" />
        </>}
        <StatRow label="Lifetime revenue" value={`$${fmt(g.totalRev || 0)}`} color="#4ea8de" />
        <StatRow label="Lifetime profit" value={`$${fmt(g.totalProfit || 0)}`} color="#4caf50" />
        <StatRow label="Lifetime tires sold" value={(g.totalSold || 0).toLocaleString()} />
        <StatRow label="Lifetime service revenue" value={`$${fmt(g.totalServiceRev || 0)}`} />
      </Section>

      {/* Cash sparkline */}
      {last30.length > 1 && (
        <Section title="Cash Balance — Last 30 Days" accent="#4ea8de">
          <Sparkline data={last30.map(d => d.cash)} color={last30[last30.length-1]?.cash >= 0 ? '#4caf50' : '#ef5350'} height={36} fill />
        </Section>
      )}

      {/* Reputation */}
      <Section title="Reputation & Growth" accent="#7c6fcd">
        <StatRow label="Current reputation" value={Math.floor(g.reputation || 0)} color="#7c6fcd" />
        <StatRow label="Market share" value={`${((g.marketShare || 0) * 100).toFixed(1)}%`} />
        <StatRow label="Total locations" value={locations.length} />
        <StatRow label="Days in business" value={playerDay} />
        {g.totalEcomRevenue > 0 && <StatRow label="E-commerce revenue (total)" value={`$${fmt(g.totalEcomRevenue)}`} color="#4db6ac" />}
        {g.totalWholesaleRevenue > 0 && <StatRow label="Wholesale revenue (total)" value={`$${fmt(g.totalWholesaleRevenue)}`} color="#7c6fcd" />}
        {g.fleaMarketTotalSold > 0 && <StatRow label="Flea market tires sold" value={g.fleaMarketTotalSold.toLocaleString()} />}
        {g.vanTotalSold > 0 && <StatRow label="Van tires sold" value={g.vanTotalSold.toLocaleString()} />}
        {g.carMeetTotalSold > 0 && <StatRow label="Car meet tires sold" value={g.carMeetTotalSold.toLocaleString()} />}
      </Section>

      {/* Factory */}
      {g.hasFactory && factory && (
        <Section title="Factory" accent="#ff8a65">
          <StatRow label="Factory level" value={factory.level || 1} />
          <StatRow label="Quality rating" value={`${factoryQuality}%`} color={factoryQuality >= 85 ? '#4caf50' : factoryQuality >= 70 ? '#ffb74d' : '#ef5350'} />
          <StatRow label="Brand reputation" value={`${factoryBrandRep}/100`} color="#ff8a65" />
          <StatRow label="Total produced" value={(factory.totalProduced || 0).toLocaleString()} />
          <StatRow label="R&D projects" value={(factory.rdProjects || []).length} />
          <StatRow label="Certifications" value={(factory.certifications || []).length} />
          {factory.customerList?.length > 0 && <StatRow label="Wholesale clients" value={factory.customerList.length} />}
        </Section>
      )}

      {/* Franchise */}
      {(g.franchiseOffering || activeFranchises > 0 || franchiseIncome.totalBuyIns > 0) && (
        <Section title="Franchise" accent="#f06292">
          {g.franchiseOffering?.active && <>
            <StatRow label="Brand" value={g.franchiseOffering.brandName} color="#f06292" />
            <StatRow label="Active franchisees" value={g.franchiseOffering.franchiseeCount || 0} />
            <StatRow label="Buy-in price" value={`$${fmt(g.franchiseOffering.buyIn)}`} />
            <StatRow label="Royalty rate" value={`${((g.franchiseOffering.royaltyPct || 0) * 100).toFixed(1)}%`} />
          </>}
          {franchiseIncome.totalBuyIns > 0 && <StatRow label="Total buy-ins collected" value={`$${fmt(franchiseIncome.totalBuyIns)}`} color="#4caf50" />}
          {franchiseIncome.totalRoyalties > 0 && <StatRow label="Total royalties earned" value={`$${fmt(franchiseIncome.totalRoyalties)}`} color="#4caf50" />}
          {activeFranchises > 0 && <StatRow label="You are franchisee at" value={`${activeFranchises} location${activeFranchises > 1 ? 's' : ''}`} />}
        </Section>
      )}

      {/* Stock exchange */}
      {g.stockExchange?.hasBrokerage && (
        <Section title="Stock Exchange" accent="#4db6ac">
          {g.stockExchange.ticker && <StatRow label="Your ticker" value={g.stockExchange.ticker} color="#4db6ac" />}
          <StatRow label="Portfolio value" value={`$${fmt(g.stockExchange.portfolioValue || 0)}`} color="#4caf50" />
          <StatRow label="TC balance" value={g.tireCoins || 0} color="var(--gold)" />
        </Section>
      )}

    </div>
  );
}
