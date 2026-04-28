import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { MachineType } from '../types/machine';
import { supportsDimensions, type ComponentType, type MachineComponent } from '../machine/MachineBuilder';
import type { MeshHullMode } from '../types/deployment';
import { makeCollapsiblePanel } from './panelUtils';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

const COMP_TYPES: { type: ComponentType; icon: string; label: string; color: string }[] = [
  { type: 'linear-axis', icon: '\u2194', label: 'Linear Axis', color: '#6af' },
  { type: 'rotary-axis', icon: '\u21BB', label: 'Rotary Axis', color: '#fa6' },
  { type: 'robot-arm',   icon: '\u2618', label: 'Robot Arm',   color: '#f6a' },
  { type: 'rail',        icon: '\u2550', label: 'Rail',        color: '#6fa' },
  { type: 'turntable',   icon: '\u25CE', label: 'Turntable',   color: '#af6' },
  { type: 'spindle',     icon: '\u2699', label: 'Spindle',     color: '#f66' },
  { type: 'end-effector', icon: '\u270B', label: 'End Effector', color: '#6ff' },
];

function getTypeInfo(type: ComponentType) {
  return COMP_TYPES.find(t => t.type === type) ?? { icon: '\u25A1', label: type, color: '#999' };
}

export class MachinePanel {
  readonly element: HTMLDivElement;
  private componentList!: HTMLDivElement;
  private infoDiv!: HTMLDivElement;
  private expandedId: string | null = null;
  private dragId: string | null = null;

  constructor(private engine: SimulationEngine) {
    this.element = document.createElement('div');
    this.element.className = 'panel panel-docked';
    this.element.style.cssText = 'overflow-y:auto;';
    this.build();
  }

  private build(): void {
    const body = makeCollapsiblePanel(this.element, 'Machine');

    // --- Preset row ---
    body.appendChild(this.row('Preset', () => {
      const sel = document.createElement('select');
      sel.style.cssText = 'flex:1;';
      sel.innerHTML = `
        <option value="cnc-3axis">3-Axis CNC</option>
        <option value="cnc-5axis">5-Axis CNC</option>
        <option value="robot-6axis">6-Axis Robot</option>
        <option value="custom">Custom Build</option>
      `;
      sel.addEventListener('change', () => {
        if (sel.value === 'custom') this.engine.enableMachineBuilder();
        else { this.engine.disableMachineBuilder(); this.engine.setMachineType(sel.value as MachineType); }
        this.refreshComponentList();
      });
      return sel;
    }));

    // --- Bounds mode ---
    body.appendChild(this.row('Bounds', () => {
      const sel = document.createElement('select');
      sel.style.cssText = 'flex:1;';
      sel.innerHTML = `<option value="flag-and-continue">Flag & Continue</option><option value="stop-at-boundary">Stop at Boundary</option>`;
      sel.addEventListener('change', () => this.engine.setBoundsMode(sel.value as any));
      return sel;
    }));

    // --- Divider ---
    body.appendChild(this.divider());

    // --- Builder section title ---
    const builderHeader = document.createElement('div');
    builderHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    const builderTitle = document.createElement('h3');
    builderTitle.textContent = 'Components';
    builderTitle.style.margin = '0';
    builderHeader.appendChild(builderTitle);
    body.appendChild(builderHeader);

    // --- Add component grid ---
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:8px 0;';
    for (const ct of COMP_TYPES) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.cssText = `display:flex;align-items:center;gap:4px;padding:5px 8px;font-size:11px;width:100%;`;
      btn.innerHTML = `<span style="color:${ct.color};font-size:13px;">${ct.icon}</span><span style="color:var(--text-primary);">${ct.label}</span>`;
      btn.addEventListener('click', () => {
        this.engine.addMachineComponent(ct.type);
        this.refreshComponentList();
      });
      grid.appendChild(btn);
    }
    body.appendChild(grid);

    // --- Upload 3D model ---
    const modelInput = document.createElement('input');
    modelInput.type = 'file';
    modelInput.accept = '.stl,.obj,.glb,.gltf,.step,.stp';
    modelInput.id = 'model-file-input';
    modelInput.addEventListener('change', async () => {
      const file = modelInput.files?.[0];
      if (!file) return;
      this.infoDiv.textContent = 'Loading model...';
      try {
        await this.engine.addCustomMeshComponent(file);
        this.refreshComponentList();
      } catch (e: any) {
        this.infoDiv.textContent = `Error: ${e.message}`;
      }
    });
    body.appendChild(modelInput);
    const modelBtn = document.createElement('label');
    modelBtn.className = 'file-upload-btn';
    modelBtn.htmlFor = 'model-file-input';
    modelBtn.textContent = 'Upload 3D Model (STL / STEP / OBJ / GLB)';
    body.appendChild(modelBtn);

    // --- Divider ---
    body.appendChild(this.divider());

    // --- Tree header ---
    const treeHeader = document.createElement('h3');
    treeHeader.textContent = 'Hierarchy';
    treeHeader.style.cssText = 'margin:0 0 4px;';
    body.appendChild(treeHeader);

    // --- Component tree list ---
    this.componentList = document.createElement('div');
    this.componentList.className = 'component-list';
    body.appendChild(this.componentList);

    // --- Info footer ---
    this.infoDiv = document.createElement('div');
    this.infoDiv.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-top:6px;padding-top:4px;border-top:1px solid var(--panel-border);';
    body.appendChild(this.infoDiv);

    this.engine.on('machineChanged', () => {
      const def = this.engine.machineDefinition;
      if (def) this.infoDiv.textContent = `${def.name} (${def.joints.length} DOF)`;
      this.refreshComponentList();
    });
  }

  // --- Helpers ---
  private row(label: string, buildControl: () => HTMLElement): HTMLDivElement {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:11px;color:var(--text-secondary);min-width:44px;';
    lbl.textContent = label;
    r.append(lbl, buildControl());
    return r;
  }

  private divider(): HTMLElement {
    const d = document.createElement('hr');
    d.style.cssText = 'border:none;border-top:1px solid var(--panel-border);margin:8px 0;';
    return d;
  }

  // ============================================================
  //  Component Tree
  // ============================================================

  private refreshComponentList(): void {
    this.componentList.innerHTML = '';
    const all = this.engine.getMachineComponents();

    if (all.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:12px;color:var(--text-secondary);font-size:11px;';
      empty.textContent = 'Add components above to build a machine';
      this.componentList.appendChild(empty);
      return;
    }

    // Render tree from roots
    const roots = all.filter(c => c.parentId === null);
    for (const root of roots) this.renderNode(root, all, 0);

    // Orphans
    const visited = new Set<string>();
    const walk = (pid: string | null) => { for (const c of all.filter(x => x.parentId === pid)) { visited.add(c.id); walk(c.id); } };
    walk(null);
    for (const c of all) { if (!visited.has(c.id)) this.renderNode(c, all, 0); }

    // Root drop zone
    const rootDrop = document.createElement('div');
    rootDrop.style.cssText = 'height:20px;border:2px dashed transparent;border-radius:4px;margin-top:4px;transition:all 0.15s;text-align:center;font-size:10px;color:transparent;line-height:16px;';
    rootDrop.textContent = 'Drop here for root';
    rootDrop.addEventListener('dragover', (e) => {
      e.preventDefault();
      rootDrop.style.borderColor = 'var(--accent)';
      rootDrop.style.color = 'var(--accent)';
      rootDrop.style.background = 'rgba(74,158,255,0.08)';
    });
    rootDrop.addEventListener('dragleave', () => {
      rootDrop.style.borderColor = 'transparent';
      rootDrop.style.color = 'transparent';
      rootDrop.style.background = 'none';
    });
    rootDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      rootDrop.style.borderColor = 'transparent';
      rootDrop.style.color = 'transparent';
      rootDrop.style.background = 'none';
      if (this.dragId) {
        this.engine.updateMachineComponent(this.dragId, { parentId: null });
        this.dragId = null;
        this.refreshComponentList();
      }
    });
    this.componentList.appendChild(rootDrop);

    const dof = this.engine.getBuilderDOF();
    if (dof > 0) this.infoDiv.textContent = `Custom: ${all.length} components, ${dof} DOF`;
  }

  private renderNode(comp: MachineComponent, all: MachineComponent[], depth: number): void {
    const isExpanded = this.expandedId === comp.id;
    const info = getTypeInfo(comp.type);

    // --- Row ---
    const row = document.createElement('div');
    row.draggable = true;
    row.style.cssText = `
      display:flex;align-items:center;gap:4px;
      padding:4px 6px 4px ${8 + depth * 18}px;
      margin:1px 0;border-radius:4px;cursor:grab;
      transition:background 0.1s;font-size:11px;
      border-left:${depth > 0 ? `2px solid ${info.color}40` : 'none'};
    `;
    if (isExpanded) row.style.background = 'rgba(74,158,255,0.08)';
    row.addEventListener('mouseenter', () => { if (!isExpanded) row.style.background = 'rgba(255,255,255,0.04)'; });
    row.addEventListener('mouseleave', () => { if (!isExpanded) row.style.background = ''; });

    // Drag
    row.addEventListener('dragstart', (e) => { this.dragId = comp.id; row.style.opacity = '0.35'; e.dataTransfer!.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { this.dragId = null; row.style.opacity = '1'; });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.dragId && this.dragId !== comp.id) {
        row.style.background = 'rgba(74,158,255,0.15)';
        row.style.outline = '1px solid var(--accent)';
      }
    });
    row.addEventListener('dragleave', () => { row.style.background = isExpanded ? 'rgba(74,158,255,0.08)' : ''; row.style.outline = 'none'; });
    row.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      row.style.background = ''; row.style.outline = 'none';
      if (this.dragId && this.dragId !== comp.id && !this.isDescendant(this.dragId, comp.id, all)) {
        this.engine.updateMachineComponent(this.dragId, { parentId: comp.id });
        this.dragId = null;
        this.refreshComponentList();
      }
    });

    // Expand arrow
    const arrow = document.createElement('span');
    arrow.style.cssText = 'font-size:8px;width:10px;text-align:center;flex-shrink:0;color:var(--text-secondary);';
    arrow.textContent = isExpanded ? '\u25BC' : '\u25B6';

    // Icon badge
    const badge = document.createElement('span');
    badge.style.cssText = `
      display:inline-flex;align-items:center;justify-content:center;
      width:20px;height:20px;border-radius:4px;font-size:12px;flex-shrink:0;
      background:${info.color}20;color:${info.color};
    `;
    badge.textContent = info.icon;

    // Name
    const name = document.createElement('span');
    name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary);';
    name.textContent = comp.name;

    // Add child btn
    const addBtn = document.createElement('button');
    addBtn.style.cssText = `
      background:${info.color}18;border:1px solid ${info.color}40;border-radius:3px;
      color:${info.color};font-size:13px;font-weight:bold;width:20px;height:20px;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      flex-shrink:0;line-height:1;
    `;
    addBtn.textContent = '+';
    addBtn.title = 'Add child';
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showAddChildMenu(comp.id, addBtn); });

    // Delete btn
    const delBtn = document.createElement('button');
    delBtn.style.cssText = `
      background:rgba(255,74,74,0.1);border:1px solid rgba(255,74,74,0.3);border-radius:3px;
      color:var(--danger);font-size:11px;width:20px;height:20px;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      flex-shrink:0;line-height:1;
    `;
    delBtn.textContent = '\u2715';
    delBtn.title = 'Remove';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.expandedId === comp.id) this.expandedId = null;
      this.engine.removeMachineComponent(comp.id);
      this.refreshComponentList();
    });

    row.append(arrow, badge, name, addBtn, delBtn);
    row.addEventListener('click', () => {
      this.expandedId = this.expandedId === comp.id ? null : comp.id;
      this.refreshComponentList();
    });
    this.componentList.appendChild(row);

    // --- Editor ---
    if (isExpanded) {
      const editor = this.buildEditor(comp);
      editor.style.marginLeft = `${8 + depth * 18}px`;
      this.componentList.appendChild(editor);
    }

    // --- Children ---
    for (const child of all.filter(c => c.parentId === comp.id)) {
      this.renderNode(child, all, depth + 1);
    }
  }

  private isDescendant(dragId: string, targetId: string, all: MachineComponent[]): boolean {
    let cur: string | null = targetId;
    const seen = new Set<string>();
    while (cur) {
      if (cur === dragId) return true;
      if (seen.has(cur)) return false;
      seen.add(cur);
      cur = all.find(c => c.id === cur)?.parentId ?? null;
    }
    return false;
  }

  // ============================================================
  //  Add Child Popup
  // ============================================================

  private showAddChildMenu(parentId: string, anchor: HTMLElement): void {
    document.getElementById('add-child-menu')?.remove();

    const menu = document.createElement('div');
    menu.id = 'add-child-menu';
    menu.style.cssText = `
      position:fixed;z-index:300;
      background:var(--panel-bg);border:1px solid var(--panel-border);
      border-radius:6px;padding:4px;min-width:140px;
      box-shadow:0 4px 16px rgba(0,0,0,0.4);
      backdrop-filter:blur(12px);
    `;

    for (const ct of COMP_TYPES) {
      const item = document.createElement('div');
      item.style.cssText = `
        display:flex;align-items:center;gap:8px;
        padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;
        color:var(--text-primary);transition:background 0.1s;
      `;
      item.innerHTML = `<span style="color:${ct.color};font-size:14px;">${ct.icon}</span><span>${ct.label}</span>`;
      item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
      item.addEventListener('mouseleave', () => item.style.background = 'none');
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.engine.addMachineComponent(ct.type, parentId);
        menu.remove();
        this.refreshComponentList();
      });
      menu.appendChild(item);
    }

    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${rect.left - 120}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    document.body.appendChild(menu);

    const close = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) { menu.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  // ============================================================
  //  Component Editor
  // ============================================================

  private buildEditor(comp: MachineComponent): HTMLDivElement {
    const ed = document.createElement('div');
    ed.className = 'panel-editor';
    ed.style.cssText = 'padding:8px;background:rgba(30,30,55,0.6);border-radius:6px;margin:2px 0 6px;border:1px solid rgba(74,158,255,0.15);';

    // Prevent drag on editor inputs
    ed.addEventListener('dragstart', (e) => e.stopPropagation());
    ed.draggable = false;

    ed.appendChild(this.inputRow('Name', 'text', comp.name, (v) => {
      this.engine.updateMachineComponent(comp.id, { name: v as string });
      this.refreshComponentList();
    }));

    ed.appendChild(this.sectionLabel('Position'));
    ed.appendChild(this.vec3Row(comp.offset, -1000, 1000, 1, (v) =>
      this.engine.updateMachineComponent(comp.id, { offset: v })
    ));

    ed.appendChild(this.sectionLabel('Rotation (\u00B0)'));
    ed.appendChild(this.vec3Row(comp.rotation, -360, 360, 1, (v) =>
      this.engine.updateMachineComponent(comp.id, { rotation: v })
    ));

    ed.appendChild(this.inputRow('Scale', 'number', String(comp.scale), (v) =>
      this.engine.updateMachineComponent(comp.id, { scale: parseFloat(v as string) || 1 })
    ));

    ed.appendChild(this.selectRow('Joint', comp.jointType, [
      { v: 'fixed', l: 'Fixed' }, { v: 'prismatic', l: 'Prismatic' }, { v: 'revolute', l: 'Revolute' },
    ], (v) => this.engine.updateMachineComponent(comp.id, { jointType: v as any })));

    // Joint limits (only for non-fixed joints) — revolute shown in degrees
    if (comp.jointType !== 'fixed') {
      const isPris = comp.jointType === 'prismatic';
      const unit = isPris ? 'mm' : '\u00B0';
      const toDisp = (v: number) => isPris ? v : v * RAD2DEG;
      const toStor = (v: number) => isPris ? v : v * DEG2RAD;
      const decimals = isPris ? 1 : 1;
      const step = isPris ? '1' : '1';

      ed.appendChild(this.sectionLabel(`Limits (${unit})`));
      const limRow = document.createElement('div');
      limRow.style.cssText = 'display:flex;gap:6px;';

      const minWrap = document.createElement('div');
      minWrap.style.cssText = 'flex:1;';
      const minLbl = document.createElement('div');
      minLbl.style.cssText = 'font-size:9px;color:#f66;font-weight:bold;margin-bottom:1px;';
      minLbl.textContent = 'Min';
      const minIn = document.createElement('input');
      minIn.type = 'number';
      minIn.value = toDisp(comp.limits.min).toFixed(decimals);
      minIn.step = step;
      minIn.style.cssText = 'width:100%;background:var(--input-bg);border:1px solid #f6640030;border-radius:3px;color:var(--text-primary);padding:3px 4px;font-size:11px;font-family:monospace;text-align:center;';
      minIn.addEventListener('change', () => {
        const stored = toStor(parseFloat(minIn.value) || 0);
        this.engine.updateMachineComponent(comp.id, { limits: { min: stored, max: comp.limits.max } });
        comp.limits.min = stored;
      });
      minWrap.append(minLbl, minIn);

      const maxWrap = document.createElement('div');
      maxWrap.style.cssText = 'flex:1;';
      const maxLbl = document.createElement('div');
      maxLbl.style.cssText = 'font-size:9px;color:#6f6;font-weight:bold;margin-bottom:1px;';
      maxLbl.textContent = 'Max';
      const maxIn = document.createElement('input');
      maxIn.type = 'number';
      maxIn.value = toDisp(comp.limits.max).toFixed(decimals);
      maxIn.step = step;
      maxIn.style.cssText = 'width:100%;background:var(--input-bg);border:1px solid #6f640030;border-radius:3px;color:var(--text-primary);padding:3px 4px;font-size:11px;font-family:monospace;text-align:center;';
      maxIn.addEventListener('change', () => {
        const stored = toStor(parseFloat(maxIn.value) || 0);
        this.engine.updateMachineComponent(comp.id, { limits: { min: comp.limits.min, max: stored } });
        comp.limits.max = stored;
      });
      maxWrap.append(maxLbl, maxIn);

      limRow.append(minWrap, maxWrap);
      ed.appendChild(limRow);

      // Axis
      ed.appendChild(this.sectionLabel('Joint Axis'));
      ed.appendChild(this.vec3Row(comp.axis, -1, 1, 0.1, (v) =>
        this.engine.updateMachineComponent(comp.id, { axis: v })
      ));
    }

    const allComps = this.engine.getMachineComponents();
    ed.appendChild(this.selectRow('Parent', comp.parentId ?? '', [
      { v: '', l: '(root)' },
      ...allComps.filter(c => c.id !== comp.id).map(c => ({ v: c.id, l: c.name })),
    ], (v) => {
      this.engine.updateMachineComponent(comp.id, { parentId: v || null });
      this.refreshComponentList();
    }));

    if (comp.modelInfo) {
      const mi = document.createElement('div');
      mi.style.cssText = 'font-size:10px;color:var(--text-secondary);margin-top:6px;padding-top:4px;border-top:1px solid rgba(60,60,90,0.3);';
      mi.textContent = `Mesh: ${comp.modelInfo.triangles} tris | ${comp.modelInfo.size.x.toFixed(0)}\u00D7${comp.modelInfo.size.y.toFixed(0)}\u00D7${comp.modelInfo.size.z.toFixed(0)}`;
      ed.appendChild(mi);
    }

    if (supportsDimensions(comp.type)) {
      ed.appendChild(this.dimensionsBlock(comp));
    }

    ed.appendChild(this.jointMeshBlock(comp));

    return ed;
  }

  // ─── Sizable component (Width/Depth/Height) ────────────────────────

  private dimensionsBlock(comp: MachineComponent): HTMLDivElement {
    const block = document.createElement('div');
    block.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid rgba(60,60,90,0.3);';
    block.appendChild(this.sectionLabel('치수 (mm)'));

    const cur = comp.dimensions ?? { width: 100, depth: 100, height: 50 };

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;';
    const labels = ['W', 'D', 'H'];
    const keys: Array<'width' | 'depth' | 'height'> = ['width', 'depth', 'height'];
    const colors = ['#f6a', '#6af', '#af6'];
    const state = { ...cur };

    for (let i = 0; i < 3; i++) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'flex:1;';
      const lbl = document.createElement('div');
      lbl.style.cssText = `font-size:9px;color:${colors[i]};font-weight:bold;margin-bottom:1px;text-align:center;`;
      lbl.textContent = labels[i];
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = '1'; inp.step = '1';
      inp.value = String(Math.round(state[keys[i]]));
      inp.style.cssText = `
        width:100%;background:var(--input-bg);border:1px solid ${colors[i]}30;
        border-radius:3px;color:var(--text-primary);padding:3px 4px;
        font-size:11px;font-family:monospace;text-align:center;
      `;
      const k = keys[i];
      inp.addEventListener('change', () => {
        state[k] = Math.max(1, parseFloat(inp.value) || state[k]);
        this.engine.setDimensions(comp.id, { ...state });
      });
      wrap.append(lbl, inp);
      row.appendChild(wrap);
    }
    block.appendChild(row);
    return block;
  }

  // ─── Per-joint mesh attachment ─────────────────────────────────────

  private jointMeshBlock(comp: MachineComponent): HTMLDivElement {
    const block = document.createElement('div');
    block.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid rgba(60,60,90,0.3);';
    block.appendChild(this.sectionLabel('관절 모델 첨부'));

    if (comp.meshAsset) {
      const info = document.createElement('div');
      info.style.cssText = 'font-size:10px;color:var(--text-secondary);margin-bottom:4px;line-height:1.4;';
      info.innerHTML = `<b style="color:var(--text-primary);">${escapeHtml(comp.meshAsset.fileName)}</b><br>` +
        `${comp.meshAsset.triangleCount} tris · ${hullModeLabel(comp.meshAsset.hullMode)}`;
      block.appendChild(info);

      block.appendChild(this.sectionLabel('초기 위치 (mm)'));
      block.appendChild(this.vec3Row(comp.meshAsset.initialOffset, -2000, 2000, 1, (v) => {
        if (!comp.meshAsset) return;
        comp.meshAsset.initialOffset = v;
        this.engine.setMeshInitialPose(comp.id, v, comp.meshAsset.initialRotation);
      }));

      block.appendChild(this.sectionLabel('초기 자세 (도)'));
      block.appendChild(this.vec3Row(comp.meshAsset.initialRotation, -360, 360, 1, (v) => {
        if (!comp.meshAsset) return;
        comp.meshAsset.initialRotation = v;
        this.engine.setMeshInitialPose(comp.id, comp.meshAsset.initialOffset, v);
      }));

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn';
      removeBtn.style.cssText = 'width:100%;margin-top:6px;font-size:11px;background:rgba(255,74,74,0.1);border:1px solid rgba(255,74,74,0.3);color:var(--danger);';
      removeBtn.textContent = '모델 제거';
      removeBtn.addEventListener('click', () => {
        this.engine.removeJointMesh(comp.id);
        this.refreshComponentList();
      });
      block.appendChild(removeBtn);
    } else {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:10px;color:var(--text-secondary);margin-bottom:4px;';
      hint.textContent = '.stl / .step / .obj / .glb 파일 첨부';
      block.appendChild(hint);

      const modeRow = document.createElement('div');
      modeRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;';
      const modes: Array<{ value: 'convex-hull' | 'decimated' | 'none'; label: string; title: string }> = [
        { value: 'convex-hull', label: '외피만', title: '컨벡스 헐로 변환 — 가장 가벼움 (추천)' },
        { value: 'decimated', label: '데시메이션', title: '원본 형상 유지, 삼각형만 감소' },
        { value: 'none', label: '원본', title: '데시메이션만 적용 (기본)' },
      ];
      let selectedMode: 'convex-hull' | 'decimated' | 'none' = 'convex-hull';
      const buttons: HTMLButtonElement[] = [];
      for (const m of modes) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.title = m.title;
        b.textContent = m.label;
        b.style.cssText = 'flex:1;padding:3px 6px;font-size:10px;';
        b.addEventListener('click', () => {
          selectedMode = m.value;
          for (const bb of buttons) bb.style.borderColor = 'var(--panel-border)';
          b.style.borderColor = 'var(--accent)';
        });
        buttons.push(b);
        modeRow.appendChild(b);
      }
      buttons[0].style.borderColor = 'var(--accent)';
      block.appendChild(modeRow);

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.stl,.step,.stp,.obj,.glb,.gltf';
      fileInput.style.display = 'none';
      const status = document.createElement('div');
      status.style.cssText = 'font-size:10px;color:var(--text-secondary);margin-top:4px;min-height:14px;';

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        status.textContent = `로딩 중: ${file.name}…`;
        try {
          await this.engine.attachJointMesh(comp.id, file, { hullMode: selectedMode });
          status.textContent = '';
          this.refreshComponentList();
        } catch (e: any) {
          status.textContent = `실패: ${e.message ?? e}`;
        } finally {
          fileInput.value = '';
        }
      });

      const uploadBtn = document.createElement('button');
      uploadBtn.className = 'btn';
      uploadBtn.style.cssText = 'width:100%;font-size:11px;';
      uploadBtn.textContent = '파일 첨부';
      uploadBtn.addEventListener('click', () => fileInput.click());
      block.append(uploadBtn, fileInput, status);
    }

    return block;
  }

  // ============================================================
  //  Input Builders
  // ============================================================

  private sectionLabel(text: string): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:10px;color:var(--text-secondary);margin:6px 0 2px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
    d.textContent = text;
    return d;
  }

  private vec3Row(values: [number, number, number], min: number, max: number, step: number, onChange: (v: [number, number, number]) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;';
    const colors = ['#f66', '#6f6', '#66f'];
    const labels = ['X', 'Y', 'Z'];
    const cur: [number, number, number] = [...values];

    for (let i = 0; i < 3; i++) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'flex:1;';

      const lbl = document.createElement('div');
      lbl.style.cssText = `font-size:9px;color:${colors[i]};font-weight:bold;margin-bottom:1px;text-align:center;`;
      lbl.textContent = labels[i];

      const input = document.createElement('input');
      input.type = 'number';
      input.value = values[i].toFixed(1);
      input.min = String(min); input.max = String(max); input.step = String(step);
      input.style.cssText = `
        width:100%;background:var(--input-bg);border:1px solid ${colors[i]}30;
        border-radius:3px;color:var(--text-primary);padding:3px 4px;
        font-size:11px;font-family:monospace;text-align:center;
      `;
      input.addEventListener('focus', () => input.style.borderColor = colors[i]);
      input.addEventListener('blur', () => input.style.borderColor = `${colors[i]}30`);
      const idx = i;
      input.addEventListener('change', () => { cur[idx] = parseFloat(input.value) || 0; onChange([...cur]); });

      wrap.append(lbl, input);
      row.appendChild(wrap);
    }
    return row;
  }

  private inputRow(label: string, type: string, value: string, onChange: (v: string) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;color:var(--text-secondary);min-width:38px;';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    if (type === 'number') { input.step = '0.1'; input.style.fontFamily = 'monospace'; }
    input.style.cssText += 'flex:1;background:var(--input-bg);border:1px solid var(--panel-border);border-radius:3px;color:var(--text-primary);padding:3px 6px;font-size:11px;';
    input.addEventListener('change', () => onChange(input.value));
    row.append(lbl, input);
    return row;
  }

  private selectRow(label: string, value: string, options: { v: string; l: string }[], onChange: (v: string) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;color:var(--text-secondary);min-width:38px;';
    lbl.textContent = label;
    const sel = document.createElement('select');
    sel.style.cssText = 'flex:1;font-size:11px;';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.l;
      if (o.v === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    row.append(lbl, sel);
    return row;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

function hullModeLabel(m: MeshHullMode): string {
  if (m === 'convex-hull') return '외피만 (convex hull)';
  if (m === 'decimated') return '데시메이션';
  return '원본';
}
