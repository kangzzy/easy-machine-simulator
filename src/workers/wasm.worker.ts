/// Generic WASM worker — loads ems-wasm and handles messages.
/// In Phase 1, only supports "ping" for round-trip verification.

import type { WorkerMessage, WorkerResponse } from './WorkerPool';

let wasmModule: any = null;

async function initWasm() {
  if (wasmModule) return wasmModule;
  try {
    const mod = await import('../wasm-pkg/ems_wasm');
    wasmModule = mod;
    return mod;
  } catch (e) {
    console.warn('WASM module not available (expected during dev without wasm-pack build):', e);
    return null;
  }
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = e.data;

  try {
    const wasm = await initWasm();

    let result: any;

    switch (type) {
      case 'ping':
        result = wasm ? wasm.ping() : 'pong (no-wasm fallback)';
        break;
      case 'parse_gcode':
        result = wasm ? wasm.parse_gcode(payload as string) : [];
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    const response: WorkerResponse = { id, type, payload: result };
    self.postMessage(response);
  } catch (err: any) {
    const response: WorkerResponse = { id, type, payload: null, error: err.message };
    self.postMessage(response);
  }
};
