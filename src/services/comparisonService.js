import * as d3 from 'd3';

export function summarizeNode(node, groupSamples) {
  const values = groupSamples.map((sample) => node.abundances?.[sample] ?? 0);
  const mean = d3.mean(values) ?? 0;
  const median = d3.median(values) ?? 0;
  return { mean, median };
}

export function compareGroups(tree, groupA, groupB) {
  const results = [];
  tree.each((node) => {
    if (!node.data || !node.data.abundances) {
      return;
    }
    const statsA = summarizeNode(node.data, groupA);
    const statsB = summarizeNode(node.data, groupB);
    const diff = statsA.mean - statsB.mean;
    const fold = statsB.mean !== 0 ? statsA.mean / statsB.mean : null;
    results.push({
      taxon: node.data.name || node.data.fullName,
      diff,
      fold,
      meanA: statsA.mean,
      meanB: statsB.mean,
      medianA: statsA.median,
      medianB: statsB.median
    });
  });
  return results;
}

export function collectSamplesByMeta(metaRows, column) {
  const groups = new Map();
  metaRows.forEach((row) => {
    const key = row[column];
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row.Sample);
  });
  return groups;
}
