import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { SOURCES } from '@shared/constants/sources.js';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';
import { getCalendar, DAY_NAMES } from '@shared/helpers/calendar.js';
import { postAction } from '../../api/client.js';
import { FLEA_MARKETS, FLEA_STAND_COST } from '@shared/constants/fleaMarkets.js';
import { CAR_MEETS, CAR_MEET_SUMMER_START, CAR_MEET_SUMMER_END } from '@shared/constants/carMeets.js';
import { hapticsMedium } from '../../api/haptics.js';
import { playSound } from '../../api/sounds.js';

export default function SourcePanel() {
  const { state, applyState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);
  const [selectedLotItems, setSelectedLotItems] = useState([]);

  const inv = getInv(g);
  const cap = getCap(g);
  const freeSpace = cap - inv;
  const playerDay = g.day || g.week || 1;
  const day = (g.startDay || 1) + playerDay - 1;
  const cal = getCalendar(day);

  const buy = async (sourceId) => {
    setBusy(sourceId);
    const res = await postAction('buySource', { sourceId });
    if (res.ok) { hapticsMedium(); playSound('purchase'); applyState(res); }
    setBusy(null);
  };

  const setAutoSource = async (sourceId) => {
    setBusy('auto');
    const result = await postAction('setAutoSource', { sourceId: sourceId || null });
    applyState(result);
    setBusy(null);
  };

  // Sources the player can auto-source from (unlocked only)
  const unlockedSources = Object.entries(SOURCES).filter(([, src]) => {
    return !src.rr || g.reputation >= src.rr;
  });

  // Only show sources the player has unlocked or can see
  const visibleSources = Object.entries(SOURCES).filter(([, src]) => {
    if (!src.rr) return true;
    return g.reputation >= src.rr - 10;
  });

  // Check if a source is closed today
  const isClosedToday = (src) => {
    if (!src.days) return false;
    return !src.days.includes(cal.dayOfWeek);
  };

  const inspect = async (sourceKey) => {
    setBusy(`inspect-${sourceKey}`);
    const result = await postAction('inspectSource', { sourceId: sourceKey });
    setSelectedLotItems([]);
    applyState(result);
    setBusy(null);
  };

  const buyFromLot = async (indices) => {
    setBusy('lotBuy');
    const result = await postAction('buyFromLot', { indices });
    hapticsMedium();
    setSelectedLotItems([]);
    applyState(result);
    setBusy(null);
  };

  const dismissLot = async () => {
    setBusy('lotDismiss');
    const result = await postAction('dismissLot');
    setSelectedLotItems([]);
    applyState(result);
    setBusy(null);
  };

  const toggleLotItem = (idx) => {
    setSelectedLotItems(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  return (
    <>
      {/* Lot Preview (tire inspection) */}
      {g.pendingLot && (
        <div className="card" style={{ borderColor: 'var(--gold)' }}>
          <div className="card-title">Lot Preview</div>
          <div className="text-xs text-dim mb-4">
            Inspect the lot and pick which tires to buy.
          </div>
          {(g.pendingLot.tires || []).map((tire, idx) => (
            <label key={idx} className="row gap-8 mb-4" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedLotItems.includes(idx)}
                onChange={() => toggleLotItem(idx)}
              />
              <span className="text-sm">
                {TIRES[tire.type]?.n || tire.type} {tire.grade && `(${tire.grade})`}
              </span>
              {tire.cost != null && (
                <span className="text-xs text-dim" style={{ marginLeft: 'auto' }}>${fmt(tire.cost)}</span>
              )}
            </label>
          ))}
          <div className="row gap-8" style={{ marginTop: 8 }}>
            <button
              className="btn btn-sm btn-green flex-1"
              disabled={selectedLotItems.length === 0 || busy === 'lotBuy'}
              onClick={() => buyFromLot(selectedLotItems)}
            >
              {busy === 'lotBuy' ? 'Buying...' : `Buy Selected (${selectedLotItems.length})`}
            </button>
            <button
              className="btn btn-sm btn-green flex-1"
              disabled={busy === 'lotBuy'}
              onClick={() => buyFromLot((g.pendingLot.tires || []).map((_, i) => i))}
            >
              Buy All
            </button>
            <button
              className="btn btn-sm btn-outline flex-1"
              disabled={busy === 'lotDismiss'}
              onClick={dismissLot}
            >
              Walk Away
            </button>
          </div>
        </div>
      )}

      {/* Auto-Source Card */}
      <div className="card" style={{ borderColor: g.autoSource ? 'var(--green)' : 'var(--border)' }}>
        <div className="row-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}>Auto Source</div>
          {g.autoSource && (
            <span className="text-xs font-bold text-green">ACTIVE</span>
          )}
        </div>
        <div className="text-xs text-dim mb-4">
          Automatically buy tires every day so you stay stocked even while offline.
          Spends up to 50% of your cash to fill inventory.
        </div>
        <select
          className="autoprice-select"
          style={{ width: '100%', marginBottom: 4 }}
          value={g.autoSource || ''}
          onChange={(e) => setAutoSource(e.target.value)}
          disabled={busy === 'auto'}
        >
          <option value="">Off — Manual only</option>
          {unlockedSources.map(([id, src]) => (
            <option key={id} value={id}>
              {src.ic} {src.n} — ${src.c}/batch ({src.min}-{src.max} tires)
              {src.days ? ' (Fri-Sun)' : ''}
            </option>
          ))}
        </select>
        {g.autoSource && SOURCES[g.autoSource] && (
          <div className="text-xs text-green" style={{ marginTop: 4 }}>
            Auto-buying from {SOURCES[g.autoSource].n} daily. Stops if you run out of cash or space.
            {SOURCES[g.autoSource].days ? ' Only buys Fri/Sat/Sun.' : ''}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Source Used Tires</div>
        <div className="text-sm text-dim mb-4">
          Hit up local spots for used tires. You buy a batch, get a random mix of
          quality grades, then sell them from your van.
        </div>
        <div className="text-xs text-dim mb-4">
          Today: {cal.dayName} {cal.monthName} {cal.dayOfMonth}, Year {cal.year}
        </div>
        <div className="row-between text-sm">
          <span className="text-dim">Cash</span>
          <span className="font-bold text-green">${fmt(g.cash)}</span>
        </div>
        <div className="row-between text-sm mt-8">
          <span className="text-dim">Free Space</span>
          <span className={`font-bold ${freeSpace <= 3 ? 'text-red' : ''}`}>{freeSpace} / {cap}</span>
        </div>
      </div>

      {freeSpace <= 0 && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <div className="text-sm text-red font-bold">Storage Full!</div>
          <div className="text-xs text-dim">
            Sell some tires or upgrade your storage before sourcing more.
          </div>
        </div>
      )}

      {visibleSources.map(([id, src]) => {
        const locked = src.rr && g.reputation < src.rr;
        const cantAfford = g.cash < src.c;
        const noSpace = freeSpace <= 0;
        const closed = isClosedToday(src);

        return (
          <div key={id} className="card" style={locked ? { opacity: 0.6 } : closed ? { opacity: 0.7 } : {}}>
            <div className="row-between mb-4">
              <div>
                <span style={{ marginRight: 6 }}>{src.ic}</span>
                <span className="font-bold">{src.n}</span>
                {closed && <span className="text-xs text-dim" style={{ marginLeft: 6 }}>CLOSED</span>}
                {!closed && src.days && (
                  <span className="text-xs font-bold" style={{ marginLeft: 6, color: 'var(--green)', background: 'rgba(102,187,106,0.15)', padding: '1px 6px', borderRadius: 4 }}>
                    OPEN TODAY
                  </span>
                )}
              </div>
              <span className="text-accent font-bold">${fmt(src.c)}</span>
            </div>
            <div className="text-xs text-dim mb-4">{src.d}</div>
            <div className="text-xs text-dim mb-4">
              Yield: {src.min}-{src.max} tires
              {src.rr ? ` \u00B7 Rep ${src.rr}+ required` : ''}
              {src.days ? ` \u00B7 Open ${src.days.map(d => DAY_NAMES[d].slice(0, 3)).join('/')}` : ''}
            </div>
            <div className="row gap-8">
              <button
                className="btn btn-green btn-sm flex-1"
                disabled={locked || cantAfford || noSpace || busy === id || closed}
                onClick={() => buy(id)}
              >
                {locked
                  ? `Need Rep ${src.rr} (yours: ${g.reputation.toFixed(1)})`
                  : closed
                    ? `Closed — Open ${src.days.map(d => DAY_NAMES[d].slice(0, 3)).join('/')}`
                    : noSpace
                      ? 'Storage Full'
                      : cantAfford
                        ? 'Not enough cash'
                        : busy === id
                          ? 'Sourcing...'
                          : `Source ($${src.c})`}
              </button>
              {!locked && !closed && (
                <button
                  className="btn btn-sm btn-outline"
                  disabled={cantAfford || noSpace || busy === `inspect-${id}`}
                  onClick={() => inspect(id)}
                >
                  {busy === `inspect-${id}` ? '...' : 'Inspect'}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {g.locations.length === 0 && (
        <div className="card" style={{ borderColor: 'var(--accent)', borderStyle: 'dashed' }}>
          <div className="text-sm" style={{ lineHeight: 1.5 }}>
            <span className="font-bold text-accent">How selling works:</span> Your tires sell
            automatically each game day from your van. Demand depends on your prices, reputation,
            and the season. Check the Dashboard to see daily sales.
          </div>
        </div>
      )}

      {/* ── Flea Market Stands ── */}
      <div className="card">
        <div className="card-title">Flea Market Stands</div>
        <div className="text-xs text-dim mb-4">
          Open a stand at a flea market to sell used tires on Fri/Sat/Sun at 80% price.
          Used tires get a 1.4-1.6x demand bonus. Cost: ${fmt(FLEA_STAND_COST)} + transport.
        </div>

        {/* Active stands */}
        {(g.fleaMarketStands || []).length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div className="text-xs text-dim mb-4">Active Stands ({g.fleaMarketStands.length})</div>
            {g.fleaMarketStands.map(stand => (
              <div key={stand.id} className="row-between mb-4">
                <span className="text-sm">{stand.name}</span>
                <button
                  className="btn btn-sm btn-red"
                  disabled={busy === `close-${stand.id}`}
                  onClick={async () => {
                    setBusy(`close-${stand.id}`);
                    const result = await postAction('closeFleaStand', { standId: stand.id });
                    applyState(result);
                    setBusy(null);
                  }}
                >
                  Close
                </button>
              </div>
            ))}
            <div className="text-xs text-dim">
              Total sold at flea markets: {g.fleaMarketTotalSold || 0}
            </div>
          </div>
        )}

        {/* Available markets */}
        {FLEA_MARKETS.filter(m => !(g.fleaMarketStands || []).some(s => s.marketId === m.id)).map(market => {
          const transportLabels = { local: 50, regional: 150, distant: 250 };
          const totalCost = FLEA_STAND_COST + (transportLabels[market.transport] || 50);
          return (
            <div key={market.id} className="row-between mb-4">
              <div>
                <span className="text-sm font-bold">{market.name}</span>
                <span className="text-xs text-dim" style={{ marginLeft: 6 }}>+${transportLabels[market.transport] || 50} transport</span>
              </div>
              <button
                className="btn btn-sm btn-green"
                disabled={g.cash < totalCost || busy === `open-${market.id}`}
                onClick={async () => {
                  setBusy(`open-${market.id}`);
                  const res = await postAction('openFleaStand', { marketId: market.id });
                  if (res.error) alert(res.error);
                  applyState(res);
                  setBusy(null);
                }}
              >
                Open (${fmt(totalCost)})
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Car Meets ── */}
      {(() => {
        const dayOfYear = cal.dayOfYear || ((day - 1) % 360) + 1;
        const isSummer = dayOfYear >= CAR_MEET_SUMMER_START && dayOfYear <= CAR_MEET_SUMMER_END;
        const isWeekend = cal.dayOfWeek === 0 || cal.dayOfWeek === 5 || cal.dayOfWeek === 6;
        if (!isSummer) return null;
        return (
          <div className="card">
            <div className="card-title">Car Meets</div>
            <div className="text-xs text-dim mb-4">
              Summer weekend events! Performance tires sell at 1.3-1.5x premium.
              {g.carMeetsAttended > 0 && ` Attended: ${g.carMeetsAttended}`}
            </div>
            {!isWeekend ? (
              <div className="text-sm text-dim">Come back on a weekend (Fri-Sun) to attend a car meet!</div>
            ) : (
              CAR_MEETS.map(meet => {
                const alreadyAttending = (g.carMeetAttendance || []).some(a => a.meetId === meet.id && a.day === day);
                return (
                  <div key={meet.id} className="row-between mb-4">
                    <div>
                      <span className="text-sm font-bold">{meet.name}</span>
                      <span className="text-xs text-dim" style={{ marginLeft: 6 }}>Fee: ${meet.fee}</span>
                    </div>
                    <button
                      className="btn btn-sm btn-green"
                      disabled={alreadyAttending || g.cash < meet.fee + 300 || busy === `meet-${meet.id}`}
                      onClick={async () => {
                        setBusy(`meet-${meet.id}`);
                        const result = await postAction('attendCarMeet', { meetId: meet.id });
                        applyState(result);
                        setBusy(null);
                      }}
                    >
                      {alreadyAttending ? 'Attending' : 'Attend'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        );
      })()}
    </>
  );
}
