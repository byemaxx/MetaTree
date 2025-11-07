import { state, setState, updateState } from '../state/store.js';
import {
  parseAbundanceTable,
  parseMetaTable,
  detectTaxonFilter,
  buildHierarchy
} from './fileParsers.js';

function updateLoadingFlag(key, value) {
  updateState('loading', (prev) => ({
    ...prev,
    [key]: value
  }));
}

function computeActiveSamples(samples) {
  if (!samples || samples.length === 0) {
    return [];
  }
  const filters = state.metaFilters || {};
  const metaBySample = state.meta.bySample || {};
  const activeColumns = Object.entries(filters)
    .filter(([, values]) => Array.isArray(values) && values.length > 0);
  if (activeColumns.length === 0) {
    return samples.slice();
  }
  return samples.filter((sample) => {
    const metaRow = metaBySample[sample];
    if (!metaRow) {
      return false;
    }
    return activeColumns.every(([column, values]) => values.includes(metaRow[column] ?? ''));
  });
}

function createTaxonPredicate() {
  const { patterns, mode, useRegex, caseSensitive } = state.taxonFilter || {};
  return detectTaxonFilter(patterns, mode, { useRegex, caseSensitive });
}

function rebuildHierarchy(rawRows, samples) {
  const predicate = createTaxonPredicate();
  return buildHierarchy(rawRows, samples, predicate);
}

export function refreshTree() {
  if (!Array.isArray(state.rawTree) || state.rawTree.length === 0) {
    setState({ tree: null });
    return null;
  }
  const activeSamples = computeActiveSamples(state.samples);
  const effectiveSamples = activeSamples.length > 0 ? activeSamples : state.samples;
  const tree = rebuildHierarchy(state.rawTree, effectiveSamples);
  setState({
    tree,
    selectedSamples: effectiveSamples.slice(),
    stats: {
      ...state.stats,
      summary: state.stats.summary
        ? { ...state.stats.summary, activeSampleCount: effectiveSamples.length }
        : { activeSampleCount: effectiveSamples.length }
    }
  });
  return tree;
}

export async function loadAbundanceFile(file) {
  updateLoadingFlag('data', true);
  try {
    const text = await file.text();
    const parsed = parseAbundanceTable(text);
    const activeSamples = computeActiveSamples(parsed.samples);
    setState({
      rawTree: parsed.rows,
      samples: parsed.samples,
      selectedSamples: activeSamples.length > 0 ? activeSamples : parsed.samples.slice(),
      stats: {
        ...state.stats,
        summary: {
          nodeCount: parsed.rows.length,
          sampleCount: parsed.samples.length,
          hasNegative: parsed.hasNegative,
          format: parsed.type
        }
      },
      lastLoadedFiles: {
        ...state.lastLoadedFiles,
        data: file.name
      }
    });
    refreshTree();
  } finally {
    updateLoadingFlag('data', false);
  }
}

export async function loadMetaFile(file) {
  updateLoadingFlag('meta', true);
  try {
    const text = await file.text();
    const parsed = parseMetaTable(text);
    setState({
      meta: parsed,
      metaFilters: {},
      lastLoadedFiles: {
        ...state.lastLoadedFiles,
        meta: file.name
      }
    });
    refreshTree();
  } finally {
    updateLoadingFlag('meta', false);
  }
}

export function setMetaFilter(column, values) {
  updateState('metaFilters', (prev) => ({
    ...prev,
    [column]: Array.isArray(values) ? values.slice() : []
  }));
  refreshTree();
}

export function clearMetaFilters() {
  setState({ metaFilters: {} });
  refreshTree();
}

export function setTaxonFilter(partial) {
  updateState('taxonFilter', (prev) => ({
    ...prev,
    ...partial
  }));
  refreshTree();
}
