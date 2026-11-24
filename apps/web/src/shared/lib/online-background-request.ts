function browserIsOffline(): boolean {
  return typeof window !== "undefined" && window.navigator.onLine === false;
}

function waitForReconnect(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    function cleanup() {
      window.removeEventListener("online", resume);
      signal?.removeEventListener("abort", cancel);
    }
    function resume() {
      cleanup();
      resolve();
    }
    function cancel() {
      cleanup();
      reject(signal?.reason);
    }
    window.addEventListener("online", resume);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

/** 명시적인 오프라인 동안만 대기한다. HTTP 오류와 연결된 상태의 네트워크 실패는 호출자가 처리한다. */
export async function runOnlineBackgroundRequest<T>(
  request: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  for (;;) {
    signal?.throwIfAborted();
    if (browserIsOffline()) {
      await waitForReconnect(signal);
      continue;
    }
    try {
      return await request();
    } catch (error) {
      if (!(error instanceof TypeError) || !browserIsOffline()) throw error;
    }
  }
}
