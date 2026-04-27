import { ControlPanel } from './ControlPanel';
import { ToolpathPanel } from './ToolpathPanel';
import { MachinePanel } from './MachinePanel';
import { ViolationLog } from './ViolationLog';
import { ViewPanel } from './ViewPanel';
import { JointControlPanel } from './JointControlPanel';
import { CablePanel } from './CablePanel';
import { DeploymentCasePanel } from './DeploymentCasePanel';
import { applyStage, captureStage, exportStageToFile, importStageFromFile } from '../persistence/StageIO';
import type { SimulationEngine } from '../simulation/SimulationEngine';

export class UIController {
  readonly controlPanel: ControlPanel;
  readonly toolpathPanel: ToolpathPanel;
  readonly machinePanel: MachinePanel;
  readonly violationLog: ViolationLog;
  readonly viewPanel: ViewPanel;
  readonly jointControlPanel: JointControlPanel;
  readonly cablePanel: CablePanel;
  readonly deploymentCasePanel: DeploymentCasePanel;

  constructor(private engine: SimulationEngine) {
    this.toolpathPanel = new ToolpathPanel(engine);
    this.machinePanel = new MachinePanel(engine);
    this.controlPanel = new ControlPanel(engine);
    this.violationLog = new ViolationLog(engine);
    this.viewPanel = new ViewPanel(engine);
    this.jointControlPanel = new JointControlPanel(engine);
    this.cablePanel = new CablePanel(engine);
    this.deploymentCasePanel = new DeploymentCasePanel(engine);

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
    this.deploymentCasePanel.element.style.width = w;

    // Left column: panels stack from top, no gap.
    // ToolpathPanel → JointControlPanel, empty space fills below them.
    const leftDock = this.makeDock('left:12px;top:50px;bottom:80px;');
    leftDock.appendChild(this.toolpathPanel.element);
    leftDock.appendChild(this.jointControlPanel.element);
    container.appendChild(leftDock);

    // Right column: DeploymentCasePanel on top, MachinePanel stretches to fill,
    // ViolationLog and CablePanel pinned below it.
    const rightDock = this.makeDock('right:12px;top:50px;bottom:80px;');
    this.deploymentCasePanel.element.style.flex = '0 0 auto';
    this.machinePanel.element.style.flex = '1';
    this.machinePanel.element.style.minHeight = '0';
    rightDock.appendChild(this.deploymentCasePanel.element);
    rightDock.appendChild(this.machinePanel.element);
    rightDock.appendChild(this.violationLog.element);
    rightDock.appendChild(this.cablePanel.element);
    container.appendChild(rightDock);

    // Stage I/O toolbar (top-left, beside ThemeToggle on right)
    container.appendChild(this.buildStageToolbar());
  }

  private buildStageToolbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:fixed;top:12px;left:50%;transform:translateX(-50%);
      display:flex;gap:6px;z-index:200;
      background:var(--panel-bg);border:1px solid var(--panel-border);
      border-radius:6px;padding:4px 6px;backdrop-filter:blur(12px);
    `;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.style.cssText = 'font-size:11px;padding:4px 10px;';
    saveBtn.textContent = '\uD83D\uDCBE 스테이지 저장';
    saveBtn.title = '현재 화면 구성을 JSON으로 저장 (Ctrl+S)';
    saveBtn.addEventListener('click', () => this.saveStage());

    const loadInput = document.createElement('input');
    loadInput.type = 'file';
    loadInput.accept = '.json';
    loadInput.style.display = 'none';
    loadInput.addEventListener('change', async () => {
      const file = loadInput.files?.[0];
      if (!file) return;
      try {
        const snap = await importStageFromFile(file);
        await applyStage(this.engine, snap);
      } catch (e: any) {
        alert(`스테이지 불러오기 실패: ${e.message ?? e}`);
      } finally {
        loadInput.value = '';
      }
    });

    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn';
    loadBtn.style.cssText = 'font-size:11px;padding:4px 10px;';
    loadBtn.textContent = '\uD83D\uDCC2 스테이지 불러오기';
    loadBtn.title = 'JSON에서 화면 구성 복원 (Ctrl+O)';
    loadBtn.addEventListener('click', () => loadInput.click());

    bar.append(saveBtn, loadBtn, loadInput);

    // Expose for hotkeys
    this._stageLoadInput = loadInput;
    return bar;
  }

  private _stageLoadInput: HTMLInputElement | null = null;

  private saveStage(): void {
    const snap = captureStage(this.engine);
    exportStageToFile(snap);
  }

  private makeDock(position: string): HTMLDivElement {
    const dock = document.createElement('div');
    dock.className = 'dock';
    dock.style.cssText = position;
    return dock;
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      // Ctrl+S / Ctrl+O always work, even when focus is in inputs
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        this.saveStage();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') {
        e.preventDefault();
        this._stageLoadInput?.click();
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;

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
        case 'KeyS':
          this.engine.toggleStrokeEnvelope();
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
