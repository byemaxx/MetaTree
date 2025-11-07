import * as d3 from 'd3';
import { state } from '../state/store.js';

function computeValue(abundances, samples, transform) {
  if (!samples || samples.length === 0) {
    return 0;
  }
  const values = samples.map((sample) => abundances?.[sample] ?? 0);
  let aggregated = 0;
  if (transform === 'sum') {
    aggregated = values.reduce((acc, value) => acc + value, 0);
  } else {
    aggregated = values.reduce((acc, value) => acc + value, 0) / samples.length;
  }
  switch (transform) {
    case 'log':
      return Math.log10(aggregated + 1e-6);
    case 'log2':
      return Math.log2(aggregated + 1e-6);
    case 'sqrt':
      return Math.sqrt(Math.max(aggregated, 0));
    default:
      return aggregated;
  }
}

function createLayout(layout, radius) {
  if (layout === 'radial') {
    return d3.tree()
      .size([2 * Math.PI, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);
  }
  return d3.tree()
    .size([radius * 2, radius])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2));
}

function createColorScale(nodes, palette, reversed) {
  const values = nodes.map((node) => node.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const interpolator = palette === 'Viridis' ? d3.interpolateViridis : d3.interpolateTurbo;
  const scale = d3.scaleSequential(interpolator).domain(reversed ? [max, min] : [min, max]);
  return scale;
}

export function renderTree(container, treeData, options = {}) {
  const { width = 960, height = 720 } = options;
  container.innerHTML = '';
  if (!treeData) {
    return;
  }

  const selectedSamples = state.selectedSamples.length > 0 ? state.selectedSamples : state.samples;
  const root = d3.hierarchy(treeData, (node) => node.children);
  root.each((node) => {
    node.value = computeValue(node.data.abundances, selectedSamples, state.abundanceTransform);
  });

  const radius = Math.min(width, height) / 2 - 40;
  const layout = createLayout(state.layout, radius);
  const layoutRoot = layout(root);
  const nodes = layoutRoot.descendants();
  const links = layoutRoot.links();
  const colorScale = createColorScale(nodes, state.colorScheme, state.colorSchemeReversed);

  const svg = d3.select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', width)
    .attr('height', height)
    .attr('class', 'metatree-canvas');

  const g = svg.append('g')
    .attr('transform', state.layout === 'radial'
      ? `translate(${width / 2}, ${height / 2})`
      : `translate(40, 20)`);

  const linkGenerator = state.layout === 'radial'
    ? d3.linkRadial()
      .angle((d) => d.x)
      .radius((d) => d.y)
    : d3.linkHorizontal()
      .x((d) => d.y)
      .y((d) => d.x);

  g.append('g')
    .attr('fill', 'none')
    .attr('stroke', '#d0d7de')
    .attr('stroke-opacity', state.edgeOpacity)
    .attr('stroke-width', state.edgeScale)
    .selectAll('path')
    .data(links)
    .join('path')
    .attr('d', (link) => linkGenerator(link));

  const nodeGroup = g.append('g')
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('transform', (node) => {
      if (state.layout === 'radial') {
        const angle = node.x - Math.PI / 2;
        const x = Math.cos(angle) * node.y;
        const y = Math.sin(angle) * node.y;
        return `translate(${x}, ${y})`;
      }
      return `translate(${node.y}, ${node.x})`;
    });

  nodeGroup.append('circle')
    .attr('fill', (node) => colorScale(node.value))
    .attr('fill-opacity', state.nodeOpacity)
    .attr('r', (node) => {
      const base = 4 + node.depth;
      return base * state.nodeScale;
    })
    .attr('stroke', '#1f2933')
    .attr('stroke-opacity', 0.3)
    .attr('stroke-width', 0.5);

  if (state.showLabels) {
    nodeGroup.append('text')
      .attr('dy', '0.31em')
      .attr('x', (node) => {
        if (state.layout === 'radial') {
          return node.x < Math.PI === !node.children ? 6 : -6;
        }
        return node.children ? -8 : 8;
      })
      .attr('text-anchor', (node) => {
        if (state.layout === 'radial') {
          return node.x < Math.PI === !node.children ? 'start' : 'end';
        }
        return node.children ? 'end' : 'start';
      })
      .attr('transform', (node) => {
        if (state.layout === 'radial') {
          return node.x >= Math.PI ? 'rotate(180)' : null;
        }
        return null;
      })
      .attr('font-size', state.labelFontSize)
      .attr('fill', '#111827')
      .text((node) => node.data.name || node.data.fullName || '');
  }
}
