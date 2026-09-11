# Company storage on Vercel

The public site is `https://snitchpay.vercel.app`. Its server routes use one remote
libSQL database for companies, CFO permissions, wallet export approvals, invoices,
confirmed payments, and payouts. Wallet addresses and Privy wallet identifiers are
stored as metadata. Private keys and wallet signing material never enter this database.

## Production configuration

Create or connect a **libSQL** database through Turso, then configure these
server-only environment variables in the Vercel project:

```dotenv
TURSO_DATABASE_URL=libsql://your-database-your-organization.turso.io
TURSO_AUTH_TOKEN=your-database-auth-token
```

Use a database-scoped read/write token, not a Turso account administration token.
Neither value needs a `NEXT_PUBLIC_` prefix. Keep the token in Vercel environment
settings and local ignored environment files; never put it in source or build logs.
The existing Privy and Ethereum settings still apply.

The runtime uses `@libsql/client/web` for remote requests over HTTP. Turso also has
a newer database engine; the database must match this libSQL driver. See the
[Turso Vercel guide](https://docs.turso.tech/integrations/vercel).

Configure a separate database/token for Vercel Preview deployments when previews
need writable account data. Redeploy after adding or changing environment variables.
Vercel must not use a local `SNITCH_DATA_DIR`, `/tmp` database, or an in-memory
fallback. Missing or invalid remote settings fail closed.

## Schema initialization

All three stores share the schema in `src/lib/database-schema.ts`. Each database
handle checks the migration version before its first query. Existing schemas need
read queries only; new schemas are created in one write transaction. A concurrent
initializer rechecks the version inside that transaction.

For an explicit pre-deployment initialization, load the two database variables into
the shell and run:

```sh
npm run db:migrate
```

The command reports success/failure without printing the connection string or token.
It creates the schema without changing existing company/wallet associations. Legacy
companies receive their original owner's CFO role only when the `cfo_user_id` column
is first introduced. Restarting or redeploying never restores deliberately revoked
CFO authority.

## Preserve existing development records

1. Stop local writes and take a consistent SQLite backup of `.data/snitch.sqlite`
   (or the configured persistent path). Keep the original backup locally.
2. Follow the [safe import procedure](database-import.md). Its default dry-run checks
   the backup and empty destination without writing; `--apply` copies company,
   invoice, payment, and payout records atomically. Export approvals are excluded.
3. Compare the reported counts and verify the existing CFO and wallet associations
   before enabling application writes.
4. Configure Vercel with the destination database and redeploy. Verify company
   listing, invoice status, payout records, and CFO authorization there.

Only public wallet metadata and application records move. Privy wallets stay with
their existing user accounts; migration does not create wallets, grant signing
authority, or export private keys.

## Development and tests

Without Turso variables, development continues to use `.data/snitch.sqlite` through
the asynchronous local libSQL driver. `SNITCH_DATA_DIR` can select another directory.
An explicit path supplied to a store supports isolated local test fixtures. Local
files remain prohibited inside Vercel, Lambda, and Netlify runtimes.

Database methods return promises. Each write transaction carries its own executor
through asynchronous context so concurrent requests cannot join another request's
transaction. Local writes also wait in an asynchronous queue per database path;
native lock waiting must not block the event loop while a previous writer awaits.
Remote writes rely on libSQL's database-level transaction isolation. Keep external
Privy/RPC calls outside database transactions.
