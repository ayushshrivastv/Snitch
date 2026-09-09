export type WorkspaceVerification = { userId: string; verified: boolean; error?: string };

export function startWorkspaceVerification({ userId, getAccessToken, onResult }: {
  userId: string;
  getAccessToken: () => Promise<string | null>;
  onResult: (result: WorkspaceVerification) => void;
}) {
  const controller = new AbortController();
  let finished = false;
  const timeout = setTimeout(() => {
    finish({ verified: false, error: "The connection timed out. Please try again." });
    controller.abort();
  }, 30000);

  function finish(result: Omit<WorkspaceVerification, "userId">) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    onResult({ userId, ...result });
  }

  async function verify() {
    try {
      const token = await getAccessToken();
      // Token retrieval cannot be aborted, so ignore it after cleanup or the deadline.
      if (finished) return;
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      if (finished) return;
      if (response.status === 401) throw new Error("Your session has expired. Please sign in again.");
      if (!response.ok) throw new Error("We couldn’t verify your session. Please try again.");
      const session = await response.json() as { userId?: string };
      if (session.userId !== userId) throw new Error("Please sign in again to continue.");
      finish({ verified: true });
    } catch (error) {
      finish({ verified: false, error: error instanceof Error ? error.message : "We couldn’t verify your session. Please try again." });
    }
  }

  void verify();
  return () => {
    finished = true;
    controller.abort();
    clearTimeout(timeout);
  };
}
