import { AsyncDatabase } from "../src/lib/database";

async function main() {
  let database: AsyncDatabase | undefined;
  try {
    database = new AsyncDatabase();
    await database.ready();
    console.info("Company database schema is ready.");
  } catch {
    console.error("Database initialization failed. Check the database configuration and connection.");
    process.exitCode = 1;
  } finally {
    database?.close();
  }
}

void main();
