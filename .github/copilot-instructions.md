# MetaTree AI Coding Instructions

You are working on **MetaTree**, a client-side web application for hierarchical data visualization using D3.js.

## 🏗 Architecture & Core Concepts

- **Stack**: Vanilla JavaScript (ES6+), D3.js v7, HTML5, CSS3.
- **No Build Step**: The project runs directly in the browser. Do not suggest `npm install`, `webpack`, or build scripts.
- **Entry Point**: `index.html` loads all dependencies and core scripts.
- **Module System**:
  - Uses a mix of **Global Variables** (defined in `js/core/app-core.js`) and **IIFE** (Immediately Invoked Function Expressions) for encapsulation.
  - **Core State**: `treeData`, `selectedSamples`, `colorScheme` are globals in `app-core.js`.
  - **Renderer State**: Managed via `js/state/comparison-renderer-store.js` (singleton pattern).

## 📂 File Structure & Responsibilities

- **`js/core/`**: Application lifecycle, global state, and UI event handlers.
  - `app-core.js`: Main entry, global variable definitions, data parsing.
- **`js/renderers/`**: D3.js visualization logic.
  - `comparison-renderer.js`: Logic for two-group comparison views.
- **`js/state/`**: State management stores.
- **`js/analysis/`**: Data processing and statistical logic (e.g., `group-comparison.js`).
- **`css/`**: `style.css` (layout) and `comparison.css` (visualization specific).

## 💻 Development Workflows

- **Running the App**:
  - Use a local server to avoid CORS/file protocol issues: `python -m http.server` or `npx serve .`.
  - Open `http://localhost:8000` in the browser.
- **Testing**:
  - Manual testing using files in `test/data/`.
  - No automated test suite exists currently.

## 🧩 Coding Conventions

- **Global Scope**: Be cautious when modifying `js/core/app-core.js`. Many other files depend on the globals defined there.
- **D3 Patterns**:
  - Use D3 v7 syntax (e.g., `d3.select`, `join` pattern).
  - Renderers should be idempotent where possible.
- **Comments**:
  - Existing code uses **English or Chinese** comments for high-level descriptions. Maintain this style or use English if clarifying complex logic.
- **Error Handling**:
  - Use `console.error` for debugging.
  - UI feedback is handled via alert/modal mechanisms in `ui-controls.js`.

## ⚠️ Critical Implementation Details

- **Data Loading**: The app supports both "Wide" (abundance tables) and "Long" (differential stats) formats. Check `app-core.js` parsing logic before changing data structures.
- **State Access**:
  - To access renderer state: `const store = window.getComparisonRendererStore();`
  - To access app state: Use global variables directly (e.g., `window.currentLayout`).
