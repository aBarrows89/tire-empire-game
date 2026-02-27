import React, { useRef, useState, useCallback } from 'react';
import { hapticsMedium } from '../api/haptics.js';

const THRESHOLD = 70;

export default function PullToRefresh({ onRefresh, children }) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    if (containerRef.current && containerRef.current.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!pulling || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, 120));
    }
  }, [pulling, refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (!pulling) return;
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      hapticsMedium();
      try {
        await onRefresh();
      } catch {}
      setRefreshing(false);
    }
    setPulling(false);
    setPullDistance(0);
  }, [pulling, pullDistance, refreshing, onRefresh]);

  const indicatorOpacity = Math.min(pullDistance / THRESHOLD, 1);
  const indicatorScale = 0.5 + indicatorOpacity * 0.5;
  const rotation = refreshing ? 'rotate(360deg)' : `rotate(${pullDistance * 3}deg)`;

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ position: 'relative' }}
    >
      {(pullDistance > 0 || refreshing) && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: refreshing ? 40 : pullDistance > 0 ? Math.min(pullDistance, 60) : 0,
          overflow: 'hidden',
          transition: refreshing ? 'none' : 'height 0.15s ease',
        }}>
          <div style={{
            fontSize: 20,
            opacity: indicatorOpacity,
            transform: `scale(${indicatorScale}) ${rotation}`,
            transition: refreshing ? 'transform 0.6s linear' : 'none',
            animation: refreshing ? 'ptr-spin 0.8s linear infinite' : 'none',
          }}>
            {refreshing ? '\u{1F504}' : '\u{2B07}\u{FE0F}'}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
