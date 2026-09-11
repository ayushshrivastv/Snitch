// Node 22 provides node:sqlite. The project still uses Node 20's ambient types.
declare module "node:sqlite" {
  type SqlValue = string | number | bigint | Uint8Array | null;
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): {
      get(...params: SqlValue[]): Record<string, SqlValue> | undefined;
      all(...params: SqlValue[]): Record<string, SqlValue>[];
      run(...params: SqlValue[]): { changes: number | bigint };
      setReadBigInts(enabled: boolean): void;
    };
    close(): void;
  }
}
