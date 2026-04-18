import { ControlPanel } from './ControlPanel';
import { ToolpathPanel } from './ToolpathPanel';
import { MachinePanel } from './MachinePanel';
import { ViolationLog } from './ViolationLog';
import { ViewPanel } from './ViewPanel';
import { JointControlPanel } from './JointControlPanel';
import { CablePanel } from './CablePanel';
import type { SimulationEngine } from '../simulation/SimulationEngine';

export class UIController {
  readonly controlPanel: ControlPanel;
  readonly toolpathPanel: ToolpathPanel;
  readonly machinePanel: MachinePanel;
  readonly violationLog: ViolationLog;
  readonly viewPanel: ViewPanel;
  readonly jointControlPanel: JointControlPanel;
  readonly cablePanel: CablePanel;

  constructor(private engine: SimulationEngine) {
    this.toolpathPanel = new ToolpathPanel(engine);
    this.machinePanel = new MachinePanel(engine);
    this.controlPanel = new ControlPanel(engine);
    this.violationLog = new ViolationLog(engine);
    this.viewPanel = new ViewPanel(engine);
    this.jointControlPanel = new JointControlPanel(engine);
    this.cablePanel = new CablePanel(engine);

    this.setupKeyboardShortcuts();
  }

  private static readonly PANEL_WIDTH = '260px';

  mount(container: HTMLElement): void {
    // Fixed standalone panels (centre-anchored, keep position:fixed)
    container.appendChild(this.viewPanel.element);
    container.appendChild(this.controlPanel.element);

    // Enforce uniform width on all docked panels
    const w = UIController.PANEL_WIDTH;
    this.toolpathPanel.element.style.width = w;
    this.jointControlPanel.element.style.width = w;
    this.machinePanel.element.style.width = w;
    this.violationLog.element.style.width = w;
    this.cablePanel.element.style.width = w;

    // Left column: panels stack from top, no gap.
    // ToolpathPanel → JointControlPanel, empty space fills below them.
    const leftDock = this.makeDock('left:12px;top:50px;bottom:80px;');
    leftDock.appendChild(this.toolpathPanel.element);
    leftDock.appendChild(this.jointControlPanel.element);
    container.appendChild(leftDock);

    // Right column: MachinePanel stretches to fill available height (flex:1).
    // ViolationLog and CablePanel are pinned below it — never overlap.
    const rightDock = this.makeDock('right:12px;top:50px;bottom:80px;');
    this.machinePanel.element.style.flex = '1';
    this.machinePanel.element.style.minHeight = '0';
    rightDock.appendChild(this.machinePanel.element);
    rightDock.appendChild(this.violationLog.element);
    rightDock.appendChild(this.cablePanel.element);
    container.appendChild(rightDock);
  }

  private makeDock(position: string): HTMLDivElement {
    const dock = document.createElement('div');
    dock.className = 'dock';
    dock.style.cssText = position;
    return dock;
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.engine.togglePlayPause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.engine.stepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.engine.stepBackward();
          break;
        case 'Home':
          e.preventDefault();
          this.engine.seekTo(0);
          break;
        case 'End':
          e.preventDefault();
          this.engine.seekTo(this.engine.totalFrames - 1);
          break;
        case 'KeyE':
          this.engine.toggleEnvelopeOverlay();
          break;
        case 'KeyF':
          this.engine.fitAll();
          break;
        case 'KeyR':
          this.engine.resetView();
          break;
        case 'KeyC':
          this.engine.centerView();
          break;
        case 'Numpad7':
          this.engine.setView(e.ctrlKey ? 'bottom' : 'top');
          break;
        case 'Numpad1':
          this.engine.setView(e.ctrlKey ? 'back' : 'front');
          break;
        case 'Numpad3':
          this.engine.setView(e.ctrlKey ? 'left' : 'right');
          break;
        case 'Numpad5':
          this.engine.setView('perspective');
          break;
      }
    });
  }
}
