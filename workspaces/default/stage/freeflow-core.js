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

// UI Refresh State
const RefreshState = {
  currentUpdateId: null,
  isCooking: false,
  isPreDeploy: false,
};

// Freeflow Core - Exposed globally for AI use
window.freeflow = window.freeflow || {
  collectors: {},
  state: PlaygroundState,
  version: '2.0.0',

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

  /**
   * Save state before reload for restoration after
   */
  beforeReload() {
    sessionStorage.setItem('ff-internal-scroll', String(window.scrollY));
    sessionStorage.setItem('ff-internal-scroll-x', String(window.scrollX));
    const activeEl = document.activeElement;
    if (activeEl && activeEl.id && !activeEl.id.startsWith('ff-internal-')) {
      sessionStorage.setItem('ff-internal-focus', activeEl.id);
    }
    sessionStorage.setItem('ff-internal-reload-time', String(Date.now()));
  },

  /**
   * Restore state after reload
   */
  afterReload() {
    const reloadTime = sessionStorage.getItem('ff-internal-reload-time');
    if (reloadTime) {
      // Only restore if we just reloaded (within last 5 seconds)
      const timeSinceReload = Date.now() - parseInt(reloadTime, 10);
      if (timeSinceReload < 5000) {
        const scrollY = sessionStorage.getItem('ff-internal-scroll');
        const scrollX = sessionStorage.getItem('ff-internal-scroll-x');
        const focusId = sessionStorage.getItem('ff-internal-focus');

        if (scrollY || scrollX) {
          window.scrollTo(
            parseInt(scrollX || '0', 10),
            parseInt(scrollY || '0', 10)
          );
        }

        if (focusId) {
          const el = document.getElementById(focusId);
          if (el && !el.closest('[data-ff-internal-internal]') && !el.id?.startsWith('ff-internal-')) {
            el.focus();
          }
        }

        // Clean up
        sessionStorage.removeItem('ff-internal-scroll');
        sessionStorage.removeItem('ff-internal-scroll-x');
        sessionStorage.removeItem('ff-internal-focus');
        sessionStorage.removeItem('ff-internal-reload-time');
      }
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

  // Create UI infrastructure elements
  createUiInfrastructure();

  // Listen for messages from parent (browser client)
  window.addEventListener('message', handleParentMessage);

  // Track form interactions for auto-sync
  trackFormInteractions();

  // Restore state after reload
  window.freeflow.afterReload();
}

// Create UI infrastructure elements (cooking toast, deploy overlay)
function createUiInfrastructure() {
  // Remove any existing infrastructure elements first
  document.getElementById('ff-internal-cooking-indicator')?.remove();
  document.getElementById('ff-internal-deploy-overlay')?.remove();

  // Create cooking indicator (non-blocking toast)
  const cookingIndicator = document.createElement('div');
  cookingIndicator.id = 'ff-internal-cooking-indicator';
  cookingIndicator.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(59, 130, 246, 0.95);
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    z-index: 99999;
    display: none;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: none;
  `;
  cookingIndicator.innerHTML = `
    <span style="display: inline-block; animation: ff-spin 1s linear infinite;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
      </svg>
    </span>
    <span id="ff-internal-cooking-text">AI is cooking the UI changes...</span>
  `;
  document.body.appendChild(cookingIndicator);

  // Add spin animation
  if (!document.getElementById('ff-internal-styles')) {
    const styles = document.createElement('style');
    styles.id = 'ff-internal-styles';
    styles.textContent = `
      @keyframes ff-spin { 100% { transform: rotate(360deg); } }
      #ff-internal-deploy-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: 99998;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 16px;
      }
      #ff-internal-deploy-toast {
        background: rgba(59, 130, 246, 0.95);
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
    `;
    document.head.appendChild(styles);
  }

  // Create deploy overlay (initially hidden)
  const deployOverlay = document.createElement('div');
  deployOverlay.id = 'ff-internal-deploy-overlay';
  deployOverlay.style.display = 'none';
  deployOverlay.innerHTML = `
    <div id="ff-internal-deploy-toast">
      <span style="display: inline-block; animation: ff-spin 1s linear infinite; margin-right: 8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
        </svg>
      </span>
      AI is deploying...
    </div>
  `;
  document.body.appendChild(deployOverlay);
}

// Show cooking toast
function showCookingToast(message = 'AI is cooking the UI changes...') {
  const indicator = document.getElementById('ff-internal-cooking-indicator');
  const text = document.getElementById('ff-internal-cooking-text');
  if (indicator && text) {
    text.textContent = message;
    indicator.style.display = 'flex';
  }
  RefreshState.isCooking = true;
}

// Hide cooking toast
function hideCookingToast() {
  const indicator = document.getElementById('ff-internal-cooking-indicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
  RefreshState.isCooking = false;
}

// Show deploy overlay (blocking)
function showDeployOverlay() {
  hideCookingToast();
  const overlay = document.getElementById('ff-internal-deploy-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
  RefreshState.isPreDeploy = true;

  // Send final state sync
  if (RefreshState.currentUpdateId) {
    const state = window.freeflow.collectState();
    window.parent.postMessage({
      type: 'state_sync_result',
      data: {
        state,
        updateId: RefreshState.currentUpdateId,
        isFinal: true,
      }
    }, '*');
  }
}

// Trigger reload with state preservation
function triggerReload(updateId) {
  console.log('[Freeflow] Reloading page, updateId:', updateId);
  RefreshState.currentUpdateId = updateId;
  window.freeflow.beforeReload();
  window.location.reload();
}

// Handle sync button click
function handleSyncRequest() {
  console.log('[Freeflow] State sync requested, collectors:', Object.keys(window.freeflow.collectors));
  const state = window.freeflow.collectState();
  console.log('[Freeflow] Collected state:', state);
  window.parent.postMessage({ type: 'state_sync_result', data: state }, '*');
  console.log('[Freeflow] Sent state_sync_result to parent');
}

// Handle messages from parent window
function handleParentMessage(event) {
  console.log('[Freeflow] Received message from parent:', typeof event.data, event.data?.type);
  const data = event.data;
  if (!data || typeof data !== 'object') {
    console.log('[Freeflow] Ignoring message - not an object');
    return;
  }

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
    case 'ui_cooking':
      RefreshState.currentUpdateId = data.updateId;
      showCookingToast(data.message);
      break;
    case 'ui_pre_deploy':
      RefreshState.currentUpdateId = data.updateId;
      showDeployOverlay();
      break;
    case 'ui_reload':
      triggerReload(data.updateId);
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
