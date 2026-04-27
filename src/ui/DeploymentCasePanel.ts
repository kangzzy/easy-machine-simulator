import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { DeploymentCase, Priority, StrokeSpec } from '../types/deployment';
import { CaseStore, newId, type SortMode } from '../persistence/CaseStore';
import { captureStage } from '../persistence/StageIO';
import { makeCollapsiblePanel } from './panelUtils';

export class DeploymentCasePanel {
  readonly element: HTMLDivElement;
  readonly store = new CaseStore();
  private listEl!: HTMLDivElement;
  private expandedId: string | null = null;
  private sortMode: SortMode = 'priority';

  constructor(private engine: SimulationEngine) {
    this.element = document.createElement('div');
    this.element.className = 'panel panel-docked';
    this.element.style.cssText = 'overflow-y:auto;max-height:380px;';
    this.store.seed();
    this.build();
    this.store.onChange(() => this.refresh());
    this.engine.on('caseLoaded', () => this.refresh());
  }

  private build(): void {
    const body = makeCollapsiblePanel(this.element, '배치 케이스');

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;';

    const newBtn = document.createElement('button');
    newBtn.className = 'btn';
    newBtn.style.cssText = 'flex:1;font-size:11px;padding:4px 6px;';
    newBtn.textContent = '+ 현재 상태로 신규';
    newBtn.title = '현재 화면 상태로 새 케이스 생성';
    newBtn.addEventListener('click', () => this.createFromCurrent());

    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.json';
    importInput.style.display = 'none';
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        await this.store.importFromFile(file);
      } catch (e: any) {
        alert(`가져오기 실패: ${e.message ?? e}`);
      } finally {
        importInput.value = '';
      }
    });
    const importBtn = document.createElement('button');
    importBtn.className = 'btn';
    importBtn.style.cssText = 'font-size:11px;padding:4px 6px;';
    importBtn.textContent = 'JSON 가져오기';
    importBtn.addEventListener('click', () => importInput.click());

    const exportAllBtn = document.createElement('button');
    exportAllBtn.className = 'btn';
    exportAllBtn.style.cssText = 'font-size:11px;padding:4px 6px;';
    exportAllBtn.textContent = '전체 내보내기';
    exportAllBtn.addEventListener('click', () => this.store.exportAll());

    toolbar.append(newBtn, importBtn, exportAllBtn, importInput);
    body.appendChild(toolbar);

    // Sort row
    const sortRow = document.createElement('div');
    sortRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;';
    const sortLbl = document.createElement('span');
    sortLbl.style.cssText = 'font-size:10px;color:var(--text-secondary);';
    sortLbl.textContent = '정렬';
    const sortSel = document.createElement('select');
    sortSel.style.cssText = 'flex:1;font-size:11px;';
    sortSel.innerHTML = `
      <option value="priority">우선순위</option>
      <option value="date">날짜</option>
      <option value="name">이름</option>
    `;
    sortSel.addEventListener('change', () => {
      this.sortMode = sortSel.value as SortMode;
      this.refresh();
    });
    sortRow.append(sortLbl, sortSel);
    body.appendChild(sortRow);

    // Case list
    this.listEl = document.createElement('div');
    body.appendChild(this.listEl);

    this.refresh();
  }

  private refresh(): void {
    this.listEl.innerHTML = '';
    const cases = this.store.listSorted(this.sortMode);
    if (cases.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:12px;color:var(--text-secondary);font-size:11px;';
      empty.textContent = '케이스가 없습니다';
      this.listEl.appendChild(empty);
      return;
    }
    for (const c of cases) this.listEl.appendChild(this.renderCase(c));
  }

  private renderCase(c: DeploymentCase): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border:1px solid var(--panel-border);border-radius:5px;margin-bottom:6px;background:rgba(30,30,55,0.4);';
    const isActive = this.engine.currentCaseId === c.id;
    const isExpanded = this.expandedId === c.id;
    if (isActive) wrap.style.borderColor = 'var(--accent)';

    // Row — clicking selects & loads the case; arrow toggles editor expand
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:pointer;';
    row.addEventListener('click', async () => {
      try {
        await this.engine.loadCase(c);
        if (!isExpanded) this.expandedId = c.id;
        this.refresh();
      } catch (e: any) {
        alert(`불러오기 실패: ${e.message ?? e}`);
      }
    });

    const arrow = document.createElement('span');
    arrow.style.cssText = 'font-size:10px;width:14px;color:var(--text-secondary);cursor:pointer;text-align:center;';
    arrow.textContent = isExpanded ? '\u25BC' : '\u25B6';
    arrow.title = '편집기 펼치기/접기';
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expandedId = isExpanded ? null : c.id;
      this.refresh();
    });

    const pin = document.createElement('span');
    pin.style.cssText = `
      display:inline-flex;align-items:center;justify-content:center;
      min-width:36px;padding:1px 5px;border-radius:8px;font-size:9px;font-weight:600;
      background:${c.priority === 'submit' ? 'rgba(255,153,51,0.2)' : 'rgba(120,120,160,0.2)'};
      color:${c.priority === 'submit' ? '#ff9933' : '#aab'};
    `;
    pin.textContent = c.priority === 'submit' ? '제출' : '향후';

    const name = document.createElement('span');
    name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text-primary);';
    name.textContent = c.name;
    if (isActive) name.style.fontWeight = '600';

    const stroke = document.createElement('span');
    stroke.style.cssText = 'font-size:10px;color:var(--text-secondary);font-family:monospace;';
    stroke.textContent = `${c.stroke.x}\u00D7${c.stroke.y}\u00D7${c.stroke.z}`;

    row.append(arrow, pin, name, stroke);
    wrap.appendChild(row);

    if (isExpanded) wrap.appendChild(this.renderEditor(c));
    return wrap;
  }

  private renderEditor(c: DeploymentCase): HTMLDivElement {
    const ed = document.createElement('div');
    ed.style.cssText = 'padding:8px;border-top:1px solid var(--panel-border);';

    ed.appendChild(this.field('이름', 'text', c.name, (v) => this.store.update(c.id, { name: v })));
    ed.appendChild(this.field('고객사', 'text', c.customer, (v) => this.store.update(c.id, { customer: v })));

    const prRow = document.createElement('div');
    prRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    const prLbl = document.createElement('span');
    prLbl.style.cssText = 'font-size:10px;color:var(--text-secondary);min-width:48px;';
    prLbl.textContent = '우선순위';
    const prSel = document.createElement('select');
    prSel.style.cssText = 'flex:1;font-size:11px;';
    prSel.innerHTML = `<option value="submit">제출용</option><option value="future">향후 검토</option>`;
    prSel.value = c.priority;
    prSel.addEventListener('change', () => this.store.update(c.id, { priority: prSel.value as Priority }));
    prRow.append(prLbl, prSel);
    ed.appendChild(prRow);

    // Stroke X/Y/Z
    const strokeLbl = document.createElement('div');
    strokeLbl.style.cssText = 'font-size:10px;color:var(--text-secondary);margin:6px 0 2px;font-weight:600;';
    strokeLbl.textContent = '스트로크 (mm)';
    ed.appendChild(strokeLbl);

    const strokeRow = document.createElement('div');
    strokeRow.style.cssText = 'display:flex;gap:4px;margin-bottom:4px;';
    const labels: Array<keyof StrokeSpec> = ['x', 'y', 'z'];
    const colors = ['#f66', '#6f6', '#66f'];
    for (let i = 0; i < 3; i++) {
      const k = labels[i];
      const wrap = document.createElement('div');
      wrap.style.cssText = 'flex:1;';
      const lbl = document.createElement('div');
      lbl.style.cssText = `font-size:9px;color:${colors[i]};font-weight:bold;text-align:center;`;
      lbl.textContent = k.toUpperCase();
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = '1'; inp.step = '50';
      inp.value = String(c.stroke[k]);
      inp.style.cssText = `width:100%;background:var(--input-bg);border:1px solid ${colors[i]}30;border-radius:3px;color:var(--text-primary);padding:3px 4px;font-size:11px;font-family:monospace;text-align:center;`;
      inp.addEventListener('change', () => {
        const next: StrokeSpec = { ...c.stroke };
        next[k] = Math.max(1, parseFloat(inp.value) || 1);
        this.store.update(c.id, { stroke: next });
      });
      wrap.append(lbl, inp);
      strokeRow.appendChild(wrap);
    }
    ed.appendChild(strokeRow);

    // Notes
    const notesLbl = document.createElement('div');
    notesLbl.style.cssText = 'font-size:10px;color:var(--text-secondary);margin:6px 0 2px;font-weight:600;';
    notesLbl.textContent = '메모';
    ed.appendChild(notesLbl);
    const notes = document.createElement('textarea');
    notes.rows = 2;
    notes.value = c.notes;
    notes.style.cssText = 'width:100%;background:var(--input-bg);border:1px solid var(--panel-border);border-radius:3px;color:var(--text-primary);padding:4px 6px;font-size:11px;resize:vertical;box-sizing:border-box;';
    notes.addEventListener('change', () => this.store.update(c.id, { notes: notes.value }));
    ed.appendChild(notes);

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn';
    loadBtn.style.cssText = 'flex:1;font-size:11px;padding:4px 6px;';
    loadBtn.textContent = '불러오기';
    loadBtn.addEventListener('click', async () => {
      try {
        await this.engine.loadCase(c);
      } catch (e: any) {
        alert(`불러오기 실패: ${e.message ?? e}`);
      }
    });

    const saveCurBtn = document.createElement('button');
    saveCurBtn.className = 'btn';
    saveCurBtn.style.cssText = 'flex:1;font-size:11px;padding:4px 6px;';
    saveCurBtn.textContent = '현재상태 저장';
    saveCurBtn.title = '현재 화면 구성으로 이 케이스의 스테이지를 덮어씀';
    saveCurBtn.addEventListener('click', () => {
      const stage = captureStage(this.engine);
      this.store.update(c.id, { stage });
    });

    const dupBtn = document.createElement('button');
    dupBtn.className = 'btn';
    dupBtn.style.cssText = 'font-size:11px;padding:4px 6px;';
    dupBtn.textContent = '복제';
    dupBtn.addEventListener('click', () => this.store.duplicate(c.id));

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn';
    exportBtn.style.cssText = 'font-size:11px;padding:4px 6px;';
    exportBtn.textContent = '내보내기';
    exportBtn.addEventListener('click', () => this.store.exportCase(c));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.style.cssText = 'font-size:11px;padding:4px 6px;background:rgba(255,74,74,0.1);border:1px solid rgba(255,74,74,0.3);color:var(--danger);';
    delBtn.textContent = '삭제';
    delBtn.addEventListener('click', () => {
      if (confirm(`"${c.name}" 케이스를 삭제할까요?`)) {
        if (this.expandedId === c.id) this.expandedId = null;
        this.store.delete(c.id);
      }
    });

    actions.append(loadBtn, saveCurBtn, dupBtn, exportBtn, delBtn);
    ed.appendChild(actions);

    return ed;
  }

  private field(label: string, type: string, value: string, onChange: (v: string) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;color:var(--text-secondary);min-width:48px;';
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.type = type;
    inp.value = value;
    inp.style.cssText = 'flex:1;background:var(--input-bg);border:1px solid var(--panel-border);border-radius:3px;color:var(--text-primary);padding:3px 6px;font-size:11px;';
    inp.addEventListener('change', () => onChange(inp.value));
    row.append(lbl, inp);
    return row;
  }

  private createFromCurrent(): void {
    const stage = captureStage(this.engine);
    const stroke: StrokeSpec = stage.stroke ?? this.engine.currentStrokeSpec ?? { x: 1000, y: 1000, z: 1000 };
    const now = Date.now();
    const c = {
      id: newId(),
      schemaVersion: 1 as const,
      name: `새 케이스 ${new Date(now).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
      customer: '',
      notes: '',
      priority: 'submit' as Priority,
      stroke,
      stage,
      createdAt: now,
      updatedAt: now,
    };
    this.store.add(c);
    this.expandedId = c.id;
    this.refresh();
  }
}
