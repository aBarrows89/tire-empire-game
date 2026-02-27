import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { postAction } from '../../api/client.js';
import { FACTORY } from '@shared/constants/factory.js';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { hapticsMedium } from '../../api/haptics.js';

const PRODUCIBLE_TYPES = Object.keys(FACTORY.productionCost);

export default function FactoryPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(false);
  const [selectedType, setSelectedType] = useState(PRODUCIBLE_TYPES[0]);
  const [qty, setQty] = useState(10);
  const [brandName, setBrandName] = useState('');
  const [tab, setTab] = useState('overview'); // overview | staff | catalog | sell

  const factory = g.factory || null;
  const hasFactory = !!g.hasFactory;

  const doAction = async (action, params = {}) => {
    setBusy(true);
    const res = await postAction(action, params);
    if (res.ok) { hapticsMedium(); refreshState(); }
    setBusy(false);
  };

  if (!hasFactory) {
    const canAfford = g.cash >= FACTORY.buildCost;
    const hasRep = g.reputation >= FACTORY.minRep;
    const hasLocs = g.locations.length >= FACTORY.minLocations;
    const canBuild = canAfford && hasRep && hasLocs;

    return (
      <>
        <div className="card">
          <div className="card-title">Factory</div>
          <div className="text-sm text-dim" style={{ lineHeight: 1.5, marginBottom: 8 }}>
            Build your own tire manufacturing plant. Create your brand, hire factory staff,
            invest in R&D, and sell to other players.
          </div>
        </div>

        <div className="card">
          <div className="card-title">Requirements</div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Cash</span>
            <span className={`font-bold ${canAfford ? 'text-green' : 'text-red'}`}>
              ${fmt(g.cash)} / ${fmt(FACTORY.buildCost)}
            </span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Reputation</span>
            <span className={`font-bold ${hasRep ? 'text-green' : 'text-red'}`}>
              {g.reputation.toFixed(1)} / {FACTORY.minRep}
            </span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Locations</span>
            <span className={`font-bold ${hasLocs ? 'text-green' : 'text-red'}`}>
              {g.locations.length} / {FACTORY.minLocations}
            </span>
          </div>
          <button
            className="btn btn-full btn-green"
            disabled={!canBuild || busy}
            onClick={() => doAction('buildFactory')}
          >
            {busy ? 'Building...' : canBuild ? `Build Factory ($${fmt(FACTORY.buildCost)})` : 'Requirements Not Met'}
          </button>
        </div>
      </>
    );
  }

  const currentLevel = factory?.level || 1;
  const levelData = FACTORY.levels.find(l => l.level === currentLevel) || FACTORY.levels[0];
  const nextLevel = FACTORY.levels.find(l => l.level === currentLevel + 1);
  const queue = factory?.productionQueue || [];
  const unitCost = FACTORY.productionCost[selectedType] || 0;
  const totalCost = unitCost * qty;
  const fStaff = factory?.staff || { lineWorkers: 0, inspectors: 0, engineers: 0, manager: 0 };
  const qualityPct = Math.round((factory?.qualityRating || 0.80) * 100);
  const qualityCapPct = Math.round(levelData.qualityMax * 100);
  const defectRate = Math.max(1, Math.round((FACTORY.baseDefectRate - (fStaff.inspectors || 0) * 0.02) * 100));
  const effectiveCap = (factory?.dailyCapacity || levelData.dailyCapacity);

  // Factory staff payroll
  const factoryPayroll = Object.entries(fStaff).reduce((a, [role, count]) => {
    const staffDef = FACTORY.staff?.[role];
    return a + (staffDef ? staffDef.salary * count : 0);
  }, 0);

  return (
    <>
      {/* Tab navigation */}
      <div className="card">
        <div className="row gap-8">
          {[['overview', 'Overview'], ['staff', 'Staff'], ['catalog', 'Catalog'], ['sell', 'Sell']].map(([id, label]) => (
            <button key={id} className={`btn btn-sm ${tab === id ? '' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <>
          {/* Brand Card */}
          <div className="card">
            <div className="card-title">Brand: {factory?.brandName || 'My Tires'}</div>
            <div className="row gap-8 mb-4">
              <input
                type="text"
                className="autoprice-offset"
                style={{ flex: 1, textAlign: 'left' }}
                placeholder={factory?.brandName || 'Brand name'}
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
              />
              <button
                className="btn btn-sm btn-green"
                disabled={!brandName.trim() || busy}
                onClick={() => { doAction('setFactoryBrandName', { brandName: brandName.trim() }); setBrandName(''); }}
              >
                Rename
              </button>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Brand Reputation</span>
              <span className="font-bold">{Math.round(factory?.brandReputation || 0)}</span>
            </div>
          </div>

          {/* Factory Stats */}
          <div className="card">
            <div className="card-title">{levelData.name} (Lv {currentLevel})</div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Daily Capacity</span>
              <span className="font-bold">{effectiveCap} tires</span>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Quality</span>
              <span className="font-bold text-accent">{qualityPct}% / {qualityCapPct}%</span>
            </div>
            <div className="progress-bar mb-4">
              <div className="progress-fill" style={{ width: `${(qualityPct / qualityCapPct) * 100}%`, background: 'var(--accent)' }} />
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Defect Rate</span>
              <span className={`font-bold ${defectRate <= 5 ? 'text-green' : defectRate <= 10 ? 'text-accent' : 'text-red'}`}>{defectRate}%</span>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Monthly Overhead</span>
              <span className="font-bold text-red">${fmt(FACTORY.monthlyOverhead)}</span>
            </div>
            <div className="row-between mb-4">
              <span className="text-sm text-dim">Staff Payroll</span>
              <span className="font-bold text-red">${fmt(factoryPayroll)}/mo</span>
            </div>
            {nextLevel && (
              <button
                className="btn btn-full btn-sm btn-outline"
                disabled={g.cash < nextLevel.upgradeCost || busy}
                onClick={() => doAction('upgradeFactory')}
                style={{ marginTop: 4 }}
              >
                Upgrade to {nextLevel.name} (${fmt(nextLevel.upgradeCost)})
              </button>
            )}
          </div>

          {/* Production Queue */}
          {queue.length > 0 && (
            <div className="card">
              <div className="card-title">Production Queue</div>
              {queue.map((job, i) => {
                const tire = TIRES[job.tire];
                const daysLeft = Math.max(0, (job.completionDay || 0) - (g.day || 0));
                const totalDays = Math.max(1, (job.completionDay || 0) - (job.startDay || 0));
                const progress = Math.round(((totalDays - daysLeft) / totalDays) * 100);
                return (
                  <div key={i} style={{ marginBottom: i < queue.length - 1 ? 8 : 0 }}>
                    <div className="row-between text-sm mb-4">
                      <span className="font-bold">{tire?.n || job.tire}</span>
                      <span className="text-dim">{job.qty} tires - {daysLeft}d left</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%`, background: 'var(--green)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* New Production Order */}
          <div className="card">
            <div className="card-title">New Production Order</div>
            <div style={{ marginBottom: 8 }}>
              <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Tire Type</label>
              <select className="autoprice-select" style={{ width: '100%' }} value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                {PRODUCIBLE_TYPES.map(type => (
                  <option key={type} value={type}>{TIRES[type]?.n || type} -- ${FACTORY.productionCost[type]}/tire</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Quantity</label>
              <input type="number" className="autoprice-offset" style={{ width: '100%', textAlign: 'left' }} min={1} max={effectiveCap * 7} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Cost</span>
              <span className={`font-bold ${g.cash < totalCost ? 'text-red' : 'text-green'}`}>${fmt(totalCost)}</span>
            </div>
            <button className="btn btn-full btn-green" disabled={g.cash < totalCost || qty < 1 || busy} onClick={() => doAction('produceFactoryTires', { tire: selectedType, qty })}>
              {busy ? 'Starting...' : g.cash < totalCost ? 'Not Enough Cash' : `Produce ${qty} ${TIRES[selectedType]?.n || selectedType}`}
            </button>
          </div>
        </>
      )}

      {tab === 'staff' && (
        <>
          <div className="card">
            <div className="card-title">Factory Staff</div>
            <div className="text-xs text-dim mb-4">
              Monthly payroll: <span className="text-red font-bold">${fmt(factoryPayroll)}/mo</span>
            </div>
          </div>

          {Object.entries(FACTORY.staff || {}).map(([role, info]) => {
            const count = fStaff[role] || 0;
            const isMaxed = info.max && count >= info.max;
            return (
              <div key={role} className="card">
                <div className="row-between mb-4">
                  <div>
                    <div className="font-bold text-sm">{info.label}</div>
                    <div className="text-xs text-dim">${fmt(info.salary)}/mo each</div>
                    {info.capacityBoost && <div className="text-xs text-green">+{info.capacityBoost} tires/day capacity each</div>}
                    {info.defectReduce && <div className="text-xs text-green">-{(info.defectReduce * 100).toFixed(0)}% defect rate each</div>}
                    {info.qualityBoost && <div className="text-xs text-green">+{(info.qualityBoost * 100).toFixed(1)}% quality/month each</div>}
                    {info.efficiencyBoost && <div className="text-xs text-green">+{(info.efficiencyBoost * 100).toFixed(0)}% efficiency boost</div>}
                  </div>
                  <div className="font-bold text-accent">{count}{info.max ? `/${info.max}` : ''}</div>
                </div>
                <div className="row gap-8">
                  <button className="btn btn-sm btn-green" style={{ flex: 1 }} disabled={isMaxed || g.cash < info.salary || busy} onClick={() => doAction('hireFactoryStaff', { role })}>
                    {isMaxed ? 'Max' : `Hire ($${fmt(info.salary)})`}
                  </button>
                  <button className="btn btn-sm btn-red" style={{ flex: 1 }} disabled={count <= 0 || busy} onClick={() => doAction('fireFactoryStaff', { role })}>
                    Fire
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === 'catalog' && (
        <>
          <div className="card">
            <div className="card-title">Wholesale Catalog</div>
            <div className="text-xs text-dim mb-4">
              Set wholesale prices for other players to buy from your factory.
            </div>
          </div>

          {PRODUCIBLE_TYPES.map(type => {
            const t = TIRES[type];
            const prodCost = FACTORY.productionCost[type];
            const currentPrice = factory?.wholesalePrices?.[type] || Math.round(prodCost * 1.5);
            const currentMin = factory?.minOrders?.[type] || 10;
            return (
              <div key={type} className="card">
                <div className="font-bold text-sm mb-4">{t?.n || type}</div>
                <div className="row-between text-xs mb-4">
                  <span className="text-dim">Production cost: ${prodCost}</span>
                </div>
                <div className="row gap-8 mb-4">
                  <div style={{ flex: 1 }}>
                    <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 2 }}>Wholesale Price</label>
                    <div className="row gap-8">
                      <input type="number" className="autoprice-offset" style={{ flex: 1, textAlign: 'left' }} min={prodCost} defaultValue={currentPrice}
                        onBlur={e => doAction('setFactoryWholesalePrice', { tire: type, price: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 2 }}>Min Order</label>
                    <input type="number" className="autoprice-offset" style={{ flex: 1, textAlign: 'left' }} min={1} defaultValue={currentMin}
                      onBlur={e => doAction('setFactoryMinOrder', { tire: type, minQty: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="text-xs text-dim">
                  Margin: ${currentPrice - prodCost}/tire ({Math.round(((currentPrice - prodCost) / prodCost) * 100)}%)
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === 'sell' && (
        <>
          <div className="card">
            <div className="card-title">Sell Factory</div>
            <div className="text-xs text-dim mb-4">
              List your factory for sale. Asset value: ${fmt(FACTORY.factoryValue?.[currentLevel] || 5000000)}
            </div>
            {g.factoryListing ? (
              <>
                <div className="row-between mb-4">
                  <span className="text-sm text-dim">Listed for</span>
                  <span className="font-bold text-green">${fmt(g.factoryListing.askingPrice)}</span>
                </div>
                <button className="btn btn-full btn-sm btn-red" disabled={busy} onClick={() => doAction('delistFactory')}>
                  Remove Listing
                </button>
              </>
            ) : (
              <button className="btn btn-full btn-sm btn-outline" disabled={busy} onClick={() => doAction('listFactoryForSale', { askingPrice: FACTORY.factoryValue?.[currentLevel] || 5000000 })}>
                List for Sale (${fmt(FACTORY.factoryValue?.[currentLevel] || 5000000)})
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
