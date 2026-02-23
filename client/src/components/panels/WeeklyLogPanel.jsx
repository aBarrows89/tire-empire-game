import React from 'react';
import { useGame } from '../../context/GameContext.jsx';

export default function WeeklyLogPanel() {
  const { state } = useGame();

  return (
    <>
      <div className="card">
        <div className="card-title">Activity Log</div>
        <div className="text-sm text-dim">Events and actions from recent weeks.</div>
      </div>

      {(state.logHistory || []).length === 0 ? (
        <div className="card">
          <div className="text-sm text-dim">No activity yet. Start sourcing tires!</div>
        </div>
      ) : (
        <div className="card">
          {state.logHistory.map((entry, i) => (
            <div key={i} className="log-entry">
              <span className="log-week">Wk {entry.week}</span>{' '}
              {entry.msg}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
