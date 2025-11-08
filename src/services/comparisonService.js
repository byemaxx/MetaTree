(function (global) {
    global.MetaTreeServices = global.MetaTreeServices || {};
    const stats = global.MetaTreeServices.statistics;
    if (!stats) {
        throw new Error('MetaTreeServices.statistics must be loaded before comparison service');
    }

    const d3lib = global.d3;
    if (!d3lib || typeof d3lib.hierarchy !== 'function') {
        throw new Error('D3 library is required for comparison service');
    }

    const DEFAULT_OPTIONS = {
        metric: 'log2_median_ratio',
        transform: 'none',
        minAbundance: 0,
        runTests: true,
        symmetricTransform: false,
        transformer: null
    };

    function normalizeOptions(options) {
        return { ...DEFAULT_OPTIONS, ...(options || {}) };
    }

    function createTransformFn(option, symmetric, custom) {
        if (typeof custom === 'function') {
            return custom;
        }
        const transform = option || 'none';
        if (transform === 'none') {
            return value => value;
        }
        if (symmetric) {
            return value => {
                if (!isFinite(value) || value === 0) return 0;
                const sign = Math.sign(value);
                const abs = Math.abs(value);
                switch (transform) {
                    case 'log':
                        return sign * Math.log10(abs + 1);
                    case 'log2':
                        return sign * Math.log2(abs + 1);
                    case 'sqrt':
                        return sign * Math.sqrt(abs);
                    case 'area':
                        return value;
                    default:
                        return value;
                }
            };
        }
        return value => {
            if (!isFinite(value) || value <= 0) return 0;
            switch (transform) {
                case 'log':
                    return Math.log10(value + 1);
                case 'log2':
                    return Math.log2(value + 1);
                case 'sqrt':
                    return Math.sqrt(value);
                case 'area':
                    return value;
                default:
                    return value;
            }
        };
    }

    function filterByMinAbundance(values, threshold) {
        if (!threshold || !isFinite(threshold) || threshold <= 0) {
            return values.slice();
        }
        return values.filter(v => v >= threshold);
    }

    function safelog2(numerator, denominator) {
        const ratio = (numerator + 1) / (denominator + 1);
        if (!isFinite(ratio) || ratio <= 0) return 0;
        const result = Math.log2(ratio);
        return isFinite(result) ? result : 0;
    }

    function calculateNodeStats(nodeData, samples1, samples2, transformFn, minAbundance, runTests) {
        const d3 = d3lib;
        let abundances1 = samples1.map(s => nodeData.abundances[s] || 0);
        let abundances2 = samples2.map(s => nodeData.abundances[s] || 0);

        if (transformFn) {
            abundances1 = abundances1.map(v => transformFn(v));
            abundances2 = abundances2.map(v => transformFn(v));
        }

        const filtered1 = filterByMinAbundance(abundances1, minAbundance);
        const filtered2 = filterByMinAbundance(abundances2, minAbundance);
        const belowThreshold = filtered1.length === 0 && filtered2.length === 0;

        const effective1 = belowThreshold ? [] : filtered1;
        const effective2 = belowThreshold ? [] : filtered2;

        const median1 = stats.median(effective1);
        const median2 = stats.median(effective2);
        const mean1 = (effective1.length > 0 ? d3.mean(effective1) : 0) || 0;
        const mean2 = (effective2.length > 0 ? d3.mean(effective2) : 0) || 0;

        let comparisonValue = 0;
        if (!belowThreshold) {
            comparisonValue = safelog2(median2, median1);
        }

        let pValue = 1.0;
        let significant = false;
        let effectSize = 0;

        if (!belowThreshold && runTests && effective1.length >= 2 && effective2.length >= 2) {
            pValue = stats.wilcoxonTest(effective1, effective2);
            effectSize = stats.cohensD(effective1, effective2, d3);
            significant = pValue < 0.05;
        }

        const log2MedianRatio = safelog2(median2, median1);
        const log2MeanRatio = safelog2(mean2, mean1);
        const foldChange = (median2 + 1) / (median1 + 1);
        const difference = median2 - median1;

        return {
            taxon_id: nodeData.name,
            log2_median_ratio: isFinite(log2MedianRatio) ? log2MedianRatio : 0,
            log2_mean_ratio: isFinite(log2MeanRatio) ? log2MeanRatio : 0,
            median_1: isFinite(median1) ? median1 : 0,
            median_2: isFinite(median2) ? median2 : 0,
            mean_1: isFinite(mean1) ? mean1 : 0,
            mean_2: isFinite(mean2) ? mean2 : 0,
            fold_change: isFinite(foldChange) ? foldChange : 1,
            difference: isFinite(difference) ? difference : 0,
            comparison_value: !belowThreshold && isFinite(comparisonValue) ? comparisonValue : 0,
            value: !belowThreshold && isFinite(comparisonValue) ? comparisonValue : 0,
            wilcox_p_value: isFinite(pValue) ? pValue : 1,
            pvalue: isFinite(pValue) ? pValue : 1,
            qvalue: 1,
            effect_size: isFinite(effectSize) ? effectSize : 0,
            significant,
            n_samples_1: samples1.length,
            n_samples_2: samples2.length,
            n_above_threshold_1: filtered1.length,
            n_above_threshold_2: filtered2.length,
            below_min_abundance: belowThreshold,
            min_abundance_applied: minAbundance > 0
        };
    }

    function applyMetricOverride(statsByNode, metric) {
        Object.values(statsByNode).forEach(stat => {
            switch (metric) {
                case 'log2_mean_ratio':
                    stat.comparison_value = stat.log2_mean_ratio;
                    stat.value = stat.log2_mean_ratio;
                    break;
                case 'fold_change':
                    stat.comparison_value = stat.fold_change;
                    stat.value = stat.fold_change;
                    break;
                case 'difference':
                    stat.comparison_value = stat.difference;
                    stat.value = stat.difference;
                    break;
                default:
                    stat.comparison_value = stat.log2_median_ratio;
                    stat.value = stat.log2_median_ratio;
            }
        });
        return statsByNode;
    }

    function calculatePairwiseComparison(treeData, samples1, samples2, options) {
        if (!treeData) return {};
        const normalized = normalizeOptions(options);
        const transformFn = createTransformFn(
            normalized.transform,
            normalized.symmetricTransform,
            normalized.transformer
        );

        const hierarchy = d3lib.hierarchy(treeData, d => d && d.__collapsed ? null : d.children);
        const statsByNode = {};

        hierarchy.each(node => {
            const nodeData = node.data;
            statsByNode[nodeData.name] = calculateNodeStats(
                nodeData,
                samples1,
                samples2,
                transformFn,
                normalized.minAbundance,
                normalized.runTests
            );
        });

        const withMetric = applyMetricOverride(statsByNode, normalized.metric);
        const withQValues = stats.benjaminiHochberg(withMetric);
        return withQValues;
    }

    function compareGroups(treeData, groups, options) {
        if (!treeData) return [];
        const groupNames = Object.keys(groups || {});
        const comparisons = [];

        for (let i = 0; i < groupNames.length; i++) {
            for (let j = i + 1; j < groupNames.length; j++) {
                const group1 = groupNames[i];
                const group2 = groupNames[j];
                const statsByNode = calculatePairwiseComparison(
                    treeData,
                    groups[group1] || [],
                    groups[group2] || [],
                    options
                );
                comparisons.push({
                    treatment_1: group1,
                    treatment_2: group2,
                    stats: statsByNode
                });
            }
        }

        return comparisons;
    }

    function createDivergingColorScale(domain, paletteName) {
        const palette = paletteName || 'blueRed';
        const domainValue = Array.isArray(domain) && domain.length ? domain : [-3, 0, 3];
        const palettes = {
            blueRed: ['#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'],
            blueWhiteRed: ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#ffffff', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'],
            greenPurple: ['#1b7837', '#5aae61', '#a6dba0', '#d9f0d3', '#f7f7f7', '#e7d4e8', '#c2a5cf', '#9970ab', '#762a83'],
            brownCyan: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e'],
            orangeBlue: ['#e66101', '#fdb863', '#fee0b6', '#f7f7f7', '#d8daeb', '#b2abd2', '#5e3c99'],
            redGray: ['#ca0020', '#f4a582', '#ffffff', '#bababa', '#404040'],
            coolWarm: ['#3b4cc0','#6788ee','#9bbcff','#ccd9ff','#f7f7f7','#fdc9b4','#f3976d','#d24b3a','#b40426'],
            seismic: ['#2b83ba','#74add1','#abd9e9','#e0f3f8','#f7f7f7','#fee090','#fdae61','#f46d43','#d73027'],
            RdBu: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#f7f7f7', '#92c5de', '#4393c3', '#2166ac', '#053061'],
            RdYlBu: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#ffffbf', '#abd9e9', '#74add1', '#4575b4', '#313695'],
            Spectral: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd'],
            PuOr: ['#7f3b08', '#b35806', '#f1a340', '#fee0b6', '#f7f7f7', '#d8daeb', '#998ec3', '#542788', '#2d004b'],
            PRGn: ['#40004b', '#762a83', '#9970ab', '#c2a5cf', '#f7f7f7', '#a6dba0', '#5aae61', '#1b7837'],
            BrBG: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#c7eae5', '#80cdc1', '#35978f', '#01665e'],
            PiYG: ['#8e0152', '#c51b7d', '#de77ae', '#f1b6da', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221']
        };

        const colors = palettes[palette] || palettes.blueRed;
        return d3lib.scaleDiverging()
            .domain(domainValue)
            .interpolator(d3lib.interpolateRgbBasis(colors));
    }

    function autoGroupBySamplePrefix(samples, separator) {
        const groups = {};
        (samples || []).forEach(sample => {
            const prefix = separator ? sample.split(separator)[0] : sample;
            if (!groups[prefix]) {
                groups[prefix] = [];
            }
            groups[prefix].push(sample);
        });
        Object.keys(groups).forEach(key => {
            if ((groups[key] || []).length < 2) {
                delete groups[key];
            }
        });
        return groups;
    }

    function autoGroupByMetaColumn(meta, column, options) {
        const opts = (typeof options === 'number') ? { minPerGroup: options } : (options || {});
        const minPerGroup = typeof opts.minPerGroup === 'number' ? opts.minPerGroup : 2;
        const availableSamples = Array.isArray(opts.availableSamples) ? new Set(opts.availableSamples) : null;
        const passesFilter = typeof opts.passesFilter === 'function' ? opts.passesFilter : (() => true);

        if (!meta || !Array.isArray(meta.rows)) {
            return {};
        }
        if (!column || column === 'Sample' || !Array.isArray(meta.columns) || !meta.columns.includes(column)) {
            return {};
        }

        const grouping = {};
        meta.rows.forEach(row => {
            const sample = row['Sample'];
            const key = (row[column] ?? '').trim();
            if (!sample || !key) return;
            if (availableSamples && !availableSamples.has(sample)) return;
            if (!passesFilter(sample)) return;
            if (!grouping[key]) grouping[key] = [];
            grouping[key].push(sample);
        });

        Object.keys(grouping).forEach(k => {
            if ((grouping[k] || []).length < minPerGroup) {
                delete grouping[k];
            }
        });

        const shouldPersist = opts.persist !== false;
        if (shouldPersist) {
            if (Object.keys(grouping).length > 0) {
                setGroupState(grouping);
            } else if (opts.clearOnEmpty) {
                clearAllGroups();
            }
        }

        return grouping;
    }

    function exportComparisonResults(comparisons, filename) {
        if (!comparisons || comparisons.length === 0) {
            console.warn('No comparison results to export');
            return;
        }

        let tsvContent = '';
        comparisons.forEach(comp => {
            const { treatment_1, treatment_2, stats: statsByNode } = comp;
            if (tsvContent === '') {
                tsvContent += 'treatment_1\ttreatment_2\ttaxon_id\t';
                tsvContent += 'log2_median_ratio\tlog2_mean_ratio\t';
                tsvContent += 'median_1\tmedian_2\tmean_1\tmean_2\t';
                tsvContent += 'fold_change\tdifference\t';
                tsvContent += 'wilcox_p_value\tFDR_q_value\teffect_size\tsignificant\t';
                tsvContent += 'n_samples_1\tn_samples_2\n';
            }

            Object.values(statsByNode).forEach(stat => {
                const safeFixed = (value, decimals) => {
                    return (value != null && isFinite(value)) ? Number(value).toFixed(decimals) : '0';
                };

                tsvContent += `${treatment_1}\t${treatment_2}\t${stat.taxon_id || 'unknown'}\t`;
                tsvContent += `${safeFixed(stat.log2_median_ratio, 4)}\t${safeFixed(stat.log2_mean_ratio, 4)}\t`;
                tsvContent += `${safeFixed(stat.median_1, 2)}\t${safeFixed(stat.median_2, 2)}\t`;
                tsvContent += `${safeFixed(stat.mean_1, 2)}\t${safeFixed(stat.mean_2, 2)}\t`;
                tsvContent += `${safeFixed(stat.fold_change, 4)}\t${safeFixed(stat.difference, 2)}\t`;
                tsvContent += `${safeFixed(stat.wilcox_p_value, 6)}\t${safeFixed(stat.qvalue, 6)}\t${safeFixed(stat.effect_size, 4)}\t`;
                tsvContent += `${stat.significant || false}\t${stat.n_samples_1 || 0}\t${stat.n_samples_2 || 0}\n`;
            });
        });

        const blob = new Blob([tsvContent], { type: 'text/tab-separated-values' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'comparison_results.tsv';
        link.click();
        URL.revokeObjectURL(url);
    }

    function getGroupState() {
        if (global.MetaTreeComparisonStore) {
            return global.MetaTreeComparisonStore.getGroups();
        }
        return global.groupDefinitions || {};
    }

    function setGroupState(groups) {
        if (global.MetaTreeComparisonStore) {
            global.MetaTreeComparisonStore.setGroups(groups);
        } else {
            global.groupDefinitions = groups;
        }
    }

    function defineGroup(groupName, sampleList) {
        if (!groupName || !Array.isArray(sampleList) || sampleList.length === 0) {
            console.warn('defineGroup: invalid input');
            return false;
        }
        const groups = { ...getGroupState(), [groupName]: sampleList.slice() };
        setGroupState(groups);
        return true;
    }

    function removeGroup(groupName) {
        if (!groupName) return false;
        const groups = { ...getGroupState() };
        if (!groups[groupName]) return false;
        delete groups[groupName];
        setGroupState(groups);
        return true;
    }

    function clearAllGroups() {
        setGroupState({});
    }

    function getAllGroups() {
        return { ...getGroupState() };
    }

    global.MetaTreeServices.comparison = {
        compareGroups,
        calculatePairwiseComparison,
        filterByMinAbundance,
        createDivergingColorScale,
        autoGroupBySamplePrefix,
        autoGroupByMetaColumn,
        exportComparisonResults,
        normalizeOptions,
        defineGroup,
        removeGroup,
        clearAllGroups,
        getAllGroups
    };
})(typeof window !== 'undefined' ? window : globalThis);
