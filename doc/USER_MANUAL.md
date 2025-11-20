# MetaTree User Manual

## 1. Introduction

**MetaTree** is a modern, web-based platform designed for the visualization and comparison of hierarchical data. While originally tailored for microbiome and metaproteomics analysis, it is versatile enough to handle any tree-structured dataset, such as taxonomic classifications or custom organizational hierarchies.

MetaTree runs entirely in your browser, ensuring that your data remains local and secure. It offers a no-code interface to explore patterns, compare groups, and generate publication-ready figures.

### Key Features
*   **Hierarchical Comparison**: Map group contrasts (e.g., Treatment vs. Control) directly onto a tree.
*   **Multiple Modes**: Switch between individual sample views, aggregated group views, and direct group comparisons.
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

*   **Item_ID**: Must match a hierarchy node (taxon or taxa-function).
*   **condition**: Labels distinguish contrasts (e.g., "Treat_vs_Ctrl").
*   **log2FoldChange**, **pvalue**, **padj**: Drive coloring and significance filtering.
*   Load the wide table, the long-format table, or both depending on your workflow.

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
*   **Data & Metadata**: Upload files and configure parsing options (delimiters).
*   **Analysis Mode**: Switch between Single, Group, and Comparison modes.
*   **Layout & Panels**: Adjust tree layout (Radial, Linear, Packing) and panel dimensions.
*   **Colors & Domain**: Customize color schemes and value ranges.
*   **Labels & Sizing**: Control text labels, node sizes, and edge widths.
*   **UI Theme**: Change the application's color theme.

---

## 5. Using MetaTree

### Step 1: Loading Data
1.  Go to the **Data & Metadata** panel.
2.  Click **Load Data File** and select your abundance or statistics table.
3.  (Optional) Click **Load Meta File** to upload sample metadata.
4.  If your file uses a custom delimiter (not tab or comma), expand **Load parameters** to specify it.

### Step 2: Choosing a Visualization Mode
Navigate to the **Analysis Mode** panel and select a mode:

#### Individual Mode
*   **Description**: Shows one tree per sample.
*   **Use Case**: Inspecting individual sample profiles.
*   **Controls**:
    *   **Transform**: Apply `log2`, `sqrt`, or `area` transforms to handle large value ranges.
    *   **Quantile range**: Filter out extreme outliers.

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
    4.  Click **Run comparison**.
*   **Significance Filtering**:
    *   Enable **Filter by significance** to hide non-significant nodes.
    *   Adjust **P-value**, **Q-value**, and **|Log2FC|** thresholds.

### Step 3: Customizing the Visualization

#### Layouts
In the **Layout & Panels** section:
*   **Radial**: Circular tree (good for large hierarchies).
*   **Tree**: Traditional linear dendrogram.
*   **Circle Packing**: Nested circles (good for overviewing abundance).

#### Colors
In the **Colors & Domain** section:
*   **Color Scheme**: Choose from preset diverging (for comparisons) or sequential (for abundance) palettes.
*   **Custom Gradient**: Define your own start, middle, and end colors.
*   **Color Domain**: Manually set the value range (e.g., set to `5` to make the color scale go from -5 to +5).

#### Labels & Nodes
In the **Labels & Sizing** section:
*   **Amount**: Slider to show more or fewer labels.
*   **Levels**: Click specific numbers to show labels only at certain depths (e.g., `0` for leaves, `1` for genus).
*   **Node Size**: Adjust the base size of nodes.
*   **Uniform label colors**: Check this to color labels the same as their nodes.

### Step 4: Exporting
*   **Export Results**: In Comparison mode, use the **Export results** button to download the statistical table.
*   **Save Image**: Use the browser's print function or look for specific export buttons (if available in the specific view) to save the visualization. *Note: The README mentions SVG/PNG export; typically this is found near the visualization or in the main controls.*

---

## 6. Advanced Features

### Programmatic Integration (Python, notebooks, etc.)

MetaTree exposes a small, stable API so that external tools can preload data without manual uploads.

#### Lifecycle events

- `metatree:ready` is dispatched on `window` once the UI is initialized. Listen to this event to know when it is safe to call the APIs below.
- `metatree:data-loaded` and `metatree:meta-loaded` fire after successful programmatic uploads. Their `detail` payload includes the label used, plus counts that can be used for logging.

#### Loading data/metadata from memory

```js
window.loadDataFromText(tsvString, { label: 'MetaX data' });
window.loadMetaFromText(metaTsvString, { label: 'MetaX meta' });
```

- `tsvString` / `metaTsvString` must match the same TSV schema that the upload buttons expect (wide hierarchy tables, combined long-format tables, and metadata with a `Sample` column).
- Both helpers return the parsed object and throw an error if the payload is invalid, so surrounding code can show a custom message or retry.

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
Before any test, samples are filtered based on the **Min Abundance** threshold.
- If a sample's value for a specific node is below the threshold, it is excluded from the calculation for that node.
- If fewer than 2 samples remain in either group after filtering, the statistical test is skipped.

### 7.2. Hypothesis Testing
MetaTree supports two options for testing differences between two independent groups:

- **Wilcoxon Rank Sum Test (Mann–Whitney U test)** (default): a non-parametric test that compares distributions without assuming normality.
- **Two-sample T-test (Welch)**: an option that assumes approximately normally distributed data but does not assume equal variances between groups. Select the test in the Comparison panel under "Test:".

-   **Exact Method (Combined observations ≤ 12)**: When the total number of observations across both groups is small, MetaTree computes the **exact p-value** by enumerating all possible group label assignments and calculating the exact distribution of the U statistic.

-   **Normal Approximation (Combined observations > 12)**: For larger datasets, MetaTree applies the **normal approximation** to the Mann–Whitney U distribution. Included steps are:
      - computing the U statistic
      - applying tie correction
      - applying continuity correction
      - converting U to a Z-score
      - obtaining the p-value from the standard normal distribution.

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
