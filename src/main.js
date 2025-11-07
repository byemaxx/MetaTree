import './styles/main.css';
import { state, subscribe } from './state/store.js';
import { renderTree } from './renderers/treeRenderer.js';
import { DataLoaderPanel } from './ui/dataLoaderPanel.js';
import { MetaFilterPanel } from './ui/metaFilters.js';
import { TaxonFilterPanel } from './ui/taxonFilters.js';
import { LayoutControls } from './ui/layoutControls.js';
import { refreshTree } from './services/dataLoader.js';

function createSection(titleText) {
  const section = document.createElement('section');
  section.className = 'panel-section';
  const title = document.createElement('h2');
  title.textContent = titleText;
  section.appendChild(title);
  return { section, content: section };
}

function createLayout() {
  const app = document.getElementById('app');
  const layout = document.createElement('div');
  layout.className = 'app-layout';

  const sidebar = document.createElement('aside');
  sidebar.className = 'app-sidebar';

  const main = document.createElement('main');
  main.className = 'app-main';

  const canvas = document.createElement('div');
  canvas.id = 'tree-canvas';
  main.appendChild(canvas);

  layout.append(sidebar, main);
  app.appendChild(layout);
  return { sidebar, canvas };
}

function setupSidebar(sidebar) {
  const dataSection = createSection('Load data');
  const dataPanelContainer = document.createElement('div');
  dataSection.content.appendChild(dataPanelContainer);
  sidebar.appendChild(dataSection.section);
  const dataPanel = new DataLoaderPanel(dataPanelContainer);

  const metaSection = createSection('Metadata filters');
  const metaContainer = document.createElement('div');
  metaSection.content.appendChild(metaContainer);
  sidebar.appendChild(metaSection.section);
  const metaPanel = new MetaFilterPanel(metaContainer);

  const taxonSection = createSection('Taxon filters');
  const taxonContainer = document.createElement('div');
  taxonSection.content.appendChild(taxonContainer);
  sidebar.appendChild(taxonSection.section);
  const taxonPanel = new TaxonFilterPanel(taxonContainer);

  const layoutSection = createSection('Layout & appearance');
  const layoutContainer = document.createElement('div');
  layoutSection.content.appendChild(layoutContainer);
  sidebar.appendChild(layoutSection.section);
  const layoutControls = new LayoutControls(layoutContainer);

  return { dataPanel, metaPanel, taxonPanel, layoutControls };
}

function draw(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  const fallbackWidth = width > 0 ? width : 960;
  const fallbackHeight = height > 0 ? height : 720;
  renderTree(canvas, state.tree, { width: fallbackWidth, height: fallbackHeight });
}

function setupSubscriptions(canvas) {
  const keys = [
    'tree',
    'layout',
    'colorScheme',
    'colorSchemeReversed',
    'showLabels',
    'nodeScale',
    'edgeScale',
    'nodeOpacity',
    'edgeOpacity',
    'abundanceTransform',
    'selectedSamples'
  ];
  keys.forEach((key) => {
    subscribe(key, () => draw(canvas));
  });
  window.addEventListener('resize', () => draw(canvas));
}

function bootstrap() {
  const { sidebar, canvas } = createLayout();
  setupSidebar(sidebar);
  setupSubscriptions(canvas);
  refreshTree();
}

bootstrap();
