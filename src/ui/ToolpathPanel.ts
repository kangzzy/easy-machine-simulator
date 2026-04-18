import type { SimulationEngine } from '../simulation/SimulationEngine';
import { makeCollapsiblePanel } from './panelUtils';

export class ToolpathPanel {
  readonly element: HTMLDivElement;
  private info!: HTMLDivElement;

  constructor(private engine: SimulationEngine) {
    this.element = document.createElement('div');
    this.element.className = 'panel panel-docked';
    this.build();
  }

  private build(): void {
    const body = makeCollapsiblePanel(this.element, 'Toolpath');

    // File upload button (hidden input + styled label)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.nc,.gcode,.tap,.ngc,.txt,.csv,.json';
    fileInput.id = 'toolpath-file-input';
    fileInput.addEventListener('change', () => this.handleFile(fileInput));
    body.appendChild(fileInput);

    const uploadBtn = document.createElement('label');
    uploadBtn.className = 'file-upload-btn';
    uploadBtn.htmlFor = 'toolpath-file-input';
    uploadBtn.textContent = 'Choose toolpath file...';
    body.appendChild(uploadBtn);

    // Format selector
    const formatRow = document.createElement('div');
    formatRow.className = 'panel-row';
    formatRow.style.marginTop = '6px';
    const formatSelect = document.createElement('select');
    formatSelect.style.width = '100%';
    formatSelect.innerHTML = `
      <option value="auto">Auto-detect format</option>
      <option value="gcode">G-code</option>
      <option value="point-list">Point List (CSV/JSON)</option>
      <option value="cad-lines">CAD Lines (JSON)</option>
    `;
    formatRow.appendChild(formatSelect);
    body.appendChild(formatRow);

    // Info
    this.info = document.createElement('div');
    this.info.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-top:6px;';
    this.info.textContent = 'No toolpath loaded';
    body.appendChild(this.info);

    this.engine.on('toolpathLoaded', () => {
      this.info.textContent = `${this.engine.totalFrames} points loaded`;
    });
  }

  private async handleFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;

    const label = this.element.querySelector('.file-upload-btn') as HTMLLabelElement;
    if (label) label.textContent = file.name;

    this.info.textContent = 'Loading...';
    const text = await file.text();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (['csv', 'json'].includes(ext) && !text.trimStart().startsWith('G') && !text.trimStart().startsWith('%')) {
      if (ext === 'csv') {
        this.engine.loadPointList(text);
      } else {
        this.engine.loadCADLines(text);
      }
    } else {
      this.engine.loadGCode(text);
    }
  }
}
