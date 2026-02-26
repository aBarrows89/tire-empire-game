import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { postAction } from '../api/client.js';

const BENEFITS = [
  { icon: '\u{1F6AB}', text: 'No ads — ever' },
  { icon: '\u{1F451}', text: 'Premium badge on profile & leaderboard' },
  { icon: '\u{2728}', text: 'Gold name effect (included free)' },
  { icon: '\u{1F4AC}', text: 'Priority customer support' },
  { icon: '\u{1F680}', text: 'Early access to new features' },
];

export default function PremiumModal({ onClose }) {
  const { refreshState } = useGame();

  const handleSubscribe = async () => {
    // Dev mode: activate premium via server action
    // In production, this will trigger Google Play Billing
    const res = await postAction('setPremium', {});
    if (res.ok) {
      refreshState();
      onClose();
    }
  };

  return (
    <div className="premium-modal-backdrop" onClick={onClose}>
      <div className="premium-modal" onClick={e => e.stopPropagation()}>
        <div className="premium-modal-icon">{'\u{1F451}'}</div>
        <div className="premium-modal-title">TIRE EMPIRE PRO</div>
        <div className="premium-modal-price">
          $4.99<span>/month</span>
        </div>

        <div className="premium-benefits">
          {BENEFITS.map((b, i) => (
            <div key={i} className="premium-benefit">
              <span className="premium-benefit-icon">{b.icon}</span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>

        <button className="premium-cta" onClick={handleSubscribe}>
          Subscribe Now
        </button>

        <div>
          <button className="premium-restore">Restore Purchase</button>
        </div>
        <div>
          <button className="premium-dismiss" onClick={onClose}>
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
