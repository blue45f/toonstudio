/**
 * 복귀 맥락(return context) 계약 — BLUEPRINT §2.4의 단일 원천.
 *
 * 표면을 떠날 때 `{ returnTo, stageId, projectId, episodeId, intent }`를 넘기고,
 * 도착 표면은 (a) 맥락 배너 한 줄과 (b) 완료 시 복귀 행동 하나를 제공한다.
 * 학습 미션 바(`StudioLessonMissionBar`)가 이 패턴의 원형이며, 이 모듈이 그 계약을
 * 표면 공통으로 일반화한다. 마켓 상세→에디터 적용 경로가 첫 파일럿이다.
 *
 * 원칙 (BLUEPRINT §2.4 위험 항목):
 * - 맥락은 세션 상태가 우선이다. URL 파라미터는 새로고침 복원에 필요한 이 최소 키만 쓴다.
 * - `returnTo`는 내부 경로만 인정한다. 외부 URL·스킴·이중 슬래시·백슬래시는 거부하고,
 *   returnTo가 다시 returnTo를 품은 중첩 복귀(루프)도 거부한다.
 * - 모르는 intent·stageId, 형식이 어긋난 projectId·episodeId가 있으면 맥락 전체를
 *   버린다(추측해서 이어 붙이지 않는다). 도착 표면은 배너를 띄우지 않을 뿐 기존
 *   동선은 그대로 동작한다.
 */

/** 회차 단계 식별자. S2-1 `EpisodeStageId`(production-project-surfaces)와 값을 맞춘다. */
export type ReturnContextStageId =
  | "plan"
  | "storyboard"
  | "art"
  | "lettering"
  | "review"
  | "publish"
  | "operate";

/** 왜 다른 표면으로 이동했는가. 도착 표면의 배너 문구와 복귀 행동을 결정한다. */
export type ReturnContextIntent =
  | "apply-market-resource"
  | "lesson-practice"
  | "manual-deep-link"
  | "continue-work";

export interface ReturnContext {
  /** 떠난 표면으로 돌아갈 내부 경로 (쿼리 포함 가능, 해시 불가). */
  readonly returnTo: string;
  readonly intent: ReturnContextIntent;
  readonly stageId?: ReturnContextStageId;
  readonly projectId?: string;
  readonly episodeId?: string;
}

export const RETURN_CONTEXT_STAGE_IDS: readonly ReturnContextStageId[] = Object.freeze([
  "plan",
  "storyboard",
  "art",
  "lettering",
  "review",
  "publish",
  "operate",
]);

export const RETURN_CONTEXT_INTENTS: readonly ReturnContextIntent[] = Object.freeze([
  "apply-market-resource",
  "lesson-practice",
  "manual-deep-link",
  "continue-work",
]);

export interface ReturnContextLabel {
  readonly ko: string;
  readonly en: string;
}

/** 단계 라벨은 S2-1 EPISODE_STAGES의 표기와 동일하게 유지한다. */
export const RETURN_CONTEXT_STAGE_LABEL: Readonly<Record<ReturnContextStageId, ReturnContextLabel>> = {
  plan: { ko: "기획", en: "Plan" },
  storyboard: { ko: "콘티", en: "Storyboard" },
  art: { ko: "작화", en: "Art" },
  lettering: { ko: "식자·연출", en: "Lettering" },
  review: { ko: "검수", en: "Review" },
  publish: { ko: "게시", en: "Publish" },
  operate: { ko: "운영", en: "Operate" },
};

const INTENT_BANNER: Readonly<Record<ReturnContextIntent, ReturnContextLabel>> = {
  "apply-market-resource": { ko: "마켓 소재 적용 중", en: "Applying a market resource" },
  "lesson-practice": { ko: "학습 실습 중", en: "Lesson practice in progress" },
  "manual-deep-link": { ko: "매뉴얼에서 이어서 실행 중", en: "Continuing from the manual" },
  "continue-work": { ko: "이전 작업 이어가는 중", en: "Continuing earlier work" },
};

const INTENT_RETURN_LABEL: Readonly<Record<ReturnContextIntent, ReturnContextLabel>> = {
  "apply-market-resource": { ko: "끝나면 리소스로 돌아가기", en: "Back to the resource when done" },
  "lesson-practice": { ko: "끝나면 강의로 돌아가기", en: "Back to the lesson when done" },
  "manual-deep-link": { ko: "끝나면 매뉴얼로 돌아가기", en: "Back to the manual when done" },
  "continue-work": { ko: "이전 표면으로 돌아가기", en: "Back to the previous surface" },
};

export type ReturnContextLang = "ko" | "en";

/** 배너 한 줄 + 복귀 행동 라벨. 도착 표면은 이 문형만으로 배너를 조립한다. */
export function describeReturnContext(
  context: ReturnContext,
  lang: ReturnContextLang,
): { readonly title: string; readonly returnLabel: string } {
  const banner = INTENT_BANNER[context.intent][lang];
  const stage = context.stageId ? RETURN_CONTEXT_STAGE_LABEL[context.stageId][lang] : null;
  const title = stage
    ? lang === "ko"
      ? `${banner} · ${stage} 단계`
      : `${banner} · ${stage} stage`
    : banner;
  return { title, returnLabel: INTENT_RETURN_LABEL[context.intent][lang] };
}

const RETURN_TO_MAX_LENGTH = 512;
const CONTEXT_ID = /^[A-Za-z0-9][A-Za-z0-9_.~-]{0,127}$/u;
const RETURN_CONTEXT_BASE = "https://return-context.invalid";

/**
 * 복귀 대상 검증. 내부 절대 경로만 통과시키고 정규형(`pathname + search`)으로 돌려준다.
 * campus-return·마켓 복귀 검증과 같은 보수적 규칙(외부 출처·해시·백슬래시 거부)을 쓴다.
 */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > RETURN_TO_MAX_LENGTH) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(trimmed, RETURN_CONTEXT_BASE);
  } catch {
    return null;
  }
  if (url.origin !== RETURN_CONTEXT_BASE || url.hash) return null;
  // 중첩 복귀(돌아간 표면에서 다시 이 맥락으로 복귀)는 루프가 되므로 거부한다.
  if (url.searchParams.has("returnTo")) return null;
  return `${url.pathname}${url.search}`;
}

function optionalId(params: URLSearchParams, key: "projectId" | "episodeId"): string | null | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  return CONTEXT_ID.test(trimmed) ? trimmed : null;
}

/**
 * 명시 계약 파라미터(`returnTo`·`intent` 필수)를 읽는다.
 * 레거시 표면별 파라미터(예: 마켓 `marketReturn`)는 각 도메인의 어댑터가 이 형태로
 * 변환한다(에디터 측 `resolveStudioReturnContext` 참조).
 */
export function parseReturnContext(search: URLSearchParams | string): ReturnContext | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const returnTo = sanitizeReturnTo(params.get("returnTo"));
  if (!returnTo) return null;

  const intentRaw = params.get("intent")?.trim() ?? "";
  if (!(RETURN_CONTEXT_INTENTS as readonly string[]).includes(intentRaw)) return null;
  const intent = intentRaw as ReturnContextIntent;

  const stageRaw = params.get("stageId")?.trim();
  let stageId: ReturnContextStageId | undefined;
  if (stageRaw) {
    if (!(RETURN_CONTEXT_STAGE_IDS as readonly string[]).includes(stageRaw)) return null;
    stageId = stageRaw as ReturnContextStageId;
  }

  const projectId = optionalId(params, "projectId");
  if (projectId === null) return null;
  const episodeId = optionalId(params, "episodeId");
  if (episodeId === null) return null;

  return {
    returnTo,
    intent,
    ...(stageId ? { stageId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(episodeId ? { episodeId } : {}),
  };
}

/**
 * 떠나는 표면이 도착 href에 계약 파라미터를 실는 단일 경로.
 * baseHref가 내부 경로가 아니거나 context.returnTo가 검증에 실패하면 baseHref를
 * 그대로 돌려준다(맥락 없이 가는 기존 동선을 깨지 않는다).
 */
export function buildReturnContextHref(baseHref: string, context: ReturnContext): string {
  const returnTo = sanitizeReturnTo(context.returnTo);
  if (!returnTo) return baseHref;
  let url: URL;
  try {
    url = new URL(baseHref, RETURN_CONTEXT_BASE);
  } catch {
    return baseHref;
  }
  if (url.origin !== RETURN_CONTEXT_BASE || url.hash) return baseHref;
  url.searchParams.set("returnTo", returnTo);
  url.searchParams.set("intent", context.intent);
  if (context.stageId) url.searchParams.set("stageId", context.stageId);
  if (context.projectId) url.searchParams.set("projectId", context.projectId);
  if (context.episodeId) url.searchParams.set("episodeId", context.episodeId);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}`;
}
