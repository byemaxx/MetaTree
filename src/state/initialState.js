export const initialState = {
  rawTree: null,
  tree: null,
  samples: [],
  selectedSamples: [],
  meta: {
    columns: [],
    rows: [],
    bySample: {}
  },
  metaFilters: {},
  layout: 'radial',
  abundanceTransform: 'none',
  colorScheme: 'Viridis',
  colorSchemeReversed: false,
  showLabels: true,
  labelThreshold: 1,
  labelFontSize: 9,
  labelMaxLength: 15,
  nodeScale: 1,
  edgeScale: 1.5,
  nodeOpacity: 1,
  edgeOpacity: 1,
  visualizationMode: 'single',
  comparisonMetric: 'log2_median_ratio',
  comparisonPalette: 'blueRed',
  comparisonDomain: [-5, 0, 5],
  showOnlySignificant: false,
  groupConfig: {
    column: '',
    groups: [],
    available: [],
    aggregation: 'mean'
  },
  taxonFilter: {
    mode: 'none',
    patterns: [],
    useRegex: false,
    caseSensitive: false
  },
  metaFilterExpanded: false,
  taxonFilterExpanded: false,
  lastLoadedFiles: {
    data: null,
    meta: null
  },
  loading: {
    data: false,
    meta: false
  },
  stats: {
    comparison: null,
    summary: null
  }
};
