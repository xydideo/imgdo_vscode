import { Worker } from 'worker_threads';
import * as os from 'os';
import {
  WorkerCompressRequest,
  WorkerCompressResponse,
} from './codecs';

export interface PoolOptions {
  workerScript: string;
  concurrency?: number;
}

type Job = {
  req: WorkerCompressRequest;
  resolve: (r: WorkerCompressResponse) => void;
  reject: (e: Error) => void;
};

export class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Job[] = [];
  private closed = false;
  private readonly workerScript: string;
  private readonly size: number;
  private busy = new Map<Worker, Job>();

  constructor(options: PoolOptions) {
    this.workerScript = options.workerScript;
    this.size = Math.max(1, options.concurrency ?? Math.max(1, os.cpus().length - 1));
  }

  private ensureWorkers() {
    while (this.workers.length < this.size) {
      const worker = new Worker(this.workerScript);
      worker.on('message', (msg: WorkerCompressResponse) => {
        const job = this.busy.get(worker);
        if (!job) {
          return;
        }
        this.busy.delete(worker);
        this.idle.push(worker);
        job.resolve(msg);
        this.pump();
      });
      worker.on('error', (err) => {
        const job = this.busy.get(worker);
        this.busy.delete(worker);
        if (job) {
          job.reject(err);
        }
        this.replaceWorker(worker);
        this.pump();
      });
      // terminate 时可能触发 exit，忽略即可
      worker.on('exit', () => {
        // no-op
      });
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  private replaceWorker(old: Worker) {
    const idx = this.workers.indexOf(old);
    if (idx >= 0) {
      this.workers.splice(idx, 1);
    }
    const idleIdx = this.idle.indexOf(old);
    if (idleIdx >= 0) {
      this.idle.splice(idleIdx, 1);
    }
    try {
      void old.terminate();
    } catch {
      // ignore
    }
    if (!this.closed) {
      this.ensureWorkers();
    }
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const worker = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.busy.set(worker, job);
      worker.postMessage({ type: 'compress', payload: job.req });
    }
  }

  run(req: WorkerCompressRequest): Promise<WorkerCompressResponse> {
    if (this.closed) {
      return Promise.reject(new Error('cancelled'));
    }
    this.ensureWorkers();
    return new Promise((resolve, reject) => {
      this.queue.push({ req, resolve, reject });
      this.pump();
    });
  }

  /** 清空排队任务并强制结束正在跑的 Worker，使取消立即生效 */
  cancelAll() {
    const err = new Error('cancelled');
    while (this.queue.length) {
      this.queue.shift()!.reject(err);
    }
    for (const [worker, job] of [...this.busy.entries()]) {
      this.busy.delete(worker);
      job.reject(err);
      try {
        void worker.terminate();
      } catch {
        // ignore
      }
      const idx = this.workers.indexOf(worker);
      if (idx >= 0) {
        this.workers.splice(idx, 1);
      }
    }
    this.idle = [];
    this.workers = [];
    this.busy.clear();
    this.closed = false;
  }

  async dispose() {
    this.closed = true;
    this.queue = [];
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.idle = [];
    this.busy.clear();
  }
}
