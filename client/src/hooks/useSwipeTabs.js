import { useRef, useCallback } from 'react';
import { hapticsLight } from '../api/haptics.js';

const MIN_SWIPE = 50;

export default function useSwipeTabs(tabs, currentTab, setTab) {
  const startX = useRef(0);
  const startY = useRef(0);

  const onTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - startX.current;
    const dy = endY - startY.current;

    // Only trigger if horizontal swipe dominates vertical
    if (Math.abs(dx) < MIN_SWIPE || Math.abs(dy) > Math.abs(dx)) return;

    const idx = tabs.indexOf(currentTab);
    if (idx === -1) return;

    if (dx < -MIN_SWIPE && idx < tabs.length - 1) {
      hapticsLight();
      setTab(tabs[idx + 1]);
    } else if (dx > MIN_SWIPE && idx > 0) {
      hapticsLight();
      setTab(tabs[idx - 1]);
    }
  }, [tabs, currentTab, setTab]);

  return { onTouchStart, onTouchEnd };
}
