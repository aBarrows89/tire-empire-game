import React from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { PAY } from '@shared/constants/staff.js';
import { MARKETPLACE_SPECIALIST } from '@shared/constants/marketplace.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction } from '../../api/client.js';
import { hapticsMedium } from '../../api/haptics.js';

const ROLES = [
  { key: 'techs', label: 'Technicians', desc: 'Install tires, service capacity' },
  { key: 'sales', label: 'Sales Staff', desc: 'Customer service, upselling' },
  { key: 'managers', label: 'Managers', desc: '+15% efficiency per manager' },
  { key: 'drivers', label: 'Drivers', desc: 'Delivery, mobile service' },
  { key: 'pricingAnalyst', label: 'Pricing Analyst', desc: 'Unlocks auto-pricing strategies', max: 1 },
];

export default function StaffPanel() {
  const { state, applyState, refreshState } = useGame();
  const g = state.game;
  const [pending, setPending] = React.useState(null);
  const [error, setError] = React.useState(null);

  const totalPayroll = Object.entries(g.staff).reduce(
    (a, [k, v]) => a + (PAY[k] || 0) * v, 0
  );

  const hire = async (role) => {
    if (pending) return;
    setPending(role + '_hire');
    setError(null);
    // Optimistic update — show change instantly
    applyState({ state: { ...g, staff: { ...g.staff, [role]: (g.staff[role] || 0) + 1 }, cash: g.cash - (PAY[role] || 0) } });
    try {
      const res = await postAction('hireStaff', { role });
      if (res?.error) {
        // Roll back on error
        refreshState();
        setError(res.error);
        setTimeout(() => setError(null), 3000);
        return;
      }
      hapticsMedium();
      if (res?.state) applyState(res); // Apply authoritative state from server
    } catch {
      refreshState(); // Sync on network error
    } finally {
      setPending(null);
    }
  };

  const fire = async (role) => {
    if (pending) return;
    setPending(role + '_fire');
    setError(null);
    // Optimistic update
    applyState({ state: { ...g, staff: { ...g.staff, [role]: Math.max(0, (g.staff[role] || 0) - 1) } } });
    try {
      const res = await postAction('fireStaff', { role });
      if (res?.error) {
        refreshState();
        setError(res.error);
        setTimeout(() => setError(null), 3000);
        return;
      }
      hapticsMedium();
      if (res?.state) applyState(res);
    } catch {
      refreshState();
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-title">Staff</div>
        <div className="text-sm text-dim">
          Monthly payroll: <span className="text-red font-bold">${fmt(totalPayroll)}</span>
        </div>
        {error && <div className="text-xs text-red mt-4">{error}</div>}
        {g.locations.length === 0 && (
          <div className="text-xs text-dim mt-8">Open a shop before hiring staff.</div>
        )}
      </div>

      {ROLES.map(({ key, label, desc, max }) => {
        const count = g.staff[key] || 0;
        const atMax = max !== undefined && count >= max;
        return (
          <div key={key} className="card">
            <div className="row-between mb-4">
              <div>
                <div className="font-bold text-sm">{label}</div>
                <div className="text-xs text-dim">{desc}</div>
              </div>
              <div className="text-xs text-dim">${fmt(PAY[key])}/mo{max ? '' : ' each'}</div>
            </div>
            <div className="row-between">
              <div className="staff-count">{count}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {count > 0 && (
                  <button
                    className="btn btn-sm btn-outline text-red"
                    onClick={() => fire(key)}
                    disabled={!!pending}
                  >
                    − Fire
                  </button>
                )}
                {!atMax && (
                  <button
                    className="btn btn-sm btn-green"
                    onClick={() => hire(key)}
                    disabled={!!pending || g.cash < (PAY[key] || 0)}
                  >
                    + Hire
                  </button>
                )}
                {atMax && <span className="text-xs text-dim">Max</span>}
              </div>
            </div>
            {key === 'pricingAnalyst' && count > 0 && (
              <div className="text-xs text-dim mt-4">Auto-pricing strategies unlocked in the Shops panel.</div>
            )}
          </div>
        );
      })}
    </>
  );
}
