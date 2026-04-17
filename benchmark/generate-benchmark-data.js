const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(__dirname, 'generated');
const SEED_DATA_PATH = path.join(ROOT_DIR, 'test', 'data', 'taxa_functions_ko.tsv');
const SEED_META_PATH = path.join(ROOT_DIR, 'test', 'data', 'meta.tsv');
const TARGET_NODE_COUNTS = [500, 2000, 5000, 10000];
const BENCHMARK_GROUP_COUNT = 9;
const REPLICATES_PER_GROUP = 3;
const FILTER_FRACTION = 0.10;
const SUBSET_SEARCH_SEEDS = 18;
const CLONE_SUFFIX_PREFIX = '__BenchmarkClone';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function hashToUnitInterval(input) {
  const hash = crypto.createHash('sha256').update(String(input)).digest();
  const int = hash.readUInt32BE(0);
  return int / 0xffffffff;
}

function parseTsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  const lines = text.split(/\r?\n/);
  const header = lines[0].split('\t');
  const rows = lines.slice(1).map((line) => {
    const parts = line.split('\t');
    const row = {};
    header.forEach((column, index) => {
      row[column] = parts[index] ?? '';
    });
    return row;
  });
  return { header, rows, text };
}

function splitTaxon(taxon) {
  let taxonomy = String(taxon || '').trim();
  let functionLabel = null;
  const functionStart = taxonomy.indexOf(' <');
  if (functionStart >= 0) {
    const functionEnd = taxonomy.lastIndexOf('>');
    if (functionEnd > functionStart) {
      functionLabel = taxonomy.slice(functionStart + 2, functionEnd).trim();
      taxonomy = taxonomy.slice(0, functionStart).trim();
    }
  }
  const taxonomyParts = taxonomy
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  return { taxonomyParts, functionLabel };
}

function joinTaxon(parts, functionLabel) {
  const taxonomy = parts.join('|');
  return functionLabel ? `${taxonomy} <${functionLabel}>` : taxonomy;
}

function countUniqueNodes(taxa) {
  const nodes = new Set();
  taxa.forEach((taxon) => {
    const { taxonomyParts, functionLabel } = splitTaxon(taxon);
    const prefix = [];
    taxonomyParts.forEach((part) => {
      prefix.push(part);
      nodes.add(prefix.join('|'));
    });
    if (functionLabel) {
      nodes.add(prefix.concat(`<${functionLabel}>`).join('|'));
    }
  });
  return nodes.size;
}

function pickEvenly(items, count) {
  if (items.length <= count) return items.slice();
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const position = Math.round((index * (items.length - 1)) / Math.max(count - 1, 1));
    result.push(items[position]);
  }
  return result;
}

function buildSeedMetadataMap() {
  const meta = parseTsv(SEED_META_PATH);
  const grouped = new Map();
  meta.rows.forEach((row) => {
    const sample = String(row.Sample || '').trim();
    const oligosaccharide = String(row.Oligosaccharide || '').trim();
    const individual = String(row.Individual || '').trim();
    if (!sample || !oligosaccharide || !individual) return;
    const key = `${oligosaccharide}|${individual}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(sample);
  });

  const validCombos = Array.from(grouped.entries())
    .map(([key, samples]) => [key, samples.slice().sort()])
    .filter(([, samples]) => samples.length >= REPLICATES_PER_GROUP)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const selectedCombos = pickEvenly(validCombos, BENCHMARK_GROUP_COUNT);
  return selectedCombos.map(([key, samples], index) => {
    const [sourceTreatment, sourceIndividual] = key.split('|');
    const benchmarkGroup = `G${String(index + 1).padStart(2, '0')}`;
    return {
      benchmarkGroup,
      sourceTreatment,
      sourceIndividual,
      sourceSamples: samples.slice(0, REPLICATES_PER_GROUP)
    };
  });
}

function parseSeedRecords() {
  const seed = parseTsv(SEED_DATA_PATH);
  const sampleNames = seed.header.slice(1);
  return {
    sampleNames,
    records: seed.rows.map((row) => {
      const taxon = row[seed.header[0]];
      const { taxonomyParts, functionLabel } = splitTaxon(taxon);
      const valuesBySample = {};
      sampleNames.forEach((sampleName) => {
        const numeric = Number.parseFloat(row[sampleName]);
        valuesBySample[sampleName] = Number.isFinite(numeric) ? numeric : 0;
      });
      return {
        taxon,
        taxonomyParts,
        functionLabel,
        valuesBySample
      };
    })
  };
}

function buildHierarchyTree(records) {
  const root = {
    key: '__root__',
    depth: -1,
    children: new Map(),
    leafIndices: [],
    pathParts: []
  };

  records.forEach((record, leafIndex) => {
    const parts = record.functionLabel
      ? record.taxonomyParts.concat(`<${record.functionLabel}>`)
      : record.taxonomyParts.slice();
    let node = root;
    node.leafIndices.push(leafIndex);
    parts.forEach((part, depth) => {
      if (!node.children.has(part)) {
        node.children.set(part, {
          key: part,
          depth,
          children: new Map(),
          leafIndices: [],
          pathParts: node.pathParts.concat(part),
          relativeNodeCount: 0
        });
      }
      node = node.children.get(part);
      node.leafIndices.push(leafIndex);
    });
  });

  const candidates = [];

  function finalize(node) {
    let relativeNodeCount = node.key === '__root__' ? 0 : 1;
    node.children.forEach((child) => {
      relativeNodeCount += finalize(child);
    });
    node.relativeNodeCount = relativeNodeCount;

    const candidateDepth = node.depth;
    const leafCount = node.leafIndices.length;
    if (
      node.key !== '__root__'
      && node.children.size > 0
      && candidateDepth >= 1
      && candidateDepth <= 3
      && leafCount >= 8
      && relativeNodeCount >= 25
    ) {
      candidates.push({
        id: node.pathParts.join('|'),
        cloneDepth: node.depth,
        pathParts: node.pathParts.slice(),
        leafIndices: node.leafIndices.slice(),
        relativeNodeCount
      });
    }
    return relativeNodeCount;
  }

  finalize(root);
  candidates.sort((a, b) => {
    if (b.relativeNodeCount !== a.relativeNodeCount) {
      return b.relativeNodeCount - a.relativeNodeCount;
    }
    return a.id.localeCompare(b.id);
  });

  return { root, candidates };
}

function chooseSubsetForTarget(records, targetNodeCount) {
  const indices = records.map((_, index) => index);
  let best = null;

  for (let seedIndex = 0; seedIndex < SUBSET_SEARCH_SEEDS; seedIndex += 1) {
    const ordered = indices
      .slice()
      .sort((left, right) => {
        const leftHash = hashToUnitInterval(`subset|${targetNodeCount}|${seedIndex}|${records[left].taxon}`);
        const rightHash = hashToUnitInterval(`subset|${targetNodeCount}|${seedIndex}|${records[right].taxon}`);
        return leftHash - rightHash;
      });

    const seenNodes = new Set();
    const chosen = [];
    let lastCandidate = {
      chosenIndices: [],
      nodeCount: 0,
      diff: Math.abs(targetNodeCount)
    };

    for (const recordIndex of ordered) {
      const record = records[recordIndex];
      const { taxonomyParts, functionLabel } = record;
      const addedNodes = [];
      const prefix = [];
      taxonomyParts.forEach((part) => {
        prefix.push(part);
        const nodeKey = prefix.join('|');
        if (!seenNodes.has(nodeKey)) addedNodes.push(nodeKey);
      });
      if (functionLabel) {
        const functionKey = prefix.concat(`<${functionLabel}>`).join('|');
        if (!seenNodes.has(functionKey)) addedNodes.push(functionKey);
      }

      chosen.push(recordIndex);
      addedNodes.forEach((nodeKey) => seenNodes.add(nodeKey));

      const currentNodeCount = seenNodes.size;
      const currentDiff = Math.abs(currentNodeCount - targetNodeCount);
      if (currentDiff <= lastCandidate.diff) {
        lastCandidate = {
          chosenIndices: chosen.slice(),
          nodeCount: currentNodeCount,
          diff: currentDiff
        };
      }

      if (currentNodeCount >= targetNodeCount && lastCandidate.diff <= currentDiff) {
        break;
      }
    }

    if (!best || lastCandidate.diff < best.diff) {
      best = lastCandidate;
    }
  }

  return {
    chosenIndices: best.chosenIndices.slice().sort((a, b) => a - b),
    actualNodeCount: best.nodeCount
  };
}

function chooseClonePlan(candidates, targetExtraNodes) {
  const filtered = candidates
    .filter((candidate) => candidate.relativeNodeCount <= targetExtraNodes + 800)
    .slice(0, 80);
  if (filtered.length === 0 || targetExtraNodes <= 0) return [];

  const maxCandidateSize = filtered.reduce((max, candidate) => Math.max(max, candidate.relativeNodeCount), 0);
  const searchLimit = targetExtraNodes + maxCandidateSize;
  const plans = new Array(searchLimit + 1).fill(null);
  plans[0] = [];

  for (let current = 0; current <= searchLimit; current += 1) {
    if (!plans[current]) continue;
    filtered.forEach((candidate, index) => {
      const next = current + candidate.relativeNodeCount;
      if (next > searchLimit) return;
      const proposed = plans[current].concat(index);
      if (!plans[next] || proposed.length < plans[next].length) {
        plans[next] = proposed;
      }
    });
  }

  let bestIndex = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let current = 0; current <= searchLimit; current += 1) {
    if (!plans[current]) continue;
    const diff = Math.abs(current - targetExtraNodes);
    if (diff < bestDiff) {
      bestIndex = current;
      bestDiff = diff;
    }
  }

  return plans[bestIndex].map((index) => filtered[index]);
}

function buildFilterTaxa(taxa) {
  const sorted = taxa
    .slice()
    .sort((left, right) => {
      const leftHash = hashToUnitInterval(`filter|${left}`);
      const rightHash = hashToUnitInterval(`filter|${right}`);
      return leftHash - rightHash;
    });
  const keepCount = Math.max(1, Math.round(sorted.length * FILTER_FRACTION));
  return sorted.slice(0, keepCount).sort();
}

function buildValue(baseValue, datasetId, benchmarkSample, taxon, cloneOrdinal) {
  if (!Number.isFinite(baseValue) || baseValue <= 0) return 0;
  const jitter = 0.92 + (hashToUnitInterval(`${datasetId}|${benchmarkSample}|${taxon}|${cloneOrdinal}`) * 0.16);
  return Math.max(0, Math.round(baseValue * jitter));
}

function materializeDatasetRecords(records, chosenIndices, clonePlan, sampleSpecs, datasetId) {
  const materialized = [];
  let cloneOrdinal = 0;

  function pushRecord(sourceRecord, taxon, currentCloneOrdinal) {
    const values = {};
    sampleSpecs.forEach((sampleSpec) => {
      const sourceValue = sourceRecord.valuesBySample[sampleSpec.sourceSample] ?? 0;
      values[sampleSpec.sampleName] = buildValue(
        sourceValue,
        datasetId,
        sampleSpec.sampleName,
        taxon,
        currentCloneOrdinal
      );
    });
    materialized.push({ taxon, values });
  }

  chosenIndices.forEach((recordIndex) => {
    const record = records[recordIndex];
    pushRecord(record, record.taxon, 0);
  });

  clonePlan.forEach((candidate, planIndex) => {
    const cloneSuffix = `${CLONE_SUFFIX_PREFIX}${String(planIndex + 1).padStart(2, '0')}`;
    candidate.leafIndices.forEach((leafIndex) => {
      const record = records[leafIndex];
      const clonedParts = record.taxonomyParts.slice();
      clonedParts[candidate.cloneDepth] = `${clonedParts[candidate.cloneDepth]}${cloneSuffix}`;
      const clonedTaxon = joinTaxon(clonedParts, record.functionLabel);
      cloneOrdinal += 1;
      pushRecord(record, clonedTaxon, cloneOrdinal);
    });
  });

  materialized.sort((left, right) => left.taxon.localeCompare(right.taxon));
  return materialized;
}

function buildSampleSpecs(sourceGroups) {
  const sampleSpecs = [];
  sourceGroups.forEach((group) => {
    group.sourceSamples.forEach((sourceSample, replicateIndex) => {
      sampleSpecs.push({
        sampleName: `${group.benchmarkGroup}_R${replicateIndex + 1}`,
        benchmarkGroup: group.benchmarkGroup,
        benchmarkReplicate: `R${replicateIndex + 1}`,
        sourceSample,
        sourceTreatment: group.sourceTreatment,
        sourceIndividual: group.sourceIndividual
      });
    });
  });
  return sampleSpecs;
}

function datasetToTsv(records, sampleSpecs) {
  const header = ['Taxon'].concat(sampleSpecs.map((sampleSpec) => sampleSpec.sampleName));
  const lines = [header.join('\t')];
  records.forEach((record) => {
    const row = [record.taxon];
    sampleSpecs.forEach((sampleSpec) => {
      row.push(String(record.values[sampleSpec.sampleName] ?? 0));
    });
    lines.push(row.join('\t'));
  });
  return `${lines.join('\n')}\n`;
}

function metaToTsv(sampleSpecs) {
  const lines = [
    ['Sample', 'BenchmarkGroup', 'BenchmarkReplicate', 'SourceSample', 'SourceTreatment', 'SourceIndividual'].join('\t')
  ];
  sampleSpecs.forEach((sampleSpec) => {
    lines.push([
      sampleSpec.sampleName,
      sampleSpec.benchmarkGroup,
      sampleSpec.benchmarkReplicate,
      sampleSpec.sourceSample,
      sampleSpec.sourceTreatment,
      sampleSpec.sourceIndividual
    ].join('\t'));
  });
  return `${lines.join('\n')}\n`;
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function main() {
  ensureDir(GENERATED_DIR);

  const { records } = parseSeedRecords();
  const sourceGroups = buildSeedMetadataMap();
  const sampleSpecs = buildSampleSpecs(sourceGroups);
  const { candidates } = buildHierarchyTree(records);
  const seedNodeCount = countUniqueNodes(records.map((record) => record.taxon));

  const manifest = {
    generated_at: new Date().toISOString(),
    seed_data: path.relative(ROOT_DIR, SEED_DATA_PATH).replace(/\\/g, '/'),
    seed_meta: path.relative(ROOT_DIR, SEED_META_PATH).replace(/\\/g, '/'),
    benchmark_group_count: BENCHMARK_GROUP_COUNT,
    replicates_per_group: REPLICATES_PER_GROUP,
    sample_count: sampleSpecs.length,
    source_groups: sourceGroups,
    datasets: []
  };

  TARGET_NODE_COUNTS.forEach((targetNodeCount) => {
    const datasetId = `nodes_${String(targetNodeCount).padStart(5, '0')}`;
    let chosenIndices;
    let clonePlan = [];

    if (targetNodeCount < seedNodeCount) {
      const subset = chooseSubsetForTarget(records, targetNodeCount);
      chosenIndices = subset.chosenIndices;
    } else {
      chosenIndices = records.map((_, index) => index);
      clonePlan = chooseClonePlan(candidates, Math.max(targetNodeCount - seedNodeCount, 0));
    }

    const datasetRecords = materializeDatasetRecords(records, chosenIndices, clonePlan, sampleSpecs, datasetId);
    const taxa = datasetRecords.map((record) => record.taxon);
    const actualNodeCount = countUniqueNodes(taxa);
    const filterTaxa = buildFilterTaxa(taxa);
    const dataText = datasetToTsv(datasetRecords, sampleSpecs);
    const metaText = metaToTsv(sampleSpecs);
    const dataPath = path.join(GENERATED_DIR, `${datasetId}.data.tsv`);
    const metaPath = path.join(GENERATED_DIR, `${datasetId}.meta.tsv`);

    writeFile(dataPath, dataText);
    writeFile(metaPath, metaText);

    manifest.datasets.push({
      dataset_id: datasetId,
      target_node_count: targetNodeCount,
      node_count: actualNodeCount,
      row_count: datasetRecords.length,
      sample_count: sampleSpecs.length,
      filter_taxa_count: filterTaxa.length,
      data_file: path.relative(__dirname, dataPath).replace(/\\/g, '/'),
      meta_file: path.relative(__dirname, metaPath).replace(/\\/g, '/'),
      data_sha256: sha256(dataText),
      meta_sha256: sha256(metaText),
      filter_taxa: filterTaxa,
      clone_block_count: clonePlan.length,
      clone_blocks: clonePlan.map((candidate) => ({
        id: candidate.id,
        relative_node_count: candidate.relativeNodeCount,
        leaf_count: candidate.leafIndices.length
      }))
    });
  });

  const manifestPath = path.join(GENERATED_DIR, 'benchmark_manifest.json');
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Generated ${manifest.datasets.length} benchmark datasets in ${path.relative(ROOT_DIR, GENERATED_DIR)}`);
  manifest.datasets.forEach((dataset) => {
    console.log(
      `- ${dataset.dataset_id}: target=${dataset.target_node_count}, actual=${dataset.node_count}, leaves=${dataset.row_count}`
    );
  });
}

main();
