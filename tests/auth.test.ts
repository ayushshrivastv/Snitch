import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { fixtureUserId, installPrivyAuthFixture } from "./helpers/privy-auth";
import { installCompanyFixture } from "./helpers/company-wallet";

let auth: ReturnType<typeof installPrivyAuthFixture>;
let identityRoute: typeof import("../src/app/api/auth/me/route");
let invoiceRoute: typeof import("../src/app/api/invoices/route");
let emailRoute: typeof import("../src/app/api/send-receipt/route");
let invoiceStore: typeof import("../src/lib/invoices");
let companies: Awaited<ReturnType<typeof installCompanyFixture>>;
const companyIds = new Map<string, string>();
const previousTreasury = process.env.NEXT_PUBLIC_ETHEREUM_TREASURY_ADDRESS;
const previousResendKey = process.env.RESEND_API_KEY;
const previousResendFrom = process.env.RESEND_FROM;
const previousPublicOrigin = process.env.SNITCH_PUBLIC_ORIGIN;
const invoiceSender = "Snitch invoices <invoices@example.com>";
const publicOrigin = "https://snitchpay.vercel.app";
const validInvoice = {
  currency: "ETH",
  network: "Ethereum Sepolia",
  invoiceAmount: "0.0025",
  dueDate: "2028-02-29",
  customerName: "Stored customer",
  invoiceTitle: "Stored invoice title",
  treasuryAccount: "Stored company",
};

before(async () => {
  auth = installPrivyAuthFixture();
  process.env.NEXT_PUBLIC_ETHEREUM_TREASURY_ADDRESS = "0x1111111111111111111111111111111111111111";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM = invoiceSender;
  process.env.SNITCH_PUBLIC_ORIGIN = publicOrigin;
  companies = await installCompanyFixture();
  identityRoute = await import("../src/app/api/auth/me/route");
  invoiceRoute = await import("../src/app/api/invoices/route");
  emailRoute = await import("../src/app/api/send-receipt/route");
  invoiceStore = await import("../src/lib/invoices");
});

after(async () => {
  auth?.restore();
  (await companies?.restore());
  if (previousTreasury === undefined) delete process.env.NEXT_PUBLIC_ETHEREUM_TREASURY_ADDRESS;
  else process.env.NEXT_PUBLIC_ETHEREUM_TREASURY_ADDRESS = previousTreasury;
  if (previousResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previousResendKey;
  if (previousResendFrom === undefined) delete process.env.RESEND_FROM;
  else process.env.RESEND_FROM = previousResendFrom;
  if (previousPublicOrigin === undefined) delete process.env.SNITCH_PUBLIC_ORIGIN;
  else process.env.SNITCH_PUBLIC_ORIGIN = previousPublicOrigin;
});

function request(path: string, token?: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createOwnedInvoice(userId = fixtureUserId, overrides: Record<string, unknown> = {}) {
  let companyId = companyIds.get(userId);
  if (!companyId) {
    companyId = (await companies.create(userId, "Stored company", userId === fixtureUserId
      ? "0x1111111111111111111111111111111111111111"
      : "0x2222222222222222222222222222222222222222")).id;
    companyIds.set(userId, companyId);
  }
  const response = await invoiceRoute.POST(request("/api/invoices", auth.token({ userId }), { ...validInvoice, companyId, ...overrides }));
  assert.equal(response.status, 201);
  const { invoiceId } = await response.json();
  const invoice = (await invoiceStore.getInvoice(invoiceId));
  assert.ok(invoice);
  return invoice;
}

test("identity verification returns only the verified user ID and disallows caching", async () => {
  const response = await identityRoute.GET(request("/api/auth/me", auth.token()));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { userId: fixtureUserId });
});

test("missing, malformed, forged, expired and wrong-app tokens are rejected on every protected route", async () => {
  const rejectedTokens = [
    undefined,
    "not-a-token",
    "e30.e30.invalid",
    auth.token({ invalidSignature: true }),
    auth.token({ claims: { exp: Math.floor(Date.now() / 1000) - 60 } }),
    auth.token({ claims: { aud: "another-privy-app" } }),
    auth.token({ claims: { iss: "another-issuer" } }),
  ];
  for (const token of rejectedTokens) {
    const responses = [
      await identityRoute.GET(request("/api/auth/me", token)),
      await invoiceRoute.POST(request("/api/invoices", token, validInvoice)),
      await emailRoute.POST(request("/api/send-receipt", token, { customerEmail: "customer@example.com", invoiceId: "INV-UNKNOWN" })),
    ];
    for (const response of responses) {
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
      assert.deepEqual(await response.json(), { error: "Sign in again to continue." });
    }
  }
  const basicAuth = new Request("http://localhost/api/auth/me", { headers: { Authorization: "Basic ignored" } });
  assert.equal((await identityRoute.GET(basicAuth)).status, 401);
});

test("missing server configuration returns 503 without exposing credentials", async () => {
  delete process.env.PRIVY_APP_SECRET;
  try {
    const response = await identityRoute.GET(request("/api/auth/me", auth.token()));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Authentication is not configured." });
  } finally {
    process.env.PRIVY_APP_SECRET = auth.appSecret;
  }
  delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  delete process.env.PRIVY_APP_ID;
  try {
    assert.equal((await identityRoute.GET(request("/api/auth/me", auth.token()))).status, 503);
    process.env.PRIVY_APP_ID = auth.appId;
    assert.equal((await identityRoute.GET(request("/api/auth/me", auth.token()))).status, 200);
  } finally {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = auth.appId;
    delete process.env.PRIVY_APP_ID;
  }
});

test("invoice ownership is assigned from verified identity, ignoring a client-supplied owner", async () => {
  const invoice = await createOwnedInvoice(fixtureUserId, { ownerId: "did:privy:forged-owner" });
  assert.equal(invoice.ownerId, fixtureUserId);
  assert.deepEqual((await invoiceStore.getInvoiceForOwner(invoice.id, fixtureUserId)), invoice);
  assert.equal((await invoiceStore.getInvoiceForOwner(invoice.id, "did:privy:another-user")), undefined);
});

test("invoice email rejects unknown, unowned, or another user's invoice before any provider request", async () => {
  const foreign = await createOwnedInvoice("did:privy:another-user");
  const legacy = (await invoiceStore.createInvoice({
    amount: "0.01", customerName: "Legacy customer", title: "Legacy invoice", memo: "",
    dueDate: "2028-02-29", paymentTerms: "Due on receipt", treasuryAccount: "Legacy company",
  }));
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    assert.fail("An unauthorized invoice must never reach the email provider.");
  });
  try {
    for (const invoiceId of ["INV-UNKNOWN", foreign.id, legacy.id]) {
      const response = await emailRoute.POST(request("/api/send-receipt", auth.token(), {
        customerEmail: "customer@example.com", invoiceId,
        transaction: { invoiceId, ownerId: fixtureUserId, amount: "999 ETH" },
      }));
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "Invoice not found." });
    }
    const arbitrary = await emailRoute.POST(request("/api/send-receipt", auth.token(), {
      customerEmail: "customer@example.com", transaction: { id: "TX-FAKE", description: "INV-123", amount: "999 ETH" },
    }));
    assert.equal(arbitrary.status, 400);
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    fetchMock.mock.restore();
  }
});

test("an owner can send a stored invoice, and client-supplied invoice details cannot change its email", async () => {
  const invoice = await createOwnedInvoice();
  let email: { from: string; to: string[]; subject: string; html: string; text: string } | undefined;
  const fetchMock = mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    assert.equal(url, "https://api.resend.com/emails");
    email = JSON.parse(String(options?.body));
    return Response.json({ id: "test-delivery-id" });
  });
  try {
    const response = await emailRoute.POST(request("/api/send-receipt", auth.token(), {
      customerEmail: "customer@example.com",
      accountName: "Fake company",
      transaction: { invoiceId: invoice.id, amount: "999 ETH", customerName: "Fake customer", description: "Fake title" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(email);
    assert.equal(email.from, invoiceSender);
    assert.deepEqual(email.to, ["customer@example.com"]);
    assert.equal(email.subject, "Stored company sent you an invoice");
    assert.match(email.html, /0\.0025 ETH/);
    assert.match(email.html, /Stored customer/);
    assert.match(email.html, /Stored invoice title/);
    assert.match(email.html, /sent you an invoice for <strong>0\.0025 ETH<\/strong>/);
    assert.match(email.html, /View invoice/);
    assert.match(email.html, /Use Sepolia test ETH to pay this invoice\. This is a testnet payment\./);
    assert.match(email.html, /src="https:\/\/snitchpay\.vercel\.app\/snitch-logo\.png"/);
    assert.equal((email.html.match(/>Stored company<\/a>/g) || []).length, 1);
    assert.doesNotMatch(email.html, /background:#fafafa|Invoice details<\/p>\s*<p[^>]*padding/);
    assert.doesNotMatch(email.html, /linear-gradient/);
    assert.doesNotMatch(email.html, /Fake company|Fake customer|Fake title|999 ETH/);
    assert.match(email.text, /Hi Stored customer,/);
    assert.match(email.text, /Stored company sent you an invoice for 0\.0025 ETH/);
    assert.match(email.text, /Invoice details\nStored invoice title/);
    assert.match(email.text, /Use Sepolia test ETH to pay this invoice\. This is a testnet payment\./);
    assert.doesNotMatch(email.text, /Fake company|Fake customer|Fake title|999 ETH/);
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), ["ok", "paymentLink", "provider"]);
    const paymentUrl = new URL(result.paymentLink);
    assert.equal(paymentUrl.origin, publicOrigin);
    assert.equal(paymentUrl.search, "");
    assert.ok(paymentUrl.pathname.endsWith(`/${invoice.id}`));
    assert.ok(email.html.includes(`href="${result.paymentLink}"`));
    assert.ok(email.text.includes(`View invoice: ${result.paymentLink}`));
    assert.doesNotMatch(email.subject, new RegExp(invoice.id));
    assert.doesNotMatch(email.html.replace(result.paymentLink, ""), new RegExp(invoice.id));
    assert.doesNotMatch(email.text.replace(result.paymentLink, ""), new RegExp(invoice.id));
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally {
    fetchMock.mock.restore();
  }
});

test("invoice email retries share an idempotency key while separate sends remain independent", async () => {
  const invoice = await createOwnedInvoice();
  const secondInvoice = await createOwnedInvoice();
  const anotherOwner = "did:privy:another-user";
  const anotherOwnerInvoice = await createOwnedInvoice(anotherOwner);
  const deliveries: { key: string | null; body: string }[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (_url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    const headers = new Headers(options?.headers);
    assert.ok(options?.signal instanceof AbortSignal);
    deliveries.push({ key: headers.get("Idempotency-Key"), body: String(options?.body) });
    return Response.json({ id: "accepted-invoice-email" });
  });
  const requestId = "send-dialog-1234567890";
  const send = async (invoiceId: string, customerEmail = "customer@example.com", nextRequestId = requestId, userId = fixtureUserId) => {
    const response = await emailRoute.POST(request("/api/send-receipt", auth.token({ userId }), {
      invoiceId, customerEmail, requestId: nextRequestId,
    }));
    assert.equal(response.status, 200);
  };
  try {
    await send(invoice.id);
    await send(invoice.id);
    await send(invoice.id, "another@example.com");
    await send(secondInvoice.id);
    await send(invoice.id, "customer@example.com", "new-send-dialog-1234567890");
    await send(anotherOwnerInvoice.id, "customer@example.com", requestId, anotherOwner);
    assert.match(deliveries[0].key ?? "", /^invoice-email\/[a-f0-9]{64}$/);
    assert.equal(deliveries[0].key, deliveries[1].key);
    assert.equal(deliveries[0].body, deliveries[1].body);
    assert.equal(new Set(deliveries.map(({ key }) => key)).size, 5);
  } finally {
    fetchMock.mock.restore();
  }
});

test("missing sender uses Resend's test sender and explains its recipient restriction", async () => {
  const invoice = await createOwnedInvoice();
  delete process.env.RESEND_FROM;
  const fetchMock = mock.method(globalThis, "fetch", async (_url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    assert.equal(JSON.parse(String(options?.body)).from, "Snitch <onboarding@resend.dev>");
    return Response.json({
      name: "validation_error",
      message: "You can only send testing emails to your own email address (private-owner@example.com).",
    }, { status: 403 });
  });
  try {
    const response = await emailRoute.POST(request("/api/send-receipt", auth.token(), {
      invoiceId: invoice.id, customerEmail: "customer@example.com",
    }));
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.match(result.error, /test sender can only email the Resend account owner/);
    assert.match(result.error, /verified sending domain/);
    assert.doesNotMatch(result.error, /private-owner@example\.com/);
    assert.equal(result.ok, undefined);
  } finally {
    fetchMock.mock.restore();
    process.env.RESEND_FROM = invoiceSender;
  }
});

test("email provider errors do not claim delivery or expose raw service details", async () => {
  const invoice = await createOwnedInvoice();
  const scenarios = [
    { status: 401, message: /Check the Resend API key and sending domain/ },
    { status: 403, message: /Check the Resend API key and sending domain/ },
    { status: 429, message: /sending limit was reached/ },
    { status: 500, message: /Unable to send this invoice email/ },
  ];
  for (const scenario of scenarios) {
    const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({
      message: "Sensitive service detail: test-resend-key",
    }, { status: scenario.status }));
    try {
      const response = await emailRoute.POST(request("/api/send-receipt", auth.token(), {
        invoiceId: invoice.id, customerEmail: "customer@example.com",
      }));
      assert.equal(response.status, 502);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const result = await response.json();
      assert.match(result.error, scenario.message);
      assert.doesNotMatch(result.error, /Sensitive service detail|test-resend-key/);
      assert.equal(result.ok, undefined);
    } finally {
      fetchMock.mock.restore();
    }
  }
});

test("network failures and unconfirmed provider responses remain retryable failures", async () => {
  const invoice = await createOwnedInvoice();
  const scenarios = [
    { response: async () => { throw new DOMException("Timed out", "TimeoutError"); }, error: /did not respond/ },
    { response: async () => Response.json({}), error: /did not confirm sending/ },
    { response: async () => Response.json({ id: "" }), error: /did not confirm sending/ },
    { response: async () => new Response("not-json"), error: /did not confirm sending/ },
  ];
  for (const scenario of scenarios) {
    const fetchMock = mock.method(globalThis, "fetch", scenario.response);
    try {
      const response = await emailRoute.POST(request("/api/send-receipt", auth.token(), {
        invoiceId: invoice.id, customerEmail: "customer@example.com", requestId: "retry-email-1234567890",
      }));
      assert.equal(response.status, 502);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const result = await response.json();
      assert.match(result.error, scenario.error);
      assert.equal(result.ok, undefined);
    } finally {
      fetchMock.mock.restore();
    }
  }
});

test("invalid email configuration and malformed send requests never reach Resend", async () => {
  const invoice = await createOwnedInvoice();
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    assert.fail("Invalid requests and email configuration must not reach Resend.");
  });
  const body = { invoiceId: invoice.id, customerEmail: "customer@example.com" };
  try {
    for (const customerEmail of ["invalid", "Other <customer@example.com>", "customer@example.com\r\nBcc:other@example.com"]) {
      assert.equal((await emailRoute.POST(request("/api/send-receipt", auth.token(), { ...body, customerEmail }))).status, 400);
    }
    assert.equal((await emailRoute.POST(request("/api/send-receipt", auth.token(), { ...body, requestId: "short" }))).status, 400);
    delete process.env.RESEND_API_KEY;
    const missingKey = await emailRoute.POST(request("/api/send-receipt", auth.token(), body));
    assert.equal(missingKey.status, 503);
    assert.deepEqual(await missingKey.json(), { error: "Invoice email is not configured." });
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM = "Snitch <onboarding@resend.dev>\r\nBcc: other@example.com";
    const invalidSender = await emailRoute.POST(request("/api/send-receipt", auth.token(), body));
    assert.equal(invalidSender.status, 503);
    assert.deepEqual(await invalidSender.json(), { error: "The invoice email sender is not configured correctly." });
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    fetchMock.mock.restore();
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM = invoiceSender;
  }
});
