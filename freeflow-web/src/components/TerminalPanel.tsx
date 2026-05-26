import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { CanvasAddon } from '@xterm/addon-canvas';
import 'xterm/css/xterm.css';
import { useWebSocket } from '../hooks/useWebSocket';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export const TerminalPanel: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { ws, send } = useWebSocket('ws://localhost:3000/ws');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isReady, setIsReady] = useState(false);

  const handlePtyOutput = useCallback((data: string) => {
    if (terminalInstance.current) {
      terminalInstance.current.write(data);
    }
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    if (ws?.readyState === WebSocket.OPEN) {
      send({ type: 'pty_resize', cols, rows });
    }
  }, [ws, send]);

  // Wait for container to have actual pixel dimensions before initializing terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const checkDimensions = () => {
      const el = containerRef.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    if (checkDimensions()) {
      setIsReady(true);
      return;
    }

    // Wait for dimensions with ResizeObserver
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setIsReady(true);
          observer.disconnect();
          break;
        }
      }
    });

    observer.observe(containerRef.current);

    // Fallback timeout
    const timeout = setTimeout(() => setIsReady(true), 500);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, []);

  // Initialize terminal once container has dimensions
  useEffect(() => {
    if (!isReady || !terminalRef.current || terminalInstance.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: '"Cascadia Code", Monaco, Menlo, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: 'rgba(74, 158, 255, 0.3)',
      },
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new SearchAddon());
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new CanvasAddon());

    term.open(terminalRef.current);
    terminalInstance.current = term;
    fitAddonRef.current = fitAddon;

    // Initial fit and resize
    fitAddon.fit();
    const { cols, rows } = term;
    sendResize(cols, rows);

    // Clear terminal to remove any content from wrong-sized PTY output
    term.clear();

    // Send resize again after a tick to ensure PTY syncs
    setTimeout(() => {
      if (terminalInstance.current && fitAddonRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalInstance.current;
        sendResize(cols, rows);
      }
    }, 100);

    term.onData((data) => {
      send({ type: 'chat_input', data });
    });

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'c') return true;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'c') return false;
      if ((e.ctrlKey || e.metaKey) && key === 'v') return false;
      return true;
    });

    const handlePaste = async (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text');
      if (text) send({ type: 'chat_input', data: text });
    };

    const el = terminalRef.current;
    el.addEventListener('paste', handlePaste as unknown as EventListener);

    const resizeObserver = new ResizeObserver(() => {
      if (!terminalInstance.current) return;
      fitAddon.fit();
      const { cols, rows } = term;
      sendResize(cols, rows);
    });
    resizeObserver.observe(el.parentElement!);

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener('paste', handlePaste as unknown as EventListener);
      term.dispose();
      terminalInstance.current = null;
      fitAddonRef.current = null;
    };
  }, [isReady, send, sendResize]);

  useEffect(() => {
    if (!ws) return;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'pty_output':
            handlePtyOutput(message.data);
            break;
          case 'connected':
            setConnectionStatus('connected');
            break;
          case 'error':
            console.error('[Terminal] Server error:', message.message);
            break;
        }
      } catch (err) {
        console.error('[Terminal] Failed to parse message:', err);
      }
    };

    ws.onopen = () => {
      setConnectionStatus('connected');
      if (terminalInstance.current && fitAddonRef.current) {
        // Clear terminal and force re-render
        terminalInstance.current.clear();
        terminalInstance.current.scrollToBottom();

        fitAddonRef.current.fit();
        const { cols, rows } = terminalInstance.current;
        sendResize(cols, rows);

        // Clear again after resize to remove any wrapped content
        setTimeout(() => {
          terminalInstance.current?.clear();
        }, 50);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      terminalInstance.current?.clear();
    };

    ws.onerror = () => setConnectionStatus('disconnected');
  }, [ws, handlePtyOutput, sendResize]);

  return (
    <div className="terminal-panel" ref={containerRef}>
      <div className="terminal-panel__header">
        <div className="terminal-panel__title">
          <span>Chat</span>
        </div>
        <div className="terminal-panel__status">
          <div className={`terminal-panel__status-dot ${connectionStatus}`} />
          <span style={{ fontSize: '11px', color: '#888' }}>
            {connectionStatus === 'connected' ? 'AI Agent' : connectionStatus}
          </span>
        </div>
      </div>
      <div className="terminal-panel__content">
        <div className="terminal-panel__xterm" ref={terminalRef} />
      </div>
    </div>
  );
};

export default TerminalPanel;
