# Reproducing The Benchmark

This document contains the practical setup and rerun instructions for the MetaTree browser benchmark workflow.

## Requirements

- Node.js `22+`
- `npm`
- A local Chromium-based browser
  - The runner checks Chrome first, then Edge.

## Install

Run once inside `benchmark/`:

```bash
npm install
```

## Commands

Generate deterministic benchmark datasets:

```bash
npm run generate
```

Run the full benchmark:

```bash
npm run run
```

Run a smoke benchmark with one condition per mode:

```bash
npm run smoke
```

Analyze raw benchmark output and regenerate summary tables, plots, and markdown:

```bash
npm run analyze
```

Rewrite existing outputs into the public, sanitized release form:

```bash
npm run sanitize-public
```

Run the full pipeline:

```bash
npm run benchmark
```

## Workflow notes

- The main app is only modified to load the benchmark bridge when `?benchmark=1` is present.
- Benchmark behavior is isolated in `browser/benchmark-bridge.js`.
- The runner bootstraps datasets directly into the page with `window.MetaTreeBootstrap`.
- In the manuscript-facing outputs, MetaTree's internal `tree` layout is reported as `dendrogram`.
- Memory values correspond to browser JavaScript heap usage after initial render, not total system memory usage.

## Output locations

Committed benchmark outputs:

- `outputs/raw_results.json`
- `outputs/raw_results.csv`
- `outputs/environment.json`
- `outputs/summary.csv`
- `outputs/benchmark_summary.md`
- `outputs/*.svg`

Ignored rerun artifacts:

- `generated/`
- `node_modules/`
