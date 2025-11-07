import { loadAbundanceFile, loadMetaFile } from '../services/dataLoader.js';
import { subscribe, state } from '../state/store.js';

export class DataLoaderPanel {
  constructor(root) {
    this.root = root;
    this.dataInput = document.createElement('input');
    this.dataInput.type = 'file';
    this.dataInput.accept = '.tsv,.csv,.txt';
    this.metaInput = document.createElement('input');
    this.metaInput.type = 'file';
    this.metaInput.accept = '.tsv,.csv,.txt';
    this.dataLabel = document.createElement('span');
    this.metaLabel = document.createElement('span');
    this.dataLabel.textContent = 'No abundance file selected';
    this.metaLabel.textContent = 'No metadata file selected';

    this.dataInput.addEventListener('change', (event) => {
      const [file] = event.target.files;
      if (file) {
        this.dataLabel.textContent = file.name;
        loadAbundanceFile(file);
      }
    });
    this.metaInput.addEventListener('change', (event) => {
      const [file] = event.target.files;
      if (file) {
        this.metaLabel.textContent = file.name;
        loadMetaFile(file);
      }
    });

    const dataRow = document.createElement('div');
    dataRow.className = 'file-input-row';
    const dataLabel = document.createElement('label');
    dataLabel.textContent = 'Abundance file';
    dataLabel.appendChild(this.dataInput);
    dataRow.append(dataLabel, this.dataLabel);

    const metaRow = document.createElement('div');
    metaRow.className = 'file-input-row';
    const metaLabel = document.createElement('label');
    metaLabel.textContent = 'Metadata file';
    metaLabel.appendChild(this.metaInput);
    metaRow.append(metaLabel, this.metaLabel);

    this.root.append(dataRow, metaRow);
    this.unsubscribe = subscribe('loading', () => this.syncLoading());
    this.syncLoading();
  }

  syncLoading() {
    const { loading } = state;
    this.dataInput.disabled = loading.data;
    this.metaInput.disabled = loading.meta;
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
  }
}
