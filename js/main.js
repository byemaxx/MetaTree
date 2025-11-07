/**
 * 宏基因组层级分类结构可视化平台 - 主模块
 * Version: 2.0
 */

// ========== 全局变量 ==========
let treeData = null;
let selectedSamples = [];
let samples = [];
let rawData = [];
let svgs = {};
let zooms = {};
let svgGroups = {}; // store <g> per sample for direct transform when needed
let currentLayout = 'radial';
let tooltip;
let abundanceTransform = 'none'; // 丰度转换方式: 'none', 'log', 'log2', 'sqrt', 'area' (默认改为 none)
let colorScheme = 'Viridis'; // 颜色方案 - 改用高对比度的 Viridis
let colorSchemeReversed = false; // 反转颜色映射
let customColorStart = '#70706B'; // 自定义渐变起始颜色
let customColorEnd = '#08519c'; // 自定义渐变结束颜色
let customColorMid = '#ffd27f'; // 可选中间色
// 默认自定义渐变：3 个停靠点（起点-中点-终点）
let customColorStops = [customColorStart, customColorMid, customColorEnd];
// 用于绘图的实际树数据(可能是原始treeData或group模式的修改版)
let activeTreeData = null;
// 元数据（meta.tsv）
let metaData = null;         // { rows: Array<Record<string,string>>, bySample: { [sample]: row }, columns: string[] }
let metaColumns = [];        // 可用于分组的列名（不含 Sample）
// 元数据筛选（UI 勾选的过滤条件）: { columnName: Set(values) }
let metaFilters = {};        

// 可视化参数
let showLabels = true; // 是否显示标签（默认开启）
let nodeSizeMultiplier = 1.0; // 节点大小倍数
let edgeWidthMultiplier = 1.5; // 连线宽度倍数（全局轻微放大 1.5）
let labelThreshold = 1.0; // 标签丰度阈值（0-1，0=不显示，1=显示全部）
let labelFontSize = 9; // 标签字体大小（像素）
let labelMaxLength = 15; // 标签最大长度（字符数）
let labelOverflowMode = 'ellipsis'; // 'ellipsis' | 'wrap'
let minNodeSize = 3; // 最小节点大小
let maxNodeSize = 35; // 最大节点大小
let edgeOpacity = 1.0; // 连线不透明度（由 UI 控制）
let nodeOpacity = 1.0; // 节点不透明度（由 UI 控制）
// 多选的标签层级（从叶的距离：0=叶，1=叶上一层...）
let labelLevelsSelected = []; // 空表示全部
let currentMaxLeafHeight = -1; // 用于更新UI
// 数据是否包含负数（如 log2FC 等），用于在单样本/分组模式下启用“有符号”可视化
let dataHasNegatives = false;
// 是否使用 combined_long.tsv 格式（长表差异结果：Item_ID, condition, log2FoldChange, padj, pvalue）
let isCombinedLong = false;

// 对比度控制（可按需暴露到 UI）
let sizeExponent = 0.5;   // 节点半径的幂指数（<1 提升低值可视度，降低以减小log2时的节点）
let strokeExponent = 0.6; // 连线粗细的幂指数
let colorGamma = 0.8;     // 颜色映射的伽马（<1 提升低值颜色差异）
// 全局分位数范围（UI 可调）
let quantileLow = 0.0;   // 0%
let quantileHigh = 1.0;  // 100%

// ========== 统一标签颜色 ==========
let uniformLabelColors = false; // 是否启用统一标签颜色
let labelColorMap = new Map(); // 存储标签名称到颜色的映射 {labelName: color}
let customLabelColors = new Map(); // 用户自定义的标签颜色 {labelName: color}
let labelColorIndex = 0; // 当前使用的颜色索引
// 针对单个节点实例的颜色覆盖：key 为祖先路径（唯一标识当前节点实例）
let nodeColorOverrides = new Map(); // { nodeAncestorPath: color }
let nodeColorOverrideLabel = new Map(); // { nodeAncestorPath: labelName } 用于按标签清理覆盖

/**
 * 生成视觉上可区分的颜色
 * 使用 HSL 色彩空间，通过黄金角度分布色相，确保颜色差异明显
 * @param {number} index - 颜色索引
 * @returns {string} - HSL 颜色字符串
 */
function generateDistinctColor(index) {
    const goldenRatioConjugate = 0.618033988749895;
    const hue = (index * goldenRatioConjugate * 360) % 360;
    
    // 使用不同的饱和度和亮度组合来增加颜色多样性
    const saturationLevels = [70, 85, 60, 75];
    const lightnessLevels = [45, 55, 40, 50];
    
    const satIndex = Math.floor(index / 360) % saturationLevels.length;
    const lightIndex = Math.floor(index / (360 * saturationLevels.length)) % lightnessLevels.length;
    
    const saturation = saturationLevels[satIndex];
    const lightness = lightnessLevels[lightIndex];
    
    return `hsl(${hue.toFixed(0)}, ${saturation}%, ${lightness}%)`;
}
// 是否在每个样本图中显示legend（individual samples模式）
let showIndividualLegends = true; // 默认显示
// 同步缩放（多面板联动）：默认开启
let syncZoomEnabled = true;
let __isSyncingZoom = false; // 防止递归广播

// 懒加载/仅渲染可见面板：可视化面板观察器与渲染状态
let panelObserver = null;                 // IntersectionObserver 实例
let sampleRenderState = {};               // { [sample]: { rendered: boolean, dirty: boolean } }
// 非显著（Filter by significance 未通过）时的灰色显示
const NONSIG_NODE_COLOR = '#e0e0e0';
const NONSIG_LINK_COLOR = '#c8c8c8';
let lastGlobalDomain = null;             // 最近一次计算的全局颜色/大小域
try { if (typeof window !== 'undefined') window.lastGlobalDomain = lastGlobalDomain; } catch(_) {}
// 用户手动设置的全局颜色域幅度 M；
// - 单/组（丰度）模式使用 [0, M]
// - 比较/log2FC 模式使用 [-M, M]
let manualColorDomainValue = null;
try { if (typeof window !== 'undefined') window.manualColorDomainValue = manualColorDomainValue; } catch(_) {}

function getAutoDomainDisplayMagnitude(domain) {
    if (!domain || typeof domain !== 'object') return null;
    let magnitude = null;

    const high = domain.high;
    if (typeof high === 'number' && isFinite(high)) {
        magnitude = Math.abs(high);
    }

    const low = domain.low;
    if (typeof low === 'number' && isFinite(low)) {
        const absLow = Math.abs(low);
        magnitude = (magnitude == null) ? absLow : Math.max(magnitude, absLow);
    }

    if (magnitude == null) {
        const max = domain.max;
        if (typeof max === 'number' && isFinite(max)) {
            magnitude = Math.abs(max);
        }
    }

    return (magnitude != null && isFinite(magnitude)) ? magnitude : null;
}

function formatDomainInputValue(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '';
    let formatted = Number(value).toFixed(2);
    formatted = formatted.replace(/\.00$/, '');
    formatted = formatted.replace(/(\.\d)0$/, '$1');
    return formatted;
}

// 零丰度可视化颜色（增强可见性）
const ZERO_NODE_COLOR = '#d6dce6';  // 节点填充
const ZERO_LINK_COLOR = '#b7c0cf';  // 连线颜色

// ========== 比较模式变量 ==========
let visualizationMode = 'single';  // 'single', 'group', 'comparison', 'matrix'
try { if (typeof window !== 'undefined') window.visualizationMode = visualizationMode; } catch(_) {}
let comparisonMetric = 'log2_median_ratio';  // 比较指标
let divergingPalette = 'blueRed';  // 分歧色板
let showOnlySignificant = false;  // 只显示显著差异
let comparisonColorDomain = [-5, 0, 5];  // 比较颜色域（默认 -5 到 5）

function getComparisonRendererStoreSafe() {
    if (typeof getComparisonRendererStore === 'function') {
        try {
            const store = getComparisonRendererStore();
            if (store && typeof store.getStats === 'function') {
                return store;
            }
        } catch (err) {
            console.warn('Failed to access comparison renderer store', err);
        }
    }
    return null;
}

function getActiveComparisonStats() {
    const store = getComparisonRendererStoreSafe();
    if (store && typeof store.getStats === 'function') {
        try {
            return store.getStats();
        } catch (err) {
            console.warn('Failed to read comparison stats from store', err);
        }
    }
    return null;
}

// ========== Group模式变量 ==========
let groupMetaColumn = '';           // 用于自动分组的meta列名
let availableGroups = [];           // 从meta列提取的所有可用组名
let selectedGroups = [];            // 用户选择的要可视化的组
let groupedData = {};               // { groupName: aggregatedSampleData }
let groupAggregation = 'mean';      // 分组聚合方式: 'mean' | 'median' | 'sum'（默认 mean）

// 比较视图专用放大系数（仅作用于两组比较视图，避免影响单样本与矩阵）
const COMPARISON_NODE_SCALE_BOOST = 1.4;   // 两组比较大图的节点半径整体放大
const COMPARISON_EDGE_SCALE_BOOST = 1.5;   // 两组比较大图的连线宽度整体放大

// 显著性阈值（用于过滤，比较/矩阵模式用）
function getSignificanceThresholds() {
    return {
        pvalue: parseFloat(document.getElementById('pvalue-threshold')?.value || 0.05),
        qvalue: parseFloat(document.getElementById('qvalue-threshold')?.value || 0.05),
        logfc: parseFloat(document.getElementById('logfc-threshold')?.value || 1)
    };
}

// 判断节点统计是否满足显著性阈值（比较/矩阵模式）
function isSignificantByThresholds(stats) {
    if (!stats) return false;
    const thresholds = getSignificanceThresholds();
    const passPvalue = stats.pvalue !== undefined && stats.pvalue <= thresholds.pvalue;
    const passQvalue = stats.qvalue !== undefined && stats.qvalue <= thresholds.qvalue;
    const passLogFC = stats.value !== undefined && Math.abs(stats.value) >= thresholds.logfc;
    return passPvalue && passQvalue && passLogFC;
}

// 单样本（combined_long）阈值
function getSingleSignificanceThresholds() {
    return {
        pvalue: parseFloat(document.getElementById('single-pvalue-threshold')?.value || 0.05),
        qvalue: parseFloat(document.getElementById('single-qvalue-threshold')?.value || 0.05),
        logfc: parseFloat(document.getElementById('single-logfc-threshold')?.value || 1)
    };
}

// 单样本（combined_long）判定逻辑
// 规则：|value| >= logfc 且（p存在则<=阈值）且（q存在则<=阈值）
function isSignificantBySingleThresholds(stats, thresholds) {
    if (!stats) return false;
    const thr = thresholds || getSingleSignificanceThresholds();
    const hasP = Number.isFinite(stats.pvalue);
    const hasQ = Number.isFinite(stats.qvalue);
    const passLogFC = stats.value !== undefined && Math.abs(stats.value) >= thr.logfc;
    const passPvalue = !hasP || stats.pvalue <= thr.pvalue;
    const passQvalue = !hasQ || stats.qvalue <= thr.qvalue;
    return passLogFC && passPvalue && passQvalue;
}

// 颜色方案配置：仅保留适合 0 → 高值 的顺序型色板，并新增更合适的选项
const COLOR_SCHEMES = {
    // 感知一致性优秀（科学可视化常用）
    'Viridis': { name: 'Viridis', interpolator: d3.interpolateViridis },
    'Plasma': { name: 'Plasma', interpolator: d3.interpolatePlasma },
    'Inferno': { name: 'Inferno', interpolator: d3.interpolateInferno },
    'Magma': { name: 'Magma', interpolator: d3.interpolateMagma },
    'Cividis': { name: 'Cividis', interpolator: d3.interpolateCividis },
    'Turbo': { name: 'Turbo', interpolator: d3.interpolateTurbo },

    // D3 顺序型色板（0→高值）
    'YlGn': { name: 'Yellow-Green', interpolator: d3.interpolateYlGn },
    'YlGnBu': { name: 'Yellow-Green-Blue', interpolator: d3.interpolateYlGnBu },
    'YlOrRd': { name: 'Yellow-Orange-Red', interpolator: d3.interpolateYlOrRd },
    'YlOrBr': { name: 'Yellow-Orange-Brown', interpolator: d3.interpolateYlOrBr },
    'Blues': { name: 'Blues', interpolator: d3.interpolateBlues },
    'Greens': { name: 'Greens', interpolator: d3.interpolateGreens },
    'Greys': { name: 'Greys', interpolator: d3.interpolateGreys },
    'Oranges': { name: 'Oranges', interpolator: d3.interpolateOranges },
    'Purples': { name: 'Purples', interpolator: d3.interpolatePurples },
    'Reds': { name: 'Reds', interpolator: d3.interpolateReds },
    'BuGn': { name: 'Blue-Green', interpolator: d3.interpolateBuGn },
    'BuPu': { name: 'Blue-Purple', interpolator: d3.interpolateBuPu },
    'GnBu': { name: 'Green-Blue', interpolator: d3.interpolateGnBu },
    'OrRd': { name: 'Orange-Red', interpolator: d3.interpolateOrRd },
    'PuBu': { name: 'Purple-Blue', interpolator: d3.interpolatePuBu },
    'PuBuGn': { name: 'Purple-Blue-Green', interpolator: d3.interpolatePuBuGn },
    'PuRd': { name: 'Purple-Red', interpolator: d3.interpolatePuRd },
    'RdPu': { name: 'Red-Purple', interpolator: d3.interpolateRdPu },

    // 顺序但色调更“暖/冷”的连续型
    'Warm': { name: 'Warm', interpolator: d3.interpolateWarm },
    'Cool': { name: 'Cool', interpolator: d3.interpolateCool }
};

// 移除离散/发散/循环色板（不适合 0→高值的连续数值）

// 自定义颜色放在最后
COLOR_SCHEMES['Custom'] = { name: 'Custom', interpolator: null };

// ========== 数据解析模块 ==========
function parseTSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split('\t');
    
    // 提取样本列（除了第一列的 Taxon）
    samples = headers.slice(1);
    
    const data = [];
    let hasNegative = false;
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('\t');
        const taxonPath = values[0];
        const abundances = {};
        
        samples.forEach((sample, idx) => {
            const v = parseFloat(values[idx + 1]);
            const num = (v != null && !isNaN(v)) ? v : 0;
            abundances[sample] = num;
            if (num < 0) hasNegative = true;
        });
        
        data.push({
            taxon: taxonPath,
            abundances: abundances
        });
    }
    // 标记全局“是否包含负数”
    dataHasNegatives = hasNegative;
    if (typeof window !== 'undefined') window.dataHasNegatives = dataHasNegatives;
    isCombinedLong = false;
    if (typeof window !== 'undefined') window.isCombinedLong = isCombinedLong;
    
    return data;
}

// 解析 combined_long.tsv：期望列包含 Item_ID, condition, log2FoldChange, 可选 padj, pvalue
function parseCombinedLongTSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split('\t').map(h => h.trim());
    const findCol = (name) => {
        const idx = header.findIndex(h => h.toLowerCase() === name.toLowerCase());
        return idx >= 0 ? idx : -1;
    };
    const idxItem = findCol('Item_ID');
    const idxCond = findCol('condition');
    const idxLFC = findCol('log2FoldChange');
    const idxPadj = findCol('padj');
    const idxP = findCol('pvalue');
    if (idxItem === -1 || idxCond === -1 || idxLFC === -1) {
        throw new Error('combined_long.tsv 缺少必要列：Item_ID / condition / log2FoldChange');
    }

    const byTaxon = new Map();
    const condSet = new Set();
    let hasNeg = false;
    for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split('\t');
        if (!vals || vals.length === 0) continue;
        const taxon = (vals[idxItem] ?? '').trim();
        const cond = (vals[idxCond] ?? '').trim();
        if (!taxon || !cond) continue;
        condSet.add(cond);
        const lfc = parseFloat(vals[idxLFC]);
        if (isFinite(lfc) && lfc < 0) hasNeg = true;
        const qv = idxPadj >= 0 ? parseFloat(vals[idxPadj]) : undefined;
        const pv = idxP >= 0 ? parseFloat(vals[idxP]) : undefined;

        if (!byTaxon.has(taxon)) {
            byTaxon.set(taxon, { taxon, abundances: {}, stats: {} });
        }
        const rec = byTaxon.get(taxon);
        rec.abundances[cond] = isFinite(lfc) ? lfc : 0;
        rec.stats[cond] = {
            value: isFinite(lfc) ? lfc : 0,
            qvalue: isFinite(qv) ? qv : undefined,
            pvalue: isFinite(pv) ? pv : undefined
        };
    }

    samples = Array.from(condSet);
    const data = Array.from(byTaxon.values());
    dataHasNegatives = hasNeg || true; // LFC 视为有符号数据
    isCombinedLong = true;
    if (typeof window !== 'undefined') {
        window.dataHasNegatives = dataHasNegatives;
        window.isCombinedLong = isCombinedLong;
    }
    return data;
}

// 解析元数据（meta.tsv），要求包含列 "Sample"
function parseMetaTSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const headers = lines[0].split('\t').map(h => h.trim());
    const sampleIdx = headers.indexOf('Sample');
    if (sampleIdx === -1) {
        console.warn('meta.tsv missing required column "Sample"');
        return null;
    }
    const rows = [];
    const bySample = {};
    for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split('\t');
        if (!vals || vals.length === 0) continue;
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = (vals[idx] ?? '').trim();
        });
        if (row['Sample']) {
            rows.push(row);
            bySample[row['Sample']] = row;
        }
    }
    const columns = headers.slice();
    metaData = { rows, bySample, columns };
    // 可用于分组的列：排除 Sample
    metaColumns = columns.filter(c => c !== 'Sample');
    // 暴露到全局以便其它模块使用
    if (typeof window !== 'undefined') {
        window.metaData = metaData;
        window.metaColumns = metaColumns;
        // 初始化筛选器对象
        if (!window.metaFilters) window.metaFilters = {};
    }
    return metaData;
}

// ========== 样本过滤（基于 meta 选择） ==========
function samplePassesMetaFilters(sample) {
    if (!metaData || !metaData.bySample || !window.metaFilters) return true;
    const row = metaData.bySample[sample];
    if (!row) {
        // 若样本不在 meta 中：当存在任一列启用过滤时，视为不通过
        const anyActive = Object.values(window.metaFilters).some(set => set && set.size > 0);
        return !anyActive;
    }
    for (const [col, set] of Object.entries(window.metaFilters)) {
        if (!set || set.size === 0) continue; // 此列未启用过滤
        const val = (row[col] ?? '').trim();
        if (!set.has(val)) return false; // AND across columns
    }
    return true;
}

function getActiveSamples() {
    // 仅返回通过 meta 过滤的用户所选样本
    return selectedSamples.filter(s => samplePassesMetaFilters(s));
}
if (typeof window !== 'undefined') {
    window.getActiveSamples = getActiveSamples;
    // 暴露元数据筛选谓词，供 UI 与比较分析统一调用
    window.samplePassesMetaFilters = samplePassesMetaFilters;
    if (!window.metaFilters) window.metaFilters = metaFilters;
}

// 丰度转换函数
function transformAbundance(value) {
    // 针对包含负数的数据（如 log2FC），采用“有符号”变换；否则维持原先非负假设
    if (dataHasNegatives) {
        if (value === 0 || !isFinite(value)) return 0;
        const s = Math.sign(value);
        const a = Math.abs(value);
        switch (abundanceTransform) {
            case 'log':
                return s * Math.log10(a + 1); // symlog10
            case 'log2':
                return s * Math.log2(a + 1);  // symlog2
            case 'sqrt':
                return s * Math.sqrt(a);      // signed sqrt
            case 'area':
                return value;                  // 面积在比例尺中处理，保持符号
            case 'none':
            default:
                return value;                  // 恒等
        }
    } else {
        // 原始（非负）数据路径
        if (value <= 0 || !isFinite(value)) return 0;
        switch (abundanceTransform) {
            case 'log':
                return Math.log10(value + 1);
            case 'log2':
                return Math.log2(value + 1);
            case 'sqrt':
                return Math.sqrt(value);
            case 'area':
                return value; // 面积转换在scale中处理
            case 'none':
            default:
                return value;
        }
    }
}

/**
 * 计算标签显示阈值（基于百分位数）
 * @param {d3.Hierarchy} hierarchy - D3 层级数据
 * @param {string} sample - 样本名称
 * @returns {number} 阈值值
 */
function calculateLabelThreshold(hierarchy, sample) {
    const allTransformed = [];
    hierarchy.each(node => {
        const abundance = node.data.abundances[sample] || 0;
        const transformed = transformAbundance(abundance);
        const val = dataHasNegatives ? Math.abs(transformed) : transformed;
        if (val > 0) allTransformed.push(val);
    });
    allTransformed.sort((a, b) => b - a);
    
    let thresholdValue;
    if (labelThreshold <= 0) {
        thresholdValue = Infinity;
    } else if (labelThreshold >= 1) {
        thresholdValue = 0;
    } else {
        const numToShow = Math.ceil(allTransformed.length * labelThreshold);
        thresholdValue = allTransformed[Math.min(numToShow - 1, allTransformed.length - 1)];
    }
    
    return thresholdValue;
}

/**
 * 获取标签层级选择集合
 * @returns {Set|null} 选择的层级集合，null表示显示所有层级
 */
function getLabelLevelSet() {
    if (labelLevelsSelected === null) {
        return null;
    }
    if (Array.isArray(labelLevelsSelected) && labelLevelsSelected.length > 0) {
        return new Set(labelLevelsSelected);
    }
    return new Set();
}

/**
 * 仅剥离根节点一层：如果根只有一个子节点，则返回其子节点；否则保持原样
 * 注意：不再连续剥离整条“单子节点链”，以保留除 root 以外的单子节点
 * @param {d3.HierarchyNode} h - 根层级节点
 * @returns {d3.HierarchyNode} - 如有需要去除一层根后的新根
 */
function stripToFirstBranch(h) {
    try {
        if (h && h.children && h.children.length === 1) {
            return h.children[0];
        }
    } catch (_) { /* ignore */ }
    return h;
}

/**
 * 获取节点的简化显示名称
 * @param {Object} d - D3 节点数据
 * @returns {string} 简化后的显示名称
 */
/**
 * 获取节点的完整标签名称（不截断，用于颜色映射）
 * @param {Object} d - 节点对象
 * @returns {string} - 完整标签名称
 */
function getFullLabelName(d) {
    let name = d.data.name || '';
    const rank = d.data.rank;
    
    if (rank === 'species') {
        const parent = d.parent;
        const genus = parent && parent.data ? parent.data.name : null;
        let display = name;
        if (genus) {
            const escaped = genus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx1 = new RegExp('^' + escaped + '\\s+');
            const rx2 = new RegExp('^' + escaped + '_+');
            if (rx1.test(display) || rx2.test(display)) {
                display = display.replace(rx1, '').replace(rx2, '');
            } else {
                const parts = display.split(/\s+/);
                if (parts.length > 1) display = parts.slice(1).join(' ');
            }
        } else {
            const parts = display.split(/\s+/);
            if (parts.length > 1) display = parts.slice(1).join(' ');
        }
        name = display;
    } else if (rank === 'genome') {
        if (name.length > 15) {
            const match = name.match(/^([A-Z]+)(\d+)$/);
            if (match) {
                name = match[1] + '...' + match[2].slice(-4);
            }
        }
    }
    // 返回完整名称，不进行截断
    return name;
}

function getDisplayName(d) {
    let name = getFullLabelName(d);
    // 溢出处理：省略或原样（换行在渲染阶段处理）
    if (labelOverflowMode === 'ellipsis' && Number.isFinite(labelMaxLength) && labelMaxLength > 3) {
        if (name.length > labelMaxLength) {
            return name.substring(0, Math.max(0, labelMaxLength - 3)) + '...';
        }
    }
    return name;
}

// 文本换行（基于最大字符数，按空格优先断行；无空格则按固定宽度切分）
function applyLabelOverflow(textSelection) {
    if (labelOverflowMode !== 'wrap') return;
    const maxChars = (Number.isFinite(labelMaxLength) && labelMaxLength >= 4) ? Math.floor(labelMaxLength) : 15;
    textSelection.each(function() {
        const textEl = d3.select(this);
        const full = textEl.text();
        if (!full) return;
        // 不需要换行
        if (full.length <= maxChars) return;
        const x = parseFloat(textEl.attr('x') || 0);
        const baseDy = textEl.attr('dy') || '0em';
        const words = full.split(/\s+/).filter(w => w.length > 0);
        // 若没有空格，按固定宽度硬切
        const lines = [];
        if (words.length <= 1) {
            const s = full;
            for (let i = 0; i < s.length; i += maxChars) {
                lines.push(s.slice(i, i + maxChars));
            }
        } else {
            let line = '';
            words.forEach((w, idx) => {
                const test = line ? (line + ' ' + w) : w;
                if (test.length > maxChars && line) {
                    lines.push(line);
                    line = w;
                } else {
                    line = test;
                }
            });
            if (line) lines.push(line);
        }
        // 重建 tspans
        textEl.text(null);
        lines.forEach((ln, i) => {
            textEl.append('tspan')
                .attr('x', x)
                .attr('dy', i === 0 ? baseDy : '1.1em')
                .text(ln);
        });
    });
}

/**
 * 获取标签颜色
 * @param {Object|string} nodeOrLabel - 节点对象或标签名称
 * @returns {string} - 颜色值
 */
function getLabelColor(nodeOrLabel) {
    // 如果传入的是节点对象，先检查单节点覆盖，再回退到按名称着色
    if (typeof nodeOrLabel === 'object' && nodeOrLabel && nodeOrLabel.data) {
        try {
            const nodePath = getNodeAncestorPath(nodeOrLabel);
            if (nodeColorOverrides.has(nodePath)) {
                return nodeColorOverrides.get(nodePath);
            }
        } catch (_) { /* ignore */ }
        // 未覆盖则继续使用名称映射
        const labelName = getFullLabelName(nodeOrLabel);
        // 优先使用用户自定义颜色（即使 uniformLabelColors 未勾选）
        if (customLabelColors.has(labelName)) return customLabelColors.get(labelName);
        if (!uniformLabelColors) return '#333';
        if (labelColorMap.has(labelName)) return labelColorMap.get(labelName);
        console.warn('No color found for label:', labelName);
        return '#333';
    }
    // 传入的是字符串标签名
    const labelName = nodeOrLabel;
    
    // 优先使用用户自定义颜色（即使 uniformLabelColors 未勾选）
    if (customLabelColors.has(labelName)) {
        return customLabelColors.get(labelName);
    }
    
    // 如果未启用统一标签颜色，返回默认黑色
    if (!uniformLabelColors) {
        return '#333';
    }
    
    // 返回预分配的颜色（已在 drawAllTrees 中分配）
    if (labelColorMap.has(labelName)) {
        return labelColorMap.get(labelName);
    }
    
    // 如果没有找到（理论上不应该发生），返回默认颜色
    console.warn('No color found for label:', labelName);
    return '#333';
}

/**
 * 为单个节点实例设置颜色覆盖
 * @param {string} nodePath - 通过 getNodeAncestorPath(d) 获取的唯一路径
 * @param {string} color - 颜色值
 */
function setNodeColorOverride(nodePath, color, labelName) {
    if (!nodePath || typeof nodePath !== 'string') return;
    nodeColorOverrides.set(nodePath, color);
    if (typeof labelName === 'string' && labelName.length > 0) {
        nodeColorOverrideLabel.set(nodePath, labelName);
    }
}

/**
 * 移除某个节点实例的颜色覆盖
 * @param {string} nodePath
 */
function clearNodeColorOverride(nodePath) {
    if (!nodePath || typeof nodePath !== 'string') return;
    nodeColorOverrides.delete(nodePath);
    nodeColorOverrideLabel.delete(nodePath);
}

/**
 * 清空所有节点级颜色覆盖
 */
function clearAllNodeColorOverrides() {
    nodeColorOverrides.clear();
    nodeColorOverrideLabel.clear();
}

/**
 * 按标签名称清除该标签的所有节点级颜色覆盖
 * @param {string} labelName
 */
function clearNodeOverridesByLabel(labelName) {
    if (typeof labelName !== 'string' || labelName.length === 0) return;
    try {
        // 收集要删除的路径后再删除，避免迭代时修改 Map
        const toDelete = [];
        nodeColorOverrideLabel.forEach((lbl, path) => {
            if (lbl === labelName) toDelete.push(path);
        });
        toDelete.forEach(path => {
            nodeColorOverrides.delete(path);
            nodeColorOverrideLabel.delete(path);
        });
    } catch (_) { /* ignore */ }
}

/**
 * 设置自定义标签颜色
 * @param {string} labelName - 标签名称
 * @param {string} color - 颜色值
 */
function setCustomLabelColor(labelName, color) {
    console.log('setCustomLabelColor called:', labelName, color);
    customLabelColors.set(labelName, color);
    labelColorMap.set(labelName, color);
    console.log('customLabelColors size:', customLabelColors.size);
    console.log('labelColorMap size:', labelColorMap.size);
}

/**
 * 重置标签颜色为自动分配
 * @param {string} labelName - 标签名称
 */
function resetLabelColor(labelName) {
    customLabelColors.delete(labelName);
    // 重新分配自动颜色
    if (labelColorMap.has(labelName)) {
        labelColorMap.delete(labelName);
    }
}

/**
 * 重置所有标签颜色
 */
function resetAllLabelColors() {
    labelColorMap.clear();
    customLabelColors.clear();
    labelColorIndex = 0;
}

/**
 * 获取所有当前显示的标签名称
 * @returns {Set<string>} - 所有标签名称的集合
 */
function getAllLabelNames() {
    const labelNames = new Set();
    
    // 使用 activeTreeData 或 treeData
    const dataToUse = activeTreeData || treeData;
    
    if (!dataToUse) {
        console.warn('No tree data available');
        return labelNames;
    }
    
    try {
        // 创建层次结构
        const childAccessor = d => (d.__collapsed ? null : d.children);
        let hierarchy = d3.hierarchy(dataToUse, childAccessor);
        
        // 跳过只有单一子节点的根节点
        if (hierarchy.children && hierarchy.children.length === 1) {
            hierarchy = hierarchy.children[0];
        }
        
        // 遍历所有节点,收集标签名称
        hierarchy.descendants().forEach(node => {
            if (node.data && node.data.name) {
                labelNames.add(getFullLabelName(node));
            }
        });
    } catch (error) {
        console.error('Error getting label names:', error);
    }
    
    return labelNames;
}

// 将扁平化的分类数据转换为层级树结构
function buildHierarchy(data) {
    const root = {
        name: 'Root',
        children: [],
        abundances: {},
        isLeaf: false
    };

    // 第一步：应用 taxon 过滤（如果启用）
    let filteredData = data;
    if (typeof window.taxonPassesFilter === 'function') {
        filteredData = data.filter(item => {
            const taxonStr = String(item.taxon || '').trim();
            return window.taxonPassesFilter(taxonStr);
        });
    }

    // 第二步：构建树结构
    filteredData.forEach(item => {
        let taxonStr = String(item.taxon || '').trim();

        // 检测功能注释：仅将“第一个空格+‘<’”视为功能分隔符，函数部分一直取到末尾最后一个‘>’。
        // 注意：函数内部可能包含 '<' 或 '>'，因此不能用排他型正则；只认第一个分隔符和最后一个闭合符。
        let functionLabel = null;
        const sepIdx = taxonStr.indexOf(' <');
        if (sepIdx >= 0) {
            const endIdx = taxonStr.lastIndexOf('>');
            if (endIdx > sepIdx) {
                functionLabel = taxonStr.slice(sepIdx + 2, endIdx).trim(); // +2 跳过空格和 '<'
                taxonStr = taxonStr.slice(0, sepIdx).trim();              // 分隔符之前都是 taxonomy
            }
        }

        // 拆分分类路径（管道分隔），允许不完整路径
        const parts = taxonStr
            .split('|')
            .map(p => p.trim())
            .filter(p => p.length > 0);
        let currentNode = root;

        // 前缀到层级映射（大小写不敏感）
        const rankMap = {
            'd': 'domain',
            'k': 'kingdom',
            'p': 'phylum',
            'c': 'class',
            'o': 'order',
            'f': 'family',
            'g': 'genus',
            's': 'species',
            'm': 'genome'  // MAG/genome level
        };

        parts.forEach((part, depth) => {
            // 匹配并记录前缀层级
            const m = part.match(/^([a-z])__\s*/i);
            const prefix = m ? m[1].toLowerCase() : null;
            const rank = prefix && rankMap[prefix] ? rankMap[prefix] : undefined;
            // 清理分类名称，移除前缀（如 d__/P__ 等）
            const cleanName = part.replace(/^[a-z]__\s*/i, '');
            
            let child = currentNode.children.find(c => c.name === cleanName);
            
            if (!child) {
                child = {
                    name: cleanName,
                    fullName: part,
                    rank: rank,
                    depth: depth,
                    children: [],
                    abundances: {},
                    isLeaf: false
                };
                currentNode.children.push(child);
            }
            
            // 标记内部节点
            currentNode.isLeaf = false;
            currentNode = child;
        });

    if (functionLabel !== null && functionLabel.length > 0) {
            // 追加功能层级作为叶节点
            let funcNode = currentNode.children.find(c => c.name === functionLabel && c.rank === 'function');
            if (!funcNode) {
                funcNode = {
                    name: functionLabel,
                    fullName: `<${functionLabel}>`,
                    rank: 'function',
                    depth: (currentNode.depth || 0) + 1,
                    children: [],
                    abundances: {},
                    isLeaf: true,
                    isFunction: true
                };
                currentNode.children.push(funcNode);
            }
            funcNode.abundances = { ...item.abundances };
            if (item.stats) funcNode.stats = { ...item.stats };
        } else {
            // 没有功能层级，当前节点为叶
            currentNode.isLeaf = true;
            currentNode.abundances = { ...item.abundances };
            if (item.stats) currentNode.stats = { ...item.stats };
        }
    });

    // 第二步：从叶子节点向上计算内部节点的丰度（后序遍历）
    function calculateAbundances(node) {
        if (node.isLeaf) {
            // 叶子节点已经有丰度值
            return node.abundances;
        }
        
        // 内部节点：初始化丰度为0
        samples.forEach(sample => {
            node.abundances[sample] = 0;
        });
        
        // 累加所有子节点的丰度
        node.children.forEach(child => {
            const childAbundances = calculateAbundances(child);
            samples.forEach(sample => {
                node.abundances[sample] += childAbundances[sample] || 0;
            });
        });
        
        return node.abundances;
    }
    
    calculateAbundances(root);
    return root;
}

// ========== Group模式数据聚合 ==========
/**
 * 根据meta列对样本进行分组并计算聚合数据
 * @param {string} metaColumn - 用于分组的meta列名
 * @param {string} aggregation - 聚合方式: 'mean', 'median', 'sum'
 * @returns {Object} { groups: [groupNames], data: { groupName: { taxon: value } } }
 */
function aggregateDataByGroup(metaColumn, aggregation = 'mean') {
    if (!metaData || !metaColumn || !rawData || rawData.length === 0) {
        return { groups: [], data: {} };
    }

    // 应用 meta 过滤
    const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
    
    // 按meta列值对样本分组（仅包含通过过滤的样本）
    const samplesByGroup = {};
    samples.forEach(sample => {
        // 跳过不通过过滤的样本
        if (!passes(sample)) {
            return;
        }
        
        const metaRow = metaData.bySample[sample];
        if (!metaRow) {
            return;
        }
        
        const groupValue = metaRow[metaColumn];
        if (!groupValue) {
            return;
        }
        
        if (!samplesByGroup[groupValue]) {
            samplesByGroup[groupValue] = [];
        }
        samplesByGroup[groupValue].push(sample);
    });

    const groupNames = Object.keys(samplesByGroup);
    const groupedData = {};

    // 对每个分组计算聚合值
    groupNames.forEach(groupName => {
        const groupSamples = samplesByGroup[groupName];
        const aggregatedAbundances = {};

        // 遍历每个taxon
        rawData.forEach(item => {
            const taxonKey = item.taxon;
            
            // 获取这个taxon在所有group样本中的值
            const values = groupSamples
                .map(s => {
                    const val = item.abundances[s];
                    return val !== undefined && val !== null ? val : 0;
                })
                .filter(v => !isNaN(v));

            if (values.length === 0) {
                aggregatedAbundances[taxonKey] = 0;
                return;
            }

            let aggregatedValue = 0;
            if (aggregation === 'mean') {
                aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
            } else if (aggregation === 'median') {
                const sorted = values.slice().sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                aggregatedValue = sorted.length % 2 === 0
                    ? (sorted[mid - 1] + sorted[mid]) / 2
                    : sorted[mid];
            } else if (aggregation === 'sum') {
                aggregatedValue = values.reduce((a, b) => a + b, 0);
            }

            aggregatedAbundances[taxonKey] = aggregatedValue;
        });

        groupedData[groupName] = aggregatedAbundances;
    });

    return { groups: groupNames, data: groupedData };
}

/**
 * 更新group模式的可用组列表
 */
function updateAvailableGroups() {
    if (!groupMetaColumn || !metaData) {
        availableGroups = [];
        selectedGroups = [];
        return;
    }

    // 提取唯一的group值
    const groupSet = new Set();
    samples.forEach(sample => {
        const metaRow = metaData.bySample[sample];
        if (metaRow && metaRow[groupMetaColumn]) {
            groupSet.add(metaRow[groupMetaColumn]);
        }
    });

    availableGroups = Array.from(groupSet).sort();
    // 清空之前的选择
    selectedGroups = [];
}

/**
 * 计算并缓存group数据
 */
function computeGroupedData() {
    console.log('computeGroupedData called, selectedGroups:', selectedGroups, 'groupMetaColumn:', groupMetaColumn);
    
    if (selectedGroups.length === 0) {
        groupedData = {};
        console.log('computeGroupedData: No selected groups');
        return;
    }

    // 如果有 groupMetaColumn，使用旧的基于 meta 列的自动分组
    // 否则，使用全局 groupDefinitions 对象中定义的分组
    if (groupMetaColumn) {
        console.log('computeGroupedData: Using groupMetaColumn-based aggregation');
        const result = aggregateDataByGroup(groupMetaColumn, groupAggregation);
        groupedData = result.data;
    } else if (typeof groupDefinitions !== 'undefined' && groupDefinitions && Object.keys(groupDefinitions).length > 0) {
        console.log('computeGroupedData: Using groupDefinitions, groups:', Object.keys(groupDefinitions));
        // 使用手动定义的 groups 进行聚合
        groupedData = {};
        selectedGroups.forEach(groupName => {
            const groupSamples = groupDefinitions[groupName];
            console.log('Processing group:', groupName, 'samples:', groupSamples);
            if (!groupSamples || groupSamples.length === 0) return;
            
            // 应用 meta 过滤：只使用通过过滤的样本
            const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
            const filteredSamples = groupSamples.filter(s => passes(s));
            
            if (filteredSamples.length === 0) {
                console.log('Group', groupName, 'has no samples after meta filtering, skipping');
                return;
            }
            
            const aggregatedAbundances = {};
            
            // 遍历每个taxon
            rawData.forEach(item => {
                const taxonKey = item.taxon;
                
                // 获取这个taxon在过滤后的group样本中的值
                const values = filteredSamples
                    .map(s => {
                        const val = item.abundances[s];
                        return val !== undefined && val !== null ? val : 0;
                    })
                    .filter(v => !isNaN(v));

                if (values.length === 0) {
                    aggregatedAbundances[taxonKey] = 0;
                    return;
                }

                let aggregatedValue = 0;
                if (groupAggregation === 'mean') {
                    aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
                } else if (groupAggregation === 'median') {
                    const sorted = values.slice().sort((a, b) => a - b);
                    const mid = Math.floor(sorted.length / 2);
                    aggregatedValue = sorted.length % 2 === 0
                        ? (sorted[mid - 1] + sorted[mid]) / 2
                        : sorted[mid];
                } else if (groupAggregation === 'sum') {
                    aggregatedValue = values.reduce((a, b) => a + b, 0);
                }

                aggregatedAbundances[taxonKey] = aggregatedValue;
            });

            groupedData[groupName] = aggregatedAbundances;
        });
        console.log('computeGroupedData: Aggregated data for', Object.keys(groupedData).length, 'groups');
    } else {
        console.warn('computeGroupedData: No groupMetaColumn and no groupDefinitions object');
    }
}

/**
 * 为group模式构建包含聚合数据的树结构
 * 将聚合后的group数据注入到树节点的abundances中
 */
function buildTreeWithGroupData() {
    if (!treeData || !groupedData || Object.keys(groupedData).length === 0) {
        return treeData;
    }

    // 深拷贝树结构
    const cloneTree = (node) => {
        const cloned = {
            name: node.name,
            fullName: node.fullName,
            rank: node.rank,
            depth: node.depth,
            isLeaf: node.isLeaf,
            isFunction: node.isFunction,
            abundances: {},  // 不复制原有abundances,从头构建
            children: node.children ? node.children.map(cloneTree) : []
        };
        return cloned;
    };

    const groupTree = cloneTree(treeData);

    // 创建rawData的快速查找映射
    const taxonDataMap = new Map();
    rawData.forEach(item => {
        const taxonKey = String(item.taxon || '').trim();
        taxonDataMap.set(taxonKey, item);
    });

    // 递归为每个节点设置group丰度
    const setGroupAbundances = (node, parentPath = []) => {
        // 构建当前节点的路径
        const currentPath = [...parentPath];
        if (node.fullName) {
            currentPath.push(node.fullName);
        } else if (node.name && node.name !== 'Root') {
            currentPath.push(node.name);
        }
        
        // 初始化该节点的abundances
        selectedGroups.forEach(groupName => {
            node.abundances[groupName] = 0;
        });

        if (node.isLeaf) {
            // 叶节点:需要从groupedData中获取值
            // 尝试多种匹配策略
            for (const [taxonKey, item] of taxonDataMap.entries()) {
                // 策略1: 检查taxonKey是否包含当前路径的所有部分
                const matchesByParts = currentPath.every(part => taxonKey.includes(part));
                
                // 策略2: 检查taxonKey是否以当前节点的fullName结尾
                const matchesByEnd = node.fullName && taxonKey.endsWith(node.fullName);
                
                // 策略3: 检查路径是否完全匹配
                const pathStr = currentPath.join('|');
                const matchesByPath = taxonKey === pathStr || taxonKey.includes(pathStr);
                
                if (matchesByParts || matchesByEnd || matchesByPath) {
                    // 从groupedData获取聚合值
                    selectedGroups.forEach(groupName => {
                        if (groupedData[groupName] && groupedData[groupName][taxonKey] !== undefined) {
                            node.abundances[groupName] = groupedData[groupName][taxonKey];
                        }
                    });
                    
                    break; // 找到匹配就停止
                }
            }
        } else {
            // 内部节点:先递归处理子节点
            if (node.children && node.children.length > 0) {
                node.children.forEach(child => setGroupAbundances(child, currentPath));
                
                // 从子节点聚合
                selectedGroups.forEach(groupName => {
                    const sum = node.children.reduce((acc, child) => {
                        return acc + (child.abundances[groupName] || 0);
                    }, 0);
                    node.abundances[groupName] = sum;
                });
            }
        }
    };

    setGroupAbundances(groupTree);
    
    return groupTree;
}

// ========== 可视化模块 ==========
function initVisualization() {
    const vizContainer = document.getElementById('viz-container');
    vizContainer.innerHTML = '';
    svgs = {};
    zooms = {};
    svgGroups = {};
    sampleRenderState = {};
    
    // 根据模式决定要绘制的项目
    let activeSamples;
    if (visualizationMode === 'group') {
        // group模式：绘制选中的组
        activeSamples = selectedGroups.slice();
    } else {
        // single模式：绘制选中的样本
        activeSamples = typeof getActiveSamples === 'function' ? getActiveSamples() : selectedSamples.slice();
    }
    
    activeSamples.forEach(sample => {
        // 创建面板
        const panel = document.createElement('div');
        panel.className = 'tree-panel';
        panel.id = `panel-${sample}`;

        // 创建标题（含操作按钮）
        const header = document.createElement('div');
        header.className = 'tree-panel-header';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'panel-title-text';
        titleSpan.textContent = `${sample}`;
        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'panel-actions';
        // Reset zoom button
        const btnReset = document.createElement('button');
        btnReset.className = 'btn-icon';
        btnReset.title = 'Reset zoom';
        btnReset.setAttribute('aria-label','Reset zoom');
    btnReset.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        btnReset.addEventListener('click', () => {
            if (svgs[sample] && zooms[sample]) {
                svgs[sample].transition().duration(500).call(zooms[sample].transform, d3.zoomIdentity);
            }
        });
        // Restore last collapsed node
        const btnRestore = document.createElement('button');
        btnRestore.className = 'btn-icon';
        btnRestore.title = 'Restore last collapsed node';
        btnRestore.setAttribute('aria-label', 'Restore last collapsed node');
        btnRestore.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5a7 7 0 1 1-4.95 11.95" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 5H4v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btnRestore.addEventListener('click', () => {
            if (typeof window.restoreLastCollapsed === 'function') window.restoreLastCollapsed();
        });
        // Export SVG button
        const btnSvg = document.createElement('button');
        btnSvg.className = 'btn-icon';
        btnSvg.title = 'Export SVG';
        btnSvg.setAttribute('aria-label','Export SVG');
    btnSvg.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 3v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 9l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        btnSvg.addEventListener('click', () => exportSVGForContainer(`svg-container-${sample}`, `treemap_${sample}`));
        // Export PNG button
        const btnPng = document.createElement('button');
        btnPng.className = 'btn-icon';
        btnPng.title = 'Export PNG';
        btnPng.setAttribute('aria-label','Export PNG');
    btnPng.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M7 6l2-2h6l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13" r="3" stroke="currentColor" stroke-width="2"/></svg>';
        btnPng.addEventListener('click', () => exportPNGForContainer(`svg-container-${sample}`, `treemap_${sample}`));
    actionsWrap.appendChild(btnReset);
    actionsWrap.appendChild(btnRestore);
        actionsWrap.appendChild(btnSvg);
        actionsWrap.appendChild(btnPng);
        header.appendChild(titleSpan);
        header.appendChild(actionsWrap);
        panel.appendChild(header);

        // 创建 SVG 容器
        const svgContainer = document.createElement('div');
        svgContainer.className = 'tree-svg-container';
        svgContainer.id = `svg-container-${sample}`;
        panel.appendChild(svgContainer);

        vizContainer.appendChild(panel);

        // 初始化渲染状态并观察面板可见性
        sampleRenderState[sample] = { rendered: false, dirty: true };
        setupPanelObserver();
        try { panelObserver && panelObserver.observe(panel); } catch (e) {}
    });

    // 创建全局工具提示
    if (!tooltip) {
        tooltip = d3.select('body').append('div')
            .attr('class', 'tooltip')
            .attr('id', 'tooltip-global');
    }
}

// 设置 IntersectionObserver，以便仅在面板可见时触发绘制
function setupPanelObserver() {
    if (panelObserver) return;
    if (!('IntersectionObserver' in window)) {
        // 不支持则跳过，回退到直接绘制
        return;
    }
    panelObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const el = entry.target;
            if (!el || !el.id || !el.id.startsWith('panel-')) return;
            const sample = el.id.slice('panel-'.length);
            if (!sampleRenderState[sample]) return;
            if (entry.isIntersecting) {
                // 面板进入可视区域：如需绘制则绘制
                if (lastGlobalDomain && (!sampleRenderState[sample].rendered || sampleRenderState[sample].dirty)) {
                    try {
                        drawTree(sample, lastGlobalDomain);
                        sampleRenderState[sample].rendered = true;
                        sampleRenderState[sample].dirty = false;
                    } catch (e) { console.warn('lazy drawTree failed for', sample, e); }
                }
            }
        });
    }, { root: null, rootMargin: '100px 0px', threshold: 0.05 });
}

function drawAllTrees() {
    console.log('drawAllTrees called, customLabelColors:', customLabelColors.size);
    
    // 在group模式下,先构建包含group数据的树
    if (visualizationMode === 'group') {
        computeGroupedData();
        activeTreeData = buildTreeWithGroupData();
        if (!activeTreeData) return;
    } else {
        // single模式或其他模式使用原始treeData
        activeTreeData = treeData;
    }
    
    // ========== 重新分配标签颜色（仅对当前显示的标签） ==========
    if (uniformLabelColors && activeTreeData) {
        // 收集所有当前会被实际渲染的唯一标签名称
        const visibleLabels = new Set();
        try {
            const childAccessor = d => (d.__collapsed ? null : d.children);
            let hierarchy = d3.hierarchy(activeTreeData, childAccessor);
            
            // 跳过只有单一子节点的根节点
            if (hierarchy.children && hierarchy.children.length === 1) {
                hierarchy = hierarchy.children[0];
            }
            
            // 获取标签层级过滤器
            const selectedSet = getLabelLevelSet();
            
            // 如果在 single 模式，需要对每个样本计算阈值
            if (visualizationMode === 'single' && selectedSamples && selectedSamples.length > 0) {
                selectedSamples.forEach(sample => {
                    const thresholdValue = calculateLabelThreshold(hierarchy, sample);
                    
                    // 收集会被渲染的标签
                    hierarchy.descendants().forEach(node => {
                        if (node.data && node.data.name) {
                            const abundance = node.data.abundances[sample] || 0;
                            const transformed = transformAbundance(abundance);
                            const depthFromLeaf = node.height;
                            const levelOk = !selectedSet || selectedSet.has(depthFromLeaf);
                            
                            // 只收集满足层级和阈值条件的标签（使用完整标签名称）
                            if (levelOk && Math.abs(transformed) >= thresholdValue) {
                                visibleLabels.add(getFullLabelName(node));
                            }
                        }
                    });
                });
            } else if (visualizationMode === 'comparison') {
                const comparisonStats = getActiveComparisonStats();
                if (comparisonStats) {
                    // comparison 模式：根据层级、阈值和统计显著性过滤
                    const threshold = labelThreshold * 5; // comparison 模式使用不同的阈值计算
                    hierarchy.descendants().forEach(node => {
                        if (node.data && node.data.name) {
                            const st = comparisonStats[node.data.name];
                            if (!st) return;

                            const depthFromLeaf = node.height;
                            const levelOk = !selectedSet || selectedSet.has(depthFromLeaf);
                            const mag = Math.abs(st.comparison_value || 0);

                            // 根据显著性设置和阈值过滤
                            const passSignificance = !showOnlySignificant || (st.significant || false);

                            // 使用完整标签名称
                            if (levelOk && mag >= threshold && passSignificance) {
                                visibleLabels.add(getFullLabelName(node));
                            }
                        }
                    });
                } else {
                    hierarchy.descendants().forEach(node => {
                        if (node.data && node.data.name) {
                            const depthFromLeaf = node.height;
                            const levelOk = !selectedSet || selectedSet.has(depthFromLeaf);
                            if (levelOk) {
                                visibleLabels.add(getFullLabelName(node));
                            }
                        }
                    });
                }
            } else {
                // group 模式，或没有样本时，只根据层级过滤
                hierarchy.descendants().forEach(node => {
                    if (node.data && node.data.name) {
                        const depthFromLeaf = node.height;
                        const levelOk = !selectedSet || selectedSet.has(depthFromLeaf);
                        
                        // 使用完整标签名称
                        if (levelOk) {
                            visibleLabels.add(getFullLabelName(node));
                        }
                    }
                });
            }
        } catch (error) {
            console.warn('Error collecting visible labels:', error);
        }
        
        // 清除自动分配的颜色（保留用户自定义颜色）
        const newLabelColorMap = new Map();
        labelColorIndex = 0;
        
        // 为可见标签重新分配颜色
        const sortedLabels = Array.from(visibleLabels).sort(); // 排序确保一致性
        sortedLabels.forEach(labelName => {
            // 如果有用户自定义颜色，保留它
            if (customLabelColors.has(labelName)) {
                newLabelColorMap.set(labelName, customLabelColors.get(labelName));
            } else {
                // 否则分配新颜色
                const color = generateDistinctColor(labelColorIndex);
                newLabelColorMap.set(labelName, color);
                labelColorIndex++;
            }
        });
        
        labelColorMap = newLabelColorMap;
        console.log('Reassigned colors for', visibleLabels.size, 'visible labels (mode:', visualizationMode, ')');
    }
    
    // 先计算所有样本的全局最大丰度（应用转换后）
    const globalAbundances = [];
    // 使用子节点访问器以支持折叠/展开
    const childAccessor = d => (d.__collapsed ? null : d.children);
    let hierarchy = d3.hierarchy(activeTreeData, childAccessor);
    // 跳过前导的“单子节点链”，直至第一个分叉
    hierarchy = stripToFirstBranch(hierarchy);
    
    // 计算最大叶距（用于标签层级多选UI）
    const maxLeafHeight = d3.max(hierarchy.descendants(), d => d.height) || 0;
    // 是否存在功能叶节点
    const hasFunctionLeaf = hierarchy.leaves().some(nd => nd.data && nd.data.rank === 'function');
    
    // 基于当前层级结构，按“从叶向外”的距离动态推断每一层的常见 rank 名称
    // 这样即使跳过了单子节点根，也能保持标签语义正确
    const displayRankMap = {
        species: 'Species', genus: 'Genus', family: 'Family', order: 'Order', class: 'Class',
        phylum: 'Phylum', kingdom: 'Kingdom', domain: 'Domain', genome: 'Genome', function: 'Function'
    };
    const namesFromLeafDynamic = [];
    try {
        const allNodes = hierarchy.descendants();
        for (let k = 0; k <= maxLeafHeight; k++) {
            const ranks = allNodes
                .filter(n => n.height === k && n.data)
                .map(n => n.data.rank)
                .filter(r => typeof r === 'string' && r.length > 0);
            if (ranks.length === 0) {
                namesFromLeafDynamic[k] = undefined;
                continue;
            }
            // 统计出现频率最高的 rank
            const freq = {};
            for (const r of ranks) freq[r] = (freq[r] || 0) + 1;
            const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
            namesFromLeafDynamic[k] = displayRankMap[top] || (top.charAt(0).toUpperCase() + top.slice(1));
        }
    } catch { /* ignore and fallback below */ }

    if (typeof window !== 'undefined' && typeof window.updateLabelLevelsOptions === 'function') {
        // 仅当高度、功能叶状态或叶子节点计数变化时更新UI
        const prevHasFunc = typeof window.__hasFunctionLeaf === 'boolean' ? window.__hasFunctionLeaf : undefined;
        const leafCount = (hierarchy && typeof hierarchy.leaves === 'function') ? (hierarchy.leaves().length || 0) : 0;
        const prevLeafCount = (typeof window.__leafCount === 'number') ? window.__leafCount : undefined;
        if (currentMaxLeafHeight !== maxLeafHeight || prevHasFunc !== hasFunctionLeaf || prevLeafCount !== leafCount) {
            currentMaxLeafHeight = maxLeafHeight;
            window.__hasFunctionLeaf = hasFunctionLeaf;
            window.__leafCount = leafCount;
            // 传递 leafCount 以便 UI 根据叶子数量调整标签默认显示（性能优化）
            window.updateLabelLevelsOptions(maxLeafHeight, hasFunctionLeaf, namesFromLeafDynamic, leafCount);
        }
    }
    
    // 根据模式获取要绘制的项目
    let activeSamples;
    if (visualizationMode === 'group') {
        activeSamples = selectedGroups.slice();
    } else {
        activeSamples = typeof getActiveSamples === 'function' ? getActiveSamples() : selectedSamples.slice();
    }
    
    activeSamples.forEach(sample => {
        hierarchy.each(node => {
            if (node.data.abundances && node.data.abundances[sample] != null) {
                const transformed = transformAbundance(node.data.abundances[sample]);
                globalAbundances.push(dataHasNegatives ? Math.abs(transformed) : transformed);
            }
        });
    });

    // 计算全局域：
    // - 非负数据：与原逻辑一致，采用分位数 [qLow, qHigh]
    // - 含负数据：按绝对值计算分位数上界 M，采用对称域 [-M, M]
    const globalMaxAbundance = d3.max(globalAbundances) || 1;
    const EPS = 1e-4; // 0.01%
    const ql = Math.min(Math.max(quantileLow, 0), 0.9999);
    const qh = Math.min(Math.max(quantileHigh, EPS), 1);
    const qLowP = Math.min(ql, qh - EPS);
    const qHighP = Math.max(qh, ql + EPS);

    let globalDomain;
    if (dataHasNegatives) {
        const mags = globalAbundances.filter(v => v > 0).sort((a, b) => a - b);
        const qHigh = mags.length ? d3.quantileSorted(mags, qHighP) : globalMaxAbundance;
        const M = (isFinite(qHigh) && qHigh > 0) ? qHigh : (globalMaxAbundance || 1);
        globalDomain = { low: -M, high: M, max: M };
    } else {
        const positives = globalAbundances.filter(v => v > 0).sort((a, b) => a - b);
        let qLow = positives.length ? d3.quantileSorted(positives, qLowP) : 0;
        let qHigh = positives.length ? d3.quantileSorted(positives, qHighP) : globalMaxAbundance;
        if (!isFinite(qLow) || qLow == null) qLow = 0;
        if (!isFinite(qHigh) || qHigh == null) qHigh = globalMaxAbundance;
        if (qHigh <= qLow) { qLow = 0; qHigh = globalMaxAbundance || 1; }
        globalDomain = { low: qLow, high: qHigh, max: globalMaxAbundance };
    }
    lastGlobalDomain = globalDomain;
    try { if (typeof window !== 'undefined') window.lastGlobalDomain = lastGlobalDomain; } catch(_) {}

    // 标记所有样本需要刷新；仅对可见面板触发绘制
    const isVisible = (panelEl) => {
        if (!panelEl) return false;
        const rect = panelEl.getBoundingClientRect();
        const vh = (window.innerHeight || document.documentElement.clientHeight);
        const vw = (window.innerWidth || document.documentElement.clientWidth);
        // 视口内简单可见性判断，允许上/下各预留 100px 触发提前绘制
        return rect.bottom >= -100 && rect.right >= 0 && rect.top <= vh + 100 && rect.left <= vw;
    };

    activeSamples.forEach(sample => {
        if (!sampleRenderState[sample]) sampleRenderState[sample] = { rendered: false, dirty: true };
        else sampleRenderState[sample].dirty = true;
        const panelEl = document.getElementById(`panel-${sample}`);
        if (panelEl && isVisible(panelEl)) {
            try {
                drawTree(sample, globalDomain);
                sampleRenderState[sample].rendered = true;
                sampleRenderState[sample].dirty = false;
            } catch (e) { console.warn('drawTree (visible) failed for', sample, e); }
        }
        // 不可见：交由 IntersectionObserver 在进入视口时绘制
    });
    // 在容器底部渲染一个统一的 shared legend（HTML/CSS）
    try {
        const category = (typeof window !== 'undefined' && window.colorSchemeCategory) ? window.colorSchemeCategory : 'sequential';
        // 仅用于颜色的 legend 域：若有手动 M，则采用手动 M；否则采用自动全局域
        let MmanualLeg = null;
        try {
            if (typeof window !== 'undefined' && typeof window.manualColorDomainValue === 'number' && isFinite(window.manualColorDomainValue) && window.manualColorDomainValue > 0) {
                MmanualLeg = window.manualColorDomainValue;
            } else if (typeof manualColorDomainValue === 'number' && isFinite(manualColorDomainValue) && manualColorDomainValue > 0) {
                MmanualLeg = manualColorDomainValue;
            }
        } catch(_) {}
        let legendDomain;
        if (typeof MmanualLeg === 'number' && isFinite(MmanualLeg) && MmanualLeg > 0) {
            if (category === 'diverging') {
                if (dataHasNegatives) legendDomain = [-MmanualLeg, 0, MmanualLeg];
                else legendDomain = [0, MmanualLeg / 2, MmanualLeg];
            } else {
                if (dataHasNegatives) {
                    legendDomain = [-MmanualLeg, MmanualLeg];
                } else {
                    const baseLow = (globalDomain && typeof globalDomain.low === 'number' && isFinite(globalDomain.low))
                        ? globalDomain.low
                        : 0;
                    const manualHigh = Math.max(MmanualLeg, baseLow);
                    legendDomain = [baseLow, manualHigh];
                }
            }
        } else {
            if (category === 'diverging') {
                if (dataHasNegatives) legendDomain = [globalDomain.low, 0, globalDomain.high];
                else legendDomain = [globalDomain.low, (globalDomain.low + globalDomain.high) / 2, globalDomain.high];
            } else {
                legendDomain = [globalDomain.low, globalDomain.high];
            }
        }
        renderSharedLegend(legendDomain, { quantileLowP: qLowP, quantileHighP: qHighP });
    } catch (err) {
        console.warn('renderSharedLegend failed:', err);
    }
    // 若当前模式为单样本或分组，且用户未手动设定域幅度，则将输入框同步为计算得到的最大值
    try {
        const hasManualNow = (typeof manualColorDomainValue === 'number') && isFinite(manualColorDomainValue) && manualColorDomainValue > 0
            || (typeof window !== 'undefined' && typeof window.manualColorDomainValue === 'number' && isFinite(window.manualColorDomainValue) && window.manualColorDomainValue > 0);
        if (!hasManualNow && (visualizationMode === 'single' || visualizationMode === 'group')) {
            const input = document.getElementById('color-domain-abs');
            if (input && lastGlobalDomain) {
                const autoMagnitude = getAutoDomainDisplayMagnitude(lastGlobalDomain);
                if (autoMagnitude != null) {
                    input.value = formatDomainInputValue(autoMagnitude);
                }
            }
        }
    } catch(_) {}
}

function drawTree(sample, globalDomain) {
    // 使用activeTreeData而不是treeData,以支持group模式
    const sourceTree = activeTreeData || treeData;
    if (!sourceTree || !sample) return;

    const container = document.getElementById(`svg-container-${sample}`);
    if (!container) return;

    container.innerHTML = '';
    
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

        // Add zoom functionality
    const zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on('zoom', (event) => {
            // 应用本地变换
            g.attr('transform', event.transform);
            // 只在用户触发（存在 sourceEvent）且启用了同步，且为单样本或group模式时广播
            if (syncZoomEnabled && (visualizationMode === 'single' || visualizationMode === 'group') && event && event.sourceEvent && !__isSyncingZoom) {
                let active;
                if (visualizationMode === 'group') {
                    active = selectedGroups.slice();
                } else {
                    active = (typeof getActiveSamples === 'function') ? getActiveSamples() : selectedSamples.slice();
                }
                __isSyncingZoom = true;
                try {
                    active.forEach(other => {
                        if (other === sample) return;
                        const otherSvg = svgs[other];
                        const otherZoom = zooms[other];
                        if (otherSvg && otherZoom) {
                            try { otherSvg.call(otherZoom.transform, event.transform); } catch (_) {}
                        }
                    });
                } finally {
                    __isSyncingZoom = false;
                }
            }
        });

    svg.call(zoom);
    svgs[sample] = svg;
    zooms[sample] = zoom;

    const g = svg.append('g');
    svgGroups[sample] = g;

    // 使用相同的子节点访问器以支持折叠/展开
    const childAccessor = d => (d.__collapsed ? null : d.children);
    let hierarchy = d3.hierarchy(sourceTree, childAccessor);
    // 跳过前导的“单子节点链”，直至第一个分叉
    hierarchy = stripToFirstBranch(hierarchy);
    
    // 是否启用单样本显著性过滤（仅对 combined_long 数据有效）
    const singleSigActive = (visualizationMode === 'single') && (typeof window !== 'undefined' && window.isCombinedLong) && !!document.getElementById('single-show-significance')?.checked;
    const singleSigThr = singleSigActive ? getSingleSignificanceThresholds() : null;

    // 若启用显著性过滤：自顶向下标记每个节点是否通过（叶：自身统计；内部：任一子节点通过）
    if (singleSigActive) {
        const markPass = (node) => {
            let selfPass = false;
            try {
                const st = node.data && node.data.stats ? node.data.stats[sample] : null;
                selfPass = isSignificantBySingleThresholds(st, singleSigThr);
            } catch (_) { selfPass = false; }
            let childPass = false;
            if (node.children && node.children.length) {
                for (const ch of node.children) {
                    if (markPass(ch)) { childPass = true; }
                }
            }
            const pass = !!(selfPass || childPass);
            // 标记到数据对象上，以便不同布局的 hierarchy 也能复用
            if (node.data) {
                if (!node.data.__singleSigPass) node.data.__singleSigPass = {};
                node.data.__singleSigPass[sample] = pass;
            }
            // 同时标记在本 hierarchy 节点上以便直接使用
            node._singleSigPass = pass;
            return pass;
        };
        try { markPass(hierarchy); } catch (_) {}
    }

    // 使用全局最大丰度（如果提供），否则计算当前样本的最大值
    let maxAbundance = globalDomain && globalDomain.max != null ? globalDomain.max : undefined;
    if (!maxAbundance) {
        const abundances = [];
        hierarchy.each(node => {
            if (node.data.abundances && node.data.abundances[sample]) {
                const transformed = transformAbundance(node.data.abundances[sample]);
                abundances.push(transformed);
            }
        });
        maxAbundance = d3.max(abundances) || 1;
    }

    // 颜色比例尺（仅受手动 Color domain 影响；大小比例尺仍使用自动 globalDomain）
    let colorAt;
    let signedMax = globalDomain && globalDomain.max != null ? globalDomain.max : maxAbundance;
    // 读取手动颜色域幅度（仅用于颜色，不影响大小域）
    let MmanualColor = null;
    try {
        if (typeof window !== 'undefined' && typeof window.manualColorDomainValue === 'number' && isFinite(window.manualColorDomainValue) && window.manualColorDomainValue > 0) {
            MmanualColor = window.manualColorDomainValue;
        } else if (typeof manualColorDomainValue === 'number' && isFinite(manualColorDomainValue) && manualColorDomainValue > 0) {
            MmanualColor = manualColorDomainValue;
        }
    } catch(_) {}
    const colorMinAuto = globalDomain ? globalDomain.low : 0;
    const colorMaxAuto = globalDomain ? globalDomain.high : maxAbundance;
    const hasManualColor = typeof MmanualColor === 'number' && isFinite(MmanualColor) && MmanualColor > 0;
    const category = (typeof window !== 'undefined' && window.colorSchemeCategory) ? window.colorSchemeCategory : 'sequential';
    if (category === 'diverging') {
        // 分歧色板：包含负数 => [-M,0,M]；否则 => [low, mid, high]
        let domain;
        let lowForDiv, highForDiv;
        if (hasManualColor) {
            if (dataHasNegatives) {
                domain = [-MmanualColor, 0, MmanualColor];
                lowForDiv = -MmanualColor; highForDiv = MmanualColor;
            } else {
                const low = 0, high = MmanualColor; const mid = (low + high) / 2;
                domain = [low, mid, high]; lowForDiv = low; highForDiv = high;
            }
        } else if (dataHasNegatives) {
            domain = [-signedMax, 0, signedMax];
            lowForDiv = -signedMax; highForDiv = signedMax;
        } else {
            const low = colorMinAuto;
            const high = colorMaxAuto;
            const mid = (low + high) / 2;
            domain = [low, mid, high];
            lowForDiv = low; highForDiv = high;
        }
        const palette = (typeof divergingPalette !== 'undefined' && divergingPalette) ? divergingPalette : 'blueRed';
        const scale = (typeof createDivergingColorScale === 'function')
            ? createDivergingColorScale(domain, palette)
            : d3.scaleLinear().domain(domain).range(['#2166ac','#ffffff','#b2182b']).clamp(true);
        // 支持“Reverse colors”对分歧色的反转：
        // - 有负值：通过取 -v 达到两端互换
        // - 非负值：围绕中点镜像 v' = low + high - v
        colorAt = (v) => {
            if (!(typeof colorSchemeReversed !== 'undefined' && colorSchemeReversed)) return scale(v);
            if (dataHasNegatives) return scale(-v);
            const mirrored = lowForDiv + highForDiv - v;
            return scale(mirrored);
        };
    } else {
        // 顺序色板：0 → 高值（若使用手动 M 且数据含负，则使用 [-M,M] 的线性归一）
        let interpolator = null;
        if (colorScheme === 'Custom') {
            const stops = (Array.isArray(customColorStops) && customColorStops.length >= 2)
                ? customColorStops
                : [customColorStart, customColorEnd];
            interpolator = (stops.length === 2) ? d3.interpolate(stops[0], stops[1]) : d3.interpolateRgbBasis(stops);
        } else {
            interpolator = COLOR_SCHEMES[colorScheme] ? COLOR_SCHEMES[colorScheme].interpolator : d3.interpolateViridis;
        }
        const effectiveInterpolator = (t) => (colorSchemeReversed ? (interpolator(1 - t)) : interpolator(t));
        const colorDomain = hasManualColor
            ? (dataHasNegatives
                ? [-MmanualColor, MmanualColor]
                : [colorMinAuto, Math.max(MmanualColor, colorMinAuto)])
            : [colorMinAuto, colorMaxAuto];
        // 若域跨越 0，则使用线性归一，避免幂映射在负区间的异常；否则使用幂映射增强低值分辨率
        const normFactory = (colorDomain[0] < 0) ? d3.scaleLinear : () => d3.scalePow().exponent(colorGamma);
        const colorNorm = normFactory().domain(colorDomain).range([0, 1]).clamp(true);
        colorAt = (v) => effectiveInterpolator(colorNorm(v));
    }

    // 节点大小比例尺 - 根据变换类型选择合适的 scale
    // 约定：
    // - log/log2/sqrt：数据已变换，使用幂映射以提升低值分辨率
    // - area：半径按 sqrt(value) 映射，使圆面积与值成正比（metacoder 风格）
    // - none：半径按线性映射（不做面积校正），以产生与 area 不同的视觉效果
    let sizeScale;
    const adjustedMinSize = minNodeSize * nodeSizeMultiplier;
    const adjustedMaxSize = maxNodeSize * nodeSizeMultiplier;
    
    if (abundanceTransform === 'log' || abundanceTransform === 'log2' || abundanceTransform === 'sqrt') {
        // 数据已变换，使用分位数域的幂映射，增强分辨率
        // 对于 log 变换，减小最大节点大小以避免节点过大
        const logMaxSize = adjustedMaxSize * 0.6; // 降低到60%
        sizeScale = d3.scalePow()
            .exponent(sizeExponent)
            .domain(dataHasNegatives ? [0, signedMax] : (globalDomain ? [globalDomain.low, globalDomain.high] : [0, maxAbundance]))
            .range([adjustedMinSize, logMaxSize])
            .clamp(true);
    } else if (abundanceTransform === 'area') {
        // 面积等比：半径 ~ sqrt(value)
        sizeScale = d3.scaleSqrt()
            .domain(dataHasNegatives ? [0, signedMax] : (globalDomain ? [globalDomain.low, globalDomain.high] : [0, maxAbundance]))
            .range([adjustedMinSize, adjustedMaxSize * 0.8])
            .clamp(true);
    } else {
        // 无变换：半径线性随数值增长（不会进行面积校正）
        sizeScale = d3.scaleLinear()
            .domain(dataHasNegatives ? [0, signedMax] : (globalDomain ? [globalDomain.low, globalDomain.high] : [0, maxAbundance]))
            // Transform = none 情况下整体略微减小节点尺寸（约 20%）
            .range([adjustedMinSize, adjustedMaxSize * 0.8])
            .clamp(true);
    }

    // 边宽度比例尺 - 根据变换类型调整（加大范围以增强可见差异）
    let strokeScale;
    if (abundanceTransform === 'log' || abundanceTransform === 'log2' || abundanceTransform === 'sqrt') {
        strokeScale = d3.scalePow()
            .exponent(strokeExponent)
            .domain(dataHasNegatives ? [0, signedMax] : (globalDomain ? [globalDomain.low, globalDomain.high] : [0, maxAbundance]))
            .range([0.8, 16])
            .clamp(true);
    } else if (abundanceTransform === 'area') {
        // 面积等比：连线宽度用 sqrt 映射，让宽度的视觉“面积”更贴近数值
        strokeScale = d3.scaleSqrt()
            .domain(dataHasNegatives ? [0, signedMax] : (globalDomain ? [globalDomain.low, globalDomain.high] : [0, maxAbundance]))
            .range([1, 14])
            .clamp(true);
    } else {
        strokeScale = d3.scaleLinear()
            .domain(dataHasNegatives ? [0, signedMax] : (globalDomain ? [globalDomain.low, globalDomain.high] : [0, maxAbundance]))
            .range([1, 12])
            .clamp(true);
    }

    let layout, nodes, links;

    if (currentLayout === 'radial') {
        // 径向布局
        const radius = Math.min(width, height) / 2 - 100;
        const tree = d3.cluster()
            .size([2 * Math.PI, radius]);

        layout = tree(hierarchy);
        nodes = layout.descendants();
        links = layout.links();

        const centerX = width / 2;
        const centerY = height / 2;

        // 预计算每个节点的显示半径，供连线末端“收紧”使用，避免生硬连接
        nodes.forEach(n => {
            const abundance = n.data.abundances[sample] || 0;
            const t = transformAbundance(abundance);
            n._nodeR = t > 0 ? sizeScale(t) : Math.max(1, adjustedMinSize * 0.7);
        });

        // 绘制连接线（径向），将半径减去节点半径使连线在接近节点时留出圆边
        const linkGenerator = d3.linkRadial()
            .angle(d => d.x)
            // 让连线延伸到节点中心，结合一致的不透明度以获得“融合”的外观
            .radius(d => d.y);

        // 不剔除非显著节点/连线，而是以灰色呈现
        let filteredLinks = links;
        let filteredNodes = nodes;

        g.selectAll('.link')
            .data(filteredLinks)
            .join('path')
            .attr('class', 'link')
            .attr('d', linkGenerator)
            .attr('stroke', d => {
                const abundance = d.target.data.abundances[sample] || 0;
                const t = transformAbundance(abundance);
                const pass = !singleSigActive || !!(d.target.data && d.target.data.__singleSigPass && d.target.data.__singleSigPass[sample]);
                if (!pass) return NONSIG_LINK_COLOR;
                return t === 0 ? ZERO_LINK_COLOR : colorAt(t);
            })
            .attr('stroke-width', d => {
                const abundance = d.target.data.abundances[sample] || 0;
                const t = transformAbundance(abundance);
                return t === 0 ? 0.5 * edgeWidthMultiplier : strokeScale(Math.abs(t)) * edgeWidthMultiplier;
            })
            .attr('stroke-opacity', () => Math.max(0.05, Math.min(1, edgeOpacity)))
            .attr('fill', 'none')
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('transform', `translate(${centerX},${centerY})`);

        // 绘制节点
        const nodeGroup = g.selectAll('.node')
            .data(filteredNodes)
            .join('g')
            .attr('class', 'node')
            .attr('transform', d => {
                const angle = d.x;
                const radius = d.y;
                const x = centerX + radius * Math.cos(angle - Math.PI / 2);
                const y = centerY + radius * Math.sin(angle - Math.PI / 2);
                return `translate(${x},${y})`;
            });

        nodeGroup.append('circle')
            .attr('r', d => {
                const abundance = d.data.abundances[sample] || 0;
                const t = transformAbundance(abundance);
                return t === 0 ? Math.max(1, adjustedMinSize * 0.7) : sizeScale(Math.abs(t));
            })
            .attr('fill', d => {
                // 统一节点与枝干的颜色，不再降低不透明度，从而在重叠处视觉一致
                const abundance = d.data.abundances[sample] || 0;
                const t = transformAbundance(abundance);
                const pass = !singleSigActive || !!(d.data && d.data.__singleSigPass && d.data.__singleSigPass[sample]);
                if (!pass) return NONSIG_NODE_COLOR;
                return t === 0 ? ZERO_NODE_COLOR : colorAt(t);
            })
            .attr('fill-opacity', () => Math.max(0, Math.min(1, nodeOpacity)))
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
            .style('pointer-events', 'all');

        // 折叠标记：为被折叠的节点添加一个“+”提示，便于再次找到并展开
        nodeGroup
            .filter(d => d.data && d.data.__collapsed)
            .append('text')
            .attr('class', 'collapse-marker')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .text('+')
            .style('font-size', '10px')
            .style('font-weight', '700')
            .attr('fill', '#2c3e50')
            .style('pointer-events', 'none');

        // 添加标签 - 根据 showLabels 选项决定是否显示
        if (showLabels) {
            const thresholdValue = calculateLabelThreshold(hierarchy, sample);
            const selectedSet = getLabelLevelSet();

            nodeGroup.filter(d => {
                const abundance = d.data.abundances[sample] || 0;
                const t = transformAbundance(abundance);
                const depthFromLeaf = d.height;
                const levelOk = !selectedSet || selectedSet.has(depthFromLeaf);
                const sigOk = !singleSigActive || (d.data && d.data.__singleSigPass && d.data.__singleSigPass[sample]);
                return levelOk && sigOk && Math.abs(t) >= thresholdValue;
            })
                .append('text')
                .attr('class', 'node-label')
                .attr('dy', '0.31em')
                .attr('x', d => d.x < Math.PI === !d.children ? 6 : -6)
                .attr('text-anchor', d => d.x < Math.PI === !d.children ? 'start' : 'end')
                .attr('transform', d => {
                    const angle = d.x * 180 / Math.PI - 90;
                    return d.x < Math.PI ? `rotate(${angle})` : `rotate(${angle + 180})`;
                })
                .text(d => getDisplayName(d))
                .style('font-size', `${labelFontSize}px`)
                .attr('fill', d => getLabelColor(d))
                .attr('font-weight', '500')
                .style('pointer-events', 'all')
                .style('cursor', 'context-menu')
                .on('contextmenu', handleLabelRightClick)
                .call(applyLabelOverflow);
        }

    } else if (currentLayout === 'packing') {
        // 圆打包布局（Circle Packing）
        const diameter = Math.max(20, Math.min(width, height) - 80);
        const offsetX = (width - diameter) / 2;
        const offsetY = (height - diameter) / 2;

        // 为 pack 计算数值（使用已变换的丰度以符合当前视觉域，并确保非负）
        const childAccessor = d => (d.__collapsed ? null : d.children);
        let rootPack = d3.hierarchy(sourceTree, childAccessor);
        rootPack = stripToFirstBranch(rootPack);

        const annotateLeafCounts = (node) => {
            if (!node.children || node.children.length === 0) {
                node._leafCount = 1;
                return 1;
            }
            let total = 0;
            for (const child of node.children) {
                total += annotateLeafCounts(child);
            }
            node._leafCount = total;
            return total;
        };
        annotateLeafCounts(rootPack);

        const PACK_MIN_WEIGHT = 0.5;
        const PACK_WEIGHT_PER_LEAF = 0.5;

        rootPack = rootPack
            .sum(d => {
                const abundance = (d.data && d.data.abundances && d.data.abundances[sample]) ? d.data.abundances[sample] : 0;
                const t = transformAbundance(abundance);
                const magnitude = Math.abs(t);
                if (magnitude > 0) return magnitude;
                const leafEquivalent = d._leafCount || 1;
                // 使用叶子数量的 log1p 作为退化值，确保零丰度子树依然占据面积但不过度膨胀
                const fallback = PACK_MIN_WEIGHT + PACK_WEIGHT_PER_LEAF * Math.log1p(leafEquivalent);
                return Math.max(PACK_MIN_WEIGHT, fallback);
            })
            .sort((a, b) => (b.value || 0) - (a.value || 0));

        const pack = d3.pack()
            .size([diameter, diameter])
            .padding(3);

        const packed = pack(rootPack);
        nodes = packed.descendants();

        // 绘制节点（无连线） - 不剔除非显著节点，使用灰色呈现
        const nodeGroup = g.selectAll('.node')
            .data(nodes)
            .join('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${d.x + offsetX},${d.y + offsetY})`);

        nodeGroup.append('circle')
            .attr('r', d => Math.max(0.5, d.r))
            .attr('fill', d => {
                const abundance = (d.data && d.data.abundances && d.data.abundances[sample]) ? d.data.abundances[sample] : 0;
                const t = transformAbundance(abundance);
                const pass = !singleSigActive || !!(d.data && d.data.__singleSigPass && d.data.__singleSigPass[sample]);
                if (!pass) return NONSIG_NODE_COLOR;
                return t === 0 ? ZERO_NODE_COLOR : colorAt(t);
            })
            .attr('stroke', d => (d.children && d.children.length ? '#ffffff' : 'none'))
            .attr('stroke-width', d => (d.children && d.children.length ? 1 : 0))
            .attr('fill-opacity', () => Math.max(0, Math.min(1, nodeOpacity)));

        // 折叠标记（Packing）：为被折叠的节点添加“+”
        nodeGroup
            .filter(d => d.data && d.data.__collapsed)
            .append('text')
            .attr('class', 'collapse-marker')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .text('+')
            .style('font-size', '10px')
            .style('font-weight', '700')
            .attr('fill', '#2c3e50')
            .style('pointer-events', 'none');

        if (showLabels) {
            const thresholdValue = calculateLabelThreshold(rootPack, sample);
            const selectedSet = getLabelLevelSet();

            g.selectAll('.node')
                .filter(d => {
                    const abundance = (d.data && d.data.abundances && d.data.abundances[sample]) ? d.data.abundances[sample] : 0;
                    const t = transformAbundance(abundance);
                    const depthFromLeaf = d.height;
                    const levelOk = !selectedSet || selectedSet.has(depthFromLeaf);
                    const sigOk = !singleSigActive || (d.data && d.data.__singleSigPass && d.data.__singleSigPass[sample]);
                    return levelOk && sigOk && Math.abs(t) >= thresholdValue;
                })
                .append('text')
                .attr('class', 'node-label')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.32em')
                .text(d => getDisplayName(d))
                .style('font-size', `${labelFontSize}px`)
                .attr('fill', d => getLabelColor(d))
                .style('pointer-events', 'all')
                .style('cursor', 'context-menu')
                .on('contextmenu', handleLabelRightClick)
                .call(applyLabelOverflow);
        }

    } else {
        // 树形布局
        const tree = d3.tree()
            .size([height - 100, width - 250]);

        layout = tree(hierarchy);
        nodes = layout.descendants();
        links = layout.links();

        // 预计算每个节点的显示半径，用于让连线在靠近节点时留白
        nodes.forEach(n => {
            const abundance = n.data.abundances[sample] || 0;
            const t = transformAbundance(abundance);
            n._nodeR = t > 0 ? sizeScale(t) : Math.max(1, adjustedMinSize * 0.7);
        });

        // 绘制连接线（树形），在 x 方向减去节点半径让连接更柔和
        const linkGenerator = d3.linkHorizontal()
            // 让连线延伸到节点中心，结合一致的不透明度以获得“融合”的外观
            .x(d => d.y)
            .y(d => d.x);

        // 树形布局同样不剔除非显著节点/连线，灰色显示

        g.selectAll('.link')
            .data(links)
            .join('path')
            .attr('class', 'link')
            .attr('d', linkGenerator)
            .attr('stroke', d => {
                const abundance = d.target.data.abundances[sample] || 0;
                const t = transformAbundance(abundance);
                const pass = !singleSigActive || !!(d.target.data && d.target.data.__singleSigPass && d.target.data.__singleSigPass[sample]);
                if (!pass) return NONSIG_LINK_COLOR;
                return t === 0 ? ZERO_LINK_COLOR : colorAt(t);
            })
            .attr('stroke-width', d => {
                const abundance = d.target.data.abundances[sample] || 0;
                const t = transformAbundance(abundance);
                return t === 0 ? 0.5 * edgeWidthMultiplier : strokeScale(Math.abs(t)) * edgeWidthMultiplier;
            })
            .attr('stroke-opacity', () => Math.max(0.05, Math.min(1, edgeOpacity)))
            .attr('fill', 'none')
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('transform', `translate(50, 50)`);

        // 绘制节点
        const nodeGroup = g.selectAll('.node')
            .data(nodes)
            .join('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${d.y + 50},${d.x + 50})`);

        nodeGroup.append('circle')
            .attr('r', d => {
                const abundance = d.data.abundances[sample] || 0;
                const t = transformAbundance(abundance);
                return t === 0 ? Math.max(1, adjustedMinSize * 0.7) : sizeScale(Math.abs(t));
            })
            .attr('fill', d => {
                // 统一节点与枝干的颜色
                const abundance = d.data.abundances[sample] || 0;
                const t = transformAbundance(abundance);
                const pass = !singleSigActive || !!(d.data && d.data.__singleSigPass && d.data.__singleSigPass[sample]);
                if (!pass) return NONSIG_NODE_COLOR;
                return t === 0 ? ZERO_NODE_COLOR : colorAt(t);
            })
            .attr('fill-opacity', () => Math.max(0, Math.min(1, nodeOpacity)))
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
            .style('pointer-events', 'all');

        // 折叠标记（树形布局）
        nodeGroup
            .filter(d => d.data && d.data.__collapsed)
            .append('text')
            .attr('class', 'collapse-marker')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .text('+')
            .style('font-size', '10px')
            .style('font-weight', '700')
            .attr('fill', '#2c3e50')
            .style('pointer-events', 'none');

        // 添加标签 - 树形布局
        if (showLabels) {
            const thresholdValue = calculateLabelThreshold(hierarchy, sample);
            const selectedSet = getLabelLevelSet();

            nodeGroup.filter(d => {
                const abundance = d.data.abundances[sample] || 0;
                const t = transformAbundance(abundance);
                const depthFromLeaf = d.height;
                const levelOk = !selectedSet || selectedSet.has(depthFromLeaf);
                const sigOk = !singleSigActive || (d.data && d.data.__singleSigPass && d.data.__singleSigPass[sample]);
                return levelOk && sigOk && Math.abs(t) >= thresholdValue;
            })
                .append('text')
                .attr('class', 'node-label')
                .attr('dy', '0.31em')
                .attr('x', d => d.children ? -10 : 10)
                .attr('text-anchor', d => d.children ? 'end' : 'start')
                .text(d => getDisplayName(d))
                .style('font-size', `${labelFontSize}px`)
                .attr('fill', d => getLabelColor(d))
                .attr('font-weight', '500')
                .style('pointer-events', 'all')
                .style('cursor', 'context-menu')
                .on('contextmenu', handleLabelRightClick)
                .call(applyLabelOverflow);
        }
    }

    // 添加交互
    addInteractions(g.selectAll('.node'), sample);

    // 根据用户设置决定是否在每个样本的 SVG 中创建图例
    if (showIndividualLegends) {
        const cat = (typeof window !== 'undefined' && window.colorSchemeCategory) ? window.colorSchemeCategory : 'sequential';
        // 优先使用手动颜色域 M，仅用于颜色图例显示
        let MmanualLeg = null;
        try {
            if (typeof window !== 'undefined' && typeof window.manualColorDomainValue === 'number' && isFinite(window.manualColorDomainValue) && window.manualColorDomainValue > 0) {
                MmanualLeg = window.manualColorDomainValue;
            } else if (typeof manualColorDomainValue === 'number' && isFinite(manualColorDomainValue) && manualColorDomainValue > 0) {
                MmanualLeg = manualColorDomainValue;
            }
        } catch(_) {}
        let legendDomain;
        if (typeof MmanualLeg === 'number' && isFinite(MmanualLeg) && MmanualLeg > 0) {
            if (cat === 'diverging') {
                legendDomain = dataHasNegatives ? [-MmanualLeg, 0, MmanualLeg] : [0, MmanualLeg / 2, MmanualLeg];
            } else {
                if (dataHasNegatives) {
                    legendDomain = [-MmanualLeg, MmanualLeg];
                } else {
                    const baseLow = (globalDomain && typeof globalDomain.low === 'number' && isFinite(globalDomain.low))
                        ? globalDomain.low
                        : 0;
                    const manualHigh = Math.max(MmanualLeg, baseLow);
                    legendDomain = [baseLow, manualHigh];
                }
            }
        } else if (cat === 'diverging') {
            const M = (globalDomain && globalDomain.max != null ? globalDomain.max : maxAbundance);
            if (dataHasNegatives) legendDomain = [-M, 0, M];
            else {
                const low = globalDomain ? globalDomain.low : 0;
                const high = globalDomain ? globalDomain.high : maxAbundance;
                legendDomain = [low, (low + high) / 2, high];
            }
        } else {
            legendDomain = (globalDomain ? [globalDomain.low, globalDomain.high] : [0, maxAbundance]);
        }
        createLegend(svg, width, height, legendDomain);
    }

    // 重置缩放
    svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity
    );
}

function createLegend(svg, width, height, legendDomain) {

    // remove any existing legend/gradient to avoid duplicates
    svg.selectAll('.legend-group').remove();
    // remove previous legend gradients (safe to remove linearGradients under defs)
    svg.selectAll('defs').selectAll('linearGradient').remove();

    // 根据 panel 大小动态调整 legend 尺寸
    const scaleFactor = Math.min(1, Math.min(width, height) / 600);
    const legendWidth = Math.max(100, 170 * scaleFactor);
    const legendHeight = Math.max(40, 60 * scaleFactor);
    const barWidth = legendWidth - 20;
    const barHeight = Math.max(10, 15 * scaleFactor);
    const fontSize = Math.max(7, 9 * scaleFactor);
    const titleFontSize = Math.max(6, 8 * scaleFactor);
    const padding = Math.max(8, 10 * scaleFactor);

    const legend = svg.append('g')
        .attr('class', 'legend-group')
        .attr('transform', `translate(20, 20)`);

    legend.append('rect')
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .attr('fill', 'white')
        .attr('stroke', '#ccc')
        .attr('stroke-width', 1)
        .attr('rx', 6);

    // 构建渐变：支持顺序（2端）与分歧（3端）两种模式
    const gradientId = `legend-gradient-${Date.now()}`;
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
        .attr('id', gradientId)
        .attr('x1', '0%')
        .attr('x2', '100%');

    const isDiverging = Array.isArray(legendDomain) && legendDomain.length === 3;
    if (isDiverging) {
        const palette = (typeof divergingPalette !== 'undefined' && divergingPalette) ? divergingPalette : 'blueRed';
        const scale = (typeof createDivergingColorScale === 'function')
            ? createDivergingColorScale(legendDomain, palette)
            : d3.scaleLinear().domain(legendDomain).range(['#2166ac','#ffffff','#b2182b']).clamp(true);

        // 采样生成渐变
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const val = legendDomain[0] + (legendDomain[2] - legendDomain[0]) * t;
            gradient.append('stop')
                .attr('offset', `${t * 100}%`)
                .attr('stop-color', scale((typeof colorSchemeReversed !== 'undefined' && colorSchemeReversed) ? -val : val));
        }
    } else {
        // 顺序型渐变
        let interpolator;
        if (colorScheme === 'Custom') {
            const stops = (Array.isArray(customColorStops) && customColorStops.length >= 2)
                ? customColorStops.slice()
                : [customColorStart, customColorEnd];
            interpolator = (stops.length === 2) ? d3.interpolate(stops[0], stops[1]) : d3.interpolateRgbBasis(stops);
        } else {
            const info = COLOR_SCHEMES[colorScheme] || {};
            interpolator = info.interpolator || d3.interpolateViridis;
        }
        const tFor = (v) => (typeof colorSchemeReversed !== 'undefined' && colorSchemeReversed) ? (1 - v) : v;
        gradient.append('stop').attr('offset', '0%').attr('stop-color', interpolator(tFor(0)));
        gradient.append('stop').attr('offset', '50%').attr('stop-color', interpolator(tFor(0.5)));
        gradient.append('stop').attr('offset', '100%').attr('stop-color', interpolator(tFor(1)));
    }

    // 渐变色条
    legend.append('rect')
        .attr('x', padding)
        .attr('y', legendHeight / 2 - barHeight / 2)
        .attr('width', barWidth)
        .attr('height', barHeight)
        .attr('fill', `url(#${gradientId})`)
        .attr('stroke', '#999')
        .attr('stroke-width', 0.5)
        .attr('rx', 2);

    // 标签：顺序（min/max）或分歧（min/0/max）
    const fmt = (v) => Number(v).toFixed(abundanceTransform === 'none' ? 0 : 2);
    if (isDiverging) {
        // 最小值
        legend.append('text')
            .attr('x', padding)
            .attr('y', legendHeight - 8)
            .attr('font-size', `${fontSize}px`)
            .attr('fill', '#666')
            .text(fmt(legendDomain[0]));
        // 中间 0：仅在域跨越0时显示（非负数据的分歧色标不显示0）
        if (legendDomain[0] < 0 && legendDomain[2] > 0) {
            legend.append('text')
                .attr('x', padding + barWidth / 2)
                .attr('y', legendHeight - 8)
                .attr('font-size', `${fontSize}px`)
                .attr('fill', '#666')
                .attr('text-anchor', 'middle')
                .text('0');
        }
        // 最大值
        legend.append('text')
            .attr('x', padding + barWidth)
            .attr('y', legendHeight - 8)
            .attr('font-size', `${fontSize}px`)
            .attr('fill', '#666')
            .attr('text-anchor', 'end')
            .text(fmt(legendDomain[2]));
    } else {
        // 最小值
        legend.append('text')
            .attr('x', padding)
            .attr('y', legendHeight - 8)
            .attr('font-size', `${fontSize}px`)
            .attr('fill', '#666')
            .text(fmt(legendDomain[0]));
        // 中间 0：当顺序色标的域跨越0时，显示中心0标签
        if (legendDomain[0] < 0 && legendDomain[1] > 0) {
            legend.append('text')
                .attr('x', padding + barWidth / 2)
                .attr('y', legendHeight - 8)
                .attr('font-size', `${fontSize}px`)
                .attr('fill', '#666')
                .attr('text-anchor', 'middle')
                .text('0');
        }
        // 最大值
        legend.append('text')
            .attr('x', padding + barWidth)
            .attr('y', legendHeight - 8)
            .attr('font-size', `${fontSize}px`)
            .attr('fill', '#666')
            .attr('text-anchor', 'end')
            .text(fmt(legendDomain[1]));
    }
    
    // 添加变换类型提示（小字）
    const transformHint = abundanceTransform === 'log' ? 'log10' : 
                         abundanceTransform === 'log2' ? 'log2' : 
                         abundanceTransform === 'sqrt' ? 'sqrt' : 
                         abundanceTransform === 'area' ? 'area' : 'linear';
    legend.append('text')
        .attr('x', legendWidth / 2)
        .attr('y', 13)
        .attr('font-size', `${titleFontSize}px`)
        .attr('fill', '#999')
        .attr('text-anchor', 'middle')
        .text(`${transformHint} (q${(quantileLow*100).toFixed(1).replace(/\.0$/,'')}%-q${(quantileHigh*100).toFixed(1).replace(/\.0$/,'')}%)`);
}

// 在 viz-container 底部渲染一个单一共享图例（HTML/CSS）
// moved to legend.js (window.renderSharedLegend)

/**
 * 处理标签右键点击
 */
function handleLabelRightClick(event, d) {
    event.preventDefault();
    event.stopPropagation();
    
    try {
        if (typeof window.hideVizExportMenu === 'function') {
            window.hideVizExportMenu();
        }
    } catch (_) {}
    
    const labelName = getFullLabelName(d);
    const displayName = getDisplayName(d);
    const nodePath = getNodeAncestorPath(d);
    const menu = document.getElementById('label-color-menu');
    const menuTitle = document.getElementById('label-color-menu-title');
    const colorPicker = document.getElementById('label-color-picker');
    
    console.log('Right click on label:', labelName, 'event position:', event.clientX, event.clientY);
    
    if (!menu || !menuTitle || !colorPicker) {
        console.error('Label color menu elements not found');
        return;
    }
    
    // 设置菜单标题 - 显示截断后的名称，但工具提示显示完整名称
    menuTitle.textContent = `Color: ${displayName}`;
    menuTitle.title = labelName; // 鼠标悬停显示完整名称
    
    // 设置颜色选择器当前值（优先节点级覆盖，其次标签级自定义/自动）
    let currentColor;
    if (nodePath && nodeColorOverrides && nodeColorOverrides.has(nodePath)) {
        currentColor = nodeColorOverrides.get(nodePath);
    } else if (customLabelColors.has(labelName)) {
        currentColor = customLabelColors.get(labelName);
    } else if (labelColorMap.has(labelName)) {
        currentColor = labelColorMap.get(labelName);
    } else {
        currentColor = generateDistinctColor(labelColorIndex);
    }
    
    console.log('Current color for', labelName, ':', currentColor);
    
    // 转换 HSL 颜色为 HEX (如果需要)
    if (currentColor.startsWith('hsl')) {
        // 创建临时元素来转换颜色
        const tempDiv = document.createElement('div');
        tempDiv.style.color = currentColor;
        document.body.appendChild(tempDiv);
        const rgbColor = window.getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);
        
        // 转换 RGB 到 HEX
        const rgb = rgbColor.match(/\d+/g);
        if (rgb) {
            const hex = '#' + rgb.map(x => {
                const hex = parseInt(x).toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            }).join('');
            colorPicker.value = hex;
            console.log('Converted HSL to HEX:', hex);
        }
    } else {
        colorPicker.value = currentColor;
    }
    
    // 存储当前标签名称与节点唯一路径
    menu.dataset.labelName = labelName;
    if (nodePath) menu.dataset.nodePath = nodePath;
    
    // 显示菜单 - 使用 clientX/Y 而不是 pageX/Y 以避免滚动问题
    menu.style.display = 'block';
    
    // 计算菜单位置，确保不超出屏幕
    const menuWidth = menu.offsetWidth || 240;
    const menuHeight = menu.offsetHeight || 150;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    let left = event.clientX;
    let top = event.clientY;
    
    // 如果菜单会超出右边界，向左调整
    if (left + menuWidth > windowWidth) {
        left = windowWidth - menuWidth - 10;
    }
    
    // 如果菜单会超出下边界，向上调整
    if (top + menuHeight > windowHeight) {
        top = windowHeight - menuHeight - 10;
    }
    
    console.log('Menu position:', { left, top, menuWidth, menuHeight });
    
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
}

/**
 * 隐藏右键菜单
 */
function hideLabelColorMenu() {
    const menu = document.getElementById('label-color-menu');
    menu.style.display = 'none';
}

/**
 * 获取节点的完整祖先路径,用于唯一标识节点在树中的位置
 * @param {Object} d - D3 hierarchy 节点
 * @returns {string} - 从根到当前节点的完整路径字符串
 */
function getNodeAncestorPath(d) {
    // 简单缓存以避免重复构建（当前绘制周期内）
    if (d && d._ancestorPath && typeof d._ancestorPath === 'string') {
        return d._ancestorPath;
    }
    const path = [];
    let current = d;
    while (current) {
        // 使用 fullName 或 name 作为路径的一部分
        const identifier = current.data.fullName || current.data.name || 'root';
        path.unshift(identifier);
        current = current.parent;
    }
    const joined = path.join('|');
    if (d) d._ancestorPath = joined;
    return joined;
}

function addInteractions(nodes, sample) {
    nodes
        .on('mouseover', function(event, d) {
            // 高亮当前节点
            d3.select(this).select('circle')
                .transition()
                .duration(200)
                .attr('stroke', '#ff6b6b')
                .attr('stroke-width', 2);

            // 构建 tooltip 内容
            const abundance = d.data.abundances[sample] || 0;
            let tooltipHtml = `
                <div class="tooltip-taxon">${d.data.name}</div>
                <div><strong>Sample:</strong> ${sample}</div>
                <div>Full path: ${d.data.fullName || 'Root'}</div>
                <div>Depth: ${d.depth}</div>
                <div class="tooltip-abundance">Value: ${abundance.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                ${d.children ? `<div>Children: ${d.children.length}</div>` : ''}
            `;

            // 如果启用了同步缩放，则在所有 panel 中高亮相同节点并收集丰度信息
            if (syncZoomEnabled && (visualizationMode === 'single' || visualizationMode === 'group')) {
                // 使用完整的祖先路径来唯一标识节点
                const nodeAncestorPath = getNodeAncestorPath(d);
                let activeSamples;
                if (visualizationMode === 'group') {
                    activeSamples = selectedGroups.slice();
                } else {
                    activeSamples = (typeof getActiveSamples === 'function') ? getActiveSamples() : selectedSamples.slice();
                }
                
                // 收集所有样本的丰度信息
                const otherAbundances = [];
                
                activeSamples.forEach(otherSample => {
                    // 跳过当前 sample - 只在其他 panel 中高亮
                    if (otherSample === sample) return;
                    
                    const otherSvg = svgs[otherSample];
                    if (!otherSvg) return;
                    
                    // 在其他 panel 中找到相同路径的节点并高亮
                    otherSvg.selectAll('.node').each(function(nodeData) {
                        const otherNodePath = getNodeAncestorPath(nodeData);
                        // 只有完整路径完全匹配时才高亮
                        if (otherNodePath === nodeAncestorPath) {
                            // 高亮节点
                            d3.select(this).select('circle')
                                .transition()
                                .duration(200)
                                .attr('stroke', '#ff6b6b')
                                .attr('stroke-width', 3);
                            
                            // 收集丰度信息
                            const otherAbund = nodeData.data.abundances[otherSample] || 0;
                            otherAbundances.push({
                                sample: otherSample,
                                abundance: otherAbund
                            });
                        }
                    });
                });
                
                // 如果有其他样本的丰度信息，添加到 tooltip
                if (otherAbundances.length > 0) {
                    tooltipHtml += '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3);"><strong>Other samples:</strong></div>';
                    otherAbundances.forEach(info => {
                        tooltipHtml += `<div style="font-size: 11px;"><strong>${info.sample}:</strong> ${info.abundance.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>`;
                    });
                }
            }
            
            tooltip
                .html(tooltipHtml)
                .classed('show', true)
                .style('left', (event.pageX + 15) + 'px')
                .style('top', (event.pageY - 15) + 'px');
        })
        .on('click', function(event, d) {
            // 仅对拥有子节点的数据节点进行折叠/展开
            if (d && d.data && Array.isArray(d.data.children) && d.data.children.length > 0) {
                const newState = !d.data.__collapsed;
                if (newState) {
                    if (!window._collapsedHistory) window._collapsedHistory = [];
                    window._collapsedHistory.push(d.data);
                }
                d.data.__collapsed = newState;
                // 重新渲染所有样本以保持一致
                initVisualization();
                drawAllTrees();
            }
        })
        .on('mouseout', function(event, d) {
            // 移除当前节点高亮
            d3.select(this).select('circle')
                .transition()
                .duration(200)
                .attr('stroke', 'none')
                .attr('stroke-width', 0);

            // 如果启用了同步缩放，则在所有 panel 中移除相同节点的高亮
            if (syncZoomEnabled && (visualizationMode === 'single' || visualizationMode === 'group')) {
                // 使用完整的祖先路径来唯一标识节点
                const nodeAncestorPath = getNodeAncestorPath(d);
                let activeSamples;
                if (visualizationMode === 'group') {
                    activeSamples = selectedGroups.slice();
                } else {
                    activeSamples = (typeof getActiveSamples === 'function') ? getActiveSamples() : selectedSamples.slice();
                }
                
                activeSamples.forEach(otherSample => {
                    if (otherSample === sample) return; // 跳过当前 sample
                    
                    const otherSvg = svgs[otherSample];
                    if (!otherSvg) return;
                    
                    // 在其他 panel 中找到相同路径的节点并移除高亮
                    otherSvg.selectAll('.node').each(function(nodeData) {
                        const otherNodePath = getNodeAncestorPath(nodeData);
                        // 只有完整路径完全匹配时才移除高亮
                        if (otherNodePath === nodeAncestorPath) {
                            d3.select(this).select('circle')
                                .transition()
                                .duration(200)
                                .attr('stroke', 'none')
                                .attr('stroke-width', 0);
                        }
                    });
                });
            }

            tooltip.classed('show', false);
        })
        .on('mousemove', function(event) {
            tooltip
                .style('left', (event.pageX + 15) + 'px')
                .style('top', (event.pageY - 15) + 'px');
        });
}

function updateStats(hierarchy, sample) {
    if (selectedSamples.length === 0) {
        document.getElementById('stats-panel').style.display = 'none';
        return;
    }

    let totalNodes = 0;
    let leafNodes = 0;
    let maxDepth = 0;

    hierarchy.each(node => {
        totalNodes++;
        if (!node.children) leafNodes++;
        if (node.depth > maxDepth) maxDepth = node.depth;
    });

    document.getElementById('total-nodes').textContent = totalNodes;
    document.getElementById('leaf-nodes').textContent = leafNodes;
    document.getElementById('max-depth').textContent = maxDepth;
    document.getElementById('stats-panel').style.display = 'flex';
}

// ========== 导出功能 ==========
function exportSVG() {
    const activeSamples = typeof getActiveSamples === 'function' ? getActiveSamples() : selectedSamples.slice();
    if (activeSamples.length === 0) {
        alert('Please select at least one sample');
        return;
    }
    activeSamples.forEach(sample => {
        const svgElement = document.querySelector(`#svg-container-${sample} svg`);
        if (!svgElement) return;
        
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `treemap_${sample}_${Date.now()}.svg`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

function exportPNG() {
    const activeSamples = typeof getActiveSamples === 'function' ? getActiveSamples() : selectedSamples.slice();
    if (activeSamples.length === 0) {
        alert('Please select at least one sample');
        return;
    }
    activeSamples.forEach(sample => {
        const svgElement = document.querySelector(`#svg-container-${sample} svg`);
        if (!svgElement) return;
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const img = new Image();
        
        const container = document.getElementById(`svg-container-${sample}`);
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        img.onload = function() {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `treemap_${sample}_${Date.now()}.png`;
                a.click();
                URL.revokeObjectURL(url);
            });
            URL.revokeObjectURL(url);
        };
        
        img.src = url;
    });
}

// Helpers: export a specific container by id (without #) with a filename prefix
// moved to utils/export.js (window.exportSVGForContainer, window.exportPNGForContainer)

function ensurePanelsRenderedForExport() {
    try {
        const fallbackMode = (typeof visualizationMode !== 'undefined') ? visualizationMode : 'single';
        const mode = (typeof window !== 'undefined' && window.visualizationMode) ? window.visualizationMode : fallbackMode;
        const vizContainer = document.getElementById('viz-container');
        if (!vizContainer) return;

        if (mode === 'group' || mode === 'single') {
            let targets = [];
            if (mode === 'group') {
                targets = Array.isArray(selectedGroups) ? selectedGroups.slice() : [];
            } else {
                if (typeof getActiveSamples === 'function') {
                    targets = getActiveSamples() || [];
                } else {
                    targets = Array.isArray(selectedSamples) ? selectedSamples.slice() : [];
                }
            }

            if (targets.length) {
                if (!lastGlobalDomain) {
                    drawAllTrees();
                }

                targets.forEach(sample => {
                    if (!sample) return;
                    const state = sampleRenderState[sample];
                    if (state && state.rendered && !state.dirty) return;
                    try {
                        drawTree(sample, lastGlobalDomain);
                        if (!sampleRenderState[sample]) {
                            sampleRenderState[sample] = { rendered: true, dirty: false };
                        } else {
                            sampleRenderState[sample].rendered = true;
                            sampleRenderState[sample].dirty = false;
                        }
                    } catch (err) {
                        console.warn('ensurePanelsRenderedForExport failed for', sample, err);
                    }
                });
            }
        }

        if (mode === 'comparison') {
            const hasTreeSvg = vizContainer.querySelector('.tree-svg-container svg');
            if (!hasTreeSvg && Array.isArray(window.comparisonResults) && window.comparisonResults.length > 0) {
                try {
                    const comp = window.currentModalComparison || window.comparisonResults[0];
                    if (comp) drawComparisonTree(comp.treatment_1, comp.treatment_2, comp.stats);
                } catch (err) {
                    console.warn('ensurePanelsRenderedForExport: redraw comparison failed', err);
                }
            }
        }

        if (mode === 'matrix') {
            const pendingLoaders = Array.from(document.querySelectorAll('.matrix-cell .cell-loading'));
            if (pendingLoaders.length && Array.isArray(window.comparisonResults)) {
                pendingLoaders.forEach(loader => {
                    const cell = loader.closest('.matrix-cell');
                    if (!cell || !cell.id) return;
                    const metaRaw = cell.dataset.comparison;
                    if (!metaRaw) return;
                    try {
                        const meta = JSON.parse(metaRaw);
                        const comp = window.comparisonResults.find(c =>
                            (c.treatment_1 === meta.treatment_1 && c.treatment_2 === meta.treatment_2) ||
                            (c.treatment_1 === meta.treatment_2 && c.treatment_2 === meta.treatment_1)
                        );
                        if (comp && typeof window.drawMiniComparisonTree === 'function') {
                            window.drawMiniComparisonTree(cell.id, comp.stats);
                        }
                    } catch (err) {
                        console.warn('ensurePanelsRenderedForExport: matrix cell render failed', err);
                    }
                });
            }
        }
    } catch (err) {
        console.warn('ensurePanelsRenderedForExport encountered an error', err);
    }
}

// Restore the most recently collapsed node (global across modes)
function restoreLastCollapsed() {
    try {
        if (!window._collapsedHistory) window._collapsedHistory = [];
        const hist = window._collapsedHistory;
        let restored = false;
        let dataRestored = null;
        while (hist.length > 0) {
            const data = hist.pop();
            if (data && data.__collapsed) {
                data.__collapsed = false;
                restored = true;
                dataRestored = data;
                break;
            }
        }
        if (restored) {
            // stash for optional center/highlight by other modules
            window._lastRestoredNodeData = dataRestored;
            if (typeof window.redrawCurrentViz === 'function') {
                window.redrawCurrentViz();
            } else {
                // fallback based on current mode
                try {
                    if (visualizationMode === 'single') {
                        initVisualization();
                        drawAllTrees();
                    } else if (visualizationMode === 'comparison') {
                        if (window.currentModalComparison && document.getElementById('comparison-modal-body')) {
                            const c = window.currentModalComparison;
                            drawComparisonTree(c.treatment_1, c.treatment_2, c.stats, { containerId: 'comparison-modal-body', isModal: true });
                        } else if (window.comparisonResults && window.comparisonResults.length > 0) {
                            const comp = window.comparisonResults[0];
                            drawComparisonTree(comp.treatment_1, comp.treatment_2, comp.stats);
                        }
                    } else if (visualizationMode === 'matrix') {
                        if (window.comparisonResults && window.comparisonResults.length > 0) {
                            drawComparisonMatrix(window.comparisonResults);
                        }
                    }
                } catch (e) { /* ignore */ }
            }
        } else {
            alert('No collapsed nodes to restore.');
        }
    } catch (err) {
        console.warn('restoreLastCollapsed failed', err);
    }
}
// expose to window for header buttons and other modules
if (typeof window !== 'undefined') {
    window.restoreLastCollapsed = restoreLastCollapsed;
    window.getFullLabelName = getFullLabelName;
    window.getDisplayName = getDisplayName;
    window.getLabelColor = getLabelColor;
    window.applyLabelOverflow = applyLabelOverflow;
    window.setNodeColorOverride = setNodeColorOverride;
    window.clearNodeColorOverride = clearNodeColorOverride;
    window.clearAllNodeColorOverrides = clearAllNodeColorOverrides;
    window.clearNodeOverridesByLabel = clearNodeOverridesByLabel;
    window.ensurePanelsRenderedForExport = ensurePanelsRenderedForExport;
}


