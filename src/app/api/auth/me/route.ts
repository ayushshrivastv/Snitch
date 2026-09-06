import { NextResponse } from "next/server";

import { requirePrivyUser } from "@/lib/privy-server";

export async function GET(request: Request) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;

  return NextResponse.json({ userId: auth.userId }, { headers: { "Cache-Control": "no-store" } });
}
