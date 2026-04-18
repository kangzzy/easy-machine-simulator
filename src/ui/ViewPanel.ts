import type { SimulationEngine } from '../simulation/SimulationEngine';

export class ViewPanel {
  readonly element: HTMLDivElement;
  private collapsed = false;
  private body!: HTMLDivElement;
  private toggleBtn!: HTMLButtonElement;

  constructor(private engine: SimulationEngine) {
    this.element = document.createElement('div');
    this.element.className = 'panel';
    this.element.style.cssText = 'top:50px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:4px;align-items:center;padding:8px 10px;';
    this.build();
  }

  private build(): void {
    // Collapse toggle row (top of panel)
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;margin-bottom:2px;';

    const title = document.createElement('span');
    title.style.cssText = 'font-size:10px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
    title.textContent = 'View';

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:10px;color:var(--text-secondary);padding:0 2px;';
    this.toggleBtn.textContent = '▼';
    this.toggleBtn.addEventListener('click', () => this.toggle());

    topBar.append(title, this.toggleBtn);
    this.element.appendChild(topBar);

    // Body with the actual view controls
    this.body = document.createElement('div');
    this.body.style.cssText = 'display:flex;flex-direction:column;gap:4px;align-items:center;';
    this.element.appendChild(this.body);

    // Row 1: Camera tools
    const toolRow = document.createElement('div');
    toolRow.style.cssText = 'display:flex;gap:3px;';

    toolRow.appendChild(this.makeBtn('Reset', '\u2302', 'Reset to default view (Home)', () => this.engine.resetView()));
    toolRow.appendChild(this.makeBtn('Fit', '\u2922', 'Fit all objects in view', () => this.engine.fitAll()));
    toolRow.appendChild(this.makeBtn('Center', '\u2316', 'Center view on origin', () => this.engine.centerView()));

    // Separator
    const sep1 = document.createElement('span');
    sep1.style.cssText = 'width:1px;height:20px;background:var(--panel-border);margin:0 2px;';
    toolRow.appendChild(sep1);

    // Envelope + Export
    const envBtn = this.makeBtn('Env', '\u25A1', 'Toggle work envelope (E)', () => {
      envBtn.classList.toggle('active');
      this.engine.toggleEnvelopeOverlay();
    });
    toolRow.appendChild(envBtn);
    toolRow.appendChild(this.makeBtn('Export', '\u21E9', 'Export report', () => this.engine.exportReport()));

    this.body.appendChild(toolRow);

    // Row 2: Standard views
    const viewRow = document.createElement('div');
    viewRow.style.cssText = 'display:flex;gap:2px;';

    const views: { label: string; value: string; icon: string; title: string }[] = [
      { label: '3D',    value: 'perspective', icon: '\u2B1A', title: 'Perspective view' },
      { label: 'Top',   value: 'top',        icon: '\u2B07', title: 'Top view (XZ plane)' },
      { label: 'Bottom',value: 'bottom',     icon: '\u2B06', title: 'Bottom view' },
      { label: 'Front', value: 'front',      icon: '\u25CE', title: 'Front view (XY plane)' },
      { label: 'Back',  value: 'back',       icon: '\u25CB', title: 'Back view' },
      { label: 'Left',  value: 'left',       icon: '\u25C0', title: 'Left view (YZ plane)' },
      { label: 'Right', value: 'right',      icon: '\u25B6', title: 'Right view' },
    ];

    let activeBtn: HTMLButtonElement | null = null;

    for (const v of views) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.cssText = 'font-size:10px;padding:3px 6px;min-width:0;';
      btn.textContent = v.label;
      btn.title = v.title;
      if (v.value === 'perspective') {
        btn.classList.add('active');
        activeBtn = btn;
      }
      btn.addEventListener('click', () => {
        activeBtn?.classList.remove('active');
        btn.classList.add('active');
        activeBtn = btn;
        this.engine.setView(v.value as any);
      });
      viewRow.appendChild(btn);
    }

    this.body.appendChild(viewRow);
  }

  private toggle(): void {
    this.collapsed = !this.collapsed;
    this.body.style.display = this.collapsed ? 'none' : '';
    this.toggleBtn.style.transform = this.collapsed ? 'rotate(-90deg)' : '';
  }

  private makeBtn(label: string, icon: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.cssText = 'font-size:11px;padding:4px 8px;display:flex;align-items:center;gap:3px;';
    btn.innerHTML = `<span style="font-size:13px;">${icon}</span><span>${label}</span>`;
    btn.title = title;
    btn.addEventListener('click', onClick);
    return btn;
  }
}
