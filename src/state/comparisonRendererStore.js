(function (global) {
    if (typeof global.getComparisonRendererStore === 'function') {
        return;
    }

    const store = (function () {
        let svg = null;
        let zoom = null;
        let stats = null;

        return {
            getSvg() {
                return svg;
            },
            setSvg(value) {
                svg = value || null;
            },
            getZoom() {
                return zoom;
            },
            setZoom(value) {
                zoom = value || null;
            },
            clear() {
                svg = null;
                zoom = null;
                stats = null;
            },
            getStats() {
                return stats;
            },
            setStats(value) {
                stats = value || null;
            }
        };
    })();

    global.getComparisonRendererStore = function () {
        return store;
    };
})(typeof window !== 'undefined' ? window : globalThis);
