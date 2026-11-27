/**
 * Wave-34: 세로 스크롤 웹툰 시선 유도 살리언시(Saliency) 및 여백(Gutter) 페이싱 코치.
 *
 * - 모바일 뷰포트(기본 `390x844`) 기준 말풍선·캐릭터 초점 앵커·액션 벡터 간 독자 도약 안구운동(Saccade) 경로 모델링
 * - 역방향 읽기 유도 위반(`vertical-bottom-to-top`, `horizontal-against-flow`) 정밀 탐지
 * - 한 화면(`1 screenful`) 내 인지 과부하(말풍선 `> 3`개, 과다 대사 글자 수, 과밀 인물 초점) 진단
 * - 서사 비트(`dramatic-cliffhanger` vs `fast-action` 등)별 최적 세로 컷 여백(`recommendedGutterPx`) 산출
 */

export interface MobileScrollViewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

export const DEFAULT_MOBILE_SCROLL_VIEWPORT: MobileScrollViewport = {
  widthPx: 390,
  heightPx: 844,
};

export const DEFAULT_MAX_BALLOONS_PER_SCREENFUL = 3;
export const DEFAULT_MAX_CHARACTERS_PER_SCREENFUL = 120;
export const DEFAULT_MAX_FOCAL_ANCHORS_PER_SCREENFUL = 4;

export type NarrativeBeatKind =
  | "fast-action"
  | "dialogue-exchange"
  | "emotional-beat"
  | "scene-transition"
  | "dramatic-cliffhanger";

export interface SpeechBalloonNode {
  readonly id: string;
  readonly readingOrder: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly characterCount?: number;
  readonly emphasis?: "normal" | "shout" | "whisper" | "monologue";
}

export interface CharacterFocalAnchor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly saliencyWeight?: number;
  readonly gazeVector?: { readonly dx: number; readonly dy: number };
}

export interface ActionMotionVector {
  readonly id: string;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly intensity?: number;
}

export interface EpisodeScrollPanel {
  readonly id: string;
  readonly topY: number;
  readonly heightPx: number;
  readonly widthPx?: number;
  readonly beatKind: NarrativeBeatKind;
  readonly currentGutterAfterPx?: number;
  readonly balloons?: readonly SpeechBalloonNode[];
  readonly focalAnchors?: readonly CharacterFocalAnchor[];
  readonly actionVectors?: readonly ActionMotionVector[];
}

export interface EpisodeScrollPacingInput {
  readonly panels: readonly EpisodeScrollPanel[];
  readonly viewport?: MobileScrollViewport;
  readonly readingDirection?: "ltr" | "rtl";
  readonly maxBalloonsPerScreenful?: number;
  readonly maxCharactersPerScreenful?: number;
  readonly maxFocalAnchorsPerScreenful?: number;
}

export type SaccadeWaypointKind = "speech-balloon" | "character-focal" | "action-vector";

export interface SaccadeWaypoint {
  readonly id: string;
  readonly panelId: string;
  readonly kind: SaccadeWaypointKind;
  readonly x: number;
  readonly y: number;
  readonly saliencyWeight: number;
}

export interface SaccadeTransition {
  readonly fromId: string;
  readonly toId: string;
  readonly dx: number;
  readonly dy: number;
  readonly distancePx: number;
  readonly isUpwardRegression: boolean;
}

export type ReverseReadingViolationKind = "vertical-bottom-to-top" | "horizontal-against-flow";

export interface ReverseReadingViolation {
  readonly panelId: string;
  readonly earlierBalloonId: string;
  readonly laterBalloonId: string;
  readonly kind: ReverseReadingViolationKind;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly messageKo: string;
}

export type CognitiveOverloadReason =
  | "excessive-balloons"
  | "excessive-text-characters"
  | "excessive-character-anchors";

export interface ScreenfulOverloadDiagnostic {
  readonly windowTopY: number;
  readonly windowBottomY: number;
  readonly balloonCount: number;
  readonly totalCharacterCount: number;
  readonly focalAnchorCount: number;
  readonly balloonIds: readonly string[];
  readonly reasons: readonly CognitiveOverloadReason[];
  readonly messageKo: string;
}

export type GutterPacingIssue =
  | "optimal"
  | "too-cramped-for-suspense"
  | "too-wide-breaks-action"
  | "needs-adjustment";

export interface PanelGutterRecommendation {
  readonly panelId: string;
  readonly beatKind: NarrativeBeatKind;
  readonly currentGutterPx: number;
  readonly recommendedGutterPx: number;
  readonly gutterDeltaPx: number;
  readonly pacingIssue: GutterPacingIssue;
  readonly coachingNoteKo: string;
}

export interface EpisodeScrollPacingReport {
  readonly viewport: MobileScrollViewport;
  readonly saccadeWaypoints: readonly SaccadeWaypoint[];
  readonly saccadeTransitions: readonly SaccadeTransition[];
  readonly meanSaccadeDistancePx: number;
  readonly downwardFlowRatio: number;
  readonly reverseReadingViolations: readonly ReverseReadingViolation[];
  readonly cognitiveOverloadWindows: readonly ScreenfulOverloadDiagnostic[];
  readonly gutterRecommendations: readonly PanelGutterRecommendation[];
  readonly overallPacingScore: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min) return min;
  return value > max ? max : value;
}

/** 패널 내부 말풍선 쌍의 읽기 순서 역행(상하 역전 및 좌우 흐름 역행)을 탐지한다. */
export function detectReverseReadingViolations(
  panels: readonly EpisodeScrollPanel[],
  readingDirection: "ltr" | "rtl" = "ltr",
): ReverseReadingViolation[] {
  const violations: ReverseReadingViolation[] = [];
  const verticalTolPx = 24;
  const sameRowBandPx = 56;
  const horizontalTolPx = 28;

  for (const panel of panels) {
    const balloons = [...(panel.balloons ?? [])].sort((a, b) => a.readingOrder - b.readingOrder);
    for (let i = 0; i + 1 < balloons.length; i += 1) {
      const earlier = balloons[i];
      const later = balloons[i + 1];
      if (earlier === undefined || later === undefined) continue;

      const eCx = earlier.x + earlier.width * 0.5;
      const eCy = earlier.y + earlier.height * 0.5;
      const lCx = later.x + later.width * 0.5;
      const lCy = later.y + later.height * 0.5;
      const deltaX = lCx - eCx;
      const deltaY = lCy - eCy;

      if (deltaY < -verticalTolPx) {
        violations.push({
          panelId: panel.id,
          earlierBalloonId: earlier.id,
          laterBalloonId: later.id,
          kind: "vertical-bottom-to-top",
          deltaX,
          deltaY,
          messageKo: `후속 말풍선(${later.id})이 선행 말풍선(${earlier.id})보다 위에 배치되어 시선이 거슬러 올라갑니다.`,
        });
      } else if (Math.abs(deltaY) <= sameRowBandPx) {
        const againstFlow =
          readingDirection === "ltr" ? deltaX < -horizontalTolPx : deltaX > horizontalTolPx;
        if (againstFlow) {
          violations.push({
            panelId: panel.id,
            earlierBalloonId: earlier.id,
            laterBalloonId: later.id,
            kind: "horizontal-against-flow",
            deltaX,
            deltaY,
            messageKo: `같은 높이 대역에서 후속 말풍선(${later.id})이 읽기 방향(${readingDirection.toUpperCase()}) 반대에 놓여 있습니다.`,
          });
        }
      }
    }
  }
  return violations;
}

/** 서사 비트·대사 밀도·모션 벡터를 반영해 패널 하단 최적 세로 여백(px)을 추천한다. */
export function recommendPanelGutterHeightPx(
  panel: EpisodeScrollPanel,
  viewport: MobileScrollViewport = DEFAULT_MOBILE_SCROLL_VIEWPORT,
): PanelGutterRecommendation {
  const vh = Math.max(320, viewport.heightPx);
  const balloons = panel.balloons ?? [];
  const vectors = panel.actionVectors ?? [];
  const totalChars = balloons.reduce((acc, b) => acc + Math.max(0, b.characterCount ?? 0), 0);

  let downwardThrust = 0;
  for (const vec of vectors) {
    const dy = vec.endY - vec.startY;
    const len = Math.hypot(vec.endX - vec.startX, dy);
    if (len > 1 && dy > 0) {
      downwardThrust = Math.max(downwardThrust, (dy / len) * clamp(vec.intensity ?? 0.8, 0, 1));
    }
  }

  let rawRecommended: number;
  switch (panel.beatKind) {
    case "fast-action":
      rawRecommended = vh * (0.13 - 0.045 * downwardThrust);
      break;
    case "dialogue-exchange":
      rawRecommended = vh * 0.24 + Math.min(64, totalChars * 0.35);
      break;
    case "emotional-beat":
      rawRecommended = vh * 0.48 + Math.min(48, totalChars * 0.25);
      break;
    case "scene-transition":
      rawRecommended = vh * 0.74;
      break;
    case "dramatic-cliffhanger":
      rawRecommended = vh * 1.12;
      break;
  }

  const recommendedGutterPx = Math.round(Math.max(48, rawRecommended));
  const currentGutterPx = Math.round(panel.currentGutterAfterPx ?? recommendedGutterPx);
  const gutterDeltaPx = recommendedGutterPx - currentGutterPx;

  let pacingIssue: GutterPacingIssue = "optimal";
  let coachingNoteKo = "현재 컷 아래 세로 여백이 서사 호흡과 자연스럽게 맞습니다.";

  if (
    (panel.beatKind === "dramatic-cliffhanger" ||
      panel.beatKind === "emotional-beat" ||
      panel.beatKind === "scene-transition") &&
    currentGutterPx < recommendedGutterPx * 0.72
  ) {
    pacingIssue = "too-cramped-for-suspense";
    coachingNoteKo =
      panel.beatKind === "dramatic-cliffhanger"
        ? "클리프행어 컷 아래 여백을 한 화면 이상 확보해 다음 컷 스포일러를 막으세요."
        : "감정 여운과 장면 전환이 읽히도록 컷 아래 세로 여백을 넓히세요.";
  } else if (panel.beatKind === "fast-action" && currentGutterPx > recommendedGutterPx * 1.65) {
    pacingIssue = "too-wide-breaks-action";
    coachingNoteKo = "빠른 액션 연결이 끊기지 않도록 컷 간격을 좁혀 타격 속도감을 유지하세요.";
  } else if (Math.abs(gutterDeltaPx) > Math.max(48, recommendedGutterPx * 0.3)) {
    pacingIssue = "needs-adjustment";
    coachingNoteKo =
      gutterDeltaPx > 0
        ? "호흡 정리를 위해 컷 아래 여백을 조금 더 늘리는 편이 안정적입니다."
        : "스크롤 늘어짐을 줄이기 위해 컷 아래 여백을 다듬으세요.";
  }

  return {
    panelId: panel.id,
    beatKind: panel.beatKind,
    currentGutterPx,
    recommendedGutterPx,
    gutterDeltaPx,
    pacingIssue,
    coachingNoteKo,
  };
}

function buildSaccadeWaypoints(panels: readonly EpisodeScrollPanel[]): SaccadeWaypoint[] {
  const orderedPanels = [...panels].sort((a, b) => a.topY - b.topY);
  const waypoints: SaccadeWaypoint[] = [];

  for (const panel of orderedPanels) {
    const panelPoints: { readonly sortKey: number; readonly wp: SaccadeWaypoint }[] = [];
    const balloons = [...(panel.balloons ?? [])].sort((a, b) => a.readingOrder - b.readingOrder);

    let prevBalloonKey = Number.NEGATIVE_INFINITY;
    for (let bi = 0; bi < balloons.length; bi += 1) {
      const b = balloons[bi];
      if (b === undefined) continue;
      const cx = b.x + b.width * 0.5;
      const cy = b.y + b.height * 0.5;
      const sortKey = Math.max(cy, prevBalloonKey + 1e-3);
      prevBalloonKey = sortKey;
      panelPoints.push({
        sortKey,
        wp: {
          id: b.id,
          panelId: panel.id,
          kind: "speech-balloon",
          x: cx,
          y: cy,
          saliencyWeight: b.emphasis === "shout" ? 1 : 0.9,
        },
      });
    }

    for (const anchor of panel.focalAnchors ?? []) {
      panelPoints.push({
        sortKey: anchor.y,
        wp: {
          id: anchor.id,
          panelId: panel.id,
          kind: "character-focal",
          x: anchor.x,
          y: anchor.y,
          saliencyWeight: clamp(anchor.saliencyWeight ?? 0.78, 0.1, 1),
        },
      });
    }

    for (const vec of panel.actionVectors ?? []) {
      panelPoints.push({
        sortKey: vec.endY,
        wp: {
          id: vec.id,
          panelId: panel.id,
          kind: "action-vector",
          x: vec.endX,
          y: vec.endY,
          saliencyWeight: clamp((vec.intensity ?? 0.8) * 0.72, 0.1, 1),
        },
      });
    }

    // 말풍선만 있는 경우 작가 의도 순서를 그대로 따르고, 복합 요소는 패널 내 흐름 순서로 정렬
    if ((panel.focalAnchors?.length ?? 0) === 0 && (panel.actionVectors?.length ?? 0) === 0) {
      for (const item of panelPoints) waypoints.push(item.wp);
    } else {
      panelPoints.sort((a, b) => a.sortKey - b.sortKey);
      for (const item of panelPoints) waypoints.push(item.wp);
    }
  }

  return waypoints;
}

function detectScreenfulOverloads(
  panels: readonly EpisodeScrollPanel[],
  viewport: MobileScrollViewport,
  maxBalloons: number,
  maxChars: number,
  maxAnchors: number,
): ScreenfulOverloadDiagnostic[] {
  const allBalloons: SpeechBalloonNode[] = [];
  const allAnchors: CharacterFocalAnchor[] = [];
  const candidateTops = new Set<number>();

  for (const panel of panels) {
    candidateTops.add(Math.max(0, Math.floor(panel.topY)));
    for (const b of panel.balloons ?? []) {
      allBalloons.push(b);
      candidateTops.add(Math.max(0, Math.floor(b.y)));
    }
    for (const a of panel.focalAnchors ?? []) {
      allAnchors.push(a);
      candidateTops.add(Math.max(0, Math.floor(a.y)));
    }
  }

  const sortedTops = [...candidateTops].sort((a, b) => a - b);
  const rawDiagnostics: ScreenfulOverloadDiagnostic[] = [];

  for (const topY of sortedTops) {
    const bottomY = topY + viewport.heightPx;
    const hitBalloons = allBalloons.filter((b) => b.y < bottomY && b.y + b.height > topY);
    const hitAnchors = allAnchors.filter((a) => a.y >= topY && a.y <= bottomY);
    const balloonCount = hitBalloons.length;
    const totalCharacterCount = hitBalloons.reduce(
      (sum, b) => sum + Math.max(0, b.characterCount ?? 0),
      0,
    );
    const focalAnchorCount = hitAnchors.length;

    const reasons: CognitiveOverloadReason[] = [];
    if (balloonCount > maxBalloons) reasons.push("excessive-balloons");
    if (totalCharacterCount > maxChars) reasons.push("excessive-text-characters");
    if (focalAnchorCount > maxAnchors) reasons.push("excessive-character-anchors");
    if (reasons.length === 0) continue;

    rawDiagnostics.push({
      windowTopY: topY,
      windowBottomY: bottomY,
      balloonCount,
      totalCharacterCount,
      focalAnchorCount,
      balloonIds: hitBalloons.map((b) => b.id),
      reasons,
      messageKo: `한 화면(${topY}..${bottomY}px)에 말풍선 ${balloonCount}개·글자 ${totalCharacterCount}자·인물 초점 ${focalAnchorCount}개가 밀집해 읽기 피로가 높습니다.`,
    });
  }

  // 절반 이상 겹치는 슬라이딩 윈도우는 심각도가 가장 높은 대표 구간으로 병합
  const merged: ScreenfulOverloadDiagnostic[] = [];
  for (const diag of rawDiagnostics) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && diag.windowTopY < prev.windowTopY + viewport.heightPx * 0.5) {
      const prevSeverity =
        prev.balloonCount * 30 + prev.totalCharacterCount + prev.focalAnchorCount * 25;
      const nextSeverity =
        diag.balloonCount * 30 + diag.totalCharacterCount + diag.focalAnchorCount * 25;
      if (nextSeverity > prevSeverity) {
        merged[merged.length - 1] = diag;
      }
    } else {
      merged.push(diag);
    }
  }

  return merged;
}

/** 에피소드 전체의 세로 스크롤 시선 동선·인지 부하·여백 페이싱을 종합 분석한다. */
export function analyzeEpisodeScrollPacing(
  input: EpisodeScrollPacingInput,
): EpisodeScrollPacingReport {
  const viewport = input.viewport ?? DEFAULT_MOBILE_SCROLL_VIEWPORT;
  const readingDirection = input.readingDirection ?? "ltr";
  const maxBalloons = input.maxBalloonsPerScreenful ?? DEFAULT_MAX_BALLOONS_PER_SCREENFUL;
  const maxChars = input.maxCharactersPerScreenful ?? DEFAULT_MAX_CHARACTERS_PER_SCREENFUL;
  const maxAnchors = input.maxFocalAnchorsPerScreenful ?? DEFAULT_MAX_FOCAL_ANCHORS_PER_SCREENFUL;

  const saccadeWaypoints = buildSaccadeWaypoints(input.panels);
  const saccadeTransitions: SaccadeTransition[] = [];
  let distanceSum = 0;
  let downwardCount = 0;

  for (let i = 0; i + 1 < saccadeWaypoints.length; i += 1) {
    const from = saccadeWaypoints[i];
    const to = saccadeWaypoints[i + 1];
    if (from === undefined || to === undefined) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distancePx = Math.hypot(dx, dy);
    const isUpwardRegression = dy < -20;
    if (!isUpwardRegression) downwardCount += 1;
    distanceSum += distancePx;
    saccadeTransitions.push({ fromId: from.id, toId: to.id, dx, dy, distancePx, isUpwardRegression });
  }

  const reverseReadingViolations = detectReverseReadingViolations(input.panels, readingDirection);
  const cognitiveOverloadWindows = detectScreenfulOverloads(
    input.panels,
    viewport,
    maxBalloons,
    maxChars,
    maxAnchors,
  );
  const orderedPanels = [...input.panels].sort((a, b) => a.topY - b.topY);
  const gutterRecommendations = orderedPanels.map((panel) =>
    recommendPanelGutterHeightPx(panel, viewport),
  );

  const nonOptimalGutters = gutterRecommendations.filter((g) => g.pacingIssue !== "optimal").length;
  const penalty =
    reverseReadingViolations.length * 18 +
    cognitiveOverloadWindows.length * 16 +
    nonOptimalGutters * 8;
  const overallPacingScore = clamp(Math.round(100 - penalty), 0, 100);

  return {
    viewport,
    saccadeWaypoints,
    saccadeTransitions,
    meanSaccadeDistancePx:
      saccadeTransitions.length > 0 ? distanceSum / saccadeTransitions.length : 0,
    downwardFlowRatio:
      saccadeTransitions.length > 0 ? downwardCount / saccadeTransitions.length : 1,
    reverseReadingViolations,
    cognitiveOverloadWindows,
    gutterRecommendations,
    overallPacingScore,
  };
}
