import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { postAction } from '../../api/client.js';
import { FACTORY } from '@shared/constants/factory.js';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';

const PRODUCIBLE_TYPES = Object.keys(FACTORY.productionCost);

export default function FactoryPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(false);
  const [selectedType, setSelectedType] = useState(PRODUCIBLE_TYPES[0]);
  const [qty, setQty] = useState(10);

  const factory = g.factory || null;
  const hasFactory = !!g.hasFactory;

  const buildFactory = async () => {
    setBusy(true);
    const res = await postAction('buildFactory');
    if (res.ok) refreshState();
    setBusy(false);
  };

  const startProduction = async () => {
    setBusy(true);
    const res = await postAction('produceFactoryTires', { type: selectedType, qty });
    if (res.ok) refreshState();
    setBusy(false);
  };

  const upgradeFactory = async () => {
    setBusy(true);
    const res = await postAction('upgradeFactory');
    if (res.ok) refreshState();
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
            Build your own tire manufacturing plant. Produce tires at cost and sell them
            under your brand for maximum margins.
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
            onClick={buildFactory}
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
  const queue = factory?.queue || [];
  const unitCost = FACTORY.productionCost[selectedType] || 0;
  const totalCost = unitCost * qty;

  return (
    <>
      <div className="card">
        <div className="card-title">Factory</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Level</span>
          <span className="font-bold text-accent">{levelData.name} (Lv {currentLevel})</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Daily Capacity</span>
          <span className="font-bold">{levelData.dailyCapacity} tires</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Quality Max</span>
          <span className="font-bold">{Math.round(levelData.qualityMax * 100)}%</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Monthly Overhead</span>
          <span className="font-bold text-red">${fmt(FACTORY.monthlyOverhead)}</span>
        </div>
        {nextLevel && (
          <button
            className="btn btn-full btn-sm btn-outline"
            disabled={g.cash < nextLevel.upgradeCost || busy}
            onClick={upgradeFactory}
            style={{ marginTop: 4 }}
          >
            Upgrade to {nextLevel.name} (${fmt(nextLevel.upgradeCost)})
          </button>
        )}
      </div>

      {queue.length > 0 && (
        <div className="card">
          <div className="card-title">Production Queue</div>
          {queue.map((job, i) => {
            const tire = TIRES[job.type];
            const progress = job.total > 0 ? Math.round((job.produced / job.total) * 100) : 0;
            return (
              <div key={i} style={{ marginBottom: i < queue.length - 1 ? 8 : 0 }}>
                <div className="row-between text-sm mb-4">
                  <span className="font-bold">{tire?.n || job.type}</span>
                  <span className="text-dim">{job.produced}/{job.total}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%`, background: 'var(--green)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="card-title">New Production Order</div>
        <div className="text-xs text-dim mb-4">
          Select a tire type and quantity to start manufacturing.
        </div>
        <div style={{ marginBottom: 8 }}>
          <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Tire Type</label>
          <select
            className="autoprice-select"
            style={{ width: '100%' }}
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            {PRODUCIBLE_TYPES.map(type => (
              <option key={type} value={type}>
                {TIRES[type]?.n || type} — ${FACTORY.productionCost[type]}/tire
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Quantity</label>
          <input
            type="number"
            className="autoprice-offset"
            style={{ width: '100%', textAlign: 'left' }}
            min={1}
            max={levelData.dailyCapacity}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <div className="row-between text-sm mb-4">
          <span className="text-dim">Cost</span>
          <span className={`font-bold ${g.cash < totalCost ? 'text-red' : 'text-green'}`}>
            ${fmt(totalCost)}
          </span>
        </div>
        <button
          className="btn btn-full btn-green"
          disabled={g.cash < totalCost || qty < 1 || busy}
          onClick={startProduction}
        >
          {busy ? 'Starting...' : g.cash < totalCost ? 'Not Enough Cash' : `Produce ${qty} ${TIRES[selectedType]?.n || selectedType}`}
        </button>
      </div>
    </>
  );
}
