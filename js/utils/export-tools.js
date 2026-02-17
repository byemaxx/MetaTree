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

  function getCurrentVizContainer() {
    try {
      if (typeof window !== 'undefined' && typeof window.getVizSubContainer === 'function') {
        const mode = (typeof window.visualizationMode !== 'undefined') ? window.visualizationMode : null;
        const sub = window.getVizSubContainer(mode || 'single');
        if (sub) return sub;
      }
    } catch (_) {}
    return document.getElementById('viz-container');
  }

  function getPxNumber(value, fallback = 0) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeRgbaColor(value) {
    if (!value || typeof value !== 'string') return null;
    const m = value.match(/^rgba?\(([^)]+)\)$/i);
    if (!m) return null;
    const parts = m[1].split(',').map(s => s.trim());
    if (parts.length < 3) return null;
    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    const a = parts.length >= 4 ? parseFloat(parts[3]) : 1;
    if (![r, g, b, a].every(v => Number.isFinite(v))) return null;
    return { color: `rgb(${r}, ${g}, ${b})`, opacity: Math.max(0, Math.min(1, a)) };
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const opacity = style ? parseFloat(style.opacity) : 1;
    return style && style.display !== 'none' && style.visibility !== 'hidden' && opacity > 0;
  }

  function parseLinearGradientStops(gradientValue) {
    if (!gradientValue || typeof gradientValue !== 'string') return null;
    const match = gradientValue.match(/linear-gradient\((.*)\)/i);
    if (!match) return null;
    const body = match[1].trim();
    const parts = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    if (parts.length < 2) return null;
    const stopParts = (parts[0].includes('deg') || parts[0].includes('to ')) ? parts.slice(1) : parts;
    const stops = stopParts.map((p) => {
      let color = p.trim();
      let offset = null;
      const offsetMatch = p.match(/\s(\d+(?:\.\d+)?)%\s*$/);
      if (offsetMatch) {
        const v = parseFloat(offsetMatch[1]);
        if (Number.isFinite(v)) offset = v / 100;
        color = p.slice(0, offsetMatch.index).trim();
      }
      return { color, offset };
    });
    const missing = stops.filter(s => s.offset == null).length;
    if (missing) {
      const step = stops.length > 1 ? 1 / (stops.length - 1) : 1;
      stops.forEach((s, i) => {
        if (s.offset == null) s.offset = i * step;
      });
    }
    return stops;
  }

  function appendTextFromElement(svg, el, x, y, align = 'start') {
    if (!el) return;
    const textValue = (el.textContent || '').trim();
    if (!textValue) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const text = document.createElementNS(svgNS, 'text');
    text.textContent = textValue;
    text.setAttribute('x', x);
    text.setAttribute('y', y);
    text.setAttribute('text-anchor', align);
    text.setAttribute('dominant-baseline', 'middle');
    try {
      const cs = window.getComputedStyle(el);
      if (cs) {
        if (cs.fontFamily) text.setAttribute('font-family', cs.fontFamily);
        if (cs.fontSize) text.setAttribute('font-size', cs.fontSize);
        if (cs.fontWeight) text.setAttribute('font-weight', cs.fontWeight);
        if (cs.letterSpacing && cs.letterSpacing !== 'normal') text.setAttribute('letter-spacing', cs.letterSpacing);
        if (cs.color) text.setAttribute('fill', cs.color);
      }
    } catch (_) {}
    svg.appendChild(text);
  }

  function appendRectFromElement(svg, el, x, y, width, height) {
    if (!el) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    try {
      const cs = window.getComputedStyle(el);
      if (cs) {
        const bg = cs.backgroundColor;
        const borderColor = cs.borderTopColor;
        const borderWidth = getPxNumber(cs.borderTopWidth, 0);
        const radius = getPxNumber(cs.borderRadius, 0);
        if (radius) {
          rect.setAttribute('rx', radius);
          rect.setAttribute('ry', radius);
        }
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          const norm = normalizeRgbaColor(bg);
          if (norm) {
            rect.setAttribute('fill', norm.color);
            rect.setAttribute('fill-opacity', norm.opacity);
          } else {
            rect.setAttribute('fill', bg);
          }
        } else {
          rect.setAttribute('fill', 'none');
        }
        let strokeWidth = borderWidth;
        let strokeColor = borderColor || 'transparent';
        if (!strokeWidth || strokeWidth <= 0) {
          const shadow = cs.boxShadow;
          if (shadow && shadow !== 'none') {
            strokeWidth = 1;
            strokeColor = 'rgba(0, 0, 0, 0.15)';
          }
        }
        if (strokeWidth > 0) {
          const norm = normalizeRgbaColor(strokeColor);
          if (norm) {
            rect.setAttribute('stroke', norm.color);
            rect.setAttribute('stroke-opacity', norm.opacity);
          } else {
            rect.setAttribute('stroke', strokeColor);
          }
          rect.setAttribute('stroke-width', strokeWidth);
        }
      }
    } catch (_) {}
    svg.appendChild(rect);
  }

  function setSvgPaintFromCssColor(el, attr, cssColor) {
    if (!el || !attr || !cssColor) return false;
    const norm = normalizeRgbaColor(cssColor);
    if (norm) {
      el.setAttribute(attr, norm.color);
      el.setAttribute(attr === 'fill' ? 'fill-opacity' : 'stroke-opacity', String(norm.opacity));
      return norm.opacity > 0;
    }
    const lower = String(cssColor).trim().toLowerCase();
    if (!lower || lower === 'transparent' || lower === 'none') return false;
    el.setAttribute(attr, cssColor);
    return true;
  }

  function appendHeaderBorderFromElement(svg, headerEl, width, height) {
    if (!svg || !headerEl || !width || !height) return { hasBottom: false };
    let cs = null;
    try { cs = window.getComputedStyle(headerEl); } catch (_) { cs = null; }
    if (!cs) return { hasBottom: false };

    const svgNS = 'http://www.w3.org/2000/svg';
    const sides = [
      {
        key: 'top',
        size: getPxNumber(cs.borderTopWidth, 0),
        style: cs.borderTopStyle,
        color: cs.borderTopColor,
        x: 0,
        y: 0
      },
      {
        key: 'right',
        size: getPxNumber(cs.borderRightWidth, 0),
        style: cs.borderRightStyle,
        color: cs.borderRightColor,
        x: 0,
        y: 0
      },
      {
        key: 'bottom',
        size: getPxNumber(cs.borderBottomWidth, 0),
        style: cs.borderBottomStyle,
        color: cs.borderBottomColor,
        x: 0,
        y: 0
      },
      {
        key: 'left',
        size: getPxNumber(cs.borderLeftWidth, 0),
        style: cs.borderLeftStyle,
        color: cs.borderLeftColor,
        x: 0,
        y: 0
      }
    ];

    const drawn = { hasBottom: false };
    sides.forEach((side) => {
      const bw = side.size;
      if (!(bw > 0)) return;
      const style = (side.style || '').toLowerCase();
      if (style === 'none' || style === 'hidden') return;

      const rect = document.createElementNS(svgNS, 'rect');
      const rectW = (side.key === 'top' || side.key === 'bottom') ? width : bw;
      const rectH = (side.key === 'left' || side.key === 'right') ? height : bw;
      const x = (side.key === 'right') ? (width - bw) : side.x;
      const y = (side.key === 'bottom') ? (height - bw) : side.y;

      rect.setAttribute('x', String(Math.max(0, x)));
      rect.setAttribute('y', String(Math.max(0, y)));
      rect.setAttribute('width', String(Math.max(0, rectW)));
      rect.setAttribute('height', String(Math.max(0, rectH)));

      const visible = setSvgPaintFromCssColor(rect, 'fill', side.color);
      if (!visible) return;
      svg.appendChild(rect);
      if (side.key === 'bottom') drawn.hasBottom = true;
    });
    return drawn;
  }

  function buildLegendSvgFromElement(legendEl, opts = {}) {
    if (!legendEl || !isElementVisible(legendEl)) return null;
    const rect = legendEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const svgNS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(svgNS, 'g');
    appendRectFromElement(g, legendEl, 0, 0, rect.width, rect.height);
    const centerTitle = !!opts.centerTitle;
    const labelMode = opts.labelMode || 'dom';

    const title = legendEl.querySelector('.legend-title');
    if (title) {
      const tRect = title.getBoundingClientRect();
      const x = centerTitle ? (rect.width / 2) : (tRect.left - rect.left);
      const y = tRect.top - rect.top + tRect.height / 2;
      appendTextFromElement(g, title, x, y, centerTitle ? 'middle' : 'start');
    }

    const grad = legendEl.querySelector('.legend-gradient');
    if (grad) {
      const gRect = grad.getBoundingClientRect();
      const x = gRect.left - rect.left;
      const y = gRect.top - rect.top;
      const w = gRect.width;
      const h = gRect.height;
      const gradStyle = window.getComputedStyle(grad);
      const gradRadius = gradStyle ? getPxNumber(gradStyle.borderRadius, 0) : 0;
      const defs = document.createElementNS(svgNS, 'defs');
      const gradEl = document.createElementNS(svgNS, 'linearGradient');
      const gradId = `legend-grad-${Math.random().toString(36).slice(2, 8)}`;
      gradEl.setAttribute('id', gradId);
      gradEl.setAttribute('x1', '0%');
      gradEl.setAttribute('x2', '100%');
      gradEl.setAttribute('y1', '0%');
      gradEl.setAttribute('y2', '0%');

      const bgImage = gradStyle ? gradStyle.backgroundImage : null;
      const stops = parseLinearGradientStops(bgImage) || [];
      if (stops.length) {
        stops.forEach((s) => {
          const stop = document.createElementNS(svgNS, 'stop');
          stop.setAttribute('offset', `${Math.max(0, Math.min(1, s.offset)) * 100}%`);
          stop.setAttribute('stop-color', s.color);
          gradEl.appendChild(stop);
        });
      } else {
        const stop1 = document.createElementNS(svgNS, 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', '#2166ac');
        const stop2 = document.createElementNS(svgNS, 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', '#b2182b');
        gradEl.appendChild(stop1);
        gradEl.appendChild(stop2);
      }

      defs.appendChild(gradEl);
      g.appendChild(defs);
      const rectEl = document.createElementNS(svgNS, 'rect');
      rectEl.setAttribute('x', x);
      rectEl.setAttribute('y', y);
      rectEl.setAttribute('width', w);
      rectEl.setAttribute('height', h);
      if (gradRadius) {
        rectEl.setAttribute('rx', gradRadius);
        rectEl.setAttribute('ry', gradRadius);
      }
      rectEl.setAttribute('fill', `url(#${gradId})`);
      g.appendChild(rectEl);
    }

    const labels = legendEl.querySelector('.legend-labels');
    if (labels) {
      const labelNodes = Array.from(labels.children);
      const pad = 10;
      const count = labelNodes.length;
      labelNodes.forEach((node, i) => {
        const lRect = node.getBoundingClientRect();
        let x = lRect.left - rect.left + lRect.width / 2;
        let anchor = 'middle';
        if (labelMode === 'spread' && count > 1) {
          if (i === 0) {
            x = pad;
            anchor = 'start';
          } else if (i === count - 1) {
            x = rect.width - pad;
            anchor = 'end';
          } else {
            x = rect.width / 2;
            anchor = 'middle';
          }
        }
        const y = lRect.top - rect.top + lRect.height / 2;
        appendTextFromElement(g, node, x, y, anchor);
      });
    }

    const desc = legendEl.querySelector('.legend-description');
    if (desc) {
      const dRect = desc.getBoundingClientRect();
      const x = dRect.left - rect.left + dRect.width / 2;
      const y = dRect.top - rect.top + dRect.height / 2;
      appendTextFromElement(g, desc, x, y, 'middle');
    }

    return { group: g, width: rect.width, height: rect.height };
  }

  function cloneSvgWithInlineStyles(svgEl) {
    const clone = svgEl.cloneNode(true);
    try {
      const props = [
        'fill',
        'stroke',
        'stroke-width',
        'stroke-linecap',
        'stroke-linejoin',
        'stroke-dasharray',
        'stroke-dashoffset',
        'opacity',
        'fill-opacity',
        'stroke-opacity',
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'letter-spacing',
        'text-anchor',
        'dominant-baseline',
        'paint-order',
        'shape-rendering'
      ];
      const srcNodes = [svgEl, ...Array.from(svgEl.querySelectorAll('*'))];
      const dstNodes = [clone, ...Array.from(clone.querySelectorAll('*'))];
      const len = Math.min(srcNodes.length, dstNodes.length);
      for (let i = 0; i < len; i++) {
        const src = srcNodes[i];
        const dst = dstNodes[i];
        const cs = window.getComputedStyle(src);
        if (!cs) continue;
        props.forEach((prop) => {
          const v = cs.getPropertyValue(prop);
          if (!v) return;
          if (prop === 'fill' || prop === 'stroke') {
            const norm = normalizeRgbaColor(v);
            if (norm) {
              dst.style.setProperty(prop, norm.color);
              dst.style.setProperty(prop === 'fill' ? 'fill-opacity' : 'stroke-opacity', String(norm.opacity));
              return;
            }
          }
          dst.style.setProperty(prop, v);
        });
      }
      const dstNodesAll = [clone, ...Array.from(clone.querySelectorAll('*'))];
      dstNodesAll.forEach((node) => {
        ['fill', 'stroke'].forEach((attr) => {
          const val = node.getAttribute(attr);
          const norm = normalizeRgbaColor(val);
          if (norm) {
            node.setAttribute(attr, norm.color);
            node.setAttribute(attr === 'fill' ? 'fill-opacity' : 'stroke-opacity', String(norm.opacity));
          }
        });
      });
    } catch (_) {
      // best-effort
    }
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    return clone;
  }

  function buildVectorPanelSvg(panelEl, opts = {}) {
    if (!panelEl) return null;
    const panelRect = panelEl.getBoundingClientRect();
    if (!panelRect || !panelRect.width || !panelRect.height) return null;

    const headerEl = panelEl.querySelector('.tree-panel-header');
    const headerRect = headerEl ? headerEl.getBoundingClientRect() : null;
    const headerHeight = headerRect ? Math.round(headerRect.height) : 0;

    const svgContainer = panelEl.querySelector('.tree-svg-container');
    const svgEl = svgContainer ? svgContainer.querySelector('svg') : panelEl.querySelector('svg');

    const svgContainerRect = svgContainer ? svgContainer.getBoundingClientRect() : null;
    const innerWidth = svgContainerRect ? Math.round(svgContainerRect.width) : Math.round(panelRect.width);
    const innerHeight = svgContainerRect ? Math.round(svgContainerRect.height) : Math.max(1, Math.round(panelRect.height - headerHeight));

    const panelStyle = window.getComputedStyle(panelEl);
    const panelBg = (panelStyle && panelStyle.backgroundColor) ? panelStyle.backgroundColor : '#ffffff';
    const borderColor = (panelStyle && panelStyle.borderTopColor) ? panelStyle.borderTopColor : 'transparent';
    const borderWidth = panelStyle ? getPxNumber(panelStyle.borderTopWidth, 0) : 0;
    const radius = panelStyle ? getPxNumber(panelStyle.borderRadius, 0) : 0;

    let headerBg = panelBg;
    if (headerEl) {
      const headerStyle = window.getComputedStyle(headerEl);
      if (headerStyle && headerStyle.backgroundColor) headerBg = headerStyle.backgroundColor;
    }

    let titleText = '';
    let titleStyle = null;
    const titleEl = headerEl ? headerEl.querySelector('.panel-title-text') : null;
    if (titleEl) {
      titleText = (titleEl.textContent || '').trim();
      titleStyle = window.getComputedStyle(titleEl);
    }

    const legendEl = opts.includeSharedLegend ? document.getElementById('shared-legend') : null;
    const legendSvg = (legendEl && isElementVisible(legendEl))
      ? buildLegendSvgFromElement(legendEl, { centerTitle: true, labelMode: 'spread' })
      : null;
    const legendPadding = legendSvg ? 12 : 0;
    const legendWidth = legendSvg ? Math.round(legendSvg.width) : 0;
    const totalWidth = Math.round(Math.max(panelRect.width, legendWidth || 0));
    const totalHeight = Math.round(panelRect.height + (legendSvg ? (legendSvg.height + legendPadding) : 0));

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('xmlns', svgNS);
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.setAttribute('width', totalWidth);
    svg.setAttribute('height', totalHeight);
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

    // Panel background fill
    const panelRectEl = document.createElementNS(svgNS, 'rect');
    panelRectEl.setAttribute('x', '0');
    panelRectEl.setAttribute('y', '0');
    panelRectEl.setAttribute('width', Math.round(panelRect.width));
    panelRectEl.setAttribute('height', Math.round(panelRect.height));
    if (radius) {
      panelRectEl.setAttribute('rx', radius);
      panelRectEl.setAttribute('ry', radius);
    }
    panelRectEl.setAttribute('fill', panelBg);
    svg.appendChild(panelRectEl);

    let fallbackHeaderDivider = null;

    // Header
    if (headerHeight > 0) {
      const headerRectEl = document.createElementNS(svgNS, 'rect');
      headerRectEl.setAttribute('x', '0');
      headerRectEl.setAttribute('y', '0');
      headerRectEl.setAttribute('width', Math.round(panelRect.width));
      headerRectEl.setAttribute('height', headerHeight);
      headerRectEl.setAttribute('fill', headerBg || '#333333');
      svg.appendChild(headerRectEl);

      // Render per-side header borders from computed CSS (e.g. bottom-only in Classical theme).
      const headerBorderState = appendHeaderBorderFromElement(svg, headerEl, Math.round(panelRect.width), headerHeight);

      // Fallback divider: if header bottom border is hidden/transparent, use svg-container top border
      // (or panel border color) so the header/content separator is still visible in exported SVG.
      if (!headerBorderState.hasBottom) {
        let dividerWidth = 0;
        let dividerColor = null;
        if (svgContainer) {
          try {
            const scs = window.getComputedStyle(svgContainer);
            if (scs) {
              const style = (scs.borderTopStyle || '').toLowerCase();
              const bw = getPxNumber(scs.borderTopWidth, 0);
              if (bw > 0 && style !== 'none' && style !== 'hidden') {
                dividerWidth = bw;
                dividerColor = scs.borderTopColor;
              }
            }
          } catch (_) {}
        }
        if (!(dividerWidth > 0)) {
          dividerWidth = Math.max(1, borderWidth || 1);
          dividerColor = borderColor;
        }
        fallbackHeaderDivider = {
          width: Math.max(1, Math.round(dividerWidth)),
          color: dividerColor || 'rgba(0, 0, 0, 0.25)'
        };
      }

      if (titleText) {
        const title = document.createElementNS(svgNS, 'text');
        title.textContent = titleText;
        title.setAttribute('x', Math.round(panelRect.width / 2));
        title.setAttribute('y', Math.round(headerHeight / 2));
        title.setAttribute('text-anchor', 'middle');
        title.setAttribute('dominant-baseline', 'middle');
        if (titleStyle) {
          if (titleStyle.fontFamily) title.setAttribute('font-family', titleStyle.fontFamily);
          if (titleStyle.fontSize) title.setAttribute('font-size', titleStyle.fontSize);
          if (titleStyle.fontWeight) title.setAttribute('font-weight', titleStyle.fontWeight);
          if (titleStyle.letterSpacing && titleStyle.letterSpacing !== 'normal') {
            title.setAttribute('letter-spacing', titleStyle.letterSpacing);
          }
          if (titleStyle.color) title.setAttribute('fill', titleStyle.color);
        } else {
          title.setAttribute('fill', '#ffffff');
        }
        svg.appendChild(title);
      }
    }

    // Inner SVG (vector content)
    if (svgEl) {
      const clone = cloneSvgWithInlineStyles(svgEl);
      clone.setAttribute('x', '0');
      clone.setAttribute('y', '0');
      clone.setAttribute('width', String(innerWidth));
      clone.setAttribute('height', String(innerHeight));
      const innerGroup = document.createElementNS(svgNS, 'g');
      innerGroup.setAttribute('transform', `translate(0 ${headerHeight})`);
      innerGroup.appendChild(clone);
      svg.appendChild(innerGroup);
    }

    // Draw fallback divider after inner content so it's guaranteed visible.
    if (fallbackHeaderDivider && headerHeight > 0) {
      const dividerRect = document.createElementNS(svgNS, 'rect');
      const dividerW = Math.max(1, fallbackHeaderDivider.width || 1);
      const dividerY = Math.max(0, Math.round(headerHeight - dividerW));
      dividerRect.setAttribute('x', '0');
      dividerRect.setAttribute('y', String(dividerY));
      dividerRect.setAttribute('width', String(Math.round(panelRect.width)));
      dividerRect.setAttribute('height', String(dividerW));
      if (setSvgPaintFromCssColor(dividerRect, 'fill', fallbackHeaderDivider.color)) {
        svg.appendChild(dividerRect);
      }
    }

    if (legendSvg && legendSvg.group) {
      const legendGroup = legendSvg.group;
      const legendX = Math.round((totalWidth - legendWidth) / 2);
      legendGroup.setAttribute('transform', `translate(${legendX}, ${Math.round(panelRect.height + legendPadding)})`);
      svg.appendChild(legendGroup);
    }

    // Draw panel outer border last so header background/content never hides the frame.
    if (borderWidth > 0) {
      const panelBorderEl = document.createElementNS(svgNS, 'rect');
      panelBorderEl.setAttribute('x', '0');
      panelBorderEl.setAttribute('y', '0');
      panelBorderEl.setAttribute('width', Math.round(panelRect.width));
      panelBorderEl.setAttribute('height', Math.round(panelRect.height));
      panelBorderEl.setAttribute('fill', 'none');
      if (radius) {
        panelBorderEl.setAttribute('rx', radius);
        panelBorderEl.setAttribute('ry', radius);
      }
      panelBorderEl.setAttribute('stroke', borderColor);
      panelBorderEl.setAttribute('stroke-width', borderWidth);
      svg.appendChild(panelBorderEl);
    }

    const svgString = new XMLSerializer().serializeToString(svg);
    return { svgString, width: totalWidth, height: totalHeight };
  }

  function buildVectorPanelsSvg(vizContainer) {
    const container = vizContainer || getCurrentVizContainer();
    if (!container) return null;
    const panels = Array.from(container.querySelectorAll('.tree-panel, .comparison-panel'));
    if (!panels.length) return null;

    const containerRect = container.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const panelData = panels.map((panel) => {
      const rect = panel.getBoundingClientRect();
      const x = rect.left - containerRect.left + (container.scrollLeft || 0);
      const y = rect.top - containerRect.top + (container.scrollTop || 0);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + rect.width);
      maxY = Math.max(maxY, y + rect.height);
      return { panel, x, y, width: rect.width, height: rect.height };
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    const width = Math.max(1, Math.round(maxX - minX));
    const height = Math.max(1, Math.round(maxY - minY));

    const svgNS = 'http://www.w3.org/2000/svg';
    const root = document.createElementNS(svgNS, 'svg');
    root.setAttribute('xmlns', svgNS);
    root.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    root.setAttribute('width', width);
    root.setAttribute('height', height);
    root.setAttribute('viewBox', `0 0 ${width} ${height}`);

    panelData.forEach((item) => {
      const sub = buildVectorPanelSvg(item.panel);
      if (!sub) return;
      const g = document.createElementNS(svgNS, 'g');
      const tx = Math.round(item.x - minX);
      const ty = Math.round(item.y - minY);
      g.setAttribute('transform', `translate(${tx}, ${ty})`);
      const frag = new DOMParser().parseFromString(sub.svgString, 'image/svg+xml');
      const subSvg = frag.documentElement;
      if (subSvg) g.appendChild(subSvg);
      root.appendChild(g);
    });

    let finalWidth = width;
    let finalHeight = height;

    const sharedLegend = document.getElementById('shared-legend');
    if (sharedLegend && isElementVisible(sharedLegend)) {
      const legendSvg = buildLegendSvgFromElement(sharedLegend, { centerTitle: true, labelMode: 'spread' });
      if (legendSvg && legendSvg.group) {
        const legendPadding = 12;
        const x = Math.round((width - legendSvg.width) / 2);
        const y = height + legendPadding;
        const g = legendSvg.group;
        g.setAttribute('transform', `translate(${x}, ${y})`);
        root.appendChild(g);

        finalWidth = Math.max(width, x + legendSvg.width);
        finalHeight = Math.max(height, y + legendSvg.height + legendPadding);
        root.setAttribute('width', finalWidth);
        root.setAttribute('height', finalHeight);
        root.setAttribute('viewBox', `0 0 ${finalWidth} ${finalHeight}`);
      }
    }

    const svgString = new XMLSerializer().serializeToString(root);
    return { svgString, width: finalWidth, height: finalHeight };
  }

  function buildMatrixVectorSvg() {
    const matrix = document.getElementById('comparison-matrix');
    if (!matrix) return null;
    const rect = matrix.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const svgNS = 'http://www.w3.org/2000/svg';
    const root = document.createElementNS(svgNS, 'svg');
    root.setAttribute('xmlns', svgNS);
    root.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    root.setAttribute('width', Math.round(rect.width));
    root.setAttribute('height', Math.round(rect.height));
    root.setAttribute('viewBox', `0 0 ${Math.round(rect.width)} ${Math.round(rect.height)}`);

    const title = matrix.querySelector('.matrix-title');
    if (title) {
      const tRect = title.getBoundingClientRect();
      const x = tRect.left - rect.left + tRect.width / 2;
      const y = tRect.top - rect.top + tRect.height / 2;
      appendRectFromElement(root, title, tRect.left - rect.left, tRect.top - rect.top, tRect.width, tRect.height);
      appendTextFromElement(root, title, x, y, 'middle');
    }

    const grid = matrix.querySelector('.comparison-matrix-grid');
    if (grid) {
      const gRect = grid.getBoundingClientRect();
      appendRectFromElement(root, grid, gRect.left - rect.left, gRect.top - rect.top, gRect.width, gRect.height);
    }

    const labels = Array.from(matrix.querySelectorAll('.matrix-row-label, .matrix-col-label'));
    labels.forEach((label) => {
      const lRect = label.getBoundingClientRect();
      const x = lRect.left - rect.left + lRect.width / 2;
      const y = lRect.top - rect.top + lRect.height / 2;
      appendRectFromElement(root, label, lRect.left - rect.left, lRect.top - rect.top, lRect.width, lRect.height);
      const cs = window.getComputedStyle(label);
      const writingMode = cs ? cs.writingMode || cs.getPropertyValue('writing-mode') : '';
      if (writingMode && writingMode.includes('vertical')) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const text = document.createElementNS(svgNS, 'text');
        text.textContent = (label.textContent || '').trim();
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('transform', `rotate(-90 ${x} ${y})`);
        try {
          if (cs) {
            if (cs.fontFamily) text.setAttribute('font-family', cs.fontFamily);
            if (cs.fontSize) text.setAttribute('font-size', cs.fontSize);
            if (cs.fontWeight) text.setAttribute('font-weight', cs.fontWeight);
            if (cs.letterSpacing && cs.letterSpacing !== 'normal') text.setAttribute('letter-spacing', cs.letterSpacing);
            if (cs.color) text.setAttribute('fill', cs.color);
          }
        } catch (_) {}
        root.appendChild(text);
      } else {
        appendTextFromElement(root, label, x, y, 'middle');
      }
    });

    const cells = Array.from(matrix.querySelectorAll('.matrix-cell'));
    cells.forEach((cell) => {
      if (cell.classList && cell.classList.contains('empty-cell')) return;
      const cellRect = cell.getBoundingClientRect();
      const x = cellRect.left - rect.left;
      const y = cellRect.top - rect.top;
      if (cellRect.width > 0 && cellRect.height > 0) {
        appendRectFromElement(root, cell, x, y, cellRect.width, cellRect.height);
      }
      const svgEl = cell.querySelector('svg');
      if (!svgEl) return;
      const clone = cloneSvgWithInlineStyles(svgEl);
      clone.setAttribute('x', x);
      clone.setAttribute('y', y);
      clone.setAttribute('width', cellRect.width);
      clone.setAttribute('height', cellRect.height);
      root.appendChild(clone);
    });

    const legend = matrix.querySelector('.comparison-legend');
    if (legend && isElementVisible(legend)) {
      const legendSvg = buildLegendSvgFromElement(legend);
      if (legendSvg && legendSvg.group) {
        const lRect = legend.getBoundingClientRect();
        const x = lRect.left - rect.left;
        const y = lRect.top - rect.top;
        legendSvg.group.setAttribute('transform', `translate(${Math.round(x)}, ${Math.round(y)})`);
        root.appendChild(legendSvg.group);
      }
    }

    const svgString = new XMLSerializer().serializeToString(root);
    return { svgString, width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  function buildVizContainerSnapshot() {
    const vizContainer = (typeof document !== 'undefined') ? document.getElementById('viz-container') : null;
    if (!vizContainer) return null;

    // In matrix mode, exporting the entire viz-container often includes large
    // empty margins (because the matrix wrapper may be centered within a wide
    // container). Prefer exporting the matrix content container directly.
    let exportEl = vizContainer;
    let widthStrategy;
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
    const prefix = resolveVizExportPrefix(filenamePrefix);
    let vector = null;
    try {
      if (typeof window !== 'undefined' && window.visualizationMode === 'matrix') {
        vector = buildMatrixVectorSvg();
      }
    } catch (_) {}
    if (!vector) vector = buildVectorPanelsSvg(getCurrentVizContainer());
    if (vector && vector.svgString) {
      const blob = new Blob([vector.svgString], { type: 'image/svg+xml;charset=utf-8' });
      downloadBlob(blob, `${prefix}_${formatTimestamp()}.svg`);
      return;
    }
    const snapshot = buildVizContainerSnapshot();
    if (!snapshot) {
      console.warn('No viz-container snapshot available for SVG export');
      return;
    }
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
    const prefix = filenamePrefix || (panelId || 'panel_export');
    const panel = (typeof document !== 'undefined') ? document.getElementById(panelId) : null;
    const includeShared = (typeof window !== 'undefined')
      && (window.visualizationMode === 'single' || window.visualizationMode === 'group');
    const vector = panel ? buildVectorPanelSvg(panel, { includeSharedLegend: includeShared }) : null;
    if (vector && vector.svgString) {
      const blob = new Blob([vector.svgString], { type: 'image/svg+xml;charset=utf-8' });
      downloadBlob(blob, `${prefix}_${formatTimestamp()}.svg`);
      return;
    }
    const snapshot = buildPanelSnapshot(panelId);
    if (!snapshot) {
      console.warn('No panel snapshot available for export:', panelId);
      return;
    }
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
