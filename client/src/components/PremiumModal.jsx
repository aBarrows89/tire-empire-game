import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useGame } from '../context/GameContext.jsx';
import { postAction } from '../api/client.js';

const BENEFITS = [
  { icon: '\u{1F6AB}', text: 'No ads \u2014 ever' },
  { icon: '\u{1F451}', text: 'Premium badge on profile & leaderboard' },
  { icon: '\u{2728}', text: 'Gold name effect (included free)' },
  { icon: '\u{1F4AC}', text: 'Priority customer support' },
  { icon: '\u{1F680}', text: 'Early access to new features' },
];

const isNative = Capacitor.isNativePlatform();

export default function PremiumModal({ onClose }) {
  const { refreshState } = useGame();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const handleSubscribe = async () => {
    setBusy('subscribe');
    setError(null);

    try {
      if (isNative) {
        // Production: Use RevenueCat for real IAP
        // The @revenuecat/purchases-capacitor plugin must be installed
        // and configured with your RevenueCat API keys
        try {
          const { Purchases } = await import('@revenuecat/purchases-capacitor');
          const offerings = await Purchases.getOfferings();
          const monthly = offerings.current?.monthly;
          if (!monthly) {
            setError('No subscription available. Try again later.');
            setBusy(null);
            return;
          }
          const { customerInfo } = await Purchases.purchasePackage({ aPackage: monthly });
          if (customerInfo.entitlements.active['pro']) {
            await postAction('activatePremium', {});
            refreshState();
            onClose();
            return;
          }
        } catch (iapErr) {
          // If RevenueCat is not installed, fall through to dev mode
          if (iapErr?.code === 'PURCHASE_CANCELLED_ERROR') {
            setBusy(null);
            return;
          }
          // Fall through to dev activation if RevenueCat not available
          console.warn('IAP not available, using dev fallback:', iapErr);
        }
      }

      // Dev mode fallback: activate via server action
      const res = await postAction('setPremium', {});
      if (res.ok) {
        refreshState();
        onClose();
      } else {
        setError(res.error || 'Failed to activate premium');
      }
    } catch (err) {
      setError('Purchase failed. Please try again.');
    }
    setBusy(null);
  };

  const handleRestore = async () => {
    setBusy('restore');
    setError(null);

    try {
      if (isNative) {
        try {
          const { Purchases } = await import('@revenuecat/purchases-capacitor');
          const { customerInfo } = await Purchases.restorePurchases();
          if (customerInfo.entitlements.active['pro']) {
            await postAction('activatePremium', {});
            refreshState();
            onClose();
            return;
          } else {
            setError('No active subscription found.');
          }
        } catch {
          setError('Could not restore purchases.');
        }
      } else {
        setError('Restore is only available on mobile devices.');
      }
    } catch {
      setError('Restore failed. Please try again.');
    }
    setBusy(null);
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

        {error && (
          <div className="text-sm text-red" style={{ marginBottom: 8, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button className="premium-cta" onClick={handleSubscribe} disabled={!!busy}>
          {busy === 'subscribe' ? 'Processing...' : 'Subscribe Now'}
        </button>

        <div>
          <button className="premium-restore" onClick={handleRestore} disabled={!!busy}>
            {busy === 'restore' ? 'Restoring...' : 'Restore Purchase'}
          </button>
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
