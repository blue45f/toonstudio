/**
 * App shell → Studio command-search & live command execution bridge.
 *
 * The global command palette lives in the shared shell while the registry-backed search
 * and execution bindings live in the creator domain. Importing the creator domain from
 * shared UI would invert the dependency graph, so the shell talks through this tiny
 * synchronous channel.
 *
 * Requests are intentionally not replayed. When Studio has not mounted a listener yet the
 * caller receives `false` / `{ status: "unmounted" }`.
 */

export type StudioCommandSearchBridgeScope =
  | "all"
  | "inspector"
  | "command"
  | "help";

export interface StudioCommandSearchBridgeRequest {
  readonly scope?: StudioCommandSearchBridgeScope;
  readonly query?: string;
}

type StudioCommandSearchBridgeListener = (
  request: StudioCommandSearchBridgeRequest,
) => void;

export interface StudioCommandExecutionBridgeRequest {
  readonly commandId: string;
  readonly toolId?: string;
  readonly label?: string;
  readonly shortcutKey?: string;
}

export type StudioCommandExecutionAvailability =
  | { readonly status: "executable"; readonly label?: string }
  | { readonly status: "disabled"; readonly reason: string }
  | { readonly status: "unbound" }
  | { readonly status: "unmounted" };

export interface StudioCommandExecutionBridgeHandler {
  /** 순수 읽기 전용 가용성 검사 — 절대 명령을 실행하지 않는다. */
  readonly inspect: (
    request: StudioCommandExecutionBridgeRequest,
  ) => Exclude<StudioCommandExecutionAvailability, { readonly status: "unmounted" }>;
  /** 실제 명령 실행 — 호출자가 IME·중복 실행 가드를 통과한 뒤에만 호출한다. */
  readonly execute: (request: StudioCommandExecutionBridgeRequest) => boolean;
}

const listeners = new Set<StudioCommandSearchBridgeListener>();
const executionHandlers = new Set<StudioCommandExecutionBridgeHandler>();

/**
 * Ask the currently mounted Studio search host to open.
 *
 * @returns `true` when at least one Studio host accepted the request; otherwise `false`.
 */
export function requestStudioCommandSearchFromAppShell(
  request: StudioCommandSearchBridgeRequest = {},
): boolean {
  if (listeners.size === 0) return false;
  for (const listener of [...listeners]) listener(request);
  return true;
}

export function subscribeStudioCommandSearchFromAppShell(
  listener: StudioCommandSearchBridgeListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 명령 실행 전 읽기 전용으로 가용성(실행 가능·비활성 사유·미바인딩·미마운트)을 점검한다.
 * 부작용이 없으므로 IME/중복 실행 claim 이전에 안전하게 호출할 수 있다.
 */
export function inspectStudioCommandExecutionFromPalette(
  request: StudioCommandExecutionBridgeRequest,
): StudioCommandExecutionAvailability {
  if (executionHandlers.size === 0) return { status: "unmounted" };
  let disabledReason: string | null = null;
  for (const handler of [...executionHandlers]) {
    const result = handler.inspect(request);
    if (result.status === "executable") return result;
    if (result.status === "disabled" && disabledReason === null) {
      disabledReason = result.reason;
    }
  }
  if (disabledReason !== null) return { status: "disabled", reason: disabledReason };
  return { status: "unbound" };
}

/**
 * 전역 커맨드 팔레트에서 스튜디오 내부 명령을 즉시 실행 요청한다.
 * 호출자는 반드시 IME/중복 실행 가드를 선행 통과한 뒤 호출해야 한다.
 */
export function requestStudioCommandExecutionFromPalette(
  request: StudioCommandExecutionBridgeRequest,
): boolean {
  for (const handler of [...executionHandlers]) {
    if (handler.execute(request)) return true;
  }
  return false;
}

export function subscribeStudioCommandExecutionFromPalette(
  handler: StudioCommandExecutionBridgeHandler,
): () => void {
  executionHandlers.add(handler);
  return () => {
    executionHandlers.delete(handler);
  };
}

/** Test-only observability for bridge lifecycle contracts. */
export function studioCommandSearchBridgeListenerCount(): number {
  return listeners.size;
}

/** Test-only reset for isolated jsdom suites. */
export function resetStudioCommandSearchBridgeForTests(): void {
  listeners.clear();
  executionHandlers.clear();
}
