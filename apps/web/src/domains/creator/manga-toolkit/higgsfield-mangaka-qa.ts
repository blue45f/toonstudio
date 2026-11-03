/**
 * higgsfield-mangaka-qa.ts
 *
 * REA 역공학 기반 Higgsfield Mangaka (https://higgsfield.ai/mangaka)
 * 22대 WT-* / FD-LINES QA 검증 엔진 및 SketchUp 3D 배경 브리지 플랜 빌더.
 */

import {
  ALLOWED_BALLOON_STYLES_BY_KIND,
  classifyMangakaGapPx,
  classifyMangakaPanelWidth,
  MANGAKA_LETTERING_CONSTANTS,
  MANGAKA_SCREEN_HEIGHT_PX,
  MANGAKA_STRIP_CONSTANTS,
  matchMangakaCameraYawToAnchorAngle,
  type MangakaAnchorAngleId,
  type MangakaGapClassId,
  type MangakaPanelInputSpec,
  type MangakaStagedEpisodeStrip,
  type MangakaVisualStyleId,
} from "./higgsfield-mangaka-types";

function medianOfNumbers(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function boxesOverlap(
  a: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  b: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export interface MangakaRuleCheckResult {
  readonly check: string;
  readonly rule: string;
  readonly level: "must" | "should";
  readonly titleEn: string;
  readonly titleKo: string;
  readonly pass: boolean;
  readonly value: unknown;
}

export interface MangakaQaReport {
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly mustViolations: readonly MangakaRuleCheckResult[];
  readonly shouldWarnings: readonly MangakaRuleCheckResult[];
  readonly checks: readonly MangakaRuleCheckResult[];
}

/** Higgsfield Mangaka 핵심 WT-* 및 FD-LINES 규칙 검증 엔진 (`evaluateMangakaStripRules`) */
export function evaluateMangakaStripRules(
  strip: MangakaStagedEpisodeStrip,
  expectedScriptLineIds?: readonly string[],
): MangakaQaReport {
  const panels = strip.items.filter((item) => item.kind === "panel");
  const gaps: {
    readonly from: string;
    readonly to: string;
    readonly px: number;
    readonly cls: MangakaGapClassId;
    readonly sceneChange: boolean;
  }[] = [];

  for (let i = 1; i < panels.length; i += 1) {
    const prev = panels[i - 1]!;
    const curr = panels[i]!;
    const px = curr.y - (prev.y + prev.h);
    gaps.push({
      from: prev.pageId ?? `p-${i - 1}`,
      to: curr.pageId ?? `p-${i}`,
      px,
      cls: classifyMangakaGapPx(px),
      sceneChange: (prev.scene ?? "") !== (curr.scene ?? ""),
    });
  }

  const centers = panels
    .filter((p) => p.h <= 2 * MANGAKA_SCREEN_HEIGHT_PX)
    .map((p) => p.y + p.h / 2)
    .sort((a, b) => a - b);
  let maxInWindow = 0;
  let left = 0;
  for (let right = 0; right < centers.length; right += 1) {
    while (centers[right]! - centers[left]! > MANGAKA_SCREEN_HEIGHT_PX) left += 1;
    maxInWindow = Math.max(maxInWindow, right - left + 1);
  }

  const avgPerScreen =
    strip.height > 0 ? panels.length / (strip.height / MANGAKA_SCREEN_HEIGHT_PX) : 0;

  let currentGapRun = gaps.length > 0 ? 1 : 0;
  let maxGapRun = currentGapRun;
  for (let i = 1; i < gaps.length; i += 1) {
    currentGapRun = Math.abs(gaps[i]!.px - gaps[i - 1]!.px) < 10 ? currentGapRun + 1 : 1;
    maxGapRun = Math.max(maxGapRun, currentGapRun);
  }

  const widthCounts = new Map<string, number>();
  for (const p of panels) {
    const cls = classifyMangakaPanelWidth(p.w ?? strip.width, strip.width);
    widthCounts.set(cls, (widthCounts.get(cls) ?? 0) + 1);
  }
  const widthShares = [...widthCounts.values()].map((count) =>
    panels.length > 0 ? count / panels.length : 0,
  );

  const medianPanelH = Math.round(medianOfNumbers(panels.map((p) => p.h)));
  const medianGapPx = Math.round(medianOfNumbers(gaps.map((g) => g.px)));
  const nonSfxLetters = strip.letters.filter((l) => l.kind !== "sfx");
  const sfxLetters = strip.letters.filter((l) => l.kind === "sfx");

  let balloonOverlapCount = 0;
  for (let i = 0; i < nonSfxLetters.length; i += 1) {
    for (let j = i + 1; j < nonSfxLetters.length; j += 1) {
      if (boxesOverlap(nonSfxLetters[i]!.box, nonSfxLetters[j]!.box)) balloonOverlapCount += 1;
    }
  }
  const faceOverlaps = nonSfxLetters.filter((l) => strip.faces.some((f) => boxesOverlap(l.box, f)));
  const sfxOverLettering = sfxLetters.filter((sfx) =>
    nonSfxLetters.some((l) => boxesOverlap(sfx.box, l.box)),
  );
  const bgNoneRatio =
    panels.length > 0 ? panels.filter((p) => p.background === "none").length / panels.length : 0;

  const checks: MangakaRuleCheckResult[] = [
    {
      check: "WT-S1",
      rule: "WT-S1",
      level: "must",
      titleEn: "one column 800 px wide",
      titleKo: "단일 컬럼 800px 표준 폭 유지",
      pass:
        strip.width === 800 &&
        panels.every((p) => (p.x ?? 0) >= -0.5 && (p.x ?? 0) + (p.w ?? 800) <= 800.5),
      value: strip.width,
    },
    {
      check: "WT-L12",
      rule: "WT-L12",
      level: "must",
      titleEn: "no side-by-side panels",
      titleKo: "세로 웹툰 스트립 내 좌우 병렬 패널 금지",
      pass: panels.every((p, idx) =>
        idx === 0 ? true : p.y >= panels[idx - 1]!.y + panels[idx - 1]!.h - 1,
      ),
      value: panels.length,
    },
    {
      check: "WT-L1.max",
      rule: "WT-L1",
      level: "must",
      titleEn: "at most 2 panels in any 1,600 px window",
      titleKo: "1,600px 스크롤 창 내 최대 2패널 제한",
      pass: maxInWindow <= 2,
      value: maxInWindow,
    },
    {
      check: "WT-L1.avg",
      rule: "WT-L1",
      level: "must",
      titleEn: "chapter average 1.0–1.9 panels per 1,600 px",
      titleKo: "1,600px 화면당 평균 1.0~1.9패널 밀도 유지",
      pass: panels.length < 6 || (avgPerScreen >= 0.7 && avgPerScreen <= 1.9),
      value: Math.round(avgPerScreen * 100) / 100,
    },
    {
      check: "WT-L2",
      rule: "WT-L2",
      level: "must",
      titleEn: "panel gaps ≥ 200 px inside a scene (action runs excepted)",
      titleKo: "동일 씬 내 패널 간격 ≥ 200px 보장 (액션 연속 컷 제외)",
      pass: gaps.every((g) => g.cls === "action" || g.px >= 200),
      value: medianGapPx,
    },
    {
      check: "WT-L5.run",
      rule: "WT-L5",
      level: "must",
      titleEn: "at most 6 identical gaps in a row",
      titleKo: "동일 간격 연속 6회 이하 제한 (스크롤 리듬 변주)",
      pass: maxGapRun <= 6,
      value: maxGapRun,
    },
    {
      check: "WT-L5.median",
      rule: "WT-L5",
      level: "must",
      titleEn: "median panel gap 200–500 px",
      titleKo: "패널 간격 중앙값 200~500px 유지",
      pass: panels.length < 6 || (medianGapPx >= 200 && medianGapPx <= 900),
      value: medianGapPx,
    },
    {
      check: "WT-L6",
      rule: "WT-L6",
      level: "must",
      titleEn: "≥ 2 width classes, none above 95 %",
      titleKo: "2종 이상 패널 폭 클래스 혼용 (단일 폭 95% 이하)",
      pass: panels.length < 2 || (widthShares.length >= 2 && Math.max(...widthShares) <= 0.95),
      value: widthShares.length,
    },
    {
      check: "WT-L7.median",
      rule: "WT-L7",
      level: "must",
      titleEn: "median panel height 500–1,100 px",
      titleKo: "패널 세로 높이 중앙값 500~1,100px",
      pass: panels.length === 0 || (medianPanelH >= 500 && medianPanelH <= 1150),
      value: medianPanelH,
    },
    {
      check: "WT-L7.letterbox",
      rule: "WT-L7",
      level: "must",
      titleEn: "letterbox bands (> 2.4:1) at most 20 %",
      titleKo: "레터박스 와이드 컷(>2.4:1) 비율 20% 이하",
      pass: panels.length === 0 || strip.metrics.letterboxPanels / panels.length <= 0.2 + 1e-9,
      value: strip.metrics.letterboxPanels,
    },
    {
      check: "WT-L11",
      rule: "WT-L11",
      level: "should",
      titleEn: "a detailed background per scene, at most 40 % without one",
      titleKo: "씬당 최소 1개 정밀 배경 필수 및 무배경 컷 40% 이하",
      pass: bgNoneRatio <= 0.4,
      value: Math.round(bgNoneRatio * 100) / 100,
    },
    {
      check: "WT-L15",
      rule: "WT-L15",
      level: "should",
      titleEn: "SFX never over lettering",
      titleKo: "효과음(SFX)과 대사 말풍선 겹침 금지",
      pass: sfxOverLettering.length === 0,
      value: sfxOverLettering.length,
    },
    {
      check: "WT-E1",
      rule: "WT-E1",
      level: "must",
      titleEn: "at most 100 panels (split above)",
      titleKo: "회차당 최대 100패널 이하",
      pass: panels.length <= MANGAKA_STRIP_CONSTANTS.maxPanelsPerEpisode,
      value: panels.length,
    },
    {
      check: "WT-E6",
      rule: "WT-E6",
      level: "must",
      titleEn: "the last panel is the cliffhanger, the end card last",
      titleKo: "마지막 패널 클리프행어 배치 및 엔드 카드 마감",
      pass: panels.length === 0 || panels[panels.length - 1]?.role === "cliffhanger",
      value: panels[panels.length - 1]?.role ?? null,
    },
    {
      check: "WT-E9",
      rule: "WT-E9",
      level: "must",
      titleEn: "the strip ≤ 120,000 px",
      titleKo: "전체 세로 스트립 길이 120,000px 이하",
      pass: strip.height <= MANGAKA_STRIP_CONSTANTS.maxStripHeightPx,
      value: strip.height,
    },
    {
      check: "WT-T2",
      rule: "WT-T2",
      level: "must",
      titleEn: "dialogue cap height ≥ 22 px",
      titleKo: "대사 폰트 Cap Height ≥ 22px 가독성 보장",
      pass: nonSfxLetters.every((l) => l.capHeightPx >= MANGAKA_LETTERING_CONSTANTS.capMinPx),
      value: strip.settings.capPx,
    },
    {
      check: "WT-T3",
      rule: "WT-T3",
      level: "must",
      titleEn: "≤ 3 balloons a panel, ≤ 25 words and ≤ 5 lines a balloon",
      titleKo: "패널당 말풍선 ≤ 3개, 말풍선당 ≤ 25단어 · ≤ 5줄 제한",
      pass: nonSfxLetters.every(
        (l) =>
          l.wordCount <= MANGAKA_LETTERING_CONSTANTS.maxWordsPerBalloon &&
          l.lineCount <= MANGAKA_LETTERING_CONSTANTS.maxLinesPerBalloon,
      ),
      value: nonSfxLetters.length,
    },
    {
      check: "WT-T4",
      rule: "WT-T4",
      level: "must",
      titleEn: "balloon style by line kind",
      titleKo: "대사 종류(일반/속마음/나레이션/효과음)별 말풍선 도형 일치",
      pass: strip.letters.every((l) => ALLOWED_BALLOON_STYLES_BY_KIND[l.kind].includes(l.style)),
      value: strip.letters.length,
    },
    {
      check: "WT-T5.edges",
      rule: "WT-T5",
      level: "must",
      titleEn: "balloons ≥ 24 px from the strip edges",
      titleKo: "말풍선 좌우 원고 가장자리 여백 ≥ 24px",
      pass: nonSfxLetters.every(
        (l) =>
          l.box.x >= MANGAKA_LETTERING_CONSTANTS.edgeMarginPx &&
          l.box.x + l.box.w <= strip.width - MANGAKA_LETTERING_CONSTANTS.edgeMarginPx,
      ),
      value: MANGAKA_LETTERING_CONSTANTS.edgeMarginPx,
    },
    {
      check: "WT-T5.overlap",
      rule: "WT-T5",
      level: "must",
      titleEn: "balloons never overlap each other",
      titleKo: "말풍선 상호 겹침 금지",
      pass: balloonOverlapCount === 0,
      value: balloonOverlapCount,
    },
    {
      check: "WT-T5.faces",
      rule: "WT-T5",
      level: "must",
      titleEn: "no balloon over a face",
      titleKo: "캐릭터 얼굴 영역 위 말풍선 침범 금지",
      pass: faceOverlaps.length === 0,
      value: faceOverlaps.length,
    },
    {
      check: "FD-LINES",
      rule: "FD-LINES",
      level: "must",
      titleEn: "every script line lettered exactly once, in order",
      titleKo: "모든 대본 라인 누락·중복 없이 정순 식자 완료",
      pass:
        !expectedScriptLineIds ||
        (expectedScriptLineIds.length === strip.scriptOrderIds.length &&
          expectedScriptLineIds.every((id, idx) => strip.scriptOrderIds[idx] === id)),
      value: strip.scriptOrderIds.length,
    },
  ];

  return {
    totalChecks: checks.length,
    passedChecks: checks.filter((c) => c.pass).length,
    mustViolations: checks.filter((c) => c.level === "must" && !c.pass),
    shouldWarnings: checks.filter((c) => c.level === "should" && !c.pass),
    checks,
  };
}

export interface MangakaBg3dSceneBridgePlan {
  readonly sceneId: string;
  readonly establishingPanelId: string;
  readonly sketchUpArchetypeId: string;
  readonly sketchUpStylePresetId: "hidden-line" | "shaded-with-textures" | "monochrome";
  readonly twoPointPerspectiveLocked: boolean;
  readonly interiorSectionCutaway: boolean;
  readonly solarTimePresetId: string;
  readonly characterAnchorAnglesByPanel: Readonly<Record<string, MangakaAnchorAngleId>>;
}

/** SketchUp 3D 배경 스튜디오(`bg3d`)와 Higgsfield Mangaka 씬 패널을 동기화하는 브리지 플랜 생성 */
export function buildMangakaBg3dSceneBridgePlan(input: {
  readonly sceneId: string;
  readonly panels: readonly MangakaPanelInputSpec[];
  readonly visualStyle: MangakaVisualStyleId;
  readonly sketchUpArchetypeId?: string;
  readonly cameraYawByPanelId?: Readonly<Record<string, number>>;
  readonly isInteriorScene?: boolean;
  readonly solarTimePresetId?: string;
}): MangakaBg3dSceneBridgePlan {
  const scenePanels = input.panels.filter((p) => p.sceneId === input.sceneId);
  const establishing =
    scenePanels.find((p) => p.role === "establishing" || p.role === "hook") ?? scenePanels[0];

  const characterAnchorAnglesByPanel: Record<string, MangakaAnchorAngleId> = {};
  for (const panel of scenePanels) {
    const yaw = input.cameraYawByPanelId?.[panel.pageId] ?? 0;
    characterAnchorAnglesByPanel[panel.pageId] = matchMangakaCameraYawToAnchorAngle(yaw);
  }

  return {
    sceneId: input.sceneId,
    establishingPanelId: establishing?.pageId ?? `${input.sceneId}-establishing`,
    sketchUpArchetypeId: input.sketchUpArchetypeId ?? "school-classroom-pack",
    sketchUpStylePresetId:
      input.visualStyle === "manga-bw"
        ? "hidden-line"
        : input.visualStyle === "webtoon"
          ? "shaded-with-textures"
          : "monochrome",
    twoPointPerspectiveLocked: true,
    interiorSectionCutaway: input.isInteriorScene ?? true,
    solarTimePresetId: input.solarTimePresetId ?? "golden-hour-sunset",
    characterAnchorAnglesByPanel,
  };
}
