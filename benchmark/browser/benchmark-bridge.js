(function () {
  const params = new URLSearchParams(window.location.search || '');
  if (params.get('benchmark') !== '1') {
    return;
  }

  const state = {
    benchmarkEnabled: true,
    wrappersInstalled: false,
    skipAppRender: false,
    suppressNextBootstrapRender: true,
    lastDataImportMs: null,
    lastMetaLoadMs: null,
    lastTreeBuildMs: null,
    lastDrawAllTreesMs: null,
    lastCompareGroupsMs: null,
    lastComparisonTreeMs: null,
    lastComparisonMatrixCallMs: null,
    lastComparisonMatrixStartAt: null,
    lastMiniTreeMs: null,
    phaseLog: [],
    callLog: {
      dataImports: [],
      metaLoads: [],
      treeBuilds: [],
      drawAllTrees: [],
      comparisonComputes: [],
      comparisonTrees: [],
      comparisonMatrices: [],
      miniTrees: []
    }
  };

  function now() {
    return performance.now();
  }

  function toMs(duration) {
    return Number.isFinite(duration) ? Number(duration.toFixed(3)) : null;
  }

  function emitPhase(name, extra) {
    const entry = Object.assign(
      {
        name,
        timestamp_ms: toMs(now())
      },
      extra || {}
    );
    state.phaseLog.push(entry);
    try {
      window.dispatchEvent(new CustomEvent('metatree:benchmark-phase', { detail: entry }));
    } catch (_) {
      // Ignore event dispatch failures during headless runs.
    }
    return entry;
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  async function waitForDoubleFrame() {
    await nextFrame();
    await nextFrame();
  }

  async function waitFor(predicate, timeoutMs, label) {
    const start = now();
    while (now() - start <= timeoutMs) {
      if (predicate()) {
        return;
      }
      await wait(25);
    }
    throw new Error(`Timed out while waiting for ${label}`);
  }

  function cloneArray(input) {
    return Array.isArray(input) ? input.slice() : [];
  }

  function getVisualizationMode() {
    if (typeof visualizationMode === 'string') {
      return visualizationMode;
    }
    if (typeof window.visualizationMode === 'string') {
      return window.visualizationMode;
    }
    return 'single';
  }

  function getLayoutValue() {
    if (typeof currentLayout === 'string') {
      return currentLayout;
    }
    if (typeof window.currentLayout === 'string') {
      return window.currentLayout;
    }
    return 'radial';
  }

  function getReportedLayout() {
    const layout = getLayoutValue();
    return layout === 'tree' ? 'dendrogram' : layout;
  }

  function getVizContainer(modeOverride) {
    const mode = modeOverride || getVisualizationMode();
    if (typeof window.getVizSubContainer === 'function') {
      return window.getVizSubContainer(mode);
    }
    return document.getElementById('viz-container');
  }

  function getBenchmarkGroupColumn() {
    const metaCols = Array.isArray(window.metaColumns) ? window.metaColumns.slice() : [];
    if (metaCols.includes('BenchmarkGroup')) {
      return 'BenchmarkGroup';
    }
    return metaCols[0] || null;
  }

  function getGroupNames() {
    const groupsMap = (typeof getAllGroups === 'function') ? getAllGroups() : {};
    return Object.keys(groupsMap)
      .filter((groupName) => Array.isArray(groupsMap[groupName]) && groupsMap[groupName].length > 0)
      .sort();
  }

  function updateCheckboxGroupValues(selector, allowedValues) {
    const allowedSet = new Set(allowedValues || []);
    document.querySelectorAll(selector).forEach((checkbox) => {
      checkbox.checked = allowedSet.has(checkbox.value);
    });
  }

  function countHierarchyNodes(node) {
    if (!node || typeof node !== 'object') {
      return 0;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    return 1 + children.reduce((sum, child) => sum + countHierarchyNodes(child), 0);
  }

  function wrapGlobalFunction(name, handler) {
    const original = window[name];
    if (typeof original !== 'function') {
      return false;
    }
    window[name] = function benchmarkWrappedFunction() {
      return handler.call(this, original, Array.from(arguments));
    };
    return true;
  }

  function installWrappers() {
    const installed = [
      wrapGlobalFunction('buildHierarchy', function (original, args) {
        const startedAt = now();
        emitPhase('tree-build-start');
        try {
          return original.apply(this, args);
        } finally {
          const duration = now() - startedAt;
          state.lastTreeBuildMs = duration;
          state.callLog.treeBuilds.push(toMs(duration));
          emitPhase('tree-build-complete', { duration_ms: toMs(duration) });
        }
      }),
      wrapGlobalFunction('initVisualization', function (original, args) {
        if (state.skipAppRender) {
          emitPhase('init-visualization-suppressed');
          return undefined;
        }
        return original.apply(this, args);
      }),
      wrapGlobalFunction('drawAllTrees', function (original, args) {
        if (state.skipAppRender) {
          emitPhase('draw-all-trees-suppressed');
          return undefined;
        }
        const startedAt = now();
        emitPhase('draw-all-trees-start');
        try {
          return original.apply(this, args);
        } finally {
          const duration = now() - startedAt;
          state.lastDrawAllTreesMs = duration;
          state.callLog.drawAllTrees.push(toMs(duration));
          emitPhase('draw-all-trees-complete', { duration_ms: toMs(duration) });
        }
      }),
      wrapGlobalFunction('loadDataFromText', function (original, args) {
        const suppressRender = !!state.suppressNextBootstrapRender;
        const startedAt = now();
        emitPhase('data-import-start', { suppress_render: suppressRender });
        if (suppressRender) {
          state.skipAppRender = true;
        }
        try {
          return original.apply(this, args);
        } finally {
          const duration = now() - startedAt;
          state.lastDataImportMs = duration;
          state.callLog.dataImports.push(toMs(duration));
          state.suppressNextBootstrapRender = false;
          state.skipAppRender = false;
          emitPhase('data-import-complete', {
            duration_ms: toMs(duration),
            suppress_render: suppressRender
          });
        }
      }),
      wrapGlobalFunction('loadMetaFromText', function (original, args) {
        const startedAt = now();
        emitPhase('meta-import-start');
        try {
          return original.apply(this, args);
        } finally {
          const duration = now() - startedAt;
          state.lastMetaLoadMs = duration;
          state.callLog.metaLoads.push(toMs(duration));
          emitPhase('meta-import-complete', { duration_ms: toMs(duration) });
        }
      }),
      wrapGlobalFunction('compareGroups', function (original, args) {
        const startedAt = now();
        emitPhase('comparison-compute-start');
        try {
          return original.apply(this, args);
        } finally {
          const duration = now() - startedAt;
          state.lastCompareGroupsMs = duration;
          state.callLog.comparisonComputes.push(toMs(duration));
          emitPhase('comparison-compute-complete', { duration_ms: toMs(duration) });
        }
      }),
      wrapGlobalFunction('drawComparisonTree', function (original, args) {
        const startedAt = now();
        emitPhase('comparison-tree-draw-start');
        try {
          return original.apply(this, args);
        } finally {
          const duration = now() - startedAt;
          state.lastComparisonTreeMs = duration;
          state.callLog.comparisonTrees.push(toMs(duration));
          emitPhase('comparison-tree-draw-complete', { duration_ms: toMs(duration) });
        }
      }),
      wrapGlobalFunction('drawComparisonMatrix', function (original, args) {
        const startedAt = now();
        state.lastComparisonMatrixStartAt = startedAt;
        emitPhase('comparison-matrix-draw-start');
        try {
          return original.apply(this, args);
        } finally {
          const duration = now() - startedAt;
          state.lastComparisonMatrixCallMs = duration;
          state.callLog.comparisonMatrices.push(toMs(duration));
          emitPhase('comparison-matrix-draw-call-complete', { duration_ms: toMs(duration) });
        }
      }),
      wrapGlobalFunction('drawMiniComparisonTree', function (original, args) {
        const startedAt = now();
        try {
          return original.apply(this, args);
        } finally {
          const duration = now() - startedAt;
          state.lastMiniTreeMs = duration;
          state.callLog.miniTrees.push({
            container_id: args[0] || null,
            duration_ms: toMs(duration)
          });
          emitPhase('comparison-mini-tree-complete', {
            container_id: args[0] || null,
            duration_ms: toMs(duration)
          });
        }
      })
    ];

    state.wrappersInstalled = installed.every(Boolean);
  }

  function setMode(mode) {
    const select = document.getElementById('viz-mode');
    if (!select) {
      throw new Error('Missing #viz-mode select');
    }
    select.value = mode;
    if (typeof handleVisualizationModeChange === 'function') {
      handleVisualizationModeChange();
    }
  }

  function setLayout(layout) {
    const layoutSelect = document.getElementById('layout-select');
    if (!layoutSelect) {
      throw new Error('Missing #layout-select');
    }
    const appLayout = layout === 'dendrogram' ? 'tree' : layout;
    layoutSelect.value = appLayout;
    if (typeof handleLayoutChange === 'function') {
      handleLayoutChange({ target: layoutSelect });
    }
  }

  function setSinglePanels(panelCount) {
    const availableSamples = cloneArray(samples)
      .filter((sample) => !window.samplePassesMetaFilters || window.samplePassesMetaFilters(sample));
    const selected = availableSamples.slice(0, panelCount);
    if (selected.length !== panelCount) {
      throw new Error(`Expected ${panelCount} samples, found ${selected.length}`);
    }
    selectedSamples = selected.slice();
    updateCheckboxGroupValues('#sample-checkboxes input[type="checkbox"]', selected);
    return selected;
  }

  function ensureGroupingForMode(mode) {
    const groupColumn = getBenchmarkGroupColumn();
    if (!groupColumn) {
      throw new Error('No metadata grouping column is available');
    }

    const comparisonSelect = document.getElementById('meta-group-column');
    if (comparisonSelect) {
      comparisonSelect.value = groupColumn;
    }
    const groupSelect = document.getElementById('group-meta-column-select');
    if (groupSelect) {
      groupSelect.value = groupColumn;
    }

    if (mode === 'group') {
      if (typeof handleGroupMetaColumnChange === 'function') {
        handleGroupMetaColumnChange(groupColumn);
      }
      if (typeof updateGroupCheckboxes === 'function') {
        updateGroupCheckboxes();
      }
    } else {
      if (typeof handleMetaGroupColumnChange === 'function') {
        handleMetaGroupColumnChange(groupColumn);
      }
      if (typeof updateGroupDefinitionsDisplay === 'function') {
        updateGroupDefinitionsDisplay();
      }
      if (typeof updateGroupSelectors === 'function') {
        updateGroupSelectors();
      }
    }

    return groupColumn;
  }

  function setGroupPanels(panelCount) {
    const groupColumn = ensureGroupingForMode('group');
    const availableGroups = getGroupNames();
    const selected = availableGroups.slice(0, panelCount);
    if (selected.length !== panelCount) {
      throw new Error(`Expected ${panelCount} groups, found ${selected.length}`);
    }
    selectedGroups = selected.slice();
    try {
      activeSamples = selected.slice();
    } catch (_) {
      // activeSamples is a loose global in the main app and may not be declared yet.
    }
    updateCheckboxGroupValues('.group-checkbox-item', selected);
    return { groupColumn, selected };
  }

  function setComparisonGroups() {
    const groupColumn = ensureGroupingForMode('comparison');
    const availableGroups = getGroupNames();
    if (availableGroups.length < 2) {
      throw new Error('Need at least 2 groups for comparison mode');
    }
    const selected = availableGroups.slice(0, 2);
    const select1 = document.getElementById('select-group1');
    const select2 = document.getElementById('select-group2');
    if (!select1 || !select2) {
      throw new Error('Comparison group selectors are unavailable');
    }
    select1.value = selected[0];
    select2.value = selected[1];
    return { groupColumn, selected };
  }

  function setMatrixGroups(groupCount) {
    const groupColumn = ensureGroupingForMode('matrix');
    const availableGroups = getGroupNames();
    const selected = availableGroups.slice(0, groupCount);
    if (selected.length !== groupCount) {
      throw new Error(`Expected ${groupCount} groups, found ${selected.length}`);
    }
    if (typeof updateGroupDefinitionsDisplay === 'function') {
      updateGroupDefinitionsDisplay();
    }
    updateCheckboxGroupValues('.matrix-group-checkbox', selected);
    return { groupColumn, selected };
  }

  async function waitForTreePanels(mode, expectedPanelCount) {
    const container = getVizContainer(mode);
    await waitFor(() => {
      if (!container) {
        return false;
      }
      try {
        if (typeof window.ensurePanelsRenderedForExport === 'function') {
          window.ensurePanelsRenderedForExport();
        }
      } catch (_) {
        // Ignore transient render errors while polling.
      }
      const panelCount = container.querySelectorAll('.tree-panel').length;
      const svgCount = container.querySelectorAll('.tree-svg-container svg').length;
      return panelCount >= expectedPanelCount && svgCount >= expectedPanelCount;
    }, 30000, `${mode} tree panels`);
    await waitForDoubleFrame();
  }

  async function waitForComparisonTree() {
    const container = getVizContainer('comparison');
    await waitFor(() => {
      if (!container) {
        return false;
      }
      const svg = container.querySelector('.tree-svg-container svg');
      return !!svg;
    }, 30000, 'comparison tree render');
    await waitForDoubleFrame();
  }

  async function waitForMatrixRender(expectedMiniTrees) {
    const container = getVizContainer('matrix');
    await waitFor(() => {
      if (!container) {
        return false;
      }
      const loadingCount = container.querySelectorAll('.matrix-cell .cell-loading').length;
      const miniTreeCount = container.querySelectorAll('.matrix-cell svg').length;
      return loadingCount === 0 && miniTreeCount >= expectedMiniTrees;
    }, 60000, 'comparison matrix render');
    await waitForDoubleFrame();
  }

  function findCollapsibleNodeElement(mode) {
    const container = getVizContainer(mode);
    if (!container) {
      return null;
    }
    const nodes = Array.from(container.querySelectorAll('.node'));
    for (const element of nodes) {
      const datum = element.__data__;
      if (!datum || typeof datum !== 'object') {
        continue;
      }
      if (!Number.isFinite(datum.depth) || datum.depth <= 0) {
        continue;
      }
      const hasChildren = Array.isArray(datum.children) && datum.children.length > 0;
      if (!hasChildren) {
        continue;
      }
      const descendants = (typeof datum.descendants === 'function') ? datum.descendants() : [];
      if (descendants.length < 4) {
        continue;
      }
      return element;
    }
    return null;
  }

  async function measureTreeRender(mode, expectedPanelCount) {
    const startedAt = now();
    initVisualization();
    drawAllTrees();
    await waitForTreePanels(mode, expectedPanelCount);
    return toMs(now() - startedAt);
  }

  async function measureComparisonRender() {
    const runButton = document.getElementById('run-comparison');
    if (!runButton) {
      throw new Error('Missing #run-comparison button');
    }
    const startedAt = now();
    runButton.click();
    await waitForComparisonTree();
    return {
      initial_render_ms: toMs(now() - startedAt),
      comparison_matrix_ms: null
    };
  }

  async function measureMatrixRender(expectedMiniTrees) {
    const runButton = document.getElementById('run-comparison');
    if (!runButton) {
      throw new Error('Missing #run-comparison button');
    }
    const startedAt = now();
    runButton.click();
    await waitForMatrixRender(expectedMiniTrees);
    const renderCompletedAt = now();
    const matrixStartedAt = state.lastComparisonMatrixStartAt;
    return {
      initial_render_ms: toMs(renderCompletedAt - startedAt),
      comparison_matrix_ms: Number.isFinite(matrixStartedAt)
        ? toMs(renderCompletedAt - matrixStartedAt)
        : null
    };
  }

  async function applyTaxonFilter(filterTaxa, expectedPanelCount) {
    const select = document.getElementById('taxon-filter-mode');
    if (!select) {
      throw new Error('Missing #taxon-filter-mode select');
    }
    taxonFilterSet = new Set(filterTaxa || []);
    updateTaxonFilterList();
    select.value = 'include';
    const startedAt = now();
    handleTaxonFilterModeChange();
    await waitForTreePanels(getVisualizationMode(), expectedPanelCount);
    return toMs(now() - startedAt);
  }

  async function clearTaxonFilter(expectedPanelCount) {
    const select = document.getElementById('taxon-filter-mode');
    if (!select) {
      return;
    }
    taxonFilterSet = new Set();
    updateTaxonFilterList();
    select.value = 'none';
    handleTaxonFilterModeChange();
    await waitForTreePanels(getVisualizationMode(), expectedPanelCount);
  }

  async function applySignificanceFilter(enabled, mode, expectedMiniTrees) {
    const toggle = document.getElementById('show-significance');
    const pvalue = document.getElementById('pvalue-threshold');
    const qvalue = document.getElementById('qvalue-threshold');
    const logfc = document.getElementById('logfc-threshold');
    if (!toggle || !pvalue || !qvalue || !logfc) {
      throw new Error('Missing comparison significance controls');
    }

    pvalue.value = '0.05';
    qvalue.value = '0.05';
    logfc.value = '1';

    const startedAt = now();
    toggle.checked = enabled;
    handleSignificanceChange();
    if (mode === 'comparison') {
      await waitForComparisonTree();
    } else {
      await waitForMatrixRender(expectedMiniTrees);
    }
    return toMs(now() - startedAt);
  }

  async function measureCollapse(mode, expectedPanelCount) {
    const target = findCollapsibleNodeElement(mode);
    if (!target) {
      return null;
    }
    const startedAt = now();
    target.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    if (mode === 'comparison') {
      await waitForComparisonTree();
    } else {
      await waitForTreePanels(mode, expectedPanelCount);
    }
    return toMs(now() - startedAt);
  }

  async function collectMemoryMb() {
    await waitForDoubleFrame();
    try {
      if (typeof window.gc === 'function') {
        window.gc();
        await wait(50);
      }
    } catch (_) {
      // GC is optional in benchmark runs.
    }
    const memory = performance && performance.memory ? performance.memory : null;
    if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
      return null;
    }
    return Number((memory.usedJSHeapSize / (1024 * 1024)).toFixed(3));
  }

  function getBrowserEnvironment() {
    return {
      user_agent: navigator.userAgent || null,
      platform: navigator.platform || null,
      language: navigator.language || null,
      hardware_concurrency: navigator.hardwareConcurrency || null,
      device_memory_gb: navigator.deviceMemory || null,
      viewport_width: window.innerWidth || null,
      viewport_height: window.innerHeight || null,
      device_pixel_ratio: window.devicePixelRatio || null
    };
  }

  function isReady() {
    return !!(
      state.wrappersInstalled &&
      typeof treeData !== 'undefined' &&
      treeData &&
      window.metaData &&
      Array.isArray(samples) &&
      samples.length > 0
    );
  }

  async function prepareCondition(condition) {
    const mode = condition.mode;
    const layout = condition.layout;

    state.lastCompareGroupsMs = null;
    state.lastComparisonMatrixStartAt = null;

    state.skipAppRender = true;
    try {
      setMode(mode);
      setLayout(layout);

      if (mode === 'single') {
        setSinglePanels(condition.panel_count);
      } else if (mode === 'group') {
        setGroupPanels(condition.panel_count);
      } else if (mode === 'comparison') {
        setComparisonGroups();
      } else if (mode === 'matrix') {
        const groupCount = condition.panel_count === 4 ? 2 : 3;
        setMatrixGroups(groupCount);
      } else {
        throw new Error(`Unsupported benchmark mode: ${mode}`);
      }
    } finally {
      state.skipAppRender = false;
    }

    await waitForDoubleFrame();
  }

  async function runCondition(condition) {
    if (!isReady()) {
      throw new Error('MetaTree benchmark bridge is not ready');
    }

    await prepareCondition(condition);

    const importMs = toMs(state.lastDataImportMs);
    const initialTreeBuildMs = toMs(state.lastTreeBuildMs);
    const baselineNodeCount = countHierarchyNodes(treeData);
    let initialRenderMs = null;
    let filterUpdateMs = null;
    let collapseUpdateMs = null;
    let comparisonMatrixMs = null;

    if (condition.mode === 'single' || condition.mode === 'group') {
      initialRenderMs = await measureTreeRender(condition.mode, condition.panel_count);
    } else if (condition.mode === 'comparison') {
      const comparisonRender = await measureComparisonRender();
      initialRenderMs = comparisonRender.initial_render_ms;
      comparisonMatrixMs = comparisonRender.comparison_matrix_ms;
    } else if (condition.mode === 'matrix') {
      const matrixRender = await measureMatrixRender(condition.matrix_comparison_count);
      initialRenderMs = matrixRender.initial_render_ms;
      comparisonMatrixMs = matrixRender.comparison_matrix_ms;
    }

    const memoryMb = await collectMemoryMb();

    if (condition.mode === 'single' || condition.mode === 'group') {
      filterUpdateMs = await applyTaxonFilter(condition.filter_taxa || [], condition.panel_count);
      await clearTaxonFilter(condition.panel_count);
      collapseUpdateMs = await measureCollapse(condition.mode, condition.panel_count);
    } else if (condition.mode === 'comparison') {
      filterUpdateMs = await applySignificanceFilter(true, 'comparison', null);
      await applySignificanceFilter(false, 'comparison', null);
      collapseUpdateMs = await measureCollapse('comparison', 1);
    } else if (condition.mode === 'matrix') {
      filterUpdateMs = await applySignificanceFilter(true, 'matrix', condition.matrix_comparison_count);
      collapseUpdateMs = null;
    }

    return {
      data_import_ms: importMs,
      tree_build_ms: initialTreeBuildMs,
      initial_render_ms: initialRenderMs,
      filter_update_ms: filterUpdateMs,
      collapse_update_ms: collapseUpdateMs,
      comparison_compute_ms: toMs(state.lastCompareGroupsMs),
      comparison_matrix_ms: comparisonMatrixMs,
      memory_mb: memoryMb,
      node_count_app: baselineNodeCount,
      filter_kind: (condition.mode === 'single' || condition.mode === 'group')
        ? 'taxon_include'
        : 'significance_toggle',
      layout_reported: getReportedLayout(),
      browser_env: getBrowserEnvironment(),
      phase_log: state.phaseLog.slice()
    };
  }

  installWrappers();

  window.MetaTreeBenchmark = {
    isReady,
    runCondition,
    getState: function getState() {
      return JSON.parse(JSON.stringify({
        wrappers_installed: state.wrappersInstalled,
        last_data_import_ms: toMs(state.lastDataImportMs),
        last_tree_build_ms: toMs(state.lastTreeBuildMs),
        last_compare_groups_ms: toMs(state.lastCompareGroupsMs),
        phase_log_length: state.phaseLog.length
      }));
    }
  };

  emitPhase('benchmark-bridge-ready');
})();
