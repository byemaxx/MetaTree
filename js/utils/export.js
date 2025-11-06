// Export utilities: SVG and PNG export helpers
// Expose to window for compatibility

(function(){
  // Helper: download a blob with a filename, revoking object URL after click
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Give browser a tick to start download before revoking
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportSVGForContainer(containerId, filenamePrefix) {
    const svgElement = document.querySelector(`#${containerId} svg`);
    if (!svgElement) return;

    // Clone the SVG so we can safely inject styles
    const clone = svgElement.cloneNode(true);
    // Ensure xmlns attributes are present
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    // Inline document styles to keep appearance when exported
    try {
      const styleText = collectStyleText();
      if (styleText) {
        const styleEl = document.createElement('style');
        styleEl.textContent = styleText;
        // Insert as first child so rules apply
        clone.insertBefore(styleEl, clone.firstChild);
      }
    } catch (e) {
      // non-fatal
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const filename = `${filenamePrefix || 'export'}_${Date.now()}.svg`;
    downloadBlob(blob, filename);
  }

  // Export a single SVG inside a container as PNG. Returns a Promise that resolves when complete.
  function exportPNGForContainer(containerId, filenamePrefix) {
    return new Promise((resolve, reject) => {
      const svgElement = document.querySelector(`#${containerId} svg`);
      if (!svgElement) return reject(new Error('SVG element not found'));
      const container = document.getElementById(containerId);
      if (!container) return reject(new Error('Container not found'));

      // Determine size: prefer viewBox if present, else bounding box, else container size
      let width = null;
      let height = null;
      try {
        const viewBox = svgElement.getAttribute('viewBox');
        if (viewBox) {
          const parts = viewBox.split(/\s+/).map(Number);
          if (parts.length === 4) {
            width = Math.round(parts[2]);
            height = Math.round(parts[3]);
          }
        }
      } catch (e) {}
      if (!width || !height) {
        try {
          const bbox = svgElement.getBBox();
          if (bbox) {
            width = Math.round(bbox.width || svgElement.clientWidth || container.clientWidth || 800);
            height = Math.round(bbox.height || svgElement.clientHeight || container.clientHeight || 600);
          }
        } catch (e) {
          width = Math.max(1, container.clientWidth || 800);
          height = Math.max(1, container.clientHeight || 600);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');

      // Inline styles similarly to SVG export
      const clone = svgElement.cloneNode(true);
      try {
        const styleText = collectStyleText();
        if (styleText) {
          const styleEl = document.createElement('style');
          styleEl.textContent = styleText;
          clone.insertBefore(styleEl, clone.firstChild);
        }
      } catch (e) {}

      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const svgData = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      // Best-effort to avoid tainting the canvas when possible
      try { img.crossOrigin = 'anonymous'; } catch (e) {}

      img.onload = function() {
        try {
          if (ctx) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }

          if (canvas.toBlob) {
            canvas.toBlob(function(b) {
              if (b) {
                downloadBlob(b, `${filenamePrefix || 'export'}_${Date.now()}.png`);
                URL.revokeObjectURL(url);
                resolve();
              } else {
                // Fallback to data URL
                const dataUrl = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `${filenamePrefix || 'export'}_${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                resolve();
              }
            });
          } else {
            const dataUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `${filenamePrefix || 'export'}_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            resolve();
          }
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };

      img.onerror = function(e) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG for PNG export'));
      };

      img.src = url;
    });
  }

  function collectStyleText() {
    const styles = [];
    if (typeof document === 'undefined' || !document.styleSheets) return '';
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) return;
        Array.from(rules).forEach(rule => {
          if (rule && rule.cssText) styles.push(rule.cssText);
        });
      } catch (err) {
        // Ignore cross-origin or inaccessible stylesheets
      }
    });
    return styles.join('\n');
  }

  function buildVizContainerSnapshot() {
    if (typeof document === 'undefined') return null;

    const vizContainer = document.getElementById('viz-container');
    if (!vizContainer) return null;

    // Ensure all panels & legend are rendered
    try {
      if (typeof window !== 'undefined'
        && typeof window.ensurePanelsRenderedForExport === 'function') {
        window.ensurePanelsRenderedForExport();
      }
    } catch (_) {}

    // ---- 1. Clone current layout of #viz-container ----
    const rect = vizContainer.getBoundingClientRect();
    const baseWidth = Math.max(
      rect.width || 0,
      vizContainer.scrollWidth || 0,
      vizContainer.offsetWidth || 0,
      1
    );

    const clone = vizContainer.cloneNode(true);

    // Keep id so #viz-container rules still apply inside snapshot
    clone.style.margin = '0';
    clone.style.boxSizing = 'border-box';
    clone.style.overflow = 'visible';
    clone.style.width = baseWidth + 'px';
    clone.style.maxWidth = 'none';
    clone.style.maxHeight = 'none';

    // Remove purely interactive controls from export
    clone.querySelectorAll(
      '.panel-actions,' +
      '.tree-panel-header .btn-back,' +
      '.tree-panel-header button,' +
      '.modal,' +
      '.modal-backdrop,' +
      '.modal-actions,' +
      '[data-export-exclude="1"]'
    ).forEach(el => el.remove());

    // ---- 2. Off-screen HTML host for measuring ----
    const tempHost = document.createElement('div');
    tempHost.style.position = 'absolute';
    tempHost.style.left = '-100000px';
    tempHost.style.top = '0';
    tempHost.style.visibility = 'hidden';
    tempHost.style.pointerEvents = 'none';
    document.body.appendChild(tempHost);

    const wrapper = document.createElement('div');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrapper.style.margin = '0';
    wrapper.style.padding = '0';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.display = 'block';
    wrapper.style.width = baseWidth + 'px';
    wrapper.style.maxWidth = 'none';
    wrapper.style.overflow = 'visible';

    // Match background from original container
    try {
      const cs = window.getComputedStyle(vizContainer);
      if (cs && cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        wrapper.style.background = cs.backgroundColor;
      } else {
        wrapper.style.background = '#ffffff';
      }
    } catch (_) {
      wrapper.style.background = '#ffffff';
    }

    // ---- 3. Copy CSS variables so runtime settings (panel width/height, etc.) are honored ----
    function copyCssVars(src, dest) {
      if (!src || !dest) return;
      try {
        const st = window.getComputedStyle(src);
        for (let i = 0; i < st.length; i++) {
          const name = st[i];
          if (name && name.startsWith('--')) {
            const v = st.getPropertyValue(name);
            if (v) dest.style.setProperty(name, v);
          }
        }
      } catch (_) {}
    }
    copyCssVars(document.documentElement, wrapper);
    copyCssVars(document.body, wrapper);
    copyCssVars(vizContainer, wrapper);

    // Inline global styles (css/style.css, css/comparison.css, etc.)
    const styleEl = document.createElement('style');
    styleEl.textContent = collectStyleText();
    wrapper.appendChild(styleEl);

    // Put cloned viz into wrapper and measure in pure HTML environment
    wrapper.appendChild(clone);
    tempHost.appendChild(wrapper);

    // Force layout
    // eslint-disable-next-line no-unused-expressions
    wrapper.offsetHeight;

    const wrapperRect = wrapper.getBoundingClientRect();
    const contentWidth = Math.max(
      wrapper.scrollWidth || 0,
      wrapperRect.width || 0,
      baseWidth,
      1
    );
    const contentHeight = Math.max(
      wrapper.scrollHeight || 0,
      wrapperRect.height || 0,
      1
    );

    const width = Math.max(1, Math.round(contentWidth));
    const height = Math.max(1, Math.round(contentHeight + 4)); // tiny padding to avoid 1px clipping

    if (!width || !height) {
      tempHost.remove();
      return null;
    }

    // ---- 4. Build SVG with <foreignObject>, reusing the measured wrapper ----
    // Detach wrapper from tempHost to reuse it inside foreignObject
    tempHost.removeChild(wrapper);
    tempHost.remove();

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('xmlns', svgNS);
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const foreignObject = document.createElementNS(svgNS, 'foreignObject');
    foreignObject.setAttribute('x', '0');
    foreignObject.setAttribute('y', '0');
    foreignObject.setAttribute('width', width);
    foreignObject.setAttribute('height', height);

    // Finalize wrapper size and clipping
    wrapper.style.width = width + 'px';
    wrapper.style.height = height + 'px';
    wrapper.style.overflow = 'hidden';

    foreignObject.appendChild(wrapper);
    svg.appendChild(foreignObject);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);

    return { svgString, width, height };
  }

  function resolveVizExportPrefix(explicitPrefix) {
    if (explicitPrefix) return explicitPrefix;
    let mode = 'viz';
    try {
      if (typeof window !== 'undefined' && window.visualizationMode) {
        mode = window.visualizationMode;
      } else if (typeof visualizationMode !== 'undefined') {
        mode = visualizationMode;
      }
    } catch (_) {}
    if (mode === 'group') return 'groups_viz';
    if (mode === 'single') return 'samples_viz';
    if (mode === 'comparison') return 'comparison_viz';
    if (mode === 'matrix') return 'matrix_viz';
    return `${mode || 'viz'}_viz`;
  }

  function exportVizContainerAsSVG(filenamePrefix) {
    const snapshot = buildVizContainerSnapshot();
    if (!snapshot) {
      console.warn('No viz-container snapshot available for SVG export');
      return;
    }
    const prefix = resolveVizExportPrefix(filenamePrefix);
    const blob = new Blob([snapshot.svgString], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${prefix}_${Date.now()}.svg`);
  }

  // Export the whole viz container snapshot to PNG. Returns a Promise.
  function exportVizContainerAsPNG(filenamePrefix) {
    return new Promise((resolve, reject) => {
      const snapshot = buildVizContainerSnapshot();
      if (!snapshot) {
        console.warn('No viz-container snapshot available for PNG export');
        return reject(new Error('No snapshot'));
      }
      const prefix = resolveVizExportPrefix(filenamePrefix);
      const canvas = document.createElement('canvas');
      canvas.width = snapshot.width;
      canvas.height = snapshot.height;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(snapshot.svgString)}`;
      try { img.crossOrigin = 'anonymous'; } catch (e) {}
      img.onload = function() {
        try {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          if (canvas.toBlob) {
            canvas.toBlob((blob) => {
              if (blob) {
                downloadBlob(blob, `${prefix}_${Date.now()}.png`);
                resolve();
              } else {
                // fallback
                const dataUrl = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `${prefix}_${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                resolve();
              }
            });
          } else {
            const dataUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `${prefix}_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function() {
        reject(new Error('Failed to render viz-container snapshot for PNG export'));
      };
      img.src = svgDataUrl;
    });
  }

  if (typeof window !== 'undefined') {
    window.exportSVGForContainer = exportSVGForContainer;
    window.exportPNGForContainer = exportPNGForContainer;
    window.exportVizContainerAsSVG = exportVizContainerAsSVG;
    window.exportVizContainerAsPNG = exportVizContainerAsPNG;
  }
})();
