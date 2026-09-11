const pendingWrites = new Map<string | symbol, Promise<void>>();

/** Native SQLite lock waiting must yield so the current writer can finish its awaits. */
export async function serializeLocalWrite<T>(key: string | symbol, work: () => Promise<T>): Promise<T> {
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  pendingWrites.set(key, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (pendingWrites.get(key) === current) pendingWrites.delete(key);
  }
}
