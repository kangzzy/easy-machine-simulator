import type { SimulationEngine } from '../simulation/SimulationEngine';
import { makeCollapsiblePanel } from './panelUtils';

export class ControlPanel {
  readonly element: HTMLDivElement;
  private playBtn!: HTMLButtonElement;
  private frameLabel!: HTMLSpanElement;
  private seekBar!: HTMLInputElement;
  private speedLabel!: HTMLSpanElement;

  constructor(private engine: SimulationEngine) {
    this.element = document.createElement('div');
    this.element.className = 'panel';
    this.element.style.cssText = 'bottom:12px;left:50%;transform:translateX(-50%);min-width:400px;';
    this.build();

    engine.on('stateChange', () => this.update());
    engine.on('frameChange', () => this.update());
  }

  private build(): void {
    const body = makeCollapsiblePanel(this.element, 'Controls');

    const row = document.createElement('div');
    row.className = 'panel-row';

    const stopBtn = this.createBtn('\u23F9', () => this.engine.stop());
    const backBtn = this.createBtn('\u23EA', () => this.engine.stepBackward());
    this.playBtn = this.createBtn('\u25B6', () => this.engine.togglePlayPause());
    const fwdBtn = this.createBtn('\u23E9', () => this.engine.stepForward());

    row.append(stopBtn, backBtn, this.playBtn, fwdBtn);

    const speedDown = this.createBtn('-', () => {
      this.engine.animationController.speed -= 0.5;
      this.update();
    });
    this.speedLabel = document.createElement('span');
    this.speedLabel.style.cssText = 'min-width:40px;text-align:center;font-size:11px;';
    const speedUp = this.createBtn('+', () => {
      this.engine.animationController.speed += 0.5;
      this.update();
    });
    row.append(speedDown, this.speedLabel, speedUp);

    body.appendChild(row);

    const seekRow = document.createElement('div');
    seekRow.className = 'panel-row';
    this.seekBar = document.createElement('input');
    this.seekBar.type = 'range';
    this.seekBar.min = '0';
    this.seekBar.max = '0';
    this.seekBar.value = '0';
    this.seekBar.style.flex = '1';
    this.seekBar.addEventListener('input', () => {
      this.engine.seekTo(parseInt(this.seekBar.value));
    });
    this.frameLabel = document.createElement('span');
    this.frameLabel.style.cssText = 'min-width:80px;text-align:right;font-size:11px;font-family:monospace;';
    seekRow.append(this.seekBar, this.frameLabel);
    body.appendChild(seekRow);

    this.update();
  }

  private createBtn(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'btn btn-icon';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private update(): void {
    const state = this.engine.animationController.state;
    this.playBtn.textContent = state === 'playing' ? '\u23F8' : '\u25B6';

    const frame = this.engine.currentFrame;
    const total = this.engine.totalFrames;
    this.frameLabel.textContent = `${frame} / ${total}`;
    this.seekBar.max = String(Math.max(0, total - 1));
    this.seekBar.value = String(frame);
    this.speedLabel.textContent = `${this.engine.animationController.speed.toFixed(1)}x`;
  }
}
