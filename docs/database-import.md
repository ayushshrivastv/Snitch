# Import an existing SQLite backup

This copies company, invoice, confirmed payment, and payout records into an **empty** remote Turso database. It preserves stored values, including company IDs, owner/CFO IDs, wallet identifiers, amounts, and dates. Wallet export approval requests are deliberately excluded. No wallet is created, exported, or signed by this operation.

Use a consistent SQLite backup, not a live database file copied without its WAL. Keep the backup under the ignored `.data/` directory. Run with the project's Node version and installed dependencies.

Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in your shell or an ignored `.env.migration` file. Never put credentials in the command arguments or commit that file. The destination must use HTTPS or libSQL; local target paths are rejected.

First inspect counts without changing either database:

```sh
node --env-file=.env.migration --import tsx scripts/import-database.ts --source .data/backups/before-vercel-database-migration.sqlite
```

The output contains only record counts and import state. A nonempty or unrelated target is refused; the script never overwrites or merges existing records.

After checking the dry-run and target configuration, explicitly apply:

```sh
node --env-file=.env.migration --import tsx scripts/import-database.ts --source .data/backups/before-vercel-database-migration.sqlite --apply
```

Apply initializes the application's schema, then checks emptiness again inside a write transaction. All record inserts and count verification happen in that transaction. Any rejected insert rolls back its record writes; initialized empty tables may remain. Re-running an already completed import is refused because the target is no longer empty.

Import before letting the deployment create company records. If a connection fails during commit, the final commit outcome may be unknown: inspect target counts before retrying. Keep the original backup until the hosted application has been verified. This script does not delete or change the source backup.
