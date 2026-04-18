import type { SimulationEngine } from '../simulation/SimulationEngine';
import { makeCollapsiblePanel } from './panelUtils';

export class ViolationLog {
  readonly element: HTMLDivElement;
  private logContainer!: HTMLDivElement;
  private countLabel!: HTMLSpanElement;

  constructor(private engine: SimulationEngine) {
    this.element = document.createElement('div');
    this.element.className = 'panel panel-docked';
    this.element.style.cssText = 'max-height:260px;';
    this.build();

    engine.on('violationsUpdated', () => this.update());
  }

  private build(): void {
    const body = makeCollapsiblePanel(this.element, 'Violations');

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:4px;';
    this.countLabel = document.createElement('span');
    this.countLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);';
    this.countLabel.textContent = '0';
    header.appendChild(this.countLabel);
    body.appendChild(header);

    this.logContainer = document.createElement('div');
    this.logContainer.className = 'violation-log';
    body.appendChild(this.logContainer);
  }

  private update(): void {
    const violations = this.engine.violations;
    this.countLabel.textContent = String(violations.length);
    this.logContainer.innerHTML = '';

    for (const v of violations.slice(-100)) {
      const item = document.createElement('div');
      item.className = `violation-item ${v.violationType}`;
      item.textContent = `[${v.frameIndex}] ${v.message}`;
      item.addEventListener('click', () => {
        this.engine.seekTo(v.frameIndex);
      });
      item.style.cursor = 'pointer';
      this.logContainer.appendChild(item);
    }

    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }
}
