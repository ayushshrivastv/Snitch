import type { WorkspaceProfile } from "@/lib/workspace-profile";

export async function requestWorkspaceProfile({ userId, getAccessToken, displayName, signal }: {
  userId: string;
  getAccessToken: () => Promise<string | null>;
  displayName?: string;
  signal?: AbortSignal;
}): Promise<WorkspaceProfile> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 25000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();

  let cancelAbortListener = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    const onAbort = () => reject(new Error("The connection timed out. Please try again."));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    cancelAbortListener = () => controller.signal.removeEventListener("abort", onAbort);
    if (controller.signal.aborted) onAbort();
  });

  async function request() {
    const token = await getAccessToken();
    controller.signal.throwIfAborted();
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch("/api/profile", {
      method: displayName === undefined ? "GET" : "PUT",
      headers: { Authorization: `Bearer ${token}`, ...(displayName === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(displayName === undefined ? {} : { body: JSON.stringify({ displayName }) }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 401) throw new Error("Your session has expired. Please sign in again.");
    const body = await response.json() as Partial<WorkspaceProfile> & { error?: string };
    if (!response.ok) throw new Error(body.error || "We couldn’t load your profile. Please try again.");
    if (body.userId !== userId || (body.name !== null && typeof body.name !== "string") || typeof body.initials !== "string" || typeof body.needsName !== "boolean") {
      throw new Error("We couldn’t confirm your profile. Please try again.");
    }
    return body as WorkspaceProfile;
  }

  try {
    return await Promise.race([request(), interrupted]);
  } finally {
    clearTimeout(timeout);
    cancelAbortListener();
    signal?.removeEventListener("abort", abort);
  }
}
