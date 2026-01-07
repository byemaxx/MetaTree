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

  // Human-readable timestamp for filenames: YYYY-MM-DD_HH-MM-SS
  function formatTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
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
    const filename = `${filenamePrefix || 'export'}_${formatTimestamp()}.svg`;
    downloadBlob(blob, filename);
  }

  // Insert or replace pHYs chunk in a PNG Blob to set pixels-per-unit (pixels per meter)
  // dpi -> pixels per meter = dpi * 39.37007874015748
  function addPngPhysChunk(blob, dpi) {
    const PPM_PER_INCH = 39.37007874015748;
    const ppu = Math.round(dpi * PPM_PER_INCH);

    return blob.arrayBuffer().then(buf => {
      const bytes = new Uint8Array(buf);
      // PNG signature
      const sig = [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A];
      for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return blob; // not a PNG

      // Helper to read uint32 BE
      function readUint32(offset) {
        return (bytes[offset]<<24) | (bytes[offset+1]<<16) | (bytes[offset+2]<<8) | (bytes[offset+3]);
      }

      // Helper to write uint32 BE
      function uint32ToBytes(n) {
        return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
      }

      // CRC32 implementation
      const crcTable = (function() {
        let c, table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
          c = n;
          for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
          table[n] = c >>> 0;
        }
        return table;
      })();
      function crc32(bytesArr) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytesArr.length; i++) {
          crc = (crc >>> 8) ^ crcTable[(crc ^ bytesArr[i]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
      }

      // Parse chunks to find IHDR end and check for existing pHYs
      let offset = 8;
      let ihdrEnd = -1;
      let physOffset = -1;
      while (offset < bytes.length) {
        const length = readUint32(offset);
        const typeOffset = offset + 4;
        const type = String.fromCharCode(bytes[typeOffset], bytes[typeOffset+1], bytes[typeOffset+2], bytes[typeOffset+3]);
        const chunkStart = offset;
        const chunkDataStart = offset + 8;
        const chunkDataEnd = chunkDataStart + length;
        const chunkCrcEnd = chunkDataEnd + 4;
        if (type === 'IHDR') {
          ihdrEnd = chunkCrcEnd;
        }
        if (type === 'pHYs') {
          physOffset = chunkStart;
          break; // we'll replace
        }
        offset = chunkCrcEnd;
      }

      // Build pHYs chunk bytes: length(4) + 'pHYs'(4) + data(9) + crc(4)
      const physData = new Uint8Array(9);
      const ppuBytes = uint32ToBytes(ppu);
      physData.set(ppuBytes, 0);
      physData.set(ppuBytes, 4);
      physData[8] = 1; // unit: meter

      const typeName = new TextEncoder().encode('pHYs');
      const crcInput = new Uint8Array(4 + physData.length);
      crcInput.set(typeName, 0);
      crcInput.set(physData, 4);
      const crc = crc32(crcInput);
      const lengthBytes = new Uint8Array(uint32ToBytes(physData.length));
      const crcBytes = new Uint8Array(uint32ToBytes(crc));

      const physChunk = new Uint8Array(lengthBytes.length + typeName.length + physData.length + crcBytes.length);
      let p = 0;
      physChunk.set(lengthBytes, p); p += lengthBytes.length;
      physChunk.set(typeName, p); p += typeName.length;
      physChunk.set(physData, p); p += physData.length;
      physChunk.set(crcBytes, p);

      if (physOffset >= 0) {
        // Replace existing pHYs chunk
        const existingLength = readUint32(physOffset);
        const existingTotal = 4 + 4 + existingLength + 4;
        const before = bytes.slice(0, physOffset);
        const after = bytes.slice(physOffset + existingTotal);
        const out = new Uint8Array(before.length + physChunk.length + after.length);
        out.set(before, 0);
        out.set(physChunk, before.length);
        out.set(after, before.length + physChunk.length);
        return new Blob([out], { type: 'image/png' });
      }

      if (ihdrEnd < 0) return blob; // malformed

      // Insert after IHDR
      const before = bytes.slice(0, ihdrEnd);
      const after = bytes.slice(ihdrEnd);
      const out = new Uint8Array(before.length + physChunk.length + after.length);
      out.set(before, 0);
      out.set(physChunk, before.length);
      out.set(after, before.length + physChunk.length);
      return new Blob([out], { type: 'image/png' });
    });
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

  const SCALE = 2; // export at 2x pixel density
  const DPI = 300; // target DPI to embed in PNG
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width) * SCALE;
  canvas.height = Math.max(1, height) * SCALE;
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
            // Draw at high resolution by using the full canvas pixel size
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }

          if (canvas.toBlob) {
            canvas.toBlob(function(b) {
              if (b) {
                // Insert pHYs chunk for DPI metadata
                addPngPhysChunk(b, DPI).then((newBlob) => {
                  downloadBlob(newBlob, `${filenamePrefix || 'export'}_${formatTimestamp()}.png`);
                  URL.revokeObjectURL(url);
                  resolve();
                }).catch(() => {
                  // fallback to original blob
                  downloadBlob(b, `${filenamePrefix || 'export'}_${formatTimestamp()}.png`);
                  URL.revokeObjectURL(url);
                  resolve();
                });
              } else {
                // Fallback to data URL
                try {
                  const dataUrl = canvas.toDataURL('image/png');
                  // convert dataURL to blob and insert pHYs
                  fetch(dataUrl).then(r => r.blob()).then(b2 => addPngPhysChunk(b2, DPI)).then(newB => {
                    downloadBlob(newB, `${filenamePrefix || 'export'}_${formatTimestamp()}.png`);
                    URL.revokeObjectURL(url);
                    resolve();
                  }).catch(() => {
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = `${filenamePrefix || 'export'}_${formatTimestamp()}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    resolve();
                  });
                } catch (e) {
                  URL.revokeObjectURL(url);
                  reject(e);
                }
              }
            });
          } else {
            try {
              const dataUrl = canvas.toDataURL('image/png');
              fetch(dataUrl).then(r => r.blob()).then(b2 => addPngPhysChunk(b2, DPI)).then(newB => {
                downloadBlob(newB, `${filenamePrefix || 'export'}_${formatTimestamp()}.png`);
                URL.revokeObjectURL(url);
                resolve();
              }).catch(() => {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `${filenamePrefix || 'export'}_${formatTimestamp()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                resolve();
              });
            } catch (e) {
              reject(e);
            }
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

  // Generic: build a snapshot SVG string for any element (returns {svgString, width, height})
  // opts: { removeSelectors: string or array, matchBackgroundFrom: element (optional) }
  function buildSnapshot(element, opts = {}) {
    if (typeof document === 'undefined') return null;
    if (!element) return null;
    let el = element;
    if (typeof element === 'string') el = document.getElementById(element);
    if (!el) return null;

    try {
      if (typeof window !== 'undefined' && typeof window.ensurePanelsRenderedForExport === 'function') {
        window.ensurePanelsRenderedForExport();
      }
    } catch (_) {}

    const rect = el.getBoundingClientRect();
    // Width strategy:
    // - default: include rect.width so exports preserve on-screen container sizing
    // - shrink-to-content: prefer intrinsic content width to avoid exporting large
    //   empty margins (common for centered layouts like the comparison matrix)
    const shrinkToContent = !!(opts && opts.widthStrategy === 'shrink-to-content');
    let baseWidth;
    if (shrinkToContent) {
      baseWidth = Math.max(el.scrollWidth || 0, el.offsetWidth || 0, 1);
      if (!baseWidth || !Number.isFinite(baseWidth)) baseWidth = Math.max(rect.width || 0, 1);
    } else {
      baseWidth = Math.max(rect.width || 0, el.scrollWidth || 0, el.offsetWidth || 0, 1);
    }

    const clone = el.cloneNode(true);
    clone.style.margin = '0';
    clone.style.boxSizing = 'border-box';
    clone.style.overflow = 'visible';
    // Default snapshot keeps the on-screen container width; for shrink-to-content
    // (matrix exports) we let the element wrap to its intrinsic content width.
    clone.style.width = shrinkToContent ? 'fit-content' : (baseWidth + 'px');
    clone.style.maxWidth = 'none';
    clone.style.maxHeight = 'none';

    // Remove selectors provided
    try {
      const sel = opts.removeSelectors;
      if (sel) {
        if (Array.isArray(sel)) {
          sel.join(',');
        }
        clone.querySelectorAll(Array.isArray(sel) ? sel.join(',') : sel).forEach(elm => elm.remove());
      }
    } catch (_) {}

    // Off-screen host for measuring
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
    // Use inline-block when shrink-wrapping so bounding rect reflects content.
    wrapper.style.display = shrinkToContent ? 'inline-block' : 'block';
    wrapper.style.width = shrinkToContent ? 'fit-content' : (baseWidth + 'px');
    wrapper.style.maxWidth = 'none';
    wrapper.style.overflow = 'visible';

    // Match background if requested
    try {
      const bgSource = opts.matchBackgroundFrom || el;
      if (bgSource) {
        const cs = window.getComputedStyle(bgSource);
        if (cs && cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          wrapper.style.background = cs.backgroundColor;
        } else {
          wrapper.style.background = '#ffffff';
        }
      }
    } catch (_) {
      wrapper.style.background = '#ffffff';
    }

    // copy CSS variables so runtime settings are honored
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
    copyCssVars(el, wrapper);

    // Inline global styles
    const styleEl = document.createElement('style');
    styleEl.textContent = collectStyleText();
    wrapper.appendChild(styleEl);

    wrapper.appendChild(clone);
    tempHost.appendChild(wrapper);

    // Force layout
    // eslint-disable-next-line no-unused-expressions
    wrapper.offsetHeight;

    const wrapperRect = wrapper.getBoundingClientRect();
    // For shrink-to-content: rely on measured bounding box (scrollWidth is at
    // least clientWidth and can retain empty space if the host is wide).
    const contentWidth = shrinkToContent
      ? Math.max(wrapperRect.width || 0, 1)
      : Math.max(wrapper.scrollWidth || 0, wrapperRect.width || 0, baseWidth, 1);
    const contentHeight = shrinkToContent
      ? Math.max(wrapperRect.height || 0, 1)
      : Math.max(wrapper.scrollHeight || 0, wrapperRect.height || 0, 1);

    const width = Math.max(1, Math.round(contentWidth));
    const height = Math.max(1, Math.round(contentHeight + 4));

    if (!width || !height) {
      tempHost.remove();
      return null;
    }

    // Detach wrapper from tempHost to reuse it inside foreignObject
    try { tempHost.removeChild(wrapper); } catch (_) {}
    try { tempHost.remove(); } catch (_) {}

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

    // finalize wrapper sizing
    wrapper.style.width = width + 'px';
    wrapper.style.height = height + 'px';
    wrapper.style.overflow = 'hidden';

    foreignObject.appendChild(wrapper);
    svg.appendChild(foreignObject);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    return { svgString, width, height };
  }

  // Render snapshot to PNG via canvas, embed pHYs chunk, and download (returns Promise)
  function renderSnapshotToPNG(snapshot, prefix) {
    return new Promise((resolve, reject) => {
      if (!snapshot) return reject(new Error('No snapshot'));
      const SCALE = 2;
      const DPI = 300;
      const canvas = document.createElement('canvas');
      canvas.width = snapshot.width * SCALE;
      canvas.height = snapshot.height * SCALE;
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
                addPngPhysChunk(blob, DPI).then(newBlob => {
                  downloadBlob(newBlob, `${prefix || 'export'}_${formatTimestamp()}.png`);
                  resolve();
                }).catch(() => {
                  downloadBlob(blob, `${prefix || 'export'}_${formatTimestamp()}.png`);
                  resolve();
                });
              } else {
                const dataUrl = canvas.toDataURL('image/png');
                fetch(dataUrl).then(r => r.blob()).then(b2 => addPngPhysChunk(b2, DPI)).then(newB => {
                  downloadBlob(newB, `${prefix || 'export'}_${formatTimestamp()}.png`);
                  resolve();
                }).catch(() => {
                  const a = document.createElement('a');
                  a.href = dataUrl;
                  a.download = `${prefix || 'export'}_${formatTimestamp()}.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  resolve();
                });
              }
            });
          } else {
            const dataUrl = canvas.toDataURL('image/png');
            fetch(dataUrl).then(r => r.blob()).then(b2 => addPngPhysChunk(b2, DPI)).then(newB => {
              downloadBlob(newB, `${prefix || 'export'}_${formatTimestamp()}.png`);
              resolve();
            }).catch(() => {
              const a = document.createElement('a');
              a.href = dataUrl;
              a.download = `${prefix || 'export'}_${formatTimestamp()}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              resolve();
            });
          }
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function() { reject(new Error('Failed to render snapshot for PNG export')); };
      img.src = svgDataUrl;
    });
  }

  function buildVizContainerSnapshot() {
    const vizContainer = (typeof document !== 'undefined') ? document.getElementById('viz-container') : null;
    if (!vizContainer) return null;

    // In matrix mode, exporting the entire viz-container often includes large
    // empty margins (because the matrix wrapper may be centered within a wide
    // container). Prefer exporting the matrix content container directly.
    let exportEl = vizContainer;
    let widthStrategy = undefined;
    try {
      let mode = null;
      if (typeof window !== 'undefined' && window.visualizationMode) mode = window.visualizationMode;
      else if (typeof visualizationMode !== 'undefined') mode = visualizationMode;
      if (mode === 'matrix') {
        const matrix = document.getElementById('comparison-matrix');
        if (matrix) exportEl = matrix;
        widthStrategy = 'shrink-to-content';
      }
    } catch (_) { /* ignore */ }

    return buildSnapshot(exportEl, {
      removeSelectors: [
        '.panel-actions',
        '.tree-panel-header .btn-back',
        '.tree-panel-header button',
        '.modal',
        '.modal-backdrop',
        '.modal-actions',
        '[data-export-exclude="1"]'
      ],
      matchBackgroundFrom: exportEl,
      widthStrategy
    });
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
    downloadBlob(blob, `${prefix}_${formatTimestamp()}.svg`);
  }

  // Export the whole viz container snapshot to PNG. Returns a Promise.
  function exportVizContainerAsPNG(filenamePrefix) {
    const snapshot = buildVizContainerSnapshot();
    if (!snapshot) {
      console.warn('No viz-container snapshot available for PNG export');
      return Promise.reject(new Error('No snapshot'));
    }
    const prefix = resolveVizExportPrefix(filenamePrefix);
    return renderSnapshotToPNG(snapshot, prefix);
  }

  // Build a snapshot for a specific panel element (by panel id)
  function buildPanelSnapshot(panelId) {
    const panel = (typeof document !== 'undefined') ? document.getElementById(panelId) : null;
    if (!panel) return null;
    return buildSnapshot(panel, {
      removeSelectors: [
        '.panel-actions',
        '.btn-back',
        'button',
        '.modal',
        '.modal-backdrop',
        '.modal-actions',
        '[data-export-exclude="1"]'
      ],
      matchBackgroundFrom: panel
    });
  }

  function exportPanelAsSVG(panelId, filenamePrefix) {
    const snapshot = buildPanelSnapshot(panelId);
    if (!snapshot) {
      console.warn('No panel snapshot available for export:', panelId);
      return;
    }
    const prefix = filenamePrefix || (panelId || 'panel_export');
    const blob = new Blob([snapshot.svgString], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${prefix}_${formatTimestamp()}.svg`);
  }

  function exportPanelAsPNG(panelId, filenamePrefix) {
    const snapshot = buildPanelSnapshot(panelId);
    if (!snapshot) {
      console.warn('No panel snapshot available for export:', panelId);
      return Promise.reject(new Error('No snapshot'));
    }
    const prefix = filenamePrefix || (panelId || 'panel_export');
    return renderSnapshotToPNG(snapshot, prefix);
  }

  if (typeof window !== 'undefined') {
    window.exportSVGForContainer = exportSVGForContainer;
    window.exportPNGForContainer = exportPNGForContainer;
    window.exportVizContainerAsSVG = exportVizContainerAsSVG;
    window.exportVizContainerAsPNG = exportVizContainerAsPNG;
    window.exportPanelAsSVG = exportPanelAsSVG;
    window.exportPanelAsPNG = exportPanelAsPNG;
  }
})();
