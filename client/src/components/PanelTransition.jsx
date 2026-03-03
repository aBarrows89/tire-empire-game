import React, { useState, useEffect, useRef } from 'react';

export default function PanelTransition({ panelKey, children }) {
  const [displayKey, setDisplayKey] = useState(panelKey);
  const [phase, setPhase] = useState('enter'); // 'enter' | 'exit'
  const prevKey = useRef(panelKey);

  useEffect(() => {
    if (panelKey !== prevKey.current) {
      setDisplayKey(panelKey);
      setPhase('enter');
      prevKey.current = panelKey;
    }
  }, [panelKey]);

  const style = phase === 'enter'
    ? { animation: 'panelEnter 80ms ease-out forwards' }
    : {};

  return (
    <div key={displayKey} style={style}>
      {children}
    </div>
  );
}
