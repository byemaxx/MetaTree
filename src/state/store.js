(function (global) {
    if (global.MetaTreeStore) {
        return;
    }

    const listeners = new Set();
    const state = {
        comparison: {
            groups: {},
            results: [],
            options: {
                metric: 'log2_median_ratio',
                transform: 'none',
                minAbundance: 0,
                runTests: true
            },
            render: {
                palette: 'blueRed',
                colorDomain: [-5, 0, 5],
                showOnlySignificant: false
            }
        },
        layout: {
            mode: 'radial'
        },
        data: {
            tree: null,
            activeTree: null,
            samples: [],
            selectedSamples: [],
            raw: []
        },
        meta: {
            table: null,
            columns: [],
            filters: {}
        },
        ui: {
            visualizationMode: 'single'
        }
    };

    function clone(value) {
        if (Array.isArray(value)) {
            return value.slice();
        }
        if (value && typeof value === 'object') {
            return { ...value };
        }
        return value;
    }

    function pathToArray(path) {
        if (Array.isArray(path)) {
            return path.slice();
        }
        if (typeof path === 'string') {
            return path.split('.').filter(Boolean);
        }
        return [];
    }

    function getIn(target, pathArray) {
        return pathArray.reduce((acc, key) => {
            if (acc == null) return undefined;
            return acc[key];
        }, target);
    }

    function setIn(target, pathArray, value) {
        if (pathArray.length === 0) {
            throw new Error('Cannot set empty path');
        }
        let cursor = target;
        for (let i = 0; i < pathArray.length - 1; i++) {
            const key = pathArray[i];
            if (cursor[key] == null || typeof cursor[key] !== 'object') {
                cursor[key] = {};
            }
            cursor = cursor[key];
        }
        cursor[pathArray[pathArray.length - 1]] = value;
    }

    function notify(change) {
        listeners.forEach(listener => {
            try {
                listener(cloneState(), change);
            } catch (err) {
                console.error('MetaTreeStore listener error:', err);
            }
        });
    }

    function cloneState() {
        return {
            comparison: {
                groups: clone(state.comparison.groups),
                results: clone(state.comparison.results),
                options: clone(state.comparison.options),
                render: clone(state.comparison.render)
            },
            layout: clone(state.layout),
            data: clone(state.data),
            meta: clone(state.meta),
            ui: clone(state.ui)
        };
    }

    const store = {
        getState() {
            return cloneState();
        },
        get(path) {
            const pathArray = pathToArray(path);
            if (pathArray.length === 0) {
                return cloneState();
            }
            const value = getIn(state, pathArray);
            return clone(value);
        },
        set(path, value) {
            const pathArray = pathToArray(path);
            if (pathArray.length === 0) {
                throw new Error('MetaTreeStore.set requires a path');
            }
            const cloned = clone(value);
            setIn(state, pathArray, cloned);
            notify({ path: pathArray.join('.'), value: cloned });
        },
        update(path, updater) {
            if (typeof updater !== 'function') {
                throw new Error('MetaTreeStore.update requires updater function');
            }
            const current = store.get(path);
            const next = updater(clone(current));
            store.set(path, next);
        },
        merge(path, partial) {
            const pathArray = pathToArray(path);
            if (pathArray.length === 0) {
                throw new Error('MetaTreeStore.merge requires a path');
            }
            const current = getIn(state, pathArray) || {};
            const merged = { ...current, ...(partial || {}) };
            setIn(state, pathArray, merged);
            notify({ path: pathArray.join('.'), value: clone(merged) });
        },
        push(path, value) {
            const pathArray = pathToArray(path);
            const current = getIn(state, pathArray);
            const next = Array.isArray(current) ? current.slice() : [];
            next.push(value);
            setIn(state, pathArray, next);
            notify({ path: pathArray.join('.'), value: clone(next) });
        },
        subscribe(listener) {
            if (typeof listener !== 'function') {
                throw new Error('MetaTreeStore.subscribe expects a function');
            }
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        ensure(path, defaultValue) {
            const pathArray = pathToArray(path);
            let cursor = state;
            for (let i = 0; i < pathArray.length; i++) {
                const key = pathArray[i];
                if (cursor[key] == null) {
                    cursor[key] = (i === pathArray.length - 1)
                        ? clone(defaultValue)
                        : {};
                }
                cursor = cursor[key];
            }
            return store.get(path);
        }
    };

    global.MetaTreeStore = store;
})(typeof window !== 'undefined' ? window : globalThis);
