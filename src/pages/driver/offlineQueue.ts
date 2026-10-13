// Offline queue for pickup / delivery confirmations, persisted in IndexedDB so
// it survives a closed tab or a dead battery. Pure of Supabase: the sender is injected.
export type QueuedKind = 'pickup' | 'delivery';

export interface QueuedAction {
  seq: number;
  kind: QueuedKind;
  tripId: string;
  payload: Record<string, unknown>;
  photo: Blob | null;
  createdAt: number;
}

export type NewAction = Omit<QueuedAction, 'seq'>;

export interface QueueStore {
  add(a: NewAction): Promise<number>;
  all(): Promise<QueuedAction[]>;
  remove(seq: number): Promise<void>;
}

/** Throw from the sender when the server definitively rejected the action (wrong code, trip cancelled…). */
export class PermanentSyncError extends Error {}

export interface FlushResult {
  sent: number;
  rejected: { action: QueuedAction; error: Error }[];
  remaining: number;
  stoppedOffline: boolean;
}

export function createMemoryStore(): QueueStore {
  let n = 0;
  let items: QueuedAction[] = [];
  return {
    async add(a) {
      n += 1;
      items.push({ ...a, seq: n });
      return n;
    },
    async all() {
      return [...items];
    },
    async remove(seq) {
      items = items.filter((i) => i.seq !== seq);
    },
  };
}

export function createIdbStore(dbName = 'mccluckins-driver', storeName = 'queue'): QueueStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(storeName, { keyPath: 'seq', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction(storeName, mode).objectStore(storeName));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  };
  return {
    add: async (a) => Number(await tx('readwrite', (s) => s.add(a))),
    all: async () => (await tx<QueuedAction[]>('readonly', (s) => s.getAll())).sort((x, y) => x.seq - y.seq),
    remove: async (seq) => {
      await tx('readwrite', (s) => s.delete(seq));
    },
  };
}

type Listener = () => void;

export class OfflineQueue {
  private listeners = new Set<Listener>();
  private flushing: Promise<FlushResult> | null = null;

  constructor(private store: QueueStore, private now: () => number = Date.now) {}

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  async enqueue(kind: QueuedKind, tripId: string, payload: Record<string, unknown>, photo: Blob | null = null): Promise<number> {
    const seq = await this.store.add({ kind, tripId, payload, photo, createdAt: this.now() });
    this.emit();
    return seq;
  }

  /** Oldest first. A delivery can therefore never overtake the pickup queued before it. */
  async list(): Promise<QueuedAction[]> {
    return (await this.store.all()).sort((a, b) => a.seq - b.seq);
  }

  async size(): Promise<number> {
    return (await this.store.all()).length;
  }

  /**
   * Replays in order. A transient failure stops the run (keeping order and the
   * failed item); a PermanentSyncError drops that one item and continues.
   * Concurrent calls share one run.
   */
  flush(send: (a: QueuedAction) => Promise<void>): Promise<FlushResult> {
    if (this.flushing) return this.flushing;
    this.flushing = this.run(send).finally(() => {
      this.flushing = null;
      this.emit();
    });
    return this.flushing;
  }

  private async run(send: (a: QueuedAction) => Promise<void>): Promise<FlushResult> {
    const rejected: FlushResult['rejected'] = [];
    let sent = 0;
    let stoppedOffline = false;
    for (const action of await this.list()) {
      try {
        await send(action);
        await this.store.remove(action.seq);
        sent += 1;
      } catch (e) {
        if (e instanceof PermanentSyncError) {
          await this.store.remove(action.seq);
          rejected.push({ action, error: e });
        } else {
          stoppedOffline = true;
          break;
        }
      }
    }
    return { sent, rejected, remaining: await this.size(), stoppedOffline };
  }
}

let shared: OfflineQueue | null = null;
export function getOfflineQueue(): OfflineQueue {
  if (!shared) shared = new OfflineQueue(createIdbStore());
  return shared;
}
