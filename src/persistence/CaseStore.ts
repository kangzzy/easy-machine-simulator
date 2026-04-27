import type { DeploymentCase, Priority, StageSnapshot, StrokeSpec } from '../types/deployment';
import { isDeploymentCase } from '../types/deployment';

export type SortMode = 'priority' | 'date' | 'name';

export class CaseStore {
  private cases: DeploymentCase[] = [];
  private listeners = new Set<() => void>();

  list(): DeploymentCase[] {
    return [...this.cases];
  }

  listSorted(mode: SortMode): DeploymentCase[] {
    const arr = [...this.cases];
    if (mode === 'priority') {
      arr.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.updatedAt - a.updatedAt);
    } else if (mode === 'date') {
      arr.sort((a, b) => b.updatedAt - a.updatedAt);
    } else {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return arr;
  }

  get(id: string): DeploymentCase | undefined {
    return this.cases.find(c => c.id === id);
  }

  add(c: DeploymentCase): void {
    this.cases.push(c);
    this.emit();
  }

  update(id: string, updates: Partial<Omit<DeploymentCase, 'id' | 'schemaVersion' | 'createdAt'>>): void {
    const c = this.get(id);
    if (!c) return;
    Object.assign(c, updates, { updatedAt: Date.now() });
    this.emit();
  }

  delete(id: string): void {
    this.cases = this.cases.filter(c => c.id !== id);
    this.emit();
  }

  duplicate(id: string): DeploymentCase | undefined {
    const src = this.get(id);
    if (!src) return undefined;
    const copy: DeploymentCase = JSON.parse(JSON.stringify(src));
    copy.id = newId();
    copy.name = `${src.name} (copy)`;
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    this.cases.push(copy);
    this.emit();
    return copy;
  }

  exportCase(c: DeploymentCase): void {
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    download(blob, `case-${sanitize(c.name)}.json`);
  }

  exportAll(): void {
    const payload = { schemaVersion: 1, cases: this.cases, exportedAt: Date.now() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    download(blob, `cases-bundle-${Date.now()}.json`);
  }

  async importFromFile(file: File): Promise<DeploymentCase[]> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(`잘못된 JSON 파일입니다: ${(e as Error).message}`);
    }

    const incoming: DeploymentCase[] = [];
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (isDeploymentCase(item)) incoming.push(item);
      }
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).cases)) {
      for (const item of (parsed as any).cases) {
        if (isDeploymentCase(item)) incoming.push(item);
      }
    } else if (isDeploymentCase(parsed)) {
      incoming.push(parsed);
    }

    if (incoming.length === 0) {
      throw new Error('유효한 케이스를 찾을 수 없습니다 (schemaVersion / 필수 필드 확인 필요)');
    }

    for (const c of incoming) {
      if (this.cases.some(x => x.id === c.id)) c.id = newId();
      this.cases.push(c);
    }
    this.emit();
    return incoming;
  }

  seed(): void {
    if (this.cases.length > 0) return;
    const presetId = 'robot-6axis';
    const emptyStage = (stroke: StrokeSpec): StageSnapshot => ({
      schemaVersion: 1,
      basePresetId: presetId,
      components: [],
      stroke,
      exportedAt: Date.now(),
    });
    const now = Date.now();
    const seeds: Array<{ name: string; stroke: StrokeSpec; priority: Priority }> = [
      { name: 'A. 1000×1000×1000', stroke: { x: 1000, y: 1000, z: 1000 }, priority: 'submit' },
      { name: 'B. 1200×1200×1500', stroke: { x: 1200, y: 1200, z: 1500 }, priority: 'submit' },
      { name: 'C. 1500×1500×1500', stroke: { x: 1500, y: 1500, z: 1500 }, priority: 'future' },
      { name: 'D. 2000×2000×2000', stroke: { x: 2000, y: 2000, z: 2000 }, priority: 'future' },
    ];
    for (const s of seeds) {
      this.cases.push({
        id: newId(),
        schemaVersion: 1,
        name: s.name,
        customer: '',
        notes: '',
        priority: s.priority,
        stroke: s.stroke,
        stage: emptyStage(s.stroke),
        createdAt: now,
        updatedAt: now,
      });
    }
    this.emit();
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `case_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function priorityRank(p: Priority): number {
  return p === 'submit' ? 0 : 1;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣_-]+/g, '_').slice(0, 60) || 'case';
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
