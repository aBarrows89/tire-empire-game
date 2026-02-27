import React, { useState, useEffect, useRef } from 'react';

export default function PanelTransition({ panelKey, children }) {
  const [displayKey, setDisplayKey] = useState(panelKey);
  const [phase, setPhase] = useState('enter'); // 'enter' | 'exit'
  const prevKey = useRef(panelKey);

  useEffect(() => {
    if (panelKey !== prevKey.current) {
      setPhase('exit');
      const exitTimer = setTimeout(() => {
        setDisplayKey(panelKey);
        setPhase('enter');
        prevKey.current = panelKey;
      }, 120);
      return () => clearTimeout(exitTimer);
    }
  }, [panelKey]);

  const style = phase === 'exit'
    ? { animation: 'panelExit 120ms ease-in forwards' }
    : { animation: 'panelEnter 150ms ease-out forwards' };

  return (
    <div key={displayKey} style={style}>
      {children}
    </div>
  );
}
