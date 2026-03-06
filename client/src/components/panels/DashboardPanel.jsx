import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { fmt } from '@shared/helpers/format.js';
import { TIRES } from '@shared/constants/tires.js';
import { tireName } from '@shared/helpers/factoryBrand.js';
import { CITIES } from '@shared/constants/cities.js';
import { getWealth } from '@shared/helpers/wealth.js';
import { getInv, getCap } from '@shared/helpers/inventory.js';
import { PAY } from '@shared/constants/staff.js';
import { MARKETING } from '@shared/constants/marketing.js';
import { INSURANCE } from '@shared/constants/insurance.js';
import { FACTORY } from '@shared/constants/factory.js';
import { MONET } from '@shared/constants/monetization.js';
import { PROGRESSION_MILESTONES } from '@shared/constants/progression.js';
import VinnieTip from '../VinnieTip.jsx';
import LowStockBanner from '../LowStockBanner.jsx';
import { hapticsLight } from '../../api/haptics.js';
import { postAction, getExchangeOverview } from '../../api/client.js';
import { UICard, ProgressRing, ProgressBar, MiniSparkline, ChannelBar, StatPill, Tag, SectionHeader } from '../ui/ui.jsx';

const CHANNEL_ICONS = {
  shops: '\u{1F3EA}', flea: '\u{1F3AA}', carMeets: '\u{1F3CE}', ecom: '\u{1F4BB}',
  wholesale: '\u{1F4E6}', factoryWholesale: '\u{1F3ED}', gov: '\u{1F3DB}', van: '\u{1F69A}', services: '\u{1F527}',
};
const CHANNEL_LABELS = {
  shops: 'Shops', flea: 'Flea Markets', carMeets: 'Car Meets', ecom: 'E-Commerce',
  wholesale: 'Wholesale', factoryWholesale: 'Factory WS', gov: 'Gov Contracts', van: 'Van Sales', services: 'Services',
};

export default function DashboardPanel() {
  const { state, dispatch, refreshState } = useGame();
  const g = state.game;

  const inv = getInv(g);
  const cap = getCap(g);

  // Memoize expensive calcs
  const { totalDailyExpenses, staffCost } = useMemo(() => {
    const staffCost = Object.entries(g.staff || {}).reduce((a, [k, v]) => a + (PAY[k] || 0) * v, 0) / 30;
    const shopRentEst = (g.locations || []).length * 4500 / 30;
    const marketingCost = (g.locations || []).reduce((a, loc) => {
      const mktg = loc.marketing && MARKETING[loc.marketing];
      return a + (mktg ? (mktg.costPerDay || mktg.dailyCost || 0) : 0);
    }, 0);
    const insuranceCost = g.insurance && INSURANCE[g.insurance] ? INSURANCE[g.insurance].monthlyCost / 30 : 0;
    const loanCost = (g.loans || []).reduce((a, l) => a + (l.weeklyPayment || 0) / 7, 0);
    const factoryOverhead = g.hasFactory ? (FACTORY.monthlyOverhead || 0) / 30 : 0;
    return {
      totalDailyExpenses: staffCost + shopRentEst + marketingCost + insuranceCost + loanCost + factoryOverhead,
      staffCost,
    };
  }, [g.day]);

  const channels = g.dayRevByChannel || {};
  const activeChannels = Object.entries(channels).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const maxChRev = activeChannels.length > 0 ? activeChannels[0][1] : 1;

  const revTrend = (g.prevDayRev || 0) > 0
    ? Math.round(((g.dayRev || 0) - g.prevDayRev) / g.prevDayRev * 100) : 0;

  // Revenue history from weekly snapshots
  const revHistory = (g.history || []).map(h => h.rev || 0).slice(-10);

  // Next milestone
  const rep = g.reputation || 0;
  const nextMilestone = rep < 25 ? { label: 'Respected (Rep 25)', target: 25 }
    : rep < 50 ? { label: 'Legendary (Rep 50)', target: 50 }
    : rep < 75 ? { label: 'Factory Ready (Rep 75)', target: 75 }
    : { label: 'Legend Status (Rep 100)', target: 100 };

  // Problem shops for Vinnie alert
  const problemShop = (g.locations || []).find(l =>
    (l.dailyStats?.profit || 0) < 0 || (l.loyalty || 0) < 30
  );
  const problemCity = problemShop ? CITIES.find(c => c.id === problemShop.cityId) : null;

  // Helper
  const countStaff = (s) => s ? Object.values(s).reduce((a, v) => a + (Number(v) || 0), 0) : 0;

  return (
    <>
      {/* ── VINNIE ALERT (if problem shop exists) ── */}
      {problemShop && problemCity && (
        <UICard style={{
          background: 'linear-gradient(135deg, rgba(255,213,79,0.08), transparent)',
          border: '1px solid rgba(255,213,79,0.2)',
        }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <span style={{ fontSize: 28 }}>{'\u{1F9D4}'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', marginBottom: 2 }}>VINNIE SAYS</div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                {(problemShop.dailyStats?.profit || 0) < 0
                  ? `${problemCity.name} shop losing $${Math.abs(problemShop.dailyStats?.profit || 0)}/day. ${(problemShop.loyalty || 0) < 40 ? 'Loyalty is low — try marketing.' : 'Check your pricing and stock.'}`
                  : `${problemCity.name} loyalty at ${problemShop.loyalty || 0}%. Customers are going elsewhere.`
                }
              </div>
            </div>
          </div>
        </UICard>
      )}

      {/* ── LOW STOCK BANNER ── */}
      <LowStockBanner />

      {/* ── REVENUE HERO ── */}
      <UICard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
              TODAY'S REVENUE
            </div>
            <div style={{
              fontSize: 34, fontWeight: 800, letterSpacing: -1,
              background: 'linear-gradient(135deg, var(--green) 0%, #4caf50 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              ${fmt(g.dayRev || 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              Profit: <b style={{ color: (g.dayProfit || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                ${fmt(g.dayProfit || 0)}
              </b>
              {' \u00B7 '}{g.daySold || 0} sold
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <MiniSparkline data={revHistory} color="var(--green)" width={80} height={30}/>
            {revTrend !== 0 && (
              <div style={{
                fontSize: 11, fontWeight: 700, marginTop: 4,
                color: revTrend >= 0 ? 'var(--green)' : 'var(--red)',
              }}>
                {revTrend >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(revTrend)}%
              </div>
            )}
          </div>
        </div>
      </UICard>

      {/* ── NEXT MILESTONE ── */}
      <UICard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>{'\u2B50'} Next: {nextMilestone.label}</div>
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
            {rep.toFixed(1)} / {nextMilestone.target}
          </span>
        </div>
        <ProgressBar pct={(rep / nextMilestone.target) * 100} color="var(--accent)"/>
      </UICard>

      {/* ── QUICK STATS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <StatPill icon={'\u{1F3EA}'} label="Shops" value={(g.locations || []).length}/>
        <StatPill
          icon={'\u{1F4E6}'} label="Inventory" value={`${inv}/${cap}`}
          color={cap > 0 && inv / cap < 0.3 ? 'var(--red)' : 'var(--text)'}
        />
        <StatPill icon={'\u{1F465}'} label="Staff" value={countStaff(g.staff)}/>
        <StatPill icon={'\u{1F4B0}'} label="Net P&L" value={`$${fmt(g.dayProfit || 0)}`}
          color={(g.dayProfit || 0) >= 0 ? 'var(--green)' : 'var(--red)'}
        />
      </div>

      {/* ── SHOP HEALTH CAROUSEL ── */}
      {(g.locations || []).length > 0 && (
        <>
          <SectionHeader title="Your Shops" icon={'\u{1F3EA}'}/>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x mandatory', marginBottom: 8 }}>
            {(g.locations || []).map((loc, i) => {
              const city = CITIES.find(c => c.id === loc.cityId);
              const dailyRev = loc.dailyStats?.rev || 0;
              const dailyProfit = loc.dailyStats?.profit || 0;
              const dailySold = loc.dailyStats?.sold || 0;
              const locInv = Object.values(loc.inventory || {}).reduce((a, b) => a + (b || 0), 0);
              const locCap = 50 + (loc.locStorage || 0);
              const loy = Math.round(loc.loyalty || 0);
              // Real players store staff globally (g.staff), not per-location
              // Show per-location staff if it exists (bots), otherwise show global divided by location count
              const hasLocStaff = loc.staff && countStaff(loc.staff) > 0;
              const locCount = (g.locations || []).length || 1;
              const staff = hasLocStaff ? loc.staff : {
                techs: Math.round((g.staff?.techs || 0) / locCount),
                sales: Math.round((g.staff?.sales || 0) / locCount),
                managers: Math.round((g.staff?.managers || 0) / locCount),
              };
              const staffTotal = hasLocStaff ? countStaff(staff) : countStaff(g.staff);
              const isAlert = dailyProfit < 0 || loy < 30;
              const topTire = Object.entries(loc.inventory || {}).sort((a, b) => b[1] - a[1])[0];
              const topTireName = topTire ? tireName(topTire[0], g) : '-';

              return (
                <div key={loc.id || i} style={{
                  minWidth: 260, flex: '0 0 260px', scrollSnapAlign: 'start',
                  background: 'var(--card)', borderRadius: 14, padding: 12,
                  border: `1px solid ${isAlert ? 'var(--red)' : 'var(--border)'}`,
                  boxShadow: isAlert ? '0 0 12px rgba(239,83,80,0.1)' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {loc.franchise ? '🏢' : loc.isFranchise ? '\u{1F3E2}' : '\u{1F3EA}'} {loc.franchise ? loc.franchise.brandName : (city?.name || 'Shop')}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                        {loc.franchise ? `DBA ${g.companyName} · ${city?.name || ''}` : (city?.state || '')}
                      </div>
                    </div>
                    <div style={{
                      padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                      background: dailyProfit >= 0 ? 'rgba(76,175,80,0.12)' : 'rgba(239,83,80,0.1)',
                      color: dailyProfit >= 0 ? 'var(--green)' : 'var(--red)',
                    }}>
                      {dailyProfit >= 0 ? '+' : ''}{dailyProfit}/d
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>${dailyRev}</div>
                      <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>REV</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{dailySold}</div>
                      <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>SOLD</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <ProgressRing value={locInv} max={locCap} size={34} stroke={3}
                        color={locInv / locCap > 0.3 ? 'var(--accent)' : 'var(--red)'}>
                        {locInv}
                      </ProgressRing>
                      <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>INV</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <ProgressRing value={loy} max={100} size={34} stroke={3}
                        color={loy >= 70 ? 'var(--green)' : loy >= 40 ? 'var(--gold)' : 'var(--red)'}>
                        {loy}%
                      </ProgressRing>
                      <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>LOY</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Tag>{'\u{1F465}'} {staff.techs || 0}T {staff.sales || 0}S {staff.managers || 0}M{!hasLocStaff && locCount > 1 ? ' (co)' : ''}</Tag>
                    <Tag>{'\u{1F3C6}'} {topTireName}</Tag>
                    {loc.marketing && <Tag color="var(--accent)" bg="rgba(79,195,247,0.1)">{'\u{1F4E2}'} {loc.marketing}</Tag>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── REVENUE BY CHANNEL ── */}
      {activeChannels.length > 0 && (
        <UICard>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{'\u{1F4CA}'} Revenue by Channel</div>
          {activeChannels.map(([k, v]) => (
            <ChannelBar key={k}
              label={CHANNEL_LABELS[k] || k}
              icon={CHANNEL_ICONS[k] || '\u{1F4B0}'}
              value={v}
              maxValue={maxChRev}
            />
          ))}
        </UICard>
      )}

      {/* ── ACTIVE CHANNELS BADGES ── */}
      <UICard>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{'\u{1F30E}'} Your Empire</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(g.locations || []).length > 0 && <Tag color="var(--green)" bg="rgba(76,175,80,0.1)">{'\u{1F3EA}'} Retail ({(g.locations || []).length})</Tag>}
          {g.hasWholesale && <Tag color="var(--accent)" bg="rgba(79,195,247,0.1)">{'\u{1F4E6}'} Wholesale</Tag>}
          {g.hasEcom && <Tag color="var(--accent)" bg="rgba(79,195,247,0.1)">{'\u{1F4BB}'} E-Com</Tag>}
          {g.hasDist && <Tag color="var(--accent)" bg="rgba(79,195,247,0.1)">{'\u{1F69B}'} Distribution</Tag>}
          {g.hasFactory && <Tag color="var(--gold)" bg="rgba(255,213,79,0.08)">{'\u{1F3ED}'} Factory</Tag>}
          {g.hasFranchise && <Tag color="var(--gold)" bg="rgba(255,213,79,0.08)">{'\u{1F3E2}'} Franchise</Tag>}
          {g.stockExchange?.isPublic && <Tag color="var(--green)" bg="rgba(76,175,80,0.1)">{'\u{1F4C8}'} Public ({g.stockExchange.ticker})</Tag>}
        </div>
      </UICard>

      {/* ── VINNIE TIP (contextual, not the alert one) ── */}
      <VinnieTip />
    </>
  );
}
