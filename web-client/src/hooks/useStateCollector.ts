import { useCallback, useRef, useEffect } from 'react';

/**
 * useStateCollector - Hook for executing AI-generated state collection
 *
 * This hook provides an API for collecting semantic UI state from the playground,
 * supporting both AI-generated collector functions and fallback collectors.
 */

export type StateValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | StateValue[]
  | { [key: string]: StateValue };

export type StateCollectionResult = {
  timestamp: number;
  syncId: string;
  values: Record<string, StateValue>;
  metadata?: Record<string, StateValue>;
};

export type StateCollector = () => Record<string, StateValue>;

interface UseStateCollectorOptions {
  debounceMs?: number;
  fallbackCollector?: StateCollector;
}

/**
 * Register a state collector in the playground iframe
 *
 * This function should be called from the playground code:
 * ```javascript
 * if (window.freeflow) {
 *   window.freeflow.registerCollector('loginForm', () => ({
 *     username: document.getElementById('username')?.value,
 *     password: document.getElementById('password')?.value,
 *   }));
 * }
 * ```
 */
export function registerStateCollector(
  name: string,
  collector: StateCollector
): void {
  // @ts-ignore
  if (!window.freeflow) {
    // @ts-ignore
    window.freeflow = { collectors: {} };
  }
  // @ts-ignore
  window.freeflow.collectors[name] = collector;
}

/**
 * Execute all registered collectors and return combined state
 */
export function executeCollectors(): Record<string, StateValue> {
  // @ts-ignore
  const collectors = window.freeflow?.collectors || {};
  const state: Record<string, StateValue> = {};

  for (const [name, collector] of Object.entries(collectors)) {
    try {
      if (typeof collector === 'function') {
        const result = collector();
        if (result && typeof result === 'object') {
          state[name] = result as StateValue;
        }
      }
    } catch (err) {
      console.error(`[StateCollector] Collector "${name}" failed:`, err);
    }
  }

  return state;
}

/**
 * Execute fallback collection (basic form elements)
 */
export function executeFallbackCollection(): Record<string, StateValue> {
  const state: Record<string, StateValue> = {};

  // Collect all form inputs
  const inputs = document.querySelectorAll('input, textarea, select');
  const formValues: Record<string, StateValue> = {};

  inputs.forEach((el) => {
    const element = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const key = element.id || element.name;
    if (!key) return;

    if (element instanceof HTMLInputElement) {
      switch (element.type) {
        case 'checkbox':
          formValues[key] = element.checked;
          break;
        case 'radio':
          if (element.checked) {
            formValues[key] = element.value;
          }
          break;
        case 'number':
        case 'range':
          formValues[key] = element.valueAsNumber;
          break;
        default:
          formValues[key] = element.value;
      }
    } else if (element instanceof HTMLSelectElement) {
      if (element.multiple) {
        const selected = Array.from(element.selectedOptions).map((opt) => opt.value);
        formValues[key] = selected;
      } else {
        formValues[key] = element.value;
      }
    } else {
      formValues[key] = element.value;
    }
  });

  if (Object.keys(formValues).length > 0) {
    state.formValues = formValues;
  }

  // Collect selected/toggled states
  const selected = document.querySelectorAll('[data-selected], .selected, [aria-selected="true"]');
  if (selected.length > 0) {
    state.selectedElements = Array.from(selected).map((el) => ({
      id: el.id,
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.slice(0, 100),
    }));
  }

  // Collect active tab
  const activeTab = document.querySelector('[data-active], [data-tab].active, [aria-selected="true"]');
  if (activeTab) {
    state.activeTab = activeTab.getAttribute('data-tab') || activeTab.id || null;
  }

  // Collect scroll positions
  const scrollPositions: Record<string, number> = {};
  document.querySelectorAll('[data-scrollable], [data-track-scroll]').forEach((el) => {
    const key = el.id || el.getAttribute('data-scrollable') || el.getAttribute('data-track-scroll');
    if (key) {
      scrollPositions[key] = (el as HTMLElement).scrollTop;
    }
  });
  if (Object.keys(scrollPositions).length > 0) {
    state.scrollPositions = scrollPositions;
  }

  return state;
}

/**
 * Hook for managing state collection
 */
export function useStateCollector(options: UseStateCollectorOptions = {}) {
  const { debounceMs = 500, fallbackCollector = executeFallbackCollection } = options;
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);

  const collect = useCallback(async (): Promise<StateCollectionResult> => {
    const now = Date.now();
    const syncId = `sync-${now}-${Math.random().toString(36).slice(2, 9)}`;

    // Execute registered collectors first
    const registeredState = executeCollectors();

    // Execute fallback collection
    const fallbackState = fallbackCollector();

    // Merge states (registered takes precedence)
    const values: Record<string, StateValue> = {
      ...fallbackState,
      ...registeredState,
    };

    return {
      timestamp: now,
      syncId,
      values,
    };
  }, [fallbackCollector]);

  const collectDebounced = useCallback(async (): Promise<StateCollectionResult | null> => {
    return new Promise((resolve) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(async () => {
        const result = await collect();
        lastSyncRef.current = result.timestamp;
        resolve(result);
      }, debounceMs);
    });
  }, [collect, debounceMs]);

  const collectImmediate = useCallback(async (): Promise<StateCollectionResult> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const result = await collect();
    lastSyncRef.current = result.timestamp;
    return result;
  }, [collect]);

  const getLastSyncTime = useCallback(() => {
    return lastSyncRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    collect,
    collectDebounced,
    collectImmediate,
    getLastSyncTime,
    registerCollector: registerStateCollector,
  };
}

export default useStateCollector;
