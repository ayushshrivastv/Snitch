export async function requestCompanyWallet<T>(path: string, {
  signal,
  getAccessToken,
}: {
  signal: AbortSignal;
  getAccessToken: () => Promise<string | null>;
}, init?: RequestInit): Promise<T> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => {
    controller.abort(new Error("The connection timed out. Please try again."));
  }, 25000);

  let removeAbortListener = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    const onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => controller.signal.removeEventListener("abort", onAbort);
  });

  async function execute() {
    const token = await getAccessToken();
    // Token retrieval cannot be cancelled. Never send a late token after logout.
    controller.signal.throwIfAborted();
    if (!token) throw new Error("Sign in again to continue.");
    const response = await fetch(path, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: { ...init?.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    controller.signal.throwIfAborted();
    const data = await response.json();
    controller.signal.throwIfAborted();
    if (!response.ok) throw new Error(data.error || "We couldn’t save your company. Please try again.");
    return data as T;
  }

  try {
    return await Promise.race([execute(), interrupted]);
  } finally {
    clearTimeout(timeout);
    removeAbortListener();
    signal.removeEventListener("abort", cancel);
  }
}
