import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";

interface AdminRequestOptions {
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export function buildAdminHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

export async function requestAdminJson<T>(path: string, options: AdminRequestOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(path, {
    method: hasBody ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: options.signal,
    headers: hasBody
      ? {
          "Content-Type": "application/json",
          [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
        }
      : {},
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload
      && typeof payload === "object"
      && "message" in payload
      && typeof payload.message === "string"
      ? payload.message
      : "설정을 처리하지 못했습니다. 관리자 로그인과 연결을 확인해주세요.";
    throw new Error(message);
  }
  return payload as T;
}

export const centsToWon = (cents: number): number =>
  Math.round((Number(cents) || 0) / 100);

export const wonToCents = (won: number): number =>
  Math.round((Number(won) || 0) * 100);

export const formatWon = (cents: number, locale = "ko-KR"): string =>
  `₩${centsToWon(cents).toLocaleString(locale)}`;

export const formatNum = (n: number, locale = "ko-KR"): string =>
  (Number(n) || 0).toLocaleString(locale);

export const formatDate = (
  value: string | null | undefined,
  locale = "ko-KR",
): string => (value ? new Date(value).toLocaleDateString(locale) : "—");
