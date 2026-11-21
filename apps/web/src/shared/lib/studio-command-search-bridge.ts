/**
 * App shell → Studio command-search bridge.
 *
 * The global command palette lives in the shared shell while the registry-backed search
 * lives in the creator domain. Importing the creator domain from shared UI would invert the
 * dependency graph, so the shell publishes a request through this tiny synchronous channel.
 *
 * Requests are intentionally not replayed. When Studio has not mounted a listener yet the
 * caller receives `false` and can keep the existing global-palette fallback.
 */

export type StudioCommandSearchBridgeScope =
  | "all"
  | "inspector"
  | "command"
  | "help";

export interface StudioCommandSearchBridgeRequest {
  readonly scope?: StudioCommandSearchBridgeScope;
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

type StudioCommandExecutionBridgeListener = (
  request: StudioCommandExecutionBridgeRequest,
) => boolean;

const listeners = new Set<StudioCommandSearchBridgeListener>();
const executionListeners = new Set<StudioCommandExecutionBridgeListener>();

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
 * 전역 커맨드 팔레트에서 스튜디오 내부 명령을 즉시 실행 요청한다.
 * 연결된 Studio 호스트가 실행을 수락하면 `true`를 반환한다.
 */
export function requestStudioCommandExecutionFromPalette(
  request: StudioCommandExecutionBridgeRequest,
): boolean {
  let handled = false;
  for (const listener of [...executionListeners]) {
    if (listener(request)) handled = true;
  }
  return handled;
}

export function subscribeStudioCommandExecutionFromPalette(
  listener: StudioCommandExecutionBridgeListener,
): () => void {
  executionListeners.add(listener);
  return () => {
    executionListeners.delete(listener);
  };
}

/** Test-only observability for bridge lifecycle contracts. */
export function studioCommandSearchBridgeListenerCount(): number {
  return listeners.size;
}

/** Test-only reset for isolated jsdom suites. */
export function resetStudioCommandSearchBridgeForTests(): void {
  listeners.clear();
  executionListeners.clear();
}
