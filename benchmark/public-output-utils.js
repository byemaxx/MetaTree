function coarsenIsoDate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : trimmed;
}

function normalizePlatformFamily(platform) {
  const value = String(platform || '').toLowerCase();
  if (value.includes('win')) return 'Windows';
  if (value.includes('darwin') || value.includes('mac')) return 'macOS';
  if (value.includes('linux')) return 'Linux';
  if (!value) return null;
  return platform;
}

function sanitizeEnvironment(environment) {
  const source = environment || {};
  const osSource = source.os || {};
  const cpuSource = source.cpu || {};
  const ramSource = source.ram_gb_approx != null ? source.ram_gb_approx : source.ram_gb;

  return {
    public_release: true,
    benchmark_started_at: coarsenIsoDate(source.benchmark_started_at),
    browser_family: source.browser_family || 'chromium',
    browser_version: source.browser_version || null,
    headless: !!source.headless,
    viewport: source.viewport || null,
    repeats: source.repeats != null ? source.repeats : null,
    smoke: !!source.smoke,
    total_conditions: source.total_conditions != null ? source.total_conditions : null,
    os: {
      family: osSource.family || normalizePlatformFamily(osSource.platform),
      arch: osSource.arch || null
    },
    cpu: {
      model: cpuSource.model || null,
      logical_cores: cpuSource.logical_cores != null ? cpuSource.logical_cores : null
    },
    ram_gb_approx: Number.isFinite(ramSource) ? Math.round(ramSource) : null
  };
}

function sanitizeOsLabel(input) {
  if (typeof input === 'string' && input.trim()) {
    return normalizePlatformFamily(input) || input.trim();
  }
  return null;
}

function sanitizeResultRow(row) {
  const source = row || {};
  const ramValue = source.ram_gb_approx != null ? source.ram_gb_approx : source.ram_gb;

  return {
    dataset_id: source.dataset_id,
    node_count: source.node_count,
    target_node_count: source.target_node_count,
    panel_count: source.panel_count,
    matrix_comparison_count: source.matrix_comparison_count,
    mode: source.mode,
    layout: source.layout,
    run_index: source.run_index,
    data_import_ms: source.data_import_ms,
    tree_build_ms: source.tree_build_ms,
    initial_render_ms: source.initial_render_ms,
    filter_update_ms: source.filter_update_ms,
    filter_kind: source.filter_kind,
    collapse_update_ms: source.collapse_update_ms,
    comparison_compute_ms: source.comparison_compute_ms,
    comparison_matrix_ms: source.comparison_matrix_ms,
    memory_mb: source.memory_mb,
    browser: source.browser || null,
    os_family: source.os_family || sanitizeOsLabel(source.os),
    cpu_cores: source.cpu_cores != null ? source.cpu_cores : null,
    ram_gb_approx: Number.isFinite(ramValue) ? Math.round(ramValue) : null,
    viewport_width: source.viewport_width != null ? source.viewport_width : null,
    viewport_height: source.viewport_height != null ? source.viewport_height : null
  };
}

const PUBLIC_RAW_RESULT_COLUMNS = [
  'dataset_id',
  'node_count',
  'target_node_count',
  'panel_count',
  'matrix_comparison_count',
  'mode',
  'layout',
  'run_index',
  'data_import_ms',
  'tree_build_ms',
  'initial_render_ms',
  'filter_update_ms',
  'filter_kind',
  'collapse_update_ms',
  'comparison_compute_ms',
  'comparison_matrix_ms',
  'memory_mb',
  'browser',
  'os_family',
  'cpu_cores',
  'ram_gb_approx',
  'viewport_width',
  'viewport_height'
];

module.exports = {
  coarsenIsoDate,
  PUBLIC_RAW_RESULT_COLUMNS,
  normalizePlatformFamily,
  sanitizeEnvironment,
  sanitizeResultRow
};
