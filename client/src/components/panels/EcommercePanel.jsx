import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { postAction } from '../../api/client.js';
import {
  ECOM_UNLOCK_COST,
  ECOM_MIN_REP,
  ECOM_MIN_STORAGE,
  ECOM_STAFF,
  ECOM_UPGRADES,
  ECOM_TIERS,
} from '@shared/constants/ecommerce.js';
import { fmt } from '@shared/helpers/format.js';
import { getEcomTier } from '@shared/helpers/ecommerce.js';
import { getCap } from '@shared/helpers/inventory.js';
import { hapticsMedium } from '../../api/haptics.js';

export default function EcommercePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);

  /* ─── Unlock flow ─── */
  if (!g.hasEcom) {
    const canAffordCash = g.cash >= ECOM_UNLOCK_COST;
    const hasRep = g.reputation >= ECOM_MIN_REP;
    const storageCap = getCap(g);
    const hasStorage = storageCap >= ECOM_MIN_STORAGE;
    const canUnlock = canAffordCash && hasRep && hasStorage;

    const unlock = async () => {
      setBusy('unlock');
      const res = await postAction('unlockEcom');
      if (res.ok) { hapticsMedium(); refreshState(); }
      setBusy(null);
    };

    return (
      <>
        <div className="card">
          <div className="card-title">E-Commerce</div>
          <div className="text-sm text-dim" style={{ lineHeight: 1.5, marginBottom: 8 }}>
            Launch an online tire store to reach customers nationwide.
            Invest in staff, technology, and marketing to climb the rankings and
            compete with major online retailers.
          </div>
        </div>

        <div className="card">
          <div className="card-title">Requirements</div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Cash</span>
            <span className={`font-bold ${canAffordCash ? 'text-green' : 'text-red'}`}>
              ${fmt(g.cash)} / ${fmt(ECOM_UNLOCK_COST)}
            </span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Reputation</span>
            <span className={`font-bold ${hasRep ? 'text-green' : 'text-red'}`}>
              {g.reputation.toFixed(1)} / {ECOM_MIN_REP}
            </span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Storage Capacity</span>
            <span className={`font-bold ${hasStorage ? 'text-green' : 'text-red'}`}>
              {fmt(storageCap)} / {fmt(ECOM_MIN_STORAGE)}
            </span>
          </div>
          <button
            className="btn btn-full btn-green"
            disabled={!canUnlock || busy === 'unlock'}
            onClick={unlock}
          >
            {busy === 'unlock'
              ? 'Launching...'
              : canUnlock
                ? `Launch Online Store ($${fmt(ECOM_UNLOCK_COST)})`
                : 'Requirements Not Met'}
          </button>
        </div>
      </>
    );
  }

  /* ─── Unlocked: main dashboard ─── */
  const tier = getEcomTier(g.ecomTotalSpent || 0);
  const nextTier = ECOM_TIERS.find(t => t.min > (g.ecomTotalSpent || 0));
  const staff = g.ecomStaff || {};
  const upgrades = g.ecomUpgrades || [];

  const monthlyStaffCost = Object.entries(ECOM_STAFF).reduce(
    (sum, [role, info]) => sum + (staff[role] ? info.salary : 0), 0
  );
  const monthlyUpgradeCost = Object.entries(ECOM_UPGRADES).reduce(
    (sum, [id, info]) => sum + (upgrades.includes(id) ? info.monthly : 0), 0
  );
  const totalMonthlyCost = monthlyStaffCost + monthlyUpgradeCost;

  const hire = async (role) => {
    setBusy(`hire-${role}`);
    const res = await postAction('hireEcomStaff', { role });
    if (res.ok) refreshState();
    setBusy(null);
  };

  const fire = async (role) => {
    setBusy(`fire-${role}`);
    const res = await postAction('fireEcomStaff', { role });
    if (res.ok) refreshState();
    setBusy(null);
  };

  const buyUpgrade = async (upgradeId) => {
    setBusy(`upgrade-${upgradeId}`);
    const res = await postAction('buyEcomUpgrade', { upgradeId });
    if (res.ok) refreshState();
    setBusy(null);
  };

  /* Check if a staff prerequisite is met */
  const meetsStaffReq = (info) => {
    if (!info.req) return true;
    return Object.entries(info.req).every(([k, v]) => !!staff[k] === v);
  };

  /* Check if an upgrade prerequisite is met */
  const meetsUpgradeReq = (info) => {
    if (!info.req) return true;
    return Object.entries(info.req).every(([k, v]) => !!staff[k] === v);
  };

  return (
    <>
      {/* ── Tier & Performance ── */}
      <div className="card">
        <div className="card-title">E-Commerce</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Current Tier</span>
          <span className="font-bold text-accent">{tier.label}</span>
        </div>
        <div className="text-xs text-dim mb-4">{tier.desc}</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Market Share</span>
          <span className="font-bold">{(tier.marketShare * 100).toFixed(2)}%</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Total Invested</span>
          <span className="font-bold">${fmt(g.ecomTotalSpent || 0)}</span>
        </div>
        {nextTier && (
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Next Tier</span>
            <span className="text-xs text-dim">
              {nextTier.label} at ${fmt(nextTier.min)}
              {' '}(${fmt(nextTier.min - (g.ecomTotalSpent || 0))} more)
            </span>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Daily Orders</span>
            <span className="font-bold text-green">{g.ecomDailyOrders || 0}</span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Daily Revenue</span>
            <span className="font-bold text-green">${fmt(g.ecomDailyRev || 0)}</span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Monthly Costs</span>
            <span className="font-bold text-red">${fmt(totalMonthlyCost)}/mo</span>
          </div>
        </div>
      </div>

      {/* ── Staff ── */}
      <div className="card">
        <div className="card-title">E-Commerce Staff</div>
        <div className="text-xs text-dim mb-4">
          Monthly payroll: <span className="text-red font-bold">${fmt(monthlyStaffCost)}/mo</span>
        </div>
      </div>

      {Object.entries(ECOM_STAFF).map(([role, info]) => {
        const hired = !!staff[role];
        const reqMet = meetsStaffReq(info);
        const reqLabel = info.req
          ? Object.keys(info.req).map(k => ECOM_STAFF[k]?.title || k).join(', ')
          : null;

        return (
          <div key={role} className="card">
            <div className="row-between mb-4">
              <div>
                <div className="font-bold text-sm">{info.title}</div>
                <div className="text-xs text-dim">{info.desc}</div>
                {info.convBoost && (
                  <div className="text-xs text-green">+{(info.convBoost * 100).toFixed(0)}% conversion</div>
                )}
                {info.trafficBoost && (
                  <div className="text-xs text-green">+{(info.trafficBoost * 100).toFixed(0)}% traffic</div>
                )}
                {info.maxOrders && (
                  <div className="text-xs text-green">Handles up to {info.maxOrders} orders/day</div>
                )}
                {reqLabel && !reqMet && (
                  <div className="text-xs text-red">Requires: {reqLabel}</div>
                )}
              </div>
              <div className="text-xs text-dim">${fmt(info.salary)}/mo</div>
            </div>
            <div className="row-between">
              {hired ? (
                <>
                  <span className="text-xs text-green font-bold">HIRED</span>
                  <button
                    className="btn btn-sm btn-red"
                    disabled={busy === `fire-${role}`}
                    onClick={() => fire(role)}
                  >
                    {busy === `fire-${role}` ? '...' : 'Fire'}
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xs text-dim">Not hired</span>
                  <button
                    className="btn btn-sm btn-green"
                    disabled={!reqMet || g.cash < info.salary || busy === `hire-${role}`}
                    onClick={() => hire(role)}
                  >
                    {busy === `hire-${role}` ? '...' : 'Hire'}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Upgrades ── */}
      <div className="card">
        <div className="card-title">Platform Upgrades</div>
        <div className="text-xs text-dim mb-4">
          Monthly maintenance: <span className="text-red font-bold">${fmt(monthlyUpgradeCost)}/mo</span>
        </div>
      </div>

      {Object.entries(ECOM_UPGRADES).map(([id, info]) => {
        const owned = upgrades.includes(id);
        const reqMet = meetsUpgradeReq(info);
        const reqLabel = info.req
          ? Object.keys(info.req).map(k => ECOM_STAFF[k]?.title || k).join(', ')
          : null;

        return (
          <div key={id} className="card">
            <div className="row-between mb-4">
              <div>
                <div className="font-bold text-sm">{info.name}</div>
                <div className="text-xs text-dim">{info.desc}</div>
                {info.convBoost && (
                  <div className="text-xs text-green">+{(info.convBoost * 100).toFixed(0)}% conversion</div>
                )}
                {info.trafficBoost && (
                  <div className="text-xs text-green">+{(info.trafficBoost * 100).toFixed(0)}% traffic</div>
                )}
                {info.returnReduce && (
                  <div className="text-xs text-green">-{(info.returnReduce * 100).toFixed(0)}% returns</div>
                )}
                {info.installRevPerTire && (
                  <div className="text-xs text-green">${info.installRevPerTire}/tire install referral</div>
                )}
                {info.warrantyPrice && (
                  <div className="text-xs text-green">
                    ${info.warrantyPrice}/tire warranty ({(info.warrantyMargin * 100).toFixed(0)}% margin,
                    {' '}{(info.attachRate * 100).toFixed(0)}% attach rate)
                  </div>
                )}
                {reqLabel && !reqMet && (
                  <div className="text-xs text-red">Requires: {reqLabel}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-dim">${fmt(info.cost)}</div>
                <div className="text-xs text-dim">${fmt(info.monthly)}/mo</div>
              </div>
            </div>
            {owned ? (
              <div className="text-xs text-green font-bold">PURCHASED</div>
            ) : (
              <button
                className="btn btn-full btn-sm btn-green"
                disabled={!reqMet || g.cash < info.cost || busy === `upgrade-${id}`}
                onClick={() => buyUpgrade(id)}
              >
                {busy === `upgrade-${id}`
                  ? 'Purchasing...'
                  : g.cash < info.cost
                    ? `Need $${fmt(info.cost)}`
                    : `Buy ($${fmt(info.cost)})`}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
