import { state, subscribe } from '../state/store.js';
import { setTaxonFilter } from '../services/dataLoader.js';

export class TaxonFilterPanel {
  constructor(root) {
    this.root = root;
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Enter taxon keywords (comma separated)';
    this.modeSelect = document.createElement('select');
    ['none', 'include', 'exclude'].forEach((mode) => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode;
      this.modeSelect.appendChild(option);
    });
    this.regexCheckbox = document.createElement('input');
    this.regexCheckbox.type = 'checkbox';
    const regexLabel = document.createElement('label');
    regexLabel.append(this.regexCheckbox, document.createTextNode('Use regular expressions'));
    this.caseCheckbox = document.createElement('input');
    this.caseCheckbox.type = 'checkbox';
    const caseLabel = document.createElement('label');
    caseLabel.append(this.caseCheckbox, document.createTextNode('Case sensitive'));
    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.textContent = 'Apply filter';
    applyButton.addEventListener('click', () => this.apply());

    this.root.append(this.input, this.modeSelect, regexLabel, caseLabel, applyButton);
    this.unsubscribe = subscribe('taxonFilter', () => this.syncFromState());
    this.syncFromState();
  }

  syncFromState() {
    const { patterns = [], mode = 'none', useRegex = false, caseSensitive = false } = state.taxonFilter;
    this.input.value = patterns.join(', ');
    this.modeSelect.value = mode;
    this.regexCheckbox.checked = useRegex;
    this.caseCheckbox.checked = caseSensitive;
  }

  apply() {
    const patterns = this.input.value
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    setTaxonFilter({
      patterns,
      mode: this.modeSelect.value,
      useRegex: this.regexCheckbox.checked,
      caseSensitive: this.caseCheckbox.checked
    });
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
  }
}
