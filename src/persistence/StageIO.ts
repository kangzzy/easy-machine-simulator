import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { StageSnapshot } from '../types/deployment';
import { isStageSnapshot } from '../types/deployment';

export function captureStage(engine: SimulationEngine): StageSnapshot {
  const components = engine.machineBuilder.serialize();
  const basePresetId = engine.machineBuilder.lastPresetId;
  const cam = engine.sceneCameraState();
  const snap: StageSnapshot = {
    schemaVersion: 1,
    basePresetId,
    components,
    exportedAt: Date.now(),
  };
  if (engine.currentStrokeSpec) snap.stroke = { ...engine.currentStrokeSpec };
  if (cam) snap.scene = cam;
  return snap;
}

export async function applyStage(engine: SimulationEngine, snap: StageSnapshot): Promise<void> {
  await engine.machineBuilder.loadSerialized(snap.components, snap.basePresetId);
  engine.setStrokeSpec(snap.stroke ?? null);
  if (snap.scene?.cameraPosition && snap.scene?.cameraTarget) {
    engine.restoreCameraState(snap.scene.cameraPosition, snap.scene.cameraTarget);
  }
}

export function exportStageToFile(snap: StageSnapshot, fileName?: string): void {
  const name = fileName ?? `stage-${formatDate(new Date(snap.exportedAt))}.json`;
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
  triggerDownload(blob, name);
}

export async function importStageFromFile(file: File): Promise<StageSnapshot> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`잘못된 JSON 파일입니다: ${(e as Error).message}`);
  }
  if (!isStageSnapshot(parsed)) {
    throw new Error('스테이지 스냅샷 형식이 아닙니다 (schemaVersion / basePresetId / components 확인 필요)');
  }
  return parsed;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
