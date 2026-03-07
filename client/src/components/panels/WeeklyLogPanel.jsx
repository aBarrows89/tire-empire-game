import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { formatDateShort } from '@shared/helpers/calendar.js';
import EmptyState from '../EmptyState.jsx';

const FILTERS = ['All', 'Sales', 'Events', 'Costs', 'Market', 'Trades', 'Source', 'Bank'];

export default function WeeklyLogPanel() {
  const { state, dispatch } = useGame();
  const [activeFilter, setActiveFilter] = useState('All');

  const filteredLogs = (state.logHistory || []).filter(entry => {
    if (activeFilter === 'All') return true;
    // If entry has a cat field, match against the filter (case-insensitive)
    if (entry.cat) {
      return entry.cat.toLowerCase() === activeFilter.toLowerCase();
    }
    // String-only entries (no cat) only show in "All"
    return false;
  });

  return (
    <>
      <div className="card">
        <div className="card-title">Activity Log</div>
        <div className="text-sm text-dim">Events and actions from recent days.</div>
      </div>

      <div className="log-pills">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`log-pill${activeFilter === f ? ' active' : ''}`}
            onClick={() => setActiveFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {filteredLogs.length === 0 ? (
        activeFilter === 'All' ? (
          <EmptyState
            vinnie="clipboard"
            title="No Activity Yet"
            message="Your log is empty. Start sourcing tires to see activity here!"
            actionLabel="Source Tires"
            onAction={() => dispatch({ type: 'SET_PANEL', payload: 'source' })}
          />
        ) : (
          <div className="card">
            <div className="text-sm text-dim">No {activeFilter.toLowerCase()} entries yet.</div>
          </div>
        )
      ) : (
        <div className="card">
          {filteredLogs.map((entry, i) => {
            // Nuclear guard: ensure msg is always a primitive string before rendering.
            // Prevents React Error #31 if a non-string object leaks into log entries.
            let msg;
            if (typeof entry === 'string') msg = entry;
            else if (typeof entry?.msg === 'string') msg = entry.msg;
            else if (entry?.msg != null) msg = String(entry.msg);
            else msg = '';
            if (!msg) return null;
            return (
              <div key={i} className="log-entry">
                <span className="log-week">{entry.day ? formatDateShort(entry.day) : `Day ${entry.week || '?'}`}</span>{' '}
                {msg}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
