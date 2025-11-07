import { state, setState, subscribe } from '../state/store.js';
import { refreshTree } from '../services/dataLoader.js';

function createSlider(labelText, key, min, max, step) {
  const wrapper = document.createElement('label');
  wrapper.className = 'control-slider';
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(state[key]);
  const valueLabel = document.createElement('span');
  valueLabel.className = 'control-slider-value';
  valueLabel.textContent = input.value;
  input.addEventListener('input', () => {
    valueLabel.textContent = input.value;
  });
  input.addEventListener('change', () => {
    const value = parseFloat(input.value);
    if (!Number.isNaN(value)) {
      setState({ [key]: value });
      refreshTree();
    }
  });
  wrapper.append(span, input, valueLabel);
  return wrapper;
}

export class LayoutControls {
  constructor(root) {
    this.root = root;
    this.layoutSelect = document.createElement('select');
    ['radial', 'cartesian'].forEach((layout) => {
      const option = document.createElement('option');
      option.value = layout;
      option.textContent = layout.charAt(0).toUpperCase() + layout.slice(1);
      this.layoutSelect.appendChild(option);
    });
    this.layoutSelect.value = state.layout;
    this.layoutSelect.addEventListener('change', () => {
      setState({ layout: this.layoutSelect.value });
      refreshTree();
    });

    this.colorSchemeSelect = document.createElement('select');
    ['Viridis', 'Turbo'].forEach((scheme) => {
      const option = document.createElement('option');
      option.value = scheme;
      option.textContent = scheme;
      this.colorSchemeSelect.appendChild(option);
    });
    this.colorSchemeSelect.value = state.colorScheme;
    this.colorSchemeSelect.addEventListener('change', () => {
      setState({ colorScheme: this.colorSchemeSelect.value });
      refreshTree();
    });

    this.showLabelsCheckbox = document.createElement('input');
    this.showLabelsCheckbox.type = 'checkbox';
    this.showLabelsCheckbox.checked = state.showLabels;
    this.showLabelsCheckbox.addEventListener('change', () => {
      setState({ showLabels: this.showLabelsCheckbox.checked });
      refreshTree();
    });

    const labelsWrapper = document.createElement('label');
    labelsWrapper.append(this.showLabelsCheckbox, document.createTextNode('Show labels'));

    this.reverseCheckbox = document.createElement('input');
    this.reverseCheckbox.type = 'checkbox';
    this.reverseCheckbox.checked = state.colorSchemeReversed;
    this.reverseCheckbox.addEventListener('change', () => {
      setState({ colorSchemeReversed: this.reverseCheckbox.checked });
      refreshTree();
    });
    const reverseWrapper = document.createElement('label');
    reverseWrapper.append(this.reverseCheckbox, document.createTextNode('Reverse color scale'));

    const nodeSlider = createSlider('Node scale', 'nodeScale', 0.5, 3, 0.1);
    const edgeSlider = createSlider('Edge scale', 'edgeScale', 0.5, 3, 0.1);

    this.root.append(
      this.layoutSelect,
      this.colorSchemeSelect,
      labelsWrapper,
      reverseWrapper,
      nodeSlider,
      edgeSlider
    );

    this.unsubscribe = subscribe('layout', () => this.sync());
    this.unsubscribeColor = subscribe('colorScheme', () => this.sync());
    this.unsubscribeLabels = subscribe('showLabels', () => this.sync());
    this.unsubscribeReverse = subscribe('colorSchemeReversed', () => this.sync());
  }

  sync() {
    this.layoutSelect.value = state.layout;
    this.colorSchemeSelect.value = state.colorScheme;
    this.showLabelsCheckbox.checked = state.showLabels;
    this.reverseCheckbox.checked = state.colorSchemeReversed;
  }

  destroy() {
    [
      this.unsubscribe,
      this.unsubscribeColor,
      this.unsubscribeLabels,
      this.unsubscribeReverse
    ].forEach((fn) => fn && fn());
  }
}
