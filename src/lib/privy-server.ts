import { PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";

type PrivyRequestIdentity = { userId: string } | { response: NextResponse };
let cachedClient: { appId: string; appSecret: string; client: PrivyClient } | undefined;

function authenticationError(status: 401 | 503) {
  return NextResponse.json(
    { error: status === 401 ? "Sign in again to continue." : "Authentication is not configured." },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}),
      },
    },
  );
}

export function getPrivyClient() {
  // Keep this module in server routes. The runtime guard also works in plain Node tests.
  if (typeof window !== "undefined") return undefined;

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || process.env.PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) return undefined;

  if (!cachedClient || cachedClient.appId !== appId || cachedClient.appSecret !== appSecret) {
    cachedClient = { appId, appSecret, client: new PrivyClient({ appId, appSecret }) };
  }
  return cachedClient.client;
}

export async function requirePrivyUser(request: Request): Promise<PrivyRequestIdentity> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    return { response: authenticationError(401) };
  }

  let client: PrivyClient | undefined;
  try {
    client = getPrivyClient();
  } catch {
    return { response: authenticationError(503) };
  }
  if (!client) return { response: authenticationError(503) };

  try {
    // The SDK checks signature, issuer, audience and expiration before returning claims.
    const claims = await client.utils().auth().verifyAccessToken(token);
    if (!claims.user_id) return { response: authenticationError(401) };
    return { userId: claims.user_id };
  } catch {
    // Never expose the token, credentials, or the SDK's underlying error.
    return { response: authenticationError(401) };
  }
}
