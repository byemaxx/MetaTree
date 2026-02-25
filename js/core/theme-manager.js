/**
 * UI theme manager: switches between soft presets and custom palettes.
 */
(function() {
    'use strict';

    const THEME_STORAGE_KEY = 'metatree_ui_theme_v1';
    const DEFAULT_THEME_ID = 'misty-blue';

    const BASE_THEME_COLORS = {
        primary: '#6b7fa8',
        secondary: '#6674db',
        background: '#f0f4f8',
        surface: '#ffffff',
        text: '#1a202c',
        success: '#52c785',
        info: '#4fa8eb',
        danger: '#f76b6b',
        treeBackground: '#f5f7fa',
        treeHeader: '#6b7fa8',
        treeHeaderText: '#ffffff',
        treeLabel: '#4a5568'
    };

    const BUILT_IN_THEME_CONFIGS = [
        {
            id: 'misty-blue',
            name: 'Misty Blue',
            description: 'Default airy blues',
            colors: {
                primary: '#6b7fa8',
                secondary: '#6674db',
                background: '#f0f4f8',
                surface: '#ffffff',
                text: '#1a202c',
                success: '#52c785',
                info: '#4fa8eb',
                danger: '#f76b6b',
                treeBackground: '#f5f7fa',
                treeHeader: '#6b7fa8'
            }
        },
        {
            id: 'warm-dawn',
            name: 'Warm Dawn',
            description: 'Peach & clay neutrals',
            colors: {
                primary: '#c07a82',
                secondary: '#f0b49a',
                background: '#fff7f2',
                surface: '#fffaf7',
                text: '#4b2e2f',
                success: '#9abf97',
                info: '#b4c7d6',
                danger: '#e0a2a2',
                treeBackground: '#fff4ed',
                treeHeader: '#c07a82'
            }
        },
        {
            id: 'forest-bath',
            name: 'Forest Bath',
            description: 'Muted greens',
            colors: {
                primary: '#5f8368',
                secondary: '#a1c181',
                background: '#f1f6f2',
                surface: '#ffffff',
                text: '#243428',
                success: '#7fb38a',
                info: '#7ba9a5',
                danger: '#d99b91',
                treeBackground: '#edf4ef',
                treeHeader: '#5f8368'
            }
        },
        {
            id: 'lavender-night',
            name: 'Lavender Night',
            description: 'Cool lilac tones',
            colors: {
                primary: '#6f6fae',
                secondary: '#b4a7d6',
                background: '#f6f5fb',
                surface: '#ffffff',
                text: '#2b243d',
                success: '#7fc2b1',
                info: '#90b8e6',
                danger: '#e1a4c2',
                treeBackground: '#f5f3fb',
                treeHeader: '#6f6fae'
            }
        },
        {
            id: 'desert-bloom',
            name: 'Desert Bloom',
            description: 'Terracotta & sage',
            colors: {
                primary: '#b26a5c',
                secondary: '#e7b07a',
                background: '#fff7f0',
                surface: '#fffbf7',
                text: '#4a332a',
                success: '#9fbf96',
                info: '#c6d8d8',
                danger: '#e8a38b',
                treeBackground: '#fff2e6',
                treeHeader: '#b26a5c'
            }
        },
        {
            id: 'nordic-coast',
            name: 'Nordic Coast',
            description: 'Teal & mist',
            colors: {
                primary: '#4b778d',
                secondary: '#8fd3e8',
                background: '#f1f7fb',
                surface: '#ffffff',
                text: '#1f2a30',
                success: '#7cc0ad',
                info: '#77b6ea',
                danger: '#f3a6a0',
                treeBackground: '#eaf4f9',
                treeHeader: '#4b778d'
            }
        },
        {
            id: 'midnight-garden',
            name: 'Midnight Garden',
            description: 'Deep blue & herbal',
            colors: {
                primary: '#38405f',
                secondary: '#6c9a8b',
                background: '#f4f6f7',
                surface: '#ffffff',
                text: '#1f2433',
                success: '#7fbf9b',
                info: '#7ab8d4',
                danger: '#e19a9a',
                treeBackground: '#edf2f2',
                treeHeader: '#38405f'
            }
        },
        {
            id: 'foggy-mono',
            name: 'Foggy Mono',
            description: 'Soft gray / off-white',
            colors: {
                primary: '#6e6f74',
                secondary: '#a0a4ab',
                background: '#f1f2f4',
                surface: '#ffffff',
                text: '#1f1f1f',
                success: '#8fb0a0',
                info: '#9fb8c8',
                danger: '#cfa5a5',
                treeBackground: '#f6f6f7',
                treeHeader: '#6e6f74'
            }
        },
        {
            id: 'theme-classic',
            name: 'Classical',
            description: 'White header, black text, classic black frame',
            colors: {
                primary: '#000000',
                secondary: '#4a4a4a',
                background: '#ffffff',
                surface: '#ffffff',
                text: '#000000',
                success: '#1b9e77',
                info: '#377eb8',
                danger: '#e41a1c',
                treeBackground: '#ffffff',
                treeHeader: '#ffffff',
                treeHeaderText: '#000000',
                treeHeaderBorder: '#000000'
            },
            previewColors: ['#000000', '#ffffff', '#ffffff'],
            propertiesOverrides: {
                '--border-color': '#000000',
                '--border-light': '#000000',
                '--tree-panel-border': '#000000',
                '--tree-panel-hover-border': '#000000',
                '--shadow-sm': 'none',
                '--shadow-md': 'none',
                '--shadow-lg': 'none',
                '--shadow-xl': 'none',
                '--app-header-bg': '#ffffff',
                '--app-header-text': '#000000',
                '--app-header-border': '2px solid #000000',
                '--app-header-outline': 'rgba(0, 0, 0, 0.45)',
                '--app-frame-border': '1px solid #000000',
                '--app-frame-shadow': 'none',
                '--comparison-modal-header-bg': '#ffffff',
                '--comparison-modal-header-text': '#000000',
                '--comparison-modal-header-border': '1px solid #000000',
                '--comparison-modal-header-icon': '#000000',
                '--comparison-modal-header-icon-hover': '#000000',
                '--comparison-modal-header-icon-bg-hover': 'rgba(0, 0, 0, 0.06)',
                /* Avoid double-thick overlap with panel border: keep only bottom header border */
                '--tree-panel-header-border-top': '0',
                '--tree-panel-header-border-right': '0',
                '--tree-panel-header-border-left': '0',
                '--tree-panel-header-border-bottom': '1px'
            }
        },
        {
            id: 'theme-void',
            name: 'Void',
            description: 'Minimal chrome, reduced shadows',
            colors: {
                primary: '#000000',
                secondary: '#4a4a4a',
                background: '#ffffff',
                surface: '#ffffff',
                text: '#000000',
                success: '#1b9e77',
                info: '#377eb8',
                danger: '#e41a1c',
                treeBackground: '#ffffff',
                treeHeader: '#ffffff',
                treeHeaderText: '#000000'
            },
            previewColors: ['#000000', '#ffffff', '#e5e5e5'],
            propertiesOverrides: {
                '--shadow-sm': 'none',
                '--shadow-md': 'none',
                '--shadow-lg': 'none',
                '--shadow-xl': 'none',
                '--app-header-bg': '#ffffff',
                '--app-header-text': '#000000',
                '--app-header-border': '1px solid #e5e5e5',
                '--app-header-outline': 'rgba(0, 0, 0, 0.35)',
                '--app-frame-border': 'none',
                '--app-frame-shadow': 'none',
                '--comparison-modal-header-bg': '#ffffff',
                '--comparison-modal-header-text': '#000000',
                '--comparison-modal-header-border': 'none',
                '--comparison-modal-header-icon': '#000000',
                '--comparison-modal-header-icon-hover': '#000000',
                '--comparison-modal-header-icon-bg-hover': 'rgba(0, 0, 0, 0.06)',
                '--tree-panel-border': 'transparent',
                '--tree-panel-hover-border': '#d0d0d0',
                /* Void: remove header strip framing by default */
                '--tree-panel-header-border-color': 'transparent'
            }
        }
    ];

    const BUILT_IN_THEMES = BUILT_IN_THEME_CONFIGS.map(materializeThemeConfig);
    const DEFAULT_THEME = BUILT_IN_THEMES.find(t => t.id === DEFAULT_THEME_ID) || BUILT_IN_THEMES[0];
    const DEFAULT_CUSTOM_COLORS = DEFAULT_THEME
        ? Object.assign({}, DEFAULT_THEME.baseColors)
        : Object.assign({}, BASE_THEME_COLORS);

    document.addEventListener('DOMContentLoaded', initThemeManager);

    function initThemeManager() {
        const panel = document.getElementById('theme-panel');
        const presetList = document.getElementById('theme-preset-list');
        if (!panel || !presetList) return;

        renderThemePresets(presetList);
        wireCustomControls();
        updateCustomInputs(DEFAULT_CUSTOM_COLORS);

        const saved = loadThemePreference();
        if (!applySavedTheme(saved)) {
            applyPresetTheme(DEFAULT_THEME, { skipSave: true });
        }
    }

    function renderThemePresets(container) {
        if (!container) return;
        const frag = document.createDocumentFragment();
        BUILT_IN_THEMES.forEach(theme => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theme-chip';
            btn.dataset.themeId = theme.id;
            btn.setAttribute('role', 'option');
            btn.setAttribute('aria-label', `${theme.name} theme`);
            btn.setAttribute('aria-selected', 'false');

            const name = document.createElement('span');
            name.className = 'theme-chip-name';
            name.textContent = theme.name;

            const desc = document.createElement('span');
            desc.className = 'theme-chip-desc';
            desc.textContent = theme.description;

            const swatches = document.createElement('div');
            swatches.className = 'theme-chip-swatches';
            theme.previewColors.forEach(color => {
                const swatch = document.createElement('span');
                swatch.className = 'theme-chip-swatch';
                swatch.style.background = color;
                swatches.appendChild(swatch);
            });

            btn.appendChild(name);
            btn.appendChild(desc);
            btn.appendChild(swatches);

            btn.addEventListener('click', function() {
                applyPresetTheme(theme);
            });

            frag.appendChild(btn);
        });
        container.innerHTML = '';
        container.appendChild(frag);
    }

    function wireCustomControls() {
        const applyBtn = document.getElementById('apply-custom-theme');
        if (applyBtn) {
            applyBtn.addEventListener('click', function() {
                const colors = readCustomColorInputs();
                applyCustomTheme(colors);
            });
        }

        const resetBtn = document.getElementById('reset-theme');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                applyPresetTheme(DEFAULT_THEME);
            });
        }

    }

    function applyPresetTheme(theme, options) {
        if (!theme) return;
        applyThemeProperties(theme.properties, theme.id);
        updateCustomInputs(theme.baseColors);
        setActivePreset(theme.id);
        if (!options || !options.skipSave) {
            saveThemePreference({ mode: 'preset', themeId: theme.id });
        }
    }

    function applyCustomTheme(colors, options) {
        const palette = sanitizeColors(Object.assign({}, DEFAULT_CUSTOM_COLORS, colors || {}));
        if (!colors || !Object.prototype.hasOwnProperty.call(colors, 'treeLabel')) {
            palette.treeLabel = normalizeHex(mixColors(
                palette.text || DEFAULT_CUSTOM_COLORS.text || BASE_THEME_COLORS.text,
                palette.surface || DEFAULT_CUSTOM_COLORS.surface || BASE_THEME_COLORS.surface,
                0.22
            ));
        }
        const props = buildThemeProperties(palette);
        applyThemeProperties(props, 'custom');
        updateCustomInputs(palette);
        setActivePreset(null);
        if (!options || !options.skipSave) {
            saveThemePreference({ mode: 'custom', colors: palette });
        }
    }

    function applyThemeProperties(properties, themeId) {
        const root = document.documentElement;
        if (!root || !properties) return;
        Object.entries(properties).forEach(([name, value]) => {
            if (name && typeof value === 'string') {
                root.style.setProperty(name, value);
            }
        });
        if (themeId) {
            root.dataset.theme = themeId;
        } else if (root.dataset && root.dataset.theme) {
            delete root.dataset.theme;
        }
    }

    function setActivePreset(themeId) {
        const buttons = document.querySelectorAll('#theme-preset-list .theme-chip');
        buttons.forEach(btn => {
            const isActive = themeId && btn.dataset.themeId === themeId;
            btn.classList.toggle('active', !!isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    function updateCustomInputs(colors) {
        if (!colors) return;
        const map = {
            primary: document.getElementById('custom-theme-primary'),
            secondary: document.getElementById('custom-theme-secondary'),
            background: document.getElementById('custom-theme-background'),
            surface: document.getElementById('custom-theme-surface'),
            text: document.getElementById('custom-theme-text'),
            treeBackground: document.getElementById('custom-theme-tree-bg'),
            treeHeader: document.getElementById('custom-theme-tree-header'),
            treeHeaderText: document.getElementById('custom-theme-tree-header-text'),
            treeLabel: document.getElementById('custom-theme-tree-label'),
            treeHeaderBorder: document.getElementById('custom-theme-tree-header-border')
        };
        Object.entries(map).forEach(([key, input]) => {
            if (input && colors[key]) {
                input.value = normalizeHex(colors[key]);
            }
        });

        // Default: header border follows header background unless explicitly set.
        if (map.treeHeaderBorder && !colors.treeHeaderBorder) {
            const fallback = colors.treeHeader || DEFAULT_CUSTOM_COLORS.treeHeader || BASE_THEME_COLORS.treeHeader;
            map.treeHeaderBorder.value = normalizeHex(fallback);
        }
        if (map.treeLabel && !colors.treeLabel) {
            const fallback = mixColors(
                colors.text || DEFAULT_CUSTOM_COLORS.text || BASE_THEME_COLORS.text,
                colors.surface || DEFAULT_CUSTOM_COLORS.surface || BASE_THEME_COLORS.surface,
                0.22
            );
            map.treeLabel.value = normalizeHex(fallback);
        }
    }

    function readCustomColorInputs() {
        return {
            primary: valueFromInput('custom-theme-primary'),
            secondary: valueFromInput('custom-theme-secondary'),
            background: valueFromInput('custom-theme-background'),
            surface: valueFromInput('custom-theme-surface'),
            text: valueFromInput('custom-theme-text'),
            treeBackground: valueFromInput('custom-theme-tree-bg'),
            treeHeader: valueFromInput('custom-theme-tree-header'),
            treeHeaderText: valueFromInput('custom-theme-tree-header-text'),
            treeLabel: valueFromInput('custom-theme-tree-label'),
            treeHeaderBorder: valueFromInput('custom-theme-tree-header-border')
        };
    }

    function valueFromInput(id) {
        const el = document.getElementById(id);
        return el ? el.value : null;
    }

    function loadThemePreference() {
        try {
            const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            console.warn('MetaTree theme: unable to load preference', err);
            return null;
        }
    }

    function saveThemePreference(payload) {
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.warn('MetaTree theme: unable to save preference', err);
        }
    }

    function applySavedTheme(saved) {
        if (!saved) return false;
        if (saved.mode === 'preset' && saved.themeId) {
            const match = BUILT_IN_THEMES.find(t => t.id === saved.themeId);
            if (match) {
                applyPresetTheme(match, { skipSave: true });
                return true;
            }
        }
        if (saved.mode === 'custom' && saved.colors) {
            applyCustomTheme(saved.colors, { skipSave: true });
            return true;
        }
        return false;
    }

    function materializeThemeConfig(config) {
        const configColors = (config && config.colors && typeof config.colors === 'object')
            ? config.colors
            : {};
        const mergedColors = Object.assign({}, BASE_THEME_COLORS, configColors);
        if (!Object.prototype.hasOwnProperty.call(configColors, 'treeLabel')) {
            mergedColors.treeLabel = mixColors(
                mergedColors.text || BASE_THEME_COLORS.text,
                mergedColors.surface || BASE_THEME_COLORS.surface,
                0.22
            );
        }
        const colors = sanitizeColors(mergedColors);
        const overrides = (config && config.propertiesOverrides && typeof config.propertiesOverrides === 'object')
            ? config.propertiesOverrides
            : null;
        const properties = Object.assign({}, buildThemeProperties(colors), sanitizePropertiesOverrides(overrides));
        return {
            id: config.id,
            name: config.name,
            description: config.description,
            baseColors: colors,
            previewColors: config.previewColors || [colors.primary, colors.secondary, colors.background],
            properties
        };
    }

    function sanitizePropertiesOverrides(overrides) {
        const result = {};
        if (!overrides) return result;
        Object.entries(overrides).forEach(([key, value]) => {
            if (!key || typeof key !== 'string') return;
            if (typeof value !== 'string') return;
            result[key] = value;
        });
        return result;
    }

    function sanitizeColors(colors) {
        const result = {};
        Object.entries(colors || {}).forEach(([key, value]) => {
            result[key] = normalizeHex(value);
        });
        return result;
    }

    function normalizeHex(value) {
        if (!value) return '#000000';
        let hex = String(value).trim();
        if (!hex.startsWith('#')) {
            hex = `#${hex}`;
        }
        if (hex.length === 4) {
            hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        }
        if (hex.length !== 7) {
            return '#000000';
        }
        return hex.toLowerCase();
    }

    function buildThemeProperties(colors) {
        const primary = normalizeHex(colors.primary || DEFAULT_CUSTOM_COLORS.primary);
        const secondary = normalizeHex(colors.secondary || DEFAULT_CUSTOM_COLORS.secondary);
        const background = normalizeHex(colors.background || DEFAULT_CUSTOM_COLORS.background);
        const surface = normalizeHex(colors.surface || DEFAULT_CUSTOM_COLORS.surface);
        const text = normalizeHex(colors.text || DEFAULT_CUSTOM_COLORS.text);
        const success = normalizeHex(colors.success || DEFAULT_CUSTOM_COLORS.success);
        const info = normalizeHex(colors.info || DEFAULT_CUSTOM_COLORS.info);
        const danger = normalizeHex(colors.danger || DEFAULT_CUSTOM_COLORS.danger);
        const treeBackground = normalizeHex(colors.treeBackground || DEFAULT_CUSTOM_COLORS.treeBackground);
        const treeHeader = normalizeHex(colors.treeHeader || DEFAULT_CUSTOM_COLORS.treeHeader);
        const treeHeaderText = normalizeHex(colors.treeHeaderText || DEFAULT_CUSTOM_COLORS.treeHeaderText || '#ffffff');
        const treeLabel = normalizeHex(colors.treeLabel || mixColors(text, surface, 0.22));
        // Default: border matches the header background (invisible). Classic can set it to black.
        const treeHeaderBorder = normalizeHex(colors.treeHeaderBorder || treeHeader);

        const primaryDark = adjustColor(primary, -12);
        const primaryLight = adjustColor(primary, 18);
        const secondaryDark = adjustColor(secondary, -10);
        const backgroundLight = mixColors(background, surface, 0.75);
        const backgroundLighter = mixColors(background, surface, 0.9);
        const border = mixColors(surface, text, 0.1);
        const borderLight = mixColors(surface, background, 0.8);
        const textSecondary = mixColors(text, surface, 0.4);
        const textLight = mixColors(text, surface, 0.65);
        const successDark = adjustColor(success, -10);
        const infoDark = adjustColor(info, -12);
        const dangerDark = adjustColor(danger, -10);
        const treeBackgroundAlt = adjustColor(treeBackground, 6);
        const treeBorder = mixColors(treeBackground, text, 0.15);
        const treeBorderHover = mixColors(treeBorder, primary, 0.35);
        const treeHeaderEnd = adjustColor(treeHeader, -12);

        // These tokens may be overridden by certain presets. Always emit them so theme switching
        // resets prior overrides (inline CSS variables persist until explicitly overwritten).
        const shadowSm = '0 1px 2px rgba(0, 0, 0, 0.04)';
        const shadowMd = '0 2px 4px rgba(0, 0, 0, 0.06)';
        const shadowLg = '0 4px 8px rgba(0, 0, 0, 0.08)';
        const shadowXl = '0 8px 16px rgba(0, 0, 0, 0.1)';

        const gradientPrimary = `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)`;
        const gradientPrimaryHover = `linear-gradient(135deg, ${primaryDark} 0%, ${adjustColor(primaryDark, -12)} 100%)`;
        const scrollbarPanelTrack = mixColors(background, surface, 0.7);
        const scrollbarThumb = hexToRgba(primaryLight, 0.2);
        const scrollbarThumbHover = hexToRgba(primary, 0.8);
        const scrollbarSoftThumb = hexToRgba(primaryLight, 0.28);
        const scrollbarSoftThumbHover = hexToRgba(primary, 0.75);
        const scrollbarSoftColor = hexToRgba(primaryLight, 0.35);
        const rangeTrackColor = mixColors(surface, text, 0.2);
        const rangeTrackColorHover = mixColors(surface, text, 0.3);
        const rangeTrackFill = primaryDark;
        const rangeThumbColor = surface;
        const rangeThumbBorder = primaryDark;

        return {
            '--primary-color': primary,
            '--primary-dark': primaryDark,
            '--primary-light': primaryLight,
            '--secondary-color': secondary,
            '--secondary-dark': secondaryDark,
            '--success-color': success,
            '--success-dark': successDark,
            '--danger-color': danger,
            '--danger-dark': dangerDark,
            '--info-color': info,
            '--info-dark': infoDark,
            '--text-primary': text,
            '--text-secondary': textSecondary,
            '--text-light': textLight,
            '--border-color': border,
            '--border-light': borderLight,
            '--bg-white': surface,
            '--bg-light': backgroundLight,
            '--bg-lighter': backgroundLighter,
            '--bg-body': background,
            '--gradient-primary': gradientPrimary,
            '--gradient-primary-hover': gradientPrimaryHover,
            '--gradient-success': `linear-gradient(135deg, ${success} 0%, ${successDark} 100%)`,
            '--gradient-info': `linear-gradient(135deg, ${info} 0%, ${infoDark} 100%)`,
            '--gradient-danger': `linear-gradient(135deg, ${danger} 0%, ${dangerDark} 100%)`,
            '--gradient-bg': `linear-gradient(135deg, ${mixColors(background, surface, 0.6)} 0%, ${surface} 100%)`,
            '--gradient-accent': `linear-gradient(135deg, ${secondary} 0%, ${primary} 100%)`,

            '--scrollbar-track': 'transparent',
            '--scrollbar-thumb': scrollbarThumb,
            '--scrollbar-thumb-hover': scrollbarThumbHover,
            '--scrollbar-panel-track': scrollbarPanelTrack,
            '--scrollbar-panel-thumb': gradientPrimary,
            '--scrollbar-panel-thumb-hover': gradientPrimaryHover,
            '--scrollbar-soft-thumb': scrollbarSoftThumb,
            '--scrollbar-soft-thumb-hover': scrollbarSoftThumbHover,
            '--scrollbar-soft-color': scrollbarSoftColor,
            '--range-track-color': rangeTrackColor,
            '--range-track-color-hover': rangeTrackColorHover,
            '--range-track-fill': rangeTrackFill,
            '--range-thumb-color': rangeThumbColor,
            '--range-thumb-border': rangeThumbBorder,

            // Shadows: required for theme switching to undo presets that remove them.
            '--shadow-sm': shadowSm,
            '--shadow-md': shadowMd,
            '--shadow-lg': shadowLg,
            '--shadow-xl': shadowXl,

            // App-level surfaces: default to original behavior; presets can override.
            '--app-header-bg': gradientPrimary,
            '--app-header-text': '#ffffff',
            '--app-header-border': 'none',
            '--app-header-outline': 'rgba(255, 255, 255, 0.6)',
            '--app-frame-border': 'none',
            '--app-frame-shadow': shadowLg,

            // Comparison modal header: default matches previous CSS fallbacks.
            '--comparison-modal-header-bg': backgroundLight,
            '--comparison-modal-header-text': text,
            '--comparison-modal-header-border': `1px solid ${borderLight}`,
            '--comparison-modal-header-icon': textSecondary,
            '--comparison-modal-header-icon-hover': text,
            '--comparison-modal-header-icon-bg-hover': 'rgba(0, 0, 0, 0.06)',

            '--tree-panel-bg': treeBackground,
            '--tree-panel-bg-alt': treeBackgroundAlt,
            '--tree-panel-border': treeBorder,
            '--tree-panel-hover-border': treeBorderHover,
            '--tree-panel-header-start': treeHeader,
            '--tree-panel-header-end': treeHeaderEnd,
            '--tree-panel-header-text': treeHeaderText,
            '--tree-label-default-color': treeLabel,
            '--tree-panel-header-border-color': treeHeaderBorder,
            // Ensure per-side header border widths reset when switching themes.
            // Classical overrides these to avoid double-thick overlap with panel borders.
            '--tree-panel-header-border-width': '1px',
            '--tree-panel-header-border-top': '1px',
            '--tree-panel-header-border-right': '1px',
            '--tree-panel-header-border-bottom': '1px',
            '--tree-panel-header-border-left': '1px',
            '--shadow-primary': `0 4px 8px ${hexToRgba(primary, 0.18)}`,
            '--shadow-success': `0 4px 8px ${hexToRgba(success, 0.22)}`
        };
    }

    function adjustColor(hex, amount) {
        const rgb = hexToRgb(hex);
        const factor = (100 + amount) / 100;
        return rgbToHex({
            r: clamp(Math.round(rgb.r * factor), 0, 255),
            g: clamp(Math.round(rgb.g * factor), 0, 255),
            b: clamp(Math.round(rgb.b * factor), 0, 255)
        });
    }

    function mixColors(a, b, weight) {
        const colorA = hexToRgb(a);
        const colorB = hexToRgb(b);
        const w = typeof weight === 'number' ? weight : 0.5;
        const ratio = clamp(w, 0, 1);
        const inverse = 1 - ratio;
        return rgbToHex({
            r: clamp(Math.round(colorA.r * inverse + colorB.r * ratio), 0, 255),
            g: clamp(Math.round(colorA.g * inverse + colorB.g * ratio), 0, 255),
            b: clamp(Math.round(colorA.b * inverse + colorB.b * ratio), 0, 255)
        });
    }


    function hexToRgb(hex) {
        const normalized = normalizeHex(hex);
        const r = parseInt(normalized.slice(1, 3), 16);
        const g = parseInt(normalized.slice(3, 5), 16);
        const b = parseInt(normalized.slice(5, 7), 16);
        return { r, g, b };
    }

    function rgbToHex(rgb) {
        const toHex = value => {
            const hex = clamp(value, 0, 255).toString(16);
            return hex.length === 1 ? `0${hex}` : hex;
        };
        return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
    }

    function hexToRgba(hex, alpha) {
        const { r, g, b } = hexToRgb(hex);
        return `rgba(${r}, ${g}, ${b}, ${typeof alpha === 'number' ? alpha : 1})`;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

})();
