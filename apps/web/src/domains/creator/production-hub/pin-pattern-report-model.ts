/**
 * 검수 핀 패턴 리포트 — 순수 모델 (REPORT R-2).
 *
 * 같은 지적(예: 손 방향, 말풍선 꼬리 방향)이 회차마다 반복되는데 팀은 매번 새로
 * 지적한다. 이 모델은 "해결된" 핀을 유형별로 집계해 반복 지적 TOP을 만들고,
 * 반복이 확인된 패턴을 QC 체크리스트 항목·팀 플레이북 규칙 카드로 승격할 수
 * 있는 재료(구조적 타이핑)를 제공한다. 핀을 '소통'에서 '팀 지식'으로 바꾸는 층.
 *
 * 분류는 기존 메타(긴급 접두사·해결 상태)를 재사용하고, 본문의 수동 해시태그
 * (#말풍선 등)가 있으면 그 태그를 키워드 추정보다 우선한다. 새 상태를 만들지
 * 않으므로 저장 계약은 없고, 승격 결과의 영속 저장은 호스트(QC extras 주입·
 * 플레이북 저장소)의 몫이다.
 */

import type { StudioCommentsDocument } from "../studio-comments";
import {
  MANUSCRIPT_PIN_URGENT_PREFIX,
  resolvePinStatusFromThread,
  stripManuscriptPinUrgentPrefix,
  type ManuscriptPinFeedbackPin,
  type ManuscriptPinStatus,
} from "./manuscript-pin-feedback-model";
import type { BilingualLabel } from "./production-labels";

/* ------------------------------------------------------------------ */
/* 유형 분류                                                           */
/* ------------------------------------------------------------------ */

export type PinPatternCategoryId =
  | "anatomy"
  | "balloon"
  | "dialogue"
  | "color"
  | "background"
  | "expression"
  | "composition"
  | "continuity"
  | "sfx"
  | "other";

export interface PinPatternCategory {
  readonly id: PinPatternCategoryId;
  readonly label: BilingualLabel;
  /** 본문 키워드 추정용. 서로 다른 키워드가 많이 겹칠수록 그 유형으로 본다. */
  readonly keywords: readonly string[];
  /** 수동 태그 별칭. 본문에 `#별칭` 해시태그가 있으면 키워드 추정보다 우선한다. */
  readonly tagAliases: readonly string[];
}

/** 배열 순서가 동점일 때의 우선순위다 (구체적인 유형을 앞에 둔다). */
export const PIN_PATTERN_CATEGORIES: readonly PinPatternCategory[] = [
  {
    id: "anatomy",
    label: { ko: "해부학·손·포즈", en: "Anatomy, hands & poses" },
    keywords: ["손가락", "손목", "손 방향", "손", "팔꿈치", "팔", "다리", "발목", "관절", "해부학", "인체", "비율", "포즈", "어깨"],
    tagAliases: ["해부학", "손", "포즈", "인체"],
  },
  {
    id: "balloon",
    label: { ko: "말풍선", en: "Speech balloons" },
    keywords: ["말풍선", "풍선 꼬리", "꼬리 방향", "꼬리", "말꼬리"],
    tagAliases: ["말풍선", "풍선"],
  },
  {
    id: "dialogue",
    label: { ko: "대사·식자", en: "Dialogue & lettering" },
    keywords: ["대사", "오타", "맞춤법", "띄어쓰기", "식자", "글자", "폰트", "텍스트"],
    tagAliases: ["대사", "식자", "오타"],
  },
  {
    id: "color",
    label: { ko: "채색·명암", en: "Color & shading" },
    keywords: ["채색", "색감", "명암", "그림자", "하이라이트", "그라데이션", "채도"],
    tagAliases: ["채색", "색감", "명암"],
  },
  {
    id: "background",
    label: { ko: "배경·원근", en: "Backgrounds & perspective" },
    keywords: ["배경", "원근", "투시", "소실점"],
    tagAliases: ["배경", "원근", "투시"],
  },
  {
    id: "expression",
    label: { ko: "표정·시선", en: "Expressions & gaze" },
    keywords: ["표정", "시선", "눈빛"],
    tagAliases: ["표정", "시선"],
  },
  {
    id: "composition",
    label: { ko: "구도·연출", en: "Composition & staging" },
    keywords: ["구도", "앵글", "연출", "컷 구성", "여백"],
    tagAliases: ["구도", "연출", "앵글"],
  },
  {
    id: "continuity",
    label: { ko: "설정·연속성", en: "Continuity & canon" },
    keywords: ["설정", "의상", "소품", "연속성", "일관", "헤어스타일"],
    tagAliases: ["설정", "연속성", "의상"],
  },
  {
    id: "sfx",
    label: { ko: "효과음", en: "Sound effects" },
    keywords: ["효과음", "의성어", "의태어"],
    tagAliases: ["효과음", "의성어"],
  },
  {
    id: "other",
    label: { ko: "기타", en: "Other" },
    keywords: [],
    tagAliases: [],
  },
] as const;

const CATEGORY_BY_ID: ReadonlyMap<PinPatternCategoryId, PinPatternCategory> = new Map(
  PIN_PATTERN_CATEGORIES.map((category) => [category.id, category]),
);

const CATEGORY_BY_TAG_ALIAS: ReadonlyMap<string, PinPatternCategoryId> = new Map(
  PIN_PATTERN_CATEGORIES.flatMap((category) => category.tagAliases.map((alias) => [alias, category.id] as const)),
);

export function pinPatternCategoryLabel(categoryId: PinPatternCategoryId): BilingualLabel {
  return CATEGORY_BY_ID.get(categoryId)?.label ?? { ko: "기타", en: "Other" };
}

const HASHTAG_PATTERN = /#([^\s#,]+)/gu;

/** 본문의 `#별칭` 해시태그 중 분류 별칭과 맞는 첫 태그의 유형. 없으면 null. */
export function pinPatternCategoryFromTags(body: string): PinPatternCategoryId | null {
  for (const match of body.matchAll(HASHTAG_PATTERN)) {
    const categoryId = CATEGORY_BY_TAG_ALIAS.get(match[1]);
    if (categoryId) return categoryId;
  }
  return null;
}

/**
 * 핀 본문 → 유형. 수동 해시태그가 있으면 그것을, 없으면 키워드가 가장 많이
 * 겹치는 유형을 고른다(동점이면 분류표 앞쪽). 어느 키워드도 없으면 "other".
 */
export function classifyPinPatternCategory(body: string): PinPatternCategoryId {
  const fromTag = pinPatternCategoryFromTags(body);
  if (fromTag) return fromTag;
  let best: PinPatternCategoryId = "other";
  let bestScore = 0;
  for (const category of PIN_PATTERN_CATEGORIES) {
    if (category.id === "other") continue;
    let score = 0;
    for (const keyword of category.keywords) {
      if (body.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      best = category.id;
      bestScore = score;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 집계 입력                                                           */
/* ------------------------------------------------------------------ */

/** 집계에 쓰는 핀 1건의 정규화 형태. 본문은 긴급 접두사를 벗긴 표시용 본문이다. */
export interface PinPatternSourcePin {
  readonly threadId: string;
  readonly pageId: string | null;
  readonly body: string;
  readonly status: ManuscriptPinStatus;
  /** 해결 전에 긴급으로 표시됐던 핀인지 (resolved 상태에서는 본문 접두사로만 복원된다). */
  readonly wasUrgent: boolean;
  readonly createdAt: string;
}

/** 댓글 문서 전체(모든 페이지의 point 앵커 핀)를 집계 입력으로 변환한다. */
export function pinPatternSourcesFromDocument(document: StudioCommentsDocument): PinPatternSourcePin[] {
  const sources: PinPatternSourcePin[] = [];
  for (const thread of document.threads) {
    if (thread.anchor.type !== "point") continue;
    sources.push({
      threadId: thread.id,
      pageId: thread.anchor.pageId,
      body: stripManuscriptPinUrgentPrefix(thread.body),
      status: resolvePinStatusFromThread(thread),
      wasUrgent: thread.body.startsWith(MANUSCRIPT_PIN_URGENT_PREFIX),
      createdAt: thread.createdAt,
    });
  }
  return sources;
}

/** 화면 표시용 핀 목록(페이지 단위 파생)을 집계 입력으로 변환한다. */
export function pinPatternSourcesFromFeedbackPins(
  pins: readonly ManuscriptPinFeedbackPin[],
  pageId: string | null,
): PinPatternSourcePin[] {
  return pins.map((pin) => ({
    threadId: pin.threadId ?? pin.id,
    pageId,
    body: stripManuscriptPinUrgentPrefix(pin.body),
    status: pin.status,
    wasUrgent: pin.status === "urgent" || pin.body.startsWith(MANUSCRIPT_PIN_URGENT_PREFIX),
    createdAt: pin.createdAt,
  }));
}

/* ------------------------------------------------------------------ */
/* 패턴 리포트                                                         */
/* ------------------------------------------------------------------ */

export interface PinPatternExample {
  readonly threadId: string;
  readonly pageId: string | null;
  /** 긴급 접두사를 벗기고 80자로 자른 예시 본문. */
  readonly body: string;
  readonly createdAt: string;
}

export interface PinPatternEntry {
  readonly categoryId: PinPatternCategoryId;
  readonly label: BilingualLabel;
  /** 해결된 핀 중 이 유형의 건수. */
  readonly count: number;
  /** 해결된 핀 전체에서 차지하는 비율 (0..1). */
  readonly share: number;
  /** 이 유형이 등장한 서로 다른 페이지 수. */
  readonly pageCount: number;
  /** 이 유형 중 긴급으로 표시됐던 건수. */
  readonly urgentCount: number;
  /** 근거 핀 스레드 ID 전체 (생성 순서). 승격 시 근거 링크로 쓴다. */
  readonly threadIds: readonly string[];
  readonly examples: readonly PinPatternExample[];
  readonly firstAt: string;
  readonly lastAt: string;
  /** 반복 패턴으로 확인돼 승격 후보인지 (count >= minOccurrences). */
  readonly promotable: boolean;
}

export interface PinPatternReport {
  /** 상태 무관 전체 핀 수. */
  readonly totalPinCount: number;
  /** 집계 대상인 해결된 핀 수. */
  readonly resolvedPinCount: number;
  /** 아직 열려 있는(미해결·긴급) 핀 수. */
  readonly openPinCount: number;
  /** 유형별 집계 전체. count 내림차순 → urgentCount → 최근 순 → 분류표 순서. */
  readonly patterns: readonly PinPatternEntry[];
  /** 표시용 상위 패턴 (patterns의 앞부분). */
  readonly topPatterns: readonly PinPatternEntry[];
}

export interface PinPatternReportOptions {
  /** 승격 후보로 인정하는 최소 반복 횟수. 기본 3. */
  readonly minOccurrences?: number;
  /** topPatterns에 담을 최대 개수. 기본 5. */
  readonly topLimit?: number;
  /** 유형별 예시 본문 최대 개수. 기본 3. */
  readonly exampleLimit?: number;
}

export const PIN_PATTERN_DEFAULT_MIN_OCCURRENCES = 3;
export const PIN_PATTERN_DEFAULT_TOP_LIMIT = 5;
export const PIN_PATTERN_DEFAULT_EXAMPLE_LIMIT = 3;

const EXAMPLE_BODY_LIMIT = 80;

function truncateExampleBody(body: string): string {
  const singleLine = body.replace(/\s+/gu, " ").trim();
  return singleLine.length > EXAMPLE_BODY_LIMIT ? `${singleLine.slice(0, EXAMPLE_BODY_LIMIT - 1)}…` : singleLine;
}

/**
 * 해결된 핀을 유형별로 집계한다. 미해결 핀은 패턴으로 세지 않는다 —
 * '반복되는 지적'은 이미 한 번 반영·해결된 지적이 다시 쌓인 기록이어야 하고,
 * 열린 핀은 QC 승격 항목의 openCount 판정에만 쓴다.
 */
export function buildPinPatternReport(
  sources: readonly PinPatternSourcePin[],
  options?: PinPatternReportOptions,
): PinPatternReport {
  const minOccurrences = Math.max(1, options?.minOccurrences ?? PIN_PATTERN_DEFAULT_MIN_OCCURRENCES);
  const topLimit = Math.max(1, options?.topLimit ?? PIN_PATTERN_DEFAULT_TOP_LIMIT);
  const exampleLimit = Math.max(0, options?.exampleLimit ?? PIN_PATTERN_DEFAULT_EXAMPLE_LIMIT);

  const resolved = sources.filter((source) => source.status === "resolved");
  const byCategory = new Map<PinPatternCategoryId, PinPatternSourcePin[]>();
  for (const source of resolved) {
    const categoryId = classifyPinPatternCategory(source.body);
    const bucket = byCategory.get(categoryId);
    if (bucket) bucket.push(source);
    else byCategory.set(categoryId, [source]);
  }

  const categoryOrder = new Map(PIN_PATTERN_CATEGORIES.map((category, index) => [category.id, index]));
  const patterns: PinPatternEntry[] = [...byCategory.entries()].map(([categoryId, bucket]) => {
    const chronological = [...bucket].sort((a, b) => {
      const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (byTime !== 0) return byTime;
      return a.threadId.localeCompare(b.threadId);
    });
    return {
      categoryId,
      label: pinPatternCategoryLabel(categoryId),
      count: bucket.length,
      share: resolved.length === 0 ? 0 : bucket.length / resolved.length,
      pageCount: new Set(bucket.map((source) => source.pageId).filter((pageId) => pageId !== null)).size,
      urgentCount: bucket.filter((source) => source.wasUrgent).length,
      threadIds: chronological.map((source) => source.threadId),
      examples: chronological.slice(0, exampleLimit).map((source) => ({
        threadId: source.threadId,
        pageId: source.pageId,
        body: truncateExampleBody(source.body),
        createdAt: source.createdAt,
      })),
      firstAt: chronological[0]?.createdAt ?? "",
      lastAt: chronological[chronological.length - 1]?.createdAt ?? "",
      promotable: bucket.length >= minOccurrences,
    };
  });

  patterns.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.urgentCount !== a.urgentCount) return b.urgentCount - a.urgentCount;
    const byLast = Date.parse(b.lastAt) - Date.parse(a.lastAt);
    if (byLast !== 0) return byLast;
    return (categoryOrder.get(a.categoryId) ?? 0) - (categoryOrder.get(b.categoryId) ?? 0);
  });

  return {
    totalPinCount: sources.length,
    resolvedPinCount: resolved.length,
    openPinCount: sources.length - resolved.length,
    patterns,
    topPatterns: patterns.slice(0, topLimit),
  };
}

/* ------------------------------------------------------------------ */
/* 승격: QC 체크 항목 · 플레이북 규칙 카드                              */
/* ------------------------------------------------------------------ */

/** QC 항목 ID. production-episode-qc의 EpisodeQcItemId 템플릿과 같은 모양이다. */
export function pinPatternQcItemId(categoryId: PinPatternCategoryId): `pin-pattern:${string}` {
  return `pin-pattern:${categoryId}`;
}

/**
 * QC extras(pinPatternChecks)에 그대로 넣을 수 있는 구조적 항목.
 * production-episode-qc는 이 모듈을 import하지 않으므로 모양만 맞으면 된다.
 */
export interface PinPatternQcCheck {
  readonly id: `pin-pattern:${string}`;
  readonly label: BilingualLabel;
  /** 이번 회차에서 이 유형으로 열려 있는 핀 수. 0보다 크면 QC가 게시를 막는다. */
  readonly openCount: number;
}

/** 승격 대상 패턴 + 이번 회차의 열린 핀들로 QC 주입 항목을 만든다. */
export function buildPinPatternQcChecks(
  promoted: readonly PinPatternEntry[],
  episodeSources: readonly PinPatternSourcePin[],
): PinPatternQcCheck[] {
  const openByCategory = new Map<PinPatternCategoryId, number>();
  for (const source of episodeSources) {
    if (source.status === "resolved") continue;
    const categoryId = classifyPinPatternCategory(source.body);
    openByCategory.set(categoryId, (openByCategory.get(categoryId) ?? 0) + 1);
  }
  return promoted.map((entry) => ({
    id: pinPatternQcItemId(entry.categoryId),
    label: {
      ko: `반복 지적 점검: ${entry.label.ko}`,
      en: `Recurring note check: ${entry.label.en}`,
    },
    openCount: openByCategory.get(entry.categoryId) ?? 0,
  }));
}

/** 팀 플레이북(T-2) 규칙 카드로 승격할 때의 초안. 저장은 플레이북 저장소의 몫이다. */
export interface PinPatternPlaybookCard {
  readonly categoryId: PinPatternCategoryId;
  readonly title: BilingualLabel;
  readonly body: BilingualLabel;
  /** 근거 핀 스레드 링크 재료. */
  readonly evidenceThreadIds: readonly string[];
  readonly occurrences: number;
}

export function buildPinPatternPlaybookCard(entry: PinPatternEntry): PinPatternPlaybookCard {
  const exampleBodies = entry.examples.map((example) => example.body);
  return {
    categoryId: entry.categoryId,
    title: {
      ko: `반복 지적 규칙 — ${entry.label.ko}`,
      en: `Recurring note rule — ${entry.label.en}`,
    },
    body: {
      ko: [
        `해결된 검수 핀에서 '${entry.label.ko}' 지적이 ${entry.count}번 반복됐어요.`,
        "게시 전에 같은 패턴이 남아 있지 않은지 먼저 확인해 주세요.",
        ...(exampleBodies.length > 0 ? [`자주 나온 지적 예시: ${exampleBodies.join(" / ")}`] : []),
      ].join(" "),
      en: [
        `Resolved review pins repeated the '${entry.label.en}' note ${entry.count} time(s).`,
        "Check for the same pattern before publishing.",
        ...(exampleBodies.length > 0 ? [`Frequent examples: ${exampleBodies.join(" / ")}`] : []),
      ].join(" "),
    },
    evidenceThreadIds: entry.threadIds,
    occurrences: entry.count,
  };
}
