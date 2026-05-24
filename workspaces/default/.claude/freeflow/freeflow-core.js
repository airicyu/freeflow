/**
 * Freeflow Infrastructure - Core System
 *
 * WARNING: This is INFRASTRUCTURE code. Do NOT edit directly.
 * Add new collectors in app.js using window.freeflow.registerCollector()
 */

// Playground State Management
const PlaygroundState = {
  current: {},
  listeners: new Set(),

  update(newState) {
    this.current = { ...this.current, ...newState };
    this.listeners.forEach((cb) => cb(this.current));
  },

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  },

  get() {
    return this.current;
  },
};

// Freeflow Core - Exposed globally for AI use
window.freeflow = window.freeflow || {
  collectors: {},
  state: PlaygroundState,
  version: '1.0.0',

  /**
   * Register a state collector (call from app.js for UI-specific collectors)
   * @param {string} name - Collector name
   * @param {function} collectorFn - Function returning state object
   */
  registerCollector(name, collectorFn) {
    if (typeof collectorFn !== 'function') {
      console.error(`[Freeflow] Collector "${name}" must be a function`);
      return;
    }
    this.collectors[name] = collectorFn;
    console.log(`[Freeflow] Registered collector: ${name}`);
  },

  /**
   * Execute all collectors and return combined state
   * @returns {object} Combined state from all collectors
   */
  collectState() {
    const state = {
      timestamp: Date.now(),
      values: {},
      metadata: {
        version: this.version,
        collectorCount: Object.keys(this.collectors).length,
      },
    };

    for (const [name, collector] of Object.entries(this.collectors)) {
      try {
        if (typeof collector === 'function') {
          const result = collector();
          state.values[name] = result;
        }
      } catch (err) {
        console.error(`[Freeflow] Collector "${name}" failed:`, err);
      }
    }

    return state;
  },

  /**
   * Trigger a state sync (called by sync button)
   */
  requestSync() {
    const btn = document.getElementById('sync-state-btn');
    if (btn) {
      btn.click();
    }
  },
};

// DOM Ready Handler
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFreeflow);
} else {
  initFreeflow();
}

function initFreeflow() {
  console.log('[Freeflow] Core initialized v' + window.freeflow.version);

  // Setup sync button
  const syncBtn = document.getElementById('sync-state-btn');
  if (syncBtn) {
    syncBtn.classList.remove('hidden');
    syncBtn.addEventListener('click', handleSyncRequest);
  }

  // Listen for messages from parent (browser client)
  window.addEventListener('message', handleParentMessage);

  // Track form interactions for auto-sync
  trackFormInteractions();
}

// Handle sync button click
function handleSyncRequest() {
  console.log('[Freeflow] State sync requested');
  const state = window.freeflow.collectState();
  window.parent.postMessage({ type: 'state_sync_result', data: state }, '*');
}

// Handle messages from parent window
function handleParentMessage(event) {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  switch (data.type) {
    case 'dom_command':
      executeDomCommand(data);
      break;
    case 'apply_state':
      applyState(data.data);
      break;
    case 'request_state_sync':
      handleSyncRequest();
      break;
    default:
      console.log('[Freeflow] Unknown message type:', data.type);
  }
}

// Execute DOM command from AI
function executeDomCommand(cmd) {
  console.log('[Freeflow] Executing DOM command:', cmd.action, cmd.selector);

  try {
    const element = document.querySelector(cmd.selector);
    if (!element) {
      console.warn('[Freeflow] Element not found:', cmd.selector);
      return;
    }

    switch (cmd.action) {
      case 'check':
        if (element.type === 'checkbox') {
          element.checked = true;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
        break;
      case 'uncheck':
        if (element.type === 'checkbox') {
          element.checked = false;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
        break;
      case 'setText':
        element.textContent = cmd.value;
        break;
      case 'setHtml':
        element.innerHTML = cmd.value;
        break;
      case 'setValue':
        element.value = cmd.value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      case 'setProperty':
        element[cmd.property] = cmd.value;
        break;
      case 'setAttribute':
        element.setAttribute(cmd.attribute, cmd.value);
        break;
      case 'setStyle':
        Object.assign(element.style, cmd.value);
        break;
      case 'addClass':
        element.classList.add(cmd.value);
        break;
      case 'removeClass':
        element.classList.remove(cmd.value);
        break;
      case 'toggleClass':
        element.classList.toggle(cmd.value);
        break;
      case 'click':
        element.click();
        break;
      case 'focus':
        element.focus();
        break;
      case 'scrollIntoView':
        element.scrollIntoView({ behavior: 'smooth', ...cmd.value });
        break;
      case 'remove':
        element.remove();
        break;
      case 'appendHtml':
        element.insertAdjacentHTML('beforeend', cmd.value);
        break;
      case 'prependHtml':
        element.insertAdjacentHTML('afterbegin', cmd.value);
        break;
      case 'insertBefore':
        element.insertAdjacentHTML('beforebegin', cmd.value);
        break;
      case 'insertAfter':
        element.insertAdjacentHTML('afterend', cmd.value);
        break;
      default:
        console.warn('[Freeflow] Unknown action:', cmd.action);
    }

    triggerStateUpdate();
  } catch (err) {
    console.error('[Freeflow] DOM command failed:', err);
  }
}

// Apply state to UI (restores form values, selections, etc.)
function applyState(state) {
  if (!state || typeof state !== 'object') return;

  if (state.values?.formValues) {
    Object.entries(state.values.formValues).forEach(([key, value]) => {
      const input = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = Boolean(value);
        } else if (input.type === 'radio') {
          const radio = document.querySelector(`[name="${key}"][value="${value}"]`);
          if (radio) radio.checked = true;
        } else {
          input.value = String(value);
        }
      }
    });
  }

  PlaygroundState.update(state);
}

// Track form interactions and auto-update state
function trackFormInteractions() {
  const formElements = document.querySelectorAll('input, textarea, select');

  formElements.forEach((el) => {
    el.addEventListener('change', triggerStateUpdate);

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.addEventListener('input', debounce(triggerStateUpdate, 300));
    }
  });

  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((t) => {
        t.classList.remove('active');
        t.removeAttribute('data-active');
      });
      tab.classList.add('active');
      tab.setAttribute('data-active', 'true');
      triggerStateUpdate();
    });
  });
}

// Trigger state update from DOM
function triggerStateUpdate() {
  const state = window.freeflow.collectState();
  PlaygroundState.update(state);
}

// Utility: Debounce function
function debounce(fn, ms) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Utility: Create element helper (for AI use)
window.createElement = function (tag, props = {}, children = []) {
  const el = document.createElement(tag);

  Object.entries(props).forEach(([key, value]) => {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value);
    }
  });

  children.forEach((child) => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  });

  return el;
};

console.log('[Freeflow] Core loaded - use window.freeflow.registerCollector() for UI-specific state');
