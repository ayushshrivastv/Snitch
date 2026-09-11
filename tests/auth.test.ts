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
  let email: { to: string[]; subject: string; html: string } | undefined;
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
    assert.ok(email);
    assert.deepEqual(email.to, ["customer@example.com"]);
    assert.equal(email.subject, `Invoice ${invoice.id} from Stored company`);
    assert.match(email.html, /0\.0025 ETH/);
    assert.match(email.html, /Stored customer/);
    assert.match(email.html, /Stored invoice title/);
    assert.doesNotMatch(email.html, /Fake company|Fake customer|Fake title|999 ETH/);
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), ["ok", "paymentLink", "provider"]);
    const paymentUrl = new URL(result.paymentLink);
    assert.equal(paymentUrl.search, "");
    assert.ok(paymentUrl.pathname.endsWith(`/${invoice.id}`));
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally {
    fetchMock.mock.restore();
  }
});
