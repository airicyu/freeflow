import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { CanvasAddon } from '@xterm/addon-canvas';
import 'xterm/css/xterm.css';
import { useWebSocket } from '../hooks/useWebSocket';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * TerminalPanel - xterm.js terminal running Claude Code
 *
 * Features:
 * - Full xterm.js terminal with ANSI support
 * - Bidirectional WebSocket communication with Bun server
 * - PTY output display (Claude Code TUI)
 * - PTY input forwarding (keyboard input)
 * - Auto-resize with fit addon
 * - Web link detection
 * - Search functionality
 */
export const TerminalPanel: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { ws, status, send } = useWebSocket('ws://localhost:3000/ws');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  // Handle PTY output from server
  const handlePtyOutput = useCallback((data: string) => {
    if (terminalInstance.current) {
      terminalInstance.current.write(data);
    }
  }, []);

  // Send resize to server
  const sendResize = useCallback((cols: number, rows: number) => {
    if (ws?.readyState === WebSocket.OPEN) {
      send({ type: 'pty_resize', cols, rows });
    }
  }, [ws, send]);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || terminalInstance.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: 'rgba(74, 158, 255, 0.3)',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
      // TUI (Claude Code) support:
      screenReaderMode: false,
      windowsMode: false,
      // Disable bell to avoid issues
      bellStyle: 'none',
      // Proper handling of alternate screen buffer
      altClickMovesCursor: false,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const canvasAddon = new CanvasAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(canvasAddon);

    term.open(terminalRef.current);

    // Handle keyboard input (typing and pastes via xterm)
    term.onData((data) => {
      // Send keystrokes to server
      send({ type: 'chat_input', data });
    });

    // Handle special key combos
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;

      const key = e.key.toLowerCase();

      // Ctrl+C: send interrupt to terminal (not browser copy)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'c') {
        return true; // Let xterm handle (sends \x03 ETX to bash)
      }

      // Ctrl+Shift+C: browser copy
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'c') {
        return false; // Let browser handle copy
      }

      // Ctrl+V: paste (handled by paste event)
      if ((e.ctrlKey || e.metaKey) && key === 'v') {
        return false;
      }

      return true;
    });

    // Handle browser paste events (Ctrl+V/Cmd+V)
    const handlePaste = async (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text');
      if (text && terminalInstance.current) {
        // Send paste content as if typed
        send({ type: 'chat_input', data: text });
      }
    };

    // Add paste listener to terminal element
    const termElement = terminalRef.current;
    termElement.addEventListener('paste', handlePaste as unknown as EventListener);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const { cols, rows } = term;
      sendResize(cols, rows);
    });

    if (terminalRef.current.parentElement) {
      resizeObserver.observe(terminalRef.current.parentElement);
    }

    // Initial fit
    fitAddon.fit();

    // Clear terminal on init (removes any stale content)
    term.clear();

    terminalInstance.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      resizeObserver.disconnect();
      termElement.removeEventListener('paste', handlePaste);
      term.dispose();
      terminalInstance.current = null;
      fitAddonRef.current = null;
    };
  }, [send, sendResize]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!ws) return;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'pty_output':
            // Ensure data is a string (handle Buffer serialization if needed)
            const text = typeof message.data === 'string' ? message.data :
              (message.data?.type === 'Buffer' ? new TextDecoder().decode(new Uint8Array(message.data.data)) : String(message.data));
            handlePtyOutput(text);
            break;
          case 'connected':
            console.log('[Terminal] Connected with clientId:', message.clientId);
            setConnectionStatus('connected');
            break;
          case 'vite_ready':
            console.log('[Terminal] Vite ready on port:', message.port);
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
      // Send initial resize
      if (terminalInstance.current && fitAddonRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalInstance.current;
        sendResize(cols, rows);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      // Clear terminal to avoid stale content on reconnect
      if (terminalInstance.current) {
        terminalInstance.current.clear();
      }
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
    };
  }, [ws, handlePtyOutput, sendResize]);

  const getStatusClass = () => {
    switch (connectionStatus) {
      case 'connecting': return 'connecting';
      case 'connected': return 'connected';
      case 'disconnected': return 'disconnected';
    }
  };

  return (
    <div className="terminal-panel">
      <div className="terminal-panel__header">
        <div className="terminal-panel__title">
          <span>Terminal</span>
        </div>
        <div className="terminal-panel__status">
          <div className={`terminal-panel__status-dot ${getStatusClass()}`} />
          <span style={{ fontSize: '11px', color: '#888' }}>
            {connectionStatus === 'connected' ? 'Claude Code' : connectionStatus}
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
