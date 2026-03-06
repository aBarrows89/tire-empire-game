import React, { useState } from 'react';
import { sendCashToPlayer, reportPlayer, createTradeOffer } from '../api/client.js';
import { fmt } from '@shared/helpers/format.js';
import { hapticsMedium } from '../api/haptics.js';

/**
 * Action buttons for another player's profile: Trade, Send, Message, Report
 * @param {{ playerId: string, playerName: string, onMessage?: (playerId: string) => void, onRefresh?: () => void }} props
 */
export default function ProfileActions({ playerId, playerName, onMessage, onRefresh }) {
  const [modal, setModal] = useState(null); // 'send' | 'report' | null
  const [sendAmount, setSendAmount] = useState(1000);
  const [reportReason, setReportReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSendCash = async () => {
    setBusy(true);
    setMsg('');
    const res = await sendCashToPlayer(playerId, sendAmount);
    if (res.ok) {
      hapticsMedium();
      setMsg(`Sent $${fmt(sendAmount)} to ${playerName}`);
      setModal(null);
      if (onRefresh) onRefresh();
    } else {
      setMsg(res.error || 'Failed');
    }
    setBusy(false);
  };

  const handleReport = async () => {
    setBusy(true);
    setMsg('');
    const res = await reportPlayer(playerId, reportReason);
    if (res.ok) {
      setMsg('Report submitted');
      setModal(null);
    } else {
      setMsg(res.error || 'Failed');
    }
    setBusy(false);
  };

  return (
    <div>
      <div className="row gap-8" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-accent" style={{ flex: 1 }}
          onClick={() => {
            // Navigate to trade offer (use existing trade system)
            window.location.hash = `#trade?to=${playerId}`;
          }}>
          Trade
        </button>
        <button className="btn btn-sm btn-green" style={{ flex: 1 }}
          onClick={() => setModal('send')}>
          Send $
        </button>
        <button className="btn btn-sm btn-outline" style={{ flex: 1 }}
          onClick={() => {
            if (onMessage) onMessage(playerId);
            else window.location.hash = `#chat?dm=${playerId}`;
          }}>
          Message
        </button>
        <button className="btn btn-sm btn-red" style={{ flex: 1 }}
          onClick={() => setModal('report')}>
          Report
        </button>
      </div>

      {msg && <div className="text-xs" style={{ marginTop: 6, color: msg.includes('Failed') ? 'var(--red)' : 'var(--green)' }}>{msg}</div>}

      {/* Send Cash Modal */}
      {modal === 'send' && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="card-title">Send Cash to {playerName}</div>
          <div style={{ marginBottom: 8 }}>
            <input type="number" min={1} max={10000000} value={sendAmount}
              onChange={e => setSendAmount(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              placeholder="Amount" />
          </div>
          <div className="row gap-8">
            <button className="btn btn-sm btn-green" style={{ flex: 1 }} disabled={busy}
              onClick={handleSendCash}>
              Send ${fmt(sendAmount)}
            </button>
            <button className="btn btn-sm btn-outline" style={{ flex: 1 }}
              onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {modal === 'report' && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="card-title">Report {playerName}</div>
          <div style={{ marginBottom: 8 }}>
            <select value={reportReason} onChange={e => setReportReason(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
              <option value="">Select reason...</option>
              <option value="harassment">Harassment</option>
              <option value="scam">Scam / Fraud</option>
              <option value="inappropriate_name">Inappropriate Name</option>
              <option value="exploit">Exploiting / Cheating</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="row gap-8">
            <button className="btn btn-sm btn-red" style={{ flex: 1 }}
              disabled={busy || !reportReason}
              onClick={handleReport}>
              Submit Report
            </button>
            <button className="btn btn-sm btn-outline" style={{ flex: 1 }}
              onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
