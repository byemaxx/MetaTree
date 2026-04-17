const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { chromium } = require('playwright-core');
const {
  coarsenIsoDate,
  PUBLIC_RAW_RESULT_COLUMNS,
  normalizePlatformFamily,
  sanitizeEnvironment,
  sanitizeResultRow
} = require('./public-output-utils');

const ROOT_DIR = path.resolve(__dirname, '..');
const BENCHMARK_DIR = __dirname;
const GENERATED_DIR = path.join(BENCHMARK_DIR, 'generated');
const OUTPUTS_DIR = path.join(BENCHMARK_DIR, 'outputs');
const MANIFEST_PATH = path.join(GENERATED_DIR, 'benchmark_manifest.json');
const RAW_JSON_PATH = path.join(OUTPUTS_DIR, 'raw_results.json');
const RAW_CSV_PATH = path.join(OUTPUTS_DIR, 'raw_results.csv');
const ENVIRONMENT_PATH = path.join(OUTPUTS_DIR, 'environment.json');
const DEFAULT_REPEATS = 5;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_) {
    return false;
  }
}

function formatNumber(value, digits) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows, columns) {
  const lines = [columns.join(',')];
  rows.forEach((row) => {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.tsv':
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') {
        pathname = '/index.html';
      }

      const requestedPath = path.normalize(path.join(rootDir, pathname));
      const relative = path.relative(rootDir, requestedPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      let resolvedPath = requestedPath;
      try {
        const stats = fs.statSync(resolvedPath);
        if (stats.isDirectory()) {
          resolvedPath = path.join(resolvedPath, 'index.html');
        }
      } catch (_) {
        // Fall through to 404 handling below.
      }

      if (!fileExists(resolvedPath)) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      response.writeHead(200, { 'Content-Type': guessContentType(resolvedPath) });
      fs.createReadStream(resolvedPath).pipe(response);
    });

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

function parseArgs(argv) {
  const options = {
    smoke: false,
    repeats: DEFAULT_REPEATS
  };

  argv.forEach((arg) => {
    if (arg === '--smoke') {
      options.smoke = true;
      options.repeats = 1;
      return;
    }
    if (arg.startsWith('--repeats=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.repeats = Math.floor(value);
      }
    }
  });

  return options;
}

function pickSmokeConditions(allConditions) {
  const wanted = [
    { mode: 'single', layout: 'radial', panel_count: 4 },
    { mode: 'group', layout: 'dendrogram', panel_count: 4 },
    { mode: 'comparison', layout: 'radial', panel_count: 1 },
    { mode: 'matrix', layout: 'dendrogram', panel_count: 9 }
  ];

  return wanted
    .map((spec) => allConditions.find((condition) => (
      condition.dataset_id === 'nodes_02000' &&
      condition.mode === spec.mode &&
      condition.layout === spec.layout &&
      condition.panel_count === spec.panel_count
    )))
    .filter(Boolean);
}

function buildConditions(manifest) {
  const layouts = ['radial', 'dendrogram'];
  const conditions = [];
  const datasets = manifest.datasets
    .slice()
    .sort((a, b) => a.target_node_count - b.target_node_count);

  datasets.forEach((dataset) => {
    layouts.forEach((layout) => {
      [1, 4, 9].forEach((panelCount) => {
        conditions.push({
          dataset_id: dataset.dataset_id,
          target_node_count: dataset.target_node_count,
          node_count: dataset.node_count,
          data_file: dataset.data_file,
          meta_file: dataset.meta_file,
          filter_taxa: dataset.filter_taxa,
          mode: 'single',
          layout,
          panel_count: panelCount,
          matrix_comparison_count: null
        });
      });

      [1, 4, 9].forEach((panelCount) => {
        conditions.push({
          dataset_id: dataset.dataset_id,
          target_node_count: dataset.target_node_count,
          node_count: dataset.node_count,
          data_file: dataset.data_file,
          meta_file: dataset.meta_file,
          filter_taxa: dataset.filter_taxa,
          mode: 'group',
          layout,
          panel_count: panelCount,
          matrix_comparison_count: null
        });
      });

      conditions.push({
        dataset_id: dataset.dataset_id,
        target_node_count: dataset.target_node_count,
        node_count: dataset.node_count,
        data_file: dataset.data_file,
        meta_file: dataset.meta_file,
        filter_taxa: dataset.filter_taxa,
        mode: 'comparison',
        layout,
        panel_count: 1,
        matrix_comparison_count: null
      });

      [
        { panel_count: 4, matrix_comparison_count: 1 },
        { panel_count: 9, matrix_comparison_count: 3 }
      ].forEach((matrixSpec) => {
        conditions.push({
          dataset_id: dataset.dataset_id,
          target_node_count: dataset.target_node_count,
          node_count: dataset.node_count,
          data_file: dataset.data_file,
          meta_file: dataset.meta_file,
          filter_taxa: dataset.filter_taxa,
          mode: 'matrix',
          layout,
          panel_count: matrixSpec.panel_count,
          matrix_comparison_count: matrixSpec.matrix_comparison_count
        });
      });
    });
  });

  return conditions;
}

function detectBrowserExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].filter(Boolean);

  const found = candidates.find((candidate) => fileExists(candidate));
  if (!found) {
    throw new Error('No Chromium-based browser executable was found. Set CHROME_BIN to continue.');
  }
  return found;
}

function buildEnvironmentSnapshot(executablePath, browserVersion, config, totalConditions) {
  const cpuInfo = os.cpus() || [];
  return {
    benchmark_started_at: coarsenIsoDate(new Date().toISOString()),
    browser_version: browserVersion,
    browser_family: 'chromium',
    headless: true,
    viewport: { width: 1600, height: 1200 },
    repeats: config.repeats,
    smoke: config.smoke,
    total_conditions: totalConditions,
    os: {
      family: normalizePlatformFamily(os.platform()),
      arch: os.arch()
    },
    cpu: {
      model: cpuInfo[0] ? cpuInfo[0].model : null,
      logical_cores: cpuInfo.length
    },
    ram_gb_approx: Math.round(os.totalmem() / (1024 ** 3))
  };
}

async function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function toRow(condition, runIndex, result, environment, fallbackMemoryMb) {
  return sanitizeResultRow({
    dataset_id: condition.dataset_id,
    node_count: condition.node_count,
    target_node_count: condition.target_node_count,
    panel_count: condition.panel_count,
    matrix_comparison_count: condition.matrix_comparison_count,
    mode: condition.mode,
    layout: condition.layout,
    run_index: runIndex,
    data_import_ms: result.data_import_ms,
    tree_build_ms: result.tree_build_ms,
    initial_render_ms: result.initial_render_ms,
    filter_update_ms: result.filter_update_ms,
    filter_kind: result.filter_kind,
    collapse_update_ms: result.collapse_update_ms,
    comparison_compute_ms: result.comparison_compute_ms,
    comparison_matrix_ms: result.comparison_matrix_ms,
    memory_mb: result.memory_mb != null ? result.memory_mb : fallbackMemoryMb,
    browser: environment.browser_version,
    os_family: environment.os.family,
    cpu_cores: environment.cpu.logical_cores,
    ram_gb_approx: environment.ram_gb_approx,
    viewport_width: environment.viewport && environment.viewport.width != null ? environment.viewport.width : null,
    viewport_height: environment.viewport && environment.viewport.height != null ? environment.viewport.height : null
  });
}

async function getFallbackMemoryMb(context, page) {
  try {
    const session = await context.newCDPSession(page);
    const heapUsage = await session.send('Runtime.getHeapUsage');
    if (heapUsage && Number.isFinite(heapUsage.usedSize)) {
      return formatNumber(heapUsage.usedSize / (1024 * 1024), 3);
    }
  } catch (_) {
    // Ignore CDP heap fallback failures.
  }
  return null;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  ensureDir(OUTPUTS_DIR);

  if (!fileExists(MANIFEST_PATH)) {
    throw new Error(`Missing ${path.relative(ROOT_DIR, MANIFEST_PATH)}. Run "npm run generate" first.`);
  }

  const manifest = readJson(MANIFEST_PATH);
  const allConditions = buildConditions(manifest);
  const conditions = config.smoke ? pickSmokeConditions(allConditions) : allConditions;
  if (conditions.length === 0) {
    throw new Error('No benchmark conditions were selected.');
  }

  const executablePath = detectBrowserExecutable();
  const serverInfo = await startStaticServer(ROOT_DIR);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  const environment = buildEnvironmentSnapshot(
    executablePath,
    browser.version(),
    config,
    conditions.length
  );
  fs.writeFileSync(ENVIRONMENT_PATH, `${JSON.stringify(environment, null, 2)}\n`, 'utf8');

  const rawResults = [];
  try {
    for (const condition of conditions) {
      const dataPath = path.join(BENCHMARK_DIR, condition.data_file);
      const metaPath = path.join(BENCHMARK_DIR, condition.meta_file);
      const dataText = await readText(dataPath);
      const metaText = await readText(metaPath);

      for (let runIndex = 1; runIndex <= config.repeats; runIndex += 1) {
        const context = await browser.newContext({
          viewport: { width: 1600, height: 1200 },
          serviceWorkers: 'block'
        });
        const page = await context.newPage();
        page.on('dialog', async (dialog) => {
          await dialog.dismiss();
        });
        await page.addInitScript((payload) => {
          window.MetaTreeBootstrap = payload;
        }, {
          dataText,
          dataLabel: `${condition.dataset_id}.data.tsv`,
          metaText,
          metaLabel: `${condition.dataset_id}.meta.tsv`
        });

        const url = `${serverInfo.origin}/index.html?benchmark=1`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(
          () => window.MetaTreeBenchmark && window.MetaTreeBenchmark.isReady(),
          null,
          { timeout: 60000 }
        );

        const result = await page.evaluate((pageCondition) => (
          window.MetaTreeBenchmark.runCondition(pageCondition)
        ), condition);

        const fallbackMemoryMb = result.memory_mb == null
          ? await getFallbackMemoryMb(context, page)
          : null;

        const row = toRow(condition, runIndex, result, environment, fallbackMemoryMb);
        rawResults.push(row);
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => serverInfo.server.close(resolve));
  }

  const rawJson = {
    generated_at: coarsenIsoDate(new Date().toISOString()),
    config: {
      repeats: config.repeats,
      smoke: config.smoke
    },
    environment: sanitizeEnvironment(environment),
    result_count: rawResults.length,
    results: rawResults
  };
  fs.writeFileSync(RAW_JSON_PATH, `${JSON.stringify(rawJson, null, 2)}\n`, 'utf8');

  writeCsv(RAW_CSV_PATH, rawResults, PUBLIC_RAW_RESULT_COLUMNS);

  console.log(
    `Completed ${rawResults.length} runs across ${conditions.length} conditions (${config.repeats} repeats).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
