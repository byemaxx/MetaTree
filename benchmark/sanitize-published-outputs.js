const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  coarsenIsoDate,
  PUBLIC_RAW_RESULT_COLUMNS,
  sanitizeEnvironment,
  sanitizeResultRow
} = require('./public-output-utils');

const OUTPUTS_DIR = path.join(__dirname, 'outputs');
const RAW_JSON_PATH = path.join(OUTPUTS_DIR, 'raw_results.json');
const RAW_CSV_PATH = path.join(OUTPUTS_DIR, 'raw_results.csv');
const ENVIRONMENT_PATH = path.join(OUTPUTS_DIR, 'environment.json');

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

function main() {
  const raw = JSON.parse(fs.readFileSync(RAW_JSON_PATH, 'utf8'));
  const environment = fs.existsSync(ENVIRONMENT_PATH)
    ? JSON.parse(fs.readFileSync(ENVIRONMENT_PATH, 'utf8'))
    : (raw.environment || {});

  const sanitizedEnvironment = sanitizeEnvironment(environment);
  if (!sanitizedEnvironment.cpu.model) {
    const cpuInfo = os.cpus && os.cpus();
    const currentModel = Array.isArray(cpuInfo) && cpuInfo[0] ? cpuInfo[0].model : null;
    if (currentModel) {
      sanitizedEnvironment.cpu.model = currentModel;
    }
  }
  const sanitizedResults = Array.isArray(raw.results)
    ? raw.results.map((row) => sanitizeResultRow(row))
    : [];

  const sanitizedPayload = {
    generated_at: coarsenIsoDate(raw.generated_at || new Date().toISOString()),
    config: {
      repeats: raw.config && raw.config.repeats != null ? raw.config.repeats : null,
      smoke: !!(raw.config && raw.config.smoke)
    },
    environment: sanitizedEnvironment,
    result_count: sanitizedResults.length,
    results: sanitizedResults
  };

  fs.writeFileSync(ENVIRONMENT_PATH, `${JSON.stringify(sanitizedEnvironment, null, 2)}\n`, 'utf8');
  fs.writeFileSync(RAW_JSON_PATH, `${JSON.stringify(sanitizedPayload, null, 2)}\n`, 'utf8');
  writeCsv(RAW_CSV_PATH, sanitizedResults, PUBLIC_RAW_RESULT_COLUMNS);

  console.log(`Sanitized ${sanitizedResults.length} benchmark result rows for public release.`);
}

main();
