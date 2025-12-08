// Two-group comparison rendering module
// Depends on globals from core/app-core.js (state, sizes, colors), components/legend-panel.js (createComparisonLegendSVG),
// analysis/group-comparison.js (createDivergingColorScale), and utils/export-tools.js (exportSVGForContainer/exportPNGForContainer)

(function () {
  const EMPTY_COMPARISON_STORE = {
    getSvg: () => null,
    setSvg: () => { },
    getZoom: () => null,
    setZoom: () => { },
    clear: () => { },
    getStats: () => null,
    setStats: () => { }
  };

  const VALID_LAYOUTS = new Set(['radial', 'tree', 'packing']);
  const PACK_EPSILON = 1e-6;

  function resolveReverseColorsFlag() {
    if (typeof colorSchemeReversed !== 'undefined') return !!colorSchemeReversed;
    if (typeof window !== 'undefined' && typeof window.colorSchemeReversed !== 'undefined') {
      return !!window.colorSchemeReversed;
    }
    return false;
  }

  function buildDivergingProjector(domain, reversedFlag) {
    const hasNegatives = Array.isArray(domain)
      ? domain.some(v => typeof v === 'number' && v < 0)
      : false;
    const low = (Array.isArray(domain) && typeof domain[0] === 'number' && isFinite(domain[0])) ? Number(domain[0]) : null;
    const high = (Array.isArray(domain) && typeof domain[2] === 'number' && isFinite(domain[2])) ? Number(domain[2]) : null;
    const project = (value) => {
      const numeric = (typeof value === 'number' && isFinite(value)) ? value : 0;
      if (!reversedFlag) return numeric;
      if (hasNegatives) return -numeric;
      if (low != null && high != null) {
        return low + high - numeric;
      }
      return -numeric;
    };
    return { project, hasNegatives };
  }

  function getActiveLayoutMode() {
    const layout = (typeof currentLayout === 'string') ? currentLayout : 'radial';
    return VALID_LAYOUTS.has(layout) ? layout : 'radial';
  }

  function computePackMetric(stats) {
    if (!stats) return PACK_EPSILON;
    const mean1 = Math.max(0, stats.mean_1 || 0);
    const mean2 = Math.max(0, stats.mean_2 || 0);
    const avg = (mean1 + mean2) / 2;
    const fold = Math.abs(
      (typeof stats.comparison_value === 'number' && isFinite(stats.comparison_value))
        ? stats.comparison_value
        : (typeof stats.log2_median_ratio === 'number' ? stats.log2_median_ratio : 0)
    );
    const value = Math.max(avg, fold);
    return (isFinite(value) && value > 0) ? value : PACK_EPSILON;
  }

  const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"]/g, (ch) => HTML_ENTITIES[ch] || ch);
  }

  function getNodeFullLabel(node) {
    if (!node || !node.data) return '';
    const label = node.data.fullName || node.data.name || '';
    return label;
  }

  function annotateComparisonAggregates(root, comparisonStats, options = {}) {
    if (!root) return { maxAgg: 1, filterBySignificance: false };
    const filterBySignificance = (typeof options.requireSignificance === 'boolean')
      ? options.requireSignificance
      : !!(typeof showOnlySignificant !== 'undefined' && showOnlySignificant);
    root.eachAfter(node => {
      const isLeaf = !node.children || node.children.length === 0;
      if (isLeaf) {
        const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(node) : (node && node.data ? node.data.name : null);
        const stats = comparisonStats ? comparisonStats[nodePath] : null;
        const passesFilter = !filterBySignificance || (
          stats &&
          (
            (typeof isSignificantByThresholds === 'function')
              ? isSignificantByThresholds(stats)
              : !!(stats && stats.significant)
          )
        );
        const value = (passesFilter && stats)
          ? (stats.comparison_value ?? stats.value ?? 0)
          : 0;
        const magnitude = Math.abs(isFinite(value) ? value : 0);
        node._agg = passesFilter ? magnitude : 0;
        node._hasVisibleDesc = passesFilter;
      } else {
        let sum = 0;
        let hasVisible = false;
        for (const child of node.children) {
          sum += (child._agg || 0);
          if (!hasVisible && child._hasVisibleDesc) hasVisible = true;
        }
        node._agg = sum;
        node._hasVisibleDesc = hasVisible;
      }
    });
    const maxAgg = d3.max(root.descendants(), n => n._agg || 0) || 1;
    return { maxAgg, filterBySignificance };
  }

  function getVisibleComparisonNodes(nodes, filterBySignificance) {
    if (!Array.isArray(nodes)) return [];
    if (!filterBySignificance) return nodes;
    return nodes.filter(node => node && node._hasVisibleDesc);
  }

  function getVisibleComparisonLinks(links, visibleNodeSet, filterBySignificance) {
    if (!Array.isArray(links)) return [];
    if (!filterBySignificance) return links;
    return links.filter(link => visibleNodeSet.has(link.source) && visibleNodeSet.has(link.target));
  }

  function getVisibleCollapsedNodes(collapsedNodes, visibleNodeSet, filterBySignificance) {
    if (!Array.isArray(collapsedNodes)) return [];
    if (!filterBySignificance) return collapsedNodes;
    return collapsedNodes.filter(node => visibleNodeSet.has(node));
  }
  function buildComparisonLayout(root, width, height, comparisonStats, opts = {}) {
    const mode = getActiveLayoutMode();
    const forMini = !!opts.mini;
    const layout = {
      mode,
      nodes: [],
      links: [],
      collapsedNodes: [],
      applyGroupTransform: (g) => g,
      positionNode: () => 'translate(0,0)',
      configureLinks: (sel) => sel,
      configureLabels: (sel) => sel,
      configureCollapse: (sel) => sel,
      getVisualRadius: (_, base) => base,
      getHoverRadius: (_, base) => base + (forMini ? 1 : 2)
    };

    if (mode === 'packing') {
      const padding = forMini ? 12 : 80;
      const diameter = Math.max(10, Math.min(width, height) - padding);
      const offsetX = (width - diameter) / 2;
      const offsetY = (height - diameter) / 2;
      const packChildAccessor = (node) => (node && node.__collapsed) ? null : node && node.children;
      let packRoot = null;
      if (root && root.data) {
        try {
          packRoot = d3.hierarchy(root.data, packChildAccessor);
        } catch (_) {
          packRoot = null;
        }
      }
      if (!packRoot) {
        packRoot = (typeof root.copy === 'function')
          ? root.copy()
          : d3.hierarchy(treeData, packChildAccessor);
      }
      try {
        if (typeof stripUnaryChainToFirstBranch === 'function') {
          packRoot = stripUnaryChainToFirstBranch(packRoot);
        }
      } catch (_) { }
      packRoot
        .sum(node => {
          const label = node && node.data ? node.data.name : null;
          const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(node) : label;
          const stats = nodePath ? comparisonStats[nodePath] : undefined;
          return computePackMetric(stats);
        })
        .sort((a, b) => (b.value || 0) - (a.value || 0));
      const pack = d3.pack()
        .size([diameter, diameter])
        .padding(forMini ? 1.5 : 3);
      const packed = pack(packRoot);
      layout.nodes = packed.descendants();
      layout.links = [];
      layout.collapsedNodes = layout.nodes.filter(d => d.data && d.data.__collapsed);
      layout.applyGroupTransform = (g) => g.attr('transform', `translate(${offsetX}, ${offsetY})`);
      layout.positionNode = (d) => `translate(${d.x},${d.y})`;
      layout.configureLinks = (sel) => { sel.remove(); return sel; };
      layout.configureLabels = (sel) => sel
        .attr('x', 0)
        .attr('text-anchor', 'middle')
        .attr('transform', null);
      layout.configureCollapse = (sel) => sel
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .attr('text-anchor', 'middle');
      layout.getVisualRadius = (d, base) => Math.max(forMini ? 0.5 : 1, d.r || base || 0);
      layout.getHoverRadius = (d, base) => layout.getVisualRadius(d, base) + (forMini ? 1 : 2);
      return layout;
    }

    if (mode === 'tree') {
      const margin = forMini
        ? { top: 10, right: 40, bottom: 10, left: 40 }
        : { top: 40, right: 160, bottom: 40, left: 160 };
      const layoutWidth = Math.max(10, width - margin.left - margin.right);
      const layoutHeight = Math.max(10, height - margin.top - margin.bottom);
      const tree = d3.tree().size([layoutHeight, layoutWidth]);
      tree(root);
      layout.nodes = root.descendants();
      layout.links = root.links();
      layout.collapsedNodes = layout.nodes.filter(d => d.data && d.data.__collapsed);
      layout.applyGroupTransform = (g) => g.attr('transform', `translate(${margin.left}, ${margin.top})`);
      const linkGen = d3.linkHorizontal().x(d => d.y).y(d => d.x);
      layout.configureLinks = (sel) => sel.attr('d', linkGen);
      layout.positionNode = (d) => `translate(${d.y},${d.x})`;
      layout.configureLabels = (sel) => sel
        .attr('x', d => d.children ? -10 : 10)
        .attr('text-anchor', d => d.children ? 'end' : 'start')
        .attr('transform', null);
      layout.configureCollapse = (sel) => sel
        .attr('transform', d => `translate(${d.y},${d.x})`)
        .attr('text-anchor', 'middle');
      layout.getVisualRadius = (_, base) => base;
      layout.getHoverRadius = (_, base) => base + (forMini ? 1 : 2);
      return layout;
    }

    // Default radial layout
    const radialPadding = forMini ? 10 : 40;
    const radius = Math.max(10, Math.min(width, height) / 2 - radialPadding);
    const radialTree = d3.tree()
      .size([2 * Math.PI, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / ((a.depth || 1)));
    radialTree(root);
    layout.nodes = root.descendants();
    layout.links = root.links();
    layout.collapsedNodes = layout.nodes.filter(d => d.data && d.data.__collapsed);
    layout.applyGroupTransform = (g) => g.attr('transform', `translate(${width / 2}, ${height / 2})`);
    const linkRadial = d3.linkRadial().angle(d => d.x).radius(d => d.y);
    layout.configureLinks = (sel) => sel.attr('d', linkRadial);
    layout.positionNode = (d) => {
      const angle = d.x;
      const r = d.y;
      const x = r * Math.cos(angle - Math.PI / 2);
      const y = r * Math.sin(angle - Math.PI / 2);
      return `translate(${x},${y})`;
    };
    layout.configureLabels = (sel) => sel
      .attr('x', d => d.x < Math.PI === !d.children ? 6 : -6)
      .attr('text-anchor', d => d.x < Math.PI === !d.children ? 'start' : 'end')
      .attr('transform', d => {
        const angle = d.x * 180 / Math.PI - 90;
        return d.x < Math.PI ? `rotate(${angle})` : `rotate(${angle + 180})`;
      });
    layout.configureCollapse = (sel) => sel
      .attr('transform', d => `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y},0)`)
      .attr('text-anchor', 'middle');
    layout.getVisualRadius = (_, base) => base;
    layout.getHoverRadius = (_, base) => base + (forMini ? 1.5 : 2);
    return layout;
  }

  function resolveComparisonRendererStore(override) {
    if (override && typeof override.getSvg === 'function') {
      return override;
    }
    if (typeof getComparisonRendererStore === 'function') {
      try {
        const store = getComparisonRendererStore();
        if (store && typeof store.getSvg === 'function') {
          return store;
        }
      } catch (err) {
        console.warn('Failed to obtain comparison renderer store', err);
      }
    }
    return EMPTY_COMPARISON_STORE;
  }

  // 主渲染：比较树（支持普通、内联与模态容器）
  function drawComparisonTree(group1, group2, comparisonStats, opts = {}) {
    const store = resolveComparisonRendererStore(opts.rendererStore);
    try { store.setStats(comparisonStats); } catch (_) { }
    const useModal = !!opts.isModal;
    const containerId = opts.containerId || 'viz-container';
    const showBack = !!opts.showBack;
    const onBack = typeof opts.onBack === 'function' ? opts.onBack : null;

    const vizContainer = document.getElementById(containerId);
    if (!vizContainer) return;
    vizContainer.innerHTML = '';

    // 包裹面板与顶部栏（仅普通/内联模式使用）
    const panel = document.createElement('div');
    panel.className = 'tree-panel comparison-panel';

    if (!useModal) {
      const header = document.createElement('div');
      header.className = 'tree-panel-header';

      // 左侧：返回按钮（若有）
      if (showBack && onBack) {
        const backBtn = document.createElement('button');
        backBtn.className = 'btn-back';
        backBtn.textContent = '← Back to Matrix';
        backBtn.addEventListener('click', () => onBack());
        header.appendChild(backBtn);
      }

      // 中间：标题（绝对居中，参照 .tree-panel-header .panel-title-text 样式）
      const titleSpan = document.createElement('span');
      titleSpan.className = 'panel-title-text';
      titleSpan.textContent = `${group1} vs ${group2}`;
      header.appendChild(titleSpan);

      // 右侧：操作按钮区
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'panel-actions';

      const btnReset = document.createElement('button');
      btnReset.className = 'btn-icon';
      btnReset.title = 'Reset zoom';
      btnReset.setAttribute('aria-label', 'Reset zoom');
      btnReset.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      btnReset.addEventListener('click', () => {
        const svgRef = store.getSvg();
        const zoomRef = store.getZoom();
        if (svgRef && zoomRef) {
          svgRef.transition().duration(500).call(zoomRef.transform, d3.zoomIdentity);
        }
      });

      const btnRestore = document.createElement('button');
      btnRestore.className = 'btn-icon';
      btnRestore.title = 'Restore last collapsed node';
      btnRestore.setAttribute('aria-label', 'Restore last collapsed node');
      btnRestore.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5a7 7 0 1 1-4.95 11.95" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 5H4v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      btnRestore.addEventListener('click', () => { if (typeof window.restoreLastCollapsed === 'function') window.restoreLastCollapsed(); });

      const btnSvg = document.createElement('button');
      btnSvg.className = 'btn-icon';
      btnSvg.title = 'Export SVG';
      btnSvg.setAttribute('aria-label', 'Export SVG');
      btnSvg.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 3v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 9l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      btnSvg.addEventListener('click', () => exportSVGForContainer('svg-container-comparison', `comparison_${group1}_vs_${group2}`));

      const btnPng = document.createElement('button');
      btnPng.className = 'btn-icon';
      btnPng.title = 'Export PNG';
      btnPng.setAttribute('aria-label', 'Export PNG');
      btnPng.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M7 6l2-2h6l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13" r="3" stroke="currentColor" stroke-width="2"/></svg>';
      btnPng.addEventListener('click', () => exportPNGForContainer('svg-container-comparison', `comparison_${group1}_vs_${group2}`));

      actionsWrap.appendChild(btnReset);
      actionsWrap.appendChild(btnRestore);
      actionsWrap.appendChild(btnSvg);
      actionsWrap.appendChild(btnPng);

      header.appendChild(actionsWrap);
      panel.appendChild(header);
    }

    // SVG 容器
    const svgContainer = document.createElement('div');
    svgContainer.className = 'tree-svg-container';
    svgContainer.id = useModal ? 'svg-container-comparison-modal' : 'svg-container-comparison';
    panel.appendChild(svgContainer);
    vizContainer.appendChild(panel);

    // modal 自适应填充
    if (useModal) {
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';
      panel.style.height = '100%';
      svgContainer.style.flex = '1 1 auto';
      svgContainer.style.height = 'auto';
    }

    const container = document.getElementById(svgContainer.id);
    if (!container) return;
    const size = (typeof getResponsiveTreePanelSize === 'function')
      ? getResponsiveTreePanelSize(container, {
        heightVar: '--comparison-panel-svg-height',
        autoHeight: !useModal,
        applyHeight: !useModal,
        lockWidth: false
      })
      : null;
    const width = (size && typeof size.width === 'number') ? size.width : container.clientWidth;
    const height = (size && typeof size.height === 'number') ? size.height : container.clientHeight;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background', 'var(--tree-panel-bg, #ffffff)');

    // 背景
    svg.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .style('fill', 'var(--tree-panel-bg, #ffffff)');

    const rootG = svg.append('g');
    const g = rootG.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        rootG.attr('transform', event.transform);
      });
    svg.call(zoom);
    try {
      store.setSvg(svg);
      store.setZoom(zoom);
    } catch (_) { }

    // 层级数据
    let root = d3.hierarchy(treeData, d => d.__collapsed ? null : d.children);
    try {
      if (typeof stripToFirstBranch === 'function') {
        root = stripToFirstBranch(root);
      } else if (root && root.children && root.children.length === 1) {
        root = root.children[0];
      }
    } catch (_) { }

    // ========== 统一标签颜色（comparison 模式）==========
    if (typeof uniformLabelColors !== 'undefined' && uniformLabelColors && root && comparisonStats) {
      try {
        // 计算阈值（与后续标签过滤一致）
        const values = [];
        root.each(node => {
          const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(node) : (node && node.data ? node.data.name : null);
          const st = nodePath ? comparisonStats[nodePath] : undefined;
          if (!st) return;
          const v = Math.abs(st.comparison_value || 0);
          if (isFinite(v)) values.push(v);
        });
        values.sort((a, b) => b - a);
        let threshold = 0;
        if (typeof labelThreshold !== 'undefined') {
          if (labelThreshold <= 0) threshold = Infinity;
          else if (labelThreshold >= 1) threshold = 0;
          else {
            const k = Math.max(1, Math.ceil(values.length * labelThreshold));
            threshold = values[Math.min(k - 1, values.length - 1)] ?? 0;
          }
        }
        const selectedSet = (Array.isArray(labelLevelsSelected) && labelLevelsSelected.length > 0) ? new Set(labelLevelsSelected) : null;

        // 收集本次会显示的标签（使用完整名称）
        const visibleLabels = new Set();
        root.each(node => {
          const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(node) : (node && node.data ? node.data.name : null);
          const st = nodePath ? comparisonStats[nodePath] : undefined;
          if (!st) return;
          if (typeof showOnlySignificant !== 'undefined' && showOnlySignificant && !isSignificantByThresholds(st)) return;
          const depthFromLeaf = node.height;
          const levelOk = !selectedSet || selectedSet.has(depthFromLeaf);
          const mag = Math.abs(st.comparison_value || 0);
          if (levelOk && mag >= threshold) {
            if (typeof getFullLabelName === 'function') visibleLabels.add(getFullLabelName(node));
            else visibleLabels.add(node.data.name || '');
          }
        });

        // 按可见标签分配/保留颜色（保留 customLabelColors，其余自动分配）
        if (visibleLabels.size > 0) {
          const newMap = new Map();
          if (typeof customLabelColors === 'undefined') customLabelColors = new Map();
          if (typeof labelColorMap === 'undefined') labelColorMap = new Map();
          if (typeof labelColorIndex === 'undefined') labelColorIndex = 0;
          labelColorIndex = 0;
          const sorted = Array.from(visibleLabels).filter(Boolean).sort();
          sorted.forEach(lbl => {
            if (customLabelColors.has(lbl)) {
              newMap.set(lbl, customLabelColors.get(lbl));
            } else {
              const color = (typeof generateDistinctColor === 'function') ? generateDistinctColor(labelColorIndex) : `hsl(${(labelColorIndex * 47) % 360},70%,50%)`;
              newMap.set(lbl, color);
              labelColorIndex++;
            }
          });
          labelColorMap = newMap;
        }
      } catch (e) { console.warn('assign uniform label colors (comparison) failed:', e); }
    }

    // 颜色尺度（支持发散与连续/自定义）
    const reverseColorsEnabled = resolveReverseColorsFlag();
    const { project: projectDivergingValue, hasNegatives: comparisonHasNegatives } =
      buildDivergingProjector(comparisonColorDomain, reverseColorsEnabled);

    const cat = (typeof window !== 'undefined' && window.colorSchemeCategory) ? window.colorSchemeCategory : 'diverging';
    let colorAtVal;
    if (cat === 'diverging') {
      const colorScale = createDivergingColorScale(comparisonColorDomain, divergingPalette);
      colorAtVal = (v) => colorScale(projectDivergingValue(v));
    } else {
      let interpolator;
      if (typeof colorScheme !== 'undefined' && colorScheme === 'Custom') {
        const stops = (Array.isArray(customColorStops) && customColorStops.length >= 2)
          ? customColorStops
          : [customColorStart, customColorEnd];
        interpolator = (stops.length === 2) ? d3.interpolate(stops[0], stops[1]) : d3.interpolateRgbBasis(stops);
      } else {
        const info = (typeof COLOR_SCHEMES !== 'undefined' && COLOR_SCHEMES[colorScheme]) ? COLOR_SCHEMES[colorScheme] : {};
        interpolator = info.interpolator || d3.interpolateViridis;
      }
      const tFor = (t) => (reverseColorsEnabled ? (1 - t) : t);
      const M = Math.max(Math.abs(comparisonColorDomain[0] || 0), Math.abs(comparisonColorDomain[2] || 1)) || 1;
      const pow = (typeof colorGamma !== 'undefined') ? colorGamma : 0.8;
      colorAtVal = (v) => {
        const val = isFinite(v) ? v : 0;
        const a = Math.min(1, Math.pow(Math.min(1, Math.abs(val) / M), pow));
        const t = val < 0 ? 0.5 - a * 0.5 : val > 0 ? 0.5 + a * 0.5 : 0.5;
        return interpolator(tFor(t));
      };
    }

    const zeroLinkColor = (typeof resolveZeroLinkColor === 'function')
      ? resolveZeroLinkColor(colorAtVal, comparisonHasNegatives)
      : ((typeof customZeroColor === 'string' && customZeroColor) ? customZeroColor : ZERO_LINK_COLOR);
    const zeroNodeColor = (typeof resolveZeroNodeColor === 'function')
      ? resolveZeroNodeColor(colorAtVal, comparisonHasNegatives)
      : ((typeof customZeroColor === 'string' && customZeroColor) ? customZeroColor : ZERO_NODE_COLOR);

    // Pre-compute aggregates for stroke sizing and filtering
    const { maxAgg, filterBySignificance } = annotateComparisonAggregates(root, comparisonStats);
    const strokeScale = d3.scaleSqrt().domain([0, maxAgg]).range([0.8, 5]).clamp(true);

    const layoutConfig = buildComparisonLayout(root, width, height, comparisonStats, { mini: false });
    try { layoutConfig.applyGroupTransform(g); } catch (_) { }
    const nodesForRender = getVisibleComparisonNodes(layoutConfig.nodes, filterBySignificance);

    // Show message if no nodes are visible due to filtering
    if (filterBySignificance && nodesForRender.length === 0) {
      svg.append('text')
        .attr('class', 'no-results-message')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('fill', '#666')
        .text('No significant results found at the current threshold.');
    }

    const visibleNodeSet = new Set(nodesForRender);
    const linksForRender = getVisibleComparisonLinks(layoutConfig.links, visibleNodeSet, filterBySignificance);

    let linkSelection = null;
    if (layoutConfig.mode === 'packing') {
      g.selectAll('.link').remove();
    } else {
      linkSelection = g.selectAll('.link')
        .data(linksForRender)
        .join('path')
        .attr('class', 'link');
      try { layoutConfig.configureLinks(linkSelection); } catch (_) { }
      linkSelection
        .style('fill', 'none')
        .style('stroke', d => {
          const targetPath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(d.target) : (d && d.target && d.target.data ? d.target.data.name : null);
          const stats = targetPath ? comparisonStats[targetPath] : undefined;
          if (!stats) return zeroLinkColor;
          const mean1 = stats.mean_1 || 0;
          const mean2 = stats.mean_2 || 0;
          const zeroAbundance = mean1 === 0 && mean2 === 0;
          const value = stats.comparison_value || 0;
          if (zeroAbundance || value === 0) return zeroLinkColor;
          return colorAtVal(value);
        })
        .style('stroke-opacity', () => Math.max(0.05, Math.min(1, typeof edgeOpacity !== 'undefined' ? edgeOpacity : 1)))
        .style('stroke-width', d => {
          const agg = d && d.target ? (d.target._agg || 0) : 0;
          const base = strokeScale(agg) * edgeWidthMultiplier * COMPARISON_EDGE_SCALE_BOOST;
          return Math.max(0.5 * edgeWidthMultiplier, base);
        });
    }

    // 节点大小（平均丰度）
    const avgAbundances = root.descendants().map(d => {
      const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(d) : (d && d.data ? d.data.name : null);
      const stats = nodePath ? comparisonStats[nodePath] : undefined;
      if (!stats) return 0;
      const m1 = stats.mean_1 || 0;
      const m2 = stats.mean_2 || 0;
      return (m1 + m2) / 2;
    }).filter(v => v > 0);
    const maxAvg = avgAbundances.length > 0 ? Math.max(...avgAbundances) : 1;
    const nodeSizeScale = d3.scaleSqrt()
      .domain([0, maxAvg])
      .range([minNodeSize * nodeSizeMultiplier, maxNodeSize * nodeSizeMultiplier * 0.3])
      .clamp(true);
    const computeNodeRadius = (d) => {
      const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(d) : (d && d.data ? d.data.name : null);
      const stats = nodePath ? comparisonStats[nodePath] : undefined;
      if (!stats) return minNodeSize * nodeSizeMultiplier * 0.5;
      const mean1 = stats.mean_1 || 0;
      const mean2 = stats.mean_2 || 0;
      const avg = (mean1 + mean2) / 2;
      const radius = nodeSizeScale(avg) * COMPARISON_NODE_SCALE_BOOST;
      return isFinite(radius) && radius > 0 ? radius : minNodeSize * nodeSizeMultiplier * 0.5;
    };
    const computeVisualRadius = (d) => {
      const base = computeNodeRadius(d);
      const fn = (typeof layoutConfig.getVisualRadius === 'function')
        ? layoutConfig.getVisualRadius
        : ((_, b) => b);
      return fn(d, base);
    };
    const computeHoverRadius = (d) => {
      const base = computeNodeRadius(d);
      const fn = (typeof layoutConfig.getHoverRadius === 'function')
        ? layoutConfig.getHoverRadius
        : ((_, b) => b + 2);
      return fn(d, base);
    };

    // 节点（与 individual 模式一致：每个节点一个 <g>，笛卡尔坐标）
    const nodeGroup = g.selectAll('.node')
      .data(nodesForRender)
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => layoutConfig.positionNode(d));

    nodeGroup.append('circle')
      .attr('r', d => computeVisualRadius(d))
      .style('fill', d => {
        const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(d) : (d && d.data ? d.data.name : null);
        const stats = nodePath ? comparisonStats[nodePath] : undefined;
        if (!stats) return zeroNodeColor;
        const mean1 = stats.mean_1 || 0;
        const mean2 = stats.mean_2 || 0;
        const avg = (mean1 + mean2) / 2;
        if (avg === 0) return zeroNodeColor;
        const value = stats.comparison_value || 0;
        if (value === 0) return zeroNodeColor;
        return colorAtVal(value);
      })
      .style('fill-opacity', () => Math.max(0, Math.min(1, typeof nodeOpacity !== 'undefined' ? nodeOpacity : 1)))
      .style('stroke', 'none')
      .style('stroke-width', 0);
    nodeGroup.append('circle')
      .attr('class', 'node-hover-ring')
      .attr('r', d => computeHoverRadius(d))
      .style('fill', 'none')
      .style('stroke', '#ff6b6b')
      .style('stroke-width', 2)
      .style('opacity', 0)
      .style('pointer-events', 'none');

    // 折叠标记
    const collapsedNodes = getVisibleCollapsedNodes(layoutConfig.collapsedNodes, visibleNodeSet, filterBySignificance);
    const collapseSel = g.selectAll('.collapse-marker')
      .data(collapsedNodes)
      .join('text')
      .attr('class', 'collapse-marker')
      .attr('dy', '0.35em')
      .text('+')
      .style('font-size', '9px')
      .style('font-weight', '700')
      .attr('fill', '#2c3e50')
      .style('pointer-events', 'none');
    try { layoutConfig.configureCollapse(collapseSel); } catch (_) { }

    // 标签（与 individual 模式一致：固定 ±6px 偏移，基于角度旋转）
    if (showLabels) {
      const values = [];
      root.each(node => {
        const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(node) : (node && node.data ? node.data.name : null);
        const st = nodePath ? comparisonStats[nodePath] : undefined;
        if (!st) return;
        const v = Math.abs(st.comparison_value || 0);
        if (isFinite(v)) values.push(v);
      });
      values.sort((a, b) => b - a);
      let threshold = 0;
      if (labelThreshold <= 0) threshold = Infinity;
      else if (labelThreshold >= 1) threshold = 0;
      else {
        const k = Math.max(1, Math.ceil(values.length * labelThreshold));
        threshold = values[Math.min(k - 1, values.length - 1)] ?? 0;
      }
      const selectedSet = Array.isArray(labelLevelsSelected) && labelLevelsSelected.length > 0 ? new Set(labelLevelsSelected) : null;

      const minPackLabelRadius = Math.max((typeof labelFontSize === 'number' ? labelFontSize : 9), 10);
      const labels = nodeGroup
        .filter(d => {
          const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(d) : (d && d.data ? d.data.name : null);
          const st = nodePath ? comparisonStats[nodePath] : undefined;
          if (!st) return false;
          if (showOnlySignificant && !isSignificantByThresholds(st)) return false;
          const depthFromLeaf = d.height;
          const levelOk = !selectedSet || selectedSet.has(depthFromLeaf);
          const mag = Math.abs(st.comparison_value || 0);
          if (!(levelOk && mag >= threshold)) return false;
          if (layoutConfig.mode === 'packing') {
            const isLeafLevel = depthFromLeaf === 0;
            const minRadius = isLeafLevel
              ? Math.max((typeof labelFontSize === 'number' ? labelFontSize : 9) * 0.5, 4)
              : minPackLabelRadius;
            return typeof d.r === 'number' ? d.r >= minRadius : false;
          }
          return true;
        })
        .append('text')
        .attr('class', 'node-label')
        .attr('dy', layoutConfig.mode === 'packing' ? '0.35em' : '0.31em');
      try { layoutConfig.configureLabels(labels); } catch (_) { }
      labels
        .text(d => (typeof window !== 'undefined' && typeof window.getDisplayName === 'function') ? window.getDisplayName(d) : (d.data.name || ''))
        .style('font-size', `${labelFontSize}px`)
        .attr('fill', d => {
          return (typeof window !== 'undefined' && typeof window.getLabelColor === 'function') ? window.getLabelColor(d) : '#333';
        })
        .attr('font-weight', '500')
        .style('pointer-events', 'all')
        .style('cursor', 'context-menu')
        .on('contextmenu', handleLabelRightClick)
        .call((sel) => {
          if (typeof window !== 'undefined' && typeof window.applyLabelOverflow === 'function') {
            try { sel.call(window.applyLabelOverflow); } catch (e) { /* noop */ }
          }
        });

      if (layoutConfig.mode === 'packing') {
        const hoistFn = (typeof window !== 'undefined' && typeof window.hoistPackingLabels === 'function')
          ? window.hoistPackingLabels
          : function (sel) {
            if (!sel || typeof sel.each !== 'function') return;
            sel.each(function () {
              const parent = this && this.parentNode;
              const grandParent = parent && parent.parentNode;
              if (!parent || !grandParent) return;
              const parentTransform = parent.getAttribute && parent.getAttribute('transform') || '';
              const ownTransform = this.getAttribute && this.getAttribute('transform') || '';
              const combined = [parentTransform, ownTransform].map(str => str.trim()).filter(Boolean).join(' ');
              if (combined) this.setAttribute('transform', combined);
              try {
                parent.removeChild(this);
                grandParent.appendChild(this);
              } catch (_) { }
            });
          };
        try { hoistFn(labels); } catch (_) { }
      }
    }

    // 提示框
    const showTip = (event, d) => {
      try {
        if (window._tooltipHideTimer) { clearTimeout(window._tooltipHideTimer); window._tooltipHideTimer = null; }
      } catch (_) { }
      const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(d) : (d && d.data ? d.data.name : null);
      const st = nodePath ? (comparisonStats[nodePath] || {}) : {};
      const fullLabel = getNodeFullLabel(d);
      // 标题为节点全名（fullLabel），如果没有则回退为短名
      const displayName = escapeHtml(fullLabel || (d && d.data ? d.data.name : '') || '');
      // 显示节点的全路径；根据项目分隔符在分隔处插入换行点 (<wbr>)
      const delim = (typeof getTaxonRankDelimiter === 'function') ? getTaxonRankDelimiter() : '|';
      let fullPathHtml = '';
      if (nodePath) {
        try {
          const parts = String(nodePath).split(delim);
          // 对每段进行 HTML 转义，然后用分隔符 + <wbr> 连接，允许浏览器在分隔处换行
          fullPathHtml = parts.map(p => escapeHtml(p)).join(escapeHtml(delim) + '<wbr>');
        } catch (_) {
          fullPathHtml = escapeHtml(nodePath);
        }
      }
      const fmt = (x, n = 3) => (x != null && isFinite(x)) ? x.toFixed(n) : '0';
      try {
        tooltip
          .html(`
            <div class="tooltip-taxon">${displayName}</div>
            ${fullPathHtml ? `<div class="tooltip-path"><strong>Lineage:</strong> ${fullPathHtml}</div>` : ''}
            <div><strong>${group1}</strong> median: ${fmt(st.median_1, 2)} | mean: ${fmt(st.mean_1, 2)}</div>
            <div><strong>${group2}</strong> median: ${fmt(st.median_2, 2)} | mean: ${fmt(st.mean_2, 2)}</div>
            <div>Log2 fold change (${group2}/${group1}): <strong>${fmt(st.log2_median_ratio, 3)}</strong></div>
            <div>p (${(st && st.test && String(st.test).toLowerCase().startsWith('t')) ? 't-test' : 'Wilcoxon'}): ${fmt(st.pvalue, 4)} ${st.significant ? '<strong style="color:#e74c3c">(sig)</strong>' : ''}</div>
          `)
          .classed('show', true)
          .style('left', (event.pageX + 15) + 'px')
          .style('top', (event.pageY - 15) + 'px');
      } catch (_) { }
    };
    const hideTip = () => {
      try {
        if (window._tooltipHideTimer) clearTimeout(window._tooltipHideTimer);
        window._tooltipHideTimer = setTimeout(function () { try { tooltip.classed('show', false); } catch (_) { } window._tooltipHideTimer = null; }, 200);
      } catch (_) { }
    };

    nodeGroup
      .on('mouseenter', function (event, d) {
        showTip(event, d);
        try {
          d3.select(this).select('.node-hover-ring').style('opacity', 1);
        } catch (_) { }
      })
      .on('mousemove', function (event) { try { tooltip.style('left', (event.pageX + 15) + 'px').style('top', (event.pageY - 15) + 'px'); } catch (_) { } })
      .on('mouseleave', function () {
        hideTip();
        try {
          d3.select(this).select('.node-hover-ring').style('opacity', 0);
        } catch (_) { }
      })
      .on('click', function (event, d) {
        if (d && d.data) {
          const newState = !d.data.__collapsed;
          if (newState) {
            if (!window._collapsedHistory) window._collapsedHistory = [];
            window._collapsedHistory.push(d.data);
          }
          d.data.__collapsed = newState;
          drawComparisonTree(group1, group2, comparisonStats, opts);
        }
      });

    // 内嵌 SVG 图例
    try {
      svg.selectAll('.comparison-legend-group').remove();
      if (typeof window.createComparisonLegendSVG === 'function') {
        window.createComparisonLegendSVG(svg, width, height, comparisonColorDomain);
      }
    } catch (e) { console.warn('append in-svg comparison legend failed', e); }
  }

  function drawComparisonMatrix(comparisons) {
    if (!comparisons || comparisons.length === 0) {
      console.error('No comparisons to display');
      return;
    }

    const vizContainer = document.getElementById('viz-container');
    vizContainer.innerHTML = '';
    // For comparison matrix mode, allow the viz container to behave as a block so
    // the matrix container can size to its content (width = max-content). We
    // set display:block here and restore it when normal panel rendering runs.
    try { vizContainer.style.display = 'block'; } catch (_) { }
    const matrixStore = resolveComparisonRendererStore();
    try { matrixStore.clear(); } catch (_) { }

    const treatments = [...new Set(comparisons.flatMap(c => [c.treatment_1, c.treatment_2]))];
    const n = treatments.length;
    const matrixContainer = document.createElement('div');
    matrixContainer.className = 'comparison-matrix-container';
    matrixContainer.id = 'comparison-matrix';
    // Make the matrix container size to its inner grid so exports capture full width.
    try {
      // set inline width to max-content to ensure render/export code sees correct size
      matrixContainer.style.width = 'max-content';
      matrixContainer.style.maxWidth = 'none';
      // keep centering via margin (CSS also sets this)
      matrixContainer.style.margin = 'var(--spacing-lg) auto';
    } catch (_) { }

    const title = document.createElement('div');
    title.className = 'matrix-title';
    title.textContent = `Treatment Comparison Matrix (${n} groups, ${comparisons.length} comparisons)`;
    matrixContainer.appendChild(title);

    const matrixGrid = document.createElement('div');
    matrixGrid.className = 'comparison-matrix-grid';
    matrixGrid.id = 'comparison-matrix-grid';
    const colCount = Math.max(n - 1, 0);
    const rowCount = Math.max(n - 1, 0);
    // Use fixed max for cells (match min) so columns have stable width and the
    // container's horizontal scrollbar can handle overflow when there are many columns.
    // Use the shared CSS variable for label size so row and column labels
    // are symmetric. Default to 40px when the variable isn't set.
    matrixGrid.style.gridTemplateColumns = colCount > 0
      ? `var(--matrix-label-size, 40px) repeat(${colCount}, minmax(var(--matrix-cell-min-width, 150px), var(--matrix-cell-min-width, 150px)))`
      : 'var(--matrix-label-size, 40px)';
    matrixGrid.style.gridTemplateRows = rowCount > 0
      ? `var(--matrix-label-size, 40px) repeat(${rowCount}, minmax(var(--matrix-cell-min-height, 150px), var(--matrix-cell-min-height, 150px)))`
      : 'var(--matrix-label-size, 40px)';

    const cornerCell = createEmptyCell();
    cornerCell.style.pointerEvents = 'none';
    cornerCell.style.zIndex = '0';
    matrixGrid.appendChild(cornerCell);
    for (let j = 1; j < n; j++) {
      const label = document.createElement('div');
      label.className = 'matrix-col-label';
      label.textContent = treatments[j];
      label.title = treatments[j];
      label.style.zIndex = '1';
      matrixGrid.appendChild(label);
    }

    for (let i = 0; i < n - 1; i++) {
      const rowLabel = document.createElement('div');
      rowLabel.className = 'matrix-row-label';
      rowLabel.textContent = treatments[i];
      rowLabel.title = treatments[i];
      rowLabel.style.zIndex = '1';
      matrixGrid.appendChild(rowLabel);

      for (let j = 1; j < n; j++) {
        if (i < j) {
          const comp = comparisons.find(c =>
            (c.treatment_1 === treatments[i] && c.treatment_2 === treatments[j]) ||
            (c.treatment_1 === treatments[j] && c.treatment_2 === treatments[i])
          );
          if (comp) {
            const cell = createMatrixCell(i, j, comp);
            matrixGrid.appendChild(cell);
          } else {
            matrixGrid.appendChild(createEmptyCell());
          }
        } else {
          matrixGrid.appendChild(createEmptyCell());
        }
      }
    }

    matrixContainer.appendChild(matrixGrid);

    // bottom legend (HTML)
    if (typeof createComparisonLegend === 'function') {
      const legend = createComparisonLegend();
      matrixContainer.appendChild(legend);
    }

    vizContainer.appendChild(matrixContainer);
    if (typeof window.requestLayoutPanelContextSync === 'function') {
      try { window.requestLayoutPanelContextSync(); } catch (_) { }
    }
  }

  function createMatrixCell(row, col, comparison) {
    const cell = document.createElement('div');
    cell.className = 'matrix-cell';
    cell.id = `matrix-cell-${row}-${col}`;
    cell.dataset.row = row;
    cell.dataset.col = col;
    cell.dataset.comparison = JSON.stringify({
      treatment_1: comparison.treatment_1,
      treatment_2: comparison.treatment_2
    });

    cell.innerHTML = '<div class="cell-loading">Drawing...</div>';

    setTimeout(() => {
      drawMiniComparisonTree(cell.id, comparison.stats);
    }, 100 * (row * 10 + col));

    cell.style.cursor = 'pointer';
    cell.addEventListener('click', () => {
      try {
        window._comparisonMatrixBackup = Array.isArray(window.comparisonResults) ? window.comparisonResults.slice() : window.comparisonResults;
      } catch (e) {
        window._comparisonMatrixBackup = window.comparisonResults;
      }
      // In-place focus view instead of modal
      drawInlineFocusedComparison({
        treatment_1: comparison.treatment_1,
        treatment_2: comparison.treatment_2,
        stats: comparison.stats
      });
    });

    return cell;
  }

  function createEmptyCell() {
    const cell = document.createElement('div');
    cell.className = 'matrix-cell empty-cell';
    return cell;
  }

  function drawComparisonModal(comparison) {
    if (!comparison) return;
    const existing = document.getElementById('comparison-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'comparison-modal-overlay';
    overlay.className = 'comparison-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'comparison-modal-content';
    modal.id = 'comparison-modal-content';

    const header = document.createElement('div');
    header.className = 'comparison-modal-header';
    const title = document.createElement('div');
    title.className = 'modal-title';
    title.innerHTML = `<strong>${comparison.treatment_1}</strong> vs <strong>${comparison.treatment_2}</strong>`;

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'modal-actions';
    actionsWrap.style.marginLeft = 'auto';
    actionsWrap.style.display = 'inline-flex';
    actionsWrap.style.alignItems = 'center';
    actionsWrap.style.gap = '6px';

    const btnRestore = document.createElement('button');
    btnRestore.className = 'btn-icon';
    btnRestore.title = 'Restore last collapsed node';
    btnRestore.setAttribute('aria-label', 'Restore last collapsed node');
    btnRestore.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5a7 7 0 1 1-4.95 11.95" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 5H4v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btnRestore.addEventListener('click', () => { if (typeof window.restoreLastCollapsed === 'function') window.restoreLastCollapsed(); });

    const btnSvg = document.createElement('button');
    btnSvg.className = 'btn-icon';
    btnSvg.title = 'Export SVG';
    btnSvg.setAttribute('aria-label', 'Export SVG');
    btnSvg.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 3v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 9l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    btnSvg.addEventListener('click', () => exportSVGForContainer('svg-container-comparison-modal', `comparison_${comparison.treatment_1}_vs_${comparison.treatment_2}`));

    const btnPng = document.createElement('button');
    btnPng.className = 'btn-icon';
    btnPng.title = 'Export PNG';
    btnPng.setAttribute('aria-label', 'Export PNG');
    btnPng.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M7 6l2-2h6l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13" r="3" stroke="currentColor" stroke-width="2"/></svg>';
    btnPng.addEventListener('click', () => exportPNGForContainer('svg-container-comparison-modal', `comparison_${comparison.treatment_1}_vs_${comparison.treatment_2}`));

    const closeBtn = document.createElement('button');
    closeBtn.className = 'comparison-modal-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

    actionsWrap.appendChild(btnRestore);
    actionsWrap.appendChild(btnSvg);
    actionsWrap.appendChild(btnPng);
    actionsWrap.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(actionsWrap);

    const body = document.createElement('div');
    body.className = 'comparison-modal-body';
    body.id = 'comparison-modal-body';

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    window.currentModalComparison = comparison;

    drawComparisonTree(comparison.treatment_1, comparison.treatment_2, comparison.stats, { containerId: 'comparison-modal-body', isModal: true });

    const removeModal = () => {
      try { delete window.currentModalComparison; } catch (e) { window.currentModalComparison = null; }
      try { window.removeEventListener('keydown', escHandler); } catch (e) { }
      const el = document.getElementById('comparison-modal-overlay');
      if (el) el.remove();
    };

    closeBtn.addEventListener('click', removeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) removeModal(); });
    const escHandler = (e) => { if (e.key === 'Escape') removeModal(); };
    window.addEventListener('keydown', escHandler);
    overlay.addEventListener('remove', () => { window.removeEventListener('keydown', escHandler); });
  }

  // New: draw a focused comparison view inline in the main container (no modal)
  function drawInlineFocusedComparison(comparison) {
    if (!comparison) return;
    const vizContainer = document.getElementById('viz-container');
    if (!vizContainer) return;
    vizContainer.innerHTML = '';

    // Remember current focused item so redraws in matrix mode keep this view
    window.currentInlineComparison = comparison;
    if (typeof window.requestLayoutPanelContextSync === 'function') {
      try { window.requestLayoutPanelContextSync(); } catch (_) { }
    }

    // Create a dedicated body container so subsequent draw does not remove the back bar
    const body = document.createElement('div');
    body.id = 'inline-comparison-body';
    vizContainer.appendChild(body);

    // Draw the full comparison tree into the dedicated body container with header and back
    const onBack = () => {
      try { delete window.currentInlineComparison; } catch (_) { window.currentInlineComparison = null; }
      if (Array.isArray(window.comparisonResults) && window.comparisonResults.length > 0) {
        drawComparisonMatrix(window.comparisonResults);
      }
    };
    drawComparisonTree(
      comparison.treatment_1,
      comparison.treatment_2,
      comparison.stats,
      { containerId: 'inline-comparison-body', isModal: false, showBack: true, onBack }
    );
  }

  function drawMiniComparisonTree(containerId, comparisonStats) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(`#${containerId}`)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('class', 'mini-tree-svg');

    const g = svg.append('g');

    let root = d3.hierarchy(treeData, d => d.__collapsed ? null : d.children);
    // 仅剥离根一层（如有）
    try {
      if (typeof stripToFirstBranch === 'function') {
        root = stripToFirstBranch(root);
      } else if (root && root.children && root.children.length === 1) {
        root = root.children[0];
      }
    } catch (_) { }

    const layoutConfig = buildComparisonLayout(root, width, height, comparisonStats, { mini: true });
    try { layoutConfig.applyGroupTransform(g); } catch (_) { }

    const reverseColorsEnabled = resolveReverseColorsFlag();
    const { project: projectDivergingValueMini, hasNegatives: comparisonHasNegativesMini } =
      buildDivergingProjector(comparisonColorDomain, reverseColorsEnabled);

    const catMini = (typeof window !== 'undefined' && window.colorSchemeCategory) ? window.colorSchemeCategory : 'diverging';
    let colorAtValMini;
    if (catMini === 'diverging') {
      const divergeMini = createDivergingColorScale(comparisonColorDomain, divergingPalette);
      colorAtValMini = (v) => divergeMini(projectDivergingValueMini(v));
    } else {
      let interpolator;
      if (typeof colorScheme !== 'undefined' && colorScheme === 'Custom') {
        const stops = (Array.isArray(customColorStops) && customColorStops.length >= 2)
          ? customColorStops
          : [customColorStart, customColorEnd];
        interpolator = (stops.length === 2) ? d3.interpolate(stops[0], stops[1]) : d3.interpolateRgbBasis(stops);
      } else {
        const info = (typeof COLOR_SCHEMES !== 'undefined' && COLOR_SCHEMES[colorScheme]) ? COLOR_SCHEMES[colorScheme] : {};
        interpolator = info.interpolator || d3.interpolateViridis;
      }
      const tFor = (t) => (reverseColorsEnabled ? (1 - t) : t);
      const M = Math.max(Math.abs(comparisonColorDomain[0] || 0), Math.abs(comparisonColorDomain[2] || 1)) || 1;
      const pow = (typeof colorGamma !== 'undefined') ? colorGamma : 0.8;
      colorAtValMini = (v) => {
        const val = isFinite(v) ? v : 0;
        const a = Math.min(1, Math.pow(Math.min(1, Math.abs(val) / M), pow));
        const t = val < 0 ? 0.5 - a * 0.5 : val > 0 ? 0.5 + a * 0.5 : 0.5;
        return interpolator(tFor(t));
      };
    }

    const zeroLinkColorMini = (typeof resolveZeroLinkColor === 'function')
      ? resolveZeroLinkColor(colorAtValMini, comparisonHasNegativesMini)
      : ((typeof customZeroColor === 'string' && customZeroColor) ? customZeroColor : ZERO_LINK_COLOR);
    const zeroNodeColorMini = (typeof resolveZeroNodeColor === 'function')
      ? resolveZeroNodeColor(colorAtValMini, comparisonHasNegativesMini)
      : ((typeof customZeroColor === 'string' && customZeroColor) ? customZeroColor : ZERO_NODE_COLOR);

    const { filterBySignificance: filterMini } = annotateComparisonAggregates(root, comparisonStats);
    const miniNodes = getVisibleComparisonNodes(layoutConfig.nodes, filterMini);
    const miniNodeSet = new Set(miniNodes);
    const miniLinks = getVisibleComparisonLinks(layoutConfig.links, miniNodeSet, filterMini);
    if (layoutConfig.mode === 'packing') {
      g.selectAll('.link').remove();
    } else {
      const linkMini = g.selectAll('.link')
        .data(layoutConfig.links)
        .join('path')
        .attr('class', 'link');
      try { layoutConfig.configureLinks(linkMini); } catch (_) { }
      linkMini
        .style('fill', 'none')
        .style('stroke', d => {
          const targetPath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(d.target) : (d && d.target && d.target.data ? d.target.data.name : null);
          const stats = targetPath ? comparisonStats[targetPath] : undefined;
          if (!stats) return zeroLinkColorMini;
          const mean1 = stats.mean_1 || 0;
          const mean2 = stats.mean_2 || 0;
          const zeroAbundance = mean1 === 0 && mean2 === 0;
          const value = stats.comparison_value || 0;
          if (zeroAbundance || value === 0) return zeroLinkColorMini;
          return colorAtValMini(value);
        })
        .style('stroke-opacity', () => Math.max(0.05, Math.min(1, typeof edgeOpacity !== 'undefined' ? edgeOpacity : 1)))
        .style('stroke-width', 1 * edgeWidthMultiplier);
    }

    const computeMiniRadius = (d) => {
      const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(d) : (d && d.data ? d.data.name : null);
      const stats = nodePath ? comparisonStats[nodePath] : undefined;
      if (!stats) return 1;
      const mean1 = stats.mean_1 || 0;
      const mean2 = stats.mean_2 || 0;
      const avgAbundance = (mean1 + mean2) / 2;
      if (!isFinite(avgAbundance) || avgAbundance < 0) return 1;
      return Math.max(1, Math.min(3, Math.sqrt(avgAbundance) * 0.5));
    };
    const computeMiniVisualRadius = (d) => {
      const base = computeMiniRadius(d);
      const fn = (typeof layoutConfig.getVisualRadius === 'function')
        ? layoutConfig.getVisualRadius
        : ((_, b) => b);
      return fn(d, base);
    };

    const nodeSel = g.selectAll('.node')
      .data(miniNodes)
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => layoutConfig.positionNode(d));

    nodeSel.append('circle')
      .attr('r', d => computeMiniVisualRadius(d))
      .style('fill', d => {
        const nodePath = (typeof getNodeAncestorPath === 'function') ? getNodeAncestorPath(d) : (d && d.data ? d.data.name : null);
        const stats = nodePath ? comparisonStats[nodePath] : undefined;
        if (!stats) return zeroNodeColorMini;
        const mean1 = stats.mean_1 || 0;
        const mean2 = stats.mean_2 || 0;
        const avgAbundance = (mean1 + mean2) / 2;
        if (avgAbundance === 0) return zeroNodeColorMini;
        const value = stats.comparison_value || 0;
        if (value === 0) return zeroNodeColorMini;
        return colorAtValMini(value);
      })
      .style('fill-opacity', () => Math.max(0, Math.min(1, typeof nodeOpacity !== 'undefined' ? nodeOpacity : 1)))
      .style('stroke', 'none')
      .style('stroke-width', 0);

    const collapsedMini = getVisibleCollapsedNodes(layoutConfig.collapsedNodes, miniNodeSet, filterMini);
    const miniCollapse = g.selectAll('.collapse-marker')
      .data(collapsedMini)
      .join('text')
      .attr('class', 'collapse-marker')
      .attr('dy', '0.35em')
      .text('+')
      .style('font-size', '7px')
      .style('font-weight', '700')
      .attr('fill', '#2c3e50')
      .style('pointer-events', 'none');
    try { layoutConfig.configureCollapse(miniCollapse); } catch (_) { }
  }

  function createComparisonLegend(group1Label, group2Label) {
    const legend = document.createElement('div');
    legend.className = 'comparison-legend';
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    legend.id = `comparison-legend-${uniqueSuffix}`;

    const gradId = `legend-gradient-${uniqueSuffix}`;
    const category = (typeof window !== 'undefined' && window.colorSchemeCategory) ? window.colorSchemeCategory : 'diverging';
    if (category === 'diverging') {
      legend.innerHTML = `
        <div class="legend-title">Log2 Fold Change</div>
        <div class="legend-gradient" id="${gradId}"></div>
        <div class="legend-labels">
          <span>${comparisonColorDomain[0]}</span>
          <span>0</span>
          <span>${comparisonColorDomain[2]}</span>
        </div>
        <div class="legend-description">
          <span style="color: #2166ac;">■</span> Decreased in ${group2Label || 'second group'} &nbsp;&nbsp;
          <span style="color: #b2182b;">■</span> Increased in ${group2Label || 'second group'}
        </div>
      `;
    } else {
      const M = Math.max(Math.abs(comparisonColorDomain[0] || 0), Math.abs(comparisonColorDomain[2] || 1)) || 1;
      legend.innerHTML = `
        <div class="legend-title">Log2 Fold Change</div>
        <div class="legend-gradient" id="${gradId}"></div>
        <div class="legend-labels">
          <span>${-M}</span>
          <span>0</span>
          <span>${M}</span>
        </div>
      `;
    }

    setTimeout(() => {
      const gradientDiv = document.getElementById(gradId);
      if (gradientDiv) {
        const categoryNow = (typeof window !== 'undefined' && window.colorSchemeCategory) ? window.colorSchemeCategory : 'diverging';
        const reverseNow = resolveReverseColorsFlag();
        const { project: projectLegendValue } = buildDivergingProjector(comparisonColorDomain, reverseNow);
        if (categoryNow === 'diverging') {
          const colorScale = createDivergingColorScale(comparisonColorDomain, divergingPalette);
          const steps = 50;
          let gradient = 'linear-gradient(to right';
          for (let i = 0; i <= steps; i++) {
            const value = comparisonColorDomain[0] + (comparisonColorDomain[2] - comparisonColorDomain[0]) * i / steps;
            gradient += `, ${colorScale(projectLegendValue(value))} ${i / steps * 100}%`;
          }
          gradient += ')';
          gradientDiv.style.background = gradient;
        } else {
          let interpolator;
          if (typeof colorScheme !== 'undefined' && colorScheme === 'Custom') {
            const stops = (Array.isArray(customColorStops) && customColorStops.length >= 2)
              ? customColorStops
              : [
                (typeof customColorStart !== 'undefined') ? customColorStart : (window.customColorStart || '#2c7bb6'),
                (typeof customColorEnd !== 'undefined') ? customColorEnd : (window.customColorEnd || '#d7191c')
              ];
            interpolator = (stops.length === 2) ? d3.interpolate(stops[0], stops[1]) : d3.interpolateRgbBasis(stops);
          } else {
            const schemeName = (typeof colorScheme !== 'undefined') ? colorScheme : window.colorScheme;
            const info = (typeof COLOR_SCHEMES !== 'undefined' && COLOR_SCHEMES[schemeName]) ? COLOR_SCHEMES[schemeName] : {};
            interpolator = info.interpolator || d3.interpolateViridis;
          }
          const tFor = (t) => (reverseNow ? (1 - t) : t);
          const steps = 50;
          let gradient = 'linear-gradient(to right';
          for (let i = 0; i <= steps; i++) {
            const frac = i / steps;
            gradient += `, ${interpolator(tFor(frac))} ${frac * 100}%`;
          }
          gradient += ')';
          gradientDiv.style.background = gradient;
        }
      }
    }, 50);

    return legend;
  }

  if (typeof window !== 'undefined') {
    window.drawComparisonTree = drawComparisonTree;
    window.drawComparisonMatrix = drawComparisonMatrix;
    window.drawComparisonModal = drawComparisonModal;
    window.drawInlineFocusedComparison = drawInlineFocusedComparison;
    window.drawMiniComparisonTree = drawMiniComparisonTree;
    window.createComparisonLegend = createComparisonLegend;
  }
})();
