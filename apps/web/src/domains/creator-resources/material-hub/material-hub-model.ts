/**
 * 문장으로 소재 찾기 허브의 순수 모델 — React 의존성이 없다.
 *
 * 계획기(@toonstudio/core/material-intent-plan)가 낸 계획에 사용자의 조정(칩 켜기·끄기·검색어 편집)을
 * 얹어 "어느 제공처에 어떤 검색어를 보낼지"를 정하고, 결과를 장면 보드·스튜디오·브리프로 넘기는 데
 * 필요한 변환을 둔다. 제공처 호출은 여기서 하지 않는다 — 호출은 사용자의 명시적 행동(제출·다시 시도·
 * 더 보기·다른 제공처 찾기)에서만 일어난다.
 */
import {
  MATERIAL_INTENT_MAX_LENGTH,
  materialLensDefinition,
  materialMarketParams,
} from "@toonstudio/core/material-intent-plan";

import { polyHavenKindOf } from "../polyhaven-resource";
import { RESOURCE_SEARCH_CONFIG } from "../resource-search-config";

import type { MaterialAsset, MaterialKind } from "../material-atlas/model";
import type {
  MaterialIntentLens,
  MaterialIntentPlan,
  MaterialLensId,
  MaterialLensProvider,
} from "@toonstudio/core/material-intent-plan";
import type { CreatorResource } from "@/shared/lib/creator-resources";

import { attributionMarkdown, RESOURCE_LABELS } from "@/shared/lib/creator-resources";

/** 제공처 한 곳에서 처음 보여 주는 카드 수와, "더 보기" 한 번에 늘리는 수. */
export const HUB_CARD_LIMIT = 4;
export const HUB_CARD_STEP = 4;

export const HUB_MARKET_PATH = "/market/browse";
export const HUB_LIBRARY_PATH = "/studio/assets?view=library";

/** 사용자가 "이렇게 이해했어요" 칩에서 고친 것. 네트워크를 부르지 않는 순수 상태다. */
export interface HubOverrides {
  /** 끈 단서 id(`MaterialIntentCue.id`) 또는 끈 미지원 낱말(`free:낱말`) */
  readonly excluded: readonly string[];
  /** 렌즈를 사용자가 직접 켜거나 끈 상태. 없으면 계획의 기본값(고른 렌즈는 켬, 대안은 끔)을 따른다. */
  readonly lensOn: Readonly<Partial<Record<MaterialLensId, boolean>>>;
  /** 렌즈의 대표 검색어를 사용자가 고친 값 */
  readonly queries: Readonly<Partial<Record<MaterialLensId, string>>>;
}

export const EMPTY_HUB_OVERRIDES: HubOverrides = Object.freeze({ excluded: [], lensOn: {}, queries: {} });

export interface HubLensView {
  readonly lens: MaterialIntentLens;
  readonly on: boolean;
  /** 계획이 고르지 않았지만 근거가 있어 켜 볼 수 있게 제안한 렌즈 */
  readonly suggested: boolean;
}

export function hubLensViews(plan: MaterialIntentPlan, overrides: HubOverrides): HubLensView[] {
  return [
    ...plan.lenses.map((lens) => ({ lens, on: overrides.lensOn[lens.id] ?? true, suggested: false })),
    ...plan.alternatives.map((lens) => ({ lens, on: overrides.lensOn[lens.id] ?? false, suggested: true })),
  ];
}

export function normalizeHubQuery(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, MATERIAL_INTENT_MAX_LENGTH);
}

/**
 * 제공처에 실제로 보낼 검색어. 사용자가 렌즈의 대표 검색어를 고쳤다면, 대표 검색어를 함께 쓰던 제공처에만
 * 적용한다(한글 문서 제목을 받는 wikimedia 처럼 별도 검색어를 쓰는 제공처는 건드리지 않는다).
 * 보낼 검색어가 없으면 빈 문자열이다.
 */
export function hubProviderQuery(lens: MaterialIntentLens, provider: MaterialLensProvider, overrides: HubOverrides): string {
  const own = lens.providerQueries[provider] ?? "";
  const edited = normalizeHubQuery(overrides.queries[lens.id] ?? "");
  if (!edited) return own;
  const sharesPrimary = own === "" ? lens.providerQuery === "" : own === lens.providerQuery;
  return sharesPrimary ? edited : own;
}

/** 검색 결과 캐시 키. 같은 제공처·검색어는 다시 부르지 않고 이미 받은 결과를 쓴다. */
export function hubSlotKey(provider: MaterialLensProvider, query: string): string {
  return `${provider}::${query}`;
}

export interface HubSlot {
  readonly key: string;
  readonly lensId: MaterialLensId;
  readonly provider: MaterialLensProvider;
  readonly query: string;
  /** 제출 직후 먼저 부르는 제공처인지. 아니면 사용자가 "다른 제공처에서도 찾기"를 눌러야 한다. */
  readonly initial: boolean;
}

export interface HubLensSlots {
  readonly slots: readonly HubSlot[];
  /** 이번 문장으로는 보낼 검색어를 만들 수 없는 제공처 */
  readonly unavailable: readonly MaterialLensProvider[];
}

export function hubLensSlots(lens: MaterialIntentLens, overrides: HubOverrides): HubLensSlots {
  const definition = materialLensDefinition(lens.id);
  const available: HubSlot[] = [];
  const unavailable: MaterialLensProvider[] = [];
  for (const provider of definition.providers) {
    const query = hubProviderQuery(lens, provider, overrides);
    if (query.length < 2 || query.length > MATERIAL_INTENT_MAX_LENGTH) unavailable.push(provider);
    else available.push({ key: hubSlotKey(provider, query), lensId: lens.id, provider, query, initial: false });
  }
  return {
    slots: available.map((slot, index) => ({ ...slot, initial: index < definition.initialProviders })),
    unavailable,
  };
}

/** 켜 둔 렌즈 중 제출 직후 먼저 부르는 제공처들 */
export function hubInitialSlots(plan: MaterialIntentPlan, overrides: HubOverrides): HubSlot[] {
  return hubLensViews(plan, overrides)
    .filter((view) => view.on)
    .flatMap((view) => hubLensSlots(view.lens, overrides).slots.filter((slot) => slot.initial));
}

/** 렌즈가 날씨·빛처럼 도시를 더 받아야 쓸 수 있는데 아직 못 받았는지 */
export function hubNeedsCity(lens: MaterialIntentLens, overrides: HubOverrides): boolean {
  return lens.requires === "city" && normalizeHubQuery(overrides.queries[lens.id] ?? "") === "";
}

/** 지금 이해(계획 + 사용자 조정)가 마지막으로 찾은 것과 달라졌는지 비교하는 서명 */
export function hubSignature(plan: MaterialIntentPlan, overrides: HubOverrides): string {
  const views = hubLensViews(plan, overrides).filter((view) => view.on);
  return JSON.stringify({
    input: plan.input,
    lenses: views.map((view) => [view.lens.id, hubLensSlots(view.lens, overrides).slots.map((slot) => slot.key)]),
  });
}

// ── 제공처 호출 상태 ─────────────────────────────────────────────────────

export type HubSlotStatus = "loading" | "ready" | "empty" | "partial" | "not_configured" | "unavailable" | "error";
export type HubErrorCode = "rate_limited" | "http" | "format" | "timeout" | "network";

export interface HubSlotState {
  readonly key: string;
  readonly provider: MaterialLensProvider;
  readonly query: string;
  readonly status: HubSlotStatus;
  readonly items: readonly CreatorResource[];
  /** 마지막으로 받은 페이지 */
  readonly page: number;
  readonly hasMore: boolean;
  readonly total?: number;
  /** 제공처가 돌려준 안내 문구 */
  readonly message: string;
  /** 마지막 요청이 실패한 이유. 정상이면 null */
  readonly errorCode: HubErrorCode | null;
  /** 다음 페이지를 받는 중 */
  readonly loadingMore: boolean;
  /** 지금 보여 주는 카드 수(제공처당 상한 + 더 보기) */
  readonly visible: number;
}

export interface HubRunSummary {
  readonly requested: number;
  readonly loading: number;
  readonly ready: number;
  readonly empty: number;
  readonly failed: number;
  readonly items: number;
}

export function summarizeSlots(slots: readonly (HubSlotState | undefined)[]): HubRunSummary {
  let loading = 0;
  let ready = 0;
  let empty = 0;
  let failed = 0;
  let items = 0;
  for (const slot of slots) {
    if (!slot) continue;
    if (slot.status === "loading") loading += 1;
    else if (slot.status === "ready" || slot.status === "partial") ready += 1;
    else if (slot.status === "empty") empty += 1;
    else failed += 1;
    items += slot.items.length;
  }
  return { requested: slots.filter(Boolean).length, loading, ready, empty, failed, items };
}

// ── 장면 보드·스튜디오·브리프 ────────────────────────────────────────────

/** 제공처가 설명 끝의 메타 구간에 넣은 종류 라벨 → 스튜디오 전달 계약의 종류 */
const AMBIENTCG_KIND_BY_LABEL: Readonly<Record<string, MaterialKind>> = {
  "PBR 재질": "texture",
  HDRI: "hdri",
  "3D 모델": "model",
};

function materialKindOf(item: CreatorResource): MaterialKind | null {
  if (item.provider === "polyhaven") return polyHavenKindOf(item);
  if (item.provider !== "ambientcg") return null;
  const segments = item.description.split(" · ");
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const kind = AMBIENTCG_KIND_BY_LABEL[segments[index] ?? ""];
    if (kind) return kind;
  }
  return null;
}

function materialTagsOf(item: CreatorResource): string[] {
  const segment = item.description.split(" · ").find((part) => part.startsWith("태그 "));
  return segment ? segment.slice(3).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8) : [];
}

/**
 * 스튜디오로 보낼 수 있는 자료만 MATERIAL_DROP_KEY 계약의 MaterialAsset 으로 바꾼다.
 * 계약은 Poly Haven·ambientCG 의 CC0 재질·모델·HDRI 만 다룬다. 미술관·아카이브 자료(레퍼런스 전용 포함)는
 * "작품별 권리를 확인하기 전 Studio 직접 가져오기를 허용하지 않는다"는 이용조건 때문에 null 이다.
 */
export function studioDropAsset(item: CreatorResource): MaterialAsset | null {
  if (item.license !== "CC0" || (item.provider !== "polyhaven" && item.provider !== "ambientcg")) return null;
  const kind = materialKindOf(item);
  if (!kind) return null;
  return {
    id: item.id,
    provider: item.provider,
    sourceId: item.id.slice(item.provider.length + 1),
    title: item.title,
    kind,
    tags: materialTagsOf(item),
    authors: item.creator ? [item.creator] : [],
    sourceUrl: item.sourceUrl,
    thumbnailUrl: item.imageUrl ?? "",
    license: "CC0-1.0",
  };
}

/** 내 저장 보드에서 키워드와 겹치는 자료(제목·설명·저작자·크레딧). 네트워크 없이 로컬에서만 찾는다. */
export function matchSavedResources(saved: readonly CreatorResource[], keywords: readonly string[]): CreatorResource[] {
  const needles = keywords.map((keyword) => keyword.normalize("NFKC").toLowerCase().trim()).filter((keyword) => keyword.length >= 2);
  if (!needles.length) return [];
  return saved.filter((item) => {
    const haystack = [item.title, item.description, item.creator, item.credit].join(" ").normalize("NFKC").toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
}

/** 마켓 `/market/browse` 로 가는 주소. 계획의 마켓 조건을 기존 URL 필터로 그대로 옮긴다. */
export function hubMarketHref(plan: MaterialIntentPlan): string {
  const params = new URLSearchParams();
  const market = materialMarketParams(plan.market);
  if (market.q) params.set("q", market.q);
  if (market.kind) params.set("kind", market.kind);
  if (market.license) params.set("license", market.license);
  if (market.tag) params.set("tag", market.tag);
  const search = params.toString();
  return search ? `${HUB_MARKET_PATH}?${search}` : HUB_MARKET_PATH;
}

const KST_DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

export interface HubBriefInput {
  readonly plan: MaterialIntentPlan;
  readonly overrides: HubOverrides;
  /** 브리프에 넣을 자료(장면 보드에 담은 자료) */
  readonly items: readonly CreatorResource[];
  readonly now?: Date;
}

/** 장면 브리프 Markdown: 문장과 이해(렌즈·검색어·미지원 낱말·상충)를 먼저 적고, 담은 자료는 기존 출처 기록 형식을 그대로 쓴다. */
export function buildHubBrief({ plan, overrides, items, now = new Date() }: HubBriefInput): string {
  const views = hubLensViews(plan, overrides).filter((view) => view.on);
  const lensLines = views.map((view) => {
    const queries = hubLensSlots(view.lens, overrides).slots
      .map((slot) => `${slot.provider} \`${slot.query}\``)
      .join(", ");
    return `- ${view.lens.label}${queries ? `: ${queries}` : ""}`;
  });
  const cueLine = plan.cues
    .filter((cue) => !cue.neutral)
    .map((cue) => `${cue.surface}${cue.excluded ? "(제외)" : ` → ${cue.term}`}`)
    .join(" · ");
  const sources = items.length
    ? attributionMarkdown(items).replace("# 창작 자료 출처 기록", "## 담은 자료와 출처")
    : "## 담은 자료와 출처\n\n아직 담은 자료가 없습니다.";
  return [
    "# 장면 소재 브리프",
    "문장으로 소재 찾기에서 만든 작업용 기록입니다. 권리 허가서나 법률 검토를 대신하지 않습니다.",
    `- 문장: ${plan.input}\n- 생성일: ${KST_DATE.format(now)}\n- 담은 자료: ${items.length}개`,
    "## 이렇게 이해했어요",
    [
      lensLines.length ? `### 찾는 종류와 보낸 검색어\n\n${lensLines.join("\n")}` : "",
      cueLine ? `### 읽은 단서\n\n${cueLine}` : "",
      plan.unresolved.length ? `### 사전에 없는 낱말\n\n${plan.unresolved.join(" · ")} — 번역하지 않고 원문 그대로 보냈습니다.` : "",
      plan.conflicts.length ? `### 어긋나는 단서\n\n${plan.conflicts.map((conflict) => `- ${conflict.message}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n"),
    sources,
  ].filter(Boolean).join("\n\n");
}

const EXTRA_PROVIDER_SITES: Readonly<Partial<Record<MaterialLensProvider, string>>> = {
  aic: "https://www.artic.edu/collection",
  cleveland: "https://www.clevelandart.org/art/collection/search",
};

/** 제공처 공식 사이트. 결과가 비었거나 더 찾고 싶을 때 사용자가 직접 확인할 수 있게 한다. */
export function providerSiteUrl(provider: MaterialLensProvider): string {
  const extra = EXTRA_PROVIDER_SITES[provider];
  if (extra) return extra;
  return hasSearchConfig(provider) ? RESOURCE_SEARCH_CONFIG[provider].url : "";
}

function hasSearchConfig(provider: string): provider is keyof typeof RESOURCE_SEARCH_CONFIG {
  return Object.hasOwn(RESOURCE_SEARCH_CONFIG, provider);
}

/** 칩과 제목에 쓰는 짧은 제공처 이름("The Met · 공개 미술 자료" → "The Met") */
export function providerShortName(provider: MaterialLensProvider): string {
  return RESOURCE_LABELS[provider].split(" · ")[0] ?? provider;
}
