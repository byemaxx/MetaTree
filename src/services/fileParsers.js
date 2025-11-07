function parseStandardTable(lines) {
  const headers = lines[0].split('\t');
  const samples = headers.slice(1);
  let hasNegative = false;
  const data = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = lines[i].split('\t');
    if (!values.length) continue;
    const taxonPath = values[0];
    const abundances = {};
    samples.forEach((sample, idx) => {
      const value = parseFloat(values[idx + 1]);
      const num = Number.isFinite(value) ? value : 0;
      abundances[sample] = num;
      if (num < 0) {
        hasNegative = true;
      }
    });
    data.push({
      taxon: taxonPath,
      abundances
    });
  }

  return {
    type: 'wide',
    samples,
    rows: data,
    hasNegative,
    statsByTaxon: null
  };
}

function parseCombinedLong(lines) {
  const header = lines[0].split('\t').map(h => h.trim());
  const indexOf = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const idxItem = indexOf('item_id');
  const idxCond = indexOf('condition');
  const idxLFC = indexOf('log2foldchange');
  const idxPadj = indexOf('padj');
  const idxP = indexOf('pvalue');

  if (idxItem === -1 || idxCond === -1 || idxLFC === -1) {
    throw new Error('combined_long.tsv 缺少必要列：Item_ID / condition / log2FoldChange');
  }

  const byTaxon = new Map();
  const conditions = new Set();
  let hasNegative = false;

  for (let i = 1; i < lines.length; i += 1) {
    const values = lines[i].split('\t');
    if (!values.length) continue;
    const taxon = (values[idxItem] ?? '').trim();
    const condition = (values[idxCond] ?? '').trim();
    if (!taxon || !condition) continue;

    const lfcRaw = parseFloat(values[idxLFC]);
    const lfc = Number.isFinite(lfcRaw) ? lfcRaw : 0;
    if (lfc < 0) {
      hasNegative = true;
    }
    const padj = idxPadj >= 0 ? parseFloat(values[idxPadj]) : undefined;
    const pvalue = idxP >= 0 ? parseFloat(values[idxP]) : undefined;

    if (!byTaxon.has(taxon)) {
      byTaxon.set(taxon, { taxon, abundances: {}, stats: {} });
    }
    const record = byTaxon.get(taxon);
    record.abundances[condition] = lfc;
    record.stats[condition] = {
      value: lfc,
      qvalue: Number.isFinite(padj) ? padj : undefined,
      pvalue: Number.isFinite(pvalue) ? pvalue : undefined
    };
    conditions.add(condition);
  }

  return {
    type: 'combined-long',
    samples: Array.from(conditions),
    rows: Array.from(byTaxon.values()),
    hasNegative: hasNegative || true,
    statsByTaxon: (taxon) => (byTaxon.get(taxon)?.stats ?? null)
  };
}

export function parseAbundanceTable(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { type: 'empty', rows: [], samples: [], hasNegative: false };
  }
  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) {
    return { type: 'empty', rows: [], samples: [], hasNegative: false };
  }

  const header = lines[0].toLowerCase();
  const isCombined = header.includes('log2foldchange');
  return isCombined ? parseCombinedLong(lines) : parseStandardTable(lines);
}

export function parseMetaTable(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { columns: [], rows: [], bySample: {} };
  }
  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) {
    return { columns: [], rows: [], bySample: {} };
  }
  const headers = lines[0].split('\t').map(h => h.trim());
  const sampleIndex = headers.indexOf('Sample');
  if (sampleIndex === -1) {
    throw new Error('meta.tsv 必须包含 "Sample" 列');
  }

  const rows = [];
  const bySample = {};
  for (let i = 1; i < lines.length; i += 1) {
    const values = lines[i].split('\t');
    if (!values.length) continue;
    const row = {};
    headers.forEach((headerLabel, idx) => {
      row[headerLabel] = (values[idx] ?? '').trim();
    });
    const sample = row['Sample'];
    if (sample) {
      rows.push(row);
      bySample[sample] = row;
    }
  }

  return {
    columns: headers,
    rows,
    bySample
  };
}

export function detectTaxonFilter(patterns, mode, { useRegex, caseSensitive } = {}) {
  if (!patterns || patterns.length === 0 || mode === 'none') {
    return () => true;
  }
  const compiled = patterns.map((pattern) => {
    if (useRegex) {
      return new RegExp(pattern, caseSensitive ? '' : 'i');
    }
    const normalized = caseSensitive ? pattern : pattern.toLowerCase();
    return normalized;
  });
  return (taxon) => {
    const value = caseSensitive ? taxon : taxon.toLowerCase();
    const matches = compiled.some((pattern) => {
      if (pattern instanceof RegExp) {
        return pattern.test(taxon);
      }
      return value.includes(pattern);
    });
    return mode === 'include' ? matches : !matches;
  };
}

export function buildHierarchy(rows, samples, taxonFilter) {
  const root = {
    name: 'Root',
    children: [],
    abundances: {},
    isLeaf: false
  };

  const filter = typeof taxonFilter === 'function' ? taxonFilter : () => true;

  rows.forEach((item) => {
    const originalTaxon = String(item.taxon || '').trim();
    if (!filter(originalTaxon)) {
      return;
    }
    let taxonString = originalTaxon;
    let functionLabel = null;
    const sepIdx = taxonString.indexOf(' <');
    if (sepIdx >= 0) {
      const endIdx = taxonString.lastIndexOf('>');
      if (endIdx > sepIdx) {
        functionLabel = taxonString.slice(sepIdx + 2, endIdx).trim();
        taxonString = taxonString.slice(0, sepIdx).trim();
      }
    }

    const parts = taxonString
      .split('|')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    const rankMap = {
      d: 'domain',
      k: 'kingdom',
      p: 'phylum',
      c: 'class',
      o: 'order',
      f: 'family',
      g: 'genus',
      s: 'species',
      m: 'genome'
    };

    let current = root;
    parts.forEach((part, depth) => {
      const match = part.match(/^([a-z])__\s*/i);
      const rank = match ? rankMap[match[1].toLowerCase()] : undefined;
      const cleanName = part.replace(/^[a-z]__\s*/i, '');
      let child = current.children.find((node) => node.name === cleanName);
      if (!child) {
        child = {
          name: cleanName,
          fullName: part,
          rank,
          depth,
          children: [],
          abundances: {},
          isLeaf: false
        };
        current.children.push(child);
      }
      current.isLeaf = false;
      current = child;
    });

    const assignLeaf = (node) => {
      node.isLeaf = true;
      node.abundances = { ...item.abundances };
      if (item.stats) {
        node.stats = { ...item.stats };
      }
    };

    if (functionLabel) {
      let funcNode = current.children.find((node) => node.name === functionLabel && node.rank === 'function');
      if (!funcNode) {
        funcNode = {
          name: functionLabel,
          fullName: `<${functionLabel}>`,
          rank: 'function',
          depth: (current.depth || 0) + 1,
          children: [],
          abundances: {},
          isLeaf: true,
          isFunction: true
        };
        current.children.push(funcNode);
      }
      assignLeaf(funcNode);
    } else {
      assignLeaf(current);
    }
  });

  const propagateAbundance = (node) => {
    if (node.isLeaf) {
      return node.abundances;
    }
    node.abundances = node.abundances || {};
    samples.forEach((sample) => {
      node.abundances[sample] = 0;
    });
    node.children.forEach((child) => {
      const childAbundances = propagateAbundance(child);
      samples.forEach((sample) => {
        node.abundances[sample] += childAbundances[sample] || 0;
      });
    });
    return node.abundances;
  };

  propagateAbundance(root);
  return root;
}
