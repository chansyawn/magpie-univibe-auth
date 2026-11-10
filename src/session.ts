export interface KeyedSingleFlight<T> {
  run(key: string, operation: () => Promise<T>): Promise<T>;
}

export function createKeyedSingleFlight<T>(): KeyedSingleFlight<T> {
  const inFlight = new Map<string, Promise<T>>();
  return {
    async run(key, operation) {
      const existing = inFlight.get(key);
      if (existing) return existing;

      const pending = operation().finally(() => {
        if (inFlight.get(key) === pending) inFlight.delete(key);
      });
      inFlight.set(key, pending);
      return pending;
    },
  };
}

export function canReplayBody(body: BodyInit | null | undefined): boolean {
  return (
    body === undefined ||
    body === null ||
    typeof body === "string" ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof FormData
  );
}

export function replayHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  headers.delete("content-length");
  return headers;
}
