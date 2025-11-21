(function(){
  // Delegated unified contextmenu handler for panel and viz exports
  function hideMenu(menu) {
    if (!menu) return;
    menu.style.display = 'none';
    menu.removeAttribute('data-panel-id');
    menu.setAttribute('aria-hidden', 'true');
  }

  function positionMenu(menu, x, y) {
    if (!menu) return;
    menu.style.display = 'block';
    const menuWidth = menu.offsetWidth || 260;
    const menuHeight = menu.offsetHeight || 120;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    let left = x;
    let top = y;
    if (left + menuWidth > winW) left = Math.max(8, winW - menuWidth - 8);
    if (top + menuHeight > winH) top = Math.max(8, winH - menuHeight - 8);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.setAttribute('aria-hidden', 'false');
  }

  function ensurePanelHasId(panel) {
    if (!panel) return null;
    if (!panel.id) {
      panel.id = 'panel-export-' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    }
    return panel.id;
  }

  function setMenuState(menu, panelId) {
    if (!menu) return;
    const titleEl = document.getElementById('panel-export-menu-title');
    const panelSvgBtn = document.getElementById('panel-export-svg');
    const panelPngBtn = document.getElementById('panel-export-png');
    const sectionCurrent = document.getElementById('section-current-panel');
    const divider = document.getElementById('panel-export-divider');
    const sectionAll = document.getElementById('section-all-panels');
    const allSubtitle = sectionAll ? sectionAll.querySelector('.context-menu-subtitle') : null;

    // Count panels currently rendered in the viz container
    let panelCount = 0;
    try {
      panelCount = (document.querySelectorAll) ? document.querySelectorAll('.tree-panel, .comparison-panel').length : 0;
    } catch (_) { panelCount = 0; }

    // If there is no explicit panelId but exactly one panel exists on page, treat that panel as context
    if (!panelId && panelCount === 1) {
      try {
        const only = document.querySelector('.tree-panel, .comparison-panel');
        if (only && only.id) panelId = only.id;
        else if (only) panelId = ensurePanelHasId(only);
      } catch (_) { /* ignore */ }
    }

    if (panelId) {
      menu.setAttribute('data-panel-id', panelId);
      // Try to read the panel title from the panel header
      let panelTitle = null;
      try {
        const panelEl = document.getElementById(panelId);
        if (panelEl) {
          const titleNode = panelEl.querySelector('.tree-panel-header .panel-title-text') || panelEl.querySelector('.panel-title-text');
          if (titleNode && titleNode.textContent) panelTitle = titleNode.textContent.trim();
        }
      } catch (_) { panelTitle = null; }
      if (!panelTitle) panelTitle = 'Current Panel';
      if (titleEl) titleEl.textContent = `Export — ${panelTitle}`;
      // show current panel section and divider
      if (sectionCurrent) sectionCurrent.style.display = '';
      if (divider) divider.style.display = '';
      // Only show All Panels section when there are multiple panels
      if (panelCount > 1) {
        if (allSubtitle) allSubtitle.style.display = '';
        if (sectionAll) sectionAll.style.display = '';
      } else {
        if (allSubtitle) allSubtitle.style.display = 'none';
        if (sectionAll) sectionAll.style.display = 'none';
      }
      if (panelSvgBtn) { panelSvgBtn.removeAttribute('disabled'); panelSvgBtn.classList.remove('disabled'); }
      if (panelPngBtn) { panelPngBtn.removeAttribute('disabled'); panelPngBtn.classList.remove('disabled'); }
    } else {
      // No panel context and multiple panels -> show only All Panels section
      menu.removeAttribute('data-panel-id');
      if (titleEl) titleEl.textContent = `Export — All Panels`;
      if (sectionCurrent) sectionCurrent.style.display = 'none';
      if (divider) divider.style.display = 'none';
      if (allSubtitle) allSubtitle.style.display = '';
      if (sectionAll) sectionAll.style.display = '';
      if (panelSvgBtn) { panelSvgBtn.setAttribute('disabled','1'); panelSvgBtn.classList.add('disabled'); }
      if (panelPngBtn) { panelPngBtn.setAttribute('disabled','1'); panelPngBtn.classList.add('disabled'); }
    }
  }

  // Click handlers for export buttons
  function onExportPanelSvg(e) {
    const menu = document.getElementById('panel-export-menu');
    if (!menu) return;
    const panelId = menu.getAttribute('data-panel-id');
    if (!panelId) return;
    try {
      // Prefer a human-friendly filename prefix derived from the panel title
      let prefix = panelId;
      try {
        const panelEl = document.getElementById(panelId);
        if (panelEl) {
          const titleNode = panelEl.querySelector('.tree-panel-header .panel-title-text') || panelEl.querySelector('.panel-title-text');
          if (titleNode && titleNode.textContent) {
            prefix = sanitizeFilename(titleNode.textContent.trim());
          }
        }
      } catch (_) {}
      prefix = `${prefix}_export`;
      if (typeof window.exportPanelAsSVG === 'function') {
        window.exportPanelAsSVG(panelId, prefix);
      } else if (typeof window.exportSVGForContainer === 'function') {
        window.exportSVGForContainer(panelId, prefix);
      } else {
        console.warn('No panel export function available');
      }
    } catch (err) { console.warn('Export SVG failed', err); }
    hideMenu(menu);
  }

  function onExportPanelPng(e) {
    const menu = document.getElementById('panel-export-menu');
    if (!menu) return;
    const panelId = menu.getAttribute('data-panel-id');
    if (!panelId) return;
    try {
      let prefix = panelId;
      try {
        const panelEl = document.getElementById(panelId);
        if (panelEl) {
          const titleNode = panelEl.querySelector('.tree-panel-header .panel-title-text') || panelEl.querySelector('.panel-title-text');
          if (titleNode && titleNode.textContent) {
            prefix = sanitizeFilename(titleNode.textContent.trim());
          }
        }
      } catch (_) {}
      prefix = `${prefix}_export`;
      if (typeof window.exportPanelAsPNG === 'function') {
        window.exportPanelAsPNG(panelId, prefix).catch(err => console.warn('Export PNG failed', err));
      } else if (typeof window.exportPNGForContainer === 'function') {
        window.exportPNGForContainer(panelId, prefix).catch(err => console.warn('Export PNG failed', err));
      } else {
        console.warn('No panel export function available');
      }
    } catch (err) { console.warn('Export PNG failed', err); }
    hideMenu(menu);
  }

  // Sanitize a string for use as a filename prefix: remove unsafe chars, collapse whitespace, limit length
  function sanitizeFilename(s) {
    if (!s) return 'panel';
    // Replace path separators and control chars
    let out = s.replace(/[\\/\?:"<>|\x00-\x1F]/g, '');
    // Replace runs of whitespace with underscore
    out = out.replace(/\s+/g, '_');
    // Trim leading/trailing underscores and limit length
    out = out.replace(/^_+|_+$/g, '');
    if (out.length > 60) out = out.slice(0, 60);
    if (!out) return 'panel';
    return out;
  }

  function onExportAllSvg(e) {
    const menu = document.getElementById('panel-export-menu');
    if (!menu) return;
    try {
      if (typeof window.exportVizContainerAsSVG === 'function') {
        window.exportVizContainerAsSVG();
      } else if (typeof window.exportSVGForContainer === 'function') {
        // fallback: try export using viz-container id if available
        window.exportSVGForContainer('viz-container');
      } else {
        console.warn('No viz export function available');
      }
    } catch (err) { console.warn('Export All SVG failed', err); }
    hideMenu(menu);
  }

  function onExportAllPng(e) {
    const menu = document.getElementById('panel-export-menu');
    if (!menu) return;
    try {
      if (typeof window.exportVizContainerAsPNG === 'function') {
        window.exportVizContainerAsPNG().catch(err => console.warn('Export All PNG failed', err));
      } else if (typeof window.exportPNGForContainer === 'function') {
        window.exportPNGForContainer('viz-container').catch(err => console.warn('Export All PNG failed', err));
      } else {
        console.warn('No viz export function available');
      }
    } catch (err) { console.warn('Export All PNG failed', err); }
    hideMenu(menu);
  }

  // Attach global contextmenu listener
  function onContextMenu(e) {
    try {
      const target = e.target;
      if (!target) return;
      // Ignore when right-clicking on nodes/labels which have their own handlers
      if (target.closest && target.closest('.node-label, .context-menu, .panel-actions, button, .matrix-cell')) return;

      const panel = target.closest ? target.closest('.tree-panel, .comparison-panel') : null;

      // Prevent default browser menu and show our unified export menu
      e.preventDefault();
      e.stopPropagation();

      const menu = document.getElementById('panel-export-menu');
      if (!menu) return;

      if (panel) {
        const panelId = ensurePanelHasId(panel);
        setMenuState(menu, panelId);
      } else {
        setMenuState(menu, null);
      }
      positionMenu(menu, e.clientX, e.clientY);
    } catch (err) {
      // ignore
    }
  }

  function onDocumentClick(e) {
    const menu = document.getElementById('panel-export-menu');
    if (!menu) return;
    if (e.target && menu.contains(e.target)) return; // clicks inside menu shouldn't close until action
    hideMenu(menu);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      const menu = document.getElementById('panel-export-menu');
      if (menu) hideMenu(menu);
    }
  }

  // Wire up handlers
  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('keydown', onKeyDown, true);

  // Button bindings
  const btnPanelSvg = document.getElementById('panel-export-svg');
  const btnPanelPng = document.getElementById('panel-export-png');
  const btnAllSvg = document.getElementById('viz-export-svg-ctx');
  const btnAllPng = document.getElementById('viz-export-png-ctx');
  if (btnPanelSvg) btnPanelSvg.addEventListener('click', onExportPanelSvg);
  if (btnPanelPng) btnPanelPng.addEventListener('click', onExportPanelPng);
  if (btnAllSvg) btnAllSvg.addEventListener('click', onExportAllSvg);
  if (btnAllPng) btnAllPng.addEventListener('click', onExportAllPng);

  // Also hide menu on resize/scroll to avoid misplaced menu
  window.addEventListener('resize', function(){ const m = document.getElementById('panel-export-menu'); if (m) hideMenu(m); }, true);
  window.addEventListener('scroll', function(){ const m = document.getElementById('panel-export-menu'); if (m) hideMenu(m); }, true);
})();
