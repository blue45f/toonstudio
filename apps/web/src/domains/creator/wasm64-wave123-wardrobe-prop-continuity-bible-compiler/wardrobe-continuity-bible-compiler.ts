/**
 * Wave 123 — 웹툰 연재 화차 의상·소품·손상 상태 인과 연속성 감사 엔진 및
 * 캐릭터 옷장 바이블 컴파일러.
 *
 * 핵심 규칙:
 * 1. 미설명 손상 복구 작붕(`spontaneous-damage-healing`, blocker) 적발
 * 2. `prop-dropped` 없는 필수 의복·장신구·무기 누락(`missing-signature-prop`, blocker/warning) 적발
 * 3. 해부학적 좌/우 착용 방향 반전(`accessory-handedness-flip`, blocker) 적발
 * 4. Björn Ottosson OKLab ΔE 색채 드리프트(`palette-color-drift`, 조명 허용치 반영) 적발
 * 5. 명시적 `wardrobe-change` / `scene-time-skip-reset` 이후 손상·소품 상태 합법적 초기화(오탐 0건)
 */

import {
  ALL_WARDROBE_DAMAGE_KINDS,
  DAMAGE_LABEL_KO,
  HANDEDNESS_LABEL_KO,
  type CharacterWardrobePreset,
  type CompiledCharacterWardrobe,
  type CompiledOutfitPreset,
  type CompiledWardrobeBible,
  type CompiledWardrobeSlot,
  type CutContinuityAuditRow,
  type CutContinuityEvent,
  type CutContinuityEventKind,
  type CutWardrobeObservation,
  type EpisodeWardrobeBible,
  type EpisodeWardrobeContinuityAudit,
  type ObservedSlotState,
  type SrgbTriplet,
  type TimelineBadgeText,
  type TimelineCellAudit,
  type TimelineCellStatus,
  type WardrobeAuditPassStatus,
  type WardrobeContinuityFinding,
  type WardrobeContinuityViolationCode,
  type WardrobeDamageKind,
  type WardrobeSlotSpec,
  type WardrobeViolationSeverity,
} from "./wardrobe-continuity-types";
import {
  clampFiniteNumber,
  computeFips1804Sha256Hex,
  computeOklabDeltaE,
  computeWardrobeBibleSha256Hex,
  formatOklchCss,
  oklabToOklch,
  srgbTripletToOklab,
  srgbTripletToOklchCss,
} from "./wardrobe-oklab-and-sha256";

export { computeFips1804Sha256Hex, computeOklabDeltaE, computeWardrobeBibleSha256Hex };

interface DamageOriginRecord {
  readonly originCutId: string;
  readonly originCutIndex: number;
}

interface CharacterCausalRuntimeState {
  activeOutfitId: string;
  readonly activeDamagesBySlot: Map<string, Map<WardrobeDamageKind, DamageOriginRecord>>;
  readonly droppedSlots: Set<string>;
  readonly acquiredSlots: Map<string, DamageOriginRecord>;
}

interface BaseCellContext {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly characterId: string;
  readonly outfitId: string;
  readonly slot: CompiledWardrobeSlot;
  readonly effectiveMaxDeltaE: number;
  readonly resetApplied: boolean;
}

const DAMAGE_EVENT_SET: ReadonlySet<string> = new Set<string>(ALL_WARDROBE_DAMAGE_KINDS);

function isDamageKind(value: string | undefined): value is WardrobeDamageKind {
  return value !== undefined && DAMAGE_EVENT_SET.has(value);
}

function normalizeSrgbTriplet(srgb: SrgbTriplet): SrgbTriplet {
  return [
    Math.round(clampFiniteNumber(srgb[0], 0, 255)),
    Math.round(clampFiniteNumber(srgb[1], 0, 255)),
    Math.round(clampFiniteNumber(srgb[2], 0, 255)),
  ];
}

function compileSlotSpec(slot: WardrobeSlotSpec): CompiledWardrobeSlot {
  const canonicalSrgb = normalizeSrgbTriplet(slot.canonicalSrgb);
  const canonicalOklab = srgbTripletToOklab(canonicalSrgb);
  const canonicalOklch = oklabToOklch(canonicalOklab);
  return {
    ...slot,
    canonicalSrgb,
    maxAllowedOklabDeltaE: clampFiniteNumber(slot.maxAllowedOklabDeltaE, 0, 2),
    canonicalOklab,
    canonicalOklch,
    canonicalOklchCss: formatOklchCss(canonicalOklch),
  };
}

function compileOutfitPreset(preset: CharacterWardrobePreset): CompiledOutfitPreset {
  const body = {
    characterId: preset.characterId,
    characterNameKo: preset.characterNameKo ?? preset.characterId,
    outfitId: preset.outfitId,
    outfitLabelKo: preset.outfitLabelKo,
    slots: preset.slots.map(compileSlotSpec),
  };
  return { ...body, presetSha256Hex: computeWardrobeBibleSha256Hex(body) };
}

/** 화차 캐릭터 옷장 바이블을 정규화·컴파일하고 결정론적 SHA-256 지문을 부여한다. */
export function compileWardrobeBible(bible: EpisodeWardrobeBible): CompiledWardrobeBible {
  const defaultLightingToleranceDeltaE = clampFiniteNumber(
    bible.defaultLightingToleranceDeltaE ?? 0,
    0,
    1,
  );
  const byCharacter = new Map<string, CompiledOutfitPreset[]>();
  for (const preset of bible.presets) {
    const compiled = compileOutfitPreset(preset);
    const list = byCharacter.get(compiled.characterId);
    if (list) {
      list.push(compiled);
    } else {
      byCharacter.set(compiled.characterId, [compiled]);
    }
  }

  const characters: CompiledCharacterWardrobe[] = [];
  let slotCount = 0;
  for (const [characterId, outfits] of byCharacter.entries()) {
    const requested = bible.defaultOutfitByCharacter?.[characterId];
    const matched = outfits.find((o) => o.outfitId === requested);
    for (const outfit of outfits) {
      slotCount += outfit.slots.length;
    }
    characters.push({
      characterId,
      characterNameKo: outfits[0].characterNameKo,
      defaultOutfitId: matched ? matched.outfitId : outfits[0].outfitId,
      outfits,
    });
  }

  const digestPayload = {
    episodeId: bible.episodeId,
    episodeTitleKo: bible.episodeTitleKo,
    defaultLightingToleranceDeltaE,
    characters,
  };
  return {
    ...digestPayload,
    presetCount: bible.presets.length,
    slotCount,
    bibleSha256Hex: computeWardrobeBibleSha256Hex(digestPayload),
  };
}

function createEmptyCountsByCode(): Record<WardrobeContinuityViolationCode, number> {
  return {
    "spontaneous-damage-healing": 0,
    "missing-signature-prop": 0,
    "accessory-handedness-flip": 0,
    "palette-color-drift": 0,
    "unregistered-character": 0,
    "unknown-outfit-change": 0,
    "unregistered-slot": 0,
  };
}

function isMissingSlotBlocker(slot: CompiledWardrobeSlot, acquiredTransiently: boolean): boolean {
  if (!slot.required && acquiredTransiently) {
    return false;
  }
  if (slot.importance === "standard") {
    return false;
  }
  if (slot.importance === "signature") {
    return true;
  }
  if (
    slot.category === "outerwear" ||
    slot.category === "top" ||
    slot.category === "bottom" ||
    slot.category === "weapon" ||
    slot.category === "eyewear"
  ) {
    return true;
  }
  return slot.handedness === "left" || slot.handedness === "right";
}

function formatDamagesKo(damages: readonly WardrobeDamageKind[]): string {
  return damages.map((kind) => DAMAGE_LABEL_KO[kind]).join(", ");
}

const BADGE_BY_STATUS: Readonly<Record<TimelineCellStatus, TimelineBadgeText>> = {
  "healed-error": "HEAL!",
  "missing-error": "MISS",
  "flipped-error": "FLIP",
  "color-error": "COLOR",
  damaged: "DMG",
  dropped: "DROP",
  occluded: "CROP",
  unobserved: "—",
  "reset-ok": "OK",
  ok: "OK",
};

function resolveCellStatus(
  violationCodes: readonly WardrobeContinuityViolationCode[],
  hasActiveDamage: boolean,
  resetApplied: boolean,
): TimelineCellStatus {
  if (violationCodes.includes("spontaneous-damage-healing")) return "healed-error";
  if (violationCodes.includes("missing-signature-prop")) return "missing-error";
  if (violationCodes.includes("accessory-handedness-flip")) return "flipped-error";
  if (violationCodes.includes("palette-color-drift")) return "color-error";
  if (hasActiveDamage) return "damaged";
  return resetApplied ? "reset-ok" : "ok";
}

function buildTimelineCell(
  base: BaseCellContext,
  status: TimelineCellStatus,
  activeCausalDamages: readonly WardrobeDamageKind[],
  violationCodes: readonly WardrobeContinuityViolationCode[],
  extra?: Partial<
    Pick<
      TimelineCellAudit,
      "observedCondition" | "observedHandedness" | "observedSrgb" | "observedOklchCss" | "oklabDeltaE"
    >
  >,
): TimelineCellAudit {
  return {
    cutId: base.cutId,
    cutIndex: base.cutIndex,
    characterId: base.characterId,
    outfitId: base.outfitId,
    slotId: base.slot.slotId,
    slotLabelKo: base.slot.labelKo,
    category: base.slot.category,
    status,
    badgeText: BADGE_BY_STATUS[status],
    activeCausalDamages,
    expectedHandedness: base.slot.handedness,
    canonicalSrgb: base.slot.canonicalSrgb,
    canonicalOklchCss: base.slot.canonicalOklchCss,
    effectiveMaxDeltaE: base.effectiveMaxDeltaE,
    resetApplied: base.resetApplied,
    violationCodes,
    ...extra,
  };
}

function clearCausalStateForReset(state: CharacterCausalRuntimeState): void {
  state.activeDamagesBySlot.clear();
  state.droppedSlots.clear();
  state.acquiredSlots.clear();
}

function recordCausalDamage(
  state: CharacterCausalRuntimeState,
  slotId: string,
  damageKind: WardrobeDamageKind,
  cutId: string,
  cutIndex: number,
): void {
  let slotMap = state.activeDamagesBySlot.get(slotId);
  if (!slotMap) {
    slotMap = new Map<WardrobeDamageKind, DamageOriginRecord>();
    state.activeDamagesBySlot.set(slotId, slotMap);
  }
  if (!slotMap.has(damageKind)) {
    slotMap.set(damageKind, { originCutId: cutId, originCutIndex: cutIndex });
  }
}

function extractObservedDamages(observed: ObservedSlotState): readonly WardrobeDamageKind[] {
  const result = new Set<WardrobeDamageKind>();
  if (observed.activeDamages) {
    for (const kind of observed.activeDamages) {
      if (isDamageKind(kind)) {
        result.add(kind);
      }
    }
  }
  if (isDamageKind(observed.condition)) {
    result.add(observed.condition);
  }
  return Array.from(result);
}

/**
 * 컷별 관측 데이터를 시간순으로 추적해 화차 전체 의상·소품·손상 인과 연속성을 감사한다.
 */
export function auditEpisodeWardrobeContinuity(
  bible: EpisodeWardrobeBible,
  observations: readonly CutWardrobeObservation[],
): EpisodeWardrobeContinuityAudit {
  const compiledBible = compileWardrobeBible(bible);
  const characterIndex = new Map<string, CompiledCharacterWardrobe>();
  const outfitLookup = new Map<string, Map<string, CompiledOutfitPreset>>();
  const runtimeByCharacter = new Map<string, CharacterCausalRuntimeState>();

  for (const character of compiledBible.characters) {
    characterIndex.set(character.characterId, character);
    const map = new Map<string, CompiledOutfitPreset>();
    for (const outfit of character.outfits) {
      map.set(outfit.outfitId, outfit);
    }
    outfitLookup.set(character.characterId, map);
    runtimeByCharacter.set(character.characterId, {
      activeOutfitId: character.defaultOutfitId,
      activeDamagesBySlot: new Map(),
      droppedSlots: new Set(),
      acquiredSlots: new Map(),
    });
  }

  const ordered = observations
    .map((obs, originalIdx) => ({ obs, originalIdx }))
    .sort((a, b) => {
      const idxA = Number.isFinite(a.obs.cutIndex) ? a.obs.cutIndex : 0;
      const idxB = Number.isFinite(b.obs.cutIndex) ? b.obs.cutIndex : 0;
      return idxA !== idxB ? idxA - idxB : a.originalIdx - b.originalIdx;
    });

  const findings: WardrobeContinuityFinding[] = [];
  const cutRows: CutContinuityAuditRow[] = [];
  const countsByCode = createEmptyCountsByCode();
  let totalSlotChecks = 0;

  const pushFinding = (entry: Omit<WardrobeContinuityFinding, "findingId">): void => {
    const findingId = `W123-${String(findings.length + 1).padStart(3, "0")}`;
    findings.push({ findingId, ...entry });
    countsByCode[entry.code] += 1;
  };

  for (const { obs } of ordered) {
    const cutIndex = Number.isFinite(obs.cutIndex) ? obs.cutIndex : 0;
    const cutLightingTol = clampFiniteNumber(
      obs.lightingToleranceDeltaE ?? compiledBible.defaultLightingToleranceDeltaE,
      0,
      1,
    );
    const character = characterIndex.get(obs.characterId);
    const runtime = runtimeByCharacter.get(obs.characterId);
    const charOutfits = outfitLookup.get(obs.characterId);

    if (!character || !runtime || !charOutfits) {
      pushFinding({
        code: "unregistered-character",
        severity: "warning",
        cutId: obs.cutId,
        cutIndex,
        characterId: obs.characterId,
        outfitId: "unregistered",
        expectedSummaryKo: "화차 옷장 바이블에 등록된 캐릭터",
        observedSummaryKo: `미등록 캐릭터 '${obs.characterId}' 관측`,
        messageKo: `${obs.cutId} 컷의 캐릭터 '${obs.characterId}'가 화차 옷장 바이블에 등록되어 있지 않습니다.`,
        remediationKo: `바이블에 '${obs.characterId}' 캐릭터의 기본 착장 프리셋을 추가한 뒤 다시 검수하세요.`,
      });
      cutRows.push({
        cutId: obs.cutId,
        cutIndex,
        sceneId: obs.sceneId,
        cutLabelKo: obs.cutLabelKo,
        characterId: obs.characterId,
        characterNameKo: obs.characterId,
        activeOutfitId: "unregistered",
        activeOutfitLabelKo: "미등록 캐릭터",
        lightingMoodLabelKo: obs.lightingMoodLabelKo,
        lightingToleranceDeltaE: cutLightingTol,
        eventsApplied: [],
        cells: [],
        blockerCount: 0,
        warningCount: 1,
      });
      continue;
    }

    const eventsApplied: CutContinuityEventKind[] = [];
    let resetApplied = false;
    const rawEvents: readonly CutContinuityEvent[] = obs.events ?? [];

    for (const event of rawEvents) {
      if (event.kind === "scene-time-skip-reset" && event.characterId === "*") {
        for (const eachRuntime of runtimeByCharacter.values()) {
          clearCausalStateForReset(eachRuntime);
        }
        eventsApplied.push(event.kind);
        resetApplied = true;
        continue;
      }
      if (event.characterId !== obs.characterId) {
        continue;
      }

      eventsApplied.push(event.kind);
      if (event.kind === "scene-time-skip-reset") {
        clearCausalStateForReset(runtime);
        resetApplied = true;
      } else if (event.kind === "wardrobe-change") {
        clearCausalStateForReset(runtime);
        resetApplied = true;
        if (event.nextOutfitId) {
          if (charOutfits.has(event.nextOutfitId)) {
            runtime.activeOutfitId = event.nextOutfitId;
          } else {
            pushFinding({
              code: "unknown-outfit-change",
              severity: "warning",
              cutId: obs.cutId,
              cutIndex,
              characterId: obs.characterId,
              outfitId: runtime.activeOutfitId,
              expectedSummaryKo: `등록된 착장 ID 중 하나(${Array.from(charOutfits.keys()).join(", ")})`,
              observedSummaryKo: `미등록 착장 '${event.nextOutfitId}'으로 변경 요청`,
              messageKo: `${obs.cutId} 컷에서 ${character.characterNameKo}의 의상 교체 대상 '${event.nextOutfitId}'을 바이블에서 찾지 못했습니다.`,
              remediationKo: `바이블에 '${event.nextOutfitId}' 착장을 등록하거나 기존 착장 ID로 수정하세요.`,
            });
          }
        }
      } else if (event.kind === "prop-dropped" && event.slotId) {
        runtime.droppedSlots.add(event.slotId);
        runtime.acquiredSlots.delete(event.slotId);
      } else if (event.kind === "prop-acquired" && event.slotId) {
        runtime.droppedSlots.delete(event.slotId);
        runtime.acquiredSlots.set(event.slotId, { originCutId: obs.cutId, originCutIndex: cutIndex });
      } else if (isDamageKind(event.kind) && event.slotId) {
        recordCausalDamage(runtime, event.slotId, event.kind, obs.cutId, cutIndex);
      }
    }

    const activeOutfit = charOutfits.get(runtime.activeOutfitId) ?? character.outfits[0];
    const observedBySlot = new Map<string, ObservedSlotState>();
    for (const observedSlot of obs.slots) {
      observedBySlot.set(observedSlot.slotId, observedSlot);
    }

    const occludedSet = new Set<string>(obs.occludedSlotIds ?? []);
    const activeSlotIdSet = new Set<string>(activeOutfit.slots.map((s) => s.slotId));
    const cells: TimelineCellAudit[] = [];
    const findingsBeforeCut = findings.length;

    for (const observedSlot of obs.slots) {
      if (!activeSlotIdSet.has(observedSlot.slotId)) {
        pushFinding({
          code: "unregistered-slot",
          severity: "info",
          cutId: obs.cutId,
          cutIndex,
          characterId: obs.characterId,
          outfitId: activeOutfit.outfitId,
          slotId: observedSlot.slotId,
          expectedSummaryKo: `'${activeOutfit.outfitLabelKo}'에 정의된 슬롯`,
          observedSummaryKo: `미등록 슬롯 '${observedSlot.slotId}' 관측`,
          messageKo: `${obs.cutId} 컷에서 '${activeOutfit.outfitLabelKo}' 바이블에 없는 슬롯 '${observedSlot.slotId}'이 전달되었습니다.`,
          remediationKo: "소품이 의도된 추가 품목이라면 착장 바이블 슬롯 목록에 등록하세요.",
        });
      }
    }

    for (const slot of activeOutfit.slots) {
      totalSlotChecks += 1;
      const observed = observedBySlot.get(slot.slotId);
      const isOccluded = occludedSet.has(slot.slotId) || observed?.visibility === "occluded";
      const isDropped = runtime.droppedSlots.has(slot.slotId);
      const acquiredOrigin = runtime.acquiredSlots.get(slot.slotId);
      const expectedPresent = (slot.required || acquiredOrigin !== undefined) && !isDropped;
      const effectiveMaxDeltaE = slot.maxAllowedOklabDeltaE + cutLightingTol;
      const causalDamageMap = runtime.activeDamagesBySlot.get(slot.slotId);
      const priorCausalDamages = causalDamageMap ? Array.from(causalDamageMap.keys()) : [];
      const cellBase: BaseCellContext = {
        cutId: obs.cutId,
        cutIndex,
        characterId: obs.characterId,
        outfitId: activeOutfit.outfitId,
        slot,
        effectiveMaxDeltaE,
        resetApplied,
      };

      if (isOccluded) {
        cells.push(buildTimelineCell(cellBase, "occluded", priorCausalDamages, []));
        continue;
      }

      const slotFindingBase = {
        cutId: obs.cutId,
        cutIndex,
        characterId: obs.characterId,
        outfitId: activeOutfit.outfitId,
        slotId: slot.slotId,
        slotLabelKo: slot.labelKo,
      };

      if (observed === undefined || !observed.present) {
        if (isDropped) {
          cells.push(buildTimelineCell(cellBase, "dropped", priorCausalDamages, []));
          continue;
        }
        if (!expectedPresent) {
          cells.push(buildTimelineCell(cellBase, "unobserved", priorCausalDamages, []));
          continue;
        }

        const missingSeverity: WardrobeViolationSeverity = isMissingSlotBlocker(
          slot,
          acquiredOrigin !== undefined,
        )
          ? "blocker"
          : "warning";
        pushFinding({
          ...slotFindingBase,
          code: "missing-signature-prop",
          severity: missingSeverity,
          originCutId: acquiredOrigin?.originCutId,
          expectedSummaryKo: `${slot.labelKo} 착용 유지`,
          observedSummaryKo: "이탈 이벤트 없이 미표시(누락)",
          messageKo: `${obs.cutId} 컷에서 ${character.characterNameKo}의 '${slot.labelKo}'이 이탈(prop-dropped) 기록 없이 사라졌습니다.`,
          remediationKo: `이전 컷과 이어지게 '${slot.labelKo}'을 그려 넣거나, 의도된 분실·해제라면 prop-dropped 이벤트를 기록하세요.`,
        });
        cells.push(buildTimelineCell(cellBase, "missing-error", priorCausalDamages, ["missing-signature-prop"]));
        continue;
      }

      const violationCodes: WardrobeContinuityViolationCode[] = [];
      const observedDamages = extractObservedDamages(observed);
      const observedDamageSet = new Set<WardrobeDamageKind>(observedDamages);

      // 1) 미설명 손상 복구 작붕 검증
      if (causalDamageMap && causalDamageMap.size > 0) {
        const missingDamages: WardrobeDamageKind[] = [];
        let earliestOrigin: DamageOriginRecord | undefined;
        if (observed.activeDamages !== undefined || observedDamageSet.size === 0) {
          for (const [dmgKind, origin] of causalDamageMap.entries()) {
            const missing = observed.activeDamages !== undefined ? !observedDamageSet.has(dmgKind) : true;
            if (missing) {
              missingDamages.push(dmgKind);
              if (!earliestOrigin || origin.originCutIndex < earliestOrigin.originCutIndex) {
                earliestOrigin = origin;
              }
            }
          }
        }
        if (missingDamages.length > 0) {
          violationCodes.push("spontaneous-damage-healing");
          const missingText = formatDamagesKo(missingDamages);
          const originRef = earliestOrigin ? earliestOrigin.originCutId : "이전 컷";
          pushFinding({
            ...slotFindingBase,
            code: "spontaneous-damage-healing",
            severity: "blocker",
            originCutId: earliestOrigin?.originCutId,
            expectedSummaryKo: `${originRef}에서 발생한 ${missingText} 유지`,
            observedSummaryKo:
              observedDamageSet.size === 0
                ? "손상 없는 정상(intact) 상태로 복구됨"
                : `${formatDamagesKo(observedDamages)}만 표기되고 ${missingText} 누락`,
            messageKo: `${obs.cutId} 컷에서 ${character.characterNameKo}의 '${slot.labelKo}'에 ${originRef}부터 누적된 ${missingText}이 의상 교체나 시간 경과 없이 갑자기 복구되었습니다.`,
            remediationKo: `'${slot.labelKo}'에 ${missingText} 묘사를 유지하거나, 장면 전환이라면 wardrobe-change 또는 scene-time-skip-reset 이벤트를 명시하세요.`,
          });
        }
      }

      for (const dmgKind of observedDamages) {
        recordCausalDamage(runtime, slot.slotId, dmgKind, obs.cutId, cutIndex);
      }

      // 2) 좌우 착용 반전 검증
      if (
        slot.handedness !== undefined &&
        observed.observedHandedness !== undefined &&
        observed.observedHandedness !== slot.handedness
      ) {
        violationCodes.push("accessory-handedness-flip");
        pushFinding({
          ...slotFindingBase,
          code: "accessory-handedness-flip",
          severity: "blocker",
          expectedSummaryKo: `${HANDEDNESS_LABEL_KO[slot.handedness]} 착용`,
          observedSummaryKo: `${HANDEDNESS_LABEL_KO[observed.observedHandedness]} 착용으로 반전`,
          messageKo: `${obs.cutId} 컷에서 ${character.characterNameKo}의 '${slot.labelKo}' 착용 위치가 기준(${HANDEDNESS_LABEL_KO[slot.handedness]})에서 ${HANDEDNESS_LABEL_KO[observed.observedHandedness]}으로 뒤집혔습니다.`,
          remediationKo: `좌우 반전(캔버스 플립) 실수를 점검하고 '${slot.labelKo}'을 ${HANDEDNESS_LABEL_KO[slot.handedness]} 위치로 바로잡으세요.`,
        });
      }

      // 3) Björn Ottosson OKLab ΔE 의상 색채 드리프트 검증
      let normalizedObservedSrgb: SrgbTriplet | undefined;
      let observedOklchCss: string | undefined;
      let oklabDeltaE: number | undefined;

      if (observed.observedSrgb !== undefined) {
        normalizedObservedSrgb = normalizeSrgbTriplet(observed.observedSrgb);
        observedOklchCss = srgbTripletToOklchCss(normalizedObservedSrgb);
        oklabDeltaE = computeOklabDeltaE(slot.canonicalOklab, normalizedObservedSrgb);
        if (oklabDeltaE > effectiveMaxDeltaE + 1e-12) {
          violationCodes.push("palette-color-drift");
          const colorSeverity: WardrobeViolationSeverity =
            oklabDeltaE > effectiveMaxDeltaE * 1.5 || oklabDeltaE >= 0.14 ? "blocker" : "warning";
          pushFinding({
            ...slotFindingBase,
            code: "palette-color-drift",
            severity: colorSeverity,
            deltaE: oklabDeltaE,
            allowedDeltaE: effectiveMaxDeltaE,
            expectedSummaryKo: `공식 배색 대비 OKLab ΔE ≤ ${effectiveMaxDeltaE.toFixed(3)}`,
            observedSummaryKo: `관측 색차 OKLab ΔE = ${oklabDeltaE.toFixed(3)}`,
            messageKo: `${obs.cutId} 컷에서 ${character.characterNameKo}의 '${slot.labelKo}' 채색이 공식 옷장 배색에서 ΔE ${oklabDeltaE.toFixed(3)}(허용치 ${effectiveMaxDeltaE.toFixed(3)})만큼 벗어났습니다.`,
            remediationKo: `공식 바이블 스와치(${slot.canonicalOklchCss}) 기준으로 밑색을 다시 찍고, 장면 조명 보정 레이어만 별도 곱하기로 적용하세요.`,
          });
        }
      }

      const updatedDamageMap = runtime.activeDamagesBySlot.get(slot.slotId);
      const activeCausalDamages = updatedDamageMap ? Array.from(updatedDamageMap.keys()) : [];
      const cellStatus = resolveCellStatus(
        violationCodes,
        activeCausalDamages.length > 0,
        resetApplied,
      );
      cells.push(
        buildTimelineCell(cellBase, cellStatus, activeCausalDamages, violationCodes, {
          observedCondition: observed.condition ?? observedDamages[0] ?? "intact",
          observedHandedness: observed.observedHandedness,
          observedSrgb: normalizedObservedSrgb,
          observedOklchCss,
          oklabDeltaE,
        }),
      );
    }

    const cutFindings = findings.slice(findingsBeforeCut);
    cutRows.push({
      cutId: obs.cutId,
      cutIndex,
      sceneId: obs.sceneId,
      cutLabelKo: obs.cutLabelKo,
      characterId: obs.characterId,
      characterNameKo: character.characterNameKo,
      activeOutfitId: activeOutfit.outfitId,
      activeOutfitLabelKo: activeOutfit.outfitLabelKo,
      lightingMoodLabelKo: obs.lightingMoodLabelKo,
      lightingToleranceDeltaE: cutLightingTol,
      eventsApplied,
      cells,
      blockerCount: cutFindings.filter((f) => f.severity === "blocker").length,
      warningCount: cutFindings.filter((f) => f.severity === "warning").length,
    });
  }

  let blockerCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const finding of findings) {
    if (finding.severity === "blocker") {
      blockerCount += 1;
    } else if (finding.severity === "warning") {
      warningCount += 1;
    } else {
      infoCount += 1;
    }
  }

  const continuityScore = Math.max(
    0,
    Math.min(100, 100 - blockerCount * 25 - warningCount * 8 - infoCount * 2),
  );
  const passStatus: WardrobeAuditPassStatus =
    blockerCount > 0 ? "block" : warningCount > 0 ? "warn" : "pass";

  const auditCore = {
    episodeId: compiledBible.episodeId,
    episodeTitleKo: compiledBible.episodeTitleKo,
    bibleSha256Hex: compiledBible.bibleSha256Hex,
    passStatus,
    continuityScore,
    totalCutsAudited: cutRows.length,
    totalSlotChecks,
    blockerCount,
    warningCount,
    infoCount,
    countsByCode,
    cutRows,
    findings,
    compiledBible,
  };

  return {
    ...auditCore,
    auditSha256Hex: computeWardrobeBibleSha256Hex(auditCore),
  };
}
