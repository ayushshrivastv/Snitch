# Invoice email

Snitch sends stored invoices through Resend from `POST /api/send-receipt`. In Transactions, open a payment created in your company account, choose **Send invoice**, and enter the recipient's email. The sender must be signed in and own the stored invoice; showcase transaction rows cannot be emailed as customer invoices.

## Configuration

Set these server-only variables in `.env.local` for development and in the Vercel project's Production environment:

```dotenv
RESEND_API_KEY=<your Resend API key>
RESEND_FROM="Snitch <onboarding@resend.dev>"
SNITCH_PUBLIC_ORIGIN=https://snitchpay.vercel.app
```

Redeploy after changing Vercel environment variables. Never prefix the API key with `NEXT_PUBLIC_` or commit its value.

The Resend test sender can send to the email address that owns the Resend account. Other recipients require a verified domain and a sender on that domain, such as `Snitch <invoices@your-domain.com>`. Resend also provides `delivered@resend.dev` as a simulated test recipient; it does not deliver to a person's inbox.

## Delivery behavior

- Invoice amount, company, customer, and description come from the stored invoice, not client-provided display fields.
- HTML and plain-text messages contain a link on the official site. Sepolia invoices identify the required test network.
- Retries within the same send dialog reuse an idempotency key. Reopening the dialog creates a new intentional send. Resend retains idempotency keys for 24 hours.
- The interface reports success only after Resend returns a message ID. Provider acceptance does not guarantee inbox delivery; inspect the Resend email events for delivery or bounce results.
- Missing configuration, recipient restrictions, rate limits, and provider failures produce actionable errors without exposing credentials or provider diagnostics.

## Verification

`npm test` covers ownership checks, stored invoice content, configured sender and origin, retry deduplication, recipient restrictions, and provider failures. These tests mock Resend and do not send email.

References: [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [test emails](https://resend.com/docs/dashboard/emails/send-test-emails), and [domain verification](https://resend.com/docs/dashboard/domains/introduction).
