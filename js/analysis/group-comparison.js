/**
 * 宏基因组层级分类结构可视化平台 - 组间比较模块
 * 类似于 Metacoder 的 compare_groups 和 heat_tree_matrix
 * Version: 1.0
 */

// ========== 全局变量 ==========
let groupDefinitions = {}; // {groupName: [sample1, sample2, ...]}
let comparisonResults = null;

// ========== 统计函数 ==========

/**
 * 计算中位数
 */
function median(values) {
    if (!values || values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

/**
 * Wilcoxon 秩和检验 (Mann-Whitney U test)
 * 提供对小样本的精确计算，并在大样本时使用带连续性与 ties 校正的正态近似
 */
function wilcoxonTest(group1, group2) {
    const g1 = group1.filter(v => v != null && isFinite(v));
    const g2 = group2.filter(v => v != null && isFinite(v));

    if (g1.length === 0 || g2.length === 0) return 1.0;

    const n1 = g1.length;
    const n2 = g2.length;
    const totalPairs = n1 * n2;
    if (totalPairs === 0) return 1.0;

    const observedU = mannWhitneyU(g1, g2);
    const minObservedU = Math.min(observedU, totalPairs - observedU);

    if (n1 + n2 <= 12) {
        const exactP = exactMannWhitneyPValue(g1, g2, minObservedU);
        if (isFinite(exactP)) {
            return clampPValue(exactP);
        }
    }

    const { tieSum } = rankCombinedSamples(g1, g2);

    const mu = totalPairs / 2;
    const correction = tieSum / ((n1 + n2) * (n1 + n2 - 1));
    const variance = (n1 * n2 / 12) * ((n1 + n2 + 1) - correction);
    if (variance <= 0) return 1.0;

    const sigma = Math.sqrt(variance);
    const diff = observedU - mu;
    const z = (diff - 0.5 * Math.sign(diff || 1)) / sigma;
    const p = 2 * (1 - normalCDF(Math.abs(z)));

    return clampPValue(p);
}

function clampPValue(p) {
    if (!isFinite(p) || p <= 0) return 1e-12;
    if (p >= 1) return 1;
    return p;
}

function rankCombinedSamples(group1, group2) {
    const combined = group1.map(value => ({ value, group: 1 }))
        .concat(group2.map(value => ({ value, group: 2 })))
        .sort((a, b) => a.value - b.value);

    let rank = 1;
    let tieSum = 0;
    for (let i = 0; i < combined.length; i++) {
        let j = i + 1;
        while (j < combined.length && combined[j].value === combined[i].value) {
            j++;
        }
        const count = j - i;
        const avgRank = rank + (count - 1) / 2;
        for (let k = i; k < j; k++) {
            combined[k].rank = avgRank;
        }
        if (count > 1) {
            tieSum += Math.pow(count, 3) - count;
        }
        rank += count;
        i = j - 1;
    }

    return { combined, tieSum };
}

function mannWhitneyU(group1, group2) {
    let U = 0;
    for (let i = 0; i < group1.length; i++) {
        const v1 = group1[i];
        for (let j = 0; j < group2.length; j++) {
            const v2 = group2[j];
            if (v1 < v2) {
                U += 1;
            } else if (v1 === v2) {
                U += 0.5;
            }
        }
    }
    return U;
}

function exactMannWhitneyPValue(group1, group2, observedMinU) {
    const values = group1.concat(group2);
    const n1 = group1.length;
    const n = values.length;
    const mask = new Array(n).fill(false);
    let total = 0;
    let extremeCount = 0;

    function backtrack(start, depth) {
        if (depth === n1) {
            const g1 = [];
            const g2 = [];
            for (let idx = 0; idx < n; idx++) {
                if (mask[idx]) g1.push(values[idx]);
                else g2.push(values[idx]);
            }
            const U = mannWhitneyU(g1, g2);
            const totalPairs = g1.length * g2.length;
            const minU = Math.min(U, totalPairs - U);
            total++;
            if (minU <= observedMinU + 1e-9) {
                extremeCount++;
            }
            return;
        }

        for (let i = start; i <= n - (n1 - depth); i++) {
            mask[i] = true;
            backtrack(i + 1, depth + 1);
            mask[i] = false;
        }
    }

    backtrack(0, 0);
    if (total === 0) return NaN;

    const probability = extremeCount / total;
    return Math.max(0, Math.min(1, probability));
}

/**
 * 标准正态分布累积分布函数 (CDF)
 */
function normalCDF(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x) {
    // Abramowitz and Stegun approximation (7.1.26)
    const sign = Math.sign(x) || 1;
    const absX = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * absX);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
    const approx = 1 - poly * Math.exp(-absX * absX);
    return sign * approx;
}

/**
 * 计算效应大小 (Cohen's d)
 */
function cohensD(group1, group2) {
    const g1 = group1.filter(v => v != null && isFinite(v));
    const g2 = group2.filter(v => v != null && isFinite(v));
    
    if (g1.length === 0 || g2.length === 0) return 0;
    
    const mean1 = d3.mean(g1) || 0;
    const mean2 = d3.mean(g2) || 0;
    const variance1 = d3.variance(g1) || 0;
    const variance2 = d3.variance(g2) || 0;
    
    // 确保分母不为零
    const denominator = g1.length + g2.length - 2;
    if (denominator <= 0) return 0;
    
    const pooledSD = Math.sqrt(((g1.length - 1) * variance1 + (g2.length - 1) * variance2) / denominator);
    
    if (pooledSD === 0 || !isFinite(pooledSD)) return 0;
    
    const cohensD = (mean2 - mean1) / pooledSD;
    return isFinite(cohensD) ? cohensD : 0;
}

// ========== 组间比较核心功能 ==========

/**
 * 比较所有分组 - 类似 Metacoder 的 compare_groups
 * @param {Object} treeData - 层级树数据
 * @param {Object} groups - 分组定义 {groupName: [samples]}
 * @param {Object} options - 选项
 * @returns {Array} 比较结果数组
 */
function compareGroups(treeData, groups, options = {}) {
    const {
        metric = 'log2_median_ratio',  // 比较指标
        transform = 'none',             // 数据转换
        minAbundance = 0,               // 最小丰度过滤
        runTests = true                 // 是否运行显著性检验
    } = options;
    
    const groupNames = Object.keys(groups);
    const comparisons = [];
    
    // 生成所有两两组合
    for (let i = 0; i < groupNames.length; i++) {
        for (let j = i + 1; j < groupNames.length; j++) {
            const group1 = groupNames[i];
            const group2 = groupNames[j];
            
            const result = calculatePairwiseComparison(
                treeData,
                groups[group1],
                groups[group2],
                { metric, transform, minAbundance, runTests }
            );
            
            comparisons.push({
                treatment_1: group1,
                treatment_2: group2,
                stats: result
            });
        }
    }
    
    return comparisons;
}

/**
 * 计算两组之间的统计差异
 */
function filterByMinAbundance(values, threshold) {
    if (!threshold || !isFinite(threshold) || threshold <= 0) {
        return values.slice();
    }
    return values.filter(v => v >= threshold);
}

function calculatePairwiseComparison(treeData, samples1, samples2, options) {
    const { metric, transform, minAbundance, runTests } = options;

    // 创建层级结构
    const hierarchy = d3.hierarchy(treeData, d => d.__collapsed ? null : d.children);
    let stats = {};

    hierarchy.each(node => {
        const nodeData = node.data;

        // 获取两组的丰度值
        let abundances1 = samples1.map(s => nodeData.abundances[s] || 0);
        let abundances2 = samples2.map(s => nodeData.abundances[s] || 0);

        // 应用转换
        if (transform !== 'none') {
            abundances1 = abundances1.map(v => transformAbundance(v));
            abundances2 = abundances2.map(v => transformAbundance(v));
        }

        const filtered1 = filterByMinAbundance(abundances1, minAbundance);
        const filtered2 = filterByMinAbundance(abundances2, minAbundance);
        const belowThreshold = filtered1.length === 0 && filtered2.length === 0;

        const effective1 = belowThreshold ? [] : filtered1;
        const effective2 = belowThreshold ? [] : filtered2;

        // 计算基本统计量
        const median1 = median(effective1);
        const median2 = median(effective2);
        const mean1 = (effective1.length > 0 ? d3.mean(effective1) : 0) || 0;
        const mean2 = (effective2.length > 0 ? d3.mean(effective2) : 0) || 0;

        // 计算比较指标（确保数值有效）
        let comparisonValue = 0;

        // 辅助函数：安全的 log2 计算
        const safelog2 = (numerator, denominator) => {
            const ratio = (numerator + 1) / (denominator + 1);
            if (!isFinite(ratio) || ratio <= 0) return 0;
            const result = Math.log2(ratio);
            return isFinite(result) ? result : 0;
        };
        
        switch (metric) {
            case 'log2_median_ratio':
                // Log2 fold change (中位数)
                comparisonValue = safelog2(median2, median1);
                break;
            
            case 'log2_mean_ratio':
                // Log2 fold change (均值)
                comparisonValue = safelog2(mean2, mean1);
                break;
            
            case 'mean_difference':
                // Mean-based difference (mean2 - mean1)
                comparisonValue = mean2 - mean1;
                if (!isFinite(comparisonValue)) comparisonValue = 0;
                break;
            
            case 'difference':
                // 差值
                comparisonValue = median2 - median1;
                if (!isFinite(comparisonValue)) comparisonValue = 0;
                break;
            
            default:
                comparisonValue = safelog2(median2, median1);
        }
        
        // 显著性检验
        let pValue = 1.0;
        let significant = false;
        let effectSize = 0;

        if (!belowThreshold && runTests && effective1.length >= 2 && effective2.length >= 2) {
            pValue = wilcoxonTest(effective1, effective2);
            effectSize = cohensD(effective1, effective2);
            significant = pValue < 0.05;
        }

        // 确保所有数值都有效
        const log2MedianRatio = safelog2(median2, median1);
        const log2MeanRatio = safelog2(mean2, mean1);
        const foldChange = (median2 + 1) / (median1 + 1);
        const difference = median2 - median1;
        const mean_difference = mean2 - mean1;

        // 存储结果
        stats[nodeData.name] = {
            taxon_id: nodeData.name,
            log2_median_ratio: isFinite(log2MedianRatio) ? log2MedianRatio : 0,
            log2_mean_ratio: isFinite(log2MeanRatio) ? log2MeanRatio : 0,
            median_1: isFinite(median1) ? median1 : 0,
            median_2: isFinite(median2) ? median2 : 0,
            mean_1: isFinite(mean1) ? mean1 : 0,
            mean_2: isFinite(mean2) ? mean2 : 0,
            fold_change: isFinite(foldChange) ? foldChange : 1,
            difference: isFinite(difference) ? difference : 0,
            mean_difference: isFinite(mean_difference) ? mean_difference : 0,
            comparison_value: !belowThreshold && isFinite(comparisonValue) ? comparisonValue : 0,
            value: !belowThreshold && isFinite(comparisonValue) ? comparisonValue : 0, // 用于阈值判断
            wilcox_p_value: isFinite(pValue) ? pValue : 1,
            pvalue: isFinite(pValue) ? pValue : 1, // 标准化字段名
            qvalue: 1, // 将在后续 FDR 校正中计算
            effect_size: isFinite(effectSize) ? effectSize : 0,
            significant: significant,
            n_samples_1: samples1.length,
            n_samples_2: samples2.length,
            n_above_threshold_1: filtered1.length,
            n_above_threshold_2: filtered2.length,
            below_min_abundance: belowThreshold,
            min_abundance_applied: minAbundance > 0
        };
    });
    
    // FDR 校正：计算 q-values (Benjamini-Hochberg)
    stats = calculateQValues(stats);
    
    return stats;
}

/**
 * Benjamini-Hochberg FDR 校正
 * 计算 q-values (adjusted p-values)
 */
function calculateQValues(stats) {
    // 收集所有的 p-values 和对应的 taxon
    const items = [];
    for (const taxon in stats) {
        items.push({
            taxon: taxon,
            pvalue: stats[taxon].pvalue
        });
    }
    
    // 按 p-value 排序
    items.sort((a, b) => a.pvalue - b.pvalue);
    
    const n = items.length;
    const qvalues = new Array(n);
    
    // Benjamini-Hochberg 程序
    // q(i) = min(p(i) * n / i, q(i+1))
    let minQValue = 1;
    for (let i = n - 1; i >= 0; i--) {
        const rank = i + 1; // rank 从 1 开始
        const qvalue = Math.min(items[i].pvalue * n / rank, minQValue);
        qvalues[i] = Math.min(qvalue, 1); // q-value 不能超过 1
        minQValue = qvalues[i];
    }
    
    // 将 q-values 赋值回 stats
    for (let i = 0; i < n; i++) {
        stats[items[i].taxon].qvalue = qvalues[i];
    }
    
    return stats;
}

// ========== 分歧色板 ==========

/**
 * 创建分歧色板 - 用于显示增加/减少
 */
function createDivergingColorScale(domain = [-3, 0, 3], palette = 'blueRed') {
    const palettes = {
        blueRed: ['#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'],
        blueWhiteRed: ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#ffffff', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'],
        greenPurple: ['#1b7837', '#5aae61', '#a6dba0', '#d9f0d3', '#f7f7f7', '#e7d4e8', '#c2a5cf', '#9970ab', '#762a83'],
        brownCyan: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e'],
        orangeBlue: ['#e66101', '#fdb863', '#fee0b6', '#f7f7f7', '#d8daeb', '#b2abd2', '#5e3c99'],
        redGray: ['#ca0020', '#f4a582', '#ffffff', '#bababa', '#404040'],
        // New: widely-used diverging palettes
        coolWarm: ['#3b4cc0','#6788ee','#9bbcff','#ccd9ff','#f7f7f7','#fdc9b4','#f3976d','#d24b3a','#b40426'],
        seismic: ['#2b83ba','#74add1','#abd9e9','#e0f3f8','#f7f7f7','#fee090','#fdae61','#f46d43','#d73027']
        ,
        // Additional diverging palettes (ColorBrewer variants)
        RdBu: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#f7f7f7', '#92c5de', '#4393c3', '#2166ac', '#053061'],
        RdYlBu: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#ffffbf', '#abd9e9', '#74add1', '#4575b4', '#313695'],
        Spectral: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd'],
        PuOr: ['#7f3b08', '#b35806', '#f1a340', '#fee0b6', '#f7f7f7', '#d8daeb', '#998ec3', '#542788', '#2d004b'],
        PRGn: ['#40004b', '#762a83', '#9970ab', '#c2a5cf', '#f7f7f7', '#a6dba0', '#5aae61', '#1b7837'],
        BrBG: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#c7eae5', '#80cdc1', '#35978f', '#01665e'],
        PiYG: ['#8e0152', '#c51b7d', '#de77ae', '#f1b6da', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221']
    };
    
    const colors = palettes[palette] || palettes.blueRed;
    
    return d3.scaleLinear()
        .domain(d3.range(domain[0], domain[2] + 0.001, (domain[2] - domain[0]) / (colors.length - 1)))
        .range(colors)
        .interpolate(d3.interpolateRgb)
        .clamp(true);
}

/**
 * 获取预定义的分歧色板
 */
function getDivergingPalettes() {
    return {
        blueRed: { name: 'Blue-Red', range: ['#2166ac', '#ffffff', '#b2182b'] },
        blueWhiteRed: { name: 'Blue-White-Red', range: ['#053061', '#ffffff', '#67001f'] },
        greenPurple: { name: 'Green-Purple', range: ['#1b7837', '#f7f7f7', '#762a83'] },
        brownCyan: { name: 'Brown-Cyan', range: ['#8c510a', '#f5f5f5', '#01665e'] },
        orangeBlue: { name: 'Orange-Blue', range: ['#e66101', '#f7f7f7', '#5e3c99'] },
        redGray: { name: 'Red-Gray', range: ['#ca0020', '#ffffff', '#404040'] },
        coolWarm: { name: 'CoolWarm', range: ['#3b4cc0', '#f7f7f7', '#b40426'] },
        seismic: { name: 'Seismic', range: ['#2b83ba', '#f7f7f7', '#d73027'] }
        ,
        RdBu: { name: 'RdBu', range: ['#67001f', '#ffffff', '#053061'] },
        RdYlBu: { name: 'RdYlBu', range: ['#a50026', '#ffffbf', '#313695'] },
        Spectral: { name: 'Spectral', range: ['#9e0142', '#ffffbf', '#3288bd'] },
        PuOr: { name: 'PuOr', range: ['#7f3b08', '#f7f7f7', '#2d004b'] },
        PRGn: { name: 'PRGn', range: ['#40004b', '#f7f7f7', '#1b7837'] },
        BrBG: { name: 'BrBG', range: ['#543005', '#f5f5f5', '#01665e'] },
        PiYG: { name: 'PiYG', range: ['#8e0152', '#f7f7f7', '#4d9221'] }
    };
}

// ========== 分组管理 ==========

/**
 * 定义分组
 */
function defineGroup(groupName, sampleList) {
    if (!groupName || !sampleList || sampleList.length === 0) {
        console.error('Invalid group definition');
        return false;
    }
    
    groupDefinitions[groupName] = sampleList;
    return true;
}

/**
 * 删除分组
 */
function removeGroup(groupName) {
    if (groupDefinitions[groupName]) {
        delete groupDefinitions[groupName];
        return true;
    }
    return false;
}

/**
 * 清除所有分组
 */
function clearAllGroups() {
    groupDefinitions = {};
}

/**
 * 获取所有分组
 */
function getAllGroups() {
    return groupDefinitions;
}

/**
 * 自动分组 - 根据样本名称前缀
 */
function autoGroupBySamplePrefix(samples, separator = '_') {
    const groups = {};
    
    samples.forEach(sample => {
        const prefix = sample.split(separator)[0];
        if (!groups[prefix]) {
            groups[prefix] = [];
        }
        groups[prefix].push(sample);
    });
    
    // 只保留有多个样本的组
    Object.keys(groups).forEach(key => {
        if (groups[key].length >= 2) {
            groupDefinitions[key] = groups[key];
        }
    });
    
    return groupDefinitions;
}

/**
 * 根据 meta 列自动分组
 * @param {Object} meta - parseMetaTSV 生成的 metaData 对象
 * @param {string} column - 用于分组的列名（必须存在于 meta.columns 且不是 'Sample'）
 * @param {number} minPerGroup - 组内至少样本数（默认2）
 * @returns {Object} 分组定义 { groupValue: [samples] }
 */
function autoGroupByMetaColumn(meta, column, minPerGroup = 2) {
    if (!meta || !meta.rows || !Array.isArray(meta.rows)) {
        console.warn('autoGroupByMetaColumn: invalid meta');
        return {};
    }
    if (!column || column === 'Sample' || !meta.columns.includes(column)) {
        console.warn(`autoGroupByMetaColumn: invalid column ${column}`);
        return {};
    }
    const grouping = {};
    const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
    meta.rows.forEach(row => {
        const sample = row['Sample'];
        const key = (row[column] ?? '').trim();
        if (!sample || !key) return;
        // 仅纳入：1) 通过当前 meta 筛选；2) 确实出现在已加载数据样本列表中
        if (!passes(sample)) return;
        if (typeof samples !== 'undefined' && Array.isArray(samples) && samples.indexOf(sample) === -1) return;
        if (!grouping[key]) grouping[key] = [];
        grouping[key].push(sample);
    });
    // 过滤掉过小的组（按“已过滤后的样本数”判定）
    Object.keys(grouping).forEach(k => {
        if ((grouping[k] || []).length < (minPerGroup || 2)) delete grouping[k];
    });
    // 更新全局分组定义
    groupDefinitions = { ...groupDefinitions, ...grouping };
    return grouping;
}

// ========== 导出功能 ==========

/**
 * 导出比较结果为 TSV
 */
function exportComparisonResults(comparisons, filename = 'comparison_results.tsv') {
    if (!comparisons || comparisons.length === 0) {
        console.warn('No comparison results to export');
        return;
    }
    
    let tsvContent = '';
    
    // 遍历所有比较
    comparisons.forEach(comp => {
        const { treatment_1, treatment_2, stats } = comp;
        
        // 表头
        if (tsvContent === '') {
            tsvContent += 'treatment_1\ttreatment_2\ttaxon_id\t';
            tsvContent += 'log2_median_ratio\tlog2_mean_ratio\t';
            tsvContent += 'median_1\tmedian_2\tmean_1\tmean_2\t';
            tsvContent += 'fold_change\tdifference\tmean_difference\t';
            tsvContent += 'wilcox_p_value\tFDR_q_value\teffect_size\tsignificant\t';
            tsvContent += 'n_samples_1\tn_samples_2\n';
        }
        
        // 数据行
        Object.values(stats).forEach(stat => {
            // 安全的数值格式化函数
            const safeFixed = (value, decimals) => {
                return (value != null && isFinite(value)) ? value.toFixed(decimals) : '0';
            };
            
            tsvContent += `${treatment_1}\t${treatment_2}\t${stat.taxon_id || 'unknown'}\t`;
            tsvContent += `${safeFixed(stat.log2_median_ratio, 4)}\t${safeFixed(stat.log2_mean_ratio, 4)}\t`;
            tsvContent += `${safeFixed(stat.median_1, 2)}\t${safeFixed(stat.median_2, 2)}\t`;
            tsvContent += `${safeFixed(stat.mean_1, 2)}\t${safeFixed(stat.mean_2, 2)}\t`;
            tsvContent += `${safeFixed(stat.fold_change, 4)}\t${safeFixed(stat.difference, 2)}\t${safeFixed(stat.mean_difference, 2)}\t`;
            tsvContent += `${safeFixed(stat.wilcox_p_value, 6)}\t${safeFixed(stat.qvalue, 6)}\t${safeFixed(stat.effect_size, 4)}\t`;
            tsvContent += `${stat.significant || false}\t${stat.n_samples_1 || 0}\t${stat.n_samples_2 || 0}\n`;
        });
    });
    
    // 下载文件
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
