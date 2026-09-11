import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient, type Client, type InValue, type ResultSet, type Transaction } from "@libsql/client";
import { createClient as createRemoteClient } from "@libsql/client/web";
import { initializeDatabaseSchema } from "./database-schema";
import { serializeLocalWrite } from "./database-lock";

export class DatabaseConfigurationError extends Error {
  readonly status = 503;
  readonly code = "COMPANY_STORAGE_UNAVAILABLE";
  constructor(message = "Persistent company storage is not configured.") {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

function remoteUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!["libsql:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) throw new Error("Invalid database URL");
    return value.replace(/\/$/, "");
  } catch {
    throw new DatabaseConfigurationError("TURSO_DATABASE_URL must be a secure remote database URL.");
  }
}

/** The location is safe to use as a cache key; it never contains credentials. */
export function getDatabaseLocation(): string {
  if (typeof window !== "undefined") throw new Error("Company storage is server-only.");
  const configuredUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (configuredUrl) {
    if (!process.env.TURSO_AUTH_TOKEN?.trim()) throw new DatabaseConfigurationError("TURSO_AUTH_TOKEN is required for company storage.");
    return remoteUrl(configuredUrl);
  }
  if (process.env.TURSO_AUTH_TOKEN?.trim()) throw new DatabaseConfigurationError("TURSO_DATABASE_URL is required for company storage.");
  const directory = process.env.SNITCH_DATA_DIR?.trim();
  if (isServerless() || (process.env.NODE_ENV === "production" && (!directory || !isAbsolute(directory)))) {
    throw new DatabaseConfigurationError();
  }
  return join(directory ? resolve(directory) : join(process.cwd(), ".data"), "snitch.sqlite");
}

export const getDatabaseKey = getDatabaseLocation;

type DatabaseRow = Record<string, unknown>;
type TransactionContext = { transaction: Transaction };

/**
 * Asynchronous SQLite-compatible storage. Each callback receives an isolated
 * libSQL write transaction through async context, including after awaits.
 */
export class AsyncDatabase {
  private readonly client: Client;
  private readonly local: boolean;
  private readonly key: string | symbol;
  private readonly transactions = new AsyncLocalStorage<TransactionContext>();
  private initialization: Promise<void> | undefined;

  constructor(location = getDatabaseLocation()) {
    if (typeof window !== "undefined") throw new Error("Company storage is server-only.");
    this.local = !/^(?:libsql|https):\/\//i.test(location);
    if (this.local) {
      if (isServerless()) throw new DatabaseConfigurationError();
      if (/^[a-z][a-z0-9+.-]*:/i.test(location) && !location.startsWith("file:")) {
        throw new DatabaseConfigurationError("Use a local file or a secure remote database URL.");
      }
      const path = location.startsWith("file:") ? fileURLToPath(location) : location === ":memory:" ? location : resolve(location);
      this.key = path === ":memory:" ? Symbol("memory-database") : path;
      if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      this.client = createClient({ url: path === ":memory:" ? path : pathToFileURL(path).href });
    } else {
      const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
      if (!authToken) throw new DatabaseConfigurationError("TURSO_AUTH_TOKEN is required for company storage.");
      this.client = createRemoteClient({ url: remoteUrl(location), authToken });
      this.key = location;
    }
  }

  ready(): Promise<void> {
    this.initialization ??= initializeDatabaseSchema(this.client, this.local, this.key).catch(error => {
      this.initialization = undefined;
      throw error;
    });
    return this.initialization;
  }

  private async execute(sql: string, args: InValue[]): Promise<ResultSet> {
    await this.ready();
    const transaction = this.transactions.getStore()?.transaction;
    if (transaction) return transaction.execute({ sql, args });
    const execute = () => this.client.execute({ sql, args });
    return this.local && !/^\s*(?:SELECT|EXPLAIN)\b/i.test(sql)
      ? serializeLocalWrite(this.key, execute)
      : execute();
  }

  prepare(sql: string) {
    return {
      get: async (...args: InValue[]): Promise<DatabaseRow | undefined> => (await this.execute(sql, args)).rows[0],
      all: async (...args: InValue[]): Promise<DatabaseRow[]> => (await this.execute(sql, args)).rows,
      run: async (...args: InValue[]): Promise<{ changes: number; lastInsertRowid?: bigint }> => {
        const result = await this.execute(sql, args);
        return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
      },
    };
  }

  async exec(sql: string): Promise<void> {
    await this.ready();
    const transaction = this.transactions.getStore()?.transaction;
    if (transaction) await transaction.executeMultiple(sql);
    else if (this.local) await serializeLocalWrite(this.key, () => this.client.executeMultiple(sql));
    else await this.client.executeMultiple(sql);
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    await this.ready();
    if (this.transactions.getStore()) throw new Error("Nested database transactions are not supported.");
    const run = async () => {
      const transaction = await this.client.transaction("write");
      try {
        const result = await this.transactions.run({ transaction }, work);
        await transaction.commit();
        return result;
      } catch (error) {
        if (!transaction.closed) await transaction.rollback().catch(() => undefined);
        throw error;
      } finally {
        transaction.close();
      }
    };
    return this.local ? serializeLocalWrite(this.key, run) : run();
  }

  close(): void {
    this.client.close();
  }
}
