import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { CableDefinition, CableViolation } from '../machine/CableRouter';
import { makeCollapsiblePanel } from './panelUtils';

export class CablePanel {
  readonly element: HTMLDivElement;
  private listContainer!: HTMLDivElement;
  private violationContainer!: HTMLDivElement;
  private expandedId: string | null = null;

  constructor(private engine: SimulationEngine) {
    this.element = document.createElement('div');
    this.element.className = 'panel panel-docked';
    this.element.style.cssText = 'max-height:350px;overflow-y:auto;';
    this.build();

    engine.on('machineChanged', () => this.refresh());
    engine.on('cableViolation', () => this.refreshViolations());
  }

  private build(): void {
    const body = makeCollapsiblePanel(this.element, 'Cables / Tubes');

    // Add cable button row
    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.style.cssText = 'font-size:11px;padding:3px 8px;width:100%;margin-bottom:6px;';
    addBtn.textContent = '+ Add Cable';
    addBtn.addEventListener('click', () => this.showAddCableDialog());
    body.appendChild(addBtn);

    this.listContainer = document.createElement('div');
    body.appendChild(this.listContainer);

    // Violations section
    const violTitle = document.createElement('h3');
    violTitle.textContent = 'Cable Violations';
    violTitle.style.cssText = 'margin:8px 0 4px;';
    body.appendChild(violTitle);

    this.violationContainer = document.createElement('div');
    this.violationContainer.className = 'violation-log';
    this.violationContainer.style.maxHeight = '120px';
    body.appendChild(this.violationContainer);

    this.refresh();
  }

  refresh(): void {
    this.listContainer.innerHTML = '';
    const cables = this.engine.getCables();

    if (cables.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11px;color:var(--text-secondary);text-align:center;padding:8px;';
      empty.textContent = 'No cables defined';
      this.listContainer.appendChild(empty);
      return;
    }

    for (const cable of cables) {
      this.listContainer.appendChild(this.buildCableRow(cable));
    }
  }

  private refreshViolations(): void {
    this.violationContainer.innerHTML = '';
    const violations = this.engine.getCableViolations();

    if (violations.length === 0) {
      const ok = document.createElement('div');
      ok.style.cssText = 'font-size:11px;color:var(--success);padding:4px;';
      ok.textContent = 'No violations';
      this.violationContainer.appendChild(ok);
      return;
    }

    for (const v of violations) {
      const item = document.createElement('div');
      item.className = `violation-item ${v.type === 'curvature' ? 'workspace' : 'joint-limit'}`;
      item.style.cssText += 'cursor:pointer;font-size:10px;padding:3px 6px;';
      const icon = v.type === 'curvature' ? '\u2B55' : '\u{1F504}';
      item.textContent = `${icon} ${v.cableName}: ${v.message}`;
      this.violationContainer.appendChild(item);
    }
  }

  private buildCableRow(cable: CableDefinition): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:4px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:11px;transition:background 0.1s;';
    header.addEventListener('mouseenter', () => header.style.background = 'rgba(255,255,255,0.04)');
    header.addEventListener('mouseleave', () => { if (this.expandedId !== cable.id) header.style.background = ''; });

    const colorDot = document.createElement('span');
    colorDot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:#${cable.color.toString(16).padStart(6,'0')};flex-shrink:0;`;

    const name = document.createElement('span');
    name.style.cssText = 'flex:1;color:var(--text-primary);';
    name.textContent = cable.name;

    const info = document.createElement('span');
    info.style.cssText = 'font-size:9px;color:var(--text-secondary);';
    info.textContent = `R\u2265${cable.minBendRadius}mm`;

    const delBtn = document.createElement('button');
    delBtn.style.cssText = 'background:none;border:none;color:var(--danger);cursor:pointer;font-size:12px;padding:0 3px;';
    delBtn.textContent = '\u2715';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.removeCable(cable.id);
      this.refresh();
    });

    header.append(colorDot, name, info, delBtn);
    header.addEventListener('click', () => {
      this.expandedId = this.expandedId === cable.id ? null : cable.id;
      this.refresh();
    });
    row.appendChild(header);

    if (this.expandedId === cable.id) {
      row.appendChild(this.buildCableEditor(cable));
    }

    return row;
  }

  private buildCableEditor(cable: CableDefinition): HTMLDivElement {
    const ed = document.createElement('div');
    ed.className = 'panel-editor';
    ed.style.cssText = 'padding:6px;background:rgba(30,30,55,0.6);border-radius:4px;margin:2px 0;border:1px solid rgba(255,170,0,0.15);';

    ed.appendChild(this.inputRow('Name', cable.name, (v) => {
      this.engine.updateCable(cable.id, { name: v });
      this.refresh();
    }));

    ed.appendChild(this.numRow('Min Bend R', cable.minBendRadius, 1, 1000, 1, 'mm', (v) => {
      this.engine.updateCable(cable.id, { minBendRadius: v });
      cable.minBendRadius = v;
    }));

    ed.appendChild(this.numRow('Max Twist', cable.maxTwistDeg, 0, 3600, 10, '\u00B0', (v) => {
      this.engine.updateCable(cable.id, { maxTwistDeg: v });
      cable.maxTwistDeg = v;
    }));

    ed.appendChild(this.numRow('Diameter', cable.diameter, 1, 100, 1, 'mm', (v) => {
      this.engine.updateCable(cable.id, { diameter: v });
      cable.diameter = v;
    }));

    ed.appendChild(this.numRow('Slack', cable.slack, 0, 2, 0.05, '', (v) => {
      this.engine.updateCable(cable.id, { slack: v });
      cable.slack = v;
    }));

    // Stiffness enforcement toggle
    const stiffRow = document.createElement('div');
    stiffRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';
    const stiffLbl = document.createElement('span');
    stiffLbl.style.cssText = 'font-size:10px;color:var(--text-secondary);';
    stiffLbl.textContent = 'Enforce Stiffness';
    const stiffToggle = document.createElement('input');
    stiffToggle.type = 'checkbox';
    stiffToggle.checked = cable.stiffnessEnforced;
    stiffToggle.title = 'Limit joint movement when this cable would be over-bent';
    stiffToggle.addEventListener('change', () => {
      cable.stiffnessEnforced = stiffToggle.checked;
      this.engine.updateCable(cable.id, { stiffnessEnforced: stiffToggle.checked });
    });
    stiffRow.append(stiffLbl, stiffToggle);
    ed.appendChild(stiffRow);

    const apLabel = document.createElement('div');
    apLabel.style.cssText = 'font-size:10px;color:var(--text-secondary);margin:6px 0 2px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
    apLabel.textContent = 'Attach Points';
    ed.appendChild(apLabel);

    const components = this.engine.getMachineComponents();
    for (let i = 0; i < cable.attachPoints.length; i++) {
      const ap = cable.attachPoints[i];
      const apIdx = i;

      const apBlock = document.createElement('div');
      apBlock.className = 'panel-inset';
      apBlock.style.cssText = 'margin-bottom:6px;padding:4px 6px;background:rgba(255,255,255,0.03);border-radius:4px;border:1px solid rgba(80,80,120,0.3);';

      // Row 1: index + component selector + remove
      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;align-items:center;gap:3px;margin-bottom:4px;';

      const idx = document.createElement('span');
      idx.style.cssText = 'font-size:9px;color:var(--text-secondary);min-width:14px;flex-shrink:0;';
      idx.textContent = `${i + 1}.`;

      const sel = document.createElement('select');
      sel.style.cssText = 'flex:1;font-size:10px;min-width:0;';
      for (const c of components) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (c.id === ap.componentId) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        cable.attachPoints[apIdx].componentId = sel.value;
        this.engine.updateCable(cable.id, { attachPoints: cable.attachPoints });
        this.engine.updateCables();
      });

      const removeApBtn = document.createElement('button');
      removeApBtn.style.cssText = 'background:none;border:none;color:var(--danger);cursor:pointer;font-size:10px;flex-shrink:0;';
      removeApBtn.textContent = '\u2715';
      removeApBtn.addEventListener('click', () => {
        cable.attachPoints.splice(apIdx, 1);
        this.engine.updateCable(cable.id, { attachPoints: cable.attachPoints });
        this.engine.updateCables();
        this.refresh();
      });

      topRow.append(idx, sel, removeApBtn);
      apBlock.appendChild(topRow);

      // Row 2: local offset X/Y/Z
      const offsetRow = document.createElement('div');
      offsetRow.style.cssText = 'display:flex;gap:3px;';

      const axisColors = ['#f66', '#6f6', '#66f'];
      const axisLabels = ['X', 'Y', 'Z'];
      for (let axis = 0; axis < 3; axis++) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;';

        const lbl = document.createElement('span');
        lbl.style.cssText = `font-size:8px;color:${axisColors[axis]};font-weight:bold;`;
        lbl.textContent = axisLabels[axis];

        const input = document.createElement('input');
        input.type = 'number';
        input.value = (ap.localOffset[axis] ?? 0).toFixed(1);
        input.step = '1';
        input.style.cssText = `width:100%;background:var(--input-bg);border:1px solid ${axisColors[axis]}30;border-radius:3px;color:var(--text-primary);padding:2px 3px;font-size:10px;font-family:monospace;text-align:center;`;
        input.addEventListener('focus', () => { input.style.borderColor = axisColors[axis]; });
        input.addEventListener('blur', () => { input.style.borderColor = `${axisColors[axis]}30`; });

        const axisIdx = axis;
        input.addEventListener('change', () => {
          cable.attachPoints[apIdx].localOffset[axisIdx] = parseFloat(input.value) || 0;
          this.engine.updateCable(cable.id, { attachPoints: cable.attachPoints });
          this.engine.updateCables();
        });

        wrap.append(lbl, input);
        offsetRow.appendChild(wrap);
      }
      apBlock.appendChild(offsetRow);
      ed.appendChild(apBlock);
    }

    const addApBtn = document.createElement('button');
    addApBtn.className = 'btn';
    addApBtn.style.cssText = 'width:100%;font-size:10px;margin-top:2px;';
    addApBtn.textContent = '+ Add Via Point';
    addApBtn.addEventListener('click', () => {
      const firstComp = components[0];
      if (firstComp) {
        cable.attachPoints.push({ componentId: firstComp.id, localOffset: [0, 0, 0] });
        this.engine.updateCable(cable.id, { attachPoints: cable.attachPoints });
        this.engine.updateCables();
        this.refresh();
      }
    });
    ed.appendChild(addApBtn);

    const recalcBtn = document.createElement('button');
    recalcBtn.className = 'btn';
    recalcBtn.style.cssText = 'width:100%;font-size:10px;margin-top:4px;color:var(--accent);';
    recalcBtn.textContent = 'Recalculate Cable';
    recalcBtn.addEventListener('click', () => {
      this.engine.updateCables();
      this.refreshViolations();
    });
    ed.appendChild(recalcBtn);

    return ed;
  }

  private showAddCableDialog(): void {
    const components = this.engine.getMachineComponents();
    if (components.length < 2) {
      alert('Need at least 2 components to route a cable between');
      return;
    }

    const first = components[0];
    const last = components[components.length - 1];
    this.engine.addCable({
      attachPoints: [
        { componentId: first.id, localOffset: [0, 0, 0] },
        { componentId: last.id, localOffset: [0, 0, 0] },
      ],
    });
    this.refresh();
  }

  private inputRow(label: string, value: string, onChange: (v: string) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:3px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;color:var(--text-secondary);min-width:56px;';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.style.cssText = 'flex:1;background:var(--input-bg);border:1px solid var(--panel-border);border-radius:3px;color:var(--text-primary);padding:2px 4px;font-size:11px;';
    input.addEventListener('change', () => onChange(input.value));
    row.append(lbl, input);
    return row;
  }

  private numRow(label: string, value: number, min: number, max: number, step: number, unit: string, onChange: (v: number) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:3px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;color:var(--text-secondary);min-width:56px;';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.style.cssText = 'flex:1;background:var(--input-bg);border:1px solid var(--panel-border);border-radius:3px;color:var(--text-primary);padding:2px 4px;font-size:11px;font-family:monospace;';
    input.addEventListener('change', () => onChange(parseFloat(input.value) || 0));
    const unitLbl = document.createElement('span');
    unitLbl.style.cssText = 'font-size:9px;color:var(--text-secondary);';
    unitLbl.textContent = unit;
    row.append(lbl, input, unitLbl);
    return row;
  }
}
