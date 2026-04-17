(function initMetaTreeDataConverter(globalScope) {
    'use strict';

    function stripBom(text) {
        if (typeof text !== 'string') return '';
        return text.replace(/^\uFEFF/, '');
    }

    function getD3Api() {
        if (typeof globalScope !== 'undefined' && globalScope && globalScope.d3) {
            return globalScope.d3;
        }
        if (typeof d3 !== 'undefined') return d3;
        return null;
    }

    function ensureArray(value) {
        if (Array.isArray(value)) return value.slice();
        if (ArrayBuffer.isView(value)) return Array.from(value);
        if (value == null) return [];
        return [value];
    }

    function normalizeWhitespace(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function escapeDelimitedCell(value, delimiter) {
        const stringValue = value == null ? '' : String(value);
        if (/["\r\n]/.test(stringValue) || (delimiter && stringValue.includes(delimiter))) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    }

    function formatDelimitedText(headers, rows, delimiter) {
        const safeDelimiter = delimiter || '\t';
        const lineParts = [];
        lineParts.push(headers.map((header) => escapeDelimitedCell(header, safeDelimiter)).join(safeDelimiter));

        rows.forEach((row) => {
            const values = headers.map((header) => {
                if (row && Object.prototype.hasOwnProperty.call(row, header)) {
                    return escapeDelimitedCell(row[header], safeDelimiter);
                }
                return '';
            });
            lineParts.push(values.join(safeDelimiter));
        });

        return lineParts.join('\n');
    }

    function formatTsv(headers, rows) {
        return formatDelimitedText(headers, rows, '\t');
    }

    function detectDelimiterFromText(text, fallback) {
        const candidateFallback = fallback || '\t';
        const normalized = stripBom(text || '');
        const firstLine = normalized.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
        const candidates = ['\t', ',', ';'];
        let best = candidateFallback;
        let bestCount = -1;

        candidates.forEach((candidate) => {
            const parts = firstLine.split(candidate);
            const score = parts.length - 1;
            if (score > bestCount) {
                best = candidate;
                bestCount = score;
            }
        });

        return bestCount > 0 ? best : candidateFallback;
    }

    function parseDelimitedText(text, delimiter) {
        const rawText = stripBom(text);
        const effectiveDelimiter = delimiter || detectDelimiterFromText(rawText, '\t');
        const d3api = getD3Api();

        if (d3api && typeof d3api.dsvFormat === 'function') {
            try {
                const parser = d3api.dsvFormat(effectiveDelimiter);
                const rows = parser.parse(rawText.trim());
                const headers = Array.isArray(rows.columns)
                    ? rows.columns.map((header) => String(header).trim())
                    : (rows.length > 0 ? Object.keys(rows[0]).map((header) => String(header).trim()) : []);
                return {
                    delimiter: effectiveDelimiter,
                    headers,
                    rows
                };
            } catch (error) {
                // Fall back to a simpler parser below.
            }
        }

        const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0);
        if (lines.length === 0) {
            return { delimiter: effectiveDelimiter, headers: [], rows: [] };
        }

        const headers = lines[0].split(effectiveDelimiter).map((header) => header.trim());
        const rows = [];

        for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
            const cells = lines[lineIndex].split(effectiveDelimiter);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = cells[index] == null ? '' : cells[index];
            });
            rows.push(row);
        }

        return {
            delimiter: effectiveDelimiter,
            headers,
            rows
        };
    }

    function headerKey(value) {
        return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function findHeader(headers, acceptedKeys) {
        const accepted = new Set(acceptedKeys.map((key) => headerKey(key)));
        return headers.find((header) => accepted.has(headerKey(header))) || null;
    }

    function normalizeBiomTaxonomyEntry(rawValue) {
        if (rawValue == null) return [];
        const flattened = [];

        (function walk(value) {
            if (value == null) return;
            if (Array.isArray(value)) {
                value.forEach(walk);
                return;
            }
            if (ArrayBuffer.isView(value)) {
                Array.from(value).forEach(walk);
                return;
            }
            flattened.push(normalizeWhitespace(value));
        }(rawValue));

        if (flattened.length === 1) {
            const only = flattened[0];
            if (only.includes(';')) {
                return only.split(';').map((token) => normalizeWhitespace(token));
            }
            if (only.includes('|')) {
                return only.split('|').map((token) => normalizeWhitespace(token));
            }
        }

        return flattened;
    }

    function stripTaxonomyPrefix(token) {
        return normalizeWhitespace(token).replace(/^[A-Za-z](?:_\d+)?__\s*/i, '').trim();
    }

    function normalizeTaxonomyPath(rawValue) {
        const parts = normalizeBiomTaxonomyEntry(rawValue)
            .map((token) => normalizeWhitespace(token))
            .filter((token) => token.length > 0)
            .filter((token) => stripTaxonomyPrefix(token).length > 0);

        return parts.join('|');
    }

    function coerceNumeric(value) {
        const parsed = typeof value === 'number' ? value : parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function aggregateWideRows(rows, headers, method) {
        if (!Array.isArray(rows) || rows.length === 0 || method === 'none') {
            return Array.isArray(rows) ? rows.slice() : [];
        }

        const idColumn = headers[0];
        const valueColumns = headers.slice(1);
        const aggregated = new Map();
        const counts = new Map();

        rows.forEach((row) => {
            const identifier = normalizeWhitespace(row[idColumn]);
            if (!identifier) return;

            if (!aggregated.has(identifier)) {
                const nextRow = { ...row, [idColumn]: identifier };
                valueColumns.forEach((column) => {
                    nextRow[column] = coerceNumeric(nextRow[column]);
                });
                aggregated.set(identifier, nextRow);
                if (method === 'mean') {
                    const columnCounts = {};
                    valueColumns.forEach((column) => {
                        columnCounts[column] = 1;
                    });
                    counts.set(identifier, columnCounts);
                }
                return;
            }

            if (method === 'first') return;

            const existing = aggregated.get(identifier);
            const columnCounts = method === 'mean' ? counts.get(identifier) : null;

            valueColumns.forEach((column) => {
                const incoming = coerceNumeric(row[column]);
                const current = coerceNumeric(existing[column]);

                if (method === 'sum' || method === 'mean') {
                    existing[column] = current + incoming;
                    if (columnCounts) columnCounts[column] += 1;
                    return;
                }
                if (method === 'max') {
                    existing[column] = Math.max(current, incoming);
                    return;
                }
                if (method === 'min') {
                    existing[column] = Math.min(current, incoming);
                }
            });
        });

        if (method === 'mean') {
            aggregated.forEach((row, identifier) => {
                const columnCounts = counts.get(identifier) || {};
                valueColumns.forEach((column) => {
                    const divisor = columnCounts[column] || 1;
                    row[column] = coerceNumeric(row[column]) / divisor;
                });
            });
        }

        return Array.from(aggregated.values());
    }

    function rowsToWideTsv(sampleIds, rowEntries, duplicateHandling) {
        const headers = ['Taxon', ...sampleIds];
        const rows = rowEntries.map((entry) => {
            const row = { Taxon: entry.path };
            sampleIds.forEach((sampleId, sampleIndex) => {
                row[sampleId] = coerceNumeric(entry.values[sampleIndex]);
            });
            return row;
        });
        const aggregated = aggregateWideRows(rows, headers, duplicateHandling || 'sum');
        return {
            headers,
            rows: aggregated,
            tsv: formatTsv(headers, aggregated)
        };
    }

    function readBiomV1Matrix(biom, rowCount, columnCount) {
        if (!Array.isArray(biom.data)) {
            throw new Error('BIOM v1 payload is missing the matrix data.');
        }

        if (biom.matrix_type === 'dense') {
            return biom.data.map((row) => {
                const values = ensureArray(row).map(coerceNumeric);
                if (values.length !== columnCount) {
                    const padded = new Array(columnCount).fill(0);
                    values.slice(0, columnCount).forEach((value, index) => {
                        padded[index] = value;
                    });
                    return padded;
                }
                return values;
            });
        }

        if (biom.matrix_type === 'sparse') {
            const matrix = Array.from({ length: rowCount }, () => new Array(columnCount).fill(0));
            biom.data.forEach((entry) => {
                const triple = ensureArray(entry);
                if (triple.length < 3) return;
                const rowIndex = Number(triple[0]);
                const columnIndex = Number(triple[1]);
                if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
                if (rowIndex < 0 || rowIndex >= rowCount || columnIndex < 0 || columnIndex >= columnCount) return;
                matrix[rowIndex][columnIndex] = coerceNumeric(triple[2]);
            });
            return matrix;
        }

        throw new Error(`Unsupported BIOM v1 matrix type: ${String(biom.matrix_type || 'unknown')}`);
    }

    function convertBiomV1Text(text, options) {
        const conversionOptions = options || {};
        let biom;
        try {
            biom = JSON.parse(stripBom(text));
        } catch (error) {
            throw new Error('Failed to parse BIOM v1 JSON.');
        }

        if (!Array.isArray(biom.rows) || !Array.isArray(biom.columns)) {
            throw new Error('Invalid BIOM v1 JSON: rows or columns are missing.');
        }

        const sampleIds = biom.columns.map((column, index) => {
            const id = column && column.id != null ? normalizeWhitespace(column.id) : '';
            return id || `Sample_${index + 1}`;
        });
        const rowIds = biom.rows.map((row, index) => {
            const id = row && row.id != null ? normalizeWhitespace(row.id) : '';
            return id || `Feature_${index + 1}`;
        });
        const matrix = readBiomV1Matrix(biom, rowIds.length, sampleIds.length);
        const warnings = [];

        const rowEntries = rowIds.map((rowId, rowIndex) => {
            const rowMeta = biom.rows[rowIndex] && biom.rows[rowIndex].metadata ? biom.rows[rowIndex].metadata : null;
            const taxonomyCandidate = rowMeta && (
                rowMeta.taxonomy
                || rowMeta.Taxon
                || rowMeta.taxon
                || rowMeta.ConsensusLineage
                || rowMeta.lineage
            );
            const taxonomyPath = normalizeTaxonomyPath(taxonomyCandidate);
            if (!taxonomyPath) {
                warnings.push(`Row "${rowId}" is missing taxonomy metadata; the row id was used as the path.`);
            }
            return {
                path: taxonomyPath || rowId,
                values: matrix[rowIndex]
            };
        });

        const wideTable = rowsToWideTsv(sampleIds, rowEntries, conversionOptions.duplicateHandling || 'sum');
        return {
            dataTsv: wideTable.tsv,
            warnings,
            dataFilename: conversionOptions.dataFilename || 'converted-biom-v1.tsv',
            summary: {
                rowCount: wideTable.rows.length,
                sampleCount: sampleIds.length
            }
        };
    }

    function getHdf5Api() {
        if (typeof globalScope !== 'undefined' && globalScope && globalScope.hdf5) {
            return globalScope.hdf5;
        }
        if (typeof hdf5 !== 'undefined') return hdf5;
        return null;
    }

    function tryGetGroup(group, path) {
        try {
            return group.get(path);
        } catch (error) {
            return null;
        }
    }

    function convertObservationMatrixToRows(rowIds, sampleIds, data, indices, indptr) {
        const matrix = Array.from({ length: rowIds.length }, () => new Array(sampleIds.length).fill(0));
        const valueArray = ensureArray(data);
        const indexArray = ensureArray(indices);
        const pointerArray = ensureArray(indptr);

        rowIds.forEach((unused, rowIndex) => {
            const start = Number(pointerArray[rowIndex] || 0);
            const end = Number(pointerArray[rowIndex + 1] || start);
            for (let pointer = start; pointer < end; pointer += 1) {
                const columnIndex = Number(indexArray[pointer]);
                if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= sampleIds.length) continue;
                matrix[rowIndex][columnIndex] = coerceNumeric(valueArray[pointer]);
            }
        });

        return matrix;
    }

    function parseBiomV2Buffer(arrayBuffer) {
        const hdf5Api = getHdf5Api();
        if (!hdf5Api || typeof hdf5Api.File !== 'function') {
            throw new Error('The BIOM v2 reader is unavailable.');
        }

        const file = new hdf5Api.File(arrayBuffer, 'feature-table.biom');
        const observationIds = ensureArray(file.get('observation/ids').value).map((value) => normalizeWhitespace(value));
        const sampleIds = ensureArray(file.get('sample/ids').value).map((value) => normalizeWhitespace(value));
        const matrixData = file.get('observation/matrix/data').value;
        const matrixIndices = file.get('observation/matrix/indices').value;
        const matrixIndptr = file.get('observation/matrix/indptr').value;
        const matrix = convertObservationMatrixToRows(observationIds, sampleIds, matrixData, matrixIndices, matrixIndptr);
        const observationMetadataGroup = tryGetGroup(file, 'observation/metadata');
        const taxonomyDataset = observationMetadataGroup && Array.isArray(observationMetadataGroup.keys) && observationMetadataGroup.keys.includes('taxonomy')
            ? tryGetGroup(observationMetadataGroup, 'taxonomy')
            : null;
        const taxonomyValues = taxonomyDataset ? ensureArray(taxonomyDataset.value) : [];

        return {
            observationIds,
            sampleIds,
            matrix,
            taxonomyValues
        };
    }

    function parseQiimeTaxonomyTsv(text) {
        const lines = stripBom(text)
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0)
            .filter((line) => !line.trim().startsWith('#q2:'));

        if (lines.length < 2) {
            throw new Error('The taxonomy file is empty or missing data rows.');
        }

        const delimiter = detectDelimiterFromText(lines.join('\n'), '\t');
        const parsed = parseDelimitedText(lines.join('\n'), delimiter);
        const idHeader = findHeader(parsed.headers, [
            'Feature ID', 'FeatureID', 'featureid', '#OTUID', '#OTU ID', 'id'
        ]);
        const taxonHeader = findHeader(parsed.headers, ['Taxon', 'taxon']);
        const confidenceHeader = findHeader(parsed.headers, ['Confidence', 'confidence']);

        if (!idHeader || !taxonHeader) {
            throw new Error('The taxonomy file must include a feature id column and a Taxon column.');
        }

        const taxonomyByFeatureId = new Map();

        parsed.rows.forEach((row) => {
            const featureId = normalizeWhitespace(row[idHeader]);
            if (!featureId) return;
            const taxonValue = normalizeWhitespace(row[taxonHeader]);
            const taxonomyPath = normalizeTaxonomyPath(taxonValue);
            taxonomyByFeatureId.set(featureId, {
                featureId,
                taxon: taxonValue,
                path: taxonomyPath,
                confidence: confidenceHeader ? normalizeWhitespace(row[confidenceHeader]) : ''
            });
        });

        return {
            taxonomyByFeatureId,
            entryCount: taxonomyByFeatureId.size
        };
    }

    function normalizeQiimeSampleMetadata(text) {
        const acceptedIdHeaders = [
            'id', 'sampleid', 'sample id', 'sample-id', 'featureid', 'feature id', 'feature-id',
            '#SampleID', '#Sample ID', '#OTUID', '#OTU ID', 'sample_name'
        ];
        const allLines = stripBom(text)
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0);

        const headerLine = allLines.find((line) => !line.trim().startsWith('#q2:'));
        if (!headerLine) {
            throw new Error('The sample metadata file is missing a header row.');
        }

        const delimiter = detectDelimiterFromText(headerLine, '\t');
        const dataLines = [];
        let headerCaptured = false;

        allLines.forEach((line) => {
            const trimmed = line.trim();
            if (trimmed.length === 0) return;
            if (!headerCaptured && trimmed === headerLine.trim()) {
                dataLines.push(line);
                headerCaptured = true;
                return;
            }
            if (trimmed.startsWith('#q2:')) return;
            if (trimmed.startsWith('#')) return;
            dataLines.push(line);
        });

        const parsed = parseDelimitedText(dataLines.join('\n'), delimiter);
        const idHeader = findHeader(parsed.headers, acceptedIdHeaders);
        if (!idHeader) {
            throw new Error('The sample metadata file is missing a recognized ID column.');
        }

        const headers = ['Sample', ...parsed.headers.filter((header) => header !== idHeader)];
        const rows = [];

        parsed.rows.forEach((row) => {
            const sampleId = normalizeWhitespace(row[idHeader]);
            if (!sampleId) return;
            const normalizedRow = { Sample: sampleId };
            headers.slice(1).forEach((header) => {
                normalizedRow[header] = row[header] == null ? '' : String(row[header]).trim();
            });
            rows.push(normalizedRow);
        });

        return {
            headers,
            rows,
            metaTsv: formatTsv(headers, rows)
        };
    }

    function readWideTable(text, duplicateHandling) {
        const parsed = parseDelimitedText(text, detectDelimiterFromText(text, '\t'));
        if (parsed.headers.length < 2) {
            throw new Error('The abundance table must contain one ID column and at least one numeric sample column.');
        }

        const identifierHeader = parsed.headers[0];
        const sampleIds = parsed.headers.slice(1).map((header) => normalizeWhitespace(header));
        const normalizedRows = parsed.rows.map((row) => {
            const nextRow = {};
            parsed.headers.forEach((header) => {
                nextRow[header] = row[header];
            });
            nextRow[identifierHeader] = normalizeWhitespace(nextRow[identifierHeader]);
            sampleIds.forEach((sampleId, index) => {
                const header = parsed.headers[index + 1];
                nextRow[header] = coerceNumeric(nextRow[header]);
            });
            return nextRow;
        });

        const aggregated = aggregateWideRows(normalizedRows, parsed.headers, duplicateHandling || 'sum');
        const valuesById = new Map();
        aggregated.forEach((row) => {
            const identifier = normalizeWhitespace(row[identifierHeader]);
            if (!identifier) return;
            valuesById.set(identifier, sampleIds.map((sampleId, index) => {
                const header = parsed.headers[index + 1];
                return coerceNumeric(row[header]);
            }));
        });

        return {
            identifierHeader,
            sampleIds,
            valuesById
        };
    }

    function parseNewick(text) {
        const source = stripBom(text).trim();
        let cursor = 0;

        function fail(message) {
            throw new Error(`Invalid Newick: ${message}`);
        }

        function skipIgnored() {
            while (cursor < source.length) {
                const current = source[cursor];
                if (/\s/.test(current)) {
                    cursor += 1;
                    continue;
                }
                if (current === '[') {
                    cursor += 1;
                    while (cursor < source.length && source[cursor] !== ']') {
                        cursor += 1;
                    }
                    if (source[cursor] === ']') cursor += 1;
                    continue;
                }
                break;
            }
        }

        function readQuotedLabel() {
            cursor += 1;
            let label = '';
            while (cursor < source.length) {
                const current = source[cursor];
                if (current === "'") {
                    if (source[cursor + 1] === "'") {
                        label += "'";
                        cursor += 2;
                        continue;
                    }
                    cursor += 1;
                    break;
                }
                label += current;
                cursor += 1;
            }
            return normalizeWhitespace(label);
        }

        function readLabel() {
            skipIgnored();
            if (source[cursor] === "'") {
                return readQuotedLabel();
            }
            let label = '';
            while (cursor < source.length) {
                const current = source[cursor];
                if (current === ':' || current === ',' || current === '(' || current === ')' || current === ';' || current === '[') {
                    break;
                }
                label += current;
                cursor += 1;
            }
            return normalizeWhitespace(label);
        }

        function readBranchLength() {
            skipIgnored();
            if (source[cursor] !== ':') return null;
            cursor += 1;
            skipIgnored();
            let value = '';
            while (cursor < source.length) {
                const current = source[cursor];
                if (current === ',' || current === ')' || current === ';' || current === '[') {
                    break;
                }
                value += current;
                cursor += 1;
            }
            return normalizeWhitespace(value);
        }

        function parseSubtree() {
            skipIgnored();
            if (cursor >= source.length) fail('unexpected end of input');

            const node = {
                name: '',
                children: [],
                branchLength: null
            };

            if (source[cursor] === '(') {
                cursor += 1;
                while (true) {
                    node.children.push(parseSubtree());
                    skipIgnored();
                    if (source[cursor] === ',') {
                        cursor += 1;
                        continue;
                    }
                    break;
                }
                if (source[cursor] !== ')') fail('missing closing parenthesis');
                cursor += 1;
                node.name = readLabel();
                node.branchLength = readBranchLength();
                return node;
            }

            node.name = readLabel();
            if (!node.name) {
                fail('unnamed leaf nodes are not supported');
            }
            node.branchLength = readBranchLength();
            return node;
        }

        const root = parseSubtree();
        skipIgnored();
        if (source[cursor] === ';') {
            cursor += 1;
        }
        skipIgnored();
        if (cursor < source.length) {
            fail(`unexpected trailing content near position ${cursor}`);
        }
        return root;
    }

    function assignUnnamedInternalNodes(root) {
        const counter = { value: 1 };

        function visit(node, isRoot) {
            if (!node || !Array.isArray(node.children) || node.children.length === 0) return;
            if (!isRoot && !normalizeWhitespace(node.name)) {
                node.name = `Clade_${String(counter.value).padStart(4, '0')}`;
                counter.value += 1;
            }
            node.children.forEach((child) => visit(child, false));
        }

        visit(root, true);
    }

    function buildTreeTipPathMap(root) {
        const tipPathMap = new Map();

        function visit(node, ancestorPath, isRoot) {
            const hasChildren = Array.isArray(node.children) && node.children.length > 0;
            const nextAncestorPath = (!isRoot && hasChildren && normalizeWhitespace(node.name))
                ? ancestorPath.concat(node.name)
                : ancestorPath;

            if (!hasChildren) {
                const tipName = normalizeWhitespace(node.name);
                if (!tipName) {
                    throw new Error('Unnamed leaf nodes are not supported.');
                }
                if (tipPathMap.has(tipName)) {
                    throw new Error(`Duplicate tip name "${tipName}" is not supported.`);
                }
                tipPathMap.set(tipName, nextAncestorPath.concat(tipName));
                return;
            }

            node.children.forEach((child) => visit(child, nextAncestorPath, false));
        }

        visit(root, [], true);
        return tipPathMap;
    }

    function getMissingTreeTipIds(tipPathMap, valuesByTip) {
        const missingTipIds = [];
        tipPathMap.forEach((unusedPathParts, tipName) => {
            if (!valuesByTip.has(tipName)) {
                missingTipIds.push(tipName);
            }
        });
        return missingTipIds;
    }

    function buildTreeRowsFromTipPaths(tipPathMap, valuesByTip) {
        const rowEntries = [];
        tipPathMap.forEach((pathParts, tipName) => {
            rowEntries.push({
                path: pathParts.join('|'),
                values: valuesByTip.get(tipName)
            });
        });
        return rowEntries;
    }

    function convertNewickBundle(bundle, options) {
        const input = bundle || {};
        const conversionOptions = options || {};
        if (!input.treeText) {
            throw new Error('A Newick tree file is required.');
        }
        if (!input.abundanceText) {
            throw new Error('A sidecar abundance table is required for Newick conversion.');
        }

        const parsedTree = parseNewick(input.treeText);
        assignUnnamedInternalNodes(parsedTree);
        const tipPathMap = buildTreeTipPathMap(parsedTree);
        const parsedTable = readWideTable(input.abundanceText, conversionOptions.duplicateHandling || 'sum');
        const warnings = [];

        const extraIds = Array.from(parsedTable.valuesById.keys()).filter((tipId) => !tipPathMap.has(tipId));
        if (extraIds.length > 0) {
            throw new Error(`The abundance table contains IDs that are not present in the tree: ${extraIds.slice(0, 10).join(', ')}`);
        }

        const missingTipIds = getMissingTreeTipIds(tipPathMap, parsedTable.valuesById);
        if (missingTipIds.length > 0) {
            throw new Error(`The tree contains tip IDs that are missing from the abundance table: ${missingTipIds.slice(0, 10).join(', ')}`);
        }

        const rowEntries = buildTreeRowsFromTipPaths(tipPathMap, parsedTable.valuesById);
        const wideTable = rowsToWideTsv(parsedTable.sampleIds, rowEntries, 'first');

        return {
            dataTsv: wideTable.tsv,
            warnings,
            dataFilename: conversionOptions.dataFilename || 'converted-newick.tsv',
            summary: {
                rowCount: wideTable.rows.length,
                sampleCount: parsedTable.sampleIds.length
            }
        };
    }

    function convertQiimeBundle(bundle, options) {
        const input = bundle || {};
        const conversionOptions = options || {};
        if (!(input.featureTableArrayBuffer instanceof ArrayBuffer)) {
            throw new Error('QIIME conversion requires a feature-table.biom file.');
        }

        const parsedBiom = parseBiomV2Buffer(input.featureTableArrayBuffer);
        const warnings = [];
        const duplicateHandling = conversionOptions.duplicateHandling || 'sum';
        let metaTsv = null;
        let metaFilename = null;

        if (typeof input.sampleMetadataText === 'string' && input.sampleMetadataText.trim().length > 0) {
            const normalizedMeta = normalizeQiimeSampleMetadata(input.sampleMetadataText);
            metaTsv = normalizedMeta.metaTsv;
            metaFilename = conversionOptions.metaFilename || 'converted-qiime-metadata.tsv';
        }

        const taxonomyInfo = (typeof input.taxonomyText === 'string' && input.taxonomyText.trim().length > 0)
            ? parseQiimeTaxonomyTsv(input.taxonomyText)
            : null;
        const tipPathMap = (typeof input.treeText === 'string' && input.treeText.trim().length > 0)
            ? (function createTipPathMap() {
                const root = parseNewick(input.treeText);
                assignUnnamedInternalNodes(root);
                return buildTreeTipPathMap(root);
            }())
            : null;

        let rowEntries;

        if (tipPathMap) {
            const valuesByFeature = new Map();
            parsedBiom.observationIds.forEach((featureId, featureIndex) => {
                valuesByFeature.set(featureId, parsedBiom.matrix[featureIndex]);
            });

            const extraFeatures = Array.from(valuesByFeature.keys()).filter((featureId) => !tipPathMap.has(featureId));
            if (extraFeatures.length > 0) {
                throw new Error(`The BIOM table contains feature IDs that are not present in the tree: ${extraFeatures.slice(0, 10).join(', ')}`);
            }

            const missingTipIds = getMissingTreeTipIds(tipPathMap, valuesByFeature);
            if (missingTipIds.length > 0) {
                throw new Error(`The tree contains tip IDs that are missing from the BIOM table: ${missingTipIds.slice(0, 10).join(', ')}`);
            }

            rowEntries = buildTreeRowsFromTipPaths(tipPathMap, valuesByFeature);

            if (taxonomyInfo) {
                const taxonomyCoverage = parsedBiom.observationIds.filter((featureId) => taxonomyInfo.taxonomyByFeatureId.has(featureId)).length;
                if (taxonomyCoverage < parsedBiom.observationIds.length) {
                    warnings.push(`Taxonomy annotations were missing for ${parsedBiom.observationIds.length - taxonomyCoverage} feature IDs. Tree topology was still used as the output hierarchy.`);
                }
            }
        } else if (taxonomyInfo) {
            rowEntries = parsedBiom.observationIds.map((featureId, featureIndex) => {
                const taxonomyEntry = taxonomyInfo.taxonomyByFeatureId.get(featureId);
                if (!taxonomyEntry || !taxonomyEntry.path) {
                    warnings.push(`Feature "${featureId}" was missing taxonomy and was kept as its own leaf.`);
                }
                return {
                    path: (taxonomyEntry && taxonomyEntry.path) || featureId,
                    values: parsedBiom.matrix[featureIndex]
                };
            });
        } else {
            rowEntries = parsedBiom.observationIds.map((featureId, featureIndex) => ({
                path: featureId,
                values: parsedBiom.matrix[featureIndex]
            }));
        }

        const wideTable = rowsToWideTsv(
            parsedBiom.sampleIds,
            rowEntries,
            tipPathMap ? 'first' : duplicateHandling
        );

        return {
            dataTsv: wideTable.tsv,
            metaTsv,
            warnings,
            dataFilename: conversionOptions.dataFilename || 'converted-qiime-data.tsv',
            metaFilename,
            summary: {
                rowCount: wideTable.rows.length,
                sampleCount: parsedBiom.sampleIds.length,
                metaIncluded: !!metaTsv
            }
        };
    }

    const api = {
        detectDelimiterFromText,
        convertBiomV1Text,
        convertNewickBundle,
        convertQiimeBundle,
        normalizeQiimeSampleMetadata,
        parseQiimeTaxonomyTsv,
        parseBiomV2Buffer
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (globalScope && typeof globalScope === 'object') {
        globalScope.__metaTreeDataConverter = api;
    }
}(typeof window !== 'undefined' ? window : globalThis));
