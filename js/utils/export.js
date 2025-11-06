// Export utilities: SVG and PNG export helpers
// Expose to window for compatibility

(function(){
  function exportSVGForContainer(containerId, filenamePrefix) {
    const svgElement = document.querySelector(`#${containerId} svg`);
    if (!svgElement) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}_${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPNGForContainer(containerId, filenamePrefix) {
    const svgElement = document.querySelector(`#${containerId} svg`);
    if (!svgElement) return;
    const container = document.getElementById(containerId);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const img = new Image();
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = function() {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(function(b) {
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u;
        a.download = `${filenamePrefix}_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(u);
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
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

    try {
      if (typeof window !== 'undefined' && typeof window.ensurePanelsRenderedForExport === 'function') {
        window.ensurePanelsRenderedForExport();
      }
    } catch (_) {}

    const rect = vizContainer.getBoundingClientRect();
    const rawWidth = Math.max(rect.width || 0, vizContainer.scrollWidth || 0, vizContainer.offsetWidth || 0);
    const rawHeight = Math.max(vizContainer.scrollHeight || 0, rect.height || 0, vizContainer.offsetHeight || 0);

    const clone = vizContainer.cloneNode(true);
    clone.style.margin = '0';
    clone.style.boxSizing = 'border-box';
    clone.style.overflow = 'visible';
    clone.style.width = `${Math.max(1, Math.round(rawWidth))}px`;

    clone.querySelectorAll('.panel-actions').forEach(el => el.remove());
    clone.querySelectorAll('.tree-panel-header .btn-back').forEach(el => el.remove());
    clone.querySelectorAll('.tree-panel-header button').forEach(el => el.remove());
    clone.querySelectorAll('.modal-actions').forEach(el => el.remove());

    const tempHost = document.createElement('div');
    tempHost.style.position = 'absolute';
    tempHost.style.left = '-99999px';
    tempHost.style.top = '-99999px';
    tempHost.style.pointerEvents = 'none';
    tempHost.style.visibility = 'hidden';
    tempHost.style.width = clone.style.width;
    document.body.appendChild(tempHost);
    tempHost.appendChild(clone);

    const layoutRect = clone.getBoundingClientRect();
    const measuredWidth = Math.max(layoutRect.width || 0, clone.scrollWidth || 0, rawWidth || 0);
    const measuredHeight = Math.max(layoutRect.height || 0, clone.scrollHeight || 0, rawHeight || 0);
    const width = Math.max(1, Math.round(measuredWidth));
    const height = Math.max(1, Math.round(measuredHeight));

    clone.style.width = `${width}px`;

    tempHost.removeChild(clone);
    tempHost.remove();

    if (!width || !height) return null;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('xmlns', svgNS);
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const foreignObject = document.createElementNS(svgNS, 'foreignObject');
    foreignObject.setAttribute('width', '100%');
    foreignObject.setAttribute('height', '100%');
    foreignObject.setAttribute('x', '0');
    foreignObject.setAttribute('y', '0');

    const wrapper = document.createElement('div');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
    wrapper.style.boxSizing = 'border-box';
    const background = (typeof window !== 'undefined' && window.getComputedStyle)
      ? window.getComputedStyle(vizContainer).backgroundColor
      : null;
    wrapper.style.background = background && background !== 'rgba(0, 0, 0, 0)' ? background : '#ffffff';

    const styleEl = document.createElement('style');
    styleEl.textContent = collectStyleText();
    wrapper.appendChild(styleEl);
    wrapper.appendChild(clone);
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
    const blob = new Blob([snapshot.svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}_${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportVizContainerAsPNG(filenamePrefix) {
    const snapshot = buildVizContainerSnapshot();
    if (!snapshot) {
      console.warn('No viz-container snapshot available for PNG export');
      return;
    }
    const prefix = resolveVizExportPrefix(filenamePrefix);
    const canvas = document.createElement('canvas');
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(snapshot.svgString)}`;
    img.onload = function() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const triggerDownload = (blob) => {
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `${prefix}_${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(pngUrl);
      };
      if (canvas.toBlob) {
        canvas.toBlob((blob) => {
          if (blob) {
            triggerDownload(blob);
          } else {
            console.warn('canvas.toBlob returned null, using data URL fallback');
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `${prefix}_${Date.now()}.png`;
            link.click();
          }
        });
      } else {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${prefix}_${Date.now()}.png`;
        link.click();
      }
    };
    img.onerror = function() {
      console.warn('Failed to render viz-container snapshot for PNG export');
    };
    img.src = svgDataUrl;
  }

  if (typeof window !== 'undefined') {
    window.exportSVGForContainer = exportSVGForContainer;
    window.exportPNGForContainer = exportPNGForContainer;
    window.exportVizContainerAsSVG = exportVizContainerAsSVG;
    window.exportVizContainerAsPNG = exportVizContainerAsPNG;
  }
})();
