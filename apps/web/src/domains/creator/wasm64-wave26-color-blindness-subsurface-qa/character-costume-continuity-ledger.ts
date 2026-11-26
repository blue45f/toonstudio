/**
 * Wasm64 Wave 26: 다회차 웹툰 캐릭터 비대칭 랜드마크 좌우 반전 실수 검출기 및
 * 복장·부상·소품 타임라인 연속성 원장(Continuity Ledger) 감사기.
 *
 * - 웹툰 제작 현장에서 가장 빈번한 작화 사고인 '캔버스 좌우 반전 미복구 실수'를 검출한다.
 * - 카메라 시점(`front`/`three-quarter-front` 대 `back`/`three-quarter-back`)에 따른
 *   신체 좌우(`character-left`/`character-right`) <-> 화면 좌우(`screen-left`/`screen-right`)
 *   반전 기하학(parity)을 정확히 계산하여, 정상적인 뒷모습 컷을 오탐하지 않는다.
 * - 회차 구간 `[fromEpisode, toEpisode]` 단위로 복장 승급, 붕대·부상, 파손·수리 소품 상태를
 *   검증하고 시대·회차 역행(anachronism) 작화 실수에 대해 즉시 실행 가능한 한국어 수정 지시를 생성한다.
 */

/** 비대칭 캐릭터 핵심 표식 6종 */
export type AsymmetricLandmarkKey =
  | "scarSide"
  | "hairPartingSide"
  | "moleSide"
  | "monocleEye"
  | "swordSheathHip"
  | "dominantHand";

/** 캐릭터 본인의 해부학적 신체 기준 좌/우 */
export type AnatomicalSide = "character-left" | "character-right";

/** 독자가 바라보는 2D 캔버스 화면 기준 좌/우 */
export type ScreenSide = "screen-left" | "screen-right";

/** 카메라를 향한 캐릭터의 전·후면 포즈 분류 */
export type CameraFacingPose =
  | "front"
  | "three-quarter-front"
  | "back"
  | "three-quarter-back";

/** 회차별 상태 추적 범주 */
export type ContinuityStateCategory = "costume" | "injury-bandage" | "prop";

/** 개별 비대칭 표식의 상세 설정 */
export interface CharacterLandmarkSpec {
  readonly anatomicalSide: AnatomicalSide;
  readonly labelKo?: string;
  /** 표식이 처음 생기는 회차 (예: 12화 전투에서 얻은 흉터) */
  readonly fromEpisode?: number;
  /** 표식이 사라지는 마지막 회차 (`null` 또는 생략 시 계속 유지) */
  readonly toEpisode?: number | null;
}

export type LandmarkEntryInput = AnatomicalSide | CharacterLandmarkSpec;

/** 회차 구간 `[fromEpisode, toEpisode]` 소품·복장·부상 상태 규칙 */
export interface CharacterStateIntervalRule {
  readonly stateId: string;
  readonly category: ContinuityStateCategory;
  /** 추적 대상 식별 키 (예: `imperial-sword`, `academy-coat`, `left-arm-cast`) */
  readonly itemKey: string;
  /** 상태 태그 (예: `intact`, `broken-blade`, `reforged-blade`) */
  readonly stateTag: string;
  /** 작화가·어시스턴트용 한국어 명칭 */
  readonly labelKo: string;
  readonly fromEpisode: number;
  /** 종료 회차 (`null`이면 연재 최신화까지 계속 유효) */
  readonly toEpisode: number | null;
  /** 캐릭터 등장 시 반드시 관찰되어야 하는 필수 착용/소지 상태 여부 */
  readonly requiredWhenPresent?: boolean;
}

/** 캐릭터 1인의 비대칭 설정표 및 회차별 상태 원장 */
export interface CharacterContinuitySheet {
  readonly characterId: string;
  readonly nameKo: string;
  readonly landmarks: Readonly<Partial<Record<AsymmetricLandmarkKey, LandmarkEntryInput>>>;
  readonly timelineStates?: readonly CharacterStateIntervalRule[];
}

/** 컷 안에서 관찰된 개별 소품·복장·부상 상태 */
export interface ObservedCharacterStateItem {
  readonly category: ContinuityStateCategory;
  readonly itemKey: string;
  readonly stateTag: string;
}

/** 특정 컷에 등장한 캐릭터 1인의 관찰 데이터 */
export interface CutCharacterObservation {
  readonly characterId: string;
  readonly cameraPose: CameraFacingPose;
  /** 선택적 카메라 수평 회전각(도): `|yaw| < 90` 정면 반구, `|yaw| > 90` 후면 반구 */
  readonly cameraYawDeg?: number;
  readonly observedLandmarks?: Readonly<Partial<Record<AsymmetricLandmarkKey, ScreenSide>>>;
  readonly observedStates?: readonly ObservedCharacterStateItem[];
}

/** 원고 내 개별 컷 관찰 입력 */
export interface EpisodeCutContinuityInput {
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly cutId: string;
  /** 과거 회상 컷인 경우 실제 사건이 일어난 기준 회차 번호 */
  readonly flashbackTargetEpisode?: number;
  readonly characters: readonly CutCharacterObservation[];
}

/** 비대칭 좌우 반전 오류의 세부 원인 분류 */
export type FlipViolationKind =
  | "canvas-horizontal-flip"
  | "single-landmark-inversion"
  | "out-of-era-landmark";

/** 비대칭 랜드마크 위반 검출 내역 */
export interface LandmarkFlipFinding {
  readonly episodeNumber: number;
  readonly effectiveEpisodeNumber: number;
  readonly cutNumber: number;
  readonly cutId: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly cameraPose: CameraFacingPose;
  readonly violationKind: FlipViolationKind;
  readonly invertedLandmarks: readonly {
    readonly key: AsymmetricLandmarkKey;
    readonly labelKo: string;
    readonly anatomicalSide: AnatomicalSide;
    readonly expectedScreenSide: ScreenSide;
    readonly observedScreenSide: ScreenSide;
  }[];
  readonly observedLandmarkCount: number;
  readonly fixNoteKo: string;
}

/** 회차 타임라인 상태 오류 세부 분류 */
export type TimelineAnachronismKind =
  | "past-state-regression"
  | "future-state-spoiling"
  | "missing-required-state"
  | "unregistered-state-tag";

/** 복장·부상·소품 시대착오(Anachronism) 검출 내역 */
export interface TimelineAnachronismFinding {
  readonly episodeNumber: number;
  readonly effectiveEpisodeNumber: number;
  readonly cutNumber: number;
  readonly cutId: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly category: ContinuityStateCategory;
  readonly itemKey: string;
  readonly anachronismKind: TimelineAnachronismKind;
  readonly observedStateTag: string | null;
  readonly observedRuleLabelKo: string | null;
  readonly observedValidRangeKo: string | null;
  readonly expectedStateTag: string | null;
  readonly expectedRuleLabelKo: string | null;
  readonly expectedValidRangeKo: string | null;
  readonly fixNoteKo: string;
}

/** 원장 자체의 구간 충돌 경고 */
export interface LedgerRuleOverlapIssue {
  readonly characterId: string;
  readonly itemKey: string;
  readonly firstStateId: string;
  readonly secondStateId: string;
  readonly messageKo: string;
}

/** 다회차 연속성 감사 종합 결과 */
export interface ContinuityAuditReport {
  readonly evaluatedCutCount: number;
  readonly evaluatedCharacterAppearanceCount: number;
  readonly correctlyMatchedBackViewCount: number;
  readonly landmarkFlipFindings: readonly LandmarkFlipFinding[];
  readonly timelineAnachronismFindings: readonly TimelineAnachronismFinding[];
  readonly ledgerOverlapIssues: readonly LedgerRuleOverlapIssue[];
  readonly passed: boolean;
  readonly summaryKo: string;
}

const DEFAULT_LANDMARK_LABELS_KO: Readonly<Record<AsymmetricLandmarkKey, string>> = {
  scarSide: "흉터 위치",
  hairPartingSide: "머리 가르마 방향",
  moleSide: "점(미인점) 위치",
  monocleEye: "외알 안경(모노클) 착용 눈",
  swordSheathHip: "검집 패용 허리",
  dominantHand: "주 사용 손(무기 파지 손)",
};

const POSE_LABELS_KO: Readonly<Record<CameraFacingPose, string>> = {
  front: "정면",
  "three-quarter-front": "반측면 정면",
  back: "뒷모습(후면)",
  "three-quarter-back": "반측면 후면",
};

const ANATOMICAL_LABELS_KO: Readonly<Record<AnatomicalSide, string>> = {
  "character-left": "캐릭터 신체 좌측",
  "character-right": "캐릭터 신체 우측",
};

const SCREEN_LABELS_KO: Readonly<Record<ScreenSide, string>> = {
  "screen-left": "화면 좌측",
  "screen-right": "화면 우측",
};

const ALL_LANDMARK_KEYS: readonly AsymmetricLandmarkKey[] = [
  "scarSide",
  "hairPartingSide",
  "moleSide",
  "monocleEye",
  "swordSheathHip",
  "dominantHand",
];

function isBackFacingCamera(cameraPose: CameraFacingPose, cameraYawDeg?: number): boolean {
  if (cameraYawDeg !== undefined) {
    const rad = (cameraYawDeg * Math.PI) / 180;
    const cosYaw = Math.cos(rad);
    if (Math.abs(cosYaw) > 1e-6) {
      return cosYaw < 0;
    }
  }
  return cameraPose === "back" || cameraPose === "three-quarter-back";
}

/**
 * 해부학적 좌우(`character-left`/`character-right`)가 주어진 카메라 포즈에서
 * 독자 화면의 어느 쪽(`screen-left`/`screen-right`)에 놓여야 하는지 기하학적 패리티로 계산한다.
 *
 * - 정면 계열(`front`, `three-quarter-front`): 신체 좌측 -> 화면 우측, 신체 우측 -> 화면 좌측
 * - 후면 계열(`back`, `three-quarter-back`): 신체 좌측 -> 화면 좌측, 신체 우측 -> 화면 우측
 */
export function resolveExpectedScreenSide(
  anatomicalSide: AnatomicalSide,
  cameraPose: CameraFacingPose,
  cameraYawDeg?: number
): ScreenSide {
  const anatomicalSign = anatomicalSide === "character-left" ? -1 : 1;
  const cameraParity = isBackFacingCamera(cameraPose, cameraYawDeg) ? 1 : -1;
  const screenSign = anatomicalSign * cameraParity;
  return screenSign < 0 ? "screen-left" : "screen-right";
}

function normalizeLandmarkSpec(
  key: AsymmetricLandmarkKey,
  raw: LandmarkEntryInput
): CharacterLandmarkSpec {
  if (typeof raw === "string") {
    return {
      anatomicalSide: raw,
      labelKo: DEFAULT_LANDMARK_LABELS_KO[key],
    };
  }
  return {
    anatomicalSide: raw.anatomicalSide,
    labelKo: raw.labelKo ?? DEFAULT_LANDMARK_LABELS_KO[key],
    fromEpisode: raw.fromEpisode,
    toEpisode: raw.toEpisode,
  };
}

function isEpisodeWithinRange(
  episode: number,
  fromEpisode?: number,
  toEpisode?: number | null
): boolean {
  if (fromEpisode !== undefined && episode < fromEpisode) {
    return false;
  }
  if (toEpisode !== undefined && toEpisode !== null && episode > toEpisode) {
    return false;
  }
  return true;
}

function formatEpisodeRangeKo(fromEpisode: number, toEpisode: number | null): string {
  return toEpisode === null ? `${fromEpisode}화 이후 계속` : `${fromEpisode}~${toEpisode}화`;
}

/**
 * 캐릭터 설정 원장 내부에 동일 `itemKey`의 회차 구간이 서로 겹치는 모순이 없는지 사전 검증한다.
 */
export function validateLedgerTimelineIntervals(
  sheets: readonly CharacterContinuitySheet[]
): readonly LedgerRuleOverlapIssue[] {
  const issues: LedgerRuleOverlapIssue[] = [];

  for (const sheet of sheets) {
    const rules = sheet.timelineStates ?? [];
    for (let i = 0; i < rules.length; i++) {
      const r1 = rules[i];
      if (!r1) continue;
      for (let j = i + 1; j < rules.length; j++) {
        const r2 = rules[j];
        if (!r2 || r1.itemKey !== r2.itemKey) continue;

        const end1 = r1.toEpisode ?? Number.POSITIVE_INFINITY;
        const end2 = r2.toEpisode ?? Number.POSITIVE_INFINITY;
        const overlaps = r1.fromEpisode <= end2 && r2.fromEpisode <= end1;
        if (overlaps && r1.stateTag !== r2.stateTag) {
          issues.push({
            characterId: sheet.characterId,
            itemKey: r1.itemKey,
            firstStateId: r1.stateId,
            secondStateId: r2.stateId,
            messageKo:
              `${sheet.nameKo}의 '${r1.itemKey}' 상태 구간 '${r1.labelKo}'(${formatEpisodeRangeKo(r1.fromEpisode, r1.toEpisode)})와 ` +
              `'${r2.labelKo}'(${formatEpisodeRangeKo(r2.fromEpisode, r2.toEpisode)})가 서로 겹칩니다.`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * 다회차 원고 컷 목록을 캐릭터 연속성 원장과 대조하여
 * 좌우 반전 작화 실수와 소품·복장·부상 타임라인 역행을 전수 감사한다.
 */
export function auditCharacterContinuityLedger(
  sheets: readonly CharacterContinuitySheet[],
  cuts: readonly EpisodeCutContinuityInput[]
): ContinuityAuditReport {
  const sheetById = new Map<string, CharacterContinuitySheet>();
  for (const sheet of sheets) {
    sheetById.set(sheet.characterId, sheet);
  }

  const ledgerOverlapIssues = validateLedgerTimelineIntervals(sheets);
  const landmarkFlipFindings: LandmarkFlipFinding[] = [];
  const timelineAnachronismFindings: TimelineAnachronismFinding[] = [];

  let evaluatedCharacterAppearanceCount = 0;
  let correctlyMatchedBackViewCount = 0;

  for (const cut of cuts) {
    const effectiveEpisode = cut.flashbackTargetEpisode ?? cut.episodeNumber;
    const episodeDisplayPrefix =
      cut.flashbackTargetEpisode !== undefined
        ? `${cut.episodeNumber}화 ${cut.cutNumber}컷(회상 기준 ${effectiveEpisode}화)`
        : `${cut.episodeNumber}화 ${cut.cutNumber}컷`;

    for (const charObs of cut.characters) {
      const sheet = sheetById.get(charObs.characterId);
      if (!sheet) continue;
      evaluatedCharacterAppearanceCount += 1;

      // 1. 비대칭 랜드마크 카메라 포즈 패리티 및 좌우 반전 감사
      if (charObs.observedLandmarks) {
        const inverted: {
          readonly key: AsymmetricLandmarkKey;
          readonly labelKo: string;
          readonly anatomicalSide: AnatomicalSide;
          readonly expectedScreenSide: ScreenSide;
          readonly observedScreenSide: ScreenSide;
        }[] = [];

        const outOfEra: {
          readonly key: AsymmetricLandmarkKey;
          readonly labelKo: string;
          readonly anatomicalSide: AnatomicalSide;
          readonly expectedScreenSide: ScreenSide;
          readonly observedScreenSide: ScreenSide;
          readonly validRangeKo: string;
        }[] = [];

        let activeObservedCount = 0;

        for (const key of ALL_LANDMARK_KEYS) {
          const observedSide = charObs.observedLandmarks[key];
          const rawSpec = sheet.landmarks[key];
          if (!observedSide || !rawSpec) continue;

          const spec = normalizeLandmarkSpec(key, rawSpec);
          const expectedSide = resolveExpectedScreenSide(
            spec.anatomicalSide,
            charObs.cameraPose,
            charObs.cameraYawDeg
          );
          const labelKo = spec.labelKo ?? DEFAULT_LANDMARK_LABELS_KO[key];

          if (!isEpisodeWithinRange(effectiveEpisode, spec.fromEpisode, spec.toEpisode)) {
            outOfEra.push({
              key,
              labelKo,
              anatomicalSide: spec.anatomicalSide,
              expectedScreenSide: expectedSide,
              observedScreenSide: observedSide,
              validRangeKo: formatEpisodeRangeKo(spec.fromEpisode ?? 1, spec.toEpisode ?? null),
            });
            continue;
          }

          activeObservedCount += 1;
          if (observedSide !== expectedSide) {
            inverted.push({
              key,
              labelKo,
              anatomicalSide: spec.anatomicalSide,
              expectedScreenSide: expectedSide,
              observedScreenSide: observedSide,
            });
          }
        }

        const isBackPose = isBackFacingCamera(charObs.cameraPose, charObs.cameraYawDeg);
        if (isBackPose && activeObservedCount > 0 && inverted.length === 0) {
          correctlyMatchedBackViewCount += 1;
        }

        if (inverted.length > 0) {
          const isWholeCanvasFlip = inverted.length === activeObservedCount;
          const violationKind: FlipViolationKind = isWholeCanvasFlip
            ? "canvas-horizontal-flip"
            : "single-landmark-inversion";

          const poseKo = POSE_LABELS_KO[charObs.cameraPose];
          const joinedLabels = inverted.map((item) => `'${item.labelKo}'`).join("·");
          const firstItem = inverted[0];

          const fixNoteKo = isWholeCanvasFlip
            ? `${episodeDisplayPrefix}(${poseKo}): ${sheet.nameKo}의 비대칭 표식 ${joinedLabels}이(가) 모두 반대 방향에 그려졌습니다. ` +
              `구도 확인 중 캔버스 좌우 반전을 켜 둔 채 마감한 실수 가능성이 높으니, 캐릭터 레이어를 좌우 반전 복구하고 말풍선·효과선 방향을 재점검하세요.`
            : `${episodeDisplayPrefix}(${poseKo}): ${sheet.nameKo}의 다른 비대칭 표식은 정상이나 ${joinedLabels}만 뒤집혔습니다. ` +
              `${firstItem ? `${ANATOMICAL_LABELS_KO[firstItem.anatomicalSide]} 설정이므로 ${poseKo} 컷에서는 ${SCREEN_LABELS_KO[firstItem.expectedScreenSide]}에 오도록` : "설정표 기준 위치로"} 해당 파츠만 바로잡으세요.`;

          landmarkFlipFindings.push({
            episodeNumber: cut.episodeNumber,
            effectiveEpisodeNumber: effectiveEpisode,
            cutNumber: cut.cutNumber,
            cutId: cut.cutId,
            characterId: sheet.characterId,
            characterNameKo: sheet.nameKo,
            cameraPose: charObs.cameraPose,
            violationKind,
            invertedLandmarks: inverted,
            observedLandmarkCount: activeObservedCount,
            fixNoteKo,
          });
        }

        for (const eraItem of outOfEra) {
          landmarkFlipFindings.push({
            episodeNumber: cut.episodeNumber,
            effectiveEpisodeNumber: effectiveEpisode,
            cutNumber: cut.cutNumber,
            cutId: cut.cutId,
            characterId: sheet.characterId,
            characterNameKo: sheet.nameKo,
            cameraPose: charObs.cameraPose,
            violationKind: "out-of-era-landmark",
            invertedLandmarks: [
              {
                key: eraItem.key,
                labelKo: eraItem.labelKo,
                anatomicalSide: eraItem.anatomicalSide,
                expectedScreenSide: eraItem.expectedScreenSide,
                observedScreenSide: eraItem.observedScreenSide,
              },
            ],
            observedLandmarkCount: activeObservedCount,
            fixNoteKo:
              `${episodeDisplayPrefix}: ${sheet.nameKo}의 '${eraItem.labelKo}'은(는) 유효 회차(${eraItem.validRangeKo}) 밖의 표식입니다. ` +
              `${effectiveEpisode}화 시점 원고에서 해당 표식 레이어를 숨기세요.`,
          });
        }
      }

      // 2. 복장·부상·소품 타임라인 구간 `[fromEpisode, toEpisode]` 연속성 감사
      const rules = sheet.timelineStates ?? [];
      if (rules.length === 0) continue;

      const observedStates = charObs.observedStates ?? [];
      const observedItemKeys = new Set<string>();

      for (const obs of observedStates) {
        observedItemKeys.add(obs.itemKey);
        const itemRules = rules.filter((rule) => rule.itemKey === obs.itemKey);
        if (itemRules.length === 0) continue;

        const activeRule = itemRules.find((rule) =>
          isEpisodeWithinRange(effectiveEpisode, rule.fromEpisode, rule.toEpisode)
        );
        const matchedObservedRule = itemRules.find((rule) => rule.stateTag === obs.stateTag);

        if (activeRule && activeRule.stateTag === obs.stateTag) {
          continue;
        }

        if (!matchedObservedRule) {
          const expectedRange = activeRule
            ? formatEpisodeRangeKo(activeRule.fromEpisode, activeRule.toEpisode)
            : null;
          timelineAnachronismFindings.push({
            episodeNumber: cut.episodeNumber,
            effectiveEpisodeNumber: effectiveEpisode,
            cutNumber: cut.cutNumber,
            cutId: cut.cutId,
            characterId: sheet.characterId,
            characterNameKo: sheet.nameKo,
            category: obs.category,
            itemKey: obs.itemKey,
            anachronismKind: "unregistered-state-tag",
            observedStateTag: obs.stateTag,
            observedRuleLabelKo: null,
            observedValidRangeKo: null,
            expectedStateTag: activeRule?.stateTag ?? null,
            expectedRuleLabelKo: activeRule?.labelKo ?? null,
            expectedValidRangeKo: expectedRange,
            fixNoteKo:
              `${episodeDisplayPrefix}: ${sheet.nameKo}의 '${obs.itemKey}'에 등록되지 않은 상태 태그('${obs.stateTag}')가 사용되었습니다. ` +
              (activeRule
                ? `${effectiveEpisode}화 정규 설정인 '${activeRule.labelKo}'(${expectedRange}) 에셋으로 교체하세요.`
                : `원장에 상태 구간을 먼저 등록하세요.`),
          });
          continue;
        }

        const obsRangeKo = formatEpisodeRangeKo(
          matchedObservedRule.fromEpisode,
          matchedObservedRule.toEpisode
        );
        const expectedRangeKo = activeRule
          ? formatEpisodeRangeKo(activeRule.fromEpisode, activeRule.toEpisode)
          : null;

        const isPastRegression =
          matchedObservedRule.toEpisode !== null &&
          matchedObservedRule.toEpisode < effectiveEpisode;
        const kind: TimelineAnachronismKind = isPastRegression
          ? "past-state-regression"
          : "future-state-spoiling";

        const fixNoteKo = isPastRegression
          ? `${episodeDisplayPrefix}: ${sheet.nameKo}의 '${matchedObservedRule.labelKo}'(유효 구간 ${obsRangeKo})이(가) 다시 등장했습니다. ` +
            (activeRule
              ? `${effectiveEpisode}화 시점에는 이미 '${activeRule.labelKo}'(${expectedRangeKo}) 상태여야 하니 구버전 소품·복장 레이어를 교체하세요.`
              : `${effectiveEpisode}화 시점에는 해제된 상태이므로 제거하세요.`)
          : `${episodeDisplayPrefix}: ${sheet.nameKo}의 '${matchedObservedRule.labelKo}'(유효 구간 ${obsRangeKo})이(가) 설정 시점보다 일찍 노출되었습니다. ` +
            (activeRule
              ? `${effectiveEpisode}화 기준 상태인 '${activeRule.labelKo}'(${expectedRangeKo}) 에셋으로 되돌리세요.`
              : `도입 회차(${matchedObservedRule.fromEpisode}화) 전이므로 해당 요소를 숨기세요.`);

        timelineAnachronismFindings.push({
          episodeNumber: cut.episodeNumber,
          effectiveEpisodeNumber: effectiveEpisode,
          cutNumber: cut.cutNumber,
          cutId: cut.cutId,
          characterId: sheet.characterId,
          characterNameKo: sheet.nameKo,
          category: obs.category,
          itemKey: obs.itemKey,
          anachronismKind: kind,
          observedStateTag: obs.stateTag,
          observedRuleLabelKo: matchedObservedRule.labelKo,
          observedValidRangeKo: obsRangeKo,
          expectedStateTag: activeRule?.stateTag ?? null,
          expectedRuleLabelKo: activeRule?.labelKo ?? null,
          expectedValidRangeKo: expectedRangeKo,
          fixNoteKo,
        });
      }

      // 필수 착용·부상 상태 누락 검사
      for (const rule of rules) {
        if (
          rule.requiredWhenPresent &&
          isEpisodeWithinRange(effectiveEpisode, rule.fromEpisode, rule.toEpisode) &&
          !observedItemKeys.has(rule.itemKey)
        ) {
          const expectedRangeKo = formatEpisodeRangeKo(rule.fromEpisode, rule.toEpisode);
          timelineAnachronismFindings.push({
            episodeNumber: cut.episodeNumber,
            effectiveEpisodeNumber: effectiveEpisode,
            cutNumber: cut.cutNumber,
            cutId: cut.cutId,
            characterId: sheet.characterId,
            characterNameKo: sheet.nameKo,
            category: rule.category,
            itemKey: rule.itemKey,
            anachronismKind: "missing-required-state",
            observedStateTag: null,
            observedRuleLabelKo: null,
            observedValidRangeKo: null,
            expectedStateTag: rule.stateTag,
            expectedRuleLabelKo: rule.labelKo,
            expectedValidRangeKo: expectedRangeKo,
            fixNoteKo:
              `${episodeDisplayPrefix}: ${sheet.nameKo}에게 ${effectiveEpisode}화 필수 설정인 '${rule.labelKo}'(${expectedRangeKo})이(가) 누락되었습니다. 작화 누락 여부를 확인하세요.`,
          });
        }
      }
    }
  }

  const passed =
    landmarkFlipFindings.length === 0 &&
    timelineAnachronismFindings.length === 0 &&
    ledgerOverlapIssues.length === 0;

  const summaryKo = passed
    ? `총 ${cuts.length}컷(${evaluatedCharacterAppearanceCount}회 등장) 연속성 감사 통과: 좌우 반전 0건, 회차 설정 역행 0건.`
    : `총 ${cuts.length}컷 감사 결과 비대칭 좌우 반전 ${landmarkFlipFindings.length}건, 회차 타임라인 설정 오류 ${timelineAnachronismFindings.length}건을 검출했습니다.`;

  return {
    evaluatedCutCount: cuts.length,
    evaluatedCharacterAppearanceCount,
    correctlyMatchedBackViewCount,
    landmarkFlipFindings,
    timelineAnachronismFindings,
    ledgerOverlapIssues,
    passed,
    summaryKo,
  };
}
