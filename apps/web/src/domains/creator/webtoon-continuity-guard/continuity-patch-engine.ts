/**
 * 웹툰 연속성 감시관 원클릭 자동 교정 패치 엔진.
 *
 * - 원본 에피소드/컷/캐릭터 객체를 절대 변이하지 않고 불변 패치를 적용한다.
 * - 단건 교정(`applyContinuityFix`)과 전체 컷 순차 일괄 교정(`applyAllContinuityFixes`)을 제공한다.
 */

import { normalizeAngleDeg, type OklchColor } from "./continuity-color-math";
import type {
  BatchContinuityFixResult,
  CharacterPropSnapshot,
  ContinuityFixResult,
  ContinuityGuardConfig,
  ContinuityIssue,
  ContinuityPatch,
  ContinuityScanReport,
  WebtoonCutSnapshot,
  WebtoonEpisodeTimeline,
} from "./continuity-types";

function cloneProp(prop: CharacterPropSnapshot): CharacterPropSnapshot {
  return { ...prop };
}

function cloneColor(color: OklchColor): OklchColor {
  return { l: color.l, c: color.c, h: color.h };
}

function isContinuityIssue(value: ContinuityIssue | ContinuityPatch): value is ContinuityIssue {
  return "fixPatch" in value;
}

/** 단일 컷 스냅샷에 교정 패치를 불변 적용한다. */
export function applyPatchToCut(
  cut: WebtoonCutSnapshot,
  patch: ContinuityPatch,
): { readonly cut: WebtoonCutSnapshot; readonly applied: boolean } {
  const op = patch.operation;
  if (op.type === "restore-key-light") {
    return {
      applied: true,
      cut: {
        ...cut,
        keyLight: {
          azimuthDeg: normalizeAngleDeg(op.expectedAzimuthDeg),
          elevationDeg: op.expectedElevationDeg,
        },
      },
    };
  }

  let applied = false;
  const nextCharacters = cut.characters.map((char) => {
    if (char.characterId !== op.characterId) return char;

    if (op.type === "restore-prop") {
      const exists = char.props.some((p) => p.id === op.prop.id || p.kind === op.prop.kind);
      applied = true;
      if (exists) {
        return {
          ...char,
          props: char.props.map((p) =>
            p.id === op.prop.id || p.kind === op.prop.kind ? cloneProp(op.prop) : p,
          ),
        };
      }
      return { ...char, props: [...char.props, cloneProp(op.prop)] };
    }

    if (op.type === "remove-prop") {
      const filtered = char.props.filter((p) =>
        op.propId ? p.id !== op.propId : p.kind !== op.propKind,
      );
      if (filtered.length !== char.props.length) {
        applied = true;
        return { ...char, props: filtered };
      }
      return char;
    }

    if (op.type === "restore-prop-side") {
      let propUpdated = false;
      const nextProps = char.props.map((p) => {
        const matches = op.propId ? p.id === op.propId : p.kind === op.propKind;
        if (!matches) return p;
        propUpdated = true;
        return { ...p, side: op.expectedSide };
      });
      if (!propUpdated) return char;
      applied = true;
      return { ...char, props: nextProps };
    }

    if (op.type === "restore-trait-side") {
      applied = true;
      return {
        ...char,
        asymmetricTraits: {
          ...char.asymmetricTraits,
          [op.trait]: op.expectedSide,
        },
      };
    }

    if (op.type === "restore-color") {
      applied = true;
      return op.slot === "outfit"
        ? { ...char, outfitColor: cloneColor(op.expectedColor) }
        : { ...char, hairColor: cloneColor(op.expectedColor) };
    }

    return char;
  });

  return applied ? { applied: true, cut: { ...cut, characters: nextCharacters } } : { cut, applied: false };
}

/**
 * 단일 연속성 오류(또는 패치)를 불변 적용하고 전달된 스캐너로 최신 리포트를 계산한다.
 */
export function runSingleContinuityFix(
  episode: WebtoonEpisodeTimeline,
  issueOrPatch: ContinuityIssue | ContinuityPatch,
  scan: (
    ep: WebtoonEpisodeTimeline,
    cfg?: Partial<ContinuityGuardConfig>,
  ) => ContinuityScanReport,
  partialConfig?: Partial<ContinuityGuardConfig>,
): ContinuityFixResult {
  const patch = isContinuityIssue(issueOrPatch) ? issueOrPatch.fixPatch : issueOrPatch;
  let applied = false;

  const nextCuts = episode.cuts.map((cut) => {
    if (cut.cutNumber !== patch.cutNumber) return cut;
    const res = applyPatchToCut(cut, patch);
    if (res.applied) {
      applied = true;
      return res.cut;
    }
    return cut;
  });

  const nextEpisode: WebtoonEpisodeTimeline = applied ? { ...episode, cuts: nextCuts } : episode;
  const report = scan(nextEpisode, partialConfig);

  return {
    episode: nextEpisode,
    applied,
    issueId: patch.issueId,
    cutNumber: patch.cutNumber,
    descriptionKo: patch.summaryKo,
    descriptionEn: patch.summaryEn,
    report,
  };
}

/**
 * 에피소드 내 적발된 모든 연속성 오류를 컷 순서대로 일괄 자동 교정한다.
 */
export function runBatchContinuityFixes(
  episode: WebtoonEpisodeTimeline,
  scan: (
    ep: WebtoonEpisodeTimeline,
    cfg?: Partial<ContinuityGuardConfig>,
  ) => ContinuityScanReport,
  partialConfig?: Partial<ContinuityGuardConfig>,
): BatchContinuityFixResult {
  const initialReport = scan(episode, partialConfig);
  let currentEpisode = episode;
  let currentReport = initialReport;
  const appliedPatches: ContinuityPatch[] = [];
  const maxIterations = Math.max(120, episode.cuts.length * 4);

  for (let step = 0; step < maxIterations; step += 1) {
    const nextIssue = currentReport.issues[0];
    if (!nextIssue) break;

    const fixResult = runSingleContinuityFix(currentEpisode, nextIssue, scan, partialConfig);
    if (!fixResult.applied) break;

    appliedPatches.push(nextIssue.fixPatch);
    currentEpisode = fixResult.episode;
    currentReport = fixResult.report;
  }

  return {
    episode: currentEpisode,
    appliedPatches,
    initialIssueCount: initialReport.issues.length,
    remainingIssueCount: currentReport.issues.length,
    report: currentReport,
  };
}
