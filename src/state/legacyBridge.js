(function (global) {
    const store = global.MetaTreeStore;
    if (!store) {
        throw new Error('MetaTreeStore must be loaded before legacy bridge');
    }

    const mappings = [
        ['treeData', 'data.tree', null],
        ['activeTreeData', 'data.activeTree', null],
        ['rawData', 'data.raw', []],
        ['samples', 'data.samples', []],
        ['selectedSamples', 'data.selectedSamples', []],
        ['groupDefinitions', 'comparison.groups', {}],
        ['comparisonResults', 'comparison.results', []],
        ['comparisonMetric', 'comparison.options.metric', 'log2_median_ratio'],
        ['divergingPalette', 'comparison.render.palette', 'blueRed'],
        ['comparisonColorDomain', 'comparison.render.colorDomain', [-5, 0, 5]],
        ['showOnlySignificant', 'comparison.render.showOnlySignificant', false],
        ['visualizationMode', 'ui.visualizationMode', 'single'],
        ['metaData', 'meta.table', null],
        ['metaColumns', 'meta.columns', []],
        ['metaFilters', 'meta.filters', {}]
    ];

    mappings.forEach(([name, path, defaultValue]) => {
        store.ensure(path, defaultValue);
        Object.defineProperty(global, name, {
            configurable: true,
            get() {
                return store.get(path);
            },
            set(value) {
                store.set(path, value);
            }
        });
    });
})(typeof window !== 'undefined' ? window : globalThis);
