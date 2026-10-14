import type {
  StudioCharacterContinuityState,
  StudioContinuitySeverity,
  StudioStoryBible,
  StudioStoryCharacter,
  StudioStoryFact,
  StudioStoryLocation,
} from "./studio-story-bible";
import type { StudioPromisePayoffLedger } from "./studio-promise-payoff-ledger";

/**
 * 설정 변경 영향 알림 (REPORT P-4).
 *
 * 바이블의 사실·의상·외형·장소가 바뀌면 그 설정을 참조하는 회차(장면 연속성
 * 상태)·에셋(소재 사용 대장)·복선(약속·회수 원장 링크)을 목록으로 뽑는다.
 * 변경 자체는 막지 않는다 — 영향만 가시화하고, 확인(acknowledge) 전까지
 * 개요 배지가 남는다. 모든 함수는 순수 함수이며 입력 순서를 보존해 결정적이다.
 */

export type StudioSettingChangeTargetKind = "fact" | "character" | "location";

export type StudioSettingChangeKind =
  | "fact-updated"
  | "fact-removed"
  | "character-costume-changed"
  | "character-appearance-changed"
  | "character-renamed"
  | "character-removed"
  | "location-renamed"
  | "location-removed";

export type StudioSettingImpactKind = "episode" | "asset" | "foreshadow";

export interface StudioSettingChange {
  /** 변경 서명에서 도출한 결정적 id. 같은 변경을 다시 계산해도 동일하다. */
  readonly id: string;
  readonly kind: StudioSettingChangeKind;
  readonly targetKind: StudioSettingChangeTargetKind;
  readonly targetId: string;
  /** 변경 시점의 표시 이름 (삭제된 항목은 변경 전 이름). */
  readonly targetLabel: string;
  /** 사람이 읽는 변경 요약 (한국어). */
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly severity: StudioContinuitySeverity;
  /** 변경 전 기본 의상 id (character-costume-changed 전용, 그 외 null). */
  readonly beforeCostumeId: string | null;
  /** 변경 전 기본 외형 id (character-appearance-changed 전용, 그 외 null). */
  readonly beforeAppearanceId: string | null;
}

export interface StudioSettingChangeImpact {
  readonly kind: StudioSettingImpactKind;
  /** 참조 대상의 안정 id (장면 id·에셋 id·복선 항목 id). */
  readonly refId: string;
  /** 표시 이름. */
  readonly label: string;
  /** 부가 위치 정보 (예: "12화 · 장면"). */
  readonly detail: string;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface StudioSettingChangeNotice {
  readonly change: StudioSettingChange;
  readonly impacts: readonly StudioSettingChangeImpact[];
  readonly impactCount: number;
}

/**
 * 회차 장면 참조. StudioCharacterContinuityState(장면별 등장 상태)에 회차
 * 번호·표시명을 붙인 어댑터 형태다.
 */
export interface StudioSettingImpactSceneRef {
  readonly sceneId: string;
  readonly episode: number | null;
  readonly episodeLabel: string;
  readonly characterId: string;
  readonly costumeId: string | null;
  readonly appearanceId: string | null;
  readonly knownFactIds: readonly string[];
  readonly locationId: string | null;
}

/** 소재 사용 대장 한 줄: 어떤 에셋이 어떤 설정을 참조해 쓰였는가. */
export interface StudioSettingImpactAssetUse {
  readonly assetId: string;
  readonly assetLabel: string;
  readonly characterIds: readonly string[];
  readonly factIds: readonly string[];
  readonly locationIds: readonly string[];
  readonly costumeIds: readonly string[];
  readonly appearanceIds: readonly string[];
}

/** 복선 참조. 약속·회수 원장의 스토리 링크에서 도출한다. */
export interface StudioSettingImpactForeshadowRef {
  readonly entryId: string;
  readonly title: string;
  readonly episode: number | null;
  readonly sceneId: string | null;
  /** seed | foreshadow | payoff */
  readonly linkRole: string;
}

export interface StudioSettingChangeReferenceSources {
  readonly episodeScenes: readonly StudioSettingImpactSceneRef[];
  readonly assetUses: readonly StudioSettingImpactAssetUse[];
  readonly foreshadows: readonly StudioSettingImpactForeshadowRef[];
}

export const EMPTY_STUDIO_SETTING_CHANGE_SOURCES: StudioSettingChangeReferenceSources =
  Object.freeze({
    episodeScenes: Object.freeze([]),
    assetUses: Object.freeze([]),
    foreshadows: Object.freeze([]),
  });

export interface StudioSettingChangeImpactSummary {
  /** 영향이 1건 이상인 변경 알림 수. */
  readonly noticeCount: number;
  /** 아직 확인하지 않은 알림 수. 개요 배지는 이 값이 0이 될 때까지 남는다. */
  readonly unacknowledgedCount: number;
  readonly impactedEpisodeCount: number;
  readonly impactedAssetCount: number;
  readonly impactedForeshadowCount: number;
  readonly totalImpactCount: number;
}

/** 연속성 상태를 회차 장면 참조로 변환한다. */
export function adaptStudioContinuityStateToImpactSceneRef(
  state: StudioCharacterContinuityState,
  episode: { readonly episode: number | null; readonly episodeLabel: string },
): StudioSettingImpactSceneRef {
  return Object.freeze({
    sceneId: state.sceneId,
    episode: episode.episode,
    episodeLabel: episode.episodeLabel,
    characterId: state.characterId,
    costumeId: state.costumeId,
    appearanceId: state.appearanceId,
    knownFactIds: Object.freeze([...state.knownFactIds]),
    locationId: state.locationId,
  });
}

/** 약속·회수 원장의 모든 스토리 링크를 복선 참조로 펼친다. */
export function adaptStudioPromisePayoffLedgerToImpactForeshadows(
  ledger: StudioPromisePayoffLedger,
): readonly StudioSettingImpactForeshadowRef[] {
  const refs: StudioSettingImpactForeshadowRef[] = [];
  for (const entry of ledger.entries) {
    const push = (
      link: { episode: number; sceneId?: string } | null,
      linkRole: string,
    ) => {
      if (!link) return;
      refs.push(Object.freeze({
        entryId: entry.id,
        title: entry.title || entry.id,
        episode: link.episode,
        sceneId: link.sceneId ?? null,
        linkRole,
      }));
    };
    push(entry.seed, "seed");
    for (const link of entry.foreshadows) push(link, "foreshadow");
    push(entry.payoff, "payoff");
  }
  return Object.freeze(refs);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function changeId(kind: StudioSettingChangeKind, targetId: string, detail: string): string {
  return `setting-change:${kind}:${targetId}:${detail}`;
}

function makeChange(
  partial: Omit<StudioSettingChange, "id" | "beforeCostumeId" | "beforeAppearanceId"> & {
    readonly detail: string;
    readonly beforeCostumeId?: string | null;
    readonly beforeAppearanceId?: string | null;
  },
): StudioSettingChange {
  const { detail, ...rest } = partial;
  return Object.freeze({
    ...rest,
    id: changeId(partial.kind, partial.targetId, detail),
    beforeCostumeId: partial.beforeCostumeId ?? null,
    beforeAppearanceId: partial.beforeAppearanceId ?? null,
  });
}

function factChangeDetail(before: StudioStoryFact, after: StudioStoryFact): string | null {
  const fields: string[] = [];
  if (before.label !== after.label) fields.push("label");
  if (!sameIds(before.characterIds, after.characterIds)) fields.push("characters");
  if (before.locationId !== after.locationId) fields.push("location");
  return fields.length > 0 ? fields.join("+") : null;
}

function characterLabel(character: StudioStoryCharacter): string {
  return character.name || character.id;
}

function locationLabel(location: StudioStoryLocation): string {
  return location.name || location.id;
}

/** 이전/다음 바이블을 비교해 설정 변경 목록을 도출한다. 추가는 영향이 없어 제외한다. */
export function diffStudioStoryBible(
  previous: StudioStoryBible,
  next: StudioStoryBible,
): readonly StudioSettingChange[] {
  const changes: StudioSettingChange[] = [];

  const nextFacts = new Map(next.facts.map((fact) => [fact.id, fact]));
  for (const before of previous.facts) {
    const after = nextFacts.get(before.id);
    if (!after) {
      changes.push(makeChange({
        kind: "fact-removed",
        targetKind: "fact",
        targetId: before.id,
        targetLabel: before.label || before.id,
        summaryKo: `사실 '${before.label || before.id}'이(가) 삭제됐어요`,
        summaryEn: `Fact '${before.label || before.id}' was removed`,
        severity: "error",
        detail: "removed",
      }));
      continue;
    }
    const detail = factChangeDetail(before, after);
    if (detail) {
      changes.push(makeChange({
        kind: "fact-updated",
        targetKind: "fact",
        targetId: before.id,
        targetLabel: after.label || before.id,
        summaryKo: `사실 '${after.label || before.id}'의 내용이 바뀌었어요`,
        summaryEn: `Fact '${after.label || before.id}' was updated`,
        severity: "warning",
        detail,
      }));
    }
  }

  const nextCharacters = new Map(next.characters.map((c) => [c.id, c]));
  for (const before of previous.characters) {
    const after = nextCharacters.get(before.id);
    if (!after) {
      changes.push(makeChange({
        kind: "character-removed",
        targetKind: "character",
        targetId: before.id,
        targetLabel: characterLabel(before),
        summaryKo: `캐릭터 '${characterLabel(before)}'이(가) 삭제됐어요`,
        summaryEn: `Character '${characterLabel(before)}' was removed`,
        severity: "error",
        detail: "removed",
      }));
      continue;
    }
    if (before.defaultCostumeId !== after.defaultCostumeId) {
      changes.push(makeChange({
        kind: "character-costume-changed",
        targetKind: "character",
        targetId: before.id,
        targetLabel: characterLabel(after),
        summaryKo: `'${characterLabel(after)}'의 기본 의상이 바뀌었어요`,
        summaryEn: `Default costume of '${characterLabel(after)}' changed`,
        severity: "warning",
        detail: `costume:${before.defaultCostumeId ?? ""}->${after.defaultCostumeId ?? ""}`,
        beforeCostumeId: before.defaultCostumeId,
      }));
    }
    if (before.defaultAppearanceId !== after.defaultAppearanceId) {
      changes.push(makeChange({
        kind: "character-appearance-changed",
        targetKind: "character",
        targetId: before.id,
        targetLabel: characterLabel(after),
        summaryKo: `'${characterLabel(after)}'의 기본 외형이 바뀌었어요`,
        summaryEn: `Default appearance of '${characterLabel(after)}' changed`,
        severity: "warning",
        detail: `appearance:${before.defaultAppearanceId ?? ""}->${after.defaultAppearanceId ?? ""}`,
        beforeAppearanceId: before.defaultAppearanceId,
      }));
    }
    if (before.name !== after.name || !sameIds(before.aliases, after.aliases)) {
      changes.push(makeChange({
        kind: "character-renamed",
        targetKind: "character",
        targetId: before.id,
        targetLabel: characterLabel(after),
        summaryKo: `캐릭터 이름·별칭이 '${characterLabel(before)}'에서 '${characterLabel(after)}'로 바뀌었어요`,
        summaryEn: `Character '${characterLabel(before)}' was renamed to '${characterLabel(after)}'`,
        severity: "warning",
        detail: `name:${before.name}->${after.name}`,
      }));
    }
  }

  const nextLocations = new Map(next.locations.map((l) => [l.id, l]));
  for (const before of previous.locations) {
    const after = nextLocations.get(before.id);
    if (!after) {
      changes.push(makeChange({
        kind: "location-removed",
        targetKind: "location",
        targetId: before.id,
        targetLabel: locationLabel(before),
        summaryKo: `장소 '${locationLabel(before)}'이(가) 삭제됐어요`,
        summaryEn: `Location '${locationLabel(before)}' was removed`,
        severity: "error",
        detail: "removed",
      }));
      continue;
    }
    if (before.name !== after.name) {
      changes.push(makeChange({
        kind: "location-renamed",
        targetKind: "location",
        targetId: before.id,
        targetLabel: locationLabel(after),
        summaryKo: `장소 이름이 '${locationLabel(before)}'에서 '${locationLabel(after)}'로 바뀌었어요`,
        summaryEn: `Location '${locationLabel(before)}' was renamed to '${locationLabel(after)}'`,
        severity: "warning",
        detail: `name:${before.name}->${after.name}`,
      }));
    }
  }

  return Object.freeze(changes);
}

function sceneMatchesChange(
  change: StudioSettingChange,
  scene: StudioSettingImpactSceneRef,
): { reasonKo: string; reasonEn: string } | null {
  switch (change.targetKind) {
    case "fact":
      return scene.knownFactIds.includes(change.targetId)
        ? {
            reasonKo: "이 장면의 인물이 해당 사실을 알고 있는 것으로 기록돼 있어요",
            reasonEn: "A character in this scene is recorded as knowing this fact",
          }
        : null;
    case "character": {
      if (scene.characterId !== change.targetId) return null;
      if (
        change.kind === "character-costume-changed"
        && change.beforeCostumeId !== null
        && scene.costumeId === change.beforeCostumeId
      ) {
        return {
          reasonKo: "이 장면에서 변경 전 기본 의상을 입고 등장해요",
          reasonEn: "The character appears in the previous default costume in this scene",
        };
      }
      if (
        change.kind === "character-appearance-changed"
        && change.beforeAppearanceId !== null
        && scene.appearanceId === change.beforeAppearanceId
      ) {
        return {
          reasonKo: "이 장면에서 변경 전 기본 외형으로 등장해요",
          reasonEn: "The character appears with the previous default appearance in this scene",
        };
      }
      return {
        reasonKo: "이 장면에 해당 캐릭터가 등장해요",
        reasonEn: "The character appears in this scene",
      };
    }
    case "location":
      return scene.locationId === change.targetId
        ? {
            reasonKo: "이 장면의 배경이 해당 장소예요",
            reasonEn: "This scene takes place in this location",
          }
        : null;
  }
}

function assetMatchesChange(
  change: StudioSettingChange,
  asset: StudioSettingImpactAssetUse,
): { reasonKo: string; reasonEn: string } | null {
  switch (change.targetKind) {
    case "fact":
      return asset.factIds.includes(change.targetId)
        ? {
            reasonKo: "이 에셋이 해당 사실을 참조해 만들어졌어요",
            reasonEn: "This asset was produced against this fact",
          }
        : null;
    case "character": {
      if (
        change.kind === "character-costume-changed"
        && change.beforeCostumeId !== null
        && asset.costumeIds.includes(change.beforeCostumeId)
      ) {
        return {
          reasonKo: "이 에셋이 변경 전 기본 의상을 기준으로 만들어졌어요",
          reasonEn: "This asset was produced against the previous default costume",
        };
      }
      if (
        change.kind === "character-appearance-changed"
        && change.beforeAppearanceId !== null
        && asset.appearanceIds.includes(change.beforeAppearanceId)
      ) {
        return {
          reasonKo: "이 에셋이 변경 전 기본 외형을 기준으로 만들어졌어요",
          reasonEn: "This asset was produced against the previous default appearance",
        };
      }
      return asset.characterIds.includes(change.targetId)
        ? {
            reasonKo: "이 에셋이 해당 캐릭터를 참조해 만들어졌어요",
            reasonEn: "This asset references this character",
          }
        : null;
    }
    case "location":
      return asset.locationIds.includes(change.targetId)
        ? {
            reasonKo: "이 에셋이 해당 장소를 참조해 만들어졌어요",
            reasonEn: "This asset references this location",
          }
        : null;
  }
}

const FORESHADOW_ROLE_LABELS: Readonly<Record<string, { ko: string; en: string }>> = {
  seed: { ko: "심은 장면", en: "seeded scene" },
  foreshadow: { ko: "단서 장면", en: "foreshadow scene" },
  payoff: { ko: "회수 장면", en: "payoff scene" },
};

/** 변경 목록과 참조 소스를 대조해 영향 알림을 만든다. 영향이 없는 변경은 알림에서 제외한다. */
export function analyzeStudioSettingChangeImpacts(
  changes: readonly StudioSettingChange[],
  sources: StudioSettingChangeReferenceSources,
): readonly StudioSettingChangeNotice[] {
  const notices: StudioSettingChangeNotice[] = [];

  for (const change of changes) {
    const impacts: StudioSettingChangeImpact[] = [];
    const seen = new Set<string>();
    const impactedSceneIds = new Set<string>();
    const push = (impact: StudioSettingChangeImpact) => {
      const key = `${impact.kind}\u0000${impact.refId}\u0000${impact.detail}`;
      if (seen.has(key)) return;
      seen.add(key);
      impacts.push(Object.freeze(impact));
    };

    for (const scene of sources.episodeScenes) {
      const reason = sceneMatchesChange(change, scene);
      if (!reason) continue;
      impactedSceneIds.add(scene.sceneId);
      push({
        kind: "episode",
        refId: scene.sceneId,
        label: scene.episodeLabel || scene.sceneId,
        detail: scene.sceneId,
        reasonKo: reason.reasonKo,
        reasonEn: reason.reasonEn,
      });
    }

    for (const asset of sources.assetUses) {
      const reason = assetMatchesChange(change, asset);
      if (!reason) continue;
      push({
        kind: "asset",
        refId: asset.assetId,
        label: asset.assetLabel || asset.assetId,
        detail: asset.assetId,
        reasonKo: reason.reasonKo,
        reasonEn: reason.reasonEn,
      });
    }

    for (const foreshadow of sources.foreshadows) {
      if (!foreshadow.sceneId || !impactedSceneIds.has(foreshadow.sceneId)) continue;
      const role = FORESHADOW_ROLE_LABELS[foreshadow.linkRole] ?? {
        ko: "연결 장면",
        en: "linked scene",
      };
      push({
        kind: "foreshadow",
        refId: foreshadow.entryId,
        label: foreshadow.title,
        detail: foreshadow.episode !== null
          ? `${foreshadow.episode}화 · ${role.ko}`
          : role.ko,
        reasonKo: `이 복선의 ${role.ko}이 영향 받는 장면과 겹쳐요`,
        reasonEn: `This foreshadow's ${role.en} overlaps an impacted scene`,
      });
    }

    if (impacts.length === 0) continue;
    const frozenImpacts = Object.freeze(impacts);
    notices.push(Object.freeze({
      change,
      impacts: frozenImpacts,
      impactCount: frozenImpacts.length,
    }));
  }

  return Object.freeze(notices);
}

/** 이전/다음 바이블과 참조 소스만으로 영향 알림을 한 번에 만든다. */
export function buildStudioSettingChangeNotices(
  previous: StudioStoryBible,
  next: StudioStoryBible,
  sources: StudioSettingChangeReferenceSources,
): readonly StudioSettingChangeNotice[] {
  return analyzeStudioSettingChangeImpacts(
    diffStudioStoryBible(previous, next),
    sources,
  );
}

/** 확인한 알림 id 목록에 하나를 더한다 (중복·미존재 id는 무시). */
export function acknowledgeStudioSettingChange(
  notices: readonly StudioSettingChangeNotice[],
  acknowledgedIds: readonly string[],
  noticeId: string,
): readonly string[] {
  if (acknowledgedIds.includes(noticeId)) return acknowledgedIds;
  if (!notices.some((notice) => notice.change.id === noticeId)) return acknowledgedIds;
  return Object.freeze([...acknowledgedIds, noticeId]);
}

/** 모든 알림을 확인 처리한다. */
export function acknowledgeAllStudioSettingChanges(
  notices: readonly StudioSettingChangeNotice[],
  acknowledgedIds: readonly string[],
): readonly string[] {
  const next = new Set(acknowledgedIds);
  for (const notice of notices) next.add(notice.change.id);
  return Object.freeze([...next]);
}

/** 개요 배지와 패널 머리글에 쓰는 집계. 배지는 unacknowledgedCount > 0 동안 남는다. */
export function summarizeStudioSettingChangeImpacts(
  notices: readonly StudioSettingChangeNotice[],
  acknowledgedIds: readonly string[],
): StudioSettingChangeImpactSummary {
  const acknowledged = new Set(acknowledgedIds);
  let unacknowledgedCount = 0;
  let impactedEpisodeCount = 0;
  let impactedAssetCount = 0;
  let impactedForeshadowCount = 0;
  let totalImpactCount = 0;
  for (const notice of notices) {
    if (acknowledged.has(notice.change.id)) continue;
    unacknowledgedCount += 1;
    totalImpactCount += notice.impactCount;
    for (const impact of notice.impacts) {
      if (impact.kind === "episode") impactedEpisodeCount += 1;
      else if (impact.kind === "asset") impactedAssetCount += 1;
      else impactedForeshadowCount += 1;
    }
  }
  return Object.freeze({
    noticeCount: notices.length,
    unacknowledgedCount,
    impactedEpisodeCount,
    impactedAssetCount,
    impactedForeshadowCount,
    totalImpactCount,
  });
}
