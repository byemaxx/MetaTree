const fs = require('fs');
const path = require('path');

const BENCHMARK_DIR = __dirname;
const OUTPUTS_DIR = path.join(BENCHMARK_DIR, 'outputs');
const RAW_JSON_PATH = path.join(OUTPUTS_DIR, 'raw_results.json');
const ENVIRONMENT_PATH = path.join(OUTPUTS_DIR, 'environment.json');
const SUMMARY_CSV_PATH = path.join(OUTPUTS_DIR, 'summary.csv');
const SUMMARY_MD_PATH = path.join(OUTPUTS_DIR, 'benchmark_summary.md');
const OVERVIEW_PLOT_PATH = path.join(OUTPUTS_DIR, 'benchmark_overview.svg');

const METRIC_FIELDS = [
  'data_import_ms',
  'tree_build_ms',
  'initial_render_ms',
  'filter_update_ms',
  'collapse_update_ms',
  'comparison_compute_ms',
  'comparison_matrix_ms',
  'memory_mb'
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureOutputsDir() {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
}

function groupBy(rows, keyFn) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  });
  return grouped;
}

function quantile(sortedValues, q) {
  if (sortedValues.length === 0) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const weight = position - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight;
}

function summarizeMetric(rows, field) {
  const values = rows
    .map((row) => row[field])
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return {
      n: 0,
      median: null,
      iqr: null,
      min: null,
      max: null
    };
  }

  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  return {
    n: values.length,
    median: Number(quantile(values, 0.5).toFixed(3)),
    iqr: Number((q3 - q1).toFixed(3)),
    min: Number(values[0].toFixed(3)),
    max: Number(values[values.length - 1].toFixed(3))
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows, columns) {
  const lines = [columns.join(',')];
  rows.forEach((row) => {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function summarizeRows(results) {
  const grouped = groupBy(results, (row) => ([
    row.dataset_id,
    row.node_count,
    row.target_node_count,
    row.mode,
    row.layout,
    row.panel_count,
    row.matrix_comparison_count
  ].join('|')));

  const summaryRows = [];
  grouped.forEach((rows) => {
    const first = rows[0];
    const summary = {
      dataset_id: first.dataset_id,
      node_count: first.node_count,
      target_node_count: first.target_node_count,
      mode: first.mode,
      layout: first.layout,
      panel_count: first.panel_count,
      matrix_comparison_count: first.matrix_comparison_count,
      repeats: rows.length
    };

    METRIC_FIELDS.forEach((field) => {
      const stats = summarizeMetric(rows, field);
      summary[`${field}_median`] = stats.median;
      summary[`${field}_iqr`] = stats.iqr;
      summary[`${field}_min`] = stats.min;
      summary[`${field}_max`] = stats.max;
      summary[`${field}_n`] = stats.n;
    });

    summaryRows.push(summary);
  });

  return summaryRows.sort((a, b) => {
    if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
    if (a.layout !== b.layout) return a.layout.localeCompare(b.layout);
    if (a.node_count !== b.node_count) return a.node_count - b.node_count;
    return a.panel_count - b.panel_count;
  });
}

function formatMetric(value, unit) {
  if (!Number.isFinite(value)) {
    return 'NA';
  }
  if (unit === 'ms') {
    return `${value.toFixed(1)} ms`;
  }
  if (unit === 'mb') {
    return `${value.toFixed(1)} MB`;
  }
  return value.toFixed(1);
}

function formatRange(rows, field, unit) {
  const values = rows
    .map((row) => row[`${field}_median`])
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return 'NA';
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `${formatMetric(min, unit)} to ${formatMetric(max, unit)}`;
}

function panelLabel(row) {
  if (row.mode === 'matrix') {
    return row.panel_count === 4 ? '2 groups / 1 comparison' : '3 groups / 3 comparisons';
  }
  if (row.mode === 'comparison') {
    return '1 tree';
  }
  return `${row.panel_count} panels`;
}

function uniqueSortedNumeric(values) {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort((a, b) => a - b);
}

function createOverviewPlot(summaryRows) {
  const layouts = ['radial', 'dendrogram'];
  const modes = ['single', 'group', 'comparison', 'matrix'];
  const palette = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];
  const width = 1600;
  const headerHeight = 122;
  const sectionTitleHeight = 26;
  const sectionGap = 38;
  const footerPadding = 34;

  const margin = { top: 80, right: 40, bottom: 60, left: 70 };
  const facetWidth = 340;
  const facetHeight = 320;
  const gapX = 30;

  const xValues = uniqueSortedNumeric(summaryRows.map((row) => row.node_count));
  const legendLabels = Array.from(new Set(summaryRows.map(panelLabel)));
  const legendMap = new Map(legendLabels.map((label, index) => [label, palette[index % palette.length]]));

  const metrics = [
    {
      field: 'initial_render_ms',
      title: 'Initial render time',
      yLabel: 'Median render time (ms)'
    },
    {
      field: 'filter_update_ms',
      title: 'Filter update time',
      yLabel: 'Median filter update (ms)'
    },
    {
      field: 'memory_mb',
      title: 'Memory after initial render',
      yLabel: 'Median JS heap (MB)'
    }
  ];

  const gridHeight = facetHeight;
  const height = headerHeight
    + (metrics.length * (sectionTitleHeight + gridHeight))
    + ((metrics.length - 1) * sectionGap)
    + footerPadding;

  function layoutStrokeAttrs(layout) {
    if (layout === 'dendrogram') {
      return 'stroke-dasharray="7 5"';
    }
    return '';
  }

  function drawMarker(svg, layout, x, y, color) {
    if (layout === 'dendrogram') {
      svg.push(`<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="${color}"/>`);
      return;
    }
    svg.push(`<circle cx="${x}" cy="${y}" r="4" fill="${color}"/>`);
  }

  function appendFacetRow(svg, metricField, yLabel, baseY) {
    const values = summaryRows
      .map((row) => row[`${metricField}_median`])
      .filter((value) => Number.isFinite(value));
    const yMax = values.length ? Math.max(...values) * 1.1 : 1;

    const xMin = xValues.length ? Math.min(...xValues) : 0;
    const xMax = xValues.length ? Math.max(...xValues) : 1;

    function xScale(value) {
      const usableWidth = facetWidth - margin.left - margin.right;
      if (xMax === xMin) {
        return margin.left + usableWidth / 2;
      }
      return margin.left + ((value - xMin) / (xMax - xMin)) * usableWidth;
    }

    function yScale(value) {
      const usableHeight = facetHeight - margin.top - margin.bottom;
      if (yMax === 0) {
        return facetHeight - margin.bottom;
      }
      return facetHeight - margin.bottom - (value / yMax) * usableHeight;
    }

    modes.forEach((mode, columnIndex) => {
      const facetX = 20 + columnIndex * (facetWidth + gapX);
      const facetY = baseY;
      const facetRows = summaryRows.filter((row) => row.mode === mode);

      svg.push(`<g transform="translate(${facetX}, ${facetY})">`);
      svg.push(`<rect x="0" y="0" width="${facetWidth}" height="${facetHeight}" fill="#ffffff" stroke="#d1d5db"/>`);
      svg.push(`<text x="${facetWidth / 2}" y="24" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#111827">${mode}</text>`);

      [0, 0.25, 0.5, 0.75, 1].forEach((tickFraction) => {
        const yValue = yMax * tickFraction;
        const y = yScale(yValue);
        svg.push(`<line x1="${margin.left}" y1="${y}" x2="${facetWidth - margin.right}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);
        svg.push(`<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="Arial, sans-serif" font-size="11" fill="#6b7280">${Math.round(yValue)}</text>`);
      });

      xValues.forEach((nodeCount) => {
        const x = xScale(nodeCount);
        svg.push(`<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${facetHeight - margin.bottom}" stroke="#f3f4f6" stroke-width="1"/>`);
        svg.push(`<text x="${x}" y="${facetHeight - margin.bottom + 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#6b7280">${nodeCount}</text>`);
      });

      svg.push(`<line x1="${margin.left}" y1="${facetHeight - margin.bottom}" x2="${facetWidth - margin.right}" y2="${facetHeight - margin.bottom}" stroke="#374151" stroke-width="1.2"/>`);
      svg.push(`<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${facetHeight - margin.bottom}" stroke="#374151" stroke-width="1.2"/>`);
      svg.push(`<text x="${facetWidth / 2}" y="${facetHeight - 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#111827">Hierarchy nodes</text>`);
      svg.push(`<text x="14" y="${facetHeight / 2}" text-anchor="middle" transform="rotate(-90 14 ${facetHeight / 2})" font-family="Arial, sans-serif" font-size="12" fill="#111827">${yLabel}</text>`);

      const bySeries = groupBy(facetRows, panelLabel);
      bySeries.forEach((seriesRows, label) => {
        layouts.forEach((layout) => {
          const ordered = seriesRows
            .filter((row) => row.layout === layout)
            .slice()
            .sort((a, b) => a.node_count - b.node_count);

          const points = ordered
            .filter((row) => Number.isFinite(row[`${metricField}_median`]))
            .map((row) => `${xScale(row.node_count)},${yScale(row[`${metricField}_median`])}`);

          if (points.length === 0) {
            return;
          }

          const color = legendMap.get(label);
          const layoutAttrs = layoutStrokeAttrs(layout);
          svg.push(`<polyline fill="none" stroke="${color}" stroke-width="2.5" ${layoutAttrs} points="${points.join(' ')}"/>`);

          ordered.forEach((row) => {
            if (!Number.isFinite(row[`${metricField}_median`])) {
              return;
            }
            drawMarker(svg, layout, xScale(row.node_count), yScale(row[`${metricField}_median`]), color);
          });
        });
      });

      svg.push('</g>');
    });
  }

  const svg = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  svg.push('<rect width="100%" height="100%" fill="#ffffff"/>');
  svg.push(`<text x="${width / 2}" y="34" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#111827">MetaTree Benchmark Overview</text>`);
  svg.push(`<text x="${width / 2}" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#4b5563">Median values across repeated benchmark runs. Color encodes panel/group condition; line/marker style encodes layout.</text>`);

  legendLabels.forEach((label, index) => {
    const x = 70 + index * 220;
    const y = 82;
    svg.push(`<line x1="${x}" y1="${y}" x2="${x + 26}" y2="${y}" stroke="${legendMap.get(label)}" stroke-width="3"/>`);
    svg.push(`<text x="${x + 34}" y="${y + 4}" font-family="Arial, sans-serif" font-size="12" fill="#111827">${label}</text>`);
  });

  // Layout style legend.
  svg.push(`<line x1="70" y1="104" x2="96" y2="104" stroke="#111827" stroke-width="2.5"/>`);
  svg.push(`<circle cx="109" cy="104" r="4" fill="#111827"/>`);
  svg.push(`<text x="122" y="108" font-family="Arial, sans-serif" font-size="12" fill="#111827">radial</text>`);

  svg.push(`<line x1="210" y1="104" x2="236" y2="104" stroke="#111827" stroke-width="2.5" stroke-dasharray="7 5"/>`);
  svg.push(`<rect x="249" y="100" width="8" height="8" fill="#111827"/>`);
  svg.push(`<text x="262" y="108" font-family="Arial, sans-serif" font-size="12" fill="#111827">dendrogram</text>`);

  let currentY = headerHeight;
  metrics.forEach((metric, index) => {
    svg.push(`<text x="20" y="${currentY + 18}" font-family="Arial, sans-serif" font-size="16" fill="#111827">${metric.title}</text>`);
    appendFacetRow(svg, metric.field, metric.yLabel, currentY + sectionTitleHeight);
    currentY += sectionTitleHeight + gridHeight;
    if (index < metrics.length - 1) {
      currentY += sectionGap;
    }
  });

  svg.push('</svg>');
  return svg.join('\n');
}

function buildModeRangeTable(summaryRows) {
  const modes = ['single', 'group', 'comparison', 'matrix'];
  const lines = [
    '| Mode | Initial render median range | Filter update median range | Collapse update median range | Memory median range |',
    '| --- | --- | --- | --- | --- |'
  ];

  modes.forEach((mode) => {
    const rows = summaryRows.filter((row) => row.mode === mode);
    lines.push(`| ${mode} | ${formatRange(rows, 'initial_render_ms', 'ms')} | ${formatRange(rows, 'filter_update_ms', 'ms')} | ${formatRange(rows, 'collapse_update_ms', 'ms')} | ${formatRange(rows, 'memory_mb', 'mb')} |`);
  });

  return lines.join('\n');
}

function buildLargestConditionTable(summaryRows) {
  const lines = [
    '| Mode | Layout | Largest-node condition | Initial render median (IQR) | Filter median (IQR) | Matrix render median (IQR) | Memory median (IQR) |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];

  const rows = summaryRows
    .slice()
    .sort((a, b) => (
      (b.node_count - a.node_count) ||
      (b.panel_count - a.panel_count) ||
      ((b.matrix_comparison_count || 0) - (a.matrix_comparison_count || 0))
    ));

  const seen = new Set();
  rows.forEach((row) => {
    const key = `${row.mode}|${row.layout}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    lines.push(`| ${row.mode} | ${row.layout} | ${row.node_count} nodes, ${panelLabel(row)} | ${formatMetric(row.initial_render_ms_median, 'ms')} (${formatMetric(row.initial_render_ms_iqr, 'ms')}) | ${formatMetric(row.filter_update_ms_median, 'ms')} (${formatMetric(row.filter_update_ms_iqr, 'ms')}) | ${formatMetric(row.comparison_matrix_ms_median, 'ms')} (${formatMetric(row.comparison_matrix_ms_iqr, 'ms')}) | ${formatMetric(row.memory_mb_median, 'mb')} (${formatMetric(row.memory_mb_iqr, 'mb')}) |`);
  });

  return lines.join('\n');
}

function buildSummaryMarkdown(rawJson, environment, summaryRows) {
  const resultCount = rawJson.results.length;
  const expectedRows = environment.total_conditions * environment.repeats;
  const matrixRows = rawJson.results.filter((row) => row.mode === 'matrix');
  const matrixRowsValid = matrixRows.every((row) => (
    Number.isFinite(row.panel_count) &&
    Number.isFinite(row.matrix_comparison_count)
  ));
  const uniqueNodeCounts = Array.from(new Set(summaryRows.map((row) => row.node_count))).sort((a, b) => a - b);
  const uniqueLayouts = Array.from(new Set(summaryRows.map((row) => row.layout))).sort();
  const uniqueModes = Array.from(new Set(summaryRows.map((row) => row.mode))).sort();

  const notes = [];
  const allInitial = summaryRows
    .map((row) => row.initial_render_ms_median)
    .filter((value) => Number.isFinite(value));
  const allFilters = summaryRows
    .map((row) => row.filter_update_ms_median)
    .filter((value) => Number.isFinite(value));
  const allMemory = summaryRows
    .map((row) => row.memory_mb_median)
    .filter((value) => Number.isFinite(value));

  if (allInitial.length) {
    notes.push(`Across all conditions, median initial render times ranged from ${formatMetric(Math.min(...allInitial), 'ms')} to ${formatMetric(Math.max(...allInitial), 'ms')}.`);
  }
  if (allFilters.length) {
    notes.push(`Median filter-update times ranged from ${formatMetric(Math.min(...allFilters), 'ms')} to ${formatMetric(Math.max(...allFilters), 'ms')}.`);
  }
  if (allMemory.length) {
    notes.push(`Median post-render JavaScript heap usage ranged from ${formatMetric(Math.min(...allMemory), 'mb')} to ${formatMetric(Math.max(...allMemory), 'mb')}.`);
  }
  notes.push('Collapse/expand timing is reported for single, group, and pairwise comparison views; it is not applicable to the matrix view.');
  notes.push('Matrix render timing is reported separately from pairwise comparison computation so delayed cell drawing is not conflated with statistical calculation.');

  return [
    '# MetaTree Benchmark Summary',
    '',
    '## Benchmark design',
    '',
    `The automated workflow benchmarked browser-side performance for ${summaryRows.length} unique conditions covering ${uniqueModes.join(', ')} modes. The tested hierarchy sizes were ${uniqueNodeCounts.join(', ')} nodes, with ${uniqueLayouts.join(' and ')} layouts. Single-sample and group views were benchmarked with 1, 4, and 9 panels; pairwise comparison used one tree; matrix view used 2 groups (one pairwise cell, recorded as panel_count 4) and 3 groups (three pairwise cells, recorded as panel_count 9). Each condition was repeated ${environment.repeats} times.`,
    '',
    '## Environment',
    '',
    `Browser: ${environment.browser_family || 'chromium'} ${environment.browser_version || ''}`.trim(),
    '',
    `OS: ${environment.os.family || 'Unknown'}${environment.os.arch ? ` (${environment.os.arch})` : ''}`,
    '',
    `CPU: ${environment.cpu.model ? `${environment.cpu.model}${environment.cpu.logical_cores != null ? ` (${environment.cpu.logical_cores} logical cores)` : ''}` : (environment.cpu.logical_cores != null ? `${environment.cpu.logical_cores} logical cores` : 'Unknown')}`,
    '',
    `RAM: ${environment.ram_gb_approx != null ? `approximately ${environment.ram_gb_approx} GB` : 'Unknown'}`,
    '',
    '## Validation checks',
    '',
    `Expected rows: ${expectedRows}`,
    '',
    `Observed rows: ${resultCount}`,
    '',
    `Matrix rows include panel_count and matrix_comparison_count: ${matrixRowsValid ? 'yes' : 'no'}`,
    '',
    '## Key results',
    '',
    ...notes.map((note) => `- ${note}`),
    '',
    buildModeRangeTable(summaryRows),
    '',
    buildLargestConditionTable(summaryRows),
    '',
    '## Limitations',
    '',
    '- The benchmark reflects one browser, viewport, and hardware environment, so the numerical values should be interpreted as reproducible reference measurements rather than universal performance guarantees.',
    '- JavaScript heap usage was measured after the initial render and reflects browser heap use rather than total system memory consumption.',
    '- Interaction timings are based on deterministic scripted actions. They are informative for relative scalability trends, but they do not replace task-based usability studies with human participants.',
    '- The matrix benchmark includes the application\'s staged mini-tree rendering, which is appropriate for end-user wait time but will be slower than the underlying comparison computation alone.',
    ''
  ].join('\n');
}

function main() {
  ensureOutputsDir();

  if (!fs.existsSync(RAW_JSON_PATH)) {
    throw new Error(`Missing ${RAW_JSON_PATH}. Run the benchmark first.`);
  }
  if (!fs.existsSync(ENVIRONMENT_PATH)) {
    throw new Error(`Missing ${ENVIRONMENT_PATH}. Run the benchmark first.`);
  }

  const rawJson = readJson(RAW_JSON_PATH);
  const environment = readJson(ENVIRONMENT_PATH);
  const summaryRows = summarizeRows(rawJson.results);

  const summaryColumns = [
    'dataset_id',
    'node_count',
    'target_node_count',
    'mode',
    'layout',
    'panel_count',
    'matrix_comparison_count',
    'repeats'
  ];
  METRIC_FIELDS.forEach((field) => {
    summaryColumns.push(`${field}_median`);
    summaryColumns.push(`${field}_iqr`);
    summaryColumns.push(`${field}_min`);
    summaryColumns.push(`${field}_max`);
    summaryColumns.push(`${field}_n`);
  });

  writeCsv(SUMMARY_CSV_PATH, summaryRows, summaryColumns);
  fs.writeFileSync(OVERVIEW_PLOT_PATH, createOverviewPlot(summaryRows), 'utf8');
  fs.writeFileSync(SUMMARY_MD_PATH, buildSummaryMarkdown(rawJson, environment, summaryRows), 'utf8');

  console.log(`Wrote ${summaryRows.length} summary rows and benchmark outputs to ${OUTPUTS_DIR}`);
}

main();
