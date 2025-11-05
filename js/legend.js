// Legend utilities: shared legend (HTML) and in-SVG comparison legend
// These functions depend on globals like d3, colorScheme, customColorStops, colorSchemeReversed,
// quantileLow, quantileHigh, abundanceTransform, COLOR_SCHEMES, divergingPalette, createDivergingColorScale
// They are executed at call-time, so load order is flexible as long as dependencies are defined before call.

(function(){
  function renderSharedLegend(legendDomain, opts) {
    try {
      const container = document.getElementById('viz-container');
      if (!container) return;

      let wrapper = document.getElementById('shared-legend');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'shared-legend';
        wrapper.className = 'comparison-legend';
        container.appendChild(wrapper);
      }

      const isDiverging = Array.isArray(legendDomain) && legendDomain.length === 3;

      const abTx = (typeof abundanceTransform !== 'undefined') ? abundanceTransform : window.abundanceTransform;
      const transformHint = abTx === 'log' ? 'log10' : abTx === 'log2' ? 'log2' : abTx === 'sqrt' ? 'sqrt' : abTx === 'area' ? 'area' : 'linear';
      const fmt = (v) => Number(v).toFixed(abTx === 'none' ? 0 : 2);
      const ql = (opts && typeof opts.quantileLowP === 'number') ? opts.quantileLowP : ((typeof quantileLow !== 'undefined') ? quantileLow : window.quantileLow);
      const qh = (opts && typeof opts.quantileHighP === 'number') ? opts.quantileHighP : ((typeof quantileHigh !== 'undefined') ? quantileHigh : window.quantileHigh);
      const qlStr = (ql * 100).toFixed(1).replace(/\.0$/,'');
      const qhStr = (qh * 100).toFixed(1).replace(/\.0$/,'');

  const gradId = 'shared-legend-gradient';
  if (isDiverging) {
        const minLabel = legendDomain && legendDomain[0] != null ? fmt(legendDomain[0]) : '-1';
        const midLabel = '0';
        const maxLabel = legendDomain && legendDomain[2] != null ? fmt(legendDomain[2]) : '1';
        wrapper.innerHTML = `
          <div class="legend-title">Color scale</div>
          <div class="legend-gradient" id="${gradId}"></div>
          <div class="legend-labels">
            <span>${minLabel}</span>
            <span class="transform-hint">${transformHint} (q${qlStr}%-q${qhStr}%)</span>
            <span>${maxLabel}</span>
          </div>
        `;
        const paletteName = (typeof divergingPalette !== 'undefined') ? divergingPalette : window.divergingPalette || 'blueRed';
        const colorScale = (typeof createDivergingColorScale === 'function')
          ? createDivergingColorScale(legendDomain, paletteName)
          : d3.scaleLinear().domain(legendDomain).range(['#2166ac','#ffffff','#b2182b']);
        const steps = 50;
        let gradient = 'linear-gradient(to right';
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const val = legendDomain[0] + (legendDomain[2] - legendDomain[0]) * t;
          const reversed = (typeof colorSchemeReversed !== 'undefined') ? colorSchemeReversed : !!window.colorSchemeReversed;
          gradient += `, ${colorScale(reversed ? -val : val)} ${t * 100}%`;
        }
        gradient += ')';
        const gradientDiv = document.getElementById(gradId);
        if (gradientDiv) gradientDiv.style.background = gradient;
      } else {
        // sequential
        let interpolator = null;
        if (typeof colorScheme !== 'undefined' && colorScheme === 'Custom') {
          const stopsLex = (typeof customColorStops !== 'undefined' && Array.isArray(customColorStops)) ? customColorStops.slice() : null;
          const stopsWin = (Array.isArray(window.customColorStops)) ? window.customColorStops.slice() : null;
          let stops = null;
          if (stopsLex && stopsLex.length >= 2) stops = stopsLex;
          else if (stopsWin && stopsWin.length >= 2) stops = stopsWin;
          else {
            const start = (typeof customColorStart !== 'undefined') ? customColorStart : window.customColorStart;
            const mid = (typeof customColorMid !== 'undefined') ? customColorMid : window.customColorMid;
            const end = (typeof customColorEnd !== 'undefined') ? customColorEnd : window.customColorEnd;
            stops = (start && end) ? (mid ? [start, mid, end] : [start, end]) : ['#2c7bb6', '#d7191c'];
          }
          interpolator = stops.length <= 2 ? d3.interpolate(stops[0], stops[1]) : d3.interpolateRgbBasis(stops);
        } else {
          const schemeName = (typeof colorScheme !== 'undefined') ? colorScheme : window.colorScheme;
          const scheme = (typeof COLOR_SCHEMES !== 'undefined' && COLOR_SCHEMES[schemeName]) || {};
          interpolator = scheme.interpolator || d3.interpolateViridis;
        }
        const reversed = (typeof colorSchemeReversed !== 'undefined') ? colorSchemeReversed : !!window.colorSchemeReversed;
        const tFor = (v) => (reversed ? (1 - v) : v);
        const minLabel = legendDomain && legendDomain[0] != null ? fmt(legendDomain[0]) : '0';
        const maxLabel = legendDomain && legendDomain[1] != null ? fmt(legendDomain[1]) : '1';
        const crossesZero = legendDomain && legendDomain.length === 2 && legendDomain[0] < 0 && legendDomain[1] > 0;
        // 当顺序色标且数据包含负数时，中间显示0；否则显示变换提示
        const middleHtml = crossesZero
          ? '<span>0</span>'
          : `<span class="transform-hint">${transformHint} (q${qlStr}%-q${qhStr}%)</span>`;
        wrapper.innerHTML = `
          <div class="legend-title">Color scale</div>
          <div class="legend-gradient" id="${gradId}"></div>
          <div class="legend-labels">
            <span>${minLabel}</span>
            ${middleHtml}
            <span>${maxLabel}</span>
          </div>
        `;
        const steps = 50;
        let gradient = 'linear-gradient(to right';
        for (let i = 0; i <= steps; i++) {
          const frac = i / steps;
          const color = interpolator(tFor(frac));
          gradient += `, ${color} ${frac * 100}%`;
        }
        gradient += ')';
        const gradientDiv = document.getElementById(gradId);
        if (gradientDiv) gradientDiv.style.background = gradient;
      }
    } catch (e) {
      console.warn('renderSharedLegend error', e);
    }
  }

  function createComparisonLegendSVG(svg, width, height, domain) {
    const scale = Math.min(1, Math.min(width, height) / 800);
    const padding = 10 * scale;
    const legendWidth = Math.max(140, 180 * scale);
    const legendHeight = Math.max(46, 58 * scale);
    const barWidth = legendWidth - 2 * padding;
    const barHeight = Math.max(10, 12 * scale);
    const titleFont = Math.max(10, 12 * scale);
    const labelFont = Math.max(9, 10 * scale);

    const g = svg.append('g')
      .attr('class', 'comparison-legend-group')
      .attr('transform', `translate(${12}, ${12})`);

    g.append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .attr('rx', 6)
      .attr('fill', 'rgba(255,255,255,0.92)')
      .attr('stroke', '#d0d7de')
      .attr('stroke-width', 1);

    const gradId = `cmp-legend-grad-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const defs = svg.append('defs');
    const lg = defs.append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%')
      .attr('x2', '100%')
      .attr('y1', '0%')
      .attr('y2', '0%');

    const category = (typeof window !== 'undefined' && window.colorSchemeCategory) ? window.colorSchemeCategory : 'diverging';
    if (category === 'diverging') {
      // Ensure we use the live palette name; top-level let bindings are not on window,
      // so prefer the lexical global if available, else fall back to window.
      const paletteName = (typeof divergingPalette !== 'undefined') ? divergingPalette : window.divergingPalette;
      const colorScale = (typeof createDivergingColorScale === 'function')
        ? createDivergingColorScale(domain, paletteName)
        : d3.scaleLinear().domain(domain).range(['#2166ac','#b2182b']);

      lg.append('stop').attr('offset', '0%').attr('stop-color', colorScale(domain[0]));
      lg.append('stop').attr('offset', '50%').attr('stop-color', colorScale(domain[1]));
      lg.append('stop').attr('offset', '100%').attr('stop-color', colorScale(domain[2]));

      g.append('text')
        .attr('x', padding)
        .attr('y', padding + titleFont - 2)
        .attr('fill', '#24292f')
        .attr('font-size', `${titleFont}px`)
        .attr('font-weight', '600')
        .text('Log2 Fold Change');
    } else {
      // Sequential/Custom: build interpolator and sample across [0,1] (signed mapping uses same gradient; 0 at mid)
      let interpolator = null;
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
        const scheme = (typeof COLOR_SCHEMES !== 'undefined' && COLOR_SCHEMES[schemeName]) || {};
        interpolator = scheme.interpolator || d3.interpolateViridis;
      }
      const reversed = (typeof colorSchemeReversed !== 'undefined') ? colorSchemeReversed : !!window.colorSchemeReversed;
      const tFor = (t) => (reversed ? (1 - t) : t);
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        lg.append('stop')
          .attr('offset', `${t * 100}%`)
          .attr('stop-color', interpolator(tFor(t)));
      }

      g.append('text')
        .attr('x', padding)
        .attr('y', padding + titleFont - 2)
        .attr('fill', '#24292f')
        .attr('font-size', `${titleFont}px`)
        .attr('font-weight', '600')
        .text('Log2 Fold Change');
    }

    const barY = padding + titleFont + 6;
    g.append('rect')
      .attr('x', padding)
      .attr('y', barY)
      .attr('width', barWidth)
      .attr('height', barHeight)
      .attr('rx', 3)
      .attr('fill', `url(#${gradId})`)
      .attr('stroke', '#afb8c1')
      .attr('stroke-width', 0.5);

    const labelsY = barY + barHeight + 12 * scale;
    if (category === 'diverging') {
      g.append('text')
        .attr('x', padding)
        .attr('y', labelsY)
        .attr('fill', '#57606a')
        .attr('font-size', `${labelFont}px`)
        .text(String(domain[0]));

      // 仅在色标跨越0时显示中间的0标签（非负数据的分歧色标不显示0）
      if (domain[0] < 0 && domain[2] > 0) {
        g.append('text')
          .attr('x', padding + barWidth / 2)
          .attr('y', labelsY)
          .attr('fill', '#57606a')
          .attr('font-size', `${labelFont}px`)
          .attr('text-anchor', 'middle')
          .text('0');
      }

      g.append('text')
        .attr('x', padding + barWidth)
        .attr('y', labelsY)
        .attr('fill', '#57606a')
        .attr('font-size', `${labelFont}px`)
        .attr('text-anchor', 'end')
        .text(String(domain[2]));
    } else {
      // Sequential/Custom signed labels: -M .. 0 .. M
      const M = Math.max(Math.abs(domain[0] || 0), Math.abs(domain[2] || 1)) || 1;
      g.append('text')
        .attr('x', padding)
        .attr('y', labelsY)
        .attr('fill', '#57606a')
        .attr('font-size', `${labelFont}px`)
        .text(String(-M));

      g.append('text')
        .attr('x', padding + barWidth / 2)
        .attr('y', labelsY)
        .attr('fill', '#57606a')
        .attr('font-size', `${labelFont}px`)
        .attr('text-anchor', 'middle')
        .text('0');

      g.append('text')
        .attr('x', padding + barWidth)
        .attr('y', labelsY)
        .attr('fill', '#57606a')
        .attr('font-size', `${labelFont}px`)
        .attr('text-anchor', 'end')
        .text(String(M));
    }
  }

  if (typeof window !== 'undefined') {
    window.renderSharedLegend = renderSharedLegend;
    window.createComparisonLegendSVG = createComparisonLegendSVG;
  }
})();
