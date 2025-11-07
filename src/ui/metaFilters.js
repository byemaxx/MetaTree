import { state, subscribe } from '../state/store.js';
import { setMetaFilter, clearMetaFilters } from '../services/dataLoader.js';

function createOption(value, checked) {
  const wrapper = document.createElement('label');
  wrapper.className = 'meta-filter-option';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.value = value;
  const span = document.createElement('span');
  span.textContent = value || '(empty)';
  wrapper.append(input, span);
  return { wrapper, input };
}

export class MetaFilterPanel {
  constructor(root) {
    this.root = root;
    this.columnsContainer = document.createElement('div');
    this.columnsContainer.className = 'meta-filter-columns';
    this.emptyHint = document.createElement('p');
    this.emptyHint.className = 'text-muted';
    this.emptyHint.textContent = 'Load a metadata file to enable filtering.';
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'btn-secondary';
    clearButton.textContent = 'Clear filters';
    clearButton.addEventListener('click', () => {
      clearMetaFilters();
    });

    this.root.append(this.columnsContainer, clearButton, this.emptyHint);
    this.unsubscribe = subscribe('meta', () => this.render());
    this.unsubscribeFilters = subscribe('metaFilters', () => this.render());
    this.render();
  }

  renderColumn(column) {
    const values = new Set();
    state.meta.rows.forEach((row) => {
      values.add(row[column] ?? '');
    });
    const active = state.metaFilters[column] || [];
    const section = document.createElement('section');
    section.className = 'meta-filter-column';
    const header = document.createElement('header');
    header.className = 'meta-filter-column-header';
    const title = document.createElement('span');
    title.textContent = column;
    header.appendChild(title);
    section.appendChild(header);
    const list = document.createElement('div');
    list.className = 'meta-filter-options';
    const inputs = [];
    Array.from(values).sort().forEach((value) => {
      const { wrapper, input } = createOption(value, active.includes(value));
      list.appendChild(wrapper);
      inputs.push(input);
    });
    section.appendChild(list);
    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.textContent = 'Apply';
    applyButton.addEventListener('click', () => {
      const selected = inputs
        .filter((input) => input.checked)
        .map((input) => input.value);
      setMetaFilter(column, selected);
    });
    section.appendChild(applyButton);
    return section;
  }

  render() {
    const columns = state.meta.columns.filter((column) => column !== 'Sample');
    this.columnsContainer.innerHTML = '';
    if (columns.length === 0) {
      this.emptyHint.style.display = 'block';
      return;
    }
    this.emptyHint.style.display = 'none';
    columns.forEach((column) => {
      this.columnsContainer.appendChild(this.renderColumn(column));
    });
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.unsubscribeFilters) this.unsubscribeFilters();
  }
}
