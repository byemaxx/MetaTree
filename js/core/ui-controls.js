/**
 * 宏基因组层级分类结构可视化平台 - UI 交互模块
 * Version: 2.0
 */

// 颜色方案类别标签：'sequential'（连续/顺序）、'diverging'（分歧，适合正负值）
let colorSchemeCategory = 'sequential';
// 将所选类别同步到全局，便于渲染端读取
try { if (typeof window !== 'undefined') window.colorSchemeCategory = colorSchemeCategory; } catch (_) { }



// 每种模式的颜色与域设置（single/group 共用，comparison/matrix 共用）
const MODE_COLOR_KEY_MAP = {
    single: 'individual',
    group: 'individual',
    comparison: 'comparison',
    matrix: 'comparison'
};

const FILE_FORMAT_INFO_CONTENT = {
    data: {
        title: 'Data File Format',
        html: `
            <p><strong>Supported inputs:</strong> Tab/CSV/plain-text files that contain either a wide abundance table or a combined long-format statistics table.</p>
            <div class="info-example">
                    <div class="info-example-title">Comparison Results Table</div>
                <div class="info-table-wrapper">
                    <table class="info-sample-table" aria-label="Wide hierarchy table example">
                        <thead>
                            <tr>
                                <th>Taxon</th>
                                <th>Sample_A</th>
                                <th>Sample_B</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>k__Bacteria|p__Firmicutes|c__Bacilli</td>
                                <td>123.4</td>
                                <td>98.1</td>
                            </tr>
                            <tr>
                                <td>k__Bacteria|p__Bacteroidota|c__Bacteroidia</td>
                                <td>56.0</td>
                                <td>44.2</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <ul class="info-modal-list">
                    <li>Column 1: full ranked path (separator defaults to | and can be edited via "Taxa rank separator").</li>
                    <li>Remaining columns: numeric values for each sample or condition.</li>
                    <li>Switch between tab, comma, or custom delimiters inside "Load parameters".</li>
                </ul>
            </div>
            <div class="info-example">
                <div class="info-example-title">Combined long-format stats</div>
                <div class="info-table-wrapper">
                    <table class="info-sample-table" aria-label="Long-format statistics example">
                        <thead>
                            <tr>
                                <th>Item_ID</th>
                                <th>condition</th>
                                <th>log2FoldChange</th>
                                <th>pvalue</th>
                                <th>padj</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>d__Archaea|p__Methanobacteriota|...</td>
                                <td>Control_vs_Group_A</td>
                                <td>1.37</td>
                                <td>0.0004</td>
                                <td>0.002</td>
                            </tr>
                            <tr>
                                <td>d__Bacteria|p__Actinobacteriota|...</td>
                                <td>Control_vs_Group_B</td>
                                <td>-0.85</td>
                                <td>0.013</td>
                                <td>0.040</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <ul class="info-modal-list">
                    <li>Item_ID must match a hierarchy node (taxon or taxa-function).</li>
                    <li>condition labels distinguish contrasts; log2FoldChange/pvalue/padj drive coloring and filtering.</li>
                    <li>Load the wide table, the long-format table, or both depending on your workflow.</li>
                </ul>
            </div>
            <p class="text-muted">Tip: Use the “Load Example” button to inspect a working template before uploading your own file.</p>
        `
    },
    meta: {
        title: 'Metadata File Format',
        html: `
            <p><strong>Purpose:</strong> Provide sample-level descriptors (Group, Treatment, Batch, etc.) so MetaTree can build groups, filters, and comparisons.</p>
            <div class="info-example">
                <div class="info-example-title">Metadata example</div>
                <div class="info-table-wrapper">
                    <table class="info-sample-table" aria-label="Metadata example">
                        <thead>
                            <tr>
                                <th>Sample</th>
                                <th>Group</th>
                                <th>Treatment</th>
                                <th>Sex</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Sample_A</td>
                                <td>Control</td>
                                <td>Placebo</td>
                                <td>Male</td>
                            </tr>
                            <tr>
                                <td>Sample_B</td>
                                <td>Treatment</td>
                                <td>DrugX</td>
                                <td>Female</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <ul class="info-modal-list">
                    <li>The Sample column must match headers from the data table (case-sensitive).</li>
                    <li>Additional columns are free-form; MetaTree lists them automatically in the UI.</li>
                    <li>Mix categorical and numeric fields as needed for grouping or filtering.</li>
                </ul>
            </div>
            <p class="text-muted">Use the same delimiter choice as the data file so both uploads can be parsed consistently.</p>
        `
    }
};

function createEmptyModeColorSetting() {
    return { colors: null, domain: null };
}

const modeColorSettings = {
    individual: createEmptyModeColorSetting(),
    group: null,
    comparison: createEmptyModeColorSetting(),
    matrix: null
};
// 共享引用，确保 single/group 与 comparison/matrix 公用配置
modeColorSettings.group = modeColorSettings.individual;
modeColorSettings.matrix = modeColorSettings.comparison;

let __suspendModeColorPersistence = false;

try { if (typeof window !== 'undefined') window.modeColorSettings = modeColorSettings; } catch (_) { }

// Cache for raw data content to allow re-parsing when delimiter changes
try {
    if (typeof window !== 'undefined') {
        window.cachedDataContent = null;
        window.cachedDataLabel = null;
    }
} catch (_) { }

const manualColorDomainStore = (() => {
    try {
        if (typeof window !== 'undefined' && window.manualColorDomainByMode && typeof window.manualColorDomainByMode === 'object') {
            const existing = window.manualColorDomainByMode;
            if (!Object.prototype.hasOwnProperty.call(existing, 'individual')) existing.individual = null;
            if (!Object.prototype.hasOwnProperty.call(existing, 'comparison')) existing.comparison = null;
            return existing;
        }
    } catch (_) { }
    return { individual: null, comparison: null };
})();

try { if (typeof window !== 'undefined') window.manualColorDomainByMode = manualColorDomainStore; } catch (_) { }

function getComparisonStoreForUI() {
    if (typeof getComparisonRendererStore === 'function') {
        try {
            const store = getComparisonRendererStore();
            if (store && typeof store.getSvg === 'function') {
                return store;
            }
        } catch (err) {
            console.warn('Comparison renderer store unavailable in UI', err);
        }
    }
    return null;
}

function getModeColorKey(mode) {
    const modeName = mode
        || ((typeof window !== 'undefined' && window.visualizationMode) ? window.visualizationMode
            : (typeof visualizationMode !== 'undefined' ? visualizationMode : 'single'));
    return MODE_COLOR_KEY_MAP[modeName] || 'individual';
}

function normalizeManualDomainValue(value) {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (typeof num !== 'number' || !isFinite(num) || num <= 0) return null;
    return num;
}

function datasetHasNegativesForColor() {
    if (typeof dataHasNegatives !== 'undefined') {
        return !!dataHasNegatives;
    }
    if (typeof window !== 'undefined' && typeof window.dataHasNegatives !== 'undefined') {
        return !!window.dataHasNegatives;
    }
    return false;
}

function getLastGlobalDomainForColor() {
    if (typeof lastGlobalDomain !== 'undefined' && lastGlobalDomain) {
        return lastGlobalDomain;
    }
    if (typeof window !== 'undefined' && window.lastGlobalDomain) {
        return window.lastGlobalDomain;
    }
    return null;
}

function getSequentialDomainMinForKey(modeKey) {
    if (modeKey !== 'individual') return null;
    if (datasetHasNegativesForColor()) return null;
    const domain = getLastGlobalDomainForColor();
    if (domain && typeof domain.low === 'number' && isFinite(domain.low)) {
        return domain.low;
    }
    return null;
}

function clampManualDomainValueForKey(value, modeKey) {
    if (value == null) return value;
    const min = getSequentialDomainMinForKey(modeKey);
    if (min == null || !isFinite(min)) return typeof value === 'string' ? parseFloat(value) : value;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (typeof num !== 'number' || !isFinite(num)) return num;
    return num < min ? min : num;
}

function formatDomainValueForInput(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '';
    if (typeof formatDomainInputValue === 'function') {
        try {
            return formatDomainInputValue(value);
        } catch (_) { /* fall through */ }
    }
    return String(value);
}

function syncGlobalManualColorDomain(value) {
    try { window.manualColorDomainValue = value; } catch (_) { }
    if (typeof manualColorDomainValue !== 'undefined') {
        try { manualColorDomainValue = value; } catch (_) { }
    }
}

function setManualDomainForMode(modeName, value) {
    const key = getModeColorKey(modeName);
    const normalized = normalizeManualDomainValue(value);
    manualColorDomainStore[key] = normalized;
    const currentKey = getModeColorKey();
    if (key === currentKey) {
        syncGlobalManualColorDomain(normalized);
    }
    return normalized;
}

function getManualDomainForMode(modeName) {
    const key = getModeColorKey(modeName);
    return normalizeManualDomainValue(manualColorDomainStore[key]);
}

function resetManualDomainForAllModes() {
    setManualDomainForMode('individual', null);
    setManualDomainForMode('comparison', null);
}

const LAYOUT_PANEL_CONTEXTS = {
    SAMPLES: 'samples',
    COMPARISON: 'comparison',
    MATRIX: 'matrix'
};
const VALID_LAYOUT_OPTIONS = new Set(['radial', 'tree', 'packing']);
const LAYOUT_PANEL_DEFAULTS = {
    [LAYOUT_PANEL_CONTEXTS.SAMPLES]: { layout: 'radial', panelWidth: 500, panelHeight: 500 },
    [LAYOUT_PANEL_CONTEXTS.COMPARISON]: { layout: 'radial', panelWidth: 900, panelHeight: 800 },
    [LAYOUT_PANEL_CONTEXTS.MATRIX]: { layout: 'radial', panelWidth: 200, panelHeight: 200 }
};
let layoutPanelSettingsStore = cloneLayoutPanelDefaults();
let activeLayoutPanelContext = null;

function cloneLayoutPanelDefaults() {
    const copy = {};
    Object.keys(LAYOUT_PANEL_DEFAULTS).forEach((key) => {
        copy[key] = { ...LAYOUT_PANEL_DEFAULTS[key] };
    });
    return copy;
}

function clampLayoutValue(val, min = 200, max = 2000) {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (!isFinite(num)) return min;
    return Math.min(max, Math.max(min, num));
}

function normalizeLayoutPanelEntry(entry, context) {
    const defaults = LAYOUT_PANEL_DEFAULTS[context] || LAYOUT_PANEL_DEFAULTS[LAYOUT_PANEL_CONTEXTS.SAMPLES];
    const normalized = {
        layout: defaults.layout,
        panelWidth: defaults.panelWidth,
        panelHeight: defaults.panelHeight
    };
    if (entry && typeof entry === 'object') {
        if (entry.layout && VALID_LAYOUT_OPTIONS.has(entry.layout)) normalized.layout = entry.layout;
        if (entry.panelWidth != null) normalized.panelWidth = clampLayoutValue(entry.panelWidth);
        if (entry.panelHeight != null) normalized.panelHeight = clampLayoutValue(entry.panelHeight);
    }
    return normalized;
}

function getLayoutPanelSettingsForContext(context) {
    const ctx = context || LAYOUT_PANEL_CONTEXTS.SAMPLES;
    if (!layoutPanelSettingsStore[ctx]) {
        layoutPanelSettingsStore[ctx] = { ...LAYOUT_PANEL_DEFAULTS[ctx] };
    }
    return layoutPanelSettingsStore[ctx];
}

function setLayoutPanelSettingsForContext(context, partial) {
    const ctx = context || LAYOUT_PANEL_CONTEXTS.SAMPLES;
    const existing = getLayoutPanelSettingsForContext(ctx);
    const updated = normalizeLayoutPanelEntry({ ...existing, ...partial }, ctx);
    layoutPanelSettingsStore[ctx] = updated;
    if (ctx === activeLayoutPanelContext) {
        applyLayoutPanelSettingsToDom(updated, ctx);
        syncLayoutPanelInputsToSettings(updated);
    }
    return updated;
}

function getActiveLayoutPanelContext(modeOverride) {
    const mode = (modeOverride)
        || ((typeof window !== 'undefined' && window.visualizationMode) ? window.visualizationMode
            : (typeof visualizationMode !== 'undefined' ? visualizationMode : 'single'));
    if (mode === 'comparison') return LAYOUT_PANEL_CONTEXTS.COMPARISON;
    if (mode === 'matrix') {
        const inlineActive = typeof window !== 'undefined' && window.currentInlineComparison;
        return inlineActive ? LAYOUT_PANEL_CONTEXTS.COMPARISON : LAYOUT_PANEL_CONTEXTS.MATRIX;
    }
    return LAYOUT_PANEL_CONTEXTS.SAMPLES;
}

function setActiveLayoutPanelContext(context, options = {}) {
    const nextContext = context || getActiveLayoutPanelContext();
    const changed = activeLayoutPanelContext !== nextContext || options.force;
    activeLayoutPanelContext = nextContext;
    const settings = getLayoutPanelSettingsForContext(nextContext);
    if (changed || options.syncUi !== false) {
        syncLayoutPanelInputsToSettings(settings);
    }
    if (changed || options.applyDom !== false) {
        applyLayoutPanelSettingsToDom(settings, nextContext);
    }
    return settings;
}

function syncLayoutPanelInputsToSettings(settings) {
    if (!settings) return;
    const layoutSelect = document.getElementById('layout-select');

    // Always update visibility based on settings, not just if changed
    if (settings.layout) {
        if (layoutSelect && layoutSelect.value !== settings.layout) {
            layoutSelect.value = settings.layout;
        }
        currentLayout = settings.layout;
        try { if (typeof window !== 'undefined') window.currentLayout = currentLayout; } catch (_) { }

        // Update visibility for Tree/Radial settings
        const visible = (currentLayout === 'tree' || currentLayout === 'radial');
        document.querySelectorAll('.tree-only-setting').forEach(el => {
            el.style.display = visible ? 'flex' : 'none';
            el.setAttribute('aria-hidden', visible ? 'false' : 'true');
        });

        // Tree Direction is Tree-only
        const treeDirRow = document.getElementById('tree-direction-row');
        if (treeDirRow) {
            treeDirRow.style.display = (currentLayout === 'tree') ? 'flex' : 'none';
            treeDirRow.setAttribute('aria-hidden', (currentLayout === 'tree') ? 'false' : 'true');
        }
    }
    const panelSlider = document.getElementById('panel-width-slider');
    const panelValue = document.getElementById('panel-width-value');
    if (panelSlider && typeof settings.panelWidth === 'number') {
        panelSlider.value = String(settings.panelWidth);
        if (panelValue) panelValue.textContent = `${settings.panelWidth}px`;
    }
    const heightSlider = document.getElementById('panel-height-slider');
    const heightValue = document.getElementById('panel-height-value');
    if (heightSlider && typeof settings.panelHeight === 'number') {
        heightSlider.value = String(settings.panelHeight);
        if (heightValue) heightValue.textContent = `${settings.panelHeight}px`;
    }
}

function applyLayoutPanelSettingsToDom(settings, context) {
    if (!settings) return;
    const ctx = context || activeLayoutPanelContext || LAYOUT_PANEL_CONTEXTS.SAMPLES;
    if (ctx === LAYOUT_PANEL_CONTEXTS.MATRIX) {
        document.documentElement.style.setProperty('--matrix-cell-min-width', `${settings.panelWidth}px`);
        document.documentElement.style.setProperty('--matrix-cell-min-height', `${settings.panelHeight}px`);
        const matrixGrid = document.getElementById('comparison-matrix-grid');
        if (matrixGrid) {
            matrixGrid.style.setProperty('--matrix-cell-min-width', `${settings.panelWidth}px`);
            matrixGrid.style.setProperty('--matrix-cell-min-height', `${settings.panelHeight}px`);
        }
    } else {
        document.documentElement.style.setProperty('--panel-min-width', `${settings.panelWidth}px`);
        document.documentElement.style.setProperty('--panel-svg-height', `${settings.panelHeight}px`);
        document.documentElement.style.setProperty('--comparison-panel-svg-height', `${settings.panelHeight}px`);
    }
}

function handleRendererLayoutContextChange() {
    setActiveLayoutPanelContext(getActiveLayoutPanelContext(), { force: true });
}

try { if (typeof window !== 'undefined') window.getLayoutPanelSettingsForContext = getLayoutPanelSettingsForContext; } catch (_) { }
try { if (typeof window !== 'undefined') window.requestLayoutPanelContextSync = handleRendererLayoutContextChange; } catch (_) { }
function cloneColorSettings(colors) {
    if (!colors) return null;
    return {
        scheme: colors.scheme || null,
        category: colors.category || null,
        reversed: !!colors.reversed,
        divergingPalette: colors.divergingPalette || null,
        customStops: Array.isArray(colors.customStops) ? colors.customStops.slice() : null,
        customStart: colors.customStart || null,
        customEnd: colors.customEnd || null,
        customMid: colors.customMid || null,
        zeroColor: colors.zeroColor || null
    };
}

function getDefaultDivergingPalette() {
    try {
        if (typeof getDivergingPalettes === 'function') {
            const palettes = getDivergingPalettes();
            const keys = palettes ? Object.keys(palettes) : [];
            if (keys.length > 0) return keys[0];
        }
    } catch (_) { }
    return 'blueRed';
}

function getDefaultModeColorSettings(key) {
    if (key === 'comparison') {
        return {
            colors: {
                scheme: (typeof colorScheme !== 'undefined') ? colorScheme : 'Viridis',
                category: 'diverging',
                reversed: false,
                divergingPalette: getDefaultDivergingPalette(),
                customStops: Array.isArray(customColorStops) ? customColorStops.slice() : null,
                customStart: (typeof customColorStart !== 'undefined') ? customColorStart : null,
                customEnd: (typeof customColorEnd !== 'undefined') ? customColorEnd : null,
                customMid: (typeof customColorMid !== 'undefined') ? customColorMid : null,
                zeroColor: (typeof customZeroColor !== 'undefined') ? customZeroColor : null
            },
            domain: getManualDomainForMode(key)
        };
    }
    return {
        colors: {
            scheme: (typeof colorScheme !== 'undefined') ? colorScheme : 'Viridis',
            category: colorSchemeCategory || 'sequential',
            reversed: (typeof colorSchemeReversed !== 'undefined') ? !!colorSchemeReversed : false,
            divergingPalette: (typeof divergingPalette !== 'undefined') ? divergingPalette : getDefaultDivergingPalette(),
            customStops: Array.isArray(customColorStops) ? customColorStops.slice() : null,
            customStart: (typeof customColorStart !== 'undefined') ? customColorStart : null,
            customEnd: (typeof customColorEnd !== 'undefined') ? customColorEnd : null,
            customMid: (typeof customColorMid !== 'undefined') ? customColorMid : null,
            zeroColor: (typeof customZeroColor !== 'undefined') ? customZeroColor : null
        },
        domain: getManualDomainForMode(key)
    };
}

function snapshotCurrentColorSettings() {
    return {
        scheme: (typeof colorScheme !== 'undefined') ? colorScheme : (typeof window !== 'undefined' ? window.colorScheme : null),
        category: colorSchemeCategory || ((typeof window !== 'undefined') ? window.colorSchemeCategory : null),
        reversed: (typeof colorSchemeReversed !== 'undefined') ? !!colorSchemeReversed : !!(typeof window !== 'undefined' && window.colorSchemeReversed),
        divergingPalette: (typeof divergingPalette !== 'undefined') ? divergingPalette : (typeof window !== 'undefined' ? window.divergingPalette : null),
        customStops: Array.isArray(customColorStops) ? customColorStops.slice() : null,
        customStart: (typeof customColorStart !== 'undefined') ? customColorStart : null,
        customEnd: (typeof customColorEnd !== 'undefined') ? customColorEnd : null,
        customMid: (typeof customColorMid !== 'undefined') ? customColorMid : null,
        zeroColor: (typeof customZeroColor !== 'undefined') ? customZeroColor : null
    };
}

function snapshotCurrentColorDomain(modeName) {
    const manual = getManualDomainForMode(modeName);
    if (manual != null) return manual;
    if (typeof window !== 'undefined' && typeof window.manualColorDomainValue === 'number' && isFinite(window.manualColorDomainValue) && window.manualColorDomainValue > 0) {
        return window.manualColorDomainValue;
    }
    if (typeof manualColorDomainValue === 'number' && isFinite(manualColorDomainValue) && manualColorDomainValue > 0) {
        return manualColorDomainValue;
    }
    return null;
}

function persistCurrentModeColorSettings(modeOverride) {
    if (__suspendModeColorPersistence) return;
    const modeName = modeOverride
        || ((typeof window !== 'undefined' && window.visualizationMode) ? window.visualizationMode
            : (typeof visualizationMode !== 'undefined' ? visualizationMode : 'single'));
    const key = getModeColorKey(modeName);
    const entry = modeColorSettings[key];
    if (!entry) return;
    entry.colors = cloneColorSettings(snapshotCurrentColorSettings());
    entry.domain = snapshotCurrentColorDomain(modeName);
    try { if (typeof window !== 'undefined') window.modeColorSettings = modeColorSettings; } catch (_) { }
}

function applyModeColorSettings(modeName) {
    const key = getModeColorKey(modeName);
    const entry = modeColorSettings[key] || createEmptyModeColorSetting();
    const defaults = getDefaultModeColorSettings(key);
    const colorsToApply = cloneColorSettings(entry.colors) || cloneColorSettings(defaults.colors);
    const domainToApply = (entry.domain !== undefined && entry.domain !== null) ? entry.domain : defaults.domain;

    __suspendModeColorPersistence = true;
    try {
        applyColorSettingsSnapshot(colorsToApply, modeName);
        applyDomainValueToUI(domainToApply, modeName);
    } finally {
        __suspendModeColorPersistence = false;
    }
    renderColorPreviews && renderColorPreviews();
}

function applyColorSettingsSnapshot(colors, modeName) {
    const isComparisonMode = modeName === 'comparison' || modeName === 'matrix';
    const category = (colors && colors.category) ? colors.category : (isComparisonMode ? 'diverging' : 'sequential');
    colorSchemeCategory = category;
    try { if (typeof window !== 'undefined') window.colorSchemeCategory = colorSchemeCategory; } catch (_) { }

    const scheme = (category === 'custom')
        ? 'Custom'
        : (colors && colors.scheme) ? colors.scheme : ((typeof colorScheme !== 'undefined') ? colorScheme : 'Viridis');
    if (typeof colorScheme !== 'undefined') {
        colorScheme = scheme;
    }
    try { if (typeof window !== 'undefined') window.colorScheme = colorScheme; } catch (_) { }

    if (typeof colorSchemeReversed !== 'undefined') {
        colorSchemeReversed = !!(colors && Object.prototype.hasOwnProperty.call(colors, 'reversed') ? colors.reversed : colorSchemeReversed);
    }
    try { if (typeof window !== 'undefined') window.colorSchemeReversed = colorSchemeReversed; } catch (_) { }

    const palette = (colors && colors.divergingPalette) ? colors.divergingPalette : getDefaultDivergingPalette();
    if (typeof divergingPalette !== 'undefined') {
        divergingPalette = palette;
    }
    try { if (typeof window !== 'undefined') window.divergingPalette = divergingPalette; } catch (_) { }

    const stops = (colors && Array.isArray(colors.customStops) && colors.customStops.length >= 2)
        ? colors.customStops.slice()
        : (Array.isArray(customColorStops) ? customColorStops.slice() : [(typeof customColorStart !== 'undefined' ? customColorStart : '#70706B'), (typeof customColorEnd !== 'undefined' ? customColorEnd : '#08519c')]);
    if (typeof customColorStops !== 'undefined') {
        customColorStops = stops.slice();
        try { if (typeof window !== 'undefined') window.customColorStops = customColorStops.slice(); } catch (_) { }
    }
    if (typeof customColorStart !== 'undefined' && colors && colors.customStart) {
        customColorStart = colors.customStart;
        try { if (typeof window !== 'undefined') window.customColorStart = customColorStart; } catch (_) { }
    }
    if (typeof customColorEnd !== 'undefined' && colors && colors.customEnd) {
        customColorEnd = colors.customEnd;
        try { if (typeof window !== 'undefined') window.customColorEnd = customColorEnd; } catch (_) { }
    }
    if (typeof customColorMid !== 'undefined' && colors && colors.customMid) {
        customColorMid = colors.customMid;
        try { if (typeof window !== 'undefined') window.customColorMid = customColorMid; } catch (_) { }
    }

    updateCustomColorInputsFromStops(customColorStops);
    if (typeof customZeroColor !== 'undefined') {
        customZeroColor = (colors && Object.prototype.hasOwnProperty.call(colors, 'zeroColor'))
            ? (colors.zeroColor || null)
            : customZeroColor || null;
        try { if (typeof window !== 'undefined') window.customZeroColor = customZeroColor; } catch (_) { }
    }
    updateZeroColorControl(customZeroColor);

    const rev = document.getElementById('color-reverse');
    if (rev) rev.checked = !!colorSchemeReversed;

    const customControls = document.getElementById('custom-color-controls');
    if (customControls) customControls.style.display = (colorSchemeCategory === 'custom') ? 'flex' : 'none';
}

function updateCustomColorInputsFromStops(stops) {
    const effectiveStops = Array.isArray(stops) && stops.length >= 2 ? stops.slice() : [customColorStart, customColorEnd];
    const count = Math.max(2, Math.min(5, effectiveStops.length));
    const start = document.getElementById('custom-color-start');
    const end = document.getElementById('custom-color-end');
    if (start && effectiveStops[0]) start.value = effectiveStops[0];
    if (end && effectiveStops[count - 1]) end.value = effectiveStops[count - 1];

    const mids = effectiveStops.slice(1, count - 1);
    const midEls = [
        document.getElementById('custom-color-mid'),
        document.getElementById('custom-color-mid2'),
        document.getElementById('custom-color-mid3')
    ];
    const arrowEls = [
        document.getElementById('custom-arrow-mid'),
        document.getElementById('custom-arrow-mid2'),
        document.getElementById('custom-arrow-mid3')
    ];
    midEls.forEach((el, idx) => {
        const shouldShow = count >= idx + 3;
        if (el) {
            el.style.display = shouldShow ? 'inline-block' : 'none';
            if (shouldShow && mids[idx]) el.value = mids[idx];
        }
        if (arrowEls[idx]) arrowEls[idx].style.display = shouldShow ? 'inline-block' : 'none';
    });
    const stopsCount = document.getElementById('custom-stops-count');
    if (stopsCount) stopsCount.value = String(count);
}

const ZERO_COLOR_CONTROLS = [
    { toggleId: 'zero-color-toggle', inputId: 'zero-color-input' },
    { toggleId: 'zero-color-theme-toggle', inputId: 'zero-color-theme-input' }
];

let zeroColorRedrawTimeout = null;

function updateZeroColorControl(value) {
    const hasValue = typeof value === 'string' && value.trim().length > 0;
    ZERO_COLOR_CONTROLS.forEach(({ toggleId, inputId }) => {
        const toggle = document.getElementById(toggleId);
        const input = document.getElementById(inputId);
        if (toggle) toggle.checked = hasValue;
        if (input) {
            input.disabled = !hasValue;
            input.classList.toggle('disabled', !hasValue);
            if (hasValue) input.value = value;
            else if (typeof input.defaultValue === 'string') input.value = input.defaultValue;
        }
    });
}

function applyZeroColorValue(nextValue) {
    customZeroColor = nextValue;
    try { if (typeof window !== 'undefined') window.customZeroColor = customZeroColor; } catch (_) { }
    updateZeroColorControl(customZeroColor);
    if (zeroColorRedrawTimeout) clearTimeout(zeroColorRedrawTimeout);
    zeroColorRedrawTimeout = setTimeout(() => {
        zeroColorRedrawTimeout = null;
        renderColorPreviews && renderColorPreviews();
        if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
        persistCurrentModeColorSettings();
    }, 200);
}

function bindZeroColorControl(toggleId, inputId) {
    const toggle = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (toggle) {
        toggle.addEventListener('change', () => {
            applyZeroColorValue(toggle.checked && input ? input.value : null);
        });
    }
    if (input) {
        input.addEventListener('input', () => {
            if (!toggle || !toggle.checked) return;
            applyZeroColorValue(input.value);
        });
    }
}

function applyDomainValueToUI(domainValue, modeName) {
    const input = document.getElementById('color-domain-abs');
    const key = getModeColorKey(modeName);
    const isComparisonMode = key === 'comparison';
    let valueToApply = domainValue;
    if (valueToApply != null) {
        valueToApply = clampManualDomainValueForKey(valueToApply, key);
    }
    const normalized = setManualDomainForMode(key, valueToApply);
    if (normalized != null) {
        if (isComparisonMode) {
            try { comparisonColorDomain = [-normalized, 0, normalized]; }
            catch (_) { if (typeof window !== 'undefined') window.comparisonColorDomain = [-normalized, 0, normalized]; }
        }
        if (input) input.value = formatDomainValueForInput(normalized);
    } else {
        if (isComparisonMode) {
            try { comparisonColorDomain = [-5, 0, 5]; }
            catch (_) { if (typeof window !== 'undefined') window.comparisonColorDomain = [-5, 0, 5]; }
            if (input) input.value = 5;
        } else if (input) {
            input.value = '';
        }
    }
}

function encodeDelimiterForDisplay(value) {
    if (typeof value !== 'string' || value.length === 0) return '';
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\t/g, '\\t')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\0/g, '\\0');
}

function toggleCustomDelimiterInput(input, shouldShow) {
    if (!input) return;
    const visible = !!shouldShow;
    input.classList.toggle('visible', visible);
    input.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function rebuildTreeAfterTaxaDelimiterChange() {
    if (!Array.isArray(rawData) || rawData.length === 0) return;
    try {
        treeData = buildHierarchy(rawData);
        activeTreeData = null;
        initVisualization();
        drawAllTrees();
        if (selectedSamples && selectedSamples.length > 0) {
            const hierarchy = d3.hierarchy(treeData);
            updateStats(hierarchy, selectedSamples[0]);
        }
    } catch (error) {
        console.error('Failed to rebuild tree after taxa delimiter change', error);
        alert('Failed to rebuild tree with the new taxa separator: ' + (error?.message || error));
    }
}

// 获取当前元数据文件分隔符设置
function getMetaFileDelimiter() {
    const sel = document.getElementById('meta-delimiter-select');
    // If element doesn't exist yet (e.g. old html cached), fallback to data delimiter or tab
    if (!sel) return getDataFileDelimiter(); // Fallback to data setting if meta specific not found
    if (sel.value === 'tab') return '\t';
    if (sel.value === 'comma') return ',';
    if (sel.value === 'custom') {
        const inp = document.getElementById('meta-delimiter-custom');
        return (inp && inp.value) ? inp.value : '\t';
    }
    return '\t';
}

function reparseCurrentData() {
    if (typeof window.cachedDataContent === 'string') {
        try {
            console.log('Reparsing data with new delimiter...');
            const opts = (typeof window.cachedDataOptions === 'object' && window.cachedDataOptions)
                ? window.cachedDataOptions
                : { label: window.cachedDataLabel };
            loadDataFromText(window.cachedDataContent, opts);
        } catch (e) {
            console.error('Reparse failed:', e);
            alert('Failed to reparse data with new settings: ' + e.message);
        }
    }
}

function reparseCurrentMeta() {
    if (typeof window.cachedMetaContent === 'string') {
        try {
            console.log('Reparsing meta with new delimiter...');
            loadMetaFromText(window.cachedMetaContent, { label: window.cachedMetaLabel });
        } catch (e) {
            console.error('Reparse meta failed:', e);
            // Optionally alert user
        }
    }
}

function initDataParameterControls() {
    const toggle = document.getElementById('data-params-toggle');
    if (toggle) {
        toggle.addEventListener('click', function () {
            const content = document.getElementById('data-params-content');
            if (!content) return;
            const visible = window.getComputedStyle(content).display !== 'none';
            content.style.display = visible ? 'none' : 'block';
            this.textContent = visible ? 'Expand ▼' : 'Collapse ▲';
        });
    }

    const dataSelect = document.getElementById('data-delimiter-select');
    const dataCustom = document.getElementById('data-delimiter-custom');
    const taxaSelect = document.getElementById('taxa-delimiter-select');
    const taxaCustom = document.getElementById('taxa-delimiter-custom');

    const readDataDelimiter = () => {
        try {
            return (typeof getDataFileDelimiter === 'function') ? getDataFileDelimiter() : '\t';
        } catch (_) {
            return '\t';
        }
    };
    const readTaxaDelimiter = () => {
        try {
            return (typeof getTaxonRankDelimiter === 'function') ? getTaxonRankDelimiter() : '|';
        } catch (_) {
            return '|';
        }
    };
    const applyDataDelimiterValue = (value) => {
        if (typeof value !== 'string' || value.length === 0) return;
        if (typeof setDataFileDelimiter === 'function') {
            setDataFileDelimiter(value);
        }

        // Re-parse immediately if we have loaded data
        if (typeof window !== 'undefined' && window.cachedDataContent) {
            try {
                // Ensure loadDataFromText is available
                const opts = (typeof window.cachedDataOptions === 'object' && window.cachedDataOptions)
                    ? window.cachedDataOptions
                    : { label: window.cachedDataLabel };
                if (typeof loadDataFromText === 'function') {
                    loadDataFromText(window.cachedDataContent, opts);
                } else if (typeof window.loadDataFromText === 'function') {
                    window.loadDataFromText(window.cachedDataContent, opts);
                }
                if (typeof showToast === 'function') {
                    // Display '\t' for tab character so it is visible, otherwise use raw value
                    const displayValue = value === '\t' ? '\\t' : value;
                    showToast('Data re-parsed with new delimiter: ' + displayValue);
                }
            } catch (err) {
                console.error('Failed to re-parse data with new delimiter', err);
                showToast('Failed to re-parse data with new delimiter: ' + err.message);
            }
        }

        syncDataControls();
    };

    const applyTaxaDelimiterValue = (value) => {
        if (typeof value !== 'string' || value.length === 0) return;
        const current = readTaxaDelimiter();
        if (current === value) {
            syncTaxaControls();
            return;
        }
        if (typeof setTaxonRankDelimiter === 'function') {
            setTaxonRankDelimiter(value);
        }
        rebuildTreeAfterTaxaDelimiterChange();
        syncTaxaControls();
        if (typeof showToast === 'function') {
            const displayValue = value === '\t' ? '\\t' : value;
            showToast('Taxa separator updated: ' + displayValue);
        }
    };

    const applyDataCustom = () => {
        if (!dataCustom) return;
        const value = dataCustom.value;
        if (typeof value !== 'string' || value.length === 0) return;
        applyDataDelimiterValue(value);
    };

    const applyTaxaCustom = () => {
        if (!taxaCustom) return;
        const value = taxaCustom.value;
        if (typeof value !== 'string' || value.length === 0) return;
        applyTaxaDelimiterValue(value);
    };
    const syncDataControls = () => {
        if (!dataSelect) return;
        const current = readDataDelimiter();
        if (current === '\t') {
            dataSelect.value = 'tab';
            toggleCustomDelimiterInput(dataCustom, false);
        } else if (current === ',') {
            dataSelect.value = 'comma';
            toggleCustomDelimiterInput(dataCustom, false);
        } else {
            dataSelect.value = 'custom';
            toggleCustomDelimiterInput(dataCustom, true);
            if (dataCustom) dataCustom.value = encodeDelimiterForDisplay(current);
        }
    };
    const syncTaxaControls = () => {
        if (!taxaSelect) return;
        const current = readTaxaDelimiter();
        if (current === '|') {
            taxaSelect.value = 'pipe';
            toggleCustomDelimiterInput(taxaCustom, false);
        } else if (current === ',') {
            taxaSelect.value = 'comma';
            toggleCustomDelimiterInput(taxaCustom, false);
        } else if (current === ';') {
            taxaSelect.value = 'semicolon';
            toggleCustomDelimiterInput(taxaCustom, false);
        } else {
            taxaSelect.value = 'custom';
            toggleCustomDelimiterInput(taxaCustom, true);
            if (taxaCustom) taxaCustom.value = encodeDelimiterForDisplay(current);
        }
    };
    const applyDataPreset = (preset) => {
        switch (preset) {
            case 'tab':
                applyDataDelimiterValue('\t');
                break;
            case 'comma':
                applyDataDelimiterValue(',');
                break;
            case 'custom':
                toggleCustomDelimiterInput(dataCustom, true);
                if (dataCustom && dataCustom.value && dataCustom.value.length > 0) {
                    applyDataCustom();
                } else if (dataCustom) {
                    dataCustom.focus();
                }
                break;
            default:
                applyDataDelimiterValue(readDataDelimiter());
                break;
        }
    };
    const applyTaxaPreset = (preset) => {
        switch (preset) {
            case 'pipe':
                applyTaxaDelimiterValue('|');
                break;
            case 'comma':
                applyTaxaDelimiterValue(',');
                break;
            case 'semicolon':
                applyTaxaDelimiterValue(';');
                break;
            case 'custom':
                toggleCustomDelimiterInput(taxaCustom, true);
                if (taxaCustom && taxaCustom.value && taxaCustom.value.length > 0) {
                    applyTaxaCustom();
                } else if (taxaCustom) {
                    taxaCustom.focus();
                }
                break;
            default:
                applyTaxaDelimiterValue(readTaxaDelimiter());
                break;
        }
    };

    if (dataSelect) {
        dataSelect.addEventListener('change', () => {
            applyDataPreset(dataSelect.value);
        });
    }
    if (dataCustom) {
        dataCustom.addEventListener('change', applyDataCustom);
        dataCustom.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyDataCustom();
            }
        });
    }
    if (taxaSelect) {
        taxaSelect.addEventListener('change', () => {
            applyTaxaPreset(taxaSelect.value);
        });
    }
    if (taxaCustom) {
        taxaCustom.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyTaxaCustom();
            }
        });
    }

    // Duplicate ID Handling
    const duplicateSelect = document.getElementById('duplicate-id-handling');
    if (duplicateSelect) {
        duplicateSelect.addEventListener('change', () => {
            reparseCurrentData();
            if (typeof showToast === 'function') {
                showToast('Data re-parsed with new duplicate handling: ' + duplicateSelect.value);
            }
        });
    }

    // Meta Delimiter Controls
    const metaSelect = document.getElementById('meta-delimiter-select');
    const metaCustomInput = document.getElementById('meta-delimiter-custom');

    if (metaSelect) {
        metaSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                if (metaCustomInput) {
                    metaCustomInput.style.display = 'block';
                    metaCustomInput.setAttribute('aria-hidden', 'false');
                    metaCustomInput.focus();
                }
            } else {
                if (metaCustomInput) {
                    metaCustomInput.style.display = 'none';
                    metaCustomInput.setAttribute('aria-hidden', 'true');
                }
                const delimName = e.target.value === 'tab' ? 'Tab' : 'Comma';
                if (typeof showToast === 'function') showToast(`Meta delimiter set to ${delimName}`);
                reparseCurrentMeta();
            }
        });
    }

    if (metaCustomInput) {
        metaCustomInput.addEventListener('change', () => {
            reparseCurrentMeta();
        });
    }

    syncDataControls();
    syncTaxaControls();
}

// ========== File Preview Logic ==========

function renderPreviewTable(text, delimiter, containerId, context = 'data') {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!text) {
        container.innerHTML = '<p class="text-muted">No content to preview.</p>';
        return;
    }

    const allLines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    // Do not count the header row in totals or preview counts
    const totalRows = Math.max(0, allLines.length - 1);
    const headerLine = allLines.length > 0 ? allLines[0] : '';
    const lines = allLines.slice(1, 1 + 20); // First 20 data rows (exclude header)
    if (lines.length === 0) {
        container.innerHTML = '<p class="text-muted">File is empty.</p>';
        return;
    }

    // Header with controls
    const controlsHtml = `
        <div class="preview-toolbar flex ai-center justify-between mb-12" style="background:#f8f9fa; padding:10px; border-radius:5px; border:1px solid #edf2f7;">
            <div class="flex ai-center gap-12">
                <span class="fw-600 fs-13" style="color:#2d3748; background:#e2e8f0; padding:2px 5px; border-radius:4px;">${context === 'data' ? 'DATA FILE' : 'META FILE'}</span>
                <label for="preview-delim-select" class="fw-500 fs-13 ml-8">Preview Delimiter:</label>
                <select id="preview-delim-select" style="padding:3px 7px; border-radius:4px; border:1px solid #cbd5e0; background:white;">
                    <option value="\t" ${delimiter === '\t' ? 'selected' : ''}>Tab (\\t)</option>
                    <option value="," ${delimiter === ',' ? 'selected' : ''}>Comma (,)</option>
                    <option value=";" ${delimiter === ';' ? 'selected' : ''}>Semicolon (;)</option>
                    <option value="|" ${delimiter === '|' ? 'selected' : ''}>Pipe (|)</option>
                </select>
                <button id="apply-preview-delim" class="btn-small" title="Apply this delimiter to ${context === 'data' ? 'Data' : 'Meta'} settings">Apply to Settings</button>
            </div>
            <div class="text-secondary fs-12">
                Showing first <strong>${lines.length}</strong> rows (Total ${totalRows})
            </div>
        </div>
    `;

    let html = '<div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:5px;"><table class="info-sample-table" style="width:100%; font-size:11px; border-collapse: collapse;"><thead><tr style="background:#f5f7fa; border-bottom:1px solid #e2e8f0;">';

    // Header (first non-empty line)
    const headers = (headerLine && typeof headerLine === 'string') ? headerLine.split(delimiter) : [];
    headers.forEach(h => {
        html += `<th style="padding:7px 10px; text-align:left; border-right:1px solid #eee; white-space:nowrap; font-weight:600; color:#4a5568;">${h}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Body (data rows only)
    for (let i = 0; i < lines.length; i++) {
        const cols = lines[i].split(delimiter);
        html += '<tr style="border-bottom:1px solid #eee;">';
        cols.forEach(c => {
            html += `<td style="padding:5px 10px; border-right:1px solid #eee; white-space:nowrap;">${c}</td>`;
        });
        html += '</tr>';
    }
    html += '</tbody></table></div>';

    container.innerHTML = controlsHtml + html;

    // Bind events
    const sel = container.querySelector('#preview-delim-select');
    if (sel) {
        sel.addEventListener('change', (e) => {
            renderPreviewTable(text, e.target.value, containerId, context);
        });
    }

    const applyBtn = container.querySelector('#apply-preview-delim');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const val = sel ? sel.value : delimiter;
            // Determine target select ID based on context
            const targetId = context === 'data' ? 'data-delimiter-select' : 'meta-delimiter-select';
            const customId = context === 'data' ? 'data-delimiter-custom' : 'meta-delimiter-custom';

            const globalSel = document.getElementById(targetId);

            if (globalSel) {
                if (['tab', '\t'].includes(val)) globalSel.value = 'tab';
                else if ([',', 'comma'].includes(val)) globalSel.value = 'comma';
                else {
                    globalSel.value = 'custom';
                    const customInput = document.getElementById(customId);
                    if (customInput) {
                        customInput.value = val;
                        customInput.style.display = 'block';
                        customInput.setAttribute('aria-hidden', 'false');
                    }
                }
                // Trigger change to update parsing
                globalSel.dispatchEvent(new Event('change'));
                // Close modal
                const modal = document.getElementById('file-preview-modal');
                if (modal) {
                    modal.style.display = 'none';
                    modal.setAttribute('aria-hidden', 'true');
                }
                if (typeof showToast === 'function')
                    showToast(`${context === 'data' ? 'Data' : 'Meta'} delimiter set to ${val === '\t' ? 'Tab' : val}`);
            } else {
                console.warn(`Target select ${targetId} not found`);
            }
        });
    }
}

function handlePreviewDataClick() {
    const text = (typeof window !== 'undefined') ? window.cachedDataContent : null;
    if (!text) {
        alert('No data file loaded.');
        return;
    }
    const delim = (typeof getDataFileDelimiter === 'function') ? getDataFileDelimiter() : '\t';
    renderPreviewTable(text, delim, 'file-preview-modal-body', 'data');
    const modal = document.getElementById('file-preview-modal');
    if (modal) {
        modal.style.display = 'block'; // Fallback
        modal.setAttribute('aria-hidden', 'false');
    }
}

function handlePreviewMetaClick() {
    const text = (typeof window !== 'undefined') ? window.cachedMetaContent : null;
    if (!text) {
        alert('No meta file loaded.');
        return;
    }
    const delim = (typeof getMetaFileDelimiter === 'function') ? getMetaFileDelimiter() : '\t';
    renderPreviewTable(text, delim, 'file-preview-modal-body', 'meta');
    const modal = document.getElementById('file-preview-modal');
    if (modal) {
        modal.style.display = 'block';
        modal.setAttribute('aria-hidden', 'false');
    }
}

function initFilePreviewModal() {
    const modal = document.getElementById('file-preview-modal');
    const closeBtn = document.getElementById('file-preview-modal-close');
    const overlay = modal ? modal.querySelector('.info-modal-overlay') : null;

    const close = () => {
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
    };

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', close);
}

// ========== 初始化事件监听器 ==========
function initEventListeners() {
    // 文件上传
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);
    // 示例数据加载
    const btnExample = document.getElementById('load-example');
    if (btnExample) btnExample.addEventListener('click', handleLoadExampleClick);
    // 导入 meta 文件
    const metaInput = document.getElementById('meta-upload');
    if (metaInput) metaInput.addEventListener('change', handleMetaUpload);

    // File Preview Buttons
    const dataPreviewBtn = document.getElementById('preview-data-btn');
    if (dataPreviewBtn) dataPreviewBtn.addEventListener('click', handlePreviewDataClick);

    const metaPreviewBtn = document.getElementById('preview-meta-btn');
    if (metaPreviewBtn) metaPreviewBtn.addEventListener('click', handlePreviewMetaClick);

    initFilePreviewModal();
    initColumnMappingListeners();
    initTabs();

    // 布局选择
    // 布局选择
    const layoutSelect = document.getElementById('layout-select');
    if (layoutSelect) {
        layoutSelect.addEventListener('change', handleLayoutChange);
        // Trigger initial update to ensure correct UI state
        layoutSelect.dispatchEvent(new Event('change'));
    }

    // Tree Layout Direction
    document.querySelectorAll('input[name="tree-direction"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (typeof window !== 'undefined') window.treeLayoutDirection = e.target.value;
            if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
        });
    });

    // New Tree Layout Settings
    const linkShapeSel = document.getElementById('tree-link-shape');
    if (linkShapeSel) {
        linkShapeSel.addEventListener('change', (e) => {
            if (typeof window !== 'undefined') window.treeLinkShape = e.target.value;
            if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
        });
    }

    const alignLeavesCheck = document.getElementById('tree-align-leaves');
    if (alignLeavesCheck) {
        alignLeavesCheck.addEventListener('change', (e) => {
            if (typeof window !== 'undefined') window.treeAlignLeaves = e.target.checked;
            if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
        });
    }

    const sepSlider = document.getElementById('tree-separation-slider');
    const sepVal = document.getElementById('tree-separation-value');
    if (sepSlider && sepVal) {
        sepSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            sepVal.textContent = val.toFixed(1) + 'x';
            if (typeof window !== 'undefined') window.treeSeparation = val;
            if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
        });
    }

    const sortSel = document.getElementById('tree-sort-select');
    if (sortSel) {
        sortSel.addEventListener('change', (e) => {
            if (typeof window !== 'undefined') window.treeNodeSort = e.target.value;
            if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
        });
    }

    // 丰度转换选择
    document.getElementById('abundance-transform').addEventListener('change', handleAbundanceTransformChange);

    // 配色方案选择通过下方的可折叠预览条进行（点击预览切换）
    const previewsToggle = document.getElementById('color-previews-toggle');
    if (previewsToggle) {
        const syncPreviewsToggleState = () => {
            const wrap = document.getElementById('color-previews-wrapper');
            if (!wrap) return;
            const expanded = window.getComputedStyle(wrap).display !== 'none';
            previewsToggle.classList.toggle('expanded', expanded);
            previewsToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        };

        previewsToggle.addEventListener('click', () => {
            const wrap = document.getElementById('color-previews-wrapper');
            if (!wrap) return;
            const current = window.getComputedStyle(wrap).display;
            const visible = current !== 'none';
            wrap.style.display = visible ? 'none' : 'block';
            syncPreviewsToggleState();
        });

        syncPreviewsToggleState();
    }
    // Removed deprecated diverging previews toggle; diverging palettes are now in Colors & Domain panel
    // 反转颜色复选框
    const rev = document.getElementById('color-reverse');
    if (rev) {
        rev.addEventListener('change', (e) => {
            // 全局变量在 core/app-core.js 中定义
            colorSchemeReversed = !!e.target.checked;
            // 统一按当前可视化模式重绘，避免强制回到单样本视图
            if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
            renderColorPreviews && renderColorPreviews();
            persistCurrentModeColorSettings();
        });
    }

    // 自定义颜色选择（和自定义面板中的 Apply 按钮）
    const customStart = document.getElementById('custom-color-start');
    const customEnd = document.getElementById('custom-color-end');
    const applyBtn = document.getElementById('apply-custom-color');
    const customMid = document.getElementById('custom-color-mid');
    const customArrowMid = document.getElementById('custom-arrow-mid');
    const customMid2 = document.getElementById('custom-color-mid2');
    const customArrowMid2 = document.getElementById('custom-arrow-mid2');
    const customMid3 = document.getElementById('custom-color-mid3');
    const customArrowMid3 = document.getElementById('custom-arrow-mid3');
    const stopsCount = document.getElementById('custom-stops-count');
    const presetsSelect = document.getElementById('custom-presets');
    const presetNameInput = document.getElementById('preset-name');
    const savePresetBtn = document.getElementById('save-preset');
    if (customStart) customStart.addEventListener('input', () => { customColorStart = customStart.value; renderColorPreviews && renderColorPreviews(); });
    if (customEnd) customEnd.addEventListener('input', () => { customColorEnd = customEnd.value; renderColorPreviews && renderColorPreviews(); });
    if (applyBtn) applyBtn.addEventListener('click', () => {
        // set and apply
        customColorStart = customStart.value;
        customColorEnd = customEnd.value;
        // update stops according to selection
        let count = (stopsCount && parseInt(stopsCount.value)) || 2;
        if (!isFinite(count)) count = 2;
        count = Math.max(2, Math.min(5, count)); // 限制最大 5
        const mids = [];
        const midDefaults = customColorMid || '#ffd27f';
        if (count >= 3) mids.push((customMid && customMid.value) ? customMid.value : midDefaults);
        if (count >= 4) mids.push((customMid2 && customMid2.value) ? customMid2.value : midDefaults);
        if (count >= 5) mids.push((customMid3 && customMid3.value) ? customMid3.value : midDefaults);
        customColorStops = [customColorStart, ...mids, customColorEnd];
        // 应用即启用 Custom，并切换到 Custom 标签
        setColorScheme('Custom');
        colorSchemeCategory = 'custom';
        try { if (typeof window !== 'undefined') window.colorSchemeCategory = colorSchemeCategory; } catch (_) { }
        renderColorPreviews && renderColorPreviews();
        if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
    });

    bindZeroColorControl('zero-color-toggle', 'zero-color-input');
    bindZeroColorControl('zero-color-theme-toggle', 'zero-color-theme-input');
    updateZeroColorControl(customZeroColor);

    // stops selector toggles mid color visibility
    if (stopsCount) {
        // 初始根据当前选择隐藏/显示中间色控件
        try {
            let v0 = parseInt(stopsCount.value);
            if (!isFinite(v0)) v0 = 2;
            v0 = Math.max(2, Math.min(5, v0));
            if (customMid) customMid.style.display = (v0 >= 3) ? 'inline-block' : 'none';
            if (customArrowMid) customArrowMid.style.display = (v0 >= 3) ? 'inline-block' : 'none';
            if (customMid2) customMid2.style.display = (v0 >= 4) ? 'inline-block' : 'none';
            if (customArrowMid2) customArrowMid2.style.display = (v0 >= 4) ? 'inline-block' : 'none';
            if (customMid3) customMid3.style.display = (v0 >= 5) ? 'inline-block' : 'none';
            if (customArrowMid3) customArrowMid3.style.display = (v0 >= 5) ? 'inline-block' : 'none';
        } catch (_) { }
        stopsCount.addEventListener('change', () => {
            let v = parseInt(stopsCount.value);
            if (!isFinite(v)) v = 2;
            v = Math.max(2, Math.min(5, v));
            // 显示/隐藏中间色控件
            if (customMid) customMid.style.display = (v >= 3) ? 'inline-block' : 'none';
            if (customArrowMid) customArrowMid.style.display = (v >= 3) ? 'inline-block' : 'none';
            if (customMid2) customMid2.style.display = (v >= 4) ? 'inline-block' : 'none';
            if (customArrowMid2) customArrowMid2.style.display = (v >= 4) ? 'inline-block' : 'none';
            if (customMid3) customMid3.style.display = (v >= 5) ? 'inline-block' : 'none';
            if (customArrowMid3) customArrowMid3.style.display = (v >= 5) ? 'inline-block' : 'none';
            // 组装 stops
            const mids = [];
            const midDefaults = customColorMid || '#ffd27f';
            if (v >= 3) mids.push((customMid && customMid.value) ? customMid.value : midDefaults);
            if (v >= 4) mids.push((customMid2 && customMid2.value) ? customMid2.value : midDefaults);
            if (v >= 5) mids.push((customMid3 && customMid3.value) ? customMid3.value : midDefaults);
            customColorStops = [customStart.value, ...mids, customEnd.value];
            renderColorPreviews && renderColorPreviews();
            if (typeof redrawCurrentViz === 'function' && colorScheme === 'Custom') redrawCurrentViz();
            persistCurrentModeColorSettings();
        });
    }

    // presets: load from localStorage
    function loadPresets() {
        let presets = [];
        try { presets = JSON.parse(localStorage.getItem('treemap_custom_color_presets') || '[]'); } catch (e) { presets = []; }
        if (presetsSelect) {
            presetsSelect.innerHTML = '<option value="">-- none --</option>';
            presets.forEach((p, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = p.name;
                presetsSelect.appendChild(opt);
            });
        }
        return presets;
    }

    const presets = loadPresets();
    if (presetsSelect) {
        presetsSelect.addEventListener('change', () => {
            const idx = presetsSelect.value;
            if (idx === '') return;
            const p = presets[parseInt(idx)];
            if (!p) return;
            // apply preset
            if (p.stops && p.stops.length > 0) {
                customColorStops = p.stops.slice();
                // set inputs
                customStart.value = customColorStops[0];
                const n = Math.max(2, Math.min(5, customColorStops.length));
                stopsCount.value = String(n);
                // 控件可见性
                if (customMid) customMid.style.display = (n >= 3) ? 'inline-block' : 'none';
                if (customArrowMid) customArrowMid.style.display = (n >= 3) ? 'inline-block' : 'none';
                if (customMid2) customMid2.style.display = (n >= 4) ? 'inline-block' : 'none';
                if (customArrowMid2) customArrowMid2.style.display = (n >= 4) ? 'inline-block' : 'none';
                if (customMid3) customMid3.style.display = (n >= 5) ? 'inline-block' : 'none';
                if (customArrowMid3) customArrowMid3.style.display = (n >= 5) ? 'inline-block' : 'none';
                // 赋值
                if (n >= 3 && customMid) customMid.value = customColorStops[1] || (customColorMid || '#ffd27f');
                if (n >= 4 && customMid2) customMid2.value = customColorStops[2] || (customColorMid || '#ffd27f');
                if (n >= 5 && customMid3) customMid3.value = customColorStops[3] || (customColorMid || '#ffd27f');
                customEnd.value = customColorStops[customColorStops.length - 1];
                renderColorPreviews && renderColorPreviews();
                // 预设应用也切换到 Custom 标签
                setColorScheme('Custom');
                colorSchemeCategory = 'custom';
                try { if (typeof window !== 'undefined') window.colorSchemeCategory = colorSchemeCategory; } catch (_) { }
                renderColorPreviews && renderColorPreviews();
                if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
            }
        });
    }

    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', () => {
            const name = (presetNameInput && presetNameInput.value) ? presetNameInput.value.trim() : '';
            if (!name) {
                alert('Please provide a preset name');
                return;
            }
            const stops = Array.isArray(customColorStops) ? customColorStops.slice() : [customStart.value, customEnd.value];
            let store = [];
            try { store = JSON.parse(localStorage.getItem('treemap_custom_color_presets') || '[]'); } catch (e) { store = []; }
            store.push({ name, stops });
            try { localStorage.setItem('treemap_custom_color_presets', JSON.stringify(store)); } catch (e) { console.warn('Failed to save preset', e); }
            presetNameInput.value = '';
            loadPresets();
            alert('Preset saved');
        });
    }

    // 高级参数控制
    // 注意：Show labels 控件已移除，标签显示由 "Levels (from leaf)" 的复选框控制
    document.getElementById('label-threshold').addEventListener('input', handleLabelThresholdChange);
    // 多选层级的checkbox在 updateLabelLevelsOptions 中绑定
    document.getElementById('label-font-size').addEventListener('input', handleLabelFontSizeChange);
    // 标签最大长度与溢出处理
    const lblMax = document.getElementById('label-max-length');
    if (lblMax) {
        let timer = null;
        lblMax.addEventListener('input', (e) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                handleLabelMaxLengthChange(e);
                timer = null;
            }, 300);
        });
    }
    const lblOverflow = document.getElementById('label-overflow');
    if (lblOverflow) lblOverflow.addEventListener('change', handleLabelOverflowChange);
    // 分位数控制
    const qLowInput = document.getElementById('quantile-low');
    const qHighInput = document.getElementById('quantile-high');
    if (qLowInput && qHighInput) {
        qLowInput.addEventListener('change', handleQuantileInputsChange);
        qHighInput.addEventListener('change', handleQuantileInputsChange);
    }
    // Individual legends 显示开关
    const showIndivLegendsCheckbox = document.getElementById('show-individual-legends');
    if (showIndivLegendsCheckbox) {
        showIndivLegendsCheckbox.addEventListener('change', handleShowIndividualLegendsChange);
    }
    document.getElementById('node-size-multiplier').addEventListener('input', handleNodeSizeMultiplierChange);
    document.getElementById('min-node-size').addEventListener('input', handleMinNodeSizeChange);
    document.getElementById('max-node-size').addEventListener('input', handleMaxNodeSizeChange);
    const nodeOpacityInput = document.getElementById('node-opacity');
    if (nodeOpacityInput) nodeOpacityInput.addEventListener('input', handleNodeOpacityChange);
    document.getElementById('edge-width-multiplier').addEventListener('input', handleEdgeWidthMultiplierChange);
    document.getElementById('min-edge-width').addEventListener('input', handleMinEdgeWidthChange);
    const edgeOpacityInput = document.getElementById('edge-opacity');
    if (edgeOpacityInput) edgeOpacityInput.addEventListener('input', handleEdgeOpacityChange);

    // 样本选择折叠
    document.getElementById('toggle-samples').addEventListener('click', handleToggleSamples);
    // 样本选择快捷操作：全选/全不选/反选
    const btnSelectAll = document.getElementById('select-all-samples');
    const btnSelectNone = document.getElementById('select-none-samples');
    const btnInvert = document.getElementById('invert-samples');
    if (btnSelectAll) btnSelectAll.addEventListener('click', selectAllSamples);
    if (btnSelectNone) btnSelectNone.addEventListener('click', selectNoneSamples);
    if (btnInvert) btnInvert.addEventListener('click', invertSampleSelection);

    // Panel width slider: adjust CSS variables per active layout context
    const panelSlider = document.getElementById('panel-width-slider');
    const panelValue = document.getElementById('panel-width-value');
    if (panelSlider) {
        const panelLock = document.getElementById('panel-lock-size');
        const syncWidthPreview = (val, opts = {}) => {
            const widthPx = clampLayoutValue(val);
            panelSlider.value = String(widthPx);
            if (panelValue) panelValue.textContent = `${widthPx}px`;
            const ctx = activeLayoutPanelContext || getActiveLayoutPanelContext();
            const current = { ...getLayoutPanelSettingsForContext(ctx), panelWidth: widthPx };
            if (opts.syncLock && panelLock && panelLock.checked) {
                const other = document.getElementById('panel-height-slider');
                const otherValue = document.getElementById('panel-height-value');
                current.panelHeight = widthPx;
                if (other) other.value = String(widthPx);
                if (otherValue) otherValue.textContent = `${widthPx}px`;
            }
            applyLayoutPanelSettingsToDom(current, ctx);
        };

        panelSlider.addEventListener('input', (e) => {
            syncWidthPreview(e.target.value, { syncLock: true });
        });

        panelSlider.addEventListener('change', () => {
            const ctx = activeLayoutPanelContext || getActiveLayoutPanelContext();
            const updates = { panelWidth: clampLayoutValue(panelSlider.value) };
            if (panelLock && panelLock.checked) {
                updates.panelHeight = updates.panelWidth;
            }
            setLayoutPanelSettingsForContext(ctx, updates);
            if (typeof redrawCurrentViz === 'function') {
                try { redrawCurrentViz(); } catch (err) { console.warn('Error redrawing after panel width change', err); }
            }
        });
    }

    // Panel height slider binding
    const panelHeightSlider = document.getElementById('panel-height-slider');
    const panelHeightValue = document.getElementById('panel-height-value');
    if (panelHeightSlider) {
        const panelLock = document.getElementById('panel-lock-size');
        const syncHeightPreview = (val, opts = {}) => {
            const heightPx = clampLayoutValue(val);
            panelHeightSlider.value = String(heightPx);
            if (panelHeightValue) panelHeightValue.textContent = `${heightPx}px`;
            const ctx = activeLayoutPanelContext || getActiveLayoutPanelContext();
            const current = { ...getLayoutPanelSettingsForContext(ctx), panelHeight: heightPx };
            if (opts.syncLock && panelLock && panelLock.checked) {
                const other = document.getElementById('panel-width-slider');
                const otherValue = document.getElementById('panel-width-value');
                current.panelWidth = heightPx;
                if (other) other.value = String(heightPx);
                if (otherValue) otherValue.textContent = `${heightPx}px`;
            }
            applyLayoutPanelSettingsToDom(current, ctx);
        };

        panelHeightSlider.addEventListener('input', (e) => {
            syncHeightPreview(e.target.value, { syncLock: true });
        });

        panelHeightSlider.addEventListener('change', () => {
            const ctx = activeLayoutPanelContext || getActiveLayoutPanelContext();
            const updates = { panelHeight: clampLayoutValue(panelHeightSlider.value) };
            if (panelLock && panelLock.checked) {
                updates.panelWidth = updates.panelHeight;
            }
            setLayoutPanelSettingsForContext(ctx, updates);
            if (typeof redrawCurrentViz === 'function') {
                try { redrawCurrentViz(); } catch (err) { console.warn('Error redrawing after panel height change', err); }
            }
        });
    }

    // Lock checkbox: when toggled on, immediately sync height to width (so they're in lock state)
    const panelLockCheckbox = document.getElementById('panel-lock-size');
    if (panelLockCheckbox) {
        panelLockCheckbox.addEventListener('change', (e) => {
            try {
                if (e.target.checked) {
                    const w = document.getElementById('panel-width-slider');
                    const h = document.getElementById('panel-height-slider');
                    const hv = document.getElementById('panel-height-value');
                    if (w && h) {
                        h.value = w.value;
                        const ctx = activeLayoutPanelContext || getActiveLayoutPanelContext();
                        setLayoutPanelSettingsForContext(ctx, {
                            panelWidth: clampLayoutValue(w.value),
                            panelHeight: clampLayoutValue(w.value)
                        });
                        if (hv) hv.textContent = `${w.value}px`;
                    }
                }
            } catch (err) { console.warn('Error syncing sliders on lock change', err); }
        });
    }
    setActiveLayoutPanelContext(getActiveLayoutPanelContext(), { force: true });
    // 元数据筛选折叠
    const metaToggle = document.getElementById('meta-filters-toggle');
    if (metaToggle) {
        metaToggle.addEventListener('click', function () {
            const content = document.getElementById('meta-filters-content');
            if (!content) return;
            const current = window.getComputedStyle(content).display;
            const expanded = current !== 'none';
            if (expanded) {
                content.style.display = 'none';
                this.textContent = 'Expand ▼';
            } else {
                content.style.display = 'block';
                this.textContent = 'Collapse ▲';
            }
        });
    }
    // Labels & Nodes panel collapse/expand
    const labelsPanel = document.getElementById('labels-panel');
    const labelsToggle = document.getElementById('labels-toggle');
    if (labelsToggle && labelsPanel) {
        labelsToggle.addEventListener('click', function () {
            const collapsed = labelsPanel.classList.toggle('collapsed');
            labelsToggle.textContent = collapsed ? 'Expand ▼' : 'Collapse ▲';
            labelsToggle.classList.toggle('expanded', !collapsed);
            labelsToggle.setAttribute('aria-expanded', String(!collapsed));
        });
    }
    // Colors & Domain panel collapse/expand
    const colorsPanel = document.getElementById('colors-panel');
    const colorsToggle = document.getElementById('colors-toggle');
    if (colorsToggle && colorsPanel) {
        colorsToggle.addEventListener('click', function () {
            const collapsed = colorsPanel.classList.toggle('collapsed');
            colorsToggle.textContent = collapsed ? 'Expand ▼' : 'Collapse ▲';
            colorsToggle.classList.toggle('expanded', !collapsed);
            colorsToggle.setAttribute('aria-expanded', String(!collapsed));
        });
    }
    // Layout & Panels panel collapse/expand (new panel moved out of Analysis Mode)
    const layoutPanel = document.getElementById('layout-panel');
    const layoutToggle = document.getElementById('layout-toggle');
    if (layoutToggle && layoutPanel) {
        layoutToggle.addEventListener('click', function () {
            const collapsed = layoutPanel.classList.toggle('collapsed');
            layoutToggle.textContent = collapsed ? 'Expand ▼' : 'Collapse ▲';
            layoutToggle.classList.toggle('expanded', !collapsed);
            layoutToggle.setAttribute('aria-expanded', String(!collapsed));
        });
    }
    // Theme panel collapse/expand
    const themePanel = document.getElementById('theme-panel');
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle && themePanel) {
        themeToggle.addEventListener('click', function () {
            const collapsed = themePanel.classList.toggle('collapsed');
            themeToggle.textContent = collapsed ? 'Expand ▼' : 'Collapse ▲';
            themeToggle.classList.toggle('expanded', !collapsed);
            themeToggle.setAttribute('aria-expanded', String(!collapsed));
        });
    }
    // Labels reset button
    const labelsResetBtn = document.getElementById('labels-reset');
    if (labelsResetBtn) {
        labelsResetBtn.addEventListener('click', resetLabelsNodesToDefaults);
    }

    // Sync zoom toggle
    const syncZoomCb = document.getElementById('sync-zoom');
    if (syncZoomCb) {
        syncZoomCb.addEventListener('change', (e) => {
            syncZoomEnabled = !!e.target.checked;
        });
    }
    // Significance filter toggle (comparison modes)
    const showSig = document.getElementById('show-significance');
    if (showSig) {
        const thrRow = document.getElementById('significance-thresholds-row');
        // set initial visibility according to current checkbox state
        if (thrRow) thrRow.style.display = showSig.checked ? 'flex' : 'none';
        showSig.addEventListener('change', () => {
            if (thrRow) thrRow.style.display = showSig.checked ? 'flex' : 'none';
        });
    }

    // Global actions panel has been moved into panel headers; keep bulk exports available via keyboard or future UI hooks.

    // 单样本显著性过滤（仅当加载了 combined_long 数据时显示）
    const singleSigToggle = document.getElementById('single-show-significance');
    const singleThrRow = document.getElementById('single-significance-thresholds-row');
    const singleToggleRow = document.getElementById('single-significance-toggle-row');
    const singleP = document.getElementById('single-pvalue-threshold');
    const singleQ = document.getElementById('single-qvalue-threshold');
    const singleL = document.getElementById('single-logfc-threshold');
    if (singleSigToggle && singleThrRow) {
        // 初始化：若不是 combined_long，整个显著性区域隐藏；否则根据复选框控制阈值行显示
        const isCombined = !!(typeof window !== 'undefined' && window.isCombinedLong);
        if (singleToggleRow) singleToggleRow.style.display = isCombined ? 'flex' : 'none';
        try { singleThrRow.style.display = (isCombined && singleSigToggle.checked) ? 'flex' : 'none'; } catch (_) { }
        singleSigToggle.addEventListener('change', () => {
            const isCombinedNow = !!(typeof window !== 'undefined' && window.isCombinedLong);
            if (singleToggleRow) singleToggleRow.style.display = isCombinedNow ? 'flex' : 'none';
            try { singleThrRow.style.display = (isCombinedNow && singleSigToggle.checked) ? 'flex' : 'none'; } catch (_) { }
            // 勾选/取消时立即重绘（仅 single 模式受影响）
            if (visualizationMode === 'single') redrawCurrentViz();
        });
    }
    // 阈值输入变更触发重绘（仅 single 模式）
    const onSingleThrChange = () => { if (visualizationMode === 'single') redrawCurrentViz(); };
    if (singleP) singleP.addEventListener('input', onSingleThrChange);
    if (singleQ) singleQ.addEventListener('input', onSingleThrChange);
    if (singleL) singleL.addEventListener('input', onSingleThrChange);

    // 窗口大小调整
    let resizeTimeout;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function () {
            if (treeData) {
                redrawCurrentViz();
            }
        }, 250);
    });

    // 初始渲染颜色预览（如果可用），并加载自定义预设
    loadPresets && loadPresets();
    if (typeof renderColorPreviews === 'function') renderColorPreviews();
    // deprecated: renderDivergingPreviews removed

    // Force visibility update on init to handle radial layout settings
    const initLayout = (typeof window !== 'undefined' && window.currentLayout) ? window.currentLayout : 'radial';
    if (initLayout === 'radial' || initLayout === 'tree') {
        document.querySelectorAll('.tree-only-setting').forEach(el => {
            el.style.display = 'flex';
            el.setAttribute('aria-hidden', 'false');
        });
    }
}

// 统一的重绘入口：根据当前可视化模式触发相应的重绘
function redrawCurrentViz() {
    if (!treeData) return;
    // If a modal comparison is open, redraw that instead of replacing the main viz
    if (window.currentModalComparison && document.getElementById('comparison-modal-body')) {
        const c = window.currentModalComparison;
        drawComparisonTree(c.treatment_1, c.treatment_2, c.stats, { containerId: 'comparison-modal-body', isModal: true });
        return;
    }
    if (visualizationMode === 'single') {
        if (selectedSamples && selectedSamples.length > 0) {
            initVisualization();
            drawAllTrees();
        }
    } else if (visualizationMode === 'group') {
        // group模式：重绘选中的组
        if (selectedGroups && selectedGroups.length > 0) {
            initVisualization();
            drawAllTrees();
        }
    } else if (visualizationMode === 'comparison') {
        // 比较模式：直接重绘现有比较结果（无需重新计算统计）
        const results = window.comparisonResults_comparison || window.comparisonResults;
        if (results && results.length > 0) {
            const comp = results[0];
            drawComparisonTree(comp.treatment_1, comp.treatment_2, comp.stats);
        }
    } else if (visualizationMode === 'matrix') {
        // 矩阵模式：如存在内联放大视图，则优先重绘该视图；否则重绘矩阵
        const results = window.comparisonResults_matrix || window.comparisonResults;
        if (window.currentInlineComparison) {
            drawInlineFocusedComparison(window.currentInlineComparison);
        } else if (results && results.length > 0) {
            drawComparisonMatrix(results);
        }
    }
}

// ========== 事件处理函数 ==========
function loadDataFromText(text, options = {}) {
    // Update cache
    if (typeof window !== 'undefined') {
        window.cachedDataContent = text;
        window.cachedDataLabel = options.label || null;
        // Persist format & mapping so re-parses (delimiter changes, etc.) stay consistent
        const cachedOpts = { label: window.cachedDataLabel };
        if (options.format) cachedOpts.format = options.format;
        if (options.mapping) cachedOpts.mapping = options.mapping;
        window.cachedDataOptions = cachedOpts;
    }

    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Empty data content');
    }
    const firstLine = text.split(/\r?\n/)[0] || '';

    // Explicit format check from options, or presence of mapping object
    if (options.format === 'long' || (options.mapping && typeof options.mapping === 'object')) {
        if (typeof parseLongFormatTSV === 'function') {
            const duplicateHandlingSelect = document.getElementById('duplicate-id-handling');
            const duplicateHandling = duplicateHandlingSelect ? duplicateHandlingSelect.value : 'sum';
            rawData = parseLongFormatTSV(text, null, options.mapping, duplicateHandling);
        } else {
            // Fallback if not updated in time? Should be there.
            console.error('parseLongFormatTSV not found');
            rawData = parseTSV(text);
        }
    } else {
        // Default to Wide Table (standard matrix)
        const duplicateHandlingSelect = document.getElementById('duplicate-id-handling');
        const duplicateHandling = duplicateHandlingSelect ? duplicateHandlingSelect.value : 'sum';
        rawData = parseTSV(text, null, duplicateHandling);
    }
    treeData = buildHierarchy(rawData);

    // 加载新文件时刷新 Color domain：清除手动 M，输入框回到自动/默认
    resetManualDomainForAllModes();
    try { comparisonColorDomain = [-5, 0, 5]; } catch (_) { if (typeof window !== 'undefined') window.comparisonColorDomain = [-5, 0, 5]; }
    const cdInput = document.getElementById('color-domain-abs');
    if (cdInput) cdInput.value = '';

    const filenameLabel = (typeof options.label === 'string' && options.label.trim().length > 0)
        ? options.label.trim()
        : 'Inline data';
    const filenameDisplay = document.getElementById('filename-display');
    if (filenameDisplay) filenameDisplay.textContent = filenameLabel;

    const previewBtn = document.getElementById('preview-data-btn');
    if (previewBtn) previewBtn.style.display = 'inline-flex';

    // 更新样本复选框（先设置选中的样本）
    updateSampleCheckboxes();

    // 切换回单样本模式
    const modeSelect = document.getElementById('viz-mode');
    if (modeSelect && modeSelect.value !== 'single') {
        modeSelect.value = 'single';
        handleVisualizationModeChange();
    }

    // 若为 combined_long 数据，显示单样本显著性过滤控件；否则隐藏
    const isCombined = !!(typeof window !== 'undefined' && window.isCombinedLong);
    const rowToggle = document.getElementById('single-significance-toggle-row');
    const rowThresh = document.getElementById('single-significance-thresholds-row');
    if (rowToggle) rowToggle.style.display = isCombined ? 'flex' : 'none';
    if (rowThresh) {
        const singleToggle = document.getElementById('single-show-significance');
        const shouldShow = isCombined && !!(singleToggle && singleToggle.checked);
        rowThresh.style.display = shouldShow ? 'flex' : 'none';
    }

    // 初始化可视化
    initVisualization();
    drawAllTrees();
    // 依据是否存在负值，刷新颜色方案预览（顺序/分歧自适应）
    if (typeof renderColorPreviews === 'function') renderColorPreviews();

    // 更新统计信息
    if (selectedSamples.length > 0) {
        const hierarchy = d3.hierarchy(treeData);
        updateStats(hierarchy, selectedSamples[0]);
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('metatree:data-loaded', {
            detail: {
                label: filenameLabel,
                sampleCount: Array.isArray(samples) ? samples.length : 0,
                isCombinedLong: isCombined
            }
        }));
    }

    return treeData;
}
try { if (typeof window !== 'undefined') window.loadDataFromText = loadDataFromText; } catch (_) { }

// ========== Column Mapping Modal Logic ==========

let cachedLongFormatText = null;
let cachedLongFormatFilename = null;

function renderColumnMappingPreview(text, delimiter) {
    const container = document.getElementById('mapping-preview-container');
    if (!container) return;

    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0).slice(0, 6); // Header + 5 rows
    if (lines.length === 0) {
        container.innerHTML = '<p class="text-muted">File is empty.</p>';
        return;
    }

    // Header
    const headers = lines[0].split(delimiter).map(h => h.trim());

    // Render Table
    let html = '<table class="info-sample-table" style="width:100%; font-size:12px; border-collapse: collapse;"><thead><tr style="background:#f5f7fa; border-bottom:1px solid #e2e8f0;">';
    headers.forEach((h, i) => {
        html += `<th style="padding:6px 12px; text-align:left; border-right:1px solid #eee; white-space:nowrap; font-weight:600; color:#4a5568;">
            <div style="margin-bottom:4px;">${h}</div>
            <div class="text-muted" style="font-weight:normal; font-size:10px;">Col ${i + 1}</div>
        </th>`;
    });
    html += '</tr></thead><tbody>';

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter);
        html += '<tr style="border-bottom:1px solid #eee;">';
        cols.forEach(c => {
            html += `<td style="padding:6px 12px; border-right:1px solid #eee; white-space:nowrap;">${c}</td>`;
        });
        html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;

    // Populate Selects
    const selects = document.querySelectorAll('.mapping-select');
    selects.forEach(sel => {
        sel.innerHTML = '<option value="">-- Select Column --</option>';
        headers.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            sel.appendChild(opt);
        });
    });

    // Smart Auto-Select based on common names
    const setSelect = (id, candidates) => {
        const el = document.getElementById(id);
        if (!el) return;
        const match = headers.find(h => candidates.some(c => h.toLowerCase() === c.toLowerCase()));
        if (match) el.value = match;
    };

    setSelect('map-col-taxon', ['Item_ID', 'Taxon', 'OTU', 'Gene', 'Feature']);
    setSelect('map-col-condition', ['condition', 'group', 'sample', 'treatment']);
    setSelect('map-col-value', ['log2FoldChange', 'value', 'abundance', 'count', 'diff']);
    setSelect('map-col-pvalue', ['pvalue', 'p-value', 'pval']);
    setSelect('map-col-qvalue', ['padj', 'qvalue', 'fdr', 'q-value']);
}

function showColumnMappingModal(text, filename) {
    const modal = document.getElementById('column-mapping-modal');
    if (!modal) return;

    cachedLongFormatText = text;
    cachedLongFormatFilename = filename;

    // Use current delimiter setting
    const delim = (typeof getDataFileDelimiter === 'function') ? getDataFileDelimiter() : '\t';

    renderColumnMappingPreview(text, delim);

    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
}

function hideColumnMappingModal() {
    const modal = document.getElementById('column-mapping-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }
    // Clear cache? Maybe keep until new file.
}

function handleColumnMappingConfirm() {
    if (!cachedLongFormatText) return;

    const taxon = document.getElementById('map-col-taxon').value;
    const condition = document.getElementById('map-col-condition').value;
    const value = document.getElementById('map-col-value').value;

    // Optional
    const pvalue = document.getElementById('map-col-pvalue').value;
    const qvalue = document.getElementById('map-col-qvalue').value;

    if (!taxon || !condition || !value) {
        alert('Please select all required columns (Taxon, Condition, Value).');
        return;
    }

    const mapping = { taxon, condition, value };
    if (pvalue) mapping.pvalue = pvalue;
    if (qvalue) mapping.qvalue = qvalue;

    try {
        loadDataFromText(cachedLongFormatText, {
            label: cachedLongFormatFilename,
            format: 'long',
            mapping: mapping
        });
        hideColumnMappingModal();
        if (typeof showToast === 'function') showToast('Long format data loaded successfully');
    } catch (e) {
        alert('Failed to load data: ' + e.message);
        console.error(e);
    }
}

function initColumnMappingListeners() {
    const confirmBtn = document.getElementById('column-mapping-confirm-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', handleColumnMappingConfirm);

    const closeBtn = document.getElementById('column-mapping-modal-close');
    const modal = document.getElementById('column-mapping-modal');
    const overlay = modal ? modal.querySelector('.info-modal-overlay') : null;

    const close = () => hideColumnMappingModal();
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', close);
}

// Call init immediately (safe if DOM not ready? usually this file runs after DOM)
// Or call from initEventListeners
// We will call it from initEventListeners later or add self-run check.
// Better to add to initEventListeners.

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (typeof showToast === 'function') {
        showToast(`Loading ${file.name}... Please wait.`, 5000);
    }

    // Detect format preference
    const formatRadio = document.querySelector('input[name="data-format"]:checked');
    const format = formatRadio ? formatRadio.value : 'wide';

    // Detect delimiter from extension (auto-detect for both formats initially)
    const name = file.name.toLowerCase();
    const dataDelimSelect = document.getElementById('data-delimiter-select');
    let autoDelim = null;

    if (name.endsWith('.csv')) {
        autoDelim = 'comma';
    } else if (name.endsWith('.tsv') || name.endsWith('.txt')) {
        autoDelim = 'tab';
    }

    if (autoDelim && dataDelimSelect) {
        // Only update if it's different to avoid unnecessary UI flicker or events
        if (dataDelimSelect.value !== autoDelim) {
            dataDelimSelect.value = autoDelim;

            // IMPORTANT: Apply the setting functionally so it's picked up by subsequent reads
            if (typeof setDataFileDelimiter === 'function') {
                setDataFileDelimiter(autoDelim === 'tab' ? '\t' : ',');
            }

            // Also need to update custom input visibility if switching away from custom
            const customInput = document.getElementById('data-delimiter-custom');
            if (customInput) {
                customInput.style.display = 'none';
                customInput.setAttribute('aria-hidden', 'true');
            }
            if (typeof showToast === 'function') showToast(`Auto-detected delimiter: ${autoDelim === 'tab' ? 'Tab' : 'Comma'}`);
        }
    }

    // Immediately show preview button (even if parsing hasn't happened yet)
    const previewBtn = document.getElementById('preview-data-btn');
    if (previewBtn) previewBtn.style.display = 'inline-flex';

    const reader = new FileReader();
    reader.onload = function (event) {
        const text = event.target.result;
        // Cache raw content immediately for preview
        if (typeof window !== 'undefined') {
            window.cachedDataContent = text;
            window.cachedDataLabel = file.name;
        }

        // Check format
        if (format === 'long') {
            // For Long format, show mapping modal
            // We still try to detect taxa delimiter because the user still needs to split the Item_ID column

            // Run auto-detect taxa delimiter
            detectAndSetTaxaDelimiter(text);

            // Show modal
            showColumnMappingModal(text, file.name);

        } else {
            // Wide format (Standard)

            // Auto-detect taxa delimiter (Rank separator)
            detectAndSetTaxaDelimiter(text);

            try {
                // Format is 'wide' (default)
                loadDataFromText(text, { label: file.name, format: 'wide' });
            } catch (error) {
                alert('Failed to parse data: ' + error.message + '\n\nClick the "eye" icon to preview the raw file or switch to "Long Table" format if appropriate.');
                console.error(error);
            }
        }
    };
    reader.readAsText(file);

    // Reset input value to allow reloading the same file
    e.target.value = '';
}

// Extracted Auto-detect logic
function detectAndSetTaxaDelimiter(text) {
    try {
        const fileDelim = (typeof getDataFileDelimiter === 'function') ? getDataFileDelimiter() : '\t';
        // Sample first 20 lines, skip header (index 0)
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0).slice(1, 21);

        if (lines.length > 0) {
            let pipeCount = 0;
            let semiCount = 0;

            lines.forEach(line => {
                // Basic split to get the first column (Taxon Name/ID)
                const firstCol = line.split(fileDelim)[0];
                if (firstCol.includes('|')) pipeCount++;
                if (firstCol.includes(';')) semiCount++;
            });

            const threshold = Math.ceil(lines.length * 0.5); // at least 50%
            let detectedTaxaDelim = null;

            if (pipeCount >= threshold && pipeCount >= semiCount) {
                detectedTaxaDelim = 'pipe';
            } else if (semiCount >= threshold) {
                detectedTaxaDelim = 'semicolon';
            }

            const taxaSel = document.getElementById('taxa-delimiter-select');
            if (detectedTaxaDelim) {
                // 1. Update UI if needed
                if (taxaSel && taxaSel.value !== detectedTaxaDelim) {
                    taxaSel.value = detectedTaxaDelim;
                }

                // 2. IMPORTANT: Apply the setting functionally
                if (typeof setTaxonRankDelimiter === 'function') {
                    setTaxonRankDelimiter(detectedTaxaDelim === 'pipe' ? '|' : ';');
                }

                // Helper to manage custom input visibility
                const taxaCustom = document.getElementById('taxa-delimiter-custom');
                if (taxaCustom) {
                    taxaCustom.style.display = 'none';
                    taxaCustom.setAttribute('aria-hidden', 'true');
                }

                if (typeof showToast === 'function') {
                    const symbol = detectedTaxaDelim === 'pipe' ? '|' : ';';
                    showToast(`Auto-detected taxa separator: ${detectedTaxaDelim} (${symbol})`);
                }
            }
        }
    } catch (e) {
        console.warn('Taxa separator auto-detection failed:', e);
    }
}

function updateSampleCheckboxes() {
    const checkboxContainer = document.getElementById('sample-checkboxes');
    checkboxContainer.innerHTML = '';
    selectedSamples = [];

    samples.forEach((sample, index) => {
        const checkboxItem = document.createElement('div');
        checkboxItem.className = 'checkbox-item';

        // Enable drag and drop
        addDragListeners(checkboxItem, 'sample');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `sample-${sample}`;
        checkbox.value = sample;
        // 默认选中前4个样本（若不足4个则全选可用样本）
        if (index < 4) {
            checkbox.checked = true;
            selectedSamples.push(sample);
        }

        checkbox.addEventListener('change', handleSampleCheckboxChange);

        const label = document.createElement('label');
        label.htmlFor = `sample-${sample}`;
        label.textContent = sample;

        checkboxItem.appendChild(checkbox);
        checkboxItem.appendChild(label);
        checkboxContainer.appendChild(checkboxItem);
    });

    // 默认不展开样本选择面板（保持折叠）
    const panel = document.getElementById('sample-selection-panel');
    const btn = document.getElementById('toggle-samples');
    panel.classList.remove('expanded');
    panel.style.display = 'none';
    btn.textContent = 'Expand ▼';
    btn.classList.remove('expanded');
}

// 根据 meta 过滤刷新样本复选框可见性与选中状态
function refreshSampleCheckboxesByMeta() {
    if (!samples || samples.length === 0) return;
    const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
    // 逐一处理
    samples.forEach(sample => {
        const item = document.getElementById(`sample-${sample}`);
        if (!item) return;
        const wrapper = item.parentElement; // checkbox-item
        if (passes(sample)) {
            if (wrapper) wrapper.style.display = '';
        } else {
            // 隐藏并取消选中
            if (wrapper) wrapper.style.display = 'none';
            if (item.checked) {
                item.checked = false;
                selectedSamples = selectedSamples.filter(s => s !== sample);
            }
        }
    });

    // 过滤样本后需要同步更新可视化，以保证 viz-container 中的面板与样本选择面板一致
    try {
        if (typeof initVisualization === 'function' && typeof drawAllTrees === 'function') {
            // 重新初始化可视化面板并触发重绘（会自动只绘制通过 meta 过滤的样本）
            initVisualization();
            drawAllTrees();

            // 更新统计信息（使用第一个通过过滤的活动样本，若没有则清空统计）
            if (typeof getActiveSamples === 'function') {
                const active = getActiveSamples();
                const hierarchy = (typeof d3 !== 'undefined' && treeData) ? d3.hierarchy(treeData) : null;
                if (hierarchy && active && active.length > 0) {
                    updateStats(hierarchy, active[0]);
                } else if (hierarchy) {
                    updateStats(hierarchy, null);
                }
            }
        }
    } catch (err) {
        console.warn('Error refreshing visualization after meta filter change', err);
    }
}

function handleSampleCheckboxChange(e) {
    const sample = e.target.value;

    if (e.target.checked) {
        if (!selectedSamples.includes(sample)) {
            selectedSamples.push(sample);
        }
    } else {
        selectedSamples = selectedSamples.filter(s => s !== sample);
    }

    // 重新绘制
    initVisualization();
    drawAllTrees();

    // 更新统计信息
    if (selectedSamples.length > 0) {
        const hierarchy = d3.hierarchy(treeData);
        updateStats(hierarchy, selectedSamples[0]);
    }
}

// 样本选择快捷操作实现
function selectAllSamples() {
    const container = document.getElementById('sample-checkboxes');
    if (!container) return;
    const boxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    selectedSamples = [];
    boxes.forEach(cb => {
        // skip hidden items (filtered out by meta)
        const wrapper = cb.parentElement;
        if (wrapper && wrapper.style && wrapper.style.display === 'none') return;
        cb.checked = true;
        if (!selectedSamples.includes(cb.value)) selectedSamples.push(cb.value);
    });
    // redraw
    initVisualization();
    drawAllTrees();
    if (selectedSamples.length > 0) {
        const hierarchy = d3.hierarchy(treeData);
        updateStats(hierarchy, selectedSamples[0]);
    }
}

function selectNoneSamples() {
    const container = document.getElementById('sample-checkboxes');
    if (!container) return;
    const boxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    boxes.forEach(cb => {
        cb.checked = false;
    });
    selectedSamples = [];
    // redraw (will hide panels)
    initVisualization();
    drawAllTrees();
    // update stats panel
    const hierarchy = d3.hierarchy(treeData);
    updateStats(hierarchy, null);
}

function invertSampleSelection() {
    const container = document.getElementById('sample-checkboxes');
    if (!container) return;
    const boxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    selectedSamples = [];
    boxes.forEach(cb => {
        const wrapper = cb.parentElement;
        if (wrapper && wrapper.style && wrapper.style.display === 'none') return;
        cb.checked = !cb.checked;
        if (cb.checked && !selectedSamples.includes(cb.value)) selectedSamples.push(cb.value);
    });
    // redraw
    initVisualization();
    drawAllTrees();
    if (selectedSamples.length > 0) {
        const hierarchy = d3.hierarchy(treeData);
        updateStats(hierarchy, selectedSamples[0]);
    }
}

function handleLayoutChange(e) {
    const nextLayout = e.target.value;
    currentLayout = VALID_LAYOUT_OPTIONS.has(nextLayout) ? nextLayout : 'radial';
    try { if (typeof window !== 'undefined') window.currentLayout = currentLayout; } catch (_) { }
    const ctx = activeLayoutPanelContext || getActiveLayoutPanelContext();
    setLayoutPanelSettingsForContext(ctx, { layout: currentLayout });

    // Show/hide tree direction control
    const treeDirRow = document.getElementById('tree-direction-row');
    if (treeDirRow) {
        treeDirRow.style.display = (currentLayout === 'tree') ? 'flex' : 'none';
        treeDirRow.setAttribute('aria-hidden', (currentLayout === 'tree') ? 'false' : 'true');
    }

    document.querySelectorAll('.tree-only-setting').forEach(el => {
        const visible = (currentLayout === 'tree' || currentLayout === 'radial');
        el.style.display = visible ? 'flex' : 'none';
        el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });

    if (typeof redrawCurrentViz === 'function') {
        try { redrawCurrentViz(); } catch (err) { console.warn('Error redrawing after layout change', err); }
    }
}

function handleResetZoom() {
    if (visualizationMode === 'single') {
        selectedSamples.forEach(sample => {
            if (svgs[sample] && zooms[sample]) {
                svgs[sample].transition().duration(750).call(
                    zooms[sample].transform,
                    d3.zoomIdentity
                );
            }
        });
    } else if (visualizationMode === 'comparison' || visualizationMode === 'matrix') {
        // 比较模式重置缩放
        const store = getComparisonStoreForUI();
        if (store && typeof store.getSvg === 'function' && typeof store.getZoom === 'function') {
            const svgRef = store.getSvg();
            const zoomRef = store.getZoom();
            if (svgRef && zoomRef) {
                svgRef.transition().duration(750).call(
                    zoomRef.transform,
                    d3.zoomIdentity
                );
            }
        }
    }
}

function handleAbundanceTransformChange(e) {
    abundanceTransform = e.target.value;
    if (selectedSamples.length > 0) {
        initVisualization();
        drawAllTrees();
    }
}

// 设置当前配色方案（programmatic setter）
function setColorScheme(scheme) {
    colorScheme = scheme;
    // 显示/隐藏自定义颜色控件
    const customControls = document.getElementById('custom-color-controls');
    if (customControls) {
        // 当选中Custom方案时，自动切到Custom标签页
        if (scheme === 'Custom') {
            colorSchemeCategory = 'custom';
            try { if (typeof window !== 'undefined') window.colorSchemeCategory = colorSchemeCategory; } catch (_) { }
            customControls.style.display = 'flex';
        } else {
            if (colorSchemeCategory !== 'custom') customControls.style.display = 'none';
        }
    }

    // 应用并重绘（按当前可视化模式）
    if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
    renderColorPreviews && renderColorPreviews();
    persistCurrentModeColorSettings();
}

// 渲染颜色预览条，显示在 #color-previews 中
function renderColorPreviews() {
    const wrapper = document.getElementById('color-previews-wrapper');
    const container = document.getElementById('color-previews');
    if (!wrapper || !container) return;

    // 确保标签页存在
    let tabs = document.getElementById('color-previews-tabs');
    if (!tabs) {
        tabs = document.createElement('div');
        tabs.id = 'color-previews-tabs';
        tabs.style.display = 'flex';
        tabs.style.gap = '8px';
        tabs.style.marginBottom = '8px';
        const mkBtn = (id, text, value) => {
            const b = document.createElement('button');
            b.id = id;
            b.textContent = text;
            b.className = 'btn-secondary';
            b.style.padding = '4px 8px';
            b.addEventListener('click', () => {
                colorSchemeCategory = value;
                try { if (typeof window !== 'undefined') window.colorSchemeCategory = colorSchemeCategory; } catch (_) { }
                if (value === 'custom') {
                    // 切到自定义标签时，强制使用自定义方案
                    if (typeof setColorScheme === 'function') setColorScheme('Custom');
                }
                renderColorPreviews();
                if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
                persistCurrentModeColorSettings();
            });
            return b;
        };
        const btnSeq = mkBtn('color-tab-sequential', 'Sequential', 'sequential');
        const btnDiv = mkBtn('color-tab-diverging', 'Diverging', 'diverging');
        const btnCus = mkBtn('color-tab-custom', 'Custom', 'custom');
        tabs.appendChild(btnSeq);
        tabs.appendChild(btnDiv);
        tabs.appendChild(btnCus);
        // 插入到预览容器之上
        wrapper.insertBefore(tabs, container);
    }
    // 高亮当前标签
    const btnSeq = document.getElementById('color-tab-sequential');
    const btnDiv = document.getElementById('color-tab-diverging');
    const btnCus = document.getElementById('color-tab-custom');
    [btnSeq, btnDiv, btnCus].forEach(b => { if (b) { b.classList.remove('selected'); b.style.fontWeight = '500'; } });
    if (colorSchemeCategory === 'sequential' && btnSeq) { btnSeq.classList.add('selected'); btnSeq.style.fontWeight = '700'; }
    if (colorSchemeCategory === 'diverging' && btnDiv) { btnDiv.classList.add('selected'); btnDiv.style.fontWeight = '700'; }
    if (colorSchemeCategory === 'custom' && btnCus) { btnCus.classList.add('selected'); btnCus.style.fontWeight = '700'; }

    // 清空预览容器
    container.innerHTML = '';

    const reversed = (typeof colorSchemeReversed !== 'undefined')
        ? !!colorSchemeReversed
        : !!(typeof window !== 'undefined' && window.colorSchemeReversed);

    if (colorSchemeCategory === 'diverging') {
        // 分歧色板
        if (typeof getDivergingPalettes !== 'function') return;
        const palettes = getDivergingPalettes();
        Object.keys(palettes).forEach(key => {
            const info = palettes[key];
            const wrapperItem = document.createElement('div');
            wrapperItem.className = 'color-preview';
            if (key === divergingPalette) wrapperItem.classList.add('selected');

            const swatches = document.createElement('div');
            swatches.className = 'swatches';
            const steps = Array.isArray(info.range) ? info.range : ['#2166ac', '#f7f7f7', '#b2182b'];
            const effectiveSteps = reversed ? steps.slice().reverse() : steps;
            effectiveSteps.forEach(col => {
                const s = document.createElement('div');
                s.className = 'swatch';
                s.style.background = col;
                swatches.appendChild(s);
            });

            const label = document.createElement('div');
            label.textContent = info.name || key;
            label.style.fontSize = '11px';

            wrapperItem.appendChild(swatches);
            wrapperItem.appendChild(label);
            wrapperItem.addEventListener('click', () => {
                setDivergingPalette(key);
                renderColorPreviews();
            });
            container.appendChild(wrapperItem);
        });
    } else if (colorSchemeCategory === 'sequential') {
        // 顺序色板（包括 Custom）
        if (typeof COLOR_SCHEMES === 'undefined') return;
        Object.keys(COLOR_SCHEMES).filter(k => k !== 'Custom').forEach(key => {
            const info = COLOR_SCHEMES[key];
            const wrapperItem = document.createElement('div');
            wrapperItem.className = 'color-preview';
            if (key === colorScheme) wrapperItem.classList.add('selected');

            const swatches = document.createElement('div');
            swatches.className = 'swatches';
            for (let i = 0; i < 5; i++) {
                const t0 = i / 4;
                const t = (typeof colorSchemeReversed !== 'undefined' && colorSchemeReversed) ? (1 - t0) : t0;
                let color = '#ccc';
                try {
                    let interp = info.interpolator || d3.interpolateViridis;
                    if (key === 'Custom') {
                        const stops = (Array.isArray(customColorStops) && customColorStops.length >= 2)
                            ? customColorStops
                            : [customColorStart, customColorEnd];
                        interp = (stops.length === 2) ? d3.interpolate(stops[0], stops[1]) : d3.interpolateRgbBasis(stops);
                    }
                    color = typeof interp === 'function' ? interp(t) : interp;
                } catch (_) { color = '#ccc'; }
                const s = document.createElement('div');
                s.className = 'swatch';
                s.style.background = color;
                swatches.appendChild(s);
            }

            const label = document.createElement('div');
            label.textContent = key;
            label.style.fontSize = '11px';

            wrapperItem.appendChild(swatches);
            wrapperItem.appendChild(label);
            wrapperItem.addEventListener('click', () => { setColorScheme(key); renderColorPreviews(); });
            container.appendChild(wrapperItem);
        });
    } else if (colorSchemeCategory === 'custom') {
        // 自定义色板预览（仅显示当前自定义梯度）
        const wrapperItem = document.createElement('div');
        wrapperItem.className = 'color-preview selected';
        const swatches = document.createElement('div');
        swatches.className = 'swatches';
        for (let i = 0; i < 5; i++) {
            const t0 = i / 4;
            let color = '#ccc';
            try {
                const stops = (Array.isArray(customColorStops) && customColorStops.length >= 2)
                    ? customColorStops
                    : [customColorStart, customColorEnd];
                const interp = (stops.length === 2) ? d3.interpolate(stops[0], stops[1]) : d3.interpolateRgbBasis(stops);
                color = interp(t0);
            } catch (_) { color = '#ccc'; }
            const s = document.createElement('div');
            s.className = 'swatch';
            s.style.background = color;
            swatches.appendChild(s);
        }
        const label = document.createElement('div');
        label.textContent = 'Custom gradient';
        label.style.fontSize = '11px';
        wrapperItem.appendChild(swatches);
        wrapperItem.appendChild(label);
        container.appendChild(wrapperItem);
    }

    // 在分歧色板类别下隐藏自定义颜色控件（避免混淆）
    const customControls = document.getElementById('custom-color-controls');
    if (customControls) {
        customControls.style.display = (colorSchemeCategory === 'custom') ? 'flex' : 'none';
    }
}

function handleCustomColorChange(e) {
    // 更新全局自定义颜色变量
    if (e.target.id === 'custom-color-start') {
        customColorStart = e.target.value;
    } else if (e.target.id === 'custom-color-end') {
        customColorEnd = e.target.value;
    }

    // 自定义颜色变化后按当前模式重绘（而非强制单样本）
    if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
}

function handleLabelThresholdChange(e) {
    labelThreshold = e.target.value / 100; // 转换为0-1
    document.getElementById('label-threshold-value').textContent = e.target.value + '%';
    if (showLabels) redrawCurrentViz();
}

// 动态生成“标签层级（多选，从叶）”选项
window.updateLabelLevelsOptions = function (maxLeafHeight, hasFunctionLeaf, dynamicNamesFromLeaf, leafCount) {
    const container = document.getElementById('label-levels');
    if (!container) return;

    // 如果层级数量、功能叶标志和叶子计数都无变化且已有选项，则不重复渲染
    // 这样可以保证当 leafCount 发生变化（例如通过过滤）时，仍会重新计算并更新性能提示
    const prevMax = container.dataset.maxHeight ? parseInt(container.dataset.maxHeight) : undefined;
    const prevHasFunc = (container.dataset.hasFunctionLeaf || '');
    const prevLeafCount = container.dataset.leafCount ? parseInt(container.dataset.leafCount) : undefined;
    if (
        typeof prevMax !== 'undefined' && prevMax === maxLeafHeight &&
        String(!!hasFunctionLeaf) === prevHasFunc &&
        // 若外部未提供 leafCount，则保持旧行为（忽略 leafCount）；否则要求 leafCount 相同才跳过
        (typeof leafCount !== 'number' || (typeof prevLeafCount !== 'undefined' && prevLeafCount === leafCount))
    ) {
        return;
    }
    container.innerHTML = '';
    container.dataset.maxHeight = String(maxLeafHeight);
    container.dataset.hasFunctionLeaf = String(!!hasFunctionLeaf);
    // 记录 leaf count（可用于外部诊断/提示）
    if (typeof leafCount === 'number') container.dataset.leafCount = String(leafCount);

    // Rank names from leaf outward
    const fallbackNames = hasFunctionLeaf
        ? ['Function', 'Genome', 'Species', 'Genus', 'Family', 'Order', 'Class', 'Phylum', 'Kingdom', 'Domain']
        : ['Species', 'Genus', 'Family', 'Order', 'Class', 'Phylum', 'Kingdom', 'Domain'];
    // Prefer dynamic names inferred from current hierarchy (accounts for skipped single-child root)
    const namesFromLeaf = (Array.isArray(dynamicNamesFromLeaf) && dynamicNamesFromLeaf.length)
        ? dynamicNamesFromLeaf
        : fallbackNames;

    // 默认勾选“最外两层”（从叶：0和1）；若层级较少，做边界处理
    const defaultSelected = [];
    if (maxLeafHeight >= 0) defaultSelected.push(0);
    // if (maxLeafHeight >= 1) defaultSelected.push(1);
    labelLevelsSelected = defaultSelected.slice();
    // 根据默认选中项决定初始 showLabels（空数组 => 不显示）
    if (Array.isArray(labelLevelsSelected)) {
        showLabels = labelLevelsSelected.length > 0;
    }

    // 添加/更新性能提示（在标签层级控件上方）
    try {
        const hintId = 'label-performance-hint';
        let hintEl = document.getElementById(hintId);
        if (!hintEl && container.parentElement) {
            hintEl = document.createElement('div');
            hintEl.id = hintId;
            hintEl.style.fontSize = '12px';
            hintEl.style.color = '#b00';
            hintEl.style.margin = '6px 0';
            hintEl.style.display = 'none';
            container.parentElement.insertBefore(hintEl, container);
        }
        if (hintEl) {
            hintEl.textContent = '';
            hintEl.style.display = 'none';
            hintEl.setAttribute('aria-hidden', 'true');
        }
    } catch (_) { /* ignore hint failures */ }

    for (let k = 0; k <= maxLeafHeight; k++) {
        const id = `label-level-${k}`;
        const wrapper = document.createElement('label');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '4px';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = id;
        cb.value = String(k);
        cb.checked = defaultSelected.includes(k); // 默认仅勾选最外两层

        const text = document.createElement('span');
        const name = namesFromLeaf[k] || `Level ${k}`;
        // 与标题一致：显示“从叶的距离（k）”，0 表示叶，数值越大越靠近根
        text.textContent = `${k} (${name})`;

        wrapper.appendChild(cb);
        wrapper.appendChild(text);
        container.appendChild(wrapper);

        cb.addEventListener('change', () => {
            const checked = Array.from(container.querySelectorAll('input[type="checkbox"]'))
                .filter(el => el.checked)
                .map(el => parseInt(el.value));
            // 语义调整：
            // - 空数组 (checked.length===0) 表示 "不显示任何级别的标签"；
            // - 非空数组表示显示这些层级；
            // - 若未来需要表示 "全部"，可使用 null 作为特殊值（目前未设置为 null）
            labelLevelsSelected = checked;
            // 同步 showLabels：只有当有选中层级时才显示标签
            showLabels = Array.isArray(labelLevelsSelected) ? labelLevelsSelected.length > 0 : true;
            // 触发重绘（让渲染端依据 showLabels 值决定是否绘制）
            redrawCurrentViz();
        });
    }
}

function handleLabelFontSizeChange(e) {
    labelFontSize = parseInt(e.target.value);
    document.getElementById('label-font-size-value').textContent = labelFontSize + 'px';
    if (showLabels) redrawCurrentViz();
}

function handleLabelMaxLengthChange(e) {
    const v = parseInt(e.target.value);
    // 约束范围 [4, 80]
    labelMaxLength = Math.max(4, Math.min(80, isNaN(v) ? 15 : v));
    if (showLabels) redrawCurrentViz();
}

function handleLabelOverflowChange(e) {
    const mode = String(e.target.value || 'ellipsis');
    labelOverflowMode = (mode === 'wrap') ? 'wrap' : 'ellipsis';
    if (showLabels) redrawCurrentViz();
}

function handleQuantileInputsChange() {
    let low = parseFloat(document.getElementById('quantile-low').value);
    let high = parseFloat(document.getElementById('quantile-high').value);
    if (isNaN(low)) low = 2; if (isNaN(high)) high = 98;
    // 约束范围并确保 low < high（简单 0.1% 间隔）
    low = Math.max(0, Math.min(low, 99.99));
    high = Math.max(0.1, Math.min(high, 100));
    if (low >= high) {
        // 若输入冲突，自动推开 0.1%
        if (this && this.id === 'quantile-low') {
            low = Math.max(0, high - 0.1);
            document.getElementById('quantile-low').value = low;
        } else {
            high = Math.min(100, low + 0.1);
            document.getElementById('quantile-high').value = high;
        }
    }
    // 更新全局（百分数→小数）
    quantileLow = low / 100;
    quantileHigh = high / 100;
    redrawCurrentViz();
}

function handleShowIndividualLegendsChange(e) {
    showIndividualLegends = e.target.checked;
    redrawCurrentViz();
}

function handleNodeSizeMultiplierChange(e) {
    nodeSizeMultiplier = parseFloat(e.target.value);
    document.getElementById('node-size-value').textContent = nodeSizeMultiplier.toFixed(1) + 'x';
    redrawCurrentViz();
}

function handleMinNodeSizeChange(e) {
    minNodeSize = parseInt(e.target.value);
    document.getElementById('min-node-size-value').textContent = minNodeSize + 'px';
    redrawCurrentViz();
}

function handleMaxNodeSizeChange(e) {
    maxNodeSize = parseInt(e.target.value);
    document.getElementById('max-node-size-value').textContent = maxNodeSize + 'px';
    redrawCurrentViz();
}

// 一键还原：重置“Labels & Nodes”区域的所有设置到默认值
function resetLabelsNodesToDefaults() {
    try {
        // 1) 标签数量阈值
        const thr = document.getElementById('label-threshold');
        if (thr) {
            thr.value = '100';
            document.getElementById('label-threshold-value').textContent = '100%';
            // 全局变量（在 core/app-core.js 中）
            labelThreshold = 1.0;
        }

        // 2) 字号
        const font = document.getElementById('label-font-size');
        // 2.1) 标签最大长度与溢出
        const maxLen = document.getElementById('label-max-length');
        if (maxLen) maxLen.value = '15';
        labelMaxLength = 15;
        const overflowSel = document.getElementById('label-overflow');
        if (overflowSel) overflowSel.value = 'ellipsis';
        labelOverflowMode = 'ellipsis';
        if (font) {
            font.value = '9';
            document.getElementById('label-font-size-value').textContent = '9px';
            labelFontSize = 9;
        }

        // 3) 节点大小倍数/最小/最大
        const mult = document.getElementById('node-size-multiplier');
        if (mult) {
            mult.value = '1';
            document.getElementById('node-size-value').textContent = '1.0x';
            nodeSizeMultiplier = 1.0;
        }
        const minSize = document.getElementById('min-node-size');
        if (minSize) {
            minSize.value = '3';
            document.getElementById('min-node-size-value').textContent = '3px';
            minNodeSize = 3;
        }
        const maxSize = document.getElementById('max-node-size');
        if (maxSize) {
            maxSize.value = '35';
            document.getElementById('max-node-size-value').textContent = '35px';
            maxNodeSize = 35;
        }

        // 3.1) 节点不透明度
        const nodeOp = document.getElementById('node-opacity');
        if (nodeOp) {
            nodeOp.value = '1';
            const opSpan = document.getElementById('node-opacity-value');
            if (opSpan) opSpan.textContent = '100%';
            nodeOpacity = 1.0;
        }

        // 4) 边宽度倍数
        const edgeWidth = document.getElementById('edge-width-multiplier');
        if (edgeWidth) {
            edgeWidth.value = '1';
            document.getElementById('edge-width-value').textContent = '1.0x';
            edgeWidthMultiplier = 1.0;
        }

        const minEdgeW = document.getElementById('min-edge-width');
        if (minEdgeW) {
            minEdgeW.value = '0.5';
            document.getElementById('min-edge-width-value').textContent = '0.5';
            minEdgeWidth = 0.5;
        }

        // 4.1) 边不透明度
        const edgeOp = document.getElementById('edge-opacity');
        if (edgeOp) {
            edgeOp.value = '0.8';
            const opSpan = document.getElementById('edge-opacity-value');
            if (opSpan) opSpan.textContent = '80%';
            edgeOpacity = 0.8;
        }

        // 5) 标签层级（从叶）恢复默认：考虑当前叶子节点数，若节点数过多则不勾选叶标签以避免性能问题
        const levelsWrap = document.getElementById('label-levels');
        if (levelsWrap) {
            // 取消所有选中
            levelsWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

            // 尝试获取当前 leafCount（优先使用 window.__leafCount，其次使用 container.dataset）
            let leafCount = undefined;
            try { leafCount = (typeof window !== 'undefined' && typeof window.__leafCount === 'number') ? window.__leafCount : undefined; } catch (_) { leafCount = undefined; }
            try {
                if (typeof leafCount !== 'number' && levelsWrap.dataset && levelsWrap.dataset.leafCount) {
                    const parsed = parseInt(levelsWrap.dataset.leafCount);
                    if (!isNaN(parsed)) leafCount = parsed;
                }
            } catch (_) { /* ignore */ }


            const checked = [];
            // 默认勾选叶层标签
            const leafCb = levelsWrap.querySelector('input[type="checkbox"][value="0"]');
            if (leafCb) {
                leafCb.checked = true;
                checked.push(0);
            }

            // 同步到全局与显示标志
            labelLevelsSelected = checked;
            showLabels = Array.isArray(labelLevelsSelected) ? labelLevelsSelected.length > 0 : true;

            // 隐藏性能提示
            try {
                const hintEl = document.getElementById('label-performance-hint');
                if (hintEl) {
                    hintEl.style.display = 'none';
                    hintEl.setAttribute('aria-hidden', 'true');
                    hintEl.textContent = '';
                }
            } catch (_) { /* ignore hint update errors */ }
        }

        // 统一重绘
        redrawCurrentViz();
    } catch (err) {
        console.warn('Failed to reset Labels & Nodes settings', err);
    }
}

function handleEdgeWidthMultiplierChange(e) {
    edgeWidthMultiplier = parseFloat(e.target.value);
    document.getElementById('edge-width-value').textContent = edgeWidthMultiplier.toFixed(1) + 'x';
    redrawCurrentViz();
}

function handleMinEdgeWidthChange(e) {
    minEdgeWidth = parseFloat(e.target.value);
    document.getElementById('min-edge-width-value').textContent = minEdgeWidth.toFixed(1);
    redrawCurrentViz();
}

function handleEdgeOpacityChange(e) {
    // clamp to [0.05,1] to avoid fully invisible links
    edgeOpacity = Math.max(0.05, Math.min(1, parseFloat(e.target.value)));
    const el = document.getElementById('edge-opacity-value');
    if (el) el.textContent = Math.round(edgeOpacity * 100) + '%';
    redrawCurrentViz();
}

function handleNodeOpacityChange(e) {
    nodeOpacity = Math.max(0, Math.min(1, parseFloat(e.target.value)));
    const el = document.getElementById('node-opacity-value');
    if (el) el.textContent = Math.round(nodeOpacity * 100) + '%';
    redrawCurrentViz();
}

function handleToggleSamples() {
    const panel = document.getElementById('sample-selection-panel');
    const btn = document.getElementById('toggle-samples');

    if (panel.classList.contains('expanded')) {
        panel.classList.remove('expanded');
        panel.style.display = 'none';
        btn.textContent = 'Expand ▼';
        btn.classList.remove('expanded');
    } else {
        panel.classList.add('expanded');
        panel.style.display = 'block';
        btn.textContent = 'Collapse ▲';
        btn.classList.add('expanded');
    }
}

// ========== 比较模式事件处理 ==========

// Helper to manage sub-containers for different modes to preserve state
window.getVizSubContainer = function (mode) {
    const container = document.getElementById('viz-container');
    if (!container) return null;
    const subId = `viz-panel-${mode}`;
    let sub = document.getElementById(subId);
    if (!sub) {
        sub = document.createElement('div');
        sub.id = subId;
        sub.className = 'viz-panel-sub';
        sub.style.width = '100%';
        container.appendChild(sub);
    }
    return sub;
};

window.updateVizContainerVisibility = function (mode) {
    const modes = ['single', 'group', 'comparison', 'matrix'];
    modes.forEach(m => {
        const sub = window.getVizSubContainer(m);
        if (sub) {
            // Use empty string to let CSS control display (grid vs block), or 'none' to hide
            sub.style.display = (m === mode) ? '' : 'none';
        }
    });
};

function handleVisualizationModeChange() {
    const prevMode = (typeof window !== 'undefined' && window.visualizationMode)
        ? window.visualizationMode
        : visualizationMode;
    persistCurrentModeColorSettings(prevMode);
    visualizationMode = document.getElementById('viz-mode').value;

    // Manage visibility instead of clearing to preserve state
    if (typeof window.updateVizContainerVisibility === 'function') {
        window.updateVizContainerVisibility(visualizationMode);
    }

    try { if (typeof window !== 'undefined') window.visualizationMode = visualizationMode; } catch (_) { }
    applyModeColorSettings(visualizationMode);
    setActiveLayoutPanelContext(getActiveLayoutPanelContext(), { force: true });

    // 显示/隐藏相关控制
    const comparisonControls = document.getElementById('comparison-controls');
    const samplesToggle = document.getElementById('samples-toggle-group');
    const samplesToggleRow = document.getElementById('samples-toggle-row');
    const singleModeSettings = document.getElementById('single-mode-settings');
    const groupModeSettings = document.getElementById('group-mode-settings');
    const groupSelectionRow = document.getElementById('group-selection-row');
    const matrixGroupSelection = document.getElementById('matrix-group-selection');
    const sharedLegend = document.getElementById('shared-legend');

    // Hide shared legend in comparison/matrix modes as they have their own legends
    if (sharedLegend) {
        sharedLegend.style.display = (visualizationMode === 'comparison' || visualizationMode === 'matrix') ? 'none' : 'block';
    }

    if (visualizationMode === 'single') {
        // 单样本模式
        if (comparisonControls) comparisonControls.style.display = 'none';
        if (groupModeSettings) groupModeSettings.style.display = 'none';
        if (samplesToggleRow) samplesToggleRow.style.display = 'flex';
        else if (samplesToggle) samplesToggle.style.display = 'flex';
        if (singleModeSettings) singleModeSettings.style.display = 'block';
        // 单样本显著性控件仅在 combined_long 下显示
        try {
            const isCombined = !!(typeof window !== 'undefined' && window.isCombinedLong);
            const rowToggle = document.getElementById('single-significance-toggle-row');
            const rowThresh = document.getElementById('single-significance-thresholds-row');
            const cb = document.getElementById('single-show-significance');
            if (rowToggle) rowToggle.style.display = isCombined ? 'flex' : 'none';
            if (rowThresh) rowThresh.style.display = (isCombined && cb && cb.checked) ? 'flex' : 'none';
        } catch (_) { }
        // 清理任何矩阵内联放大状态
        try { delete window.currentInlineComparison; } catch (_) { window.currentInlineComparison = null; }

        // 重新绘制
        if (treeData && selectedSamples.length > 0) {
            initVisualization();
            drawAllTrees();
        }
    } else if (visualizationMode === 'group') {
        // group模式: 显示group选择控件和single-mode-settings
        if (comparisonControls) comparisonControls.style.display = 'none';
        if (groupModeSettings) groupModeSettings.style.display = 'block';
        if (samplesToggleRow) samplesToggleRow.style.display = 'none';
        else if (samplesToggle) samplesToggle.style.display = 'none';
        if (singleModeSettings) singleModeSettings.style.display = 'block';  // 显示single模式的设置

        // 确保样本选择面板被折叠/隐藏
        const samplePanel = document.getElementById('sample-selection-panel');
        const toggleBtn = document.getElementById('toggle-samples');
        if (samplePanel) {
            samplePanel.classList.remove('expanded');
            samplePanel.style.display = 'none';
        }
        if (toggleBtn) {
            toggleBtn.textContent = 'Expand ▼';
            toggleBtn.classList.remove('expanded');
        }

        // 初始化group选项
        updateGroupMetaColumnOptions();

        // 如果已经有选中的组,重新绘制
        if (treeData && selectedGroups.length > 0) {
            initVisualization();
            drawAllTrees();
        }
    } else {
        // 比较模式（comparison 或 matrix）
        if (comparisonControls) comparisonControls.style.display = 'block';
        if (singleModeSettings) singleModeSettings.style.display = 'none';
        if (groupModeSettings) groupModeSettings.style.display = 'none';
        if (samplesToggleRow) samplesToggleRow.style.display = 'none';
        else if (samplesToggle) samplesToggle.style.display = 'none';
        // Ensure the sample selection panel is collapsed/hidden when entering comparison/matrix modes
        const samplePanel = document.getElementById('sample-selection-panel');
        const toggleBtn = document.getElementById('toggle-samples');
        if (samplePanel) {
            samplePanel.classList.remove('expanded');
            samplePanel.style.display = 'none';
        }
        if (toggleBtn) {
            toggleBtn.textContent = 'Expand ▼';
            toggleBtn.classList.remove('expanded');
        }

        // 比较/矩阵模式：若未手动设定域，默认使用 5 并同步输入框
        const hasManual = getManualDomainForMode('comparison') != null;
        if (!hasManual) {
            const input = document.getElementById('color-domain-abs');
            if (input) input.value = 5;
            if (typeof comparisonColorDomain !== 'undefined') comparisonColorDomain = [-5, 0, 5];
            else if (typeof window !== 'undefined') window.comparisonColorDomain = [-5, 0, 5];
        }

        // 根据模式显示/隐藏组选择器
        if (groupSelectionRow) {
            groupSelectionRow.style.display = visualizationMode === 'comparison' ? 'flex' : 'none';
        }
        if (matrixGroupSelection) {
            matrixGroupSelection.style.display = visualizationMode === 'matrix' ? 'flex' : 'none';
        }

        // 更新分组显示和组选择器
        updateGroupDefinitionsDisplay();
    }
}

function handleDefineGroupsClick() {
    const modal = document.getElementById('group-modal');
    modal.style.display = 'block';

    // 更新样本列表
    updateSampleChecklistInModal();

    // 更新已有分组列表
    updateExistingGroupsList();
}

function handleVizExportRequest(format) {
    const fallbackMode = (typeof visualizationMode !== 'undefined') ? visualizationMode : 'single';
    const mode = (typeof window !== 'undefined' && window.visualizationMode) ? window.visualizationMode : fallbackMode;
    const vizContainer = document.getElementById('viz-container');

    if (mode !== 'single' && mode !== 'group' && mode !== 'matrix') {
        alert('Export is currently available in Individual samples, Group samples, or Comparison matrix views.');
        return;
    }

    if (!vizContainer || vizContainer.children.length === 0) {
        alert('Nothing to export yet. Please render a visualization first.');
        return;
    }

    if (mode === 'group') {
        const groups = Array.isArray(selectedGroups) ? selectedGroups.filter(Boolean) : [];
        if (!groups.length) {
            alert('Please select at least one group to export.');
            return;
        }
    }

    if (mode === 'single') {
        const samples = typeof getActiveSamples === 'function'
            ? (getActiveSamples() || [])
            : (Array.isArray(selectedSamples) ? selectedSamples : []);
        if (!samples.length) {
            alert('Please select at least one sample to export.');
            return;
        }
    }

    try {
        if (typeof window !== 'undefined' && typeof window.ensurePanelsRenderedForExport === 'function') {
            window.ensurePanelsRenderedForExport();
        }
    } catch (_) { }

    if (format === 'svg') {
        if (typeof window !== 'undefined' && typeof window.exportVizContainerAsSVG === 'function') {
            window.exportVizContainerAsSVG();
        } else {
            console.warn('exportVizContainerAsSVG is not available');
        }
    } else if (format === 'png') {
        if (typeof window !== 'undefined' && typeof window.exportVizContainerAsPNG === 'function') {
            window.exportVizContainerAsPNG();
        } else {
            console.warn('exportVizContainerAsPNG is not available');
        }
    }
}

function hideVizExportMenu() {
    const menu = document.getElementById('viz-export-menu');
    if (!menu) return;
    menu.style.display = 'none';
    menu.style.visibility = 'hidden';
    delete menu.dataset.active;
}

function showVizExportMenu(clientX, clientY) {
    const menu = document.getElementById('viz-export-menu');
    if (!menu) return;
    hideVizExportMenu();
    if (typeof hideLabelColorMenu === 'function') {
        try { hideLabelColorMenu(); } catch (_) { }
    }
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';

    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    let left = clientX;
    let top = clientY;

    const maxLeft = Math.max(8, viewportWidth - menuRect.width - 8);
    const maxTop = Math.max(8, viewportHeight - menuRect.height - 8);
    left = Math.min(left, maxLeft);
    top = Math.min(top, maxTop);
    left = Math.max(8, left);
    top = Math.max(8, top);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';
    menu.dataset.active = 'true';
}

try {
    if (typeof window !== 'undefined') {
        window.hideVizExportMenu = hideVizExportMenu;
    }
} catch (_) { }

function updateSampleChecklistInModal() {
    const checklist = document.getElementById('sample-checklist');

    if (!samples || samples.length === 0) {
        checklist.innerHTML = '<em>No samples available. Please load a data file first.</em>';
        return;
    }

    const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
    const visibleSamples = samples.filter(s => passes(s));
    checklist.innerHTML = '';
    if (visibleSamples.length === 0) {
        checklist.innerHTML = '<em style="color:#999">No samples after current meta filters.</em>';
        return;
    }
    visibleSamples.forEach(sample => {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" class="sample-checkbox" value="${sample}">
            ${sample}
        `;
        checklist.appendChild(label);
    });
}

function updateExistingGroupsList() {
    const listContainer = document.getElementById('existing-groups-list');
    const groups = getAllGroups();

    if (Object.keys(groups).length === 0) {
        listContainer.innerHTML = '<em style="color: #999;">No groups defined yet</em>';
        return;
    }

    listContainer.innerHTML = '';
    const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
    let shown = 0;
    Object.entries(groups).forEach(([groupName, sampleList]) => {
        const filtered = (sampleList || []).filter(s => passes(s));
        const filteredCount = filtered.length;
        if (filteredCount === 0) return; // 不显示 0 样本的组
        shown++;
        const groupItem = document.createElement('div');
        groupItem.className = 'group-item';
        groupItem.innerHTML = `
            <div class="group-name">${groupName}</div>
            <div class="group-samples">${filteredCount}</div>
            <div class="group-actions">
                <button class="btn-group-action btn-group-delete" data-group="${groupName}">Delete</button>
            </div>
        `;
        listContainer.appendChild(groupItem);
    });
    if (shown === 0) {
        listContainer.innerHTML = '<em style="color:#999;">No groups available after current filter</em>';
    }

    // 绑定删除按钮事件
    listContainer.querySelectorAll('.btn-group-delete').forEach(btn => {
        btn.addEventListener('click', function () {
            const groupName = this.dataset.group;
            if (confirm(`Delete group "${groupName}"?`)) {
                removeGroup(groupName);
                updateExistingGroupsList();
                updateGroupDefinitionsDisplay();
            }
        });
    });
}

function handleSaveGroup() {
    const groupName = document.getElementById('group-name-input').value.trim();

    if (!groupName) {
        alert('Please enter a group name.');
        return;
    }

    const checkboxes = document.querySelectorAll('.sample-checkbox:checked');
    const selectedSamplesList = Array.from(checkboxes).map(cb => cb.value);

    if (selectedSamplesList.length === 0) {
        alert('Please select at least one sample for this group.');
        return;
    }

    // 保存分组
    if (defineGroup(groupName, selectedSamplesList)) {
        alert(`Group "${groupName}" saved with ${selectedSamplesList.length} samples.`);

        // 清空输入
        document.getElementById('group-name-input').value = '';
        document.querySelectorAll('.sample-checkbox').forEach(cb => cb.checked = false);

        // 更新显示
        updateExistingGroupsList();
        updateGroupDefinitionsDisplay();

        // 如果是 Group samples 模式，也更新复选框列表
        const modeSelect = document.getElementById('viz-mode');
        if (modeSelect && modeSelect.value === 'group') {
            console.log('Calling updateGroupCheckboxes after saving group');
            updateGroupCheckboxes();
        }
    } else {
        alert('Failed to save group. Please try again.');
    }
}

function updateGroupDefinitionsDisplay() {
    const displayDiv = document.getElementById('unified-group-display');
    const groups = getAllGroups();

    if (Object.keys(groups).length === 0) {
        displayDiv.innerHTML = '<em style="color: rgba(255,255,255,0.7);">No groups defined</em>';
        // 清空组选择下拉框
        updateGroupSelectors();
        return;
    }

    const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
    const filteredNames = Object.keys(groups).filter(name => {
        const list = Array.isArray(groups[name]) ? groups[name] : [];
        return list.filter(s => passes(s)).length > 0;
    });

    if (filteredNames.length === 0) {
        displayDiv.innerHTML = '<em style="color: rgba(255,255,255,0.7);">No groups available after current filter</em>';
        updateGroupSelectors();
        return;
    }

    let html = '';

    // 根据当前模式决定显示方式
    if (visualizationMode === 'matrix') {
        // Matrix 模式：显示为带复选框的列表，并添加快捷按钮
        html += `
            <div class="flex justify-between ai-center mb-8">
                <div class="flex gap-6">
                    <button id="select-all-groups" class="btn-small">All</button>
                    <button id="select-none-groups" class="btn-small">None</button>
                    <button id="invert-groups" class="btn-small">Invert</button>
                </div>
            </div>
            <div class="p-6 bg-light-surface br-4 maxh-140 overflow-y-auto" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">
        `;

        filteredNames.forEach(groupName => {
            const list = groups[groupName] || [];
            const filtered = list.filter(s => passes(s));
            const filteredCount = filtered.length;
            const totalCount = list.length;

            html += `
                <label class="flex ai-center gap-6" style="cursor: pointer;">
                    <input type="checkbox" class="matrix-group-checkbox" value="${groupName}" checked>
                    <span title="${groupName}: ${filteredCount} samples${totalCount !== filteredCount ? ' (' + totalCount + ' total)' : ''}">${groupName} (${filteredCount})</span>
                </label>
            `;
        });

        html += '</div>';
    } else {
        // Comparison 模式：只显示分组信息
        filteredNames.forEach(groupName => {
            const list = groups[groupName] || [];
            const filtered = list.filter(s => passes(s));
            const filteredCount = filtered.length;
            const totalCount = list.length;

            html += `
                <div style="margin: 5px 0; padding: 8px; background: rgba(255,255,255,0.2); border-radius: 4px;">
                    <strong>${groupName}</strong>: ${filteredCount} ${totalCount !== filteredCount ? `(<span title="unfiltered total">${totalCount} total</span>)` : ''}
                </div>
            `;
        });
    }

    displayDiv.innerHTML = html;

    // 绑定 matrix 模式的快捷按钮事件
    if (visualizationMode === 'matrix') {
        const selectAllBtn = document.getElementById('select-all-groups');
        const selectNoneBtn = document.getElementById('select-none-groups');
        const invertBtn = document.getElementById('invert-groups');

        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', function () {
                document.querySelectorAll('.matrix-group-checkbox').forEach(cb => cb.checked = true);
            });
        }

        if (selectNoneBtn) {
            selectNoneBtn.addEventListener('click', function () {
                document.querySelectorAll('.matrix-group-checkbox').forEach(cb => cb.checked = false);
            });
        }

        if (invertBtn) {
            invertBtn.addEventListener('click', function () {
                document.querySelectorAll('.matrix-group-checkbox').forEach(cb => cb.checked = !cb.checked);
            });
        }
    }

    // 更新组选择下拉框
    updateGroupSelectors();
}

function updateGroupSelectors() {
    const groups = getAllGroups();
    const groupNames = Object.keys(groups);

    const select1 = document.getElementById('select-group1');
    const select2 = document.getElementById('select-group2');

    if (!select1 || !select2) return;

    // 保存当前选择
    const currentGroup1 = select1.value;
    const currentGroup2 = select2.value;

    // 清空选项
    select1.innerHTML = '<option value="">-- Select Group 1 --</option>';
    select2.innerHTML = '<option value="">-- Select Group 2 --</option>';
    const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
    const filteredNames = groupNames.filter(name => Array.isArray(groups[name]) && groups[name].some(s => passes(s)));
    // 添加组选项（仅包含过滤后仍有样本的组）
    filteredNames.forEach(groupName => {
        const option1 = document.createElement('option');
        option1.value = groupName;
        option1.textContent = groupName;
        select1.appendChild(option1);
        const option2 = document.createElement('option');
        option2.value = groupName;
        option2.textContent = groupName;
        select2.appendChild(option2);
    });

    // 恢复之前的选择（如果仍然有效）
    if (filteredNames.includes(currentGroup1)) {
        select1.value = currentGroup1;
    } else if (filteredNames.length > 0) {
        select1.value = filteredNames[0]; // 默认选择第一个组
    }

    if (filteredNames.includes(currentGroup2)) {
        select2.value = currentGroup2;
    } else if (filteredNames.length > 1) {
        select2.value = filteredNames[1]; // 默认选择第二个组
    }
}

function updateMatrixGroupCheckboxes(groupNames) {
    const container = document.getElementById('matrix-group-checkboxes');
    if (!container) return;

    container.innerHTML = '';

    if (groupNames.length === 0) {
        container.innerHTML = '<em style="color: #999; font-size: 12px;">No groups defined</em>';
        return;
    }
    // groupNames 已经过滤为“仍有样本”的组
    let added = 0;
    groupNames.forEach(groupName => {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" class="matrix-group-checkbox" value="${groupName}" checked>
            <span>${groupName}</span>
        `;
        container.appendChild(label);
        added++;
    });
    if (added === 0) {
        container.innerHTML = '<em style="color: #999; font-size: 12px;">No groups available after current filter</em>';
    }
}

function handleRunComparison() {
    const groups = getAllGroups();

    if (Object.keys(groups).length < 2) {
        alert('Please define at least 2 groups before running comparison.');
        return;
    }

    if (!treeData) {
        alert('Please load data first.');
        return;
    }

    // 根据模式获取要比较的组
    let selectedGroups;

    if (visualizationMode === 'comparison') {
        // Comparison 模式：使用选择的两个组
        const selectedGroup1 = document.getElementById('select-group1').value;
        const selectedGroup2 = document.getElementById('select-group2').value;

        // 验证选择
        if (!selectedGroup1 || !selectedGroup2) {
            alert('Please select both Group 1 and Group 2 for comparison.');
            return;
        }

        if (selectedGroup1 === selectedGroup2) {
            alert('Group 1 and Group 2 must be different.');
            return;
        }

        selectedGroups = {
            [selectedGroup1]: groups[selectedGroup1],
            [selectedGroup2]: groups[selectedGroup2]
        };
    } else if (visualizationMode === 'matrix') {
        // Matrix 模式：使用勾选的组
        const checkboxes = document.querySelectorAll('.matrix-group-checkbox:checked');

        if (checkboxes.length < 2) {
            alert('Please select at least 2 groups for matrix comparison.');
            return;
        }

        selectedGroups = {};
        checkboxes.forEach(cb => {
            const groupName = cb.value;
            selectedGroups[groupName] = groups[groupName];
        });
    } else {
        alert('Invalid visualization mode.');
        return;
    }

    // 显示加载提示
    const vizSub = window.getVizSubContainer(visualizationMode);
    if (vizSub) {
        vizSub.innerHTML = '<div style="text-align:center; padding:50px;"><h2>Running comparison analysis...</h2><p>This may take a moment...</p></div>';
    } else {
        document.getElementById('viz-container').innerHTML = '<div style="text-align:center; padding:50px;"><h2>Running comparison analysis...</h2><p>This may take a moment...</p></div>';
    }

    // 获取参数
    comparisonMetric = document.getElementById('comparison-metric').value;
    // divergingPalette is now managed by clickable previews (setDivergingPalette)
    showOnlySignificant = document.getElementById('show-significance').checked;
    const comparisonTest = (document.getElementById('comparison-test') && document.getElementById('comparison-test').value) ? document.getElementById('comparison-test').value : 'wilcoxon';

    // 使用单一域输入：M（默认5）；比较模式下为 [-M, 0, M]
    const domainInput = document.getElementById('color-domain-abs');
    let M = parseFloat(domainInput && domainInput.value);
    if (!isFinite(M) || M <= 0) M = 5;
    const modeKey = getModeColorKey(visualizationMode);
    const normalized = setManualDomainForMode(modeKey, M);
    const effectiveM = normalized != null ? normalized : 5;
    comparisonColorDomain = [-effectiveM, 0, effectiveM];
    if (!divergingPalette) {
        const fallbackPalette = getDefaultDivergingPalette();
        if (fallbackPalette) {
            divergingPalette = fallbackPalette;
            if (typeof renderColorPreviews === 'function') renderColorPreviews();
        }
    }
    persistCurrentModeColorSettings();

    // 根据 meta 过滤组内样本，并剔除过滤后为空的组
    const groupsFiltered = {};
    const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
    Object.entries(selectedGroups).forEach(([name, list]) => {
        const filtered = Array.isArray(list) ? list.filter(s => passes(s)) : [];
        if (filtered.length > 0) {
            groupsFiltered[name] = filtered;
        }
    });

    // 延迟执行以显示加载提示
    setTimeout(() => {
        try {
            // 运行比较 - 保存到全局 window 对象以便重绘函数访问
            const results = compareGroups(treeData, groupsFiltered, {
                metric: comparisonMetric,
                transform: 'none',  // 已在数据中应用
                minAbundance: 0,
                runTests: true,
                test: comparisonTest
            });

            // Store results based on mode to prevent overwriting between modes
            if (visualizationMode === 'comparison') {
                window.comparisonResults_comparison = results;
                window.comparisonResults = results; // Keep for backward compatibility
            } else if (visualizationMode === 'matrix') {
                window.comparisonResults_matrix = results;
                window.comparisonResults = results; // Keep for backward compatibility
            } else {
                window.comparisonResults = results;
            }

            // 验证结果
            if (!results || results.length === 0) {
                throw new Error('No comparison results generated. Check if groups have valid samples.');
            }

            // 验证统计数据
            results.forEach((comp, idx) => {
                // Validate stats; keep warnings/errors but remove verbose logs
                if (!comp.stats || Object.keys(comp.stats).length === 0) {
                    console.warn(`Warning: No statistics for comparison ${idx + 1}`);
                }
            });

            // 根据模式绘制（在运行比较前，确保组有效）
            if (visualizationMode === 'comparison') {
                const [g1, g2] = Object.keys(groupsFiltered);
                if (!g1 || !g2) {
                    const vizSub = window.getVizSubContainer(visualizationMode);
                    if (vizSub) vizSub.innerHTML = '';
                    alert('Selected groups have no samples after current filters. Please adjust filters or choose other groups.');
                    return;
                }
                // 单个比较：使用第一个比较结果
                const comp = results[0];
                drawComparisonTree(comp.treatment_1, comp.treatment_2, comp.stats);
            } else if (visualizationMode === 'matrix') {
                // 矩阵模式：如果过滤后可用组少于 2，则阻止
                const available = Object.keys(groupsFiltered);
                if (available.length < 2) {
                    const vizSub = window.getVizSubContainer(visualizationMode);
                    if (vizSub) vizSub.innerHTML = '';
                    alert('Fewer than 2 groups remain after current filters. Please adjust filters or groups.');
                    return;
                }
                drawComparisonMatrix(results);
            }

            // 显示导出按钮
            document.getElementById('export-comparison').style.display = 'inline-block';

        } catch (error) {
            console.error('Comparison error:', error);
            console.error('Error stack:', error.stack);
            alert('Error running comparison: ' + error.message);
        }
    }, 100);
}

/**
 * Get comparison results based on the current visualization mode.
 * Depends on the global visualizationMode variable to determine which results to return.
 * @returns {Array|undefined} Comparison results array for the current mode (matrix or comparison)
 */
function getComparisonResultsForMode() {
    return (visualizationMode === 'matrix')
        ? (window.comparisonResults_matrix || window.comparisonResults)
        : (window.comparisonResults_comparison || window.comparisonResults);
}

// Open a modal to preview comparison results and offer export options
function handleViewResults() {
    const results = getComparisonResultsForMode();

    if (!results || results.length === 0) {
        alert('No comparison results to view. Please run a comparison first.');
        return;
    }
    createComparisonResultsModal();
    populateComparisonResultsModal();
    const modal = document.getElementById('comparison-results-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        const closeBtn = document.getElementById('comparison-results-close');
        if (closeBtn) closeBtn.focus();
    }
}

function createComparisonResultsModal() {
    if (document.getElementById('comparison-results-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'comparison-results-modal';
    overlay.className = 'comparison-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-hidden', 'true');

    overlay.innerHTML = `
        <div class="comparison-modal-content" role="document">
            <div class="comparison-modal-header">
                <div class="modal-title">Comparison results</div>
                <div class="modal-actions">
                    <select id="comparison-select" aria-label="Select comparison"></select>
                    <button id="comparison-export-tsv" class="btn-icon" title="Export current comparison (TSV)">TSV</button>
                    <button id="comparison-export-csv" class="btn-icon" title="Export current comparison (CSV)">CSV</button>
                    <button class="comparison-modal-close" id="comparison-results-close" aria-label="Close results">Close</button>
                </div>
            </div>
            <div class="comparison-modal-body" id="comparison-results-body"></div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
            closeComparisonResultsModal();
        }
    });

    document.getElementById('comparison-results-close').addEventListener('click', closeComparisonResultsModal);

    document.getElementById('comparison-export-tsv').addEventListener('click', function () {
        const results = getComparisonResultsForMode();
        const idx = parseInt(document.getElementById('comparison-select').value, 10) || 0;
        const singleComp = (results && results[idx]) ? results[idx] : null;
        const comp = singleComp ? [singleComp] : (results || []);
        // Build filename including group names when exporting a single comparison
        let filename = 'comparison_results.tsv';
        if (singleComp) {
            const t1 = sanitizeFilename(singleComp.treatment_1 || 'A');
            const t2 = sanitizeFilename(singleComp.treatment_2 || 'B');
            filename = `comparison_result_${t1}_vs_${t2}.tsv`;
        }
        exportComparisonResults(comp, filename);
    });

    document.getElementById('comparison-export-csv').addEventListener('click', function () {
        const results = getComparisonResultsForMode();
        const idx = parseInt(document.getElementById('comparison-select').value, 10) || 0;
        const comp = (results && results[idx]) ? results[idx] : null;
        if (!comp) {
            alert('No comparison selected');
            return;
        }
        // Build CSV from the selected comparison
        const { treatment_1, treatment_2, stats } = comp;
        let csv = 'treatment_1,treatment_2,taxon_id,log2_median_ratio,log2_mean_ratio,median_1,median_2,mean_1,mean_2,fold_change,difference,mean_difference,p_value,test,FDR_q_value,effect_size,significant,n_samples_1,n_samples_2\n';
        Object.values(stats).forEach(stat => {
            const safe = (v) => (v == null || !isFinite(v)) ? '0' : String(v);
            csv += `${treatment_1},${treatment_2},"${String(stat.taxon_id || '')}",${safe(stat.log2_median_ratio)},${safe(stat.log2_mean_ratio)},${safe(stat.median_1)},${safe(stat.median_2)},${safe(stat.mean_1)},${safe(stat.mean_2)},${safe(stat.fold_change)},${safe(stat.difference)},${safe(stat.mean_difference)},${safe(stat.pvalue)},"${String(stat.test || '')}",${safe(stat.qvalue)},${safe(stat.effect_size)},${stat.significant || false},${stat.n_samples_1 || 0},${stat.n_samples_2 || 0}\n`;
        });
        const t1 = sanitizeFilename(comp.treatment_1 || 'A');
        const t2 = sanitizeFilename(comp.treatment_2 || 'B');
        const csvName = `comparison_result_${t1}_vs_${t2}.csv`;
        downloadTextFile(csvName, csv, 'text/csv');
    });

    const select = document.getElementById('comparison-select');
    select.addEventListener('change', populateComparisonResultsModal);
}

function populateComparisonResultsModal() {
    const body = document.getElementById('comparison-results-body');
    const select = document.getElementById('comparison-select');
    if (!body || !select) return;
    // Preserve current selection (if any) before rebuilding options
    const prevValue = (typeof select.value === 'string' && select.value !== '') ? parseInt(select.value, 10) : 0;
    const comps = getComparisonResultsForMode() || [];
    select.innerHTML = '';
    comps.forEach((c, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${c.treatment_1}  vs  ${c.treatment_2}`;
        select.appendChild(opt);
    });

    if (comps.length === 0) {
        body.innerHTML = '<em class="text-muted">No comparison results available</em>';
        return;
    }

    // Restore previous selection if valid, otherwise default to 0
    const idx = (Number.isFinite(prevValue) && prevValue >= 0 && prevValue < comps.length) ? prevValue : 0;
    select.value = String(idx);
    const comp = comps[idx] || comps[0];
    if (!comp) {
        body.innerHTML = '<em class="text-muted">No comparison results available</em>';
        return;
    }

    // Build a flexible table preview: derive columns from stats keys (exclude treatments)
    const statsObj = comp.stats || {};
    const rows = Object.values(statsObj);
    if (rows.length === 0) {
        body.innerHTML = '<em class="text-muted">No comparison rows available</em>';
        return;
    }

    // Simplified column set for preview table (keep it concise)
    // Preferred columns (in order): taxon_id, log2_median_ratio, log2_mean_ratio, median_1, median_2, mean_1, mean_2,
    // pvalue, FDR_q_value, test, effect_size, significant, n_samples_1, n_samples_2
    const preferredSimple = ['taxon_id', 'log2_median_ratio', 'log2_mean_ratio', 'median_1', 'median_2', 'mean_1', 'mean_2', 'pvalue', 'FDR_q_value', 'test', 'effect_size', 'significant', 'n_samples_1', 'n_samples_2'];
    // Ensure we don't include internal group fields
    const finalCols = preferredSimple.slice();

    // Friendly column labels mapping (key -> display)
    const colLabels = {
        taxon_id: 'Taxon ID',
        log2_median_ratio: 'log2 Median Ratio',
        log2_mean_ratio: 'log2 Mean Ratio',
        median_1: 'Median (Group 1)',
        median_2: 'Median (Group 2)',
        mean_1: 'Mean (Group 1)',
        mean_2: 'Mean (Group 2)',
        pvalue: 'p-value',
        FDR_q_value: 'FDR (q)',
        qvalue: 'FDR (q)',
        test: 'Test',
        effect_size: 'Effect Size',
        significant: 'Significant',
        n_samples_1: 'N (Group 1)',
        n_samples_2: 'N (Group 2)'
    };

    // Build header (use data-col attributes so sorting can reference original key)
    let html = '<div class="comparison-results-table-wrapper"><table class="info-sample-table"><thead><tr>';
    finalCols.forEach(col => {
        const label = colLabels[col] || String(col);
        html += `<th data-col="${escapeHtml(String(col))}">${escapeHtml(String(label))}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Sorting rows: prefer qvalue -> pvalue if present, otherwise leave as-is
    rows.sort((a, b) => {
        const aq = (isFinite(a.qvalue) ? a.qvalue : (isFinite(a.FDR_q_value) ? a.FDR_q_value : Infinity));
        const bq = (isFinite(b.qvalue) ? b.qvalue : (isFinite(b.FDR_q_value) ? b.FDR_q_value : Infinity));
        if (aq !== bq) return aq - bq;
        const ap = isFinite(a.pvalue) ? a.pvalue : (isFinite(a.wilcox_p_value) ? a.wilcox_p_value : Infinity);
        const bp = isFinite(b.pvalue) ? b.pvalue : (isFinite(b.wilcox_p_value) ? b.wilcox_p_value : Infinity);
        return ap - bp;
    });

    const getDecimalsForKey = (key) => {
        if (!key) return 4;
        const lk = key.toLowerCase();
        if (lk.includes('pvalue') || lk === 'pvalue' || lk.includes('q') || lk.includes('fdr')) return 6;
        if (lk.includes('log2') || lk.includes('ratio') || lk.includes('fold') || lk.includes('difference') || lk.includes('effect')) return 4;
        return 3;
    };

    rows.forEach(stat => {
        html += '<tr>';
        finalCols.forEach(col => {
            // Resolve fallbacks for common keys
            let v = null;
            if (col === 'pvalue') {
                v = (isFinite(stat.pvalue) ? stat.pvalue : (isFinite(stat.wilcox_p_value) ? stat.wilcox_p_value : (isFinite(stat.t_p_value) ? stat.t_p_value : null)));
            } else if (col === 'FDR_q_value' || col === 'qvalue') {
                v = (isFinite(stat.FDR_q_value) ? stat.FDR_q_value : (isFinite(stat.qvalue) ? stat.qvalue : null));
            } else {
                v = stat[col];
            }
            let cell = '';
            if (v == null || v === '') {
                cell = '';
            } else if (typeof v === 'number' && isFinite(v)) {
                cell = formatNumber(v, getDecimalsForKey(col));
            } else if (!isNaN(Number(v)) && v !== null && v !== '') {
                // numeric-like strings
                cell = formatNumber(Number(v), getDecimalsForKey(col));
            } else {
                cell = escapeHtml(String(v));
            }
            const title = (col === 'taxon_id') ? ` title="${escapeHtml(String(stat['taxon_id'] || stat.id || ''))}"` : '';
            html += `<td${title}>${cell}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    body.innerHTML = html;

    // 初始化表格列点击排序（绑定在生成的表格上）
    try {
        const table = body.querySelector('table.info-sample-table');
        if (table) {
            const getCellValue = (tr, idx) => {
                const cell = tr.children[idx];
                if (!cell) return '';
                return cell.textContent || cell.innerText || '';
            };

            const comparer = (idx, asc, type) => (a, b) => {
                const v1 = getCellValue(asc ? a : b, idx).trim();
                const v2 = getCellValue(asc ? b : a, idx).trim();
                if (type === 'number') {
                    const n1 = parseFloat(v1.replace(/[^0-9eE.+-]/g, ''));
                    const n2 = parseFloat(v2.replace(/[^0-9eE.+-]/g, ''));
                    if (isNaN(n1) && isNaN(n2)) return 0;
                    if (isNaN(n1)) return 1;
                    if (isNaN(n2)) return -1;
                    return n1 - n2;
                }
                return v1.localeCompare(v2, undefined, { numeric: true, sensitivity: 'base' });
            };

            const ths = table.querySelectorAll('th');
            ths.forEach((th, idx) => {
                th.style.cursor = 'pointer';
                th.addEventListener('click', () => {
                    const dataCol = th.getAttribute('data-col') || th.textContent.trim();
                    const numericCols = ['log2_median_ratio', 'log2_mean_ratio', 'median_1', 'median_2', 'mean_1', 'mean_2', 'pvalue', 'qvalue', 'FDR_q_value', 'fdr_q_value', 'effect_size', 'n_samples_1', 'n_samples_2'];
                    const isNumeric = numericCols.includes(String(dataCol));
                    const type = isNumeric ? 'number' : 'string';
                    const tbody = table.tBodies[0];
                    const rows = Array.from(tbody.querySelectorAll('tr'));
                    const currentAsc = th.classList.contains('sorted-asc');
                    ths.forEach(x => x.classList.remove('sorted-asc', 'sorted-desc'));
                    th.classList.add(currentAsc ? 'sorted-desc' : 'sorted-asc');
                    rows.sort(comparer(idx, !currentAsc, type));
                    rows.forEach(r => tbody.appendChild(r));
                });
            });
        }
    } catch (err) {
        console.warn('Table sorting init failed', err);
    }
}

function closeComparisonResultsModal() {
    const modal = document.getElementById('comparison-results-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

function downloadTextFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
function sanitizeFilename(name) {
    if (!name) return '';
    // Remove quotes and trim, replace spaces and unsafe chars with underscore
    return String(name).trim().replace(/"/g, '').replace(/[^a-zA-Z0-9\-_.]/g, '_');
}

function formatNumber(v, d) {
    if (v == null || !isFinite(v)) return '0';
    return Number(v).toFixed(d);
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function handleComparisonMetricChange() {
    comparisonMetric = document.getElementById('comparison-metric').value;
    // 将已计算的 comparison results 中的 comparison_value 字段切换为新选择的指标值，
    // 这样无需重新运行比较（因为 compareGroups 已把所有指标保存在 stats 中）
    try {
        if (typeof window !== 'undefined' && Array.isArray(window.comparisonResults)) {
            window.comparisonResults.forEach(comp => {
                const stats = comp && comp.stats ? comp.stats : null;
                if (!stats) return;
                Object.values(stats).forEach(stat => {
                    if (!stat || typeof stat !== 'object') return;
                    if (Object.prototype.hasOwnProperty.call(stat, comparisonMetric)) {
                        stat.comparison_value = stat[comparisonMetric];
                    } else {
                        // 回退：保留原有 comparison_value 或置 0
                        stat.comparison_value = stat.comparison_value != null ? stat.comparison_value : 0;
                    }
                });
            });
        }
    } catch (err) {
        console.warn('Failed to update existing comparisonResults for new metric', err);
    }

    // 当处于比较或矩阵视图时，切换 metric 后应立即更新可视化
    if (visualizationMode === 'comparison' || visualizationMode === 'matrix') {
        try { if (typeof redrawCurrentViz === 'function') redrawCurrentViz(); } catch (err) { console.warn('Failed to redraw after comparison metric change', err); }
    }
}

// Render clickable previews for diverging palettes (used in comparison mode)
// removed deprecated renderDivergingPreviews; diverging palettes are previewed in renderColorPreviews

function setDivergingPalette(key) {
    try { divergingPalette = key; } catch (_) { if (typeof window !== 'undefined') window.divergingPalette = key; }
    // 更新 Colors & Domain 面板下的预览
    if (typeof renderColorPreviews === 'function') renderColorPreviews();
    // 切换分歧色板后立即重绘
    if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
    persistCurrentModeColorSettings();
}

function handleSignificanceChange() {
    const isChecked = document.getElementById('show-significance').checked;
    showOnlySignificant = isChecked;

    // 显示/隐藏阈值设置行
    const thresholdsRow = document.getElementById('significance-thresholds-row');
    if (thresholdsRow) {
        thresholdsRow.style.display = isChecked ? 'flex' : 'none';
    }

    // 勾选显著性过滤时，给出小样本组提示（基于当前筛选后的样本数）
    if (isChecked && (visualizationMode === 'comparison' || visualizationMode === 'matrix')) {
        try {
            const groups = getAllGroups ? getAllGroups() : {};
            const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
            let targetGroupNames = [];
            if (visualizationMode === 'comparison') {
                const g1 = document.getElementById('select-group1')?.value;
                const g2 = document.getElementById('select-group2')?.value;
                if (g1) targetGroupNames.push(g1);
                if (g2) targetGroupNames.push(g2);
            } else if (visualizationMode === 'matrix') {
                const cbs = document.querySelectorAll('.matrix-group-checkbox:checked');
                targetGroupNames = Array.from(cbs).map(cb => cb.value);
                if (!targetGroupNames || targetGroupNames.length === 0) {
                    targetGroupNames = Object.keys(groups || {});
                }
            }
            const small = [];
            (targetGroupNames || []).forEach(name => {
                const list = Array.isArray(groups[name]) ? groups[name] : [];
                const filtered = list.filter(s => passes(s));
                if (filtered.length > 0 && filtered.length < 3) {
                    small.push(`${name} (${filtered.length})`);
                }
            });
            if (small.length > 0) {
                alert(
                    'Significance filtering notice:\n' +
                    'The following groups have fewer than 3 samples after current filters, ' +
                    'No statistical tests can be performed for them:\n' +
                    small.join(', ')
                );
            }
        } catch (_) { /* ignore warning errors */ }
    }

    // 立即重绘比较视图
    if (visualizationMode === 'comparison' || visualizationMode === 'matrix') {
        redrawCurrentViz();
    }
}

function handleThresholdChange() {
    // 立即重绘比较视图
    if (visualizationMode === 'comparison' || visualizationMode === 'matrix') {
        redrawCurrentViz();
    }
}

function handleCloseGroupModal() {
    document.getElementById('group-modal').style.display = 'none';
}

function handleColorDomainChange() {
    const input = document.getElementById('color-domain-abs');
    if (!input) return;
    const parsed = parseFloat(input.value);
    if (!isFinite(parsed)) return;
    const modeKey = getModeColorKey();
    const clamped = clampManualDomainValueForKey(parsed, modeKey);
    if (!isFinite(clamped) || clamped <= 0) return;
    if (clamped !== parsed) {
        input.value = formatDomainValueForInput(clamped);
    }
    const normalized = setManualDomainForMode(modeKey, clamped);
    if (modeKey === 'comparison' && normalized != null) {
        try { comparisonColorDomain = [-normalized, 0, normalized]; }
        catch (_) { if (typeof window !== 'undefined') window.comparisonColorDomain = [-normalized, 0, normalized]; }
    }
    // 任何模式下修改域都应触发重绘
    if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
    persistCurrentModeColorSettings();
}

function handleColorDomainReset() {
    const input = document.getElementById('color-domain-abs');
    const mode = (typeof window !== 'undefined' && window.visualizationMode) ? window.visualizationMode : visualizationMode;
    applyDomainValueToUI(null, mode);
    if (mode === 'comparison' || mode === 'matrix') {
        if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
    } else {
        if (input) input.value = '';
        if (typeof redrawCurrentViz === 'function') redrawCurrentViz();
    }
    persistCurrentModeColorSettings();
}

function initCollapsiblePanel(panelId, toggleId, options = {}) {
    const panel = document.getElementById(panelId);
    const toggle = document.getElementById(toggleId);
    if (!panel || !toggle) return;

    const storageKey = options.storageKey || null;
    const defaultCollapsed = !!options.defaultCollapsed;
    const expandLabel = options.expandLabel || 'Expand ▼';
    const collapseLabel = options.collapseLabel || 'Collapse ▲';
    const expandAriaLabel = options.expandAriaLabel || 'Expand panel';
    const collapseAriaLabel = options.collapseAriaLabel || 'Collapse panel';

    const readPersistedState = () => {
        if (!storageKey) return defaultCollapsed;
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored === null) return defaultCollapsed;
            return stored === 'true';
        } catch (_) {
            return defaultCollapsed;
        }
    };

    const persistState = (collapsed) => {
        if (!storageKey) return;
        try {
            localStorage.setItem(storageKey, collapsed ? 'true' : 'false');
        } catch (_) { }
    };

    const applyState = (collapsed) => {
        panel.classList.toggle('collapsed', collapsed);
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        const label = collapsed ? expandLabel : collapseLabel;
        toggle.textContent = label;
        const ariaLabel = collapsed ? expandAriaLabel : collapseAriaLabel;
        toggle.setAttribute('aria-label', ariaLabel);
        toggle.setAttribute('title', ariaLabel);
        if (typeof options.onToggle === 'function') {
            try {
                options.onToggle(collapsed);
            } catch (err) {
                console.warn('Collapsible panel onToggle failed', err);
            }
        }
    };

    let collapsed = readPersistedState();
    applyState(collapsed);

    toggle.addEventListener('click', () => {
        collapsed = !collapsed;
        applyState(collapsed);
        persistState(collapsed);
    });
}

function initSidebarCollapseControl() {
    const appBody = document.querySelector('.app-body');
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (!appBody || !sidebar || !toggleBtn) return;

    const storageKey = 'metatree.sidebarCollapsed';

    const readPersistedState = () => {
        try {
            return localStorage.getItem(storageKey) === 'true';
        } catch (_) {
            return false;
        }
    };

    const persistState = (collapsed) => {
        try {

            localStorage.setItem(storageKey, collapsed ? 'true' : 'false');
        } catch (_) { }
    };

    const applyState = (collapsed) => {
        appBody.classList.toggle('sidebar-collapsed', collapsed);
        sidebar.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
        toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
        toggleBtn.setAttribute('aria-label', label);
        toggleBtn.setAttribute('title', label);

        if (typeof redrawCurrentViz === 'function' && treeData) {
            // wait for layout to settle before redrawing panels at new width
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    try { redrawCurrentViz(); } catch (_) { }
                });
            });
        }
    };

    let collapsed = readPersistedState();
    applyState(collapsed);

    toggleBtn.addEventListener('click', () => {
        collapsed = !collapsed;
        applyState(collapsed);
        persistState(collapsed);
    });
}

function initSidebarToggleScrollProxy() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const mainContent = document.querySelector('.main-content');
    if (!toggleBtn || !mainContent) return;

    const gutterPadding = 12;
    const minGutterWidth = 40;

    const handleWheel = (event) => {
        const rect = toggleBtn.getBoundingClientRect();
        const gutterWidth = Math.max(rect.width + (gutterPadding * 2), minGutterWidth);
        const gutterLeft = rect.left - ((gutterWidth - rect.width) / 2);
        const gutterRight = gutterLeft + gutterWidth;
        const isWithinGutter = event.clientX >= gutterLeft && event.clientX <= gutterRight;
        const isBelowToggle = event.clientY > rect.bottom;
        if (!isWithinGutter || !isBelowToggle) return;

        let consumed = false;

        if (event.deltaY !== 0 && mainContent.scrollHeight > mainContent.clientHeight) {
            const previousTop = mainContent.scrollTop;
            mainContent.scrollTop += event.deltaY;
            consumed = consumed || mainContent.scrollTop !== previousTop;
        }

        if (event.deltaX !== 0 && mainContent.scrollWidth > mainContent.clientWidth) {
            const previousLeft = mainContent.scrollLeft;
            mainContent.scrollLeft += event.deltaX;
            consumed = consumed || mainContent.scrollLeft !== previousLeft;
        }

        if (consumed) {
            event.preventDefault();
        }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
}

// ========== 页面加载时初始化 ==========
function initFileFormatInfoModal() {
    const modal = document.getElementById('file-format-modal');
    if (!modal) return;

    const titleEl = document.getElementById('file-format-modal-title');
    const bodyEl = document.getElementById('file-format-modal-body');
    const closeBtn = document.getElementById('file-format-modal-close');
    const overlay = modal.querySelector('.info-modal-overlay');
    let activeTrigger = null;

    const openModal = (type, trigger) => {
        const content = FILE_FORMAT_INFO_CONTENT[type];
        if (!content || !titleEl || !bodyEl) return;
        titleEl.textContent = content.title;
        bodyEl.innerHTML = content.html;
        modal.classList.add('is-visible');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('info-modal-open');
        activeTrigger = trigger || null;
        if (closeBtn) closeBtn.focus();
    };

    const closeModal = () => {
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('info-modal-open');
        if (activeTrigger && typeof activeTrigger.focus === 'function') {
            activeTrigger.focus();
        }
        activeTrigger = null;
    };

    const handleKeydown = (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-visible')) {
            closeModal();
        }
    };

    document.addEventListener('keydown', handleKeydown);

    const attachTrigger = (elementId, type) => {
        const trigger = document.getElementById(elementId);
        if (!trigger) return;
        trigger.addEventListener('click', () => openModal(type, trigger));
    };

    attachTrigger('data-file-info-btn', 'data');
    attachTrigger('meta-file-info-btn', 'meta');

    [closeBtn, overlay].forEach((el) => {
        if (el) el.addEventListener('click', closeModal);
    });
}

function dispatchMetaTreeReadyEvent() {
    try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('metatree:ready'));
        }
    } catch (err) {
        console.warn('Failed to dispatch metatree:ready event', err);
    }
}

function bootstrapMetaTreeFromWindowPayload() {
    if (typeof window === 'undefined') return;
    const payload = window.MetaTreeBootstrap || window.metaTreeBootstrap;
    if (!payload) return;

    const { dataText, dataLabel, metaText, metaLabel } = payload;
    if (typeof dataText === 'string' && dataText.trim().length > 0) {
        try {
            loadDataFromText(dataText, { label: dataLabel || 'Inline data' });
        } catch (err) {
            console.error('Failed to bootstrap inline data', err);
        }
    }
    if (typeof metaText === 'string' && metaText.trim().length > 0) {
        try {
            loadMetaFromText(metaText, { label: metaLabel || 'Inline meta' });
        } catch (err) {
            console.error('Failed to bootstrap inline meta', err);
        }
    }

    try {
        delete window.MetaTreeBootstrap;
    } catch (_) {
        window.MetaTreeBootstrap = undefined;
    }
    try {
        delete window.metaTreeBootstrap;
    } catch (_) {
        window.metaTreeBootstrap = undefined;
    }
}

document.addEventListener('DOMContentLoaded', function () {
    initEventListeners();
    initSidebarCollapseControl();
    initSidebarToggleScrollProxy();
    initDataParameterControls();
    initCollapsiblePanel('data-metadata-panel', 'data-metadata-panel-toggle', {
        defaultCollapsed: false,
        expandLabel: 'Expand ▼',
        collapseLabel: 'Collapse ▲',
        expandAriaLabel: 'Expand Data & Metadata panel',
        collapseAriaLabel: 'Collapse Data & Metadata panel'
    });
    initFileFormatInfoModal();

    // 初始化 taxon 筛选功能
    initTaxonFilters();

    // 初始化统一标签颜色功能
    initUniformLabelColors();

    // Initialize custom mode switcher
    initModeSwitcher();

    // 添加比较模式事件监听
    document.getElementById('viz-mode').addEventListener('change', handleVisualizationModeChange);
    document.getElementById('define-groups').addEventListener('click', handleDefineGroupsClick);
    document.getElementById('save-group-btn').addEventListener('click', handleSaveGroup);
    document.getElementById('cancel-group-btn').addEventListener('click', handleCloseGroupModal);
    document.getElementById('close-group-modal').addEventListener('click', handleCloseGroupModal);
    document.getElementById('run-comparison').addEventListener('click', handleRunComparison);
    document.getElementById('export-comparison').addEventListener('click', handleViewResults);
    document.getElementById('comparison-metric').addEventListener('change', handleComparisonMetricChange);
    document.getElementById('show-significance').addEventListener('change', handleSignificanceChange);
    const colorDomainAbs = document.getElementById('color-domain-abs');
    if (colorDomainAbs) colorDomainAbs.addEventListener('change', handleColorDomainChange);
    const colorDomainReset = document.getElementById('color-domain-reset');
    if (colorDomainReset) colorDomainReset.addEventListener('click', handleColorDomainReset);

    // Group模式事件监听
    const groupMetaColSelect = document.getElementById('group-meta-column-select');
    const groupAggr = document.getElementById('group-aggregation');
    const defineGroupsForGroupMode = document.getElementById('define-groups-for-group-mode');
    const deleteAllGroupsGroupMode = document.getElementById('delete-all-groups-group-mode');

    if (groupMetaColSelect) {
        groupMetaColSelect.addEventListener('change', (e) => {
            handleGroupMetaColumnChange(e.target.value);
        });
    }
    if (groupAggr) groupAggr.addEventListener('change', handleGroupAggregationChange);
    if (defineGroupsForGroupMode) {
        defineGroupsForGroupMode.addEventListener('click', handleDefineGroupsClick);
    }
    if (deleteAllGroupsGroupMode) {
        deleteAllGroupsGroupMode.addEventListener('click', function () {
            if (confirm('Delete all groups?')) {
                clearAllGroups();
                updateGroupCheckboxes();
            }
        });
    }
    const exportSvgMenuBtn = document.getElementById('viz-export-svg');
    if (exportSvgMenuBtn) {
        exportSvgMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideVizExportMenu();
            handleVizExportRequest('svg');
        });
    }
    const exportPngMenuBtn = document.getElementById('viz-export-png');
    if (exportPngMenuBtn) {
        exportPngMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideVizExportMenu();
            handleVizExportRequest('png');
        });
    }
    // 阈值输入框监听
    const pvalueThreshold = document.getElementById('pvalue-threshold');
    const qvalueThreshold = document.getElementById('qvalue-threshold');
    const logfcThreshold = document.getElementById('logfc-threshold');
    if (pvalueThreshold) pvalueThreshold.addEventListener('input', handleThresholdChange);
    if (qvalueThreshold) qvalueThreshold.addEventListener('input', handleThresholdChange);
    if (logfcThreshold) logfcThreshold.addEventListener('input', handleThresholdChange);

    // 组选择变化监听（可选：添加验证提示）
    const select1 = document.getElementById('select-group1');
    const select2 = document.getElementById('select-group2');
    if (select1 && select2) {
        select1.addEventListener('change', function () {
            if (select2.value && select1.value === select2.value) {
                alert('Group 1 and Group 2 must be different. Please select another group.');
                select1.value = '';
            }
        });
        select2.addEventListener('change', function () {
            if (select1.value && select1.value === select2.value) {
                alert('Group 1 and Group 2 must be different. Please select another group.');
                select2.value = '';
            }
        });
    }

    const delAllBtn = document.getElementById('delete-all-groups');
    if (delAllBtn) delAllBtn.addEventListener('click', function () {
        if (confirm('Delete all groups?')) {
            clearAllGroups();
            updateExistingGroupsList();
            updateGroupDefinitionsDisplay();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            try { hideVizExportMenu(); } catch (_) { }
            if (typeof hideLabelColorMenu === 'function') {
                try { hideLabelColorMenu(); } catch (_) { }
            }
        }
    });
    window.addEventListener('resize', function () {
        hideVizExportMenu();
    });
    window.addEventListener('scroll', function () {
        hideVizExportMenu();
    }, true);

    // Matrix 组选择按钮现在由 updateGroupDefinitionsDisplay 动态绑定

    // 点击模态框外部关闭
    window.addEventListener('click', function (event) {
        const modal = document.getElementById('group-modal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    // 不再自动加载示例数据；用户可手动点击“Load Example”或导入 meta

    // 同步一次初始模式可见性（默认 single），避免两个面板同时可见
    try { handleVisualizationModeChange(); } catch (_) { }

    // 一次性自检：在布局重构后，核对关键 DOM 元素是否齐全，便于快速发现遗漏
    (function verifyRequiredElements() {
        const requiredIds = [
            // 基础容器
            'viz-container', 'stats-panel', 'total-nodes', 'leaf-nodes', 'max-depth',
            // 数据与元数据
            'data-metadata-panel', 'data-metadata-panel-toggle',
            'file-upload', 'meta-upload', 'load-example', 'filename-display', 'meta-file-display',
            'data-params-toggle', 'data-params-content', 'data-delimiter-select', 'data-delimiter-custom',
            'taxa-delimiter-select', 'taxa-delimiter-custom',
            'meta-filters-toggle', 'meta-filters-content', 'meta-filters', 'meta-filters-clear', 'meta-filters-hint',
            // 模式与样本
            'viz-mode', 'samples-toggle-group', 'toggle-samples', 'sample-selection-panel', 'sample-checkboxes',
            'select-all-samples', 'select-none-samples', 'invert-samples',
            // 单样本设置
            'panel-width-slider', 'panel-width-value', 'panel-height-slider', 'panel-height-value', 'panel-lock-size',
            'layout-select', 'abundance-transform', 'quantile-low', 'quantile-high', 'show-individual-legends',
            // 单样本显著性（combined_long）
            'single-significance-toggle-row', 'single-significance-thresholds-row', 'single-show-significance',
            'single-pvalue-threshold', 'single-qvalue-threshold', 'single-logfc-threshold',
            // 连续色板与自定义
            'color-previews-toggle', 'color-previews-wrapper', 'color-previews', 'color-reverse',
            'custom-color-controls', 'custom-color-start', 'custom-color-end', 'custom-stops-count', 'apply-custom-color',
            'custom-presets', 'preset-name', 'save-preset',
            // 标签与节点
            'labels-panel', 'labels-toggle', 'label-threshold', 'label-threshold-value', 'label-font-size', 'label-font-size-value',
            'label-levels', 'labels-reset', 'node-size-multiplier', 'node-size-value', 'min-node-size', 'min-node-size-value',
            'max-node-size', 'max-node-size-value', 'node-opacity', 'node-opacity-value', 'edge-width-multiplier', 'edge-width-value', 'min-edge-width', 'min-edge-width-value',
            'edge-opacity', 'edge-opacity-value',
            // 新增：标签长度与溢出
            'label-max-length', 'label-overflow',
            // 比较模式
            'comparison-controls', 'meta-group-column', 'meta-status', 'unified-group-display',
            'group-selection-row', 'select-group1', 'select-group2',
            'show-significance', 'significance-thresholds-row', 'pvalue-threshold', 'qvalue-threshold', 'logfc-threshold',
            'comparison-metric',
            'color-domain-abs', 'color-domain-reset', 'run-comparison', 'export-comparison', 'colors-toggle',
            // 分组模态框
            'group-modal', 'group-name-input', 'sample-checklist', 'existing-groups-list', 'save-group-btn', 'cancel-group-btn', 'close-group-modal',
            // 组工具
            'delete-all-groups'
            // 注意：select-all-groups, select-none-groups, invert-groups 是动态生成的，不在初始验证列表中
        ];
        const missing = requiredIds.filter(id => !document.getElementById(id));
        if (missing.length) {
            console.warn('[MetaTree] Missing required DOM elements after layout refactor:', missing);
        }
    })();

    dispatchMetaTreeReadyEvent();
    bootstrapMetaTreeFromWindowPayload();
});

// ========== 示例数据自动加载与 meta 集成 ==========
async function handleLoadExampleClick() {
    try {
        // 显示加载提示
        const filenameDisplay = document.getElementById('filename-display');
        filenameDisplay.textContent = 'Loading example data...';

        if (typeof showToast === 'function') showToast('Loading example data...', 3000);

        // 加载示例 taxa.tsv（使用基于页面 base URI 的绝对 URL，兼容 GitHub Pages 子路径）
        const taxaUrl = new URL('test/data/taxa.tsv', document.baseURI).href;
        const taxaResp = await fetch(taxaUrl, { cache: 'no-store' });

        if (!taxaResp.ok) {
            throw new Error(`HTTP error! status: ${taxaResp.status} - ${taxaResp.statusText}`);
        }

        const taxaText = await taxaResp.text();

        // Use loadDataFromText to centralize logic and ensure caching (for re-parsing on delimiter change)
        // Use loadDataFromText to centralize logic and ensure caching (for re-parsing on delimiter change)
        loadDataFromText(taxaText, { label: 'Example: test/data/taxa.tsv' });

        // Update cached content for preview
        if (typeof window !== 'undefined') {
            window.cachedDataContent = taxaText;
            window.cachedDataLabel = 'Example: test/data/taxa.tsv';
            // Show preview button
            const pBtn = document.getElementById('preview-data-btn');
            if (pBtn) pBtn.style.display = 'inline-flex';
        }

        // 尝试加载示例 meta.tsv（注意与数据文件同目录，文件名小写）
        try {
            const metaUrl = new URL('test/data/meta.tsv', document.baseURI).href;
            const metaResp = await fetch(metaUrl, { cache: 'no-store' });

            if (metaResp.ok) {
                const metaText = await metaResp.text();

                // Cache meta content for preview
                if (typeof window !== 'undefined') {
                    window.cachedMetaContent = metaText;
                    window.cachedMetaLabel = 'Example: test/data/meta.tsv';
                    // Show meta preview button
                    const mBtn = document.getElementById('preview-meta-btn');
                    if (mBtn) mBtn.style.display = 'inline-flex';
                }

                // 解析并处理 meta 数据
                // Now we use loadMetaFromText to ensure consistency with standard flow
                loadMetaFromText(metaText, { label: 'Example: test/data/meta.tsv' });
            } else {
                console.warn('Meta.tsv not found or not accessible');
            }
        } catch (metaErr) {
            console.warn('Failed to load example meta data:', metaErr.message);
            // Meta 文件加载失败不影响主数据
        }
    } catch (err) {
        console.error('Load example failed:', err);
        console.error('Error details:', {
            name: err.name,
            message: err.message,
            stack: err.stack
        });

        const filenameDisplay = document.getElementById('filename-display');
        filenameDisplay.textContent = 'Failed to load example';

        let errorMsg = 'Failed to load example data: ' + err.message;
        if (err.message.includes('Failed to fetch')) {
            errorMsg += '\n\nPossible causes:\n';
            errorMsg += '1. Make sure the HTTP server is running (python -m http.server 8000)\n';
            errorMsg += '2. Access the page via http://localhost:8000 (not file://)\n';
            errorMsg += '3. Check that test/data/taxa.tsv file exists in the project folder';
        }
        alert(errorMsg);
    }
}

function populateMetaControls(metaLoaded) {
    const statusSpan = document.getElementById('meta-status');
    const select = document.getElementById('meta-group-column');
    if (!select) return;
    select.innerHTML = '';
    if (window.metaColumns && Array.isArray(window.metaColumns) && window.metaColumns.length > 0) {
        // 添加空选项
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- Select column --';
        select.appendChild(emptyOpt);

        // 填充可选列（排除 Sample）
        window.metaColumns.forEach(col => {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            select.appendChild(opt);
        });
        // 默认不选择任何列，等待用户主动选择再自动分组
        if (statusSpan) statusSpan.textContent = '(meta loaded)';
        // 渲染筛选面板
        renderMetaFiltersPanel();
        // 同步刷新样本复选框可见性
        refreshSampleCheckboxesByMeta();
        // 更新group模式的meta列选项
        updateGroupMetaColumnOptions();
    } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No meta available';
        select.appendChild(opt);
        if (statusSpan) statusSpan.textContent = '(no meta)';
        renderMetaFiltersPanel(true);
        // 更新group模式的meta列选项
        updateGroupMetaColumnOptions();
    }

    // 绑定 select change 事件以自动创建分组
    select.addEventListener('change', (e) => {
        handleMetaGroupColumnChange(e.target.value);
    });
}

// 处理比较模式的 meta 列选择变化
function handleMetaGroupColumnChange(col) {
    if (!col) {
        // 如果清空选择，则清空分组
        if (typeof clearAllGroups === 'function') clearAllGroups();
        updateExistingGroupsList();
        updateGroupDefinitionsDisplay();
        return;
    }

    if (!window.metaData || !window.metaColumns || window.metaColumns.length === 0) {
        return;
    }

    // 清除现有分组并根据选择的列自动创建新分组
    if (typeof clearAllGroups === 'function') clearAllGroups();
    const grouping = autoGroupByMetaColumn(window.metaData, col, 2);
    if (!grouping || Object.keys(grouping).length === 0) {
        console.warn('No valid groups generated from selected meta column:', col);
        updateExistingGroupsList();
        updateGroupDefinitionsDisplay();
        return;
    }
    // 更新显示
    updateExistingGroupsList();
    updateGroupDefinitionsDisplay();
}

function loadMetaFromText(text, options = {}) {
    if (typeof window !== 'undefined') {
        window.cachedMetaContent = text;
        window.cachedMetaLabel = options.label || null;
    }

    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Empty meta content');
    }
    const meta = parseMetaTSV(text);
    if (!meta) {
        throw new Error('Metadata missing required "Sample" column or rows.');
    }
    populateMetaControls(true);
    const label = (typeof options.label === 'string' && options.label.trim().length > 0)
        ? options.label.trim()
        : 'Inline meta';
    const disp = document.getElementById('meta-file-display');
    if (disp) disp.textContent = label;

    const previewBtn = document.getElementById('preview-meta-btn');
    if (previewBtn) previewBtn.style.display = 'inline-flex';
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('metatree:meta-loaded', {
            detail: {
                label,
                columnCount: Array.isArray(window.metaColumns) ? window.metaColumns.length : 0
            }
        }));
    }
    return meta;
}
try { if (typeof window !== 'undefined') window.loadMetaFromText = loadMetaFromText; } catch (_) { }

function handleMetaUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (typeof showToast === 'function') {
        showToast(`Loading ${file.name}... Please wait.`, 5000);
    }

    // Detect delimiter from extension
    const name = file.name.toLowerCase();
    const metaDelimSelect = document.getElementById('meta-delimiter-select');
    let autoDelim = null;

    if (name.endsWith('.csv')) {
        autoDelim = 'comma';
    } else if (name.endsWith('.tsv') || name.endsWith('.txt')) {
        autoDelim = 'tab';
    }

    if (autoDelim && metaDelimSelect) {
        if (metaDelimSelect.value !== autoDelim) {
            metaDelimSelect.value = autoDelim;
            const customInput = document.getElementById('meta-delimiter-custom');
            if (customInput) {
                customInput.style.display = 'none';
                customInput.setAttribute('aria-hidden', 'true');
            }
            if (typeof showToast === 'function') showToast(`Auto-detected meta delimiter: ${autoDelim === 'tab' ? 'Tab' : 'Comma'}`);
        }
    }

    // Immediately show preview button
    const previewBtn = document.getElementById('preview-meta-btn');
    if (previewBtn) previewBtn.style.display = 'inline-flex';

    const reader = new FileReader();
    reader.onload = function (evt) {
        const text = evt.target.result;
        // Cache raw content immediately
        if (typeof window !== 'undefined') {
            window.cachedMetaContent = text;
            window.cachedMetaLabel = file.name;
        }

        try {
            loadMetaFromText(text, { label: file.name });
        } catch (err) {
            // Even if it fails, allowing preview is crucial
            alert('Failed to parse meta file: ' + err.message + '\n\nClick the "eye" icon to preview.');
            console.error(err);
        }
    };
    reader.readAsText(file);

    // Reset input value to allow reloading the same file
    e.target.value = '';
}

// ========== 元数据筛选 UI ==========
function renderMetaFiltersPanel(noMeta) {
    const container = document.getElementById('meta-filters');
    const hint = document.getElementById('meta-filters-hint');
    const clearBtn = document.getElementById('meta-filters-clear');
    if (!container) return;
    container.innerHTML = '';
    if (noMeta || !window.metaData || !window.metaColumns || window.metaColumns.length === 0) {
        if (hint) hint.style.display = 'inline';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }
    if (hint) hint.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'inline-block';
    // 为每个 meta 列创建一个分组（排除 Sample）
    window.metaColumns.forEach(col => {
        const values = new Set();
        (window.metaData.rows || []).forEach(r => {
            const v = (r[col] ?? '').trim();
            if (v) values.add(v);
        });
        const list = Array.from(values).sort();
        const group = document.createElement('div');
        group.style.minWidth = '220px';
        group.style.border = '1px solid #e0e0e0';
        group.style.borderRadius = '6px';
        group.style.padding = '8px';
        group.style.background = '#fafafa';
        const titleRow = document.createElement('div');
        titleRow.style.display = 'flex';
        titleRow.style.alignItems = 'center';
        titleRow.style.justifyContent = 'space-between';
        const title = document.createElement('div');
        title.textContent = col;
        title.style.fontWeight = '600';
        title.style.fontSize = '13px';
        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '6px';
        const mkBtn = (txt, titleTip) => {
            const b = document.createElement('button');
            b.textContent = txt;
            b.title = titleTip;
            b.style.padding = '2px 6px';
            b.style.fontSize = '12px';
            return b;
        };
        const btnAll = mkBtn('All', 'Select all values (no filter on this column)');
        const btnNone = mkBtn('None', 'Unselect all values (no filter on this column)');
        const btnInv = mkBtn('Invert', 'Invert current selections');
        btns.appendChild(btnAll);
        btns.appendChild(btnNone);
        btns.appendChild(btnInv);
        titleRow.appendChild(title);
        titleRow.appendChild(btns);
        group.appendChild(titleRow);
        const listDiv = document.createElement('div');
        listDiv.style.display = 'flex';
        listDiv.style.flexDirection = 'column';
        listDiv.style.maxHeight = '160px';
        listDiv.style.overflow = 'auto';
        list.forEach(val => {
            const id = `meta-filter-${col}-${val}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '6px';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = id;
            cb.value = val;
            cb.dataset.column = col;
            // 根据现有筛选状态设定勾选
            const set = (window.metaFilters && window.metaFilters[col]) ? window.metaFilters[col] : null;
            cb.checked = !!(set && set.has(val));
            cb.addEventListener('change', onMetaFilterChanged);
            const txt = document.createElement('span');
            txt.textContent = val;
            label.appendChild(cb);
            label.appendChild(txt);
            listDiv.appendChild(label);
        });
        group.appendChild(listDiv);
        container.appendChild(group);

        // 行为：All / None / Invert
        const syncFromCheckboxes = () => {
            const cbs = listDiv.querySelectorAll('input[type="checkbox"][data-column="' + col + '"]');
            const selected = Array.from(cbs).filter(x => x.checked).map(x => x.value);
            if (!window.metaFilters) window.metaFilters = {};
            if (selected.length === list.length || selected.length === 0) {
                // 全选或全不选 -> 视为不对该列过滤
                delete window.metaFilters[col];
            } else {
                window.metaFilters[col] = new Set(selected);
            }
        };
        btnAll.onclick = () => {
            listDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
            // 全选视为不启用该列过滤
            if (!window.metaFilters) window.metaFilters = {};
            delete window.metaFilters[col];
            refreshSampleCheckboxesByMeta();
            try { updateExistingGroupsList(); updateGroupDefinitionsDisplay(); } catch (_) { }
            redrawCurrentViz();
        };
        btnNone.onclick = () => {
            listDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            // 全不选同样视为不启用该列过滤（保持与现有语义一致）
            if (!window.metaFilters) window.metaFilters = {};
            delete window.metaFilters[col];
            refreshSampleCheckboxesByMeta();
            try { updateExistingGroupsList(); updateGroupDefinitionsDisplay(); } catch (_) { }
            redrawCurrentViz();
        };
        btnInv.onclick = () => {
            listDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = !cb.checked);
            syncFromCheckboxes();
            refreshSampleCheckboxesByMeta();
            try { updateExistingGroupsList(); updateGroupDefinitionsDisplay(); } catch (_) { }
            redrawCurrentViz();
        };
    });
    // 绑定清空按钮
    if (clearBtn) {
        clearBtn.onclick = () => {
            window.metaFilters = {};
            renderMetaFiltersPanel();
            refreshSampleCheckboxesByMeta();
            // 重新渲染
            try { updateExistingGroupsList(); updateGroupDefinitionsDisplay(); } catch (_) { }
            redrawCurrentViz();
        };
    }
}

function onMetaFilterChanged(e) {
    const cb = e.target;
    const col = cb.dataset.column;
    if (!window.metaFilters) window.metaFilters = {};
    if (!window.metaFilters[col]) window.metaFilters[col] = new Set();
    if (cb.checked) window.metaFilters[col].add(cb.value);
    else window.metaFilters[col].delete(cb.value);
    // 如果该列集合为空，移除该列键，保持整洁
    if (window.metaFilters[col].size === 0) delete window.metaFilters[col];
    // 刷新样本复选框可见性
    refreshSampleCheckboxesByMeta();
    // 刷新分组显示（计数按当前过滤计算）
    try {
        updateExistingGroupsList();
        updateGroupDefinitionsDisplay();
    } catch (_) { }
    // 若分组定义模态框处于打开状态，同步刷新其中的样本清单（不显示被过滤样本）
    try {
        const modal = document.getElementById('group-modal');
        if (modal && modal.style.display !== 'none') {
            updateSampleChecklistInModal();
        }
    } catch (_) { }
    // 重新绘制（可用样本 = 用户勾选 ∩ 元过滤）
    redrawCurrentViz();
}

// ========== Group模式 UI 处理 ==========
/**
 * 更新group meta列选择器的选项
 */
function updateGroupMetaColumnOptions() {
    const select = document.getElementById('group-meta-column-select');
    if (!select) return;

    const currentValue = select.value;

    select.innerHTML = '<option value="">-- Select column --</option>';

    if (!metaData || !metaColumns || metaColumns.length === 0) {
        return;
    }

    metaColumns.forEach(col => {
        const option = document.createElement('option');
        option.value = col;
        option.textContent = col;
        select.appendChild(option);
    });

    if (currentValue && metaColumns.includes(currentValue)) {
        select.value = currentValue;
    }
}

/**
 * 处理group meta列选择变化 - 使用全局 groups 系统，不再依赖 groupMetaColumn
 */
function handleGroupMetaColumnChange(col) {
    if (!col) {
        // 如果清空选择，则清空分组
        if (typeof clearAllGroups === 'function') clearAllGroups();
        // 清空旧系统的变量
        if (typeof window !== 'undefined') {
            window.selectedGroups = [];
        }
        updateGroupCheckboxes();
        return;
    }

    if (!window.metaData || !window.metaColumns || window.metaColumns.length === 0) {
        return;
    }

    // 清除现有分组并根据选择的列自动创建新分组
    if (typeof clearAllGroups === 'function') clearAllGroups();
    const grouping = autoGroupByMetaColumn(window.metaData, col, 2);
    if (!grouping || Object.keys(grouping).length === 0) {
        console.warn('No valid groups generated from selected meta column:', col);
        updateGroupCheckboxes();
        return;
    }
    // 更新显示
    updateGroupCheckboxes();
}

/**
 * 更新group复选框列表 - 使用与 matrix 模式相同的显示逻辑
 */
function updateGroupCheckboxes() {
    const container = document.getElementById('group-checkboxes');

    const groups = getAllGroups();
    const groupCount = Object.keys(groups).length;

    // Update status element
    const statusEl = document.getElementById('group-meta-status');
    if (statusEl) {
        statusEl.textContent = groupCount > 0 ? `(${groupCount} groups)` : '';
    }

    if (!container) return;

    console.log('updateGroupCheckboxes called, groups:', groups);

    if (groupCount === 0) {
        container.innerHTML = '<em class="text-light">No groups defined</em>';
        // 清空可视化
        const vizContainer = document.getElementById('viz-container');
        if (vizContainer) vizContainer.innerHTML = '';
        return;
    }

    const passes = (s) => (typeof window.samplePassesMetaFilters === 'function') ? window.samplePassesMetaFilters(s) : true;
    const filteredNames = Object.keys(groups).filter(name => {
        const list = Array.isArray(groups[name]) ? groups[name] : [];
        return list.filter(s => passes(s)).length > 0;
    });

    if (filteredNames.length === 0) {
        container.innerHTML = '<em class="text-light">No groups available after current filter</em>';
        const vizContainer = document.getElementById('viz-container');
        if (vizContainer) vizContainer.innerHTML = '';
        return;
    }

    // 使用与 matrix 模式完全相同的布局
    let html = `
        <div class="flex justify-between ai-center mb-8">
            <div class="flex gap-6">
                <button id="select-all-groups" class="btn-small">All</button>
                <button id="select-none-groups" class="btn-small">None</button>
                <button id="invert-groups" class="btn-small">Invert</button>
            </div>
        </div>
    `;

    // 默认选择前4个组
    filteredNames.forEach((groupName, index) => {
        const list = groups[groupName] || [];
        const filtered = list.filter(s => passes(s));
        const filteredCount = filtered.length;
        const totalCount = list.length;
        const isDefaultChecked = index < 4; // 默认前4个选中

        html += `
            <div>
                <label class="flex ai-center gap-6" style="cursor: pointer;">
                    <input type="checkbox" class="group-checkbox-item" value="${groupName}" ${isDefaultChecked ? 'checked' : ''}>
                    <span title="${groupName}: ${filteredCount} samples${totalCount !== filteredCount ? ' (' + totalCount + ' total)' : ''}">${groupName} (${filteredCount})</span>
                </label>
            </div>
        `;
    });

    container.innerHTML = html;

    // 绑定复选框事件
    container.querySelectorAll('.group-checkbox-item').forEach(checkbox => {
        checkbox.addEventListener('change', handleGroupCheckboxChange);

        // Enable drag and drop for the group item wrapper
        const wrapper = checkbox.closest('div');
        if (wrapper) {
            addDragListeners(wrapper, 'group');
        }
    });

    // 绑定快捷按钮事件
    const selectAllBtn = document.getElementById('select-all-groups');
    const selectNoneBtn = document.getElementById('select-none-groups');
    const invertBtn = document.getElementById('invert-groups');

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', function () {
            container.querySelectorAll('.group-checkbox-item').forEach(cb => {
                cb.checked = true;
                cb.dispatchEvent(new Event('change'));
            });
        });
    }

    if (selectNoneBtn) {
        selectNoneBtn.addEventListener('click', function () {
            container.querySelectorAll('.group-checkbox-item').forEach(cb => {
                cb.checked = false;
                cb.dispatchEvent(new Event('change'));
            });
        });
    }

    if (invertBtn) {
        invertBtn.addEventListener('click', function () {
            container.querySelectorAll('.group-checkbox-item').forEach(cb => {
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            });
        });
    }

    // 默认选中所有组后自动绘制
    if (treeData) {
        // 获取所有选中的组
        const checkedGroups = Array.from(container.querySelectorAll('.group-checkbox-item:checked'))
            .map(cb => cb.value);

        console.log('updateGroupCheckboxes: checkedGroups =', checkedGroups);

        if (checkedGroups.length > 0) {
            // 先设置全局变量（必须在调用 initVisualization 之前）
            activeSamples = checkedGroups;
            selectedGroups = checkedGroups;  // 直接设置全局变量

            console.log('Calling initVisualization and drawAllTrees with', checkedGroups.length, 'groups');
            initVisualization();
            drawAllTrees();
        }
    } else {
        console.warn('updateGroupCheckboxes: treeData is not available');
    }
}

/**
 * 处理group复选框变化 - 桥接新旧系统
 */
function handleGroupCheckboxChange(e) {
    // 获取所有选中的组
    const container = document.getElementById('group-checkboxes');
    if (!container) return;

    const checkedGroups = Array.from(container.querySelectorAll('.group-checkbox-item:checked'))
        .map(cb => cb.value);

    console.log('handleGroupCheckboxChange: checkedGroups =', checkedGroups);

    // 先设置全局变量（必须在调用绘图函数之前）
    activeSamples = checkedGroups;
    selectedGroups = checkedGroups;  // 直接设置全局变量

    // 重新绘制
    if (treeData && checkedGroups.length > 0) {
        console.log('handleGroupCheckboxChange: Calling initVisualization and drawAllTrees');
        initVisualization();
        drawAllTrees();
    } else if (checkedGroups.length === 0) {
        // 清空绘图区
        const vizContainer = document.getElementById('viz-container');
        if (vizContainer) vizContainer.innerHTML = '';
    } else {
        console.warn('handleGroupCheckboxChange: treeData not available');
    }
}

/**
 * 处理group aggregation方式变化
 */
function handleGroupAggregationChange() {
    const select = document.getElementById('group-aggregation');
    if (!select) return;

    groupAggregation = select.value;

    // 如果已经有选中的组,重新计算并绘制
    if (treeData && selectedGroups.length > 0) {
        initVisualization();
        drawAllTrees();
    }
}

/**
 * Group模式的全选/全不选/反选
 */

// ========== Taxon 筛选功能 ==========
// 全局变量
let taxonSearchResults = new Set();  // 当前搜索结果
let taxonFilterSet = new Set();      // 添加到过滤列表的 taxa
let taxonFilterMode = 'none';        // 过滤模式: 'none', 'include', 'exclude'

/**
 * 搜索 taxa - 搜索后直接打开弹窗显示结果
 */
function handleTaxonSearch() {
    const input = document.getElementById('taxon-search-input');
    const pattern = input.value.trim();
    const useRegex = document.getElementById('taxon-use-regex').checked;
    const caseSensitive = document.getElementById('taxon-case-sensitive').checked;

    if (!pattern) {
        alert('Please enter a search pattern');
        return;
    }

    if (!rawData || rawData.length === 0) {
        alert('Please load data first');
        return;
    }

    taxonSearchResults.clear();

    try {
        let matcher;
        if (useRegex) {
            const flags = caseSensitive ? '' : 'i';
            matcher = new RegExp(pattern, flags);
        } else {
            const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const flags = caseSensitive ? '' : 'i';
            matcher = new RegExp(escapedPattern, flags);
        }

        // 搜索所有 taxa
        rawData.forEach(item => {
            if (matcher.test(item.taxon)) {
                taxonSearchResults.add(item.taxon);
            }
        });

        // 直接打开弹窗显示搜索结果
        openSearchResultsModal();
    } catch (err) {
        alert('Invalid search pattern: ' + err.message);
    }
}

/**
 * 更新过滤列表显示
 */
function updateTaxonFilterList() {
    const container = document.getElementById('taxon-filter-list');
    const countSpan = document.getElementById('taxon-filter-count');

    countSpan.textContent = taxonFilterSet.size;

    if (taxonFilterSet.size === 0) {
        container.innerHTML = '<em class="text-muted">Empty</em>';
        return;
    }

    const sorted = Array.from(taxonFilterSet).sort();
    container.innerHTML = '';

    sorted.forEach(taxon => {
        const item = document.createElement('div');
        item.className = 'taxon-item';
        item.title = taxon;
        item.innerHTML = `
            <span class="taxon-item-name">${taxon}</span>
            <span class="taxon-item-remove" data-taxon="${taxon}">×</span>
        `;
        container.appendChild(item);
    });

    // 绑定删除按钮
    container.querySelectorAll('.taxon-item-remove').forEach(btn => {
        btn.addEventListener('click', function () {
            const taxon = this.dataset.taxon;
            taxonFilterSet.delete(taxon);
            updateTaxonFilterList();
            // 如果过滤模式已启用，重新构建并绘制
            if (taxonFilterMode !== 'none' && rawData && rawData.length > 0) {
                treeData = buildHierarchy(rawData);
                initVisualization();
                drawAllTrees();
                // 更新统计信息（节点计数）和 label 性能提示
                try {
                    if (typeof updateStats === 'function' && typeof d3 !== 'undefined') {
                        const hierarchy = d3.hierarchy(treeData);
                        const sampleForStats = (typeof selectedSamples !== 'undefined' && selectedSamples && selectedSamples.length > 0) ? selectedSamples[0] : null;
                        updateStats(hierarchy, sampleForStats);
                    }
                } catch (_) { }
            }
        });
    });
}

/**
 * 清空过滤列表
 */
function handleClearFilterList() {
    if (taxonFilterSet.size === 0) return;

    if (confirm(`Clear all ${taxonFilterSet.size} taxa from the filter list?`)) {
        taxonFilterSet.clear();
        updateTaxonFilterList();
        // 如果过滤模式已启用，重新构建并绘制
        if (taxonFilterMode !== 'none' && rawData && rawData.length > 0) {
            treeData = buildHierarchy(rawData);
            initVisualization();
            drawAllTrees();
            try {
                if (typeof updateStats === 'function' && typeof d3 !== 'undefined') {
                    const hierarchy = d3.hierarchy(treeData);
                    const sampleForStats = (typeof selectedSamples !== 'undefined' && selectedSamples && selectedSamples.length > 0) ? selectedSamples[0] : null;
                    updateStats(hierarchy, sampleForStats);
                }
            } catch (_) { }
        }
    }
}

/**
 * 处理过滤模式变化
 */
function handleTaxonFilterModeChange() {
    const select = document.getElementById('taxon-filter-mode');
    taxonFilterMode = select.value;

    // 重新构建层次结构并绘制（应用新的过滤模式）
    if (rawData && rawData.length > 0) {
        treeData = buildHierarchy(rawData);
        initVisualization();
        drawAllTrees();
        try {
            if (typeof updateStats === 'function' && typeof d3 !== 'undefined') {
                const hierarchy = d3.hierarchy(treeData);
                const sampleForStats = (typeof selectedSamples !== 'undefined' && selectedSamples && selectedSamples.length > 0) ? selectedSamples[0] : null;
                updateStats(hierarchy, sampleForStats);
            }
        } catch (_) { }
    }
}

/**
 * 检查 taxon 是否应该被包含（用于过滤）
 */
window.taxonPassesFilter = function (taxon) {
    if (taxonFilterMode === 'none' || taxonFilterSet.size === 0) {
        return true;
    }

    const inFilterSet = taxonFilterSet.has(taxon);

    if (taxonFilterMode === 'include') {
        return inFilterSet;  // 只包含列表中的
    } else if (taxonFilterMode === 'exclude') {
        return !inFilterSet; // 排除列表中的
    }

    return true;
};

/**
 * 初始化 taxon 筛选面板
 */
function initTaxonFilters() {
    // 搜索按钮 - 直接打开弹窗显示结果
    const searchBtn = document.getElementById('taxon-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', handleTaxonSearch);
    }

    // 搜索框回车事件
    const searchInput = document.getElementById('taxon-search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleTaxonSearch();
            }
        });
    }

    // 清空过滤列表按钮
    const clearFilterBtn = document.getElementById('taxon-clear-filter-list');
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', handleClearFilterList);
    }

    // 过滤模式选择
    const modeSelect = document.getElementById('taxon-filter-mode');
    if (modeSelect) {
        modeSelect.addEventListener('change', handleTaxonFilterModeChange);
    }

    // 折叠按钮
    const toggle = document.getElementById('taxon-filters-toggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            const content = document.getElementById('taxon-filters-content');
            if (!content) return;
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            toggle.textContent = isVisible ? 'Expand ▼' : 'Collapse ▲';
            toggle.classList.toggle('expanded', !isVisible);
        });
    }

    // 展开编辑过滤列表按钮
    const expandFilterBtn = document.getElementById('taxon-expand-filter');
    if (expandFilterBtn) {
        expandFilterBtn.addEventListener('click', openFilterListModal);
    }

    // 弹窗关闭按钮
    const modalClose = document.getElementById('taxon-edit-modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }

    // 点击弹窗外部关闭
    const modal = document.getElementById('taxon-edit-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // 手动添加按钮
    const manualAddBtn = document.getElementById('taxon-manual-add-btn');
    if (manualAddBtn) {
        manualAddBtn.addEventListener('click', handleManualAddItem);
    }

    const manualInput = document.getElementById('taxon-manual-input');
    if (manualInput) {
        manualInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleManualAddItem();
            }
        });
    }

    // "Add to Filter List" 按钮
    const addToFilterBtn = document.getElementById('taxon-add-to-filter-btn');
    if (addToFilterBtn) {
        addToFilterBtn.addEventListener('click', handleAddSearchResultsToFilter);
    }

    // "Cancel" 按钮
    const cancelBtn = document.getElementById('taxon-edit-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }

    // 初始隐藏内容
    const content = document.getElementById('taxon-filters-content');
    if (content) {
        content.style.display = 'none';
    }
}

// ========== 弹窗功能 ==========
let currentModalMode = 'search'; // 'search' or 'filter'

/**
 * 打开搜索结果弹窗
 */
function openSearchResultsModal() {
    currentModalMode = 'search';
    const modal = document.getElementById('taxon-edit-modal');
    const title = document.getElementById('taxon-edit-modal-title');
    const addBtn = document.getElementById('taxon-add-to-filter-btn');

    title.textContent = 'Search Results';
    addBtn.style.display = 'inline-block';

    updateModalContent();
    modal.style.display = 'block';
}

/**
 * 打开过滤列表编辑弹窗
 */
function openFilterListModal() {
    currentModalMode = 'filter';
    const modal = document.getElementById('taxon-edit-modal');
    const title = document.getElementById('taxon-edit-modal-title');
    const addBtn = document.getElementById('taxon-add-to-filter-btn');

    title.textContent = 'Edit Filter List';
    addBtn.style.display = 'none';  // 编辑模式下隐藏"添加到过滤列表"按钮

    updateModalContent();
    modal.style.display = 'block';
}

/**
 * 关闭弹窗
 */
function closeModal() {
    const modal = document.getElementById('taxon-edit-modal');
    modal.style.display = 'none';

    // 清空手动输入框
    const manualInput = document.getElementById('taxon-manual-input');
    if (manualInput) {
        manualInput.value = '';
    }
}

/**
 * 更新弹窗内容
 */
function updateModalContent() {
    const container = document.getElementById('taxon-edit-list');
    const totalSpan = document.getElementById('taxon-edit-total');

    const targetSet = currentModalMode === 'search' ? taxonSearchResults : taxonFilterSet;
    totalSpan.textContent = targetSet.size;

    if (targetSet.size === 0) {
        container.innerHTML = '<em class="text-muted">No items</em>';
        return;
    }

    const sorted = Array.from(targetSet).sort();
    container.innerHTML = '';

    sorted.forEach(taxon => {
        const item = document.createElement('div');
        item.className = 'taxon-edit-item';
        item.title = taxon;
        item.innerHTML = `
            <span class="taxon-edit-item-name">${taxon}</span>
            <span class="taxon-edit-item-remove" data-taxon="${taxon}">×</span>
        `;
        container.appendChild(item);
    });

    // 绑定删除按钮
    container.querySelectorAll('.taxon-edit-item-remove').forEach(btn => {
        btn.addEventListener('click', function () {
            const taxon = this.dataset.taxon;
            targetSet.delete(taxon);
            updateModalContent();

            // 如果是编辑过滤列表,同时更新主界面
            if (currentModalMode === 'filter') {
                updateTaxonFilterList();
                // 如果过滤模式已启用，重新构建并绘制
                if (taxonFilterMode !== 'none' && rawData && rawData.length > 0) {
                    treeData = buildHierarchy(rawData);
                    initVisualization();
                    drawAllTrees();
                }
            }
        });
    });
}

/**
 * 将搜索结果添加到过滤列表
 */
function handleAddSearchResultsToFilter() {
    if (taxonSearchResults.size === 0) {
        alert('No items to add');
        return;
    }

    // 将搜索结果添加到过滤列表
    taxonSearchResults.forEach(taxon => taxonFilterSet.add(taxon));

    // 更新主界面的过滤列表
    updateTaxonFilterList();

    // 如果过滤模式已启用，重新构建并绘制
    if (taxonFilterMode !== 'none' && rawData && rawData.length > 0) {
        treeData = buildHierarchy(rawData);
        initVisualization();
        drawAllTrees();
    }

    // 关闭弹窗
    closeModal();

    alert(`Added ${taxonSearchResults.size} items to filter list`);
}

/**
 * 手动添加项到当前列表
 */
function handleManualAddItem() {
    const input = document.getElementById('taxon-manual-input');
    const taxon = input.value.trim();

    if (!taxon) {
        alert('Please enter an item name');
        return;
    }

    const targetSet = currentModalMode === 'search' ? taxonSearchResults : taxonFilterSet;
    targetSet.add(taxon);

    input.value = '';
    updateModalContent();

    // 如果是编辑过滤列表,同时更新主界面
    if (currentModalMode === 'filter') {
        updateTaxonFilterList();
        // 如果过滤模式已启用，重新构建并绘制
        if (taxonFilterMode !== 'none' && rawData && rawData.length > 0) {
            treeData = buildHierarchy(rawData);
            initVisualization();
            drawAllTrees();
        }
    }
}

// ========== 统一标签颜色功能 ==========

/**
 * 初始化统一标签颜色功能
 */
function initUniformLabelColors() {
    // 通用重绘函数 - 支持所有可视化模式
    function redrawCurrentVisualization() {
        if (visualizationMode === 'single' && treeData && selectedSamples.length > 0) {
            drawAllTrees();
        } else if (visualizationMode === 'comparison') {
            // comparison 模式：重新绘制当前比较
            if (window.currentModalComparison && document.getElementById('comparison-modal-body')) {
                const c = window.currentModalComparison;
                drawComparisonTree(c.treatment_1, c.treatment_2, c.stats, { containerId: 'comparison-modal-body', isModal: true });
            } else if (window.comparisonResults && window.comparisonResults.length > 0) {
                const comp = window.comparisonResults[0];
                drawComparisonTree(comp.treatment_1, comp.treatment_2, comp.stats);
            }
        } else if (visualizationMode === 'group' && treeData) {
            drawAllTrees();
        } else if (visualizationMode === 'matrix') {
            // matrix 模式：检查是否在查看 inline comparison
            if (window.currentInlineComparison && document.getElementById('inline-comparison-body')) {
                const c = window.currentInlineComparison;
                const onBack = () => {
                    try { delete window.currentInlineComparison; } catch (_) { window.currentInlineComparison = null; }
                    if (Array.isArray(window.comparisonResults) && window.comparisonResults.length > 0) {
                        drawComparisonMatrix(window.comparisonResults);
                    }
                };
                drawComparisonTree(c.treatment_1, c.treatment_2, c.stats, { containerId: 'inline-comparison-body', isModal: false, showBack: true, onBack });
            } else if (window.comparisonResults) {
                drawComparisonMatrix(window.comparisonResults);
            }
        }
    }

    const checkbox = document.getElementById('uniform-label-colors');
    if (checkbox) {
        checkbox.addEventListener('change', function () {
            uniformLabelColors = this.checked;
            if (uniformLabelColors) {
                // 重置颜色映射,为所有标签重新分配颜色
                resetAllLabelColors();
            }
            // 重新绘制 - 使用通用重绘函数
            redrawCurrentVisualization();
        });
    }

    const smartCullingCheckbox = document.getElementById('smart-label-culling');
    if (smartCullingCheckbox) {
        smartCullingCheckbox.addEventListener('change', function () {
            smartLabelCulling = this.checked;
            redrawCurrentVisualization();
        });
    }

    // 右键菜单事件
    const applyCurrentBtn = document.getElementById('label-color-apply-current');
    const applySameBtn = document.getElementById('label-color-apply-same');
    const applyAllBtn = document.getElementById('label-color-apply-all');
    const colorPicker = document.getElementById('label-color-picker');

    console.log('Initializing label color menu buttons:', {
        applyCurrentBtn: !!applyCurrentBtn,
        applySameBtn: !!applySameBtn,
        applyAllBtn: !!applyAllBtn,
        colorPicker: !!colorPicker
    });

    // Apply 按钮 - 仅应用到当前节点实例（使用唯一路径进行覆盖）
    if (applyCurrentBtn) {
        applyCurrentBtn.addEventListener('click', function (e) {
            e.stopPropagation(); // 防止触发外部点击关闭
            const menu = document.getElementById('label-color-menu');
            const labelName = menu.dataset.labelName; // 同时作为节点覆盖的标签记录
            const nodePath = menu.dataset.nodePath;
            const color = colorPicker ? colorPicker.value : null;

            console.log('Apply current clicked:', { labelName, nodePath, color });

            if (nodePath && color) {
                if (typeof window.setNodeColorOverride === 'function') {
                    window.setNodeColorOverride(nodePath, color, labelName);
                }
                console.log('Color override set for node:', nodePath, 'color:', color);
                redrawCurrentVisualization();
            }
            hideLabelColorMenu();
        });
    }

    // Apply Same 按钮 - 应用颜色到所有同名标签
    if (applySameBtn) {
        applySameBtn.addEventListener('click', function (e) {
            e.stopPropagation(); // 防止触发外部点击关闭
            const menu = document.getElementById('label-color-menu');
            const labelName = menu.dataset.labelName;
            const color = colorPicker ? colorPicker.value : null;

            console.log('Apply same clicked:', { labelName, color });

            if (labelName && color) {
                // 先清理该标签的所有节点级覆盖，确保“Same”在所有同名标签上生效
                if (typeof window.clearNodeOverridesByLabel === 'function') {
                    window.clearNodeOverridesByLabel(labelName);
                }
                setCustomLabelColor(labelName, color);
                console.log('Color set for all same labels:', labelName, 'color:', color);
                redrawCurrentVisualization();
            }
            hideLabelColorMenu();
        });
    }

    // Apply All 按钮 - 应用颜色到所有标签
    if (applyAllBtn) {
        applyAllBtn.addEventListener('click', function (e) {
            e.stopPropagation(); // 防止触发外部点击关闭
            const color = colorPicker ? colorPicker.value : null;

            console.log('Apply all clicked, color:', color);

            if (color) {
                // 为确保统一效果，先清除所有节点级覆盖
                try {
                    if (typeof window.clearAllNodeColorOverrides === 'function') {
                        window.clearAllNodeColorOverrides();
                    }
                } catch (_) { }
                // 获取所有标签名称
                const allLabels = getAllLabelNames();
                console.log('Applying color to all labels:', allLabels.size, 'labels');

                // 为所有标签设置相同颜色
                allLabels.forEach(labelName => {
                    setCustomLabelColor(labelName, color);
                });

                redrawCurrentVisualization();
            }
            hideLabelColorMenu();
        });
    }

    // 点击其他地方关闭菜单
    document.addEventListener('click', function (event) {
        const labelMenu = document.getElementById('label-color-menu');
        if (labelMenu && labelMenu.style.display === 'block') {
            const isClickInsideMenu = labelMenu.contains(event.target);
            if (!isClickInsideMenu) {
                hideLabelColorMenu();
            }
        }
        const exportMenu = document.getElementById('viz-export-menu');
        if (exportMenu && exportMenu.style.display === 'block') {
            const isInsideExport = exportMenu.contains(event.target);
            if (!isInsideExport) {
                hideVizExportMenu();
            }
        }
    });

    // 阻止菜单上的右键事件传播
    const menu = document.getElementById('label-color-menu');
    if (menu) {
        menu.addEventListener('contextmenu', function (e) {
            e.preventDefault();
        });
    }
    const exportMenuEl = document.getElementById('viz-export-menu');
    if (exportMenuEl) {
        exportMenuEl.addEventListener('contextmenu', function (e) {
            e.preventDefault();
        });
    }

    // 屏蔽 viz-container 的浏览器右键菜单
    const vizContainer = document.getElementById('viz-container');
    if (vizContainer) {
        vizContainer.addEventListener('contextmenu', function (e) {
            const target = e.target;
            // Check for node labels or nodes (circles/paths inside .node group)
            if (target && (
                (target.classList && target.classList.contains('node-label')) ||
                (target.closest && target.closest('.node'))
            )) {
                hideVizExportMenu();
                return;
            }
            const fallbackMode = (typeof visualizationMode !== 'undefined') ? visualizationMode : 'single';
            const mode = (typeof window !== 'undefined' && window.visualizationMode) ? window.visualizationMode : fallbackMode;
            if (mode !== 'single' && mode !== 'group' && mode !== 'matrix') {
                hideVizExportMenu();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const clientX = typeof e.clientX === 'number' ? e.clientX : (typeof e.pageX === 'number' ? e.pageX : 0);
            const clientY = typeof e.clientY === 'number' ? e.clientY : (typeof e.pageY === 'number' ? e.pageY : 0);
            showVizExportMenu(clientX, clientY);
        });
    }

    // 同时屏蔽所有 SVG 元素的右键菜单(除了标签)
    document.addEventListener('contextmenu', function (e) {
        const target = e.target;
        if (!target) return;
        if (target.closest && (target.closest('#viz-export-menu') || target.closest('#label-color-menu'))) {
            return;
        }
        if (target.classList && target.classList.contains('node-label')) {
            return;
        }
        if (target.closest && target.closest('#viz-container')) {
            e.preventDefault();
            return false;
        }
        if ((target.tagName === 'svg' ||
            target.tagName === 'circle' ||
            target.tagName === 'path' ||
            target.tagName === 'line' ||
            (target.closest && target.closest('svg'))) &&
            !(target.classList && target.classList.contains('node-label'))) {
            e.preventDefault();
            return false;
        }
    });
}

/**
 * Show a toast notification
 * @param {string} message 
 * @param {number} duration 
 */
function showToast(message, duration = 3000) {
    let toast = document.querySelector('.toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }
    toast.textContent = message;

    // Force reflow
    void toast.offsetWidth;

    toast.classList.add('show');

    if (toast._timeout) clearTimeout(toast._timeout);

    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}
try { if (typeof window !== 'undefined') window.showToast = showToast; } catch (_) { }

// ========== Drag and Drop Support ==========

let draggedElement = null;

function addDragListeners(element, type) {
    element.setAttribute('draggable', 'true');
    element.style.cursor = 'move';

    element.addEventListener('dragstart', function (e) {
        draggedElement = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
        this.classList.add('dragging');
    });

    element.addEventListener('dragend', function (e) {
        this.classList.remove('dragging');
        draggedElement = null;

        // Trigger update after drop
        if (type === 'sample') {
            handleSampleOrderChange();
        } else if (type === 'group') {
            handleGroupOrderChange();
        }
    });

    element.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (this === draggedElement) return;

        // Determine insert position
        const bounding = this.getBoundingClientRect();
        const offset = bounding.y + (bounding.height / 2);

        if (e.clientY - offset > 0) {
            this.parentNode.insertBefore(draggedElement, this.nextSibling);
        } else {
            this.parentNode.insertBefore(draggedElement, this);
        }
    });

    element.addEventListener('dragenter', function (e) {
        e.preventDefault();
    });
}

function handleSampleOrderChange() {
    const container = document.getElementById('sample-checkboxes');
    if (!container) return;

    const newOrder = [];
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        newOrder.push(cb.value);
    });

    // Update global samples array to persist the order
    if (typeof samples !== 'undefined' && samples.length === newOrder.length) {
        samples = newOrder;
    }

    // Update selectedSamples order
    if (typeof selectedSamples !== 'undefined') {
        const currentSelectedSet = new Set(selectedSamples);
        selectedSamples = newOrder.filter(s => currentSelectedSet.has(s));

        // Redraw
        if (typeof initVisualization === 'function' && typeof drawAllTrees === 'function') {
            initVisualization();
            drawAllTrees();
        }
    }
}

function handleGroupOrderChange() {
    const container = document.getElementById('group-checkboxes');
    if (!container) return;

    const newOrder = [];
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        newOrder.push(cb.value);
    });

    // Update selectedGroups order
    if (typeof selectedGroups !== 'undefined') {
        const currentSelectedSet = new Set(selectedGroups);
        selectedGroups = newOrder.filter(g => currentSelectedSet.has(g));

        // Also update activeSamples if in group mode
        if (typeof visualizationMode !== 'undefined' && visualizationMode === 'group') {
            // activeSamples is usually local in initVisualization, but we update selectedGroups which is used there
        }

        if (typeof initVisualization === 'function' && typeof drawAllTrees === 'function') {
            initVisualization();
            drawAllTrees();
        }
    }
}

/**
 * Initialize the custom mode switcher UI
 */
function initModeSwitcher() {
    const select = document.getElementById('viz-mode');
    const buttons = document.querySelectorAll('.mode-btn');

    if (!select || buttons.length === 0) return;

    // Function to update active state
    const updateActiveState = (value) => {
        buttons.forEach(btn => {
            if (btn.dataset.value === value) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    // Initialize state
    updateActiveState(select.value);

    // Add click listeners
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const value = btn.dataset.value;
            if (select.value !== value) {
                select.value = value;
                updateActiveState(value);
                // Trigger change event
                const event = new Event('change');
                select.dispatchEvent(event);
            }
        });
    });

    // Listen for changes on the select (in case it's changed programmatically)
    select.addEventListener('change', () => {
        updateActiveState(select.value);
    });
}

/**
 * Initialize tab navigation for panels
 */
function initTabs() {
    const tabNavs = document.querySelectorAll('.tab-nav');
    
    tabNavs.forEach(nav => {
        const buttons = nav.querySelectorAll('.tab-btn');
        
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons in this nav
                buttons.forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                btn.classList.add('active');
                
                // Hide all tab content in this panel
                const panel = nav.closest('.control-panel');
                const contents = panel.querySelectorAll('.tab-content');
                contents.forEach(c => c.classList.remove('active'));
                
                // Show target content
                const targetId = btn.dataset.tab;
                const targetContent = document.getElementById(targetId);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    });
}


