(function (global) {
    if (typeof global.getComparisonRendererStore === 'function') {
        return;
    }

    const store = (function () {
        let svg = null;
        let zoom = null;
        let stats = null;
        let resizeObserver = null;

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
                this.disconnectResizeObserver();
            },
            getStats() {
                return stats;
            },
            setStats(value) {
                stats = value || null;
            },
            getResizeObserver() {
                return resizeObserver;
            },
            setResizeObserver(value) {
                this.disconnectResizeObserver();
                resizeObserver = value || null;
            },
            disconnectResizeObserver() {
                if (resizeObserver) {
                    try {
                        resizeObserver.disconnect();
                    } catch (e) {
                        console.warn('Failed to disconnect ResizeObserver:', e);
                    }
                    resizeObserver = null;
                }
            }
        };
    })();

    global.getComparisonRendererStore = function () {
        return store;
    };
})(typeof window !== 'undefined' ? window : globalThis);
