import React, { useState, useEffect, useRef } from 'react';

function formatWithCommas(n) {
  return Math.floor(n).toLocaleString();
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function AnimatedNumber({ value, prefix = '$', duration = 500 }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;

    if (from === to) {
      setDisplay(to);
      return;
    }

    const start = performance.now();

    function animate(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOut(progress);
      const current = from + (to - from) * eased;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span>{prefix}{formatWithCommas(display)}</span>;
}
