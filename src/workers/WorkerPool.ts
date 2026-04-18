export interface WorkerMessage<T = unknown> {
  id: number;
  type: string;
  payload: T;
}

export interface WorkerResponse<T = unknown> {
  id: number;
  type: string;
  payload: T;
  error?: string;
}

export class WorkerPool<TReq, TRes> {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: TRes) => void; reject: (e: Error) => void }>();

  constructor(workerUrl: URL) {
    this.worker = new Worker(workerUrl, { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse<TRes>>) => {
      const { id, payload, error } = e.data;
      const handler = this.pending.get(id);
      if (!handler) return;
      this.pending.delete(id);
      if (error) {
        handler.reject(new Error(error));
      } else {
        handler.resolve(payload);
      }
    };
  }

  execute(type: string, payload: TReq, transfer?: Transferable[]): Promise<TRes> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg: WorkerMessage<TReq> = { id, type, payload };
      this.worker.postMessage(msg, transfer ?? []);
    });
  }

  terminate(): void {
    this.worker.terminate();
    for (const [, handler] of this.pending) {
      handler.reject(new Error('Worker terminated'));
    }
    this.pending.clear();
  }
}
