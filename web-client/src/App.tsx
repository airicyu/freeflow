import React, { useState, useCallback } from 'react';
import { TerminalPanel } from './components/TerminalPanel';
import { PlaygroundPanel } from './components/PlaygroundPanel';
import { ResizableSplit } from './components/ResizableSplit';
import './styles.css';

/**
 * Freeflow Main App
 *
 * Split-panel layout:
 * - Left: Terminal (xterm.js running Claude Code)
 * - Right: Playground (iframe with Vite dev server)
 */

const App: React.FC = () => {
  // Default split: 40% terminal, 60% playground
  const [splitPercent, setSplitPercent] = useState(40);

  const handleResize = useCallback((newPercent: number) => {
    setSplitPercent(Math.max(20, Math.min(80, newPercent)));
  }, []);

  return (
    <div className="freeflow-app">
      <ResizableSplit
        left={<TerminalPanel />}
        right={<PlaygroundPanel />}
        splitPercent={splitPercent}
        onResize={handleResize}
      />
    </div>
  );
};

export default App;
