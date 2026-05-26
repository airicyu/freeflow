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
 * PlaygroundPanel - Interactive playground (iframe with workspace)
 *
 * Features:
 * - iframe pointing to Bun server workspace (port 3000)
 * - State sync button (triggers state collection)
 * - UI phase handling (ui_cooking, ui_pre_deploy, ui_reload)
 * - Loading indicator
 * - Error handling
 */
export const PlaygroundPanel: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<PlaygroundStatus>('loading');
  const iframeUrl = 'http://localhost:3000/workspaces/default/index.html';
  const { send, registerHandler } = useWebSocket('ws://localhost:3000/ws');
  const [syncInProgress, setSyncInProgress] = useState(false);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  // Check if server is ready
  useEffect(() => {
    const checkServer = async () => {
      try {
        const response = await fetch('http://localhost:3000/health');
        if (response.ok) {
          setStatus('ready');
        } else {
          setTimeout(checkServer, 1000);
        }
      } catch {
        setTimeout(checkServer, 1000);
      }
    };

    const timeout = setTimeout(checkServer, 1000);
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
          { type: 'request_state_sync' },
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


// UI Phase Messages
type UiPhaseMessage =
  | { type: 'ui_cooking'; updateId: string; message: string }
  | { type: 'ui_pre_deploy'; updateId: string }
  | { type: 'ui_reload'; updateId: string };

  // Listen for WebSocket messages (from server), forward commands to iframe
  useEffect(() => {
    console.log('[Playground] Registering handlers');
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

      // Handle UI phase messages
      const phaseMsg = message as UiPhaseMessage;
      if (['ui_cooking', 'ui_pre_deploy', 'ui_reload'].includes(msg.type || '')) {
        console.log('[Playground] UI phase message:', msg.type);
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(phaseMsg, '*');
        }

        // Update local status display
        switch (msg.type) {
          case 'ui_cooking':
            setUpdateStatus(phaseMsg.type === 'ui_cooking' ? (phaseMsg as { message: string }).message : 'Cooking...');
            break;
          case 'ui_pre_deploy':
            setUpdateStatus('Deploying...');
            break;
          case 'ui_reload':
            setUpdateStatus('Reloading...');
            break;
        }

        // Clear status after reload
        if (msg.type === 'ui_reload') {
          setTimeout(() => setUpdateStatus(null), 2000);
        }
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
          {status === 'ready' && !updateStatus && <span style={{ color: '#28a745' }}>(Ready)</span>}
          {updateStatus && <span style={{ color: '#0066cc' }}>({updateStatus})</span>}
          {status === 'error' && <span style={{ color: '#dc3545' }}>(Error)</span>}
        </div>
        <div className="playground-panel__actions">
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
