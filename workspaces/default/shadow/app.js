/**
 * Q3 Feature Prioritization Tool
 * ICE Scoring: Impact × Confidence / Effort
 */

(function initPrioritizationTool() {
  const state = {
    features: [],
    sortBy: 'score',
    sortDesc: true
  };

  let nextId = 1;

  // DOM Elements
  const featureInput = document.getElementById('featureName');
  const addButton = document.getElementById('addFeature');
  const featuresList = document.getElementById('featuresList');
  const sortBySelect = document.getElementById('sortBy');
  const sortOrderBtn = document.getElementById('sortOrder');
  const featureTemplate = document.getElementById('featureTemplate');

  // Calculate ICE score
  function calculateScore(impact, effort, confidence) {
    const i = parseInt(impact, 10);
    const e = parseInt(effort, 10);
    const c = parseInt(confidence, 10);
    return Number(((i * c) / e).toFixed(1));
  }

  // Get score class for coloring
  function getScoreClass(score) {
    if (score >= 6) return 'score-high';
    if (score >= 3) return 'score-medium';
    return 'score-low';
  }

  // Create feature element from template
  function createFeatureElement(feature) {
    const clone = featureTemplate.content.cloneNode(true);
    const card = clone.querySelector('.feature-card');

    card.dataset.id = feature.id;
    card.querySelector('.feature-name').textContent = feature.name;

    const impactSelect = card.querySelector('.impact-select');
    const effortSelect = card.querySelector('.effort-select');
    const confidenceSelect = card.querySelector('.confidence-select');
    const scoreValue = card.querySelector('.score-value');

    impactSelect.value = feature.impact;
    effortSelect.value = feature.effort;
    confidenceSelect.value = feature.confidence;

    const score = calculateScore(feature.impact, feature.effort, feature.confidence);
    scoreValue.textContent = score;
    scoreValue.classList.add(getScoreClass(score));

    // Event listeners
    impactSelect.addEventListener('change', () => updateFeature(feature.id));
    effortSelect.addEventListener('change', () => updateFeature(feature.id));
    confidenceSelect.addEventListener('change', () => updateFeature(feature.id));
    card.querySelector('.delete-btn').addEventListener('click', () => removeFeature(feature.id));

    return card;
  }

  // Update feature scores
  function updateFeature(id) {
    const card = document.querySelector(`.feature-card[data-id="${id}"]`);
    if (!card) return;

    const impact = card.querySelector('.impact-select').value;
    const effort = card.querySelector('.effort-select').value;
    const confidence = card.querySelector('.confidence-select').value;

    const score = calculateScore(impact, effort, confidence);
    const scoreValue = card.querySelector('.score-value');
    scoreValue.textContent = score;
    scoreValue.className = 'score-value ' + getScoreClass(score);

    // Update in state
    const feature = state.features.find(f => f.id === id);
    if (feature) {
      feature.impact = impact;
      feature.effort = effort;
      feature.confidence = confidence;
    }

    // Re-sort if sorting by score
    if (state.sortBy === 'score') {
      renderFeatures();
    }
  }

  // Add new feature
  function addFeature() {
    const name = featureInput.value.trim();
    if (!name) {
      featureInput.focus();
      return;
    }

    const feature = {
      id: nextId++,
      name: name,
      impact: '2',
      effort: '2',
      confidence: '2'
    };

    state.features.push(feature);
    featureInput.value = '';
    featureInput.focus();

    renderFeatures();
  }

  // Remove feature
  function removeFeature(id) {
    state.features = state.features.filter(f => f.id !== id);
    renderFeatures();
  }

  // Sort features
  function sortFeatures(features) {
    const sorted = [...features];
    const multiplier = state.sortDesc ? -1 : 1;

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (state.sortBy) {
        case 'score':
          const scoreA = calculateScore(a.impact, a.effort, a.confidence);
          const scoreB = calculateScore(b.impact, b.effort, b.confidence);
          comparison = scoreA - scoreB;
          break;
        case 'impact':
          comparison = parseInt(a.impact, 10) - parseInt(b.impact, 10);
          break;
        case 'effort':
          comparison = parseInt(a.effort, 10) - parseInt(b.effort, 10);
          break;
        case 'confidence':
          comparison = parseInt(a.confidence, 10) - parseInt(b.confidence, 10);
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
      }

      return comparison * multiplier;
    });

    return sorted;
  }

  // Render all features
  function renderFeatures() {
    if (state.features.length === 0) {
      featuresList.innerHTML = `
        <div class="empty-state">
          <p>No features added yet. Add your first feature above.</p>
        </div>
      `;
      return;
    }

    const sortedFeatures = sortFeatures(state.features);
    featuresList.innerHTML = '';

    sortedFeatures.forEach(feature => {
      featuresList.appendChild(createFeatureElement(feature));
    });
  }

  // Event listeners
  addButton.addEventListener('click', addFeature);
  featureInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addFeature();
  });

  sortBySelect.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderFeatures();
  });

  sortOrderBtn.addEventListener('click', () => {
    state.sortDesc = !state.sortDesc;
    sortOrderBtn.textContent = state.sortDesc ? '↓' : '↑';
    renderFeatures();
  });

  // State collector for Freeflow
  if (window.freeflow && window.freeflow.registerCollector) {
    window.freeflow.registerCollector('prioritization', () => ({
      features: state.features,
      sortBy: state.sortBy,
      sortDesc: state.sortDesc
    }));
  }

  // Initialize
  renderFeatures();
  console.log('[Prioritization Tool] Ready');
})();
