import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export type WebSocketMessage =
  | { type: 'chat_input'; data: string }
  | { type: 'pty_resize'; rows: number; cols: number }
  | { type: 'state_sync_result'; data: { syncId: string; state: unknown; timestamp: number } }
  | { type: string; data?: unknown };

interface UseWebSocketOptions {
  reconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
}

// Global WebSocket manager - singleton per URL
class WebSocketManager {
  private socket: WebSocket | null = null;
  private status: WebSocketStatus = 'disconnected';
  private subscribers = new Set<() => void>();
  private messageHandlers = new Set<(msg: WebSocketMessage) => void>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: WebSocketMessage[] = [];

  constructor(
    private url: string,
    private options: {
      reconnect: boolean;
      reconnectIntervalMs: number;
      maxReconnectAttempts: number;
    }
  ) {}

  private notify() {
    this.subscribers.forEach((cb) => cb());
  }

  private setStatus(status: WebSocketStatus) {
    this.status = status;
    this.notify();
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.setStatus('connecting');

    try {
      const socket = new WebSocket(this.url);
      this.socket = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Connected');
        this.setStatus('connected');
        this.reconnectAttempts = 0;

        // Send queued messages
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          if (msg) socket.send(JSON.stringify(msg));
        }
      };

      socket.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.socket = null;
        this.setStatus('disconnected');

        if (this.options.reconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.setStatus('reconnecting');
          this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            console.log(`[WebSocket] Reconnecting... (attempt ${this.reconnectAttempts})`);
            this.connect();
          }, this.options.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts));
        }
      };

      socket.onerror = (event) => {
        console.error('[WebSocket] Error:', event);
        this.setStatus('disconnected');
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          const msgType = (message as {type?: string}).type;
          // Skip logging pty_output to avoid spam
          if (msgType !== 'pty_output') {
            console.log('[WebSocket] Received:', msgType, 'handlers:', this.messageHandlers.size);
          }
          this.messageHandlers.forEach((handler) => {
            try {
              handler(message);
            } catch (err) {
              console.error('[WebSocket] Handler error:', err);
            }
          });
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };
    } catch (err) {
      console.error('[WebSocket] Failed to create connection:', err);
      this.setStatus('disconnected');
    }
  }

  send(message: WebSocketMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
      if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
        this.connect();
      }
    }
  }

  subscribe(callback: () => void) {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  registerHandler(handler: (msg: WebSocketMessage) => void) {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  getStatus() {
    return this.status;
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

// Global managers registry
const managers = new Map<string, WebSocketManager>();
const refCounts = new Map<string, number>();

export function useWebSocket(
  url: string,
  options: UseWebSocketOptions = {}
) {
  const {
    reconnect = true,
    reconnectIntervalMs = 1000,
    maxReconnectAttempts = 5,
    onOpen,
    onClose,
    onError,
    onMessage,
  } = options;

  // Get or create global manager
  const [manager] = useState(() => {
    if (!managers.has(url)) {
      managers.set(url, new WebSocketManager(url, {
        reconnect,
        reconnectIntervalMs,
        maxReconnectAttempts,
      }));
    }
    return managers.get(url)!;
  });

  // Subscribe to status changes
  const status = useSyncExternalStore(
    manager.subscribe.bind(manager),
    manager.getStatus.bind(manager)
  );

  const handlersRef = useRef({ onOpen, onClose, onError, onMessage });
  handlersRef.current = { onOpen, onClose, onError, onMessage };

  // Register/unregister message handlers
  useEffect(() => {
    console.log('[useWebSocket] Mount - registering handler for', url);
    const count = refCounts.get(url) || 0;
    refCounts.set(url, count + 1);
    console.log('[useWebSocket] Ref count:', count + 1);

    // Connect on first mount only (global ref counting)
    if (count === 0) {
      console.log('[useWebSocket] First mount, connecting...');
      manager.connect();
    } else {
      console.log('[useWebSocket] Reusing existing connection');
    }

    // Always register this hook instance's handlers
    const unsubscribeHandler = manager.registerHandler((msg) => {
      const msgType = (msg as {type?: string}).type;
      if (msgType !== 'pty_output') {
        console.log('[useWebSocket] Handler called for:', msgType);
      }
      handlersRef.current.onMessage?.(msg);
    });
    console.log('[useWebSocket] Handler registered');

    return () => {
      console.log('[useWebSocket] Cleanup - unregistering handler for', url);
      unsubscribeHandler();
      const newCount = (refCounts.get(url) || 1) - 1;
      refCounts.set(url, newCount);
      console.log('[useWebSocket] Ref count after cleanup:', newCount);
      if (newCount === 0) {
        console.log('[useWebSocket] Last ref, disconnecting');
        manager.disconnect();
        managers.delete(url);
        refCounts.delete(url);
      }
    };
  }, [manager, url]);

  // Notify callbacks on status change
  useEffect(() => {
    if (status === 'connected') handlersRef.current.onOpen?.();
    if (status === 'disconnected') handlersRef.current.onClose?.();
  }, [status]);

  const send = useCallback((message: WebSocketMessage) => {
    manager.send(message);
  }, [manager]);

  const registerHandler = useCallback((handler: (msg: WebSocketMessage) => void) => {
    return manager.registerHandler(handler);
  }, [manager]);

  const reconnectManual = useCallback(() => {
    manager.disconnect();
    manager.connect();
  }, [manager]);

  return {
    ws: status === 'connected' ? manager['socket'] as WebSocket : null,
    status,
    send,
    connect: manager.connect.bind(manager),
    disconnect: manager.disconnect.bind(manager),
    reconnect: reconnectManual,
    registerHandler,
    isConnected: status === 'connected',
  };
}

export default useWebSocket;
