/**
 * Claude 네이티브 기능(비전·구조화 출력 등)이 쓸 연결 해석.
 *
 * OpenAI 호환 호출자는 라우팅 모드(자동·우선순위·수동)가 고른 연결로 가지만, Claude 전용 기능은
 * "Claude 연결이 있는가"가 전제다. 정책 검사를 통과한(공식 호스트·사용자 결제 BYOK·텍스트 모델)
 * 활성 연결만 후보가 되며, 화면은 사용 전에 외부 전송·요금 청구 사실을 항상 보여 줘야 한다.
 * 키는 `ClaudeRoute` 안에만 있고 화면용 요약(`ClaudeRouteSummary`)에는 없다.
 */
import { freeAiConnectionPolicyIssue } from "../free-ai-policy";
import { getUserAiSnapshot } from "../user-ai-store";
import { resolvedUserAiRoutes, type UserAiResolvedConnection } from "../user-ai-types";

import { isAnthropicBaseUrl } from "./claude-protocol";

/** 사용자 AI 보관함 스냅샷. 화면은 구독한 스냅샷을, 호출 시점은 지금의 스냅샷을 넘긴다. */
type UserAiSnapshot = ReturnType<typeof getUserAiSnapshot>;

export interface ClaudeRouteSummary {
  readonly routeId: string;
  readonly connectionId: string;
  readonly label: string;
  readonly model: string;
}

export interface ClaudeRoute extends ClaudeRouteSummary {
  readonly apiKey: string;
  /** 경로를 해석한 시점의 연결 리비전. 바뀌면 요청을 보내지 않는다. */
  readonly revision: number;
}

function sortValue(route: UserAiResolvedConnection): number {
  return (route.priority ?? 100) * 1_000_000;
}

/** 보관함 스냅샷에서 쓸 수 있는 Claude 경로를 우선순위 순으로 고른다. 스냅샷을 주지 않으면 지금의 스냅샷을 읽는다. */
export function listClaudeRoutes(snapshot: UserAiSnapshot = getUserAiSnapshot()): ClaudeRoute[] {
  return snapshot.configuration.connections
    .filter((connection) => isAnthropicBaseUrl(connection.baseUrl))
    .flatMap((connection) => resolvedUserAiRoutes(connection, "text"))
    .filter((route) => freeAiConnectionPolicyIssue(route, "text") === null)
    .map((route, index) => ({ route, index }))
    .sort((left, right) => sortValue(left.route) - sortValue(right.route) || left.index - right.index)
    .map(({ route }) => ({
      routeId: route.routeId,
      connectionId: route.id,
      label: route.label,
      model: route.textModel,
      apiKey: route.apiKey,
      revision: snapshot.revision,
    }));
}

export function resolveClaudeRoute(snapshot: UserAiSnapshot = getUserAiSnapshot()): ClaudeRoute | null {
  return listClaudeRoutes(snapshot)[0] ?? null;
}

export function summarizeClaudeRoute(route: ClaudeRoute): ClaudeRouteSummary {
  return {
    routeId: route.routeId,
    connectionId: route.connectionId,
    label: route.label,
    model: route.model,
  };
}
