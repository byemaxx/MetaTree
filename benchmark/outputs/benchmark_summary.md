# MetaTree Benchmark Summary

## Benchmark design

The automated workflow benchmarked browser-side performance for 72 unique conditions covering comparison, group, matrix, single modes. The tested hierarchy sizes were 500, 2000, 5000, 10000 nodes, with dendrogram and radial layouts. Single-sample and group views were benchmarked with 1, 4, and 9 panels; pairwise comparison used one tree; matrix view used 2 groups (one pairwise cell, recorded as panel_count 4) and 3 groups (three pairwise cells, recorded as panel_count 9). Each condition was repeated 5 times.

## Environment

Browser: chromium 147.0.7727.101

OS: Windows (x64)

CPU: 13th Gen Intel(R) Core(TM) i9-13900H (20 logical cores)

RAM: approximately 32 GB

## Validation checks

Expected rows: 360

Observed rows: 360

Matrix rows include panel_count and matrix_comparison_count: yes

## Key results

- Across all conditions, median initial render times ranged from 20.7 ms to 2728.6 ms.
- Median filter-update times ranged from 8.6 ms to 1351.0 ms.
- Median post-render JavaScript heap usage ranged from 4.9 MB to 104.4 MB.
- Collapse/expand timing is reported for single, group, and pairwise comparison views; it is not applicable to the matrix view.
- Matrix render timing is reported separately from pairwise comparison computation so delayed cell drawing is not conflated with statistical calculation.

| Mode | Initial render median range | Filter update median range | Collapse update median range | Memory median range |
| --- | --- | --- | --- | --- |
| single | 20.7 ms to 2725.6 ms | 9.3 ms to 536.0 ms | 8.3 ms to 134.5 ms | 4.9 MB to 88.5 MB |
| group | 22.2 ms to 2728.6 ms | 9.6 ms to 532.1 ms | 8.1 ms to 161.5 ms | 6.0 MB to 104.4 MB |
| comparison | 139.1 ms to 579.3 ms | 8.6 ms to 49.2 ms | 8.1 ms to 44.4 ms | 6.4 MB to 53.4 MB |
| matrix | 237.4 ms to 1704.9 ms | 134.8 ms to 1351.0 ms | NA | 6.1 MB to 58.9 MB |

| Mode | Layout | Largest-node condition | Initial render median (IQR) | Filter median (IQR) | Matrix render median (IQR) | Memory median (IQR) |
| --- | --- | --- | --- | --- | --- | --- |
| matrix | dendrogram | 10000 nodes, 3 groups / 3 comparisons | 1704.9 ms (15.3 ms) | 1351.0 ms (12.7 ms) | 1450.3 ms (20.3 ms) | 58.7 MB (0.0 MB) |
| matrix | radial | 10000 nodes, 3 groups / 3 comparisons | 1703.2 ms (19.9 ms) | 1345.9 ms (6.3 ms) | 1445.5 ms (13.6 ms) | 58.9 MB (0.2 MB) |
| group | dendrogram | 10000 nodes, 9 panels | 2198.5 ms (88.9 ms) | 430.2 ms (15.8 ms) | NA (NA) | 104.4 MB (0.0 MB) |
| group | radial | 10000 nodes, 9 panels | 2728.6 ms (69.2 ms) | 532.1 ms (48.4 ms) | NA (NA) | 100.9 MB (0.2 MB) |
| single | dendrogram | 10000 nodes, 9 panels | 2359.0 ms (210.2 ms) | 536.0 ms (159.1 ms) | NA (NA) | 88.5 MB (0.1 MB) |
| single | radial | 10000 nodes, 9 panels | 2725.6 ms (68.9 ms) | 479.3 ms (30.6 ms) | NA (NA) | 85.1 MB (0.1 MB) |
| comparison | dendrogram | 10000 nodes, 1 tree | 498.5 ms (13.5 ms) | 49.2 ms (5.3 ms) | NA (NA) | 53.4 MB (0.1 MB) |
| comparison | radial | 10000 nodes, 1 tree | 579.3 ms (3.7 ms) | 46.7 ms (1.6 ms) | NA (NA) | 53.1 MB (0.1 MB) |

## Limitations

- The benchmark reflects one browser, viewport, and hardware environment, so the numerical values should be interpreted as reproducible reference measurements rather than universal performance guarantees.
- JavaScript heap usage was measured after the initial render and reflects browser heap use rather than total system memory consumption.
- Interaction timings are based on deterministic scripted actions. They are informative for relative scalability trends, but they do not replace task-based usability studies with human participants.
- The matrix benchmark includes the application's staged mini-tree rendering, which is appropriate for end-user wait time but will be slower than the underlying comparison computation alone.
