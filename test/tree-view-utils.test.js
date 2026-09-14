const assert = require('node:assert/strict');
const { getChildren, hasPresenceDifference } = require('../js/core/tree-view-utils.js');

const species = { name: 'coli', rank: 'species', children: [] };
const genus = { name: 'Escherichia', rank: 'genus', children: [species] };
const family = { name: 'Enterobacteriaceae', rank: 'family', children: [genus] };
const kingdom = { name: 'Bacteria', rank: 'kingdom', children: [family] };
const domain = { name: 'Bacteria', rank: 'domain', children: [kingdom] };

const visible = new Set(['domain', 'genus', 'species']);
assert.deepEqual(getChildren(domain, visible).map(node => node.rank), ['genus']);
assert.deepEqual(getChildren(genus, visible).map(node => node.rank), ['species']);

kingdom.__collapsed = true;
assert.equal(getChildren(domain, visible), null);

const country = { name: 'Australia', depth: 3, children: [] };
const income = { name: 'High income', depth: 2, children: [country] };
const region = { name: 'East Asia & Pacific', depth: 1, children: [income] };
const world = { name: 'World', depth: 0, children: [region] };
assert.deepEqual(getChildren(world, null, new Set([0, 3])).map(node => node.name), ['Australia']);

assert.equal(hasPresenceDifference([10, 0]), true);
assert.equal(hasPresenceDifference([10, 4]), false);
assert.equal(hasPresenceDifference([0, 0]), false);
assert.equal(hasPresenceDifference([10]), false);

console.log('tree view checks passed');
