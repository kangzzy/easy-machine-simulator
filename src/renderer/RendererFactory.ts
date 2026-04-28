import * as THREE from 'three';

export interface RendererResult {
  renderer: THREE.WebGLRenderer;
  isWebGPU: boolean;
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<RendererResult> {
  // WebGPU is intentionally disabled: Three.js v0.172 WebGPURenderer crashes with
  // "Cannot read properties of undefined (reading 'usedTimes')" inside its pipeline
  // cache when materials are disposed/recreated during preset reloads (case loading).
  // WebGL2 has stable dispose semantics for this workload.
  const FORCE_WEBGL2 = true;
  if (!FORCE_WEBGL2 && 'gpu' in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) {
        const { WebGPURenderer } = await import('three/webgpu') as any;
        const renderer = new WebGPURenderer({ canvas, antialias: true });
        await renderer.init();
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        console.log('Using WebGPU renderer');
        return { renderer: renderer as any, isWebGPU: true };
      }
    } catch (e) {
      console.warn('WebGPU init failed, falling back to WebGL2:', e);
    }
  }

  // Fallback to WebGL2
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  console.log('Using WebGL2 renderer');
  return { renderer, isWebGPU: false };
}
