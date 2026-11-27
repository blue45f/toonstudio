/**
 * Wave-52: 비파괴 컷 여백(Gutter) 및 호흡 전환 그라데이션 자동 재배치 플래너.
 *
 * - 컷 내부 아트워크(`widthPx`, `heightPx`)는 단 1px도 자르거나 스케일하지 않는다.
 * - 긴장감 진단 결과에 따라 컷 간 여백과 호흡 전환 그라데이션 여백만 재배치하는 패치 플랜을 만든다.
 * - 반전 컷 직전에는 긴장감 유지 여백 확대 및 극적 그라데이션을 부여하고,
 *   액션 연타 구간의 과다 여백은 압축해 속도감을 회복한다.
 */

import {
  analyzeScrollTensionRhythm,
  type ScrollCutSpec,
  type ScrollPacingIssue,
  type ScrollPacingIssueKind,
  type ScrollTensionInput,
  type ScrollTensionReport,
  type WebtoonGenre,
} from "./scroll-tension-rhythm-analyzer";

export type GutterReflowActionKind =
  | "expand-pre-twist"
  | "trim-pre-twist"
  | "expand-breathing"
  | "compress-action-combo"
  | "trim-dead-air";

export type BreathingGradientEasing = "linear" | "ease-in-dramatic" | "ease-out-calm";

export interface BreathingGradientSpec {
  readonly enabled: boolean;
  readonly fromColorHex: string;
  readonly toColorHex: string;
  readonly fadeLengthPx: number;
  readonly easing: BreathingGradientEasing;
  readonly purposeKo: string;
}

export interface GutterReflowPatchOp {
  readonly cutId: string;
  readonly nextCutId: string | null;
  readonly reasonKind: ScrollPacingIssueKind;
  readonly action: GutterReflowActionKind;
  readonly beforeGutterPx: number;
  readonly afterGutterPx: number;
  readonly deltaGutterPx: number;
  readonly gradientGutter: BreathingGradientSpec | null;
  readonly rationaleKo: string;
}

export interface ReflowedCutLayout {
  readonly cutId: string;
  readonly artworkTopY: number;
  readonly artworkWidthPx: number;
  readonly artworkHeightPx: number;
  readonly gutterAfterPx: number;
  readonly gradientGutter: BreathingGradientSpec | null;
}

export interface ArtworkIntegrityVerification {
  readonly preserved: boolean;
  readonly checkedCutCount: number;
  readonly violations: readonly string[];
}

export interface GutterReflowOptions {
  readonly minGutterPx?: number;
  readonly maxGutterPx?: number;
  readonly enableBreathingGradients?: boolean;
  readonly precomputedReport?: ScrollTensionReport;
}

export interface GutterReflowPlan {
  readonly episodeId: string;
  readonly genre: WebtoonGenre;
  readonly operations: readonly GutterReflowPatchOp[];
  readonly reflowedLayout: readonly ReflowedCutLayout[];
  readonly totalHeightBeforePx: number;
  readonly totalHeightAfterPx: number;
  readonly netHeightDeltaPx: number;
  readonly artworkIntegrity: ArtworkIntegrityVerification;
  readonly beforeReport: ScrollTensionReport;
  readonly afterReport: ScrollTensionReport;
  readonly healthScoreDelta: number;
  readonly summaryKo: string;
}

const ISSUE_PRIORITY: Readonly<Record<ScrollPacingIssueKind, number>> = {
  "pre-twist-deflation-tight": 5,
  "pre-twist-deflation-excessive": 4,
  "action-momentum-drag": 3,
  "suffocating-crowding": 2,
  "dead-air-gutter": 1,
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.round(Math.min(max, Math.max(min, value)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildBreathingGradient(
  genre: WebtoonGenre,
  action: GutterReflowActionKind,
  gutterHeightPx: number,
  enabled: boolean,
): BreathingGradientSpec | null {
  if (!enabled || gutterHeightPx < 90) return null;
  if (action === "expand-pre-twist" || action === "trim-pre-twist") {
    const isDarkSuspense = genre === "thriller" || genre === "action";
    return {
      enabled: true,
      fromColorHex: "#FFFFFF",
      toColorHex: isDarkSuspense ? "#14161D" : "#EFE9E1",
      fadeLengthPx: Math.round(gutterHeightPx * 0.78),
      easing: "ease-in-dramatic",
      purposeKo: isDarkSuspense
        ? "반전 컷 진입 직전 암전 그라데이션으로 긴장감을 응축합니다."
        : "감정 반전 직전 톤 전환 그라데이션으로 시선 호흡을 고릅니다.",
    };
  }
  if (action === "expand-breathing") {
    return {
      enabled: true,
      fromColorHex: "#FFFFFF",
      toColorHex: "#F5F6F8",
      fadeLengthPx: Math.round(gutterHeightPx * 0.55),
      easing: "ease-out-calm",
      purposeKo: "대사 밀집 구간 직후 시야 피로를 풀어 주는 완만한 호흡 여백입니다.",
    };
  }
  return null;
}

function mapIssueToAction(kind: ScrollPacingIssueKind): GutterReflowActionKind {
  switch (kind) {
    case "pre-twist-deflation-tight":
      return "expand-pre-twist";
    case "pre-twist-deflation-excessive":
      return "trim-pre-twist";
    case "action-momentum-drag":
      return "compress-action-combo";
    case "suffocating-crowding":
      return "expand-breathing";
    case "dead-air-gutter":
      return "trim-dead-air";
  }
}

function buildRationaleKo(
  action: GutterReflowActionKind,
  cutId: string,
  nextCutId: string | null,
  beforePx: number,
  afterPx: number,
): string {
  const targetLabel = nextCutId !== null ? `→${nextCutId}` : "";
  switch (action) {
    case "expand-pre-twist":
      return `컷(${cutId}${targetLabel}) 여백을 ${beforePx}px에서 ${afterPx}px로 늘려 반전 컷 미리 노출을 막고 긴장을 유지합니다.`;
    case "trim-pre-twist":
      return `컷(${cutId}${targetLabel}) 과다 여백을 ${beforePx}px에서 ${afterPx}px로 다듬어 반전 직전 김빠짐을 줄입니다.`;
    case "compress-action-combo":
      return `액션 연타(${cutId}${targetLabel}) 여백을 ${beforePx}px에서 ${afterPx}px로 압축해 타격 템포를 끌어올립니다.`;
    case "expand-breathing":
      return `과밀 구간(${cutId}${targetLabel}) 여백을 ${beforePx}px에서 ${afterPx}px로 넓혀 독자 숨 고르기 공간을 확보합니다.`;
    case "trim-dead-air":
      return `일반 구간(${cutId}${targetLabel}) 공백을 ${beforePx}px에서 ${afterPx}px로 정리해 스크롤 탄력을 유지합니다.`;
  }
}

/**
 * 재배치 결과가 원본 컷 아트워크의 너비·높이를 단 1px도 훼손하지 않았는지 검증한다.
 */
export function verifyNonDestructiveArtworkIntegrity(
  originalCuts: readonly ScrollCutSpec[],
  reflowedLayout: readonly ReflowedCutLayout[],
  defaultWidthPx = 375,
): ArtworkIntegrityVerification {
  const violations: string[] = [];
  if (originalCuts.length !== reflowedLayout.length) {
    violations.push(
      `컷 개수가 변경되었습니다(원본 ${originalCuts.length}컷 vs 재배치 ${reflowedLayout.length}컷).`,
    );
  }
  const count = Math.min(originalCuts.length, reflowedLayout.length);
  for (let i = 0; i < count; i += 1) {
    const orig = originalCuts[i];
    const next = reflowedLayout[i];
    if (orig === undefined || next === undefined) continue;
    const expectedWidth = orig.widthPx ?? defaultWidthPx;
    const expectedHeight = Math.max(1, orig.heightPx);
    if (orig.cutId !== next.cutId) {
      violations.push(`${i}번 컷 순서가 변경되었습니다(${orig.cutId} !== ${next.cutId}).`);
    }
    if (next.artworkWidthPx !== expectedWidth || next.artworkHeightPx !== expectedHeight) {
      violations.push(
        `컷(${orig.cutId}) 아트워크 치수가 변형되었습니다(${expectedWidth}×${expectedHeight} → ${next.artworkWidthPx}×${next.artworkHeightPx}).`,
      );
    }
  }
  return {
    preserved: violations.length === 0,
    checkedCutCount: count,
    violations,
  };
}

/**
 * 생성된 여백 패치 플랜을 컷 목록에 비파괴 적용한 사본을 반환한다.
 */
export function applyGutterReflowToCuts(
  cuts: readonly ScrollCutSpec[],
  operations: readonly GutterReflowPatchOp[],
): readonly ScrollCutSpec[] {
  const opByCutId = new Map<string, GutterReflowPatchOp>();
  for (const op of operations) opByCutId.set(op.cutId, op);
  return cuts.map((cut) => {
    const op = opByCutId.get(cut.cutId);
    if (op === undefined) return { ...cut };
    return {
      ...cut,
      gutterAfterPx: op.afterGutterPx,
      hasGradientBreathingGutter:
        op.gradientGutter !== null ? op.gradientGutter.enabled : cut.hasGradientBreathingGutter,
    };
  });
}

/**
 * 진단된 과밀·김빠짐·속도 저하 구간에 대해 비파괴 컷 여백 재배치 플랜을 수립한다.
 */
export function planGutterPacingReflow(
  input: ScrollTensionInput,
  options?: GutterReflowOptions,
): GutterReflowPlan {
  const beforeReport = options?.precomputedReport ?? analyzeScrollTensionRhythm(input);
  const minGutter = Math.max(16, options?.minGutterPx ?? 24);
  const maxGutter = Math.max(minGutter + 40, options?.maxGutterPx ?? 720);
  const enableGradients = options?.enableBreathingGradients ?? true;

  // 동일 컷에 복수 진단이 겹치면 서사 임팩트가 큰 이슈를 우선 선택한다.
  const dominantIssueByCut = new Map<string, ScrollPacingIssue>();
  for (const issue of beforeReport.issues) {
    const existing = dominantIssueByCut.get(issue.cutId);
    if (existing === undefined || ISSUE_PRIORITY[issue.kind] > ISSUE_PRIORITY[existing.kind]) {
      dominantIssueByCut.set(issue.cutId, issue);
    }
  }

  const operations: GutterReflowPatchOp[] = [];
  for (const cut of input.cuts) {
    const issue = dominantIssueByCut.get(cut.cutId);
    if (issue === undefined) continue;
    const action = mapIssueToAction(issue.kind);
    const beforePx = Math.max(0, cut.gutterAfterPx);
    const afterPx = clampInt(issue.recommendedGutterPx, minGutter, maxGutter);
    if (afterPx === beforePx) continue;
    const gradientGutter = buildBreathingGradient(input.genre, action, afterPx, enableGradients);
    operations.push({
      cutId: cut.cutId,
      nextCutId: issue.nextCutId,
      reasonKind: issue.kind,
      action,
      beforeGutterPx: beforePx,
      afterGutterPx: afterPx,
      deltaGutterPx: afterPx - beforePx,
      gradientGutter,
      rationaleKo: buildRationaleKo(action, cut.cutId, issue.nextCutId, beforePx, afterPx),
    });
  }

  const patchedCuts = applyGutterReflowToCuts(input.cuts, operations);
  const opByCutId = new Map<string, GutterReflowPatchOp>();
  for (const op of operations) opByCutId.set(op.cutId, op);

  const defaultWidth = beforeReport.viewport.widthPx;
  const reflowedLayout: ReflowedCutLayout[] = [];
  let beforeHeight = 0;
  let afterHeight = 0;
  for (let i = 0; i < input.cuts.length; i += 1) {
    const orig = input.cuts[i];
    const patched = patchedCuts[i];
    if (orig === undefined || patched === undefined) continue;
    const artW = orig.widthPx ?? defaultWidth;
    const artH = Math.max(1, orig.heightPx);
    const op = opByCutId.get(orig.cutId);
    reflowedLayout.push({
      cutId: orig.cutId,
      artworkTopY: afterHeight,
      artworkWidthPx: artW,
      artworkHeightPx: artH,
      gutterAfterPx: Math.max(0, patched.gutterAfterPx),
      gradientGutter: op?.gradientGutter ?? null,
    });
    beforeHeight += artH + Math.max(0, orig.gutterAfterPx);
    afterHeight += artH + Math.max(0, patched.gutterAfterPx);
  }

  const artworkIntegrity = verifyNonDestructiveArtworkIntegrity(
    input.cuts,
    reflowedLayout,
    defaultWidth,
  );
  const afterReport = analyzeScrollTensionRhythm({
    ...input,
    cuts: patchedCuts,
  });
  const healthScoreDelta = round2(afterReport.rhythmHealthScore - beforeReport.rhythmHealthScore);

  const summaryKo =
    operations.length === 0
      ? `에피소드(${input.episodeId})는 추가 여백 재배치가 필요하지 않습니다.`
      : `컷 아트워크를 훼손하지 않고 ${operations.length}개 여백을 재배치해 리듬 건강도를 ${beforeReport.rhythmHealthScore}점→${afterReport.rhythmHealthScore}점으로 개선했습니다.`;

  return {
    episodeId: input.episodeId,
    genre: input.genre,
    operations,
    reflowedLayout,
    totalHeightBeforePx: beforeHeight,
    totalHeightAfterPx: afterHeight,
    netHeightDeltaPx: afterHeight - beforeHeight,
    artworkIntegrity,
    beforeReport,
    afterReport,
    healthScoreDelta,
    summaryKo,
  };
}
