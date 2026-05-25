import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

type PlaygroundStatus = 'loading' | 'ready' | 'error';

// DOM command from server
type DomCommandMessage = {
  type: 'dom_command';
  action?: string;
  selector?: string;
  value?: string | boolean;
  property?: string;
  attribute?: string;
  id?: string;
};

/**
 * PlaygroundPanel - Interactive playground (iframe with Vite dev server)
 *
 * Features:
 * - iframe pointing to Vite dev server (port 3001)
 * - State sync button (triggers state collection)
 * - State collector executor (runs AI-generated state-collector.js)
 * - Loading indicator
 * - Error handling
 */
export const PlaygroundPanel: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<PlaygroundStatus>('loading');
  const iframeUrl = 'http://localhost:3001';
  const { send, registerHandler } = useWebSocket('ws://localhost:3000/ws');
  const [syncInProgress, setSyncInProgress] = useState(false);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if Vite is ready
  useEffect(() => {
    const checkVite = async () => {
      try {
        await fetch('http://localhost:3001/health', {
          mode: 'no-cors',
        });
        setStatus('ready');
      } catch {
        setTimeout(checkVite, 1000);
      }
    };

    const timeout = setTimeout(checkVite, 2000);
    return () => clearTimeout(timeout);
  }, []);

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    setStatus('ready');
  }, []);

  // Handle iframe error
  const handleIframeError = useCallback(() => {
    setStatus('error');
  }, []);

  // Reload iframe
  const handleReload = useCallback(() => {
    setStatus('loading');
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);


  // Trigger state sync - sends postMessage to iframe requesting state
  const handleSync = useCallback(() => {
    // Debounce multiple rapid sync calls
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }

    syncDebounceRef.current = setTimeout(() => {
      setSyncInProgress(true);

      // Request state from iframe via postMessage (CORS-safe)
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ type: 'request_state_sync' }),
          '*'
        );
      }
    }, 100);
  }, []);

  // Periodic auto-sync (runs every 5 seconds when playground is ready)
  useEffect(() => {
    if (status !== 'ready') return;

    const interval = setInterval(() => {
      if (!syncInProgress) {
        handleSync();
      }
    }, 5000); // 5 seconds

    return () => clearInterval(interval);
  }, [status, syncInProgress, handleSync]);


  // Listen for WebSocket messages (from server), forward commands to iframe
  useEffect(() => {
    console.log('[Playground] Registering dom_command handler');
    const unregister = registerHandler((message) => {
      const msg = message as { type?: string };
      if (msg.type !== 'pty_output') {
        console.log('[Playground] Handler received:', msg.type);
      }
      // Handle dom_command from server
      if (msg.type === 'dom_command') {
        const cmd = message as DomCommandMessage;
        console.log('[Playground] Received dom_command:', cmd.action, cmd.selector);
        if (iframeRef.current?.contentWindow) {
          console.log('[Playground] Forwarding to iframe');
          iframeRef.current.contentWindow.postMessage({
            type: 'dom_command',
            action: cmd.action,
            selector: cmd.selector,
            value: cmd.value,
            id: cmd.id,
            property: cmd.property,
            attribute: cmd.attribute,
          }, '*');
        } else {
          console.warn('[Playground] No iframe ref, cannot forward command');
        }
      }

      // Handle state sync request from server
      if (msg.type === 'request_state_sync') {
        handleSync();
      }
    });

    return () => {
      console.log('[Playground] Unregistering handler');
      unregister();
    };
  }, [registerHandler, handleSync]);

  // Listen for messages from iframe (postMessage)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = event.data;

        // Handle iframe messages (objects from postMessage)
        if (data && typeof data === 'object') {
          if (data.type === 'state_sync_result') {
            console.log('[Playground] Received state from iframe:', data.data);
            // Forward to server via WebSocket
            send({
              type: 'state_sync_result',
              data: {
                syncId: `sync-${Date.now()}`,
                state: data.data,
                timestamp: Date.now(),
              },
            });
            setSyncInProgress(false);
          }
          return;
        }
      } catch {
        // Not a JSON message, ignore
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [send]);

  return (
    <div className="playground-panel">
      <div className="playground-panel__header">
        <div className="playground-panel__title">
          <span>Playground</span>
          {status === 'loading' && <span>(Loading...)</span>}
          {status === 'ready' && <span style={{ color: '#28a745' }}>(Ready)</span>}
          {status === 'error' && <span style={{ color: '#dc3545' }}>(Error)</span>}
        </div>
        <div className="playground-panel__actions">
          <button
            className={`playground-panel__button ${syncInProgress ? 'primary' : ''}`}
            onClick={handleSync}
            disabled={syncInProgress || status !== 'ready'}
            title="Sync current state to AI"
          >
            {syncInProgress ? 'Syncing...' : 'Sync State'}
          </button>
          <button
            className="playground-panel__button"
            onClick={handleReload}
            title="Reload playground"
          >
            Reload
          </button>
        </div>
      </div>
      <div className="playground-panel__content">
        {status === 'loading' && (
          <div className="playground-panel__loading">
            <div className="playground-panel__spinner" />
            <span>Loading playground...</span>
          </div>
        )}

        {status === 'error' && (
          <div className="playground-panel__error">
            <span>Failed to load playground</span>
            <button className="playground-panel__button" onClick={handleReload}>
              Retry
            </button>
          </div>
        )}

        <iframe
          ref={iframeRef}
          className="playground-panel__iframe"
          src={iframeUrl}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          sandbox="allow-scripts allow-forms allow-same-origin"
          title="Freeflow Playground"
        />
      </div>
    </div>
  );
};

export default PlaygroundPanel;
