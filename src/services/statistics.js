(function (global) {
    const math = Math;

    function median(values) {
        if (!values || values.length === 0) return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }

    function clampPValue(p) {
        if (!isFinite(p) || p <= 0) return 0.0001;
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

    function erf(x) {
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

    function normalCDF(x) {
        return 0.5 * (1 + erf(x / Math.SQRT2));
    }

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

        if (n1 + n2 <= 10) {
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
        const zNumerator = Math.max(0, Math.abs(observedU - mu) - 0.5);
        const z = zNumerator / sigma;
        const p = 2 * (1 - normalCDF(z));

        return clampPValue(p);
    }

    function safeMean(values) {
        if (!values || values.length === 0) return 0;
        const sum = values.reduce((acc, value) => acc + value, 0);
        return sum / values.length;
    }

    function safeVariance(values, mean) {
        if (!values || values.length === 0) return 0;
        const avg = mean != null ? mean : safeMean(values);
        const diffSq = values.map(value => Math.pow(value - avg, 2));
        return safeMean(diffSq);
    }

    function cohensD(group1, group2, statsProvider) {
        const g1 = group1.filter(v => v != null && isFinite(v));
        const g2 = group2.filter(v => v != null && isFinite(v));

        if (g1.length === 0 || g2.length === 0) return 0;

        const provider = statsProvider || global.d3 || {};
        const mean1 = typeof provider.mean === 'function' ? (provider.mean(g1) || 0) : safeMean(g1);
        const mean2 = typeof provider.mean === 'function' ? (provider.mean(g2) || 0) : safeMean(g2);
        const variance1 = typeof provider.variance === 'function' ? (provider.variance(g1) || 0) : safeVariance(g1, mean1);
        const variance2 = typeof provider.variance === 'function' ? (provider.variance(g2) || 0) : safeVariance(g2, mean2);

        const denominator = g1.length + g2.length - 2;
        if (denominator <= 0) return 0;

        const pooledSD = Math.sqrt(((g1.length - 1) * variance1 + (g2.length - 1) * variance2) / denominator);

        if (pooledSD === 0 || !isFinite(pooledSD)) return 0;

        const effect = (mean2 - mean1) / pooledSD;
        return isFinite(effect) ? effect : 0;
    }

    function benjaminiHochberg(stats) {
        const items = Object.keys(stats || {}).map(key => ({
            taxon: key,
            pvalue: stats[key].pvalue
        }));
        items.sort((a, b) => a.pvalue - b.pvalue);

        const n = items.length;
        const qvalues = new Array(n);
        let minQValue = 1;
        for (let i = n - 1; i >= 0; i--) {
            const rank = i + 1;
            const qvalue = Math.min(items[i].pvalue * n / rank, minQValue);
            qvalues[i] = Math.min(qvalue, 1);
            minQValue = qvalues[i];
        }

        const result = {};
        for (let i = 0; i < n; i++) {
            const taxon = items[i].taxon;
            result[taxon] = {
                ...(stats[taxon] || {}),
                qvalue: qvalues[i]
            };
        }
        return result;
    }

    global.MetaTreeServices = global.MetaTreeServices || {};
    global.MetaTreeServices.statistics = {
        median,
        wilcoxonTest,
        cohensD,
        benjaminiHochberg,
        clampPValue,
        normalCDF,
        mannWhitneyU,
        rankCombinedSamples,
        exactMannWhitneyPValue
    };
})(typeof window !== 'undefined' ? window : globalThis);
