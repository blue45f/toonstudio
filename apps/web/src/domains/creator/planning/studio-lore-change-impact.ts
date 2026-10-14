import type { StudioStoryBeat } from "../studio-storyboard-planner";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import {
  STUDIO_LORE_KIND_LABELS,
  type StudioLoreEntry,
  type StudioLoreEntryKind,
  type StudioWorldLore,
} from "./studio-world-lore";

/**
 * 설정 변경 영향 알림 확장 — 바이블 전파(P-4, studio-setting-change-impact)를
 * 세계관 설정(로어)까지 넓힌 층.
 *
 * 바이블 P-4는 사실·의상·외형 변경이 회차 장면·에셋·복선에 미치는 영향을
 * 봤다. 로어 항목은 참조 방식이 다르다: 줄거리와 대사는 항목 id가 아니라
 * 이름·별칭을 본문에 그대로 적어 참조하고, 다른 설정은 relatedEntryIds
 * 명시 연결과 본문 언급으로 참조한다. 그래서 이 층은 두 가지를 함께 만든다.
 *
 * 1. 참조 색인(buildStudioLoreReferenceIndex): 설정 항목별로 "어디서
 *    참조되는가"를 미리 색인한다. 표기 매칭은 이름·별칭이 본문에 그대로
 *    등장하는 경우만 인정한다(장면 설정 참조 패널과 같은 규칙 — 2자 미만
 *    표기는 오탐이 많아 제외). 추측 연결은 만들지 않는다.
 * 2. 변경 영향 분석(diffStudioWorldLore + analyzeStudioLoreChangeImpacts):
 *    이름·별칭·내용(요약·상세 = 규칙) 변경과 삭제를 도출하고, 색인과
 *    대조해 영향 목록을 만든다. 핵심은 이름 변경이다 — 이미 쓰인 줄거리·
 *    대사는 옛 이름으로 남아 있으므로, 색인은 "변경 전 로어"의 표기를
 *    기준으로 짓는다. 변경 자체는 막지 않고, 확인(acknowledge) 전까지
 *    허브 배지가 남는다.
 *
 * 모든 함수는 순수 함수이며 입력 순서를 보존해 결정적이다. 변경 id는
 * 변경 서명에서 도출하므로 같은 변경을 다시 계산해도 동일하다(중복 방지).
 */

export type StudioLoreChangeKind =
  | "entry-renamed"
  | "entry-aliases-changed"
  | "entry-content-changed"
  | "entry-removed";

export type StudioLoreImpactKind = "episode-synopsis" | "dialogue" | "lore-entry";

export type StudioLoreChangeSeverity = "warning" | "error";

export interface StudioLoreChange {
  /** 변경 서명에서 도출한 결정적 id. 같은 변경을 다시 계산해도 동일하다. */
  readonly id: string;
  readonly kind: StudioLoreChangeKind;
  readonly entryId: string;
  readonly entryKind: StudioLoreEntryKind;
  /** 변경 시점의 표시 이름 (삭제된 항목은 변경 전 이름). */
  readonly entryLabel: string;
  /** 변경 전 정본 이름 — 옛 표기로 남은 참조를 찾는 기준. */
  readonly beforeName: string;
  /** 변경 후 이름. 삭제면 null. */
  readonly afterName: string | null;
  /** 변경 전 별칭 목록. */
  readonly beforeAliases: readonly string[];
  /** 변경으로 사라진 별칭 (이름 변경·별칭 변경에서 옛 표기 판정에 쓴다). */
  readonly removedAliases: readonly string[];
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly severity: StudioLoreChangeSeverity;
}

/** 회차 줄거리 참조 소스 — 줄거리 표면의 칸별 텍스트를 그대로 들고 있다. */
export interface StudioLoreSynopsisFieldText {
  /** 칸 이름 (제목·한 줄 소개·목표·줄거리·여는 훅·핵심 갈등·핵심 사건·마무리 훅). */
  readonly fieldLabel: string;
  readonly text: string;
}

export interface StudioLoreImpactSynopsisRef {
  readonly episodeId: string;
  readonly episodeNumber: number | null;
  /** "12화" 같은 회차 표시. */
  readonly episodeLabel: string;
  readonly title: string;
  readonly fields: readonly StudioLoreSynopsisFieldText[];
}

/** 대사 참조 소스 — 콘티 비트의 대사 한 줄. */
export interface StudioLoreImpactDialogueRef {
  readonly beatId: string;
  readonly sceneId: string;
  readonly episodeId: string;
  readonly episodeLabel: string;
  readonly dialogue: string;
}

export interface StudioLoreChangeReferenceSources {
  readonly synopses: readonly StudioLoreImpactSynopsisRef[];
  readonly dialogues: readonly StudioLoreImpactDialogueRef[];
}

export const EMPTY_STUDIO_LORE_CHANGE_SOURCES: StudioLoreChangeReferenceSources =
  Object.freeze({
    synopses: Object.freeze([]),
    dialogues: Object.freeze([]),
  });

/** 색인의 참조 한 건 — 어떤 설정이 어디서, 어떤 표기로 참조되는가. */
export interface StudioLoreReference {
  readonly kind: StudioLoreImpactKind;
  /** 참조 대상의 안정 id (회차 id·비트 id·설정 항목 id). */
  readonly refId: string;
  /** 표시 이름. */
  readonly label: string;
  /** 부가 위치 정보 (예: "12화 · 줄거리", "장면 scene-3"). */
  readonly detail: string;
  /** 실제로 본문에 등장한 표기 (이름 또는 별칭). */
  readonly matchedSurface: string;
  /** 매칭 지점 주변 발췌 — 목록에서 눈으로 확인할 수 있게. */
  readonly excerpt: string;
  /** 명시 연결(relatedEntryIds)인가, 본문 언급인가. */
  readonly via: "explicit-link" | "text-mention";
}

/** 참조 색인 — 설정 항목 id → 그 항목을 참조하는 곳 전체. */
export interface StudioLoreReferenceIndex {
  readonly byEntryId: Readonly<Record<string, readonly StudioLoreReference[]>>;
  readonly totalReferenceCount: number;
}

export interface StudioLoreChangeImpact extends StudioLoreReference {
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface StudioLoreChangeNotice {
  readonly change: StudioLoreChange;
  readonly impacts: readonly StudioLoreChangeImpact[];
  readonly impactCount: number;
}

export interface StudioLoreChangeImpactSummary {
  /** 영향이 1건 이상인 변경 알림 수. */
  readonly noticeCount: number;
  /** 아직 확인하지 않은 알림 수. 허브 배지는 이 값이 0이 될 때까지 남는다. */
  readonly unacknowledgedCount: number;
  readonly impactedSynopsisCount: number;
  readonly impactedDialogueCount: number;
  readonly impactedLoreEntryCount: number;
  readonly totalImpactCount: number;
}

/** 표기 매칭 하한 — 1자 표기는 우연한 일치가 너무 많아 참조로 세지 않는다. */
export const STUDIO_LORE_REFERENCE_MIN_SURFACE_LENGTH = 2;
/** 발췌 반경 — 매칭 표기 앞뒤로 이만큼의 문맥을 함께 보여준다. */
export const STUDIO_LORE_REFERENCE_EXCERPT_RADIUS = 20;

/**
 * 회차 기획(EpisodePlan + 시놉시스 확장)을 줄거리 참조 소스로 변환한다.
 * 정본 칸(logline·openingHook·coreConflict·turningPoints·cliffhanger)과
 * 확장 칸(goal·synopsis)을 모두 색인 대상으로 삼는다.
 */
export function adaptEpisodePlanToLoreSynopsisRef(
  plan: EpisodePlanWithSynopsis,
): StudioLoreImpactSynopsisRef {
  const fields: StudioLoreSynopsisFieldText[] = [
    { fieldLabel: "제목", text: plan.title },
    { fieldLabel: "한 줄 소개", text: plan.logline },
    { fieldLabel: "목표", text: plan.goal ?? "" },
    { fieldLabel: "줄거리", text: plan.synopsis ?? "" },
    { fieldLabel: "여는 훅", text: plan.openingHook },
    { fieldLabel: "핵심 갈등", text: plan.coreConflict },
    { fieldLabel: "핵심 사건", text: plan.turningPoints.join(" ") },
    { fieldLabel: "마무리 훅", text: plan.cliffhanger },
  ];
  return Object.freeze({
    episodeId: plan.episodeId,
    episodeNumber: plan.episodeNumber,
    episodeLabel: `${plan.episodeNumber}화`,
    title: plan.title,
    fields: Object.freeze(fields),
  });
}

/** 콘티 비트를 대사 참조 소스로 변환한다. 대사가 비어 있으면 null. */
export function adaptStudioStoryBeatToLoreDialogueRef(
  beat: StudioStoryBeat,
  episode: { readonly episodeId: string; readonly episodeLabel: string },
): StudioLoreImpactDialogueRef | null {
  if (!beat.dialogue.trim()) return null;
  return Object.freeze({
    beatId: beat.id,
    sceneId: beat.sceneId,
    episodeId: episode.episodeId,
    episodeLabel: episode.episodeLabel,
    dialogue: beat.dialogue,
  });
}

function normalizeSurface(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** 항목의 표기 집합 — 이름·별칭 중 매칭 가능한 것, 긴 표기부터(긴 매칭 우선). */
function entrySurfaces(entry: StudioLoreEntry): readonly string[] {
  const seen = new Set<string>();
  const surfaces: string[] = [];
  for (const raw of [entry.name, ...entry.aliases]) {
    const surface = raw.trim();
    if (surface.length < STUDIO_LORE_REFERENCE_MIN_SURFACE_LENGTH) continue;
    const key = normalizeSurface(surface);
    if (seen.has(key)) continue;
    seen.add(key);
    surfaces.push(surface);
  }
  return Object.freeze(surfaces.sort((a, b) => b.length - a.length));
}

interface Mention {
  readonly surface: string;
  readonly index: number;
}

function findMention(text: string, surfaces: readonly string[]): Mention | null {
  if (!text.trim()) return null;
  const lowered = text.toLocaleLowerCase();
  for (const surface of surfaces) {
    const index = lowered.indexOf(normalizeSurface(surface));
    if (index >= 0) return { surface, index };
  }
  return null;
}

function makeExcerpt(text: string, mention: Mention): string {
  const start = Math.max(0, mention.index - STUDIO_LORE_REFERENCE_EXCERPT_RADIUS);
  const end = Math.min(
    text.length,
    mention.index + mention.surface.length + STUDIO_LORE_REFERENCE_EXCERPT_RADIUS,
  );
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * 참조 색인을 짓는다. 기준 로어는 "참조가 쓰인 시점의 로어"다 — 변경
 * 영향 분석에서는 변경 전 로어를 넣어 옛 표기 참조까지 잡는다.
 * 다른 설정의 참조는 명시 연결(relatedEntryIds)이 본문 언급보다 먼저
 * 오고, 한 항목이 같은 대상을 두 번 세지 않는다.
 */
export function buildStudioLoreReferenceIndex(
  lore: StudioWorldLore,
  sources: StudioLoreChangeReferenceSources,
): StudioLoreReferenceIndex {
  const byEntryId: Record<string, readonly StudioLoreReference[]> = {};
  let totalReferenceCount = 0;

  for (const target of lore.entries) {
    const surfaces = entrySurfaces(target);
    if (surfaces.length === 0) continue;
    const refs: StudioLoreReference[] = [];

    for (const synopsis of sources.synopses) {
      for (const field of synopsis.fields) {
        const mention = findMention(field.text, surfaces);
        if (!mention) continue;
        refs.push(Object.freeze({
          kind: "episode-synopsis",
          refId: synopsis.episodeId,
          label: synopsis.title || synopsis.episodeLabel,
          detail: `${synopsis.episodeLabel} · ${field.fieldLabel}`,
          matchedSurface: mention.surface,
          excerpt: makeExcerpt(field.text, mention),
          via: "text-mention",
        }));
      }
    }

    for (const dialogue of sources.dialogues) {
      const mention = findMention(dialogue.dialogue, surfaces);
      if (!mention) continue;
      refs.push(Object.freeze({
        kind: "dialogue",
        refId: dialogue.beatId,
        label: dialogue.episodeLabel || dialogue.beatId,
        detail: `장면 ${dialogue.sceneId}`,
        matchedSurface: mention.surface,
        excerpt: makeExcerpt(dialogue.dialogue, mention),
        via: "text-mention",
      }));
    }

    for (const other of lore.entries) {
      if (other.id === target.id) continue;
      const kindLabel = STUDIO_LORE_KIND_LABELS[other.kind].ko;
      if (other.relatedEntryIds.includes(target.id)) {
        refs.push(Object.freeze({
          kind: "lore-entry",
          refId: other.id,
          label: other.name || other.id,
          detail: `${kindLabel} · 연결됨`,
          matchedSurface: target.name,
          excerpt: other.summary.trim(),
          via: "explicit-link",
        }));
        continue;
      }
      const summaryMention = findMention(other.summary, surfaces);
      const mention = summaryMention ?? findMention(other.details, surfaces);
      if (!mention) continue;
      refs.push(Object.freeze({
        kind: "lore-entry",
        refId: other.id,
        label: other.name || other.id,
        detail: `${kindLabel} · 본문 언급`,
        matchedSurface: mention.surface,
        excerpt: makeExcerpt(summaryMention ? other.summary : other.details, mention),
        via: "text-mention",
      }));
    }

    if (refs.length > 0) {
      byEntryId[target.id] = Object.freeze(refs);
      totalReferenceCount += refs.length;
    }
  }

  return Object.freeze({
    byEntryId: Object.freeze(byEntryId),
    totalReferenceCount,
  });
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right.map(normalizeSurface));
  return left.every((value) => rightSet.has(normalizeSurface(value)));
}

function changeId(kind: StudioLoreChangeKind, entryId: string, detail: string): string {
  return `lore-change:${kind}:${entryId}:${detail}`;
}

function makeChange(
  partial: Omit<StudioLoreChange, "id"> & { readonly detail: string },
): StudioLoreChange {
  const { detail, ...rest } = partial;
  return Object.freeze({ ...rest, id: changeId(partial.kind, partial.entryId, detail) });
}

/**
 * 이전/다음 로어를 비교해 설정 변경 목록을 도출한다.
 * 이름·별칭·내용(요약·상세) 변경과 삭제만 본다 — 추가는 기존 참조를
 * 만들지 않고, 상태·버전·범위 변경은 P-4가 아니라 일관성 게이트의 몫이다.
 */
export function diffStudioWorldLore(
  previous: StudioWorldLore,
  next: StudioWorldLore,
): readonly StudioLoreChange[] {
  const changes: StudioLoreChange[] = [];
  const nextById = new Map(next.entries.map((entry) => [entry.id, entry]));

  for (const before of previous.entries) {
    const after = nextById.get(before.id);
    const label = before.name || before.id;
    if (!after) {
      changes.push(makeChange({
        kind: "entry-removed",
        entryId: before.id,
        entryKind: before.kind,
        entryLabel: label,
        beforeName: before.name,
        afterName: null,
        beforeAliases: Object.freeze([...before.aliases]),
        removedAliases: Object.freeze([...before.aliases]),
        summaryKo: `설정 '${label}'이(가) 삭제됐어요`,
        summaryEn: `Lore entry '${label}' was removed`,
        severity: "error",
        detail: "removed",
      }));
      continue;
    }

    const afterAliases = new Set(after.aliases.map(normalizeSurface));
    const removedAliases = Object.freeze(
      before.aliases.filter((alias) => !afterAliases.has(normalizeSurface(alias))),
    );
    const renamed = before.name !== after.name;

    if (renamed) {
      changes.push(makeChange({
        kind: "entry-renamed",
        entryId: before.id,
        entryKind: after.kind,
        entryLabel: after.name || before.id,
        beforeName: before.name,
        afterName: after.name,
        beforeAliases: Object.freeze([...before.aliases]),
        removedAliases,
        summaryKo: `설정 이름이 '${label}'에서 '${after.name}'(으)로 바뀌었어요`,
        summaryEn: `Lore entry '${label}' was renamed to '${after.name}'`,
        severity: "warning",
        detail: `name:${before.name}->${after.name}`,
      }));
    } else if (!sameStringSet(before.aliases, after.aliases)) {
      changes.push(makeChange({
        kind: "entry-aliases-changed",
        entryId: before.id,
        entryKind: after.kind,
        entryLabel: after.name || before.id,
        beforeName: before.name,
        afterName: after.name,
        beforeAliases: Object.freeze([...before.aliases]),
        removedAliases,
        summaryKo: `설정 '${after.name || before.id}'의 별칭이 바뀌었어요`,
        summaryEn: `Aliases of lore entry '${after.name || before.id}' changed`,
        severity: "warning",
        detail: `aliases:${[...before.aliases].sort().join(",")}->${[...after.aliases].sort().join(",")}`,
      }));
    }

    const contentFields: string[] = [];
    if (before.summary !== after.summary) contentFields.push("summary");
    if (before.details !== after.details) contentFields.push("details");
    if (contentFields.length > 0) {
      const isRule = after.kind === "rule";
      changes.push(makeChange({
        kind: "entry-content-changed",
        entryId: before.id,
        entryKind: after.kind,
        entryLabel: after.name || before.id,
        beforeName: before.name,
        afterName: after.name,
        beforeAliases: Object.freeze([...before.aliases]),
        removedAliases: Object.freeze([]),
        summaryKo: isRule
          ? `규칙 '${after.name || before.id}'의 내용이 바뀌었어요`
          : `설정 '${after.name || before.id}'의 내용이 바뀌었어요`,
        summaryEn: isRule
          ? `Rule '${after.name || before.id}' was updated`
          : `Lore entry '${after.name || before.id}' was updated`,
        severity: "warning",
        detail: contentFields.join("+"),
      }));
    }
  }

  return Object.freeze(changes);
}

function impactReason(
  change: StudioLoreChange,
  reference: StudioLoreReference,
): { reasonKo: string; reasonEn: string } | null {
  switch (change.kind) {
    case "entry-renamed":
      return {
        reasonKo: `아직 옛 표기 '${reference.matchedSurface}'(으)로 적혀 있어요`,
        reasonEn: `Still written with the previous wording '${reference.matchedSurface}'`,
      };
    case "entry-aliases-changed": {
      // 이름 언급은 영향이 없다 — 사라진 별칭으로 적힌 참조만 센다.
      const removed = new Set(change.removedAliases.map(normalizeSurface));
      if (reference.via !== "text-mention" || !removed.has(normalizeSurface(reference.matchedSurface))) {
        return null;
      }
      return {
        reasonKo: `사라진 별칭 '${reference.matchedSurface}'(으)로 적혀 있어요`,
        reasonEn: `Written with the removed alias '${reference.matchedSurface}'`,
      };
    }
    case "entry-content-changed":
      return reference.via === "explicit-link"
        ? {
            reasonKo: "이 설정과 연결돼 있어요 — 바뀐 내용과 어긋나지 않는지 확인하세요",
            reasonEn: "Linked to this entry — check it against the updated content",
          }
        : {
            reasonKo: `설정 '${reference.matchedSurface}'을(를) 언급해요 — 바뀐 내용 기준으로 확인하세요`,
            reasonEn: `Mentions '${reference.matchedSurface}' — check it against the updated content`,
          };
    case "entry-removed":
      return reference.via === "explicit-link"
        ? {
            reasonKo: "삭제된 설정을 연결 대상으로 삼고 있어요",
            reasonEn: "Links to the removed entry",
          }
        : {
            reasonKo: `삭제된 설정 '${reference.matchedSurface}'을(를) 언급해요`,
            reasonEn: `Mentions the removed entry '${reference.matchedSurface}'`,
          };
  }
}

const IMPACT_KIND_ORDER: Readonly<Record<StudioLoreImpactKind, number>> = {
  "episode-synopsis": 0,
  dialogue: 1,
  "lore-entry": 2,
};

/**
 * 변경 목록을 변경 전 로어 기준 참조 색인과 대조해 영향 알림을 만든다.
 * 영향이 없는 변경은 알림에서 제외한다(소음 방지 — P-4와 같은 원칙).
 */
export function analyzeStudioLoreChangeImpacts(
  previous: StudioWorldLore,
  next: StudioWorldLore,
  sources: StudioLoreChangeReferenceSources,
): readonly StudioLoreChangeNotice[] {
  const changes = diffStudioWorldLore(previous, next);
  if (changes.length === 0) return Object.freeze([]);
  const index = buildStudioLoreReferenceIndex(previous, sources);

  const notices: StudioLoreChangeNotice[] = [];
  for (const change of changes) {
    const references = index.byEntryId[change.entryId] ?? [];
    const impacts: StudioLoreChangeImpact[] = [];
    const seen = new Set<string>();
    for (const reference of references) {
      const reason = impactReason(change, reference);
      if (!reason) continue;
      const key = `${reference.kind}\u0000${reference.refId}\u0000${reference.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      impacts.push(Object.freeze({ ...reference, ...reason }));
    }
    if (impacts.length === 0) continue;
    const ordered = Object.freeze(
      [...impacts].sort(
        (a, b) => IMPACT_KIND_ORDER[a.kind] - IMPACT_KIND_ORDER[b.kind],
      ),
    );
    notices.push(Object.freeze({
      change,
      impacts: ordered,
      impactCount: ordered.length,
    }));
  }
  return Object.freeze(notices);
}

/** 확인한 알림 id 목록에 하나를 더한다 (중복·미존재 id는 무시). */
export function acknowledgeStudioLoreChange(
  notices: readonly StudioLoreChangeNotice[],
  acknowledgedIds: readonly string[],
  noticeId: string,
): readonly string[] {
  if (acknowledgedIds.includes(noticeId)) return acknowledgedIds;
  if (!notices.some((notice) => notice.change.id === noticeId)) return acknowledgedIds;
  return Object.freeze([...acknowledgedIds, noticeId]);
}

/** 모든 알림을 확인 처리한다. */
export function acknowledgeAllStudioLoreChanges(
  notices: readonly StudioLoreChangeNotice[],
  acknowledgedIds: readonly string[],
): readonly string[] {
  const next = new Set(acknowledgedIds);
  for (const notice of notices) next.add(notice.change.id);
  return Object.freeze([...next]);
}

/** 허브 배지와 패널 머리글에 쓰는 집계. 배지는 unacknowledgedCount > 0 동안 남는다. */
export function summarizeStudioLoreChangeImpacts(
  notices: readonly StudioLoreChangeNotice[],
  acknowledgedIds: readonly string[],
): StudioLoreChangeImpactSummary {
  const acknowledged = new Set(acknowledgedIds);
  let unacknowledgedCount = 0;
  let impactedSynopsisCount = 0;
  let impactedDialogueCount = 0;
  let impactedLoreEntryCount = 0;
  let totalImpactCount = 0;
  for (const notice of notices) {
    if (acknowledged.has(notice.change.id)) continue;
    unacknowledgedCount += 1;
    totalImpactCount += notice.impactCount;
    for (const impact of notice.impacts) {
      if (impact.kind === "episode-synopsis") impactedSynopsisCount += 1;
      else if (impact.kind === "dialogue") impactedDialogueCount += 1;
      else impactedLoreEntryCount += 1;
    }
  }
  return Object.freeze({
    noticeCount: notices.length,
    unacknowledgedCount,
    impactedSynopsisCount,
    impactedDialogueCount,
    impactedLoreEntryCount,
    totalImpactCount,
  });
}
