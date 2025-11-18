# MetaTree

**MetaTree** is a modern, web-based platform for visualizing and comparing hierarchical data.  

By mapping quantitative values to **node size, color, and branch width**, MetaTree makes it easy to explore patterns and group differences across samples while preserving full hierarchical context.  

It features multiple comparison modes, flexible customization, and one-click export of publication-ready figures — all through a **no-code, browser-based interface** that runs entirely online.

Originally designed for microbiome and metaproteomics analysis, it supports **any tree-structured dataset** — taxonomic, Operational Taxon-Function (OTF), or user-defined.

![metatree_overview](./doc/images/metatree_overview.png)


---

## Key Features

### 1. Hierarchical group comparison as a first-class citizen

MetaTree is designed around **comparative visualization on trees**, not just single-condition heat trees.

Core capabilities:

- Map **group contrasts** (e.g. treatment vs control, responders vs non-responders, age groups) onto a shared hierarchy.
- Use **non-parametric comparisons** (e.g. Mann–Whitney–type / rank-based tests) implemented in JavaScript.
- Visual encodings:
  - **Diverging colors** for direction and magnitude of change.
  - **Node size** for abundance/support.
  - **Significance-aware styling** (grey-out or filter non-significant nodes).
- Multiple comparison layouts:
  - Single comparison tree.
  - Comparison grids / matrices.
  - Compact “packing” layout for dense global overviews.

### 2. Multiple visualization modes (no-code)

Switch between modes directly in the UI:

- **Individual mode**  
  Heat-tree matrices: one panel per sample, shared legend, synchronized zoom.

- **Group / aggregated mode**  
  Automatically aggregate samples into groups (from metadata or manual selection) and plot one tree per group.

- **Two-group comparison mode**  
  Compare any two user-defined groups on the same hierarchy with effect size and p/q-value driven color/size.

All modes share:

- Global or mode-specific color scales.
- Shared legend with automatic domain detection.
- Synchronized pan/zoom (optional) across panels.

### 3. Flexible input formats

MetaTree supports both **wide** and **long/combined** formats commonly used in microbiome, metagenomics, and metaproteomics.

#### Hierarchical abundance tables (wide)

Typical use: taxonomic or taxa–function abundances.

- Format: TSV/CSV
- 1st column: hierarchical identifier (e.g. `Taxon`), using a rank separator:
  - e.g. `d__Bacteria|p__Firmicutes|...|s__Lactobacillus_casei`
  - Separator configurable in UI: `|`, `;`, `,`, or custom.
- Remaining columns: numeric values per sample.

MetaTree:

- Parses the hierarchy into a tree.
- Detects sample columns automatically.
- Allows transform (none/log/log2/sqrt/area) and quantile clipping.

#### Differential / statistics tables (combined long)

MetaTree can ingest **combined long-format** result tables (e.g. DE outputs) and map them to nodes for coloring and filtering.

Supported schema (auto-detected by column names):

- `Item_ID` – feature ID matching hierarchical nodes (taxon or taxa–function).
- `condition` – contrast label (e.g. `"TreatmentA_vs_Control"`).
- `log2FoldChange`
- `padj`
- `pvalue`

From this, MetaTree:

- Links statistics back to the hierarchy.
- Provides:
  - Diverging color maps for log2FC/effect sizes.
  - Significance thresholds based on `padj`/`pvalue`.
  - Exportable comparison result tables from the browser.

#### Metadata table

For grouping and filtering:

- Required column: `Sample` (matching data table headers).
- Additional columns: arbitrary (e.g. `Group`, `Age`, `Treatment`, etc.).

Used to:

- Filter samples.
- Define groups for aggregation.
- Build group comparisons without editing code.

### 4. Rich customization options

MetaTree exposes many options via UI controls:

- **Layouts**: radial tree, traditional tree, packing layout (for dense comparison).
- **Color schemes**:
  - Sequential & diverging palettes.
  - Custom color stops for user-defined gradients.
  - Global or mode-specific domains.
- **Transforms & scaling**:
  - Abundance/value transforms (none / log2 / sqrt / area).
  - Quantile-based trimming to reduce outlier impact.
- **Label control**:
  - Toggle internal / leaf labels.
  - Automatic safeguards for large trees.
  - Unified label color options.
- **Filtering**:
  - Taxon include/exclude filters by name/path.
  - Significance-based node filtering / grey-out.
- **Multi-panel layout**:
  - Control rows, columns, panel width/height.
  - Synchronized zoom and lazy rendering for large matrices.

All options are accessible through the graphical interface; no scripting required.

### 5. In-browser export for publication

MetaTree provides high-quality export tools:

- **SVG export**:
  - Vector graphics suitable for journals.
  - Preserves text and structure for further editing.
- **PNG export**:
  - High-resolution raster images.
  - Handles full multi-panel layouts and legends.


---

## How to Use

### Online (recommended)

Simply open the link MetaTree page in browser:

[MetaTree Online](https://byemaxx.github.io/MetaTree/)

Then:

1. **Upload** your data table(s) and optional metadata/statistics files.

2. **Configure** visualization options:

   - Taxa separator, delimiters, transforms.

   - Group definitions and comparison mode.

   - Color scales, filtering, and layout.
3. **Explore** the interactive trees and comparison panels.

4. **Export** SVG/PNG for use in presentations and publications.

### Local (optional)

If you prefer to run your own copy:

- Clone/download this repository.

+ Open index.html in a modern browser via a static server (or your own hosting).

- Use MetaTree as above. No additional build step is required.

## Programmatic integration (MetaX, PyQt, notebooks, etc.)

MetaTree now exposes a small, stable API so that external tools can preload data without manual uploads.

### Lifecycle events

- `metatree:ready` is dispatched on `window` once the UI is initialized. Listen to this event to know when it is safe to call the APIs below.
- `metatree:data-loaded` and `metatree:meta-loaded` fire after successful programmatic uploads. Their `detail` payload includes the label used, plus counts that can be used for logging.

### Loading data/metadata from memory

```js
window.loadDataFromText(tsvString, { label: 'MetaX data' });
window.loadMetaFromText(metaTsvString, { label: 'MetaX meta' });
```

- `tsvString` / `metaTsvString` must match the same TSV schema that the upload buttons expect (wide hierarchy tables, combined long-format tables, and metadata with a `Sample` column).
- Both helpers return the parsed object and throw an error if the payload is invalid, so surrounding code can show a custom message or retry.

### Bootstrapping without custom JavaScript

If you cannot easily listen for events (e.g., when launching MetaTree inside another app), set a bootstrap payload before the page finishes loading:

```html
<script>
  window.MetaTreeBootstrap = {
    dataText: 'Taxon\tSample_A\tSample_B\n...',
    dataLabel: 'Injected data',
    metaText: 'Sample\tGroup\n...',
    metaLabel: 'Injected meta'
  };
</script>
```

MetaTree will automatically call `loadDataFromText`/`loadMetaFromText` as soon as the interface is ready.

### Example: feeding pandas DataFrames from MetaX / PyQt5

```python
import json

def df_to_tsv(df):
    return df.to_csv(sep='\t', index=False)

data_tsv = df_to_tsv(hierarchy_df)
meta_tsv = df_to_tsv(meta_df)

js = f"""
    window.loadDataFromText({json.dumps(data_tsv)}, {{ label: 'MetaX data' }});
    window.loadMetaFromText({json.dumps(meta_tsv)}, {{ label: 'MetaX meta' }});
"""
webview.page().runJavaScript(js)
```

- Convert the pandas `DataFrame` objects into TSV strings using the same columns you would export for manual uploads.
- Wait for your `QWebEngineView`/`QWebView` to report that the page has finished loading, then run the JavaScript snippet above.
- Any other desktop or notebook environment can follow the same pattern (serialize → inject → call the global helpers).
