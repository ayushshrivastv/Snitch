import { generateKeyPairSync, sign } from "node:crypto";
import { mock } from "node:test";
import { PrivyClient } from "@privy-io/node";

const appId = "test-snitch-app";
const appSecret = "test-snitch-secret";
export const fixtureUserId = "did:privy:invoice-owner";

export function installPrivyAuthFixture() {
  const previous = {
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    PRIVY_APP_ID: process.env.PRIVY_APP_ID,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
  };
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = appId;
  process.env.PRIVY_APP_SECRET = appSecret;

  const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const wrongKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const verificationKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  // Only replace key discovery: the actual SDK still verifies every JWT and claim.
  const fixtureClient = new PrivyClient({ appId, appSecret, jwtVerificationKey: verificationKey });
  const fixtureUtils = fixtureClient.utils();
  const utilsMock = mock.method(PrivyClient.prototype, "utils", () => fixtureUtils);

  return {
    appId,
    appSecret,
    token(options: { userId?: string; claims?: Record<string, unknown>; invalidSignature?: boolean } = {}) {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({
        iss: "privy.io",
        aud: appId,
        sub: options.userId ?? fixtureUserId,
        sid: "test-session",
        iat: now,
        exp: now + 3600,
        ...options.claims,
      })).toString("base64url");
      const message = `${header}.${payload}`;
      const signature = sign("sha256", Buffer.from(message), {
        key: options.invalidSignature ? wrongKeys.privateKey : keys.privateKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64url");
      return `${message}.${signature}`;
    },
    restore() {
      utilsMock.mock.restore();
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    },
  };
}
