# MetaTree User Manual

## 1. Introduction

**MetaTree** is a modern, web-based platform designed for the visualization and comparison of hierarchical data. While originally tailored for microbiome and metaproteomics analysis, it is versatile enough to handle any tree-structured dataset, such as taxonomic classifications or custom organizational hierarchies.

MetaTree runs entirely in your browser, ensuring that your data remains local and secure. It offers a no-code interface to explore patterns, compare groups, and generate publication-ready figures.

### Key Features
*   **Hierarchical Comparison**: Map group contrasts (e.g., Treatment vs. Control) directly onto a tree.
*   **Multiple Modes**: Switch between individual sample views, aggregated group views, pairwise group comparisons, and full comparison matrix views.
*   **Flexible Input**: Supports both wide (abundance tables) and long (statistical results) formats.
*   **Rich Customization**: Control colors, node sizes, layouts, and labels with ease.
*   **High-Quality Export**: Download results as SVG (vector) or PNG (raster) images.

---

## 2. Getting Started

### System Requirements
MetaTree is a web application that runs in any modern web browser (Chrome, Firefox, Edge, Safari). No installation is required.

### Accessing MetaTree
*   **Online**: Visit [MetaTree Online](https://byemaxx.github.io/MetaTree/).
*   **Local**: You can download the source code and run it locally.
    *   **Recommended**: Use a local web server (e.g., `python -m http.server` or `npx serve`) to ensure full functionality, including image export.
    *   **Direct Open**: You can also open `index.html` directly, but **Image Export** may fail due to browser security restrictions.

---

## 3. Data Preparation

MetaTree accepts data in **TSV (Tab-Separated Values)** or **CSV (Comma-Separated Values)** formats.

### Supported Formats

#### A. Hierarchical Abundance Table (Wide Format)
Best for raw abundance data (e.g., OTU tables).

| Taxon | Sample_A | Sample_B |
| :--- | :--- | :--- |
| k__Bacteria\|p__Firmicutes\|c__Bacilli | 123.4 | 98.1 |
| k__Bacteria\|p__Bacteroidota\|c__Bacteroidia | 56.0 | 44.2 |

*   **Column 1**: The hierarchy path (e.g., `d__Bacteria|p__Firmicutes...`). Separator defaults to `|` and can be edited via "Taxa rank separator".
*   **Remaining columns**: Numeric values for each sample or condition.
*   **Switch between tab, comma, or custom delimiters** inside "Load parameters".

#### B. Statistics Table (Long/Combined Format)
Best for pre-calculated statistical results (e.g., DESeq2 output).

| Item_ID | condition | log2FoldChange | pvalue | padj |
| :--- | :--- | :--- | :--- | :--- |
| d__Archaea\|p__Methanobacteriota\|... | Control_vs_Group_A | 1.37 | 0.0004 | 0.002 |
| d__Bacteria\|p__Actinobacteriota\|... | Control_vs_Group_B | -0.85 | 0.013 | 0.040 |

*   **Format Flexibility**:
    *   **Wide Table**: Standard abundance matrix (Taxon rows x Sample columns).
    *   **Long Table**: List of statistical results (one row per feature per comparison).
*   **Column Mapping**: When loading a Long Format table, a **Column Mapping Modal** will appear, allowing you to manually map your file's columns to the required fields (`Taxon`, `Condition`, `Value`, `P-value`, `Q-value`). This means your column headers do not need to match specific hardcoded names.

> **Tip**: Use the “Load Example” button to inspect a working template before uploading your own file.

#### C. Metadata Table
Used to group samples.

| Sample | Group | Treatment | Sex |
| :--- | :--- | :--- | :--- |
| Sample_A | Control | Placebo | Male |
| Sample_B | Treatment | DrugX | Female |

*   **Sample**: Must match headers from the data table (case-sensitive).
*   **Other Columns**: Any grouping variables (e.g., Group, Timepoint).
*   Mix categorical and numeric fields as needed for grouping or filtering.

> **Tip**: Use the same delimiter choice as the data file so both uploads can be parsed consistently.

---

## 4. Interface Overview

The interface is divided into two main areas:
1.  **Sidebar (Left)**: Contains all controls for loading data, changing modes, and customizing the view.
2.  **Main View (Right)**: Displays the interactive visualizations.

### Sidebar Sections
*   **Data & Metadata**: Upload files, configure parsing options, handle duplicate IDs, and apply metadata/taxon filters.
*   **Analysis Mode**: Switch between Sample View, Group View, Pairwise Diff, and Diff Matrix modes.
*   **Layout & Panels**: Adjust tree layout (Radial, Tree, Circle packing) and panel dimensions.
*   **Colors & Domain**: Customize color schemes and value ranges.
*   **Labels & Sizing**: Control text labels, node sizes, and edge widths.
*   **UI Theme**: Change the application's color theme.

---

## 5. Using MetaTree

 ### Step 1: Loading Data
1.  Go to the **Data & Metadata** panel.
2.  **Select Data Format**:
    *   **Wide Table (Standard)**: For standard abundance matrices.
    *   **Long Table (Diff. Test)**: For statistical results (e.g., from DESeq2).
3.  Click **Load Data File** and select your file.
    *   **For Long Tables**: A **Column Mapping Modal** will appear. Select the columns from your file that correspond to *Taxon ID*, *Condition*, *Value* (e.g., Log2FC), *P-value*, and *Q-value*.
4.  (Optional) Click **Load Meta File** to upload sample metadata.
5.  If your file uses a custom delimiter (not tab or comma), expand **Load parameters** to specify it.
6.  (Optional) Configure advanced loading/filtering controls:
    *   **Duplicate ID handling**: choose how rows with the same ID are merged (`Sum`, `Mean`, `Max`, `Min`, `First`).
    *   **Filter samples by meta**: keep only samples matching selected metadata values.
    *   **Filter items by name**: build include/exclude lists using keyword or regex matching.

### Step 2: Choosing a Visualization Mode
Navigate to the **Analysis Mode** panel and select a mode:

#### Individual Mode
*   **Description**: Shows one tree per sample.
*   **Use Case**: Inspecting individual sample profiles.
*   **Controls**:
    *   **Transform**: Apply `log2`, `sqrt`, or `area` transforms to handle large value ranges.
    *   **Quantile range**: Filter out extreme outliers.
    *   **Long-format significance filter**: for combined long tables, optionally filter by `P-value`, `Q-value`, and `|Log2FC|`.

#### Group Mode
*   **Description**: Aggregates samples into groups and shows one tree per group.
*   **Use Case**: Viewing average profiles for "Control" vs "Treatment".
*   **Setup**:
    *   Use **Auto-group by meta** to select a metadata column (e.g., "Group").
    *   Or manually **Define groups** by selecting specific samples.
    *   Choose aggregation method: `Mean`, `Median`, or `Sum`.

#### Comparison Mode
*   **Description**: Compares two groups directly on a single tree.
*   **Use Case**: Identifying statistically significant differences.
*   **Setup**:
    1.  Define your groups (via metadata or manually).
    2.  Select **Group 1** (Baseline) and **Group 2** (Comparison).
    3.  Choose a **Metric** (e.g., Log2 fold change).
    4.  (Optional) Choose a statistical **Test** (`Wilcoxon Rank Sum` or `T-test (Welch)`).
    5.  Click **Run comparison**.
    6.  (Optional) Enable **Non-zero only (base tree)** to construct the base tree only from currently displayed non-zero branches.
*   **Significance Filtering**:
    *   Enable **Filter by significance** to hide non-significant nodes.
    *   Adjust **P-value**, **Q-value**, and **|Log2FC|** thresholds.

#### Diff Matrix Mode
*   **Description**: Computes all pairwise comparisons among selected groups and displays them as a matrix.
*   **Use Case**: Quickly screening many group-vs-group differences in one run.
*   **Setup**:
    1.  Define groups (via metadata or manually).
    2.  In the group list, select at least two groups using the checkboxes (`All`, `None`, and `Invert` shortcuts are available).
    3.  Choose **Metric** and **Test**.
    4.  Click **Run comparison** to generate the matrix.

### Step 3: Customizing the Visualization

#### Layouts
In the **Layout & Panels** section:

*   **Radial**: Circular tree (good for large hierarchies).
    *   **Link Shape**: Choose between *Curved* (smooth arcs), *Straight* (direct lines), or *Step* (orthogonal/right-angled paths).
    *   **Align Leaves**: Align all leaf nodes to the outer edge (dendrogram style).
    *   **Tree Spread**: Slider to adjust the overall size and node separation.
    *   **Sort Nodes**: Sort branches by *Value* (Ascending/Descending) or *Name*.
*   **Tree**: Traditional linear dendrogram.
    *   **Direction**: Switch between *Horizontal* (Left-to-Right) and *Vertical* (Top-to-Bottom).
    *   **Link Shape**: Choose between *Curved*, *Straight*, or *Step*.
    *   **Align Leaves**: Align leaf nodes to the far end of the tree.
    *   **Tree Spread**: Slider to adjust the tree height/width.
    *   **Sort Nodes**: Sort branches by *Value* or *Name*.
*   **Circle Packing**: Nested circles (good for overviewing abundance).
*   **Panel sizing**: Adjust panel width/height and optionally lock both values for consistent multi-panel layouts.

#### Colors
In the **Colors & Domain** section:
*   **Color Scheme**: Choose from preset diverging (for comparisons) or sequential (for abundance) palettes.
*   **Custom Gradient**: Define your own start, middle, and end colors.
*   **Reverse colors**: Invert the selected palette direction.
*   **Zero value color**: Optionally assign a dedicated color for zero-abundance/zero-effect nodes.
*   **Color Domain**: Manually set the value range (e.g., set to `5` to make the color scale go from -5 to +5).

#### Labels & Nodes
In the **Labels & Sizing** section:
*   **Amount**: Slider to show more or fewer labels.
*   **Levels**: Click specific numbers to show labels only at certain depths (e.g., `0` for leaves, `1` for genus).
*   **Node Size**: Adjust the base size of nodes.
*   **Font / Max length / Overflow**: Control label readability (`Ellipsis` or `Wrap` behavior).
*   **Auto-hide overlapping labels**: Enable smart label culling and adjust culling strength.
*   **Uniform label colors**: Check this to color labels the same as their nodes.

#### UI Theme
In the **UI Theme** section:
*   **Preset themes**: Click a theme chip to apply a built-in theme.
    *   **Classical**: white panel headers, black text, and stronger borders for a publication-style look.
    *   **Void**: minimal framing and reduced shadows (tree panel header borders are hidden by default).
    *   And more...
*   **Custom palette**: Adjust individual colors and click **Apply custom colors**.
    *   **Header border** controls the border line around each tree panel header. If you keep it equal to **Header** (background), the border is effectively invisible.

### Step 4: Exporting
*   **Export Statistical Results**: In Pairwise Diff or Diff Matrix mode, click **View results**. In the results modal, export the selected comparison as **TSV** or **CSV**.
*   **Export Figures (SVG/PNG)**: Right-click inside a tree panel or visualization area to open the export menu. You can export the **current panel** or **all panels** as SVG/PNG.
*   **Mode note**: Figure export is primarily intended for Sample View, Group View, and Diff Matrix layouts. Pairwise Diff still supports panel-level export from the context menu.

---

## 6. Advanced Features

### Programmatic Integration (Python, notebooks, etc.)

MetaTree exposes a small, stable API so that external tools can preload data without manual uploads.

#### Lifecycle events

- `metatree:ready` is dispatched on `window` once the UI is initialized. Listen to this event to know when it is safe to call the APIs below.
- `metatree:data-loaded` and `metatree:meta-loaded` fire after successful programmatic uploads.
  - `metatree:data-loaded.detail` includes: `label`, `sampleCount`, `isCombinedLong`.
  - `metatree:meta-loaded.detail` includes: `label`, `columnCount`.

#### Loading data/metadata from memory

```js
window.loadDataFromText(tsvString, { label: 'MetaX data' });
window.loadMetaFromText(metaTsvString, { label: 'MetaX meta' });
```

- `tsvString` / `metaTsvString` must match the same TSV schema that the upload buttons expect (wide hierarchy tables, combined long-format tables, and metadata with a `Sample` column).
- Both helpers return the parsed object and throw an error if the payload is invalid, so surrounding code can show a custom message or retry.
- `loadDataFromText` also supports optional parsing hints:
  - `format`: `'wide'` or `'long'`.
  - `mapping`: object used for long-format column mapping (`taxon`, `condition`, `value`, and optional `pvalue`/`qvalue`).

#### Bootstrapping without custom JavaScript

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
- The bootstrap object is accepted as either `window.MetaTreeBootstrap` or `window.metaTreeBootstrap`.

#### Example: feeding pandas DataFrames from Python

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

---

## 7. Statistical Methods

MetaTree performs all statistical calculations client-side using JavaScript. These methods are specifically used in **Comparison Mode** to evaluate differences between two defined groups.

### 7.1. Pre-processing
In the current UI workflow, comparisons run with the minimum-abundance cutoff set to `0` (no additional pre-filtering by abundance threshold).
- For each node, tests are only performed when both groups have at least 2 valid observations.
- If either group has fewer than 2 valid observations for a node, the test is skipped for that node.

### 7.2. Hypothesis Testing
MetaTree supports two options for testing differences between two independent groups:

- **Wilcoxon Rank Sum Test (Mann–Whitney U test)** (default): a non-parametric test that compares distributions without assuming normality.

    -   **Exact Method (Combined observations ≤ 12)**: When the total number of observations across both groups is small, MetaTree computes the **exact p-value** by enumerating all possible group label assignments and calculating the exact distribution of the U statistic.

    -   **Normal Approximation (Combined observations > 12)**: For larger datasets, MetaTree applies the **normal approximation** to the Mann–Whitney U distribution. Included steps are:
        - computing the U statistic
        - applying tie correction
        - applying continuity correction
        - converting U to a Z-score
        - obtaining the p-value from the standard normal distribution.
  
- **T-test (Welch)**: an option that assumes approximately normally distributed data but does not assume equal variances between groups. Select the test in the Comparison panel under "Test:".

### 7.3. Effect Size
**Cohen's d** is calculated to quantify the magnitude of the difference. It represents the standardized difference between the two group means, using a pooled standard deviation that accounts for the sample sizes and variances of both groups.

### 7.4. Multiple Testing Correction
To control the False Discovery Rate (FDR), raw p-values are adjusted using the **Benjamini-Hochberg (BH)** procedure. This method sorts the p-values and adjusts them based on their rank and the total number of tests, ensuring that the proportion of false positives among the significant results is controlled.

### 7.5. Fold Change Metrics
- **Log2 Median Ratio**: Logarithm (base 2) of the ratio between the group medians.
- **Log2 Mean Ratio**: Logarithm (base 2) of the ratio between the group means.
- **Difference**: Simple subtraction of the group medians or means.

*Note: A small pseudo-count is added to values to avoid division by zero or undefined logarithms.*

---

## 8. Troubleshooting

*   **File not loading?**
    *   Check your delimiters. If using a CSV, make sure "Comma" is selected in **Load parameters**.
    *   Ensure your hierarchy uses a consistent separator (e.g., `|`).
*   **No groups appearing?**
    *   Ensure you have loaded a Metadata file.
    *   Check that the `Sample` column in metadata matches the column headers in your data file exactly.
*   **Visualization is too crowded?**
    *   Try the **Radial** layout.
    *   Reduce **Label Amount**.
    *   Use **Quantile range** to hide low-abundance noise.
