/**
 * 웹툰 1~60컷+ 전 에피소드 자동 연속성 감시관(Webtoon Continuity Guard) 핵심 분석·교정 엔진.
 *
 * 4대 연속성 오류 자동 적발 및 원클릭 불변 교정 패치(`applyContinuityFix`):
 * ① 소품 증발 / 돌연 출현 (안경 · 베레모 · 귀걸이 · 시계 · 상처 · 가방)
 * ② 좌우 반전 오류 (흉터 · 가르마 · 모자 기울기 · 손목시계 등 좌↔우 뒤집힘)
 * ③ 의상·헤어 색감 급변 (OKLCH → CIE L*a*b* → CIEDE2000 ΔE00 임계치 초과, 야간/회상 씬 태그 예외 처리)
 * ④ 조명 방향 불일치 (동일 씬 내 주광원 방위각 75° 이상 급변)
 */

import {
  computeOklchDeltaE00,
  formatOklchSummary,
  normalizeAngleDeg,
  shortestAngularDiffDeg,
  type OklchColor,
} from "./continuity-color-math";
import { runBatchContinuityFixes, runSingleContinuityFix } from "./continuity-patch-engine";
import {
  CONTINUITY_PROP_META,
  mergeContinuityConfig,
  type AsymmetricSide,
  type AttachmentSide,
  type BatchContinuityFixResult,
  type CharacterAsymmetricTraits,
  type CharacterCutSnapshot,
  type CharacterPropSnapshot,
  type ContinuityCategoryCounts,
  type ContinuityExemptTransition,
  type ContinuityFixResult,
  type ContinuityGateStatus,
  type ContinuityGuardConfig,
  type ContinuityIssue,
  type ContinuityIssueCategory,
  type ContinuityIssueMetrics,
  type ContinuityIssueSubtype,
  type ContinuityPatch,
  type ContinuityPatchOperation,
  type ContinuityPropKind,
  type ContinuityScanReport,
  type ContinuitySeverity,
  type ContinuitySeverityCounts,
  type KeyLightSnapshot,
  type WebtoonCutSnapshot,
  type WebtoonEpisodeTimeline,
} from "./continuity-types";

export * from "./continuity-color-math";
export * from "./continuity-types";
export { createDemo60CutEpisode } from "./continuity-demo-episode";

interface CharacterTrackerState {
  sceneId: string;
  sceneCutNumber: number;
  sceneProps: CharacterPropSnapshot[];
  lastNonMirrorCutNumber: number;
  lastNonMirrorSceneId: string;
  lastNonMirrorProps: CharacterPropSnapshot[];
  lastNonMirrorTraits: CharacterAsymmetricTraits;
  permanentProps: Map<ContinuityPropKind, { cutNumber: number; prop: CharacterPropSnapshot }>;
  colorBaselineCutNumber: number;
  outfitColorBaseline: OklchColor;
  hairColorBaseline: OklchColor;
}

interface BuildIssueParams {
  readonly id: string;
  readonly cut: WebtoonCutSnapshot;
  readonly previousCutNumber: number;
  readonly category: ContinuityIssueCategory;
  readonly subtype: ContinuityIssueSubtype;
  readonly severity: ContinuitySeverity;
  readonly character?: CharacterCutSnapshot;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly metrics: ContinuityIssueMetrics;
  readonly patchSummaryKo: string;
  readonly patchSummaryEn: string;
  readonly operation: ContinuityPatchOperation;
}

function buildIssue(params: BuildIssueParams): ContinuityIssue {
  const { cut, character } = params;
  return {
    id: params.id,
    cutNumber: cut.cutNumber,
    previousCutNumber: params.previousCutNumber,
    sceneId: cut.sceneId,
    sceneNameKo: cut.sceneNameKo,
    sceneNameEn: cut.sceneNameEn,
    category: params.category,
    subtype: params.subtype,
    severity: params.severity,
    characterId: character?.characterId,
    characterNameKo: character?.nameKo,
    characterNameEn: character?.nameEn,
    titleKo: params.titleKo,
    titleEn: params.titleEn,
    detailKo: params.detailKo,
    detailEn: params.detailEn,
    metrics: params.metrics,
    fixPatch: {
      issueId: params.id,
      cutNumber: cut.cutNumber,
      category: params.category,
      summaryKo: params.patchSummaryKo,
      summaryEn: params.patchSummaryEn,
      operation: params.operation,
    },
  };
}

function cloneProp(prop: CharacterPropSnapshot): CharacterPropSnapshot {
  return { ...prop };
}

function cloneColor(color: OklchColor): OklchColor {
  return { l: color.l, c: color.c, h: color.h };
}

function formatSideKo(side: AttachmentSide): string {
  if (side === "left") return "좌측";
  if (side === "right") return "우측";
  if (side === "both") return "양측";
  return "중앙";
}

function formatSideEn(side: AttachmentSide): string {
  if (side === "left") return "Left";
  if (side === "right") return "Right";
  if (side === "both") return "Both";
  return "Center";
}

function isOppositeLeftRight(a?: AttachmentSide, b?: AttachmentSide): boolean {
  return (a === "left" && b === "right") || (a === "right" && b === "left");
}

function hasIntentionalPropEvent(
  cut: WebtoonCutSnapshot,
  characterId: string,
  propKind: ContinuityPropKind,
  action: "added" | "removed",
): boolean {
  if (!cut.intentionalPropEvents) return false;
  return cut.intentionalPropEvents.some(
    (ev) => ev.characterId === characterId && ev.propKind === propKind && ev.action === action,
  );
}

function matchPropInList(
  target: CharacterPropSnapshot,
  candidates: readonly CharacterPropSnapshot[],
): CharacterPropSnapshot | undefined {
  return (
    candidates.find((item) => item.id === target.id) ??
    candidates.find((item) => item.kind === target.kind)
  );
}

function flipSubtypeAndSeverity(kind: ContinuityPropKind): {
  readonly subtype: ContinuityIssueSubtype;
  readonly severity: ContinuitySeverity;
  readonly labelKo: string;
  readonly labelEn: string;
} {
  if (kind === "scar") {
    return { subtype: "scar-flip", severity: "critical", labelKo: "흉터", labelEn: "Scar" };
  }
  if (kind === "watch") {
    return { subtype: "watch-flip", severity: "warning", labelKo: "손목시계", labelEn: "Wristwatch" };
  }
  if (kind === "beret") {
    return {
      subtype: "hat-tilt-flip",
      severity: "warning",
      labelKo: "모자 기울기(베레모)",
      labelEn: "Hat Tilt (Beret)",
    };
  }
  const meta = CONTINUITY_PROP_META[kind];
  return { subtype: "prop-side-flip", severity: "warning", labelKo: meta.ko, labelEn: meta.en };
}

function checkLightingContinuity(
  cut: WebtoonCutSnapshot,
  anchor: { cutNumber: number; sceneId: string; keyLight: KeyLightSnapshot } | null,
  prevCut: WebtoonCutSnapshot | null,
  config: ContinuityGuardConfig,
  issues: ContinuityIssue[],
): { cutNumber: number; sceneId: string; keyLight: KeyLightSnapshot } {
  if (!prevCut || prevCut.sceneId !== cut.sceneId || !anchor || anchor.sceneId !== cut.sceneId) {
    return { cutNumber: cut.cutNumber, sceneId: cut.sceneId, keyLight: cut.keyLight };
  }
  if (cut.sceneTags.includes("lighting-shift-intentional")) {
    return { cutNumber: cut.cutNumber, sceneId: cut.sceneId, keyLight: cut.keyLight };
  }

  const refLight = anchor.keyLight;
  const azimuthDeltaDeg = shortestAngularDiffDeg(refLight.azimuthDeg, cut.keyLight.azimuthDeg);
  const elevationDeltaDeg = Math.abs(cut.keyLight.elevationDeg - refLight.elevationDeg);

  if (azimuthDeltaDeg < config.maxLightAzimuthJumpDeg) {
    return { cutNumber: cut.cutNumber, sceneId: cut.sceneId, keyLight: cut.keyLight };
  }

  const severity: ContinuitySeverity =
    azimuthDeltaDeg >= config.criticalLightAzimuthJumpDeg ? "critical" : "warning";
  const prevAz = Math.round(normalizeAngleDeg(refLight.azimuthDeg));
  const currAz = Math.round(normalizeAngleDeg(cut.keyLight.azimuthDeg));
  const roundedDelta = Math.round(azimuthDeltaDeg * 10) / 10;

  issues.push(
    buildIssue({
      id: `cut-${cut.cutNumber}::lighting::azimuth`,
      cut,
      previousCutNumber: anchor.cutNumber,
      category: "lighting-direction",
      subtype: "key-light-azimuth-jump",
      severity,
      titleKo: `주광원 방향 급변 (${roundedDelta}° 이탈)`,
      titleEn: `Key light azimuth jump (${roundedDelta}° shift)`,
      detailKo: `같은 씬(${cut.sceneNameKo})에서 #${anchor.cutNumber}컷(${prevAz}°) 대비 #${cut.cutNumber}컷 주광원 방위각이 ${currAz}°로 ${roundedDelta}° 급변했습니다(허용 ${config.maxLightAzimuthJumpDeg}° 미만).`,
      detailEn: `Within ${cut.sceneNameEn}, key light azimuth jumped from ${prevAz}° (Cut #${anchor.cutNumber}) to ${currAz}° (Cut #${cut.cutNumber}), a ${roundedDelta}° shift (limit < ${config.maxLightAzimuthJumpDeg}°).`,
      metrics: {
        previousAzimuthDeg: prevAz,
        currentAzimuthDeg: currAz,
        azimuthDeltaDeg: roundedDelta,
        previousElevationDeg: refLight.elevationDeg,
        currentElevationDeg: cut.keyLight.elevationDeg,
        elevationDeltaDeg: Math.round(elevationDeltaDeg * 10) / 10,
      },
      patchSummaryKo: `#${cut.cutNumber}컷 주광원을 ${prevAz}° / 고도 ${refLight.elevationDeg}°로 복원`,
      patchSummaryEn: `Restore Cut #${cut.cutNumber} key light to ${prevAz}° / elev ${refLight.elevationDeg}°`,
      operation: {
        type: "restore-key-light",
        expectedAzimuthDeg: refLight.azimuthDeg,
        expectedElevationDeg: refLight.elevationDeg,
      },
    }),
  );
  return anchor;
}

function checkPropContinuity(
  cut: WebtoonCutSnapshot,
  char: CharacterCutSnapshot,
  tracker: CharacterTrackerState,
  config: ContinuityGuardConfig,
  issues: ContinuityIssue[],
): void {
  const isMirrorCut = cut.sceneTags.includes("mirror-reflection");
  const isFlashbackCut = cut.sceneTags.includes("flashback");
  const sameScene = tracker.sceneId === cut.sceneId;

  if (sameScene) {
    const nextSceneProps: CharacterPropSnapshot[] = [];

    for (const prevProp of tracker.sceneProps) {
      const matched = matchPropInList(prevProp, char.props);
      if (matched) {
        const flipped = !isMirrorCut && isOppositeLeftRight(prevProp.side, matched.side);
        nextSceneProps.push(flipped ? cloneProp(prevProp) : cloneProp(matched));
      } else if (!hasIntentionalPropEvent(cut, char.characterId, prevProp.kind, "removed")) {
        nextSceneProps.push(cloneProp(prevProp));
        const meta = CONTINUITY_PROP_META[prevProp.kind];
        issues.push(
          buildIssue({
            id: `cut-${cut.cutNumber}::${char.characterId}::prop-vanished::${prevProp.id}`,
            cut,
            previousCutNumber: tracker.sceneCutNumber,
            category: "prop-continuity",
            subtype: "prop-vanished",
            severity: meta.missingSeverity,
            character: char,
            titleKo: `${char.nameKo} · ${prevProp.labelKo} 소품 증발`,
            titleEn: `${char.nameEn} · ${prevProp.labelEn} vanished`,
            detailKo: `#${tracker.sceneCutNumber}컷에서 착용 중이던 ${prevProp.labelKo}(${meta.ko})가 같은 씬 #${cut.cutNumber}컷에서 이유 없이 사라졌습니다.`,
            detailEn: `${prevProp.labelEn} (${meta.en}) worn in Cut #${tracker.sceneCutNumber} disappeared without a story cue in Cut #${cut.cutNumber}.`,
            metrics: {
              propKind: prevProp.kind,
              propLabelKo: prevProp.labelKo,
              propLabelEn: prevProp.labelEn,
              previousSide: prevProp.side,
            },
            patchSummaryKo: `#${cut.cutNumber}컷 ${char.nameKo}에게 ${prevProp.labelKo} 복원`,
            patchSummaryEn: `Restore ${prevProp.labelEn} on ${char.nameEn} in Cut #${cut.cutNumber}`,
            operation: { type: "restore-prop", characterId: char.characterId, prop: cloneProp(prevProp) },
          }),
        );
      }
    }

    for (const currProp of char.props) {
      if (matchPropInList(currProp, tracker.sceneProps)) continue;
      if (hasIntentionalPropEvent(cut, char.characterId, currProp.kind, "added")) {
        nextSceneProps.push(cloneProp(currProp));
        continue;
      }
      const meta = CONTINUITY_PROP_META[currProp.kind];
      issues.push(
        buildIssue({
          id: `cut-${cut.cutNumber}::${char.characterId}::prop-sudden::${currProp.id}`,
          cut,
          previousCutNumber: tracker.sceneCutNumber,
          category: "prop-continuity",
          subtype: "prop-sudden-appearance",
          severity: meta.missingSeverity,
          character: char,
          titleKo: `${char.nameKo} · ${currProp.labelKo} 돌연 출현`,
          titleEn: `${char.nameEn} · ${currProp.labelEn} appeared suddenly`,
          detailKo: `#${tracker.sceneCutNumber}컷에 없던 ${currProp.labelKo}(${meta.ko})가 같은 씬 #${cut.cutNumber}컷에 착용 이벤트 없이 갑작스레 등장했습니다.`,
          detailEn: `${currProp.labelEn} (${meta.en}) was absent in Cut #${tracker.sceneCutNumber} but appeared abruptly in Cut #${cut.cutNumber}.`,
          metrics: {
            propKind: currProp.kind,
            propLabelKo: currProp.labelKo,
            propLabelEn: currProp.labelEn,
            currentSide: currProp.side,
          },
          patchSummaryKo: `#${cut.cutNumber}컷 ${char.nameKo}의 ${currProp.labelKo} 제거`,
          patchSummaryEn: `Remove unexpected ${currProp.labelEn} from ${char.nameEn} in Cut #${cut.cutNumber}`,
          operation: {
            type: "remove-prop",
            characterId: char.characterId,
            propKind: currProp.kind,
            propId: currProp.id,
          },
        }),
      );
    }

    tracker.sceneProps = nextSceneProps;
    tracker.sceneCutNumber = cut.cutNumber;
  } else {
    if (!isFlashbackCut) {
      for (const permKind of config.crossScenePermanentProps) {
        const existingPerm = tracker.permanentProps.get(permKind);
        if (
          !existingPerm ||
          char.props.some((p) => p.kind === permKind) ||
          hasIntentionalPropEvent(cut, char.characterId, permKind, "removed")
        ) {
          continue;
        }
        const prevProp = existingPerm.prop;
        const meta = CONTINUITY_PROP_META[permKind];
        issues.push(
          buildIssue({
            id: `cut-${cut.cutNumber}::${char.characterId}::prop-vanished-perm::${prevProp.id}`,
            cut,
            previousCutNumber: existingPerm.cutNumber,
            category: "prop-continuity",
            subtype: "prop-vanished",
            severity: "critical",
            character: char,
            titleKo: `${char.nameKo} · 영구 표식(${prevProp.labelKo}) 누락`,
            titleEn: `${char.nameEn} · Permanent mark (${prevProp.labelEn}) missing`,
            detailKo: `#${existingPerm.cutNumber}컷부터 유지되던 ${prevProp.labelKo}(${meta.ko})가 씬 전환 후 #${cut.cutNumber}컷에서 누락되었습니다.`,
            detailEn: `Permanent ${prevProp.labelEn} (${meta.en}) from Cut #${existingPerm.cutNumber} is missing after scene change in Cut #${cut.cutNumber}.`,
            metrics: {
              propKind: prevProp.kind,
              propLabelKo: prevProp.labelKo,
              propLabelEn: prevProp.labelEn,
              previousSide: prevProp.side,
            },
            patchSummaryKo: `#${cut.cutNumber}컷 ${char.nameKo}에게 ${prevProp.labelKo} 복원`,
            patchSummaryEn: `Restore ${prevProp.labelEn} on ${char.nameEn} in Cut #${cut.cutNumber}`,
            operation: { type: "restore-prop", characterId: char.characterId, prop: cloneProp(prevProp) },
          }),
        );
      }
    }

    tracker.sceneId = cut.sceneId;
    tracker.sceneCutNumber = cut.cutNumber;
    tracker.sceneProps = char.props.map(cloneProp);
  }

  if (!isFlashbackCut) {
    for (const prop of char.props) {
      if (config.crossScenePermanentProps.includes(prop.kind) && !tracker.permanentProps.has(prop.kind)) {
        tracker.permanentProps.set(prop.kind, { cutNumber: cut.cutNumber, prop: cloneProp(prop) });
      }
    }
  }
}

function checkLeftRightFlipContinuity(
  cut: WebtoonCutSnapshot,
  char: CharacterCutSnapshot,
  tracker: CharacterTrackerState,
  config: ContinuityGuardConfig,
  issues: ContinuityIssue[],
): void {
  if (cut.sceneTags.includes("mirror-reflection")) return;

  const isFlashbackCut = cut.sceneTags.includes("flashback");
  const isCostumeChangeCut = cut.sceneTags.includes("costume-change");
  const sameNonMirrorScene = tracker.lastNonMirrorSceneId === cut.sceneId;
  let hatTiltFlippedByProp = false;
  const nextNonMirrorProps: CharacterPropSnapshot[] = [];

  for (const currProp of char.props) {
    const prevProp = matchPropInList(currProp, tracker.lastNonMirrorProps);
    const meta = CONTINUITY_PROP_META[currProp.kind];
    const shouldCheckCrossScene = meta.crossSceneFlipCheck && !isFlashbackCut && !isCostumeChangeCut;

    if (
      prevProp &&
      (sameNonMirrorScene || shouldCheckCrossScene) &&
      prevProp.side &&
      currProp.side &&
      isOppositeLeftRight(prevProp.side, currProp.side)
    ) {
      const flipInfo = flipSubtypeAndSeverity(currProp.kind);
      if (flipInfo.subtype === "hat-tilt-flip") hatTiltFlippedByProp = true;
      issues.push(
        buildIssue({
          id: `cut-${cut.cutNumber}::${char.characterId}::flip-prop::${currProp.id}`,
          cut,
          previousCutNumber: tracker.lastNonMirrorCutNumber,
          category: "left-right-flip",
          subtype: flipInfo.subtype,
          severity: flipInfo.severity,
          character: char,
          titleKo: `${char.nameKo} · ${flipInfo.labelKo} 좌우 반전`,
          titleEn: `${char.nameEn} · ${flipInfo.labelEn} flipped L↔R`,
          detailKo: `#${tracker.lastNonMirrorCutNumber}컷에서 ${formatSideKo(prevProp.side)}이던 ${currProp.labelKo}가 #${cut.cutNumber}컷에서 ${formatSideKo(currProp.side)}으로 뒤집혔습니다.`,
          detailEn: `${currProp.labelEn} moved from ${formatSideEn(prevProp.side)} (Cut #${tracker.lastNonMirrorCutNumber}) to ${formatSideEn(currProp.side)} (Cut #${cut.cutNumber}).`,
          metrics: {
            propKind: currProp.kind,
            propLabelKo: currProp.labelKo,
            propLabelEn: currProp.labelEn,
            previousSide: prevProp.side,
            currentSide: currProp.side,
          },
          patchSummaryKo: `#${cut.cutNumber}컷 ${char.nameKo} ${currProp.labelKo} 위치를 ${formatSideKo(prevProp.side)}으로 복원`,
          patchSummaryEn: `Restore ${char.nameEn}'s ${currProp.labelEn} to ${formatSideEn(prevProp.side)} in Cut #${cut.cutNumber}`,
          operation: {
            type: "restore-prop-side",
            characterId: char.characterId,
            propKind: currProp.kind,
            propId: currProp.id,
            expectedSide: prevProp.side,
          },
        }),
      );
      nextNonMirrorProps.push(cloneProp(prevProp));
    } else {
      nextNonMirrorProps.push(cloneProp(currProp));
    }
  }

  for (const prevProp of tracker.lastNonMirrorProps) {
    if (
      config.crossScenePermanentProps.includes(prevProp.kind) &&
      !nextNonMirrorProps.some((p) => p.kind === prevProp.kind)
    ) {
      nextNonMirrorProps.push(cloneProp(prevProp));
    }
  }

  const nextTraits: { hairPartSide?: AsymmetricSide; hatTiltSide?: AsymmetricSide } = {
    ...tracker.lastNonMirrorTraits,
  };
  const traitChecks: readonly {
    readonly key: "hairPartSide" | "hatTiltSide";
    readonly subtype: "hair-part-flip" | "hat-tilt-flip";
    readonly severity: ContinuitySeverity;
    readonly labelKo: string;
    readonly labelEn: string;
    readonly skip: boolean;
  }[] = [
    {
      key: "hairPartSide",
      subtype: "hair-part-flip",
      severity: "critical",
      labelKo: "가르마",
      labelEn: "Hair part",
      skip: false,
    },
    {
      key: "hatTiltSide",
      subtype: "hat-tilt-flip",
      severity: "warning",
      labelKo: "모자 기울기",
      labelEn: "Hat tilt",
      skip: hatTiltFlippedByProp,
    },
  ];

  for (const trait of traitChecks) {
    const currVal = char.asymmetricTraits?.[trait.key];
    const prevVal = tracker.lastNonMirrorTraits[trait.key];
    if (
      currVal &&
      prevVal &&
      !trait.skip &&
      !isCostumeChangeCut &&
      isOppositeLeftRight(prevVal, currVal)
    ) {
      issues.push(
        buildIssue({
          id: `cut-${cut.cutNumber}::${char.characterId}::flip-trait::${trait.key}`,
          cut,
          previousCutNumber: tracker.lastNonMirrorCutNumber,
          category: "left-right-flip",
          subtype: trait.subtype,
          severity: trait.severity,
          character: char,
          titleKo: `${char.nameKo} · ${trait.labelKo} 좌우 반전`,
          titleEn: `${char.nameEn} · ${trait.labelEn} flipped L↔R`,
          detailKo: `#${tracker.lastNonMirrorCutNumber}컷 기준 ${formatSideKo(prevVal)} ${trait.labelKo}가 #${cut.cutNumber}컷에서 ${formatSideKo(currVal)}으로 뒤집혔습니다.`,
          detailEn: `${trait.labelEn} flipped from ${formatSideEn(prevVal)} (Cut #${tracker.lastNonMirrorCutNumber}) to ${formatSideEn(currVal)} (Cut #${cut.cutNumber}).`,
          metrics: { previousSide: prevVal, currentSide: currVal },
          patchSummaryKo: `#${cut.cutNumber}컷 ${char.nameKo} ${trait.labelKo}를 ${formatSideKo(prevVal)}으로 복원`,
          patchSummaryEn: `Restore ${char.nameEn}'s ${trait.labelEn.toLowerCase()} to ${formatSideEn(prevVal)} in Cut #${cut.cutNumber}`,
          operation: {
            type: "restore-trait-side",
            characterId: char.characterId,
            trait: trait.key,
            expectedSide: prevVal,
          },
        }),
      );
    } else if (currVal) {
      nextTraits[trait.key] = currVal;
    }
  }

  tracker.lastNonMirrorProps = nextNonMirrorProps;
  tracker.lastNonMirrorTraits = nextTraits;
  tracker.lastNonMirrorCutNumber = cut.cutNumber;
  tracker.lastNonMirrorSceneId = cut.sceneId;
}

function checkColorContinuity(
  cut: WebtoonCutSnapshot,
  char: CharacterCutSnapshot,
  tracker: CharacterTrackerState,
  config: ContinuityGuardConfig,
  issues: ContinuityIssue[],
  exempted: ContinuityExemptTransition[],
): void {
  const matchedTags = cut.sceneTags.filter((tag) => config.colorShiftExemptSceneTags.includes(tag));
  const outfitDeltaE00 = computeOklchDeltaE00(tracker.outfitColorBaseline, char.outfitColor);
  const hairDeltaE00 = computeOklchDeltaE00(tracker.hairColorBaseline, char.hairColor);

  if (matchedTags.length > 0) {
    if (
      outfitDeltaE00 >= config.outfitDeltaE00Threshold ||
      hairDeltaE00 >= config.hairDeltaE00Threshold
    ) {
      exempted.push({
        cutNumber: cut.cutNumber,
        referenceCutNumber: tracker.colorBaselineCutNumber,
        characterId: char.characterId,
        characterNameKo: char.nameKo,
        characterNameEn: char.nameEn,
        matchedTags,
        outfitDeltaE00: Math.round(outfitDeltaE00 * 100) / 100,
        hairDeltaE00: Math.round(hairDeltaE00 * 100) / 100,
      });
    }
    if (cut.sceneTags.includes("costume-change")) {
      tracker.outfitColorBaseline = cloneColor(char.outfitColor);
      tracker.colorBaselineCutNumber = cut.cutNumber;
    }
    return;
  }

  const slots: readonly {
    readonly slot: "outfit" | "hair";
    readonly subtype: "outfit-color-shift" | "hair-color-shift";
    readonly labelKo: string;
    readonly labelEn: string;
    readonly delta: number;
    readonly threshold: number;
    readonly criticalThreshold: number;
    readonly prevColor: OklchColor;
    readonly currColor: OklchColor;
  }[] = [
    {
      slot: "outfit",
      subtype: "outfit-color-shift",
      labelKo: "의상",
      labelEn: "Outfit",
      delta: outfitDeltaE00,
      threshold: config.outfitDeltaE00Threshold,
      criticalThreshold: config.outfitCriticalDeltaE00,
      prevColor: tracker.outfitColorBaseline,
      currColor: char.outfitColor,
    },
    {
      slot: "hair",
      subtype: "hair-color-shift",
      labelKo: "헤어",
      labelEn: "Hair",
      delta: hairDeltaE00,
      threshold: config.hairDeltaE00Threshold,
      criticalThreshold: config.hairCriticalDeltaE00,
      prevColor: tracker.hairColorBaseline,
      currColor: char.hairColor,
    },
  ];

  let allClean = true;
  for (const s of slots) {
    if (s.delta >= s.threshold) {
      allClean = false;
      const roundedDelta = Math.round(s.delta * 100) / 100;
      const severity: ContinuitySeverity = s.delta >= s.criticalThreshold ? "critical" : "warning";
      issues.push(
        buildIssue({
          id: `cut-${cut.cutNumber}::${char.characterId}::color::${s.slot}`,
          cut,
          previousCutNumber: tracker.colorBaselineCutNumber,
          category: "color-shift",
          subtype: s.subtype,
          severity,
          character: char,
          titleKo: `${char.nameKo} · ${s.labelKo} 색감 급변 (ΔE00 ${roundedDelta.toFixed(1)})`,
          titleEn: `${char.nameEn} · ${s.labelEn} color shift (ΔE00 ${roundedDelta.toFixed(1)})`,
          detailKo: `#${tracker.colorBaselineCutNumber}컷(${formatOklchSummary(s.prevColor)}) 대비 #${cut.cutNumber}컷 ${s.labelKo} OKLCH 색차가 ΔE00 ${roundedDelta.toFixed(2)}로 임계치(${s.threshold})를 초과했습니다.`,
          detailEn: `${s.labelEn} OKLCH shifted from Cut #${tracker.colorBaselineCutNumber} (${formatOklchSummary(s.prevColor)}) by ΔE00 ${roundedDelta.toFixed(2)} in Cut #${cut.cutNumber} (limit ${s.threshold}).`,
          metrics: {
            colorSlot: s.slot,
            previousColor: cloneColor(s.prevColor),
            currentColor: cloneColor(s.currColor),
            deltaE00: roundedDelta,
            thresholdDeltaE00: s.threshold,
          },
          patchSummaryKo: `#${cut.cutNumber}컷 ${char.nameKo} ${s.labelKo} 색을 #${tracker.colorBaselineCutNumber}컷 OKLCH로 교정`,
          patchSummaryEn: `Restore ${char.nameEn}'s ${s.slot} OKLCH in Cut #${cut.cutNumber} to Cut #${tracker.colorBaselineCutNumber}`,
          operation: {
            type: "restore-color",
            characterId: char.characterId,
            slot: s.slot,
            expectedColor: cloneColor(s.prevColor),
          },
        }),
      );
    } else if (s.slot === "outfit") {
      tracker.outfitColorBaseline = cloneColor(s.currColor);
    } else {
      tracker.hairColorBaseline = cloneColor(s.currColor);
    }
  }

  if (allClean) {
    tracker.colorBaselineCutNumber = cut.cutNumber;
  }
}

function computeContinuityScore(
  totalCuts: number,
  countsBySeverity: ContinuitySeverityCounts,
): number {
  if (totalCuts <= 0) return 100;
  const penalty =
    countsBySeverity.critical * 12 + countsBySeverity.warning * 6 + countsBySeverity.minor * 2;
  return Math.max(0, Math.min(100, 100 - penalty));
}

/**
 * 1컷~60컷+ 웹툰 타임라인 스냅샷을 스캔해 4대 연속성 오류와 원클릭 교정 패치를 산출한다.
 */
export function analyzeEpisodeContinuity(
  episode: WebtoonEpisodeTimeline,
  partialConfig?: Partial<ContinuityGuardConfig>,
): ContinuityScanReport {
  const config = mergeContinuityConfig(partialConfig);
  const sortedCuts = [...episode.cuts].sort((a, b) => a.cutNumber - b.cutNumber);
  const issues: ContinuityIssue[] = [];
  const exemptedColorTransitions: ContinuityExemptTransition[] = [];
  const trackers = new Map<string, CharacterTrackerState>();

  let prevCut: WebtoonCutSnapshot | null = null;
  let sceneLightAnchor: { cutNumber: number; sceneId: string; keyLight: KeyLightSnapshot } | null =
    null;

  for (const cut of sortedCuts) {
    sceneLightAnchor = checkLightingContinuity(cut, sceneLightAnchor, prevCut, config, issues);

    const isFlashbackCut = cut.sceneTags.includes("flashback");
    for (const char of cut.characters) {
      const tracker = trackers.get(char.characterId);
      if (!tracker) {
        const permanentProps = new Map<
          ContinuityPropKind,
          { cutNumber: number; prop: CharacterPropSnapshot }
        >();
        if (!isFlashbackCut) {
          for (const prop of char.props) {
            if (config.crossScenePermanentProps.includes(prop.kind)) {
              permanentProps.set(prop.kind, { cutNumber: cut.cutNumber, prop: cloneProp(prop) });
            }
          }
        }
        trackers.set(char.characterId, {
          sceneId: cut.sceneId,
          sceneCutNumber: cut.cutNumber,
          sceneProps: char.props.map(cloneProp),
          lastNonMirrorCutNumber: cut.cutNumber,
          lastNonMirrorSceneId: cut.sceneId,
          lastNonMirrorProps: char.props.map(cloneProp),
          lastNonMirrorTraits: { ...char.asymmetricTraits },
          permanentProps,
          colorBaselineCutNumber: cut.cutNumber,
          outfitColorBaseline: cloneColor(char.outfitColor),
          hairColorBaseline: cloneColor(char.hairColor),
        });
        continue;
      }

      checkPropContinuity(cut, char, tracker, config, issues);
      checkLeftRightFlipContinuity(cut, char, tracker, config, issues);
      checkColorContinuity(cut, char, tracker, config, issues, exemptedColorTransitions);
    }

    prevCut = cut;
  }

  const countsByCategory: ContinuityCategoryCounts = {
    "prop-continuity": 0,
    "left-right-flip": 0,
    "color-shift": 0,
    "lighting-direction": 0,
  };
  const countsBySeverity: ContinuitySeverityCounts = { critical: 0, warning: 0, minor: 0 };
  const issuesByCutMutable: Record<number, ContinuityIssue[]> = {};

  for (const issue of issues) {
    (countsByCategory as Record<ContinuityIssueCategory, number>)[issue.category] += 1;
    (countsBySeverity as Record<ContinuitySeverity, number>)[issue.severity] += 1;
    const bucket = issuesByCutMutable[issue.cutNumber];
    if (bucket) bucket.push(issue);
    else issuesByCutMutable[issue.cutNumber] = [issue];
  }

  const score = computeContinuityScore(sortedCuts.length, countsBySeverity);
  const status: ContinuityGateStatus =
    countsBySeverity.critical > 0
      ? "fail"
      : countsBySeverity.warning > 0 || countsBySeverity.minor > 0
        ? "warn"
        : "pass";
  const firstCut = sortedCuts[0]?.cutNumber ?? 0;
  const lastCut = sortedCuts[sortedCuts.length - 1]?.cutNumber ?? 0;

  return {
    episodeId: episode.episodeId,
    episodeTitleKo: episode.titleKo,
    episodeTitleEn: episode.titleEn,
    totalCuts: sortedCuts.length,
    scannedCutRange: [firstCut, lastCut],
    score,
    status,
    issues,
    countsByCategory,
    countsBySeverity,
    exemptedColorTransitions,
    issuesByCut: issuesByCutMutable,
  };
}

/**
 * 단일 연속성 오류(또는 패치)를 원본 에피소드 변이 없이 불변으로 자동 교정하고 재스캔 리포트를 반환한다.
 */
export function applyContinuityFix(
  episode: WebtoonEpisodeTimeline,
  issueOrPatch: ContinuityIssue | ContinuityPatch,
  partialConfig?: Partial<ContinuityGuardConfig>,
): ContinuityFixResult {
  return runSingleContinuityFix(episode, issueOrPatch, analyzeEpisodeContinuity, partialConfig);
}

/**
 * 에피소드 내 적발된 모든 연속성 오류를 컷 순서대로 일괄 자동 교정한다.
 */
export function applyAllContinuityFixes(
  episode: WebtoonEpisodeTimeline,
  partialConfig?: Partial<ContinuityGuardConfig>,
): BatchContinuityFixResult {
  return runBatchContinuityFixes(episode, analyzeEpisodeContinuity, partialConfig);
}
