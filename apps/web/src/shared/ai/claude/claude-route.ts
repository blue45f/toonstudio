/**
 * 보조 기능(비전·구조화 출력 등)이 쓸 연결 해석.
 *
 * 사용자가 등록한 Claude 키가 있으면 그 키로 브라우저에서 공식 API에 직접 보낸다(사용자 결제 BYOK).
 * 등록한 키가 없으면 **ToonStudio AI 관리형 경로**를 돌려준다. 이 경로는 키 없이 서버
 * `/studio-ai/messages`로 가고, 서버가 운영 고성능 모델 → 성능 순 무료 모델 순서로 처리한다(사용자 비용 없음).
 * 그래서 보조 기능은 키가 없어도 항상 실행할 수 있고, 화면은 어느 경로로 가는지와 외부 전송 사실을 보여 준다.
 * 키는 `ClaudeRoute` 안에만 있고 화면용 요약(`ClaudeRouteSummary`)에는 없다.
 */
import { freeAiConnectionPolicyIssue } from "../free-ai-policy";
import { getUserAiSnapshot } from "../user-ai-store";
import { resolvedUserAiRoutes, type UserAiResolvedConnection } from "../user-ai-types";

import { CLAUDE_DEFAULT_MODEL_ID } from "./claude-models";
import { isAnthropicBaseUrl } from "./claude-protocol";

/** 사용자 AI 보관함 스냅샷. 화면은 구독한 스냅샷을, 호출 시점은 지금의 스냅샷을 넘긴다. */
type UserAiSnapshot = ReturnType<typeof getUserAiSnapshot>;

/** 관리형 경로의 고정 식별자. 연결 보관함의 ID와 겹치지 않는다(보관함 ID에는 `:`가 없다). */
export const MANAGED_ASSIST_ROUTE_ID = "toonstudio:managed";
export const MANAGED_ASSIST_ROUTE_LABEL = "ToonStudio AI";

export interface ClaudeRouteSummary {
  readonly routeId: string;
  readonly connectionId: string;
  readonly label: string;
  readonly model: string;
  /** true면 키 없이 서버가 처리하는 관리형 경로(사용자 비용 없음). */
  readonly managed?: boolean;
}

export interface ClaudeRoute extends ClaudeRouteSummary {
  readonly apiKey: string;
  /** 경로를 해석한 시점의 연결 리비전. 바뀌면 요청을 보내지 않는다. */
  readonly revision: number;
}

function sortValue(route: UserAiResolvedConnection): number {
  return (route.priority ?? 100) * 1_000_000;
}

/** 보관함 스냅샷에서 쓸 수 있는 사용자 Claude 키 경로를 우선순위 순으로 고른다. 스냅샷을 주지 않으면 지금의 스냅샷을 읽는다. */
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

/** 사용자가 등록한 Claude 키 경로만. 비용·예산 화면처럼 사용자 결제 경로가 있을 때만 의미 있는 곳에서 쓴다. */
export function resolveUserClaudeRoute(snapshot: UserAiSnapshot = getUserAiSnapshot()): ClaudeRoute | null {
  return listClaudeRoutes(snapshot)[0] ?? null;
}

/** 키 없이 서버가 처리하는 관리형 경로. 모델은 서버 허용 목록 안에서 서버가 최종 결정한다. */
export function managedAssistRoute(snapshot: UserAiSnapshot = getUserAiSnapshot()): ClaudeRoute {
  return {
    routeId: MANAGED_ASSIST_ROUTE_ID,
    connectionId: MANAGED_ASSIST_ROUTE_ID,
    label: MANAGED_ASSIST_ROUTE_LABEL,
    model: CLAUDE_DEFAULT_MODEL_ID,
    apiKey: "",
    revision: snapshot.revision,
    managed: true,
  };
}

/** 등록한 키가 있으면 그 키, 없으면 관리형 경로. 보조 기능은 항상 실행할 경로를 얻는다. */
export function resolveClaudeRoute(snapshot: UserAiSnapshot = getUserAiSnapshot()): ClaudeRoute {
  return resolveUserClaudeRoute(snapshot) ?? managedAssistRoute(snapshot);
}

export function isManagedAssistRoute(route: { readonly managed?: boolean } | null | undefined): boolean {
  return route?.managed === true;
}

/**
 * 관리형 경로 응답의 모델 표기("ToonStudio AI (실제 모델)"). 사용자 비용이 없으므로 가격표(모델 ID 정확 일치)에
 * 걸리지 않는 이름으로 감싸, 결과 화면의 추정 비용이 사용자 청구처럼 보이지 않게 한다.
 */
export function managedAssistModelLabel(servedModel: string): string {
  const served = servedModel.trim();
  return served ? `${MANAGED_ASSIST_ROUTE_LABEL} (${served})` : MANAGED_ASSIST_ROUTE_LABEL;
}

export function isManagedAssistModelLabel(model: string): boolean {
  return model === MANAGED_ASSIST_ROUTE_LABEL || model.startsWith(`${MANAGED_ASSIST_ROUTE_LABEL} (`);
}

export function summarizeClaudeRoute(route: ClaudeRoute): ClaudeRouteSummary {
  return {
    routeId: route.routeId,
    connectionId: route.connectionId,
    label: route.label,
    model: route.model,
    ...(route.managed ? { managed: true } : {}),
  };
}
