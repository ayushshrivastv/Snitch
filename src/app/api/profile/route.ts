import { NextResponse } from "next/server";
import { getPrivyClient, requirePrivyUser } from "@/lib/privy-server";
import { normalizeDisplayName, profileFromPrivyUser } from "@/lib/workspace-profile";

const headers = { "Cache-Control": "no-store" };
const requestOptions = { timeout: 15000, maxRetries: 0 };

export async function GET(request: Request) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;

  try {
    const client = getPrivyClient();
    if (!client) throw new Error("Missing configuration");
    const user = await client.users()._get(auth.userId, requestOptions);
    if (user.id !== auth.userId) throw new Error("Unexpected identity");
    return NextResponse.json(profileFromPrivyUser(user), { headers });
  } catch {
    return NextResponse.json({ error: "We couldn’t load your profile. Please try again." }, { status: 503, headers });
  }
}

export async function PUT(request: Request) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 2048) throw new Error("Request too large");
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Enter a name of up to 80 characters." }, { status: 400, headers });
  }
  const name = normalizeDisplayName(body && typeof body === "object" && "displayName" in body ? body.displayName : undefined);
  if (!name) return NextResponse.json({ error: "Enter a name of up to 80 characters." }, { status: 400, headers });

  try {
    const client = getPrivyClient();
    if (!client) throw new Error("Missing configuration");
    const current = await client.users()._get(auth.userId, requestOptions);
    if (current.id !== auth.userId) throw new Error("Unexpected identity");
    // The SDK replaces metadata, so preserve fields belonging to other features.
    const updated = await client.users().setCustomMetadata(auth.userId, {
      custom_metadata: { ...current.custom_metadata, display_name: name },
    }, requestOptions);
    if (updated.id !== auth.userId) throw new Error("Unexpected identity");
    return NextResponse.json(profileFromPrivyUser(updated), { headers });
  } catch {
    return NextResponse.json({ error: "We couldn’t save your name. Please try again." }, { status: 503, headers });
  }
}
