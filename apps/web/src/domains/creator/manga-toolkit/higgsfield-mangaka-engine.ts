/**
 * higgsfield-mangaka-engine.ts
 *
 * REA 역공학 기반 Higgsfield Mangaka (https://higgsfield.ai/mangaka) 세로 스트립 스테이징,
 * 말풍선·얼굴 충돌 회피 식자 및 안전 슬라이서(`it`) 엔진.
 */

import {
  computeMangakaDeterministicGapPx,
  countMangakaWordsCjkAware,
  MANGAKA_LETTERING_CONSTANTS,
  MANGAKA_PANEL_ASPECT_RESOLUTIONS,
  MANGAKA_SCREEN_HEIGHT_PX,
  MANGAKA_STRIP_CONSTANTS,
  type MangakaBalloonStyleId,
  type MangakaBorderStyleId,
  type MangakaGapClassId,
  type MangakaGutterFillId,
  type MangakaPanelInputSpec,
  type MangakaPlacedLetterItem,
  type MangakaPortalPresetId,
  type MangakaStagedEpisodeStrip,
  type MangakaStagedStripItem,
  type MangakaVisualStyleId,
  type MangakaWidthStyleId,
} from "./higgsfield-mangaka-types";

export * from "./higgsfield-mangaka-types";
export * from "./higgsfield-mangaka-qa";

function medianOfNumbers(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function boxesOverlapWithPadding(
  a: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  b: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  pad = 0,
): boolean {
  return (
    a.x < b.x + b.w + pad &&
    b.x - pad < a.x + a.w &&
    a.y < b.y + b.h + pad &&
    b.y - pad < a.y + a.h
  );
}

/** 스트립 내 패널·카드·얼굴·말풍선(여백 24px 포함)을 절단하지 않는 안전 슬라이스 구간 계산 (`it`) */
export function computeMangakaSafeSliceIntervals(strip: {
  readonly height: number;
  readonly items: readonly MangakaStagedStripItem[];
  readonly letters: readonly MangakaPlacedLetterItem[];
  readonly faces?: readonly {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }[];
}): readonly (readonly [number, number])[] {
  const occupiedIntervals: [number, number][] = [];

  for (const letter of strip.letters) {
    let box = letter.box;
    if (letter.rotationDeg) {
      const radius = Math.hypot(box.w, box.h) / 2;
      box = {
        x: box.x + box.w / 2 - radius,
        y: box.y + box.h / 2 - radius,
        w: 2 * radius,
        h: 2 * radius,
      };
    }
    occupiedIntervals.push([box.y - 24, box.y + box.h + 24]);
  }
  for (const face of strip.faces ?? []) {
    occupiedIntervals.push([face.y - 24, face.y + face.h + 24]);
  }
  for (const item of strip.items) {
    if (item.kind === "panel" || item.kind === "card") {
      occupiedIntervals.push([item.y, item.y + item.h]);
    }
  }

  occupiedIntervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of occupiedIntervals) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const safeRanges: [number, number][] = [];
  let cursor = 0;
  for (const [occStart, occEnd] of merged) {
    const safeStart = Math.ceil(cursor);
    const safeEnd = Math.floor(occStart);
    if (safeEnd >= safeStart) safeRanges.push([safeStart, safeEnd]);
    cursor = Math.max(cursor, occEnd);
  }
  const tailStart = Math.ceil(cursor);
  const tailEnd = Math.floor(strip.height);
  if (tailEnd >= tailStart) safeRanges.push([tailStart, tailEnd]);
  return safeRanges;
}

/** 대본 패널 배열을 Higgsfield Mangaka 규칙을 준수하는 세로 스트립으로 스테이징 */
export function stageMangakaEpisodeStrip(input: {
  readonly episodeId: string;
  readonly panels: readonly MangakaPanelInputSpec[];
  readonly style?: MangakaVisualStyleId;
  readonly portal?: MangakaPortalPresetId;
  readonly widthStyle?: MangakaWidthStyleId;
  readonly gutter?: MangakaGutterFillId;
  readonly textCase?: "caps" | "as-written";
  readonly capPx?: number;
  readonly border?: MangakaBorderStyleId;
  readonly titleCard?: boolean;
  readonly endCard?: boolean;
}): MangakaStagedEpisodeStrip {
  const style = input.style ?? "webtoon";
  const portal = input.portal ?? "webtoon";
  const widthStyle = input.widthStyle ?? "auto";
  const gutter = input.gutter ?? "auto";
  const textCase = input.textCase ?? "caps";
  const capPx = Math.min(
    MANGAKA_LETTERING_CONSTANTS.capMaxPx,
    Math.max(
      MANGAKA_LETTERING_CONSTANTS.capMinPx,
      Math.round(input.capPx ?? MANGAKA_LETTERING_CONSTANTS.capDefaultPx),
    ),
  );
  const border = input.border ?? "none";
  const titleCard = input.titleCard ?? true;
  const endCard = input.endCard ?? true;
  const bg = gutter === "dark" ? "#0B0B10" : "#FFFFFF";
  const stripWidth = MANGAKA_STRIP_CONSTANTS.stripCanvasWidthPx;

  const sizedPanels = input.panels
    .slice(0, MANGAKA_STRIP_CONSTANTS.maxPanelsPerEpisode)
    .map((panel, idx) => {
      const [aspectW, aspectH] = MANGAKA_PANEL_ASPECT_RESOLUTIONS[panel.aspect]["1k"];
      const aspectRatio = aspectH / aspectW;
      const isImpact = panel.role === "impact" || panel.keyBeat === true;
      const resolvedWidthClass = isImpact
        ? "full"
        : panel.widthClass ??
          (widthStyle === "full"
            ? idx % 4 === 2
              ? "inset"
              : "full"
            : widthStyle === "inset"
              ? idx % 4 === 0
                ? "full"
                : "inset"
              : idx % 2 === 0
                ? "full"
                : "inset");

      const w =
        resolvedWidthClass === "full"
          ? stripWidth
          : resolvedWidthClass === "inset"
            ? 640
            : 440;
      const rawH = Math.round(w * aspectRatio);
      const h = isImpact ? Math.max(1040, Math.min(1360, rawH)) : Math.max(520, Math.min(1080, rawH));
      const align = panel.align ?? "center";
      const x =
        w >= stripWidth
          ? 0
          : align === "left" || align === "bleedLeft"
            ? 32
            : align === "right" || align === "bleedRight"
              ? stripWidth - w - 32
              : Math.round((stripWidth - w) / 2);

      const prevScene = idx > 0 ? input.panels[idx - 1]?.sceneId : panel.sceneId;
      const sceneChanged = idx > 0 && prevScene !== panel.sceneId;
      const gapClass: MangakaGapClassId =
        panel.gapBefore ??
        (panel.role === "reveal"
          ? "reveal"
          : isImpact
            ? "pause"
            : sceneChanged
              ? "scene"
              : idx % 3 === 1
                ? "beat"
                : idx % 3 === 2
                  ? "pause"
                  : "action");

      let gapPx = computeMangakaDeterministicGapPx(gapClass, `${input.episodeId}:${panel.pageId}`);
      if (isImpact && gapPx < 420) gapPx = 440;
      if (panel.role === "reveal" && gapPx < 820) gapPx = 840;
      if (!sceneChanged && gapClass !== "action" && gapPx < 220) gapPx = 260;

      return { spec: panel, x, w, h, gapClass, gapPx, sceneChanged };
    });

  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (let i = 0; i + 2 < sizedPanels.length; i += 1) {
      const p0 = sizedPanels[i]!;
      const p1 = sizedPanels[i + 1]!;
      const p2 = sizedPanels[i + 2]!;
      const span = p0.h / 2 + p1.gapPx + p1.h + p2.gapPx + p2.h / 2;
      if (span <= MANGAKA_SCREEN_HEIGHT_PX) {
        p2.gapPx += Math.ceil(MANGAKA_SCREEN_HEIGHT_PX - span + 40);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const items: MangakaStagedStripItem[] = [];
  const letters: MangakaPlacedLetterItem[] = [];
  const faces: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[] = [];
  const scriptOrderIds: string[] = [];
  const speakerSidesByScene = new Map<string, Map<string, "left" | "right">>();

  let yCursor = 0;
  const pushItem = (item: MangakaStagedStripItem): void => {
    items.push(item);
    yCursor += item.h;
  };

  pushItem({ kind: "space", y: yCursor, h: MANGAKA_STRIP_CONSTANTS.topSpacePx, fill: bg });

  if (titleCard && sizedPanels.length > 0) {
    const first = sizedPanels[0]!;
    pushItem({
      kind: "space",
      y: yCursor,
      h: first.gapPx,
      fill: bg,
      gap: first.gapClass,
      before: first.spec.pageId,
    });
    const firstPanelY = yCursor;
    pushItem({
      kind: "panel",
      y: firstPanelY,
      h: first.h,
      x: first.x,
      w: first.w,
      pageId: first.spec.pageId,
      scene: first.spec.sceneId,
      role: first.spec.role,
      background: first.spec.background ?? "detailed",
      border: first.spec.border ?? border,
      keyBeat: first.spec.keyBeat,
      memory: first.spec.memory,
      fill: bg,
    });
    placePanelLettersAndFaces(
      first.spec,
      first.x,
      firstPanelY,
      first.w,
      first.h,
      capPx,
      textCase,
      speakerSidesByScene,
      letters,
      faces,
      scriptOrderIds,
    );
    pushItem({
      kind: "gradient",
      y: yCursor,
      h: MANGAKA_STRIP_CONSTANTS.titleFadePx,
      from: bg,
      to: "#F2F2F4",
    });
    pushItem({
      kind: "card",
      cardType: "title",
      y: yCursor,
      h: MANGAKA_STRIP_CONSTANTS.titleCardHeightPx,
      fill: "#F2F2F4",
    });
    pushItem({
      kind: "gradient",
      y: yCursor,
      h: MANGAKA_STRIP_CONSTANTS.titleFadePx,
      from: "#F2F2F4",
      to: bg,
    });
  }

  const startIdx = titleCard && sizedPanels.length > 0 ? 1 : 0;
  for (let i = startIdx; i < sizedPanels.length; i += 1) {
    const entry = sizedPanels[i]!;
    pushItem({
      kind: "space",
      y: yCursor,
      h: entry.gapPx,
      fill: bg,
      gap: entry.gapClass,
      before: entry.spec.pageId,
    });
    const panelY = yCursor;
    pushItem({
      kind: "panel",
      y: panelY,
      h: entry.h,
      x: entry.x,
      w: entry.w,
      pageId: entry.spec.pageId,
      scene: entry.spec.sceneId,
      role: entry.spec.role,
      background: entry.spec.background ?? "detailed",
      border: entry.spec.border ?? border,
      keyBeat: entry.spec.keyBeat,
      memory: entry.spec.memory,
      fill: bg,
    });
    placePanelLettersAndFaces(
      entry.spec,
      entry.x,
      panelY,
      entry.w,
      entry.h,
      capPx,
      textCase,
      speakerSidesByScene,
      letters,
      faces,
      scriptOrderIds,
    );
  }

  if (endCard) {
    pushItem({ kind: "space", y: yCursor, h: MANGAKA_STRIP_CONSTANTS.endBeforeSpacePx, fill: bg });
    pushItem({
      kind: "card",
      cardType: "end",
      y: yCursor,
      h: MANGAKA_STRIP_CONSTANTS.endCardHeightPx,
      fill: bg,
    });
    pushItem({ kind: "space", y: yCursor, h: MANGAKA_STRIP_CONSTANTS.endAfterSpacePx, fill: bg });
  } else {
    pushItem({ kind: "space", y: yCursor, h: MANGAKA_STRIP_CONSTANTS.endSpaceNoCardPx, fill: bg });
  }

  const panelItems = items.filter((item) => item.kind === "panel");
  const panelGaps: number[] = [];
  for (let i = 1; i < panelItems.length; i += 1) {
    const prev = panelItems[i - 1]!;
    const curr = panelItems[i]!;
    panelGaps.push(curr.y - (prev.y + prev.h));
  }

  const screens = Math.round((yCursor / MANGAKA_SCREEN_HEIGHT_PX) * 100) / 100;
  const safeSliceIntervals = computeMangakaSafeSliceIntervals({
    height: yCursor,
    items,
    letters,
    faces,
  });

  return {
    width: stripWidth,
    height: yCursor,
    bg,
    settings: { style, portal, widthStyle, gutter, textCase, capPx, border, titleCard, endCard },
    items,
    letters,
    faces,
    scriptOrderIds,
    safeSliceIntervals,
    metrics: {
      panels: panelItems.length,
      screens,
      panelsPerScreen:
        panelItems.length > 0 && screens > 0
          ? Math.round((panelItems.length / screens) * 100) / 100
          : 0,
      pxPerPanel: panelItems.length > 0 ? Math.round(yCursor / panelItems.length) : 0,
      gapMedianPx: Math.round(medianOfNumbers(panelGaps)),
      tallPanels: panelItems.filter((p) => p.h >= 1200 && p.h >= 1.5 * (p.w ?? stripWidth)).length,
      letterboxPanels: panelItems.filter((p) => (p.w ?? stripWidth) / p.h > 2.4).length,
    },
  };
}

function placePanelLettersAndFaces(
  panel: MangakaPanelInputSpec,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
  capPx: number,
  textCase: "caps" | "as-written",
  speakerSidesByScene: Map<string, Map<string, "left" | "right">>,
  outLetters: MangakaPlacedLetterItem[],
  outFaces: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[],
  outScriptOrderIds: string[],
): void {
  const localFaces = (panel.faceBoxes ?? []).map((f) => ({
    x: panelX + f.x,
    y: panelY + f.y,
    w: f.w,
    h: f.h,
  }));
  for (const face of localFaces) outFaces.push(face);

  let sceneMap = speakerSidesByScene.get(panel.sceneId);
  if (!sceneMap) {
    sceneMap = new Map<string, "left" | "right">();
    speakerSidesByScene.set(panel.sceneId, sceneMap);
  }

  let nonSfxCount = 0;
  let sfxCount = 0;
  let nextTopY = panelY + 28;

  for (const rawLine of panel.lines ?? []) {
    if (rawLine.kind === "sfx") {
      if (sfxCount >= MANGAKA_LETTERING_CONSTANTS.maxSfxPerPanel) continue;
      sfxCount += 1;
    } else {
      if (nonSfxCount >= MANGAKA_LETTERING_CONSTANTS.maxBalloonsPerPanel) continue;
      nonSfxCount += 1;
    }

    outScriptOrderIds.push(rawLine.id);
    const words = countMangakaWordsCjkAware(rawLine.text);
    const clampedWords = Math.min(
      MANGAKA_LETTERING_CONSTANTS.maxWordsPerBalloon,
      Math.max(1, words),
    );
    const lineCount = Math.min(
      MANGAKA_LETTERING_CONSTANTS.maxLinesPerBalloon,
      Math.max(1, Math.ceil(clampedWords / 6)),
    );

    const style: MangakaBalloonStyleId =
      rawLine.kind === "thought"
        ? "cloud"
        : rawLine.kind === "caption"
          ? "box"
          : rawLine.kind === "sfx"
            ? "none"
            : rawLine.shout
              ? "burst"
              : "oval";

    let speakerSide: "left" | "right" | "center" = "center";
    if (rawLine.speaker) {
      const normalizedSpeaker = rawLine.speaker.trim().toLowerCase();
      const existing = sceneMap.get(normalizedSpeaker);
      if (existing) {
        speakerSide = existing;
      } else {
        const assigned: "left" | "right" = sceneMap.size % 2 === 0 ? "left" : "right";
        sceneMap.set(normalizedSpeaker, assigned);
        speakerSide = assigned;
      }
    }

    const boxW = rawLine.kind === "sfx" ? 180 : Math.min(260, Math.max(160, panelW * 0.34));
    const boxH = rawLine.kind === "sfx" ? 56 : 36 + lineCount * 24;
    const minX = Math.max(MANGAKA_LETTERING_CONSTANTS.edgeMarginPx, panelX + 24);
    const maxX = Math.min(
      MANGAKA_STRIP_CONSTANTS.stripCanvasWidthPx - MANGAKA_LETTERING_CONSTANTS.edgeMarginPx - boxW,
      panelX + panelW - boxW - 24,
    );

    let boxX =
      speakerSide === "left"
        ? minX
        : speakerSide === "right"
          ? maxX
          : Math.round((minX + maxX) / 2);

    let boxY = Math.min(panelY + panelH - boxH - 20, nextTopY);
    const candidateBox = { x: boxX, y: boxY, w: boxW, h: boxH };

    for (const face of localFaces) {
      if (boxesOverlapWithPadding(candidateBox, face, 8)) {
        boxY = Math.min(panelY + panelH - boxH - 12, face.y + face.h + 16);
        boxX = speakerSide === "left" ? maxX : minX;
      }
    }

    nextTopY = boxY + boxH + Math.max(MANGAKA_LETTERING_CONSTANTS.orderStepPx, 18);

    outLetters.push({
      id: rawLine.id,
      pageId: panel.pageId,
      lineIndex: outLetters.length,
      kind: rawLine.kind,
      style,
      place: "inPanel",
      speaker: rawLine.speaker,
      side: speakerSide,
      text: textCase === "caps" ? rawLine.text.toUpperCase() : rawLine.text,
      font: rawLine.kind === "sfx" ? "sfx-display" : "manga-dialogue",
      textCase,
      capHeightPx:
        rawLine.kind === "sfx"
          ? MANGAKA_LETTERING_CONSTANTS.sfxCapByTier[2]
          : rawLine.shout
            ? Math.round(capPx * MANGAKA_LETTERING_CONSTANTS.shoutScale)
            : capPx,
      wordCount: clampedWords,
      lineCount,
      rotationDeg: rawLine.kind === "sfx" ? MANGAKA_LETTERING_CONSTANTS.sfxRotationDeg : 0,
      box: { x: boxX, y: boxY, w: boxW, h: boxH },
    });
  }
}

export interface StoryboarderShotDirectiveSpec {
  readonly panelId: string;
  readonly lensFocalLengthMm: 18 | 24 | 35 | 50 | 85;
  readonly framingCode: "EWS" | "WS" | "MS" | "CU" | "ECU";
  readonly cameraAngleLabel: "low-heroic" | "eye-level" | "high-overview" | "dutch-tension";
  readonly ruleOfThirdsAnchor: "top-left" | "top-right" | "center" | "bottom-third";
  readonly summaryKo: string;
}

/**
 * Wonder Unit Storyboarder 3D Shot Generator + Clip Studio 컷 연출 카메라 디렉티브 컴파일러
 */
export function compileStoryboarderShotDirective(
  panel: Pick<MangakaPanelInputSpec, "pageId" | "role" | "aspect" | "keyBeat">,
  cameraYawDeg: number,
): StoryboarderShotDirectiveSpec {
  const normalizedYaw = ((cameraYawDeg % 360) + 360) % 360;
  const lensByRole: Readonly<Record<MangakaPanelInputSpec["role"], 18 | 24 | 35 | 50 | 85>> = {
    hook: 24,
    establishing: 18,
    action: 24,
    impact: 18,
    reveal: 35,
    dialogue: 50,
    reaction: 85,
    insert: 85,
    vignette: 50,
    cliffhanger: 24,
    textOnly: 35,
  };
  const framingByRole: Readonly<
    Record<MangakaPanelInputSpec["role"], StoryboarderShotDirectiveSpec["framingCode"]>
  > = {
    hook: "WS",
    establishing: "EWS",
    action: "MS",
    impact: "CU",
    reveal: "WS",
    dialogue: "MS",
    reaction: "CU",
    insert: "ECU",
    vignette: "MS",
    cliffhanger: "CU",
    textOnly: "MS",
  };
  const lensFocalLengthMm = lensByRole[panel.role];
  const framingCode = framingByRole[panel.role];
  const cameraAngleLabel: StoryboarderShotDirectiveSpec["cameraAngleLabel"] =
    panel.role === "establishing"
      ? "high-overview"
      : panel.role === "impact" || panel.role === "cliffhanger"
        ? "low-heroic"
        : panel.keyBeat
          ? "dutch-tension"
          : "eye-level";
  const ruleOfThirdsAnchor: StoryboarderShotDirectiveSpec["ruleOfThirdsAnchor"] =
    normalizedYaw >= 180 ? "top-right" : normalizedYaw >= 45 ? "top-left" : "center";

  return {
    panelId: panel.pageId,
    lensFocalLengthMm,
    framingCode,
    cameraAngleLabel,
    ruleOfThirdsAnchor,
    summaryKo: `${panel.pageId}: ${lensFocalLengthMm}mm (${framingCode}) · ${cameraAngleLabel} · 3분할(${ruleOfThirdsAnchor})`,
  };
}

export interface MangakaMovingToonTimelineSpec {
  readonly triggerId: "scroll-parallax" | "tap-shake" | "sfx-bounce";
  readonly durationMs: number;
  readonly springStiffness: number;
  readonly dampingRatio: number;
  readonly spineMeshDeformVertices: number;
  readonly parallaxDepthMultipliers: {
    readonly bg3dLayer: number;
    readonly characterMidLayer: number;
    readonly sfxForegroundLayer: number;
  };
  readonly summaryKo: string;
}

/**
 * Rive Interactive State Machine & Spine 2.5D 무빙툰 스크롤 패럴랙스·진동·바운스 타임라인 계산기
 */
export function buildMangakaMovingToonTimelineSpec(
  triggerId: "scroll-parallax" | "tap-shake" | "sfx-bounce",
  stripHeightPx: number,
): MangakaMovingToonTimelineSpec {
  const clampedHeight = Math.max(800, stripHeightPx);
  if (triggerId === "scroll-parallax") {
    const durationMs = Math.min(2400, Math.round(clampedHeight / 6));
    return {
      triggerId,
      durationMs,
      springStiffness: 180,
      dampingRatio: 0.86,
      spineMeshDeformVertices: 32,
      parallaxDepthMultipliers: {
        bg3dLayer: 0.35,
        characterMidLayer: 1.0,
        sfxForegroundLayer: 1.45,
      },
      summaryKo: `Scroll Parallax (${durationMs}ms · BG 0.35x / Actor 1.0x / SFX 1.45x · Spine 32v)`,
    };
  }
  if (triggerId === "tap-shake") {
    return {
      triggerId,
      durationMs: 420,
      springStiffness: 420,
      dampingRatio: 0.48,
      spineMeshDeformVertices: 24,
      parallaxDepthMultipliers: {
        bg3dLayer: 0.6,
        characterMidLayer: 1.25,
        sfxForegroundLayer: 1.65,
      },
      summaryKo: "Tap Camera Shake (420ms · Stiffness 420 · Damping 0.48 · Spine 24v)",
    };
  }
  return {
    triggerId,
    durationMs: 560,
    springStiffness: 340,
    dampingRatio: 0.55,
    spineMeshDeformVertices: 18,
    parallaxDepthMultipliers: {
      bg3dLayer: 0.25,
      characterMidLayer: 1.05,
      sfxForegroundLayer: 1.85,
    },
    summaryKo: "SFX Elastic Bounce (560ms · SFX Scale 1.85x · Damping 0.55 · Spine 18v)",
  };
}

export interface CampfireLorebookEpisodeBeatSummary {
  readonly episodeArcPhase: "opening-hook" | "world-establishment" | "rising-conflict" | "cliffhanger-turn";
  readonly linkedLoreEntitiesCount: number;
  readonly activeRelationshipEdges: readonly string[];
  readonly totalWordBudgetCjk: number;
  readonly summaryKo: string;
}

/**
 * Campfire Writing / NovelAI 세계관 로어북·인물 관계도·에피소드 비트 매트릭스 계산기
 */
export function buildCampfireEpisodeLorebookBeatMatrix(
  panels: readonly MangakaPanelInputSpec[],
  castCount: number,
): CampfireLorebookEpisodeBeatMatrixResult {
  const totalWordBudgetCjk = panels.reduce(
    (acc, panel) =>
      acc +
      (panel.lines ?? []).reduce((lineAcc, line) => lineAcc + countMangakaWordsCjkAware(line.text), 0),
    0,
  );
  const hasCliffhanger = panels.some((p) => p.role === "cliffhanger");
  const episodeArcPhase: CampfireLorebookEpisodeBeatSummary["episodeArcPhase"] = hasCliffhanger
    ? "cliffhanger-turn"
    : panels.length >= 3
      ? "rising-conflict"
      : "opening-hook";
  const linkedLoreEntitiesCount = Math.max(1, castCount) + 2;
  const activeRelationshipEdges = Object.freeze([
    "Mira ↔ Captain Krail (추격·경계)",
    "Mira ↔ Old Bram (은신처 조력)",
  ]);
  return {
    episodeArcPhase,
    linkedLoreEntitiesCount,
    activeRelationshipEdges,
    totalWordBudgetCjk,
    summaryKo: `Campfire 로어북(${linkedLoreEntitiesCount}항목) · 관계선 ${activeRelationshipEdges.length}개 · 대사량 ${totalWordBudgetCjk}어절 (${episodeArcPhase})`,
  };
}

export type CampfireLorebookEpisodeBeatMatrixResult = CampfireLorebookEpisodeBeatSummary;
