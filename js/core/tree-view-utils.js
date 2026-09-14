(function initTreeViewUtils(globalScope) {
    function getChildren(node, visibleRanks, visibleLevels) {
        if (!node || node.__collapsed || !Array.isArray(node.children)) return null;

        const children = node.children.flatMap(child => {
            const rank = child && typeof child.rank === 'string' ? child.rank.toLowerCase() : null;
            const level = child && Number.isInteger(child.depth) ? child.depth : null;
            const visible = rank
                ? (!visibleRanks || visibleRanks.has(rank))
                : (level === null || !visibleLevels || visibleLevels.has(level));
            if (visible) return [child];
            return getChildren(child, visibleRanks, visibleLevels) || [];
        });

        return children.length > 0 ? children : null;
    }

    function hasPresenceDifference(values) {
        if (!Array.isArray(values) || values.length < 2) return false;
        const presentCount = values.filter(value => Number.isFinite(Number(value)) && Number(value) !== 0).length;
        return presentCount > 0 && presentCount < values.length;
    }

    function getPackingStructureWeight(node, childAccessor) {
        const children = childAccessor(node);
        return Array.isArray(children) && children.length > 0 ? 0 : 1;
    }

    const api = { getChildren, hasPresenceDifference, getPackingStructureWeight };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (globalScope) globalScope.MetaTreeViewUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
