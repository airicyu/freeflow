/**
 * Freeflow Infrastructure - Default State Collectors
 *
 * WARNING: This is INFRASTRUCTURE code. Do NOT edit directly.
 *
 * These collectors automatically collect common UI state.
 * Add UI-specific collectors in app.js using window.freeflow.registerCollector()
 */

// Helper to check if element is infrastructure (should be excluded from state)
function isInfrastructureElement(el) {
  if (!el) return true;
  // Exclude elements with ff-internal- prefix in ID
  if (el.id && el.id.startsWith('ff-internal-')) return true;
  // Exclude elements inside infrastructure containers
  if (el.closest && el.closest('[data-ff-internal-internal]')) return true;
  if (el.closest && el.closest('[id^="ff-internal-"]')) return true;
  return false;
}

(function initDefaultCollectors() {
  // Wait for freeflow core to be ready
  if (!window.freeflow) {
    console.warn('[Freeflow] Core not loaded yet, collectors will not initialize');
    return;
  }

  // Form values collector - captures all input/textarea/select values
  window.freeflow.registerCollector('formValues', () => {
    const values = {};
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      // Skip infrastructure elements
      if (isInfrastructureElement(el)) return;

      const key = el.id || el.name;
      if (!key) return;

      if (el.type === 'checkbox') {
        values[key] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) values[key] = el.value;
      } else {
        values[key] = el.value;
      }
    });
    return values;
  });

  // Selection state collector - captures selected elements
  window.freeflow.registerCollector('selections', () => {
    const selected = document.querySelectorAll('[data-selected], .selected, [aria-selected="true"]');
    return Array.from(selected)
      .filter((el) => !isInfrastructureElement(el))
      .map((el) => ({
        id: el.id,
        tag: el.tagName,
        text: el.textContent?.slice(0, 100),
      }));
  });

  // Active tab collector - captures currently active tab
  window.freeflow.registerCollector('activeTab', () => {
    const active = document.querySelector('[data-active], [data-tab].active, [aria-selected="true"]');
    if (!active || isInfrastructureElement(active)) return null;
    return {
      id: active.id,
      tab: active.getAttribute('data-tab'),
      text: active.textContent?.slice(0, 50),
    };
  });

  // Scroll positions collector - captures scrollable elements
  window.freeflow.registerCollector('scrollPositions', () => {
    const positions = {};
    document.querySelectorAll('[data-scrollable], [data-track-scroll]').forEach((el) => {
      if (isInfrastructureElement(el)) return;
      const key = el.id || el.getAttribute('data-scrollable');
      if (key && !key.startsWith('ff-internal-')) {
        positions[key] = el.scrollTop;
      }
    });
    return positions;
  });

  console.log('[Freeflow] Default collectors registered (formValues, selections, activeTab, scrollPositions)');
})();
