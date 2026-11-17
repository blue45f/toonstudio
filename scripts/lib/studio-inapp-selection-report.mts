/** 기존 인앱 route 계약의 실행 범위와 완료 증거만 계산한다. 브라우저 판정은 변경하지 않는다. */
export interface StudioInAppCase {
  readonly profile: string;
  readonly route: string;
}

interface RouteDefinition { readonly id: string; readonly profiles?: readonly string[] }
export interface StudioInAppCatalog {
  readonly profiles: readonly string[];
  readonly routes: readonly string[];
  readonly eligible: readonly StudioInAppCase[];
  readonly excludedByProfile: number;
}
export interface StudioInAppSelection {
  readonly scope: "full" | "selected";
  readonly planned: readonly StudioInAppCase[];
  readonly totalEligible: number;
  readonly excludedByFilter: number;
}
export interface StudioInAppFilterEnv {
  readonly TOONSPECTRUM_INAPP_VERIFY_PROFILES?: string;
  readonly TOONSPECTRUM_INAPP_VERIFY_ROUTES?: string;
}
export interface StudioInAppFatalFailure {
  readonly phase: string;
  readonly case: StudioInAppCase | null;
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}
interface ResultEvidence extends StudioInAppCase {
  readonly ok: boolean;
  readonly hardFailures: readonly string[];
}

const idOf = (item: StudioInAppCase): string => `${item.profile}/${item.route}`;

function definitionIds(values: readonly { readonly id: string }[], label: string): string[] {
  const ids = values.map(value => value.id);
  if (ids.some(id => !/^[a-z0-9-]+$/u.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error(`${label} 정의에 잘못되거나 중복된 ID가 있습니다.`);
  }
  return ids;
}

export function createStudioInAppCatalog(
  profiles: readonly { readonly id: string }[], routes: readonly RouteDefinition[],
): StudioInAppCatalog {
  const profileIds = definitionIds(profiles, "profile");
  const routeIds = definitionIds(routes, "route");
  for (const route of routes) {
    if (route.profiles?.some(profile => !profileIds.includes(profile))) throw new Error(`${route.id}: 정의하지 않은 profile 제약입니다.`);
  }
  const eligible = profiles.flatMap(profile => routes
    .filter(route => !route.profiles || route.profiles.includes(profile.id))
    .map(route => ({ profile: profile.id, route: route.id })));
  return { profiles: profileIds, routes: routeIds, eligible,
    excludedByProfile: profiles.length * routes.length - eligible.length };
}

function filterIds(raw: string | undefined, known: readonly string[], label: string): string[] | null {
  if (raw === undefined) return null;
  const ids = raw.split(",").map(id => id.trim());
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error(`${label}: 빈 값이나 중복 ID로 범위를 선택할 수 없습니다.`);
  const unknown = ids.filter(id => !known.includes(id));
  if (unknown.length > 0) throw new Error(`${label}: 알 수 없는 ID ${unknown.join(", ")}`);
  return ids;
}

export function selectStudioInAppCases(catalog: StudioInAppCatalog, env: StudioInAppFilterEnv = {}): StudioInAppSelection {
  const profiles = filterIds(env.TOONSPECTRUM_INAPP_VERIFY_PROFILES, catalog.profiles, "TOONSPECTRUM_INAPP_VERIFY_PROFILES");
  const routes = filterIds(env.TOONSPECTRUM_INAPP_VERIFY_ROUTES, catalog.routes, "TOONSPECTRUM_INAPP_VERIFY_ROUTES");
  if (profiles && routes) {
    const eligible = new Set(catalog.eligible.map(idOf));
    const invalid = profiles.flatMap(profile => routes.map(route => ({ profile, route }))).filter(item => !eligible.has(idOf(item)));
    if (invalid.length > 0) throw new Error(`원래 검사에 부적격한 profile/route 조합입니다: ${invalid.map(idOf).join(", ")}`);
  }
  const planned = catalog.eligible.filter(item => (!profiles || profiles.includes(item.profile)) && (!routes || routes.includes(item.route)));
  if (planned.length === 0) throw new Error("선택한 원래 인앱 검사가 0개입니다. 필터와 profile 제약을 확인하세요.");
  return { scope: profiles || routes ? "selected" : "full", planned,
    totalEligible: catalog.eligible.length, excludedByFilter: catalog.eligible.length - planned.length };
}

/** 일부 결과·fatal·미실행을 완료로 승격하지 않으며 원래 RouteResult를 그대로 보존한다. */
export function buildStudioInAppReport<Result extends ResultEvidence>({
  catalog, selection, env = {}, results, phase, activeCase = null, fatalFailure = null,
}: {
  readonly catalog: StudioInAppCatalog;
  readonly selection: StudioInAppSelection | null;
  readonly env?: StudioInAppFilterEnv;
  readonly results: readonly Result[];
  readonly phase: string;
  readonly activeCase?: StudioInAppCase | null;
  readonly fatalFailure?: StudioInAppFatalFailure | null;
}) {
  const planned = selection?.planned ?? [];
  const plannedIds = planned.map(idOf);
  const completedIds = results.map(idOf);
  const identitiesMatch = completedIds.every((id, index) => id === plannedIds[index]);
  const failures: string[] = [];
  if (!identitiesMatch) failures.push("실행 결과가 계획한 순서·ID와 일치하지 않습니다.");
  for (const result of results) {
    if (result.ok !== true || !Array.isArray(result.hardFailures) || result.hardFailures.length !== 0) {
      failures.push(`${idOf(result)}: 원래 route 판정 실패`);
    }
  }
  if (activeCase && (!plannedIds.includes(idOf(activeCase)) || completedIds.includes(idOf(activeCase)))) {
    failures.push("진행 중인 case가 계획 또는 완료 결과와 일치하지 않습니다.");
  }
  if (fatalFailure) failures.push(`${fatalFailure.phase}: ${fatalFailure.name}: ${fatalFailure.message}`);
  const complete = phase === "complete" && selection !== null && planned.length > 0
    && completedIds.length === plannedIds.length && identitiesMatch && !activeCase && !fatalFailure;
  if (phase === "complete" && !complete && failures.length === 0) failures.push("계획한 검사가 모두 실행되지 않았습니다.");
  const scope = selection?.scope ?? (env.TOONSPECTRUM_INAPP_VERIFY_PROFILES !== undefined
    || env.TOONSPECTRUM_INAPP_VERIFY_ROUTES !== undefined ? "selected" : "full");
  return {
    kind: "toonstudio-studio-inapp-browser-v1" as const, scope, phase,
    requested: { profiles: env.TOONSPECTRUM_INAPP_VERIFY_PROFILES ?? null, routes: env.TOONSPECTRUM_INAPP_VERIFY_ROUTES ?? null },
    selectionValid: selection !== null, planned, plannedIds,
    totalEligible: catalog.eligible.length, excludedByFilter: catalog.eligible.length - planned.length,
    excludedByProfile: catalog.excludedByProfile, results: [...results], completedIds,
    activeCase, notRun: planned.filter(item => !completedIds.includes(idOf(item)) && (!activeCase || idOf(activeCase) !== idOf(item))),
    fatalFailure, failures, complete, ok: complete && failures.length === 0,
  };
}

export function studioInAppResultLine(report: {
  readonly scope: string; readonly ok: boolean; readonly planned: readonly StudioInAppCase[];
  readonly results: readonly ResultEvidence[]; readonly totalEligible: number; readonly excludedByFilter: number;
}): string {
  if (report.scope === "selected") return `RESULT: SELECTED ${report.ok ? "OK" : "FAIL"} (${report.results.length}/${report.planned.length} selected; eligible ${report.totalEligible}; excluded ${report.excludedByFilter})`;
  return report.ok ? `RESULT: OK (${report.results.length} runs green)`
    : `RESULT: FAIL (${report.results.filter(result => !result.ok).length}/${report.results.length} runs)`;
}
