(function (global) {
    const rootStore = global.MetaTreeStore;
    if (!rootStore) {
        throw new Error('MetaTreeStore must be loaded before MetaTreeComparisonStore');
    }

    const DEFAULT_OPTIONS = {
        metric: 'log2_median_ratio',
        transform: 'none',
        minAbundance: 0,
        runTests: true
    };

    const DEFAULT_RENDER = {
        palette: 'blueRed',
        colorDomain: [-5, 0, 5],
        showOnlySignificant: false
    };

    function ensureDefaults() {
        rootStore.ensure('comparison.options', DEFAULT_OPTIONS);
        rootStore.ensure('comparison.render', DEFAULT_RENDER);
        rootStore.ensure('comparison.groups', {});
        rootStore.ensure('comparison.results', []);
    }

    function mergeOptions(partial) {
        const current = rootStore.get('comparison.options') || DEFAULT_OPTIONS;
        return { ...DEFAULT_OPTIONS, ...current, ...(partial || {}) };
    }

    function mergeRender(partial) {
        const current = rootStore.get('comparison.render') || DEFAULT_RENDER;
        return { ...DEFAULT_RENDER, ...current, ...(partial || {}) };
    }

    ensureDefaults();

    const comparisonStore = {
        getGroups() {
            return rootStore.get('comparison.groups') || {};
        },
        setGroups(groups) {
            rootStore.set('comparison.groups', groups || {});
        },
        upsertGroup(name, samples) {
            if (!name) return;
            const next = { ...comparisonStore.getGroups(), [name]: samples ? samples.slice() : [] };
            rootStore.set('comparison.groups', next);
        },
        removeGroup(name) {
            if (!name) return;
            const groups = { ...comparisonStore.getGroups() };
            delete groups[name];
            rootStore.set('comparison.groups', groups);
        },
        clearGroups() {
            rootStore.set('comparison.groups', {});
        },
        getResults() {
            return rootStore.get('comparison.results') || [];
        },
        setResults(results) {
            rootStore.set('comparison.results', Array.isArray(results) ? results : []);
        },
        getOptions() {
            return mergeOptions();
        },
        updateOptions(partial) {
            rootStore.set('comparison.options', mergeOptions(partial));
        },
        getRenderSettings() {
            return mergeRender();
        },
        updateRenderSettings(partial) {
            rootStore.set('comparison.render', mergeRender(partial));
        },
        subscribe(listener) {
            return rootStore.subscribe((state, change) => {
                if (!change) return;
                const prefix = change.path || '';
                if (prefix.startsWith('comparison')) {
                    listener(state.comparison, change);
                }
            });
        }
    };

    global.MetaTreeComparisonStore = comparisonStore;
})(typeof window !== 'undefined' ? window : globalThis);
