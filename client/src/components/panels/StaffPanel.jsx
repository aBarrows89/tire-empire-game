import React from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { PAY } from '@shared/constants/staff.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction } from '../../api/client.js';

const ROLES = [
  { key: 'techs', label: 'Technicians', desc: 'Install tires, service capacity' },
  { key: 'sales', label: 'Sales Staff', desc: 'Customer service, upselling' },
  { key: 'managers', label: 'Managers', desc: '+15% efficiency per manager' },
  { key: 'drivers', label: 'Drivers', desc: 'Delivery, mobile service' },
  { key: 'pricingAnalyst', label: 'Pricing Analyst', desc: 'Unlocks auto-pricing strategies', max: 1 },
];

export default function StaffPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;

  const totalPayroll = Object.entries(g.staff).reduce(
    (a, [k, v]) => a + (PAY[k] || 0) * v, 0
  );

  const hire = async (role) => {
    await postAction('hireStaff', { role });
    refreshState();
  };

  const fire = async (role) => {
    await postAction('fireStaff', { role });
    refreshState();
  };

  return (
    <>
      <div className="card">
        <div className="card-title">Staff</div>
        <div className="text-sm text-dim">
          Monthly payroll: <span className="text-red font-bold">${fmt(totalPayroll)}</span>
        </div>
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
              <button
                className="btn btn-sm btn-red"
                disabled={count <= 0}
                onClick={() => fire(key)}
              >
                -
              </button>
              <span className="font-bold" style={{ fontSize: 20 }}>{count}</span>
              <button
                className="btn btn-sm btn-green"
                disabled={atMax}
                onClick={() => hire(key)}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
