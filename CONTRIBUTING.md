# Contributing

Use the Node version in `.nvmrc` and install dependencies with `npm ci`.
Keep changes focused on one behavior and use the existing component, service,
and test boundaries. Run `npm run check:repo`, `npm run lint`, `npm test`,
and `npm run build` before opening a pull request.

Use a concrete commit title that explains the changed behavior. Include the
reason and verification when the change needs context. New commits use their
actual creation dates.

Never commit credentials, wallet keys, user databases, or environment files.
Use blank values in `.env.example`. Tests must use isolated local fixtures
and must not send payments, export keys, or depend on a developer's account.

For wallet or payment changes, verify authorization, selected-company scoping,
exact ETH amounts, cancellation, transaction confirmation, and retry behavior.
Keep Privy key material inside Privy's protected interfaces.
