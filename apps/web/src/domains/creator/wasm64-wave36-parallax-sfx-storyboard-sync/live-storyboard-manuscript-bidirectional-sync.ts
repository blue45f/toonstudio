/**
 * Wave-36: 라이브 스토리보드(콘티/대본) ↔ 고해상도 완성 원고 말풍선 양방향 3-Way 앵커 동기화 엔진.
 *
 * 한국어 어절 보존 줄바꿈(`[word-break: keep-all]`) 메트릭 추정기(`estimateKoreanBalloonBox`)를 바탕으로
 * 대본 대사 수정 및 컷 순서 재배열을 고해상도 원고 말풍선에 즉시 반영한다.
 * 작가가 원고 캔버스에서 직접 다듬은 말풍선 위치·꼬리·선 두께 오버라이드는 충돌이 없는 한 보존하며,
 * 대본과 원고가 동일한 앵커를 서로 다르게 동시 수정한 경우 구조화된 충돌 레코드(`SyncConflictRecord`)를 발행한다.
 */

/** 웹툰 말풍선 외곽선 형태 분류. */
export type BalloonShapeKind = "cloud-thought" | "ellipse" | "rounded-rect" | "shout-burst";

/** 한국어 어절 보존 말풍선 크기 추정 입력. */
export interface KoreanBalloonBoxInput {
  readonly balloonShape?: BalloonShapeKind;
  readonly fontSizePx?: number;
  readonly letterSpacingEm?: number;
  readonly lineHeightRatio?: number;
  readonly maxCharsPerLine?: number;
  readonly text: string;
}

/** 한국어 `keep-all` 줄바꿈 및 말풍선 외접 박스 추정 결과. */
export interface KoreanBalloonBoxEstimate {
  readonly contentHeightPx: number;
  readonly contentWidthPx: number;
  readonly eojeolCount: number;
  readonly hadEmergencyTokenSplit: boolean;
  readonly lineCount: number;
  readonly lines: readonly string[];
  readonly maxLinePixelWidth: number;
  readonly recommendedHeightPx: number;
  readonly recommendedWidthPx: number;
}

/** 컷 내부 로컬 2D 좌표(px). */
export interface SyncPoint2D {
  readonly x: number;
  readonly y: number;
}

/** 말풍선 가로·세로 크기(px). */
export interface SyncSize2D {
  readonly heightPx: number;
  readonly widthPx: number;
}

/** 작가가 고해상도 원고에서 직접 조정한 말풍선 시각 스타일 오버라이드. */
export interface ArtistBalloonStyleOverrides {
  readonly fontFamily?: string;
  readonly fontSizePx?: number;
  readonly rotationDeg?: number;
  readonly strokeWidthPx?: number;
  readonly tailTipOffset?: SyncPoint2D;
}

/** 직전 동기화 시점의 공통 기준(Base) 앵커 스냅샷. */
export interface BaseSyncedDialogueAnchor {
  readonly anchorId: string;
  readonly balloonShape: BalloonShapeKind;
  readonly cutId: string;
  readonly cutOrderIndex: number;
  readonly dialogueText: string;
  readonly position: SyncPoint2D;
  readonly readingOrderIndex: number;
  readonly size: SyncSize2D;
  readonly speakerId: string;
}

/** 스토리보드·대본(Conti/Script) 측 현재 대사 앵커 상태. */
export interface StoryboardDialogueAnchor {
  readonly anchorId: string;
  readonly balloonShape: BalloonShapeKind;
  readonly cutId: string;
  readonly cutOrderIndex: number;
  readonly dialogueText: string;
  readonly readingOrderIndex: number;
  readonly speakerId: string;
  readonly suggestedPosition?: SyncPoint2D;
}

/** 고해상도 완성 원고(Manuscript) 측 현재 말풍선 노드 상태. */
export interface ManuscriptBalloonNode {
  readonly anchorId: string;
  readonly balloonShape: BalloonShapeKind;
  readonly cutId: string;
  readonly cutOrderIndex: number;
  readonly dialogueText: string;
  readonly position: SyncPoint2D;
  readonly readingOrderIndex: number;
  readonly size: SyncSize2D;
  readonly speakerId: string;
  readonly styleOverrides?: ArtistBalloonStyleOverrides;
}

/** 3-Way 양방향 동기화 충돌 유형. */
export type SyncConflictKind =
  | "concurrent-cut-assignment"
  | "concurrent-dialogue-edit"
  | "concurrent-shape-edit"
  | "delete-modify-conflict";

/** 동시 편집 충돌 발생 시 우선 채택 정책. */
export type SyncConflictResolutionPolicy =
  | "prefer-manuscript-flag-conflict"
  | "prefer-storyboard-flag-conflict";

/** 대본과 원고가 동일 앵커를 상충되게 편집했을 때 발행되는 구조화된 충돌 레코드. */
export interface SyncConflictRecord {
  readonly anchorId: string;
  readonly appliedPolicy: SyncConflictResolutionPolicy;
  readonly baseValue: string;
  readonly cutId: string;
  readonly descriptionKo: string;
  readonly kind: SyncConflictKind;
  readonly manuscriptValue: string;
  readonly storyboardValue: string;
}

/** 동기화 완료 후 단일 앵커의 상태 출처 태그. */
export type AnchorSyncStatus =
  | "conflicted"
  | "created-from-manuscript"
  | "created-from-storyboard"
  | "propagated-from-manuscript"
  | "unchanged"
  | "updated-from-storyboard";

/** 3-Way 병합이 완료된 대사·말풍선 앵커 결과. */
export interface SyncedDialogueAnchorResult {
  readonly anchorId: string;
  readonly artistPositionPreserved: boolean;
  readonly balloonShape: BalloonShapeKind;
  readonly cutId: string;
  readonly cutOrderIndex: number;
  readonly dialogueText: string;
  readonly overflowWarning: boolean;
  readonly position: SyncPoint2D;
  readonly readingOrderIndex: number;
  readonly size: SyncSize2D;
  readonly speakerId: string;
  readonly styleOverrides?: ArtistBalloonStyleOverrides;
  readonly syncStatus: AnchorSyncStatus;
  readonly wrappedLines: readonly string[];
}

/** 양방향 동기화 집계 요약. */
export interface StoryboardManuscriptSyncSummary {
  readonly conflictCount: number;
  readonly createdFromManuscriptCount: number;
  readonly createdFromStoryboardCount: number;
  readonly deletedCount: number;
  readonly propagatedFromManuscriptCount: number;
  readonly unchangedCount: number;
  readonly updatedFromStoryboardCount: number;
}

/** 스토리보드 ↔ 원고 3-Way 동기화 실행 입력. */
export interface StoryboardManuscriptSyncInput {
  readonly baseAnchors: readonly BaseSyncedDialogueAnchor[];
  readonly conflictPolicy?: SyncConflictResolutionPolicy;
  readonly cutSafeWidthPx?: number;
  readonly defaultFontSizePx?: number;
  readonly manuscriptBalloons: readonly ManuscriptBalloonNode[];
  readonly positionChangeEpsilonPx?: number;
  readonly storyboardAnchors: readonly StoryboardDialogueAnchor[];
}

/** 스토리보드 ↔ 원고 3-Way 동기화 실행 결과. */
export interface StoryboardManuscriptSyncResult {
  readonly conflicts: readonly SyncConflictRecord[];
  readonly deletedAnchorIds: readonly string[];
  readonly summary: StoryboardManuscriptSyncSummary;
  readonly syncedAnchors: readonly SyncedDialogueAnchorResult[];
}

function normalizeDialogueText(raw: string): string {
  return raw.replace(/\r\n?/gu, "\n").trim();
}

function isFullWidthCodePoint(cp: number): boolean {
  return (
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x3130 && cp <= 0x318f) ||
    (cp >= 0x2e80 && cp <= 0x9fff) ||
    (cp >= 0xff01 && cp <= 0xff60)
  );
}

function measureGlyphAdvanceRatio(char: string): number {
  if (char === " ") return 0.32;
  if (isFullWidthCodePoint(char.codePointAt(0) ?? 0)) return 1.0;
  if (",.;:'\"`!|()[]{}".includes(char)) return 0.38;
  return "?~-+=*/\\<>".includes(char) ? 0.52 : 0.58;
}

function measureStringPixelWidth(text: string, fontSizePx: number, letterSpacingEm: number): number {
  const chars = Array.from(text);
  if (chars.length === 0) return 0;
  let totalRatio = 0;
  for (const ch of chars) totalRatio += measureGlyphAdvanceRatio(ch);
  return Math.max(0, (totalRatio + Math.max(0, chars.length - 1) * letterSpacingEm) * fontSizePx);
}

function splitOversizedToken(token: string, maxLineWidthPx: number, fontSizePx: number, letterSpacingEm: number): readonly string[] {
  const pieces: string[] = [];
  let current = "";
  for (const ch of Array.from(token)) {
    const candidate = current + ch;
    if (current.length > 0 && measureStringPixelWidth(candidate, fontSizePx, letterSpacingEm) > maxLineWidthPx) {
      pieces.push(current);
      current = ch;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

/** 한국어 어절 단위 줄바꿈(`[word-break: keep-all]`) 규칙에 따라 대사 줄바꿈과 말풍선 크기를 산출한다. */
export function estimateKoreanBalloonBox(input: KoreanBalloonBoxInput): KoreanBalloonBoxEstimate {
  const fontSizePx = Math.max(8, input.fontSizePx ?? 24);
  const lineHeightRatio = Math.max(1.05, input.lineHeightRatio ?? 1.38);
  const letterSpacingEm = input.letterSpacingEm ?? -0.02;
  const maxCharsPerLine = Math.max(3, Math.floor(input.maxCharsPerLine ?? 10));
  const balloonShape: BalloonShapeKind = input.balloonShape ?? "ellipse";
  const maxLineWidthPx = maxCharsPerLine * fontSizePx * Math.max(0.8, 1 + letterSpacingEm);
  const normalized = normalizeDialogueText(input.text);

  if (normalized.length === 0) {
    const emptyPad = Math.ceil(fontSizePx * 2.2);
    return {
      contentHeightPx: 0, contentWidthPx: 0, eojeolCount: 0, hadEmergencyTokenSplit: false,
      lineCount: 0, lines: [], maxLinePixelWidth: 0, recommendedHeightPx: emptyPad, recommendedWidthPx: emptyPad,
    };
  }

  const lines: string[] = [];
  let eojeolCount = 0;
  let hadEmergencyTokenSplit = false;

  for (const rawParagraph of normalized.split("\n")) {
    const trimmed = rawParagraph.trim();
    if (trimmed.length === 0) {
      lines.push("");
      continue;
    }
    const eojeols = trimmed.split(/\s+/u).filter((tok) => tok.length > 0);
    eojeolCount += eojeols.length;
    let currentLine = "";

    for (const eojeol of eojeols) {
      if (measureStringPixelWidth(eojeol, fontSizePx, letterSpacingEm) > maxLineWidthPx) {
        if (currentLine.length > 0) lines.push(currentLine);
        hadEmergencyTokenSplit = true;
        const chunks = splitOversizedToken(eojeol, maxLineWidthPx, fontSizePx, letterSpacingEm);
        for (let idx = 0; idx < chunks.length - 1; idx += 1) {
          const chunk = chunks[idx];
          if (chunk !== undefined) lines.push(chunk);
        }
        currentLine = chunks[chunks.length - 1] ?? "";
      } else if (currentLine.length === 0) {
        currentLine = eojeol;
      } else if (measureStringPixelWidth(`${currentLine} ${eojeol}`, fontSizePx, letterSpacingEm) <= maxLineWidthPx) {
        currentLine = `${currentLine} ${eojeol}`;
      } else {
        lines.push(currentLine);
        currentLine = eojeol;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);
  }

  let maxLinePixelWidth = 0;
  for (const line of lines) {
    maxLinePixelWidth = Math.max(maxLinePixelWidth, measureStringPixelWidth(line, fontSizePx, letterSpacingEm));
  }
  const lineCount = lines.length;
  const contentWidthPx = Math.ceil(maxLinePixelWidth);
  const contentHeightPx = Math.ceil(fontSizePx + Math.max(0, lineCount - 1) * fontSizePx * lineHeightRatio);
  const shapeFactor = balloonShape === "rounded-rect"
    ? { padX: fontSizePx * 1.4, padY: fontSizePx * 1.25, scaleX: 1.04, scaleY: 1.04 }
    : balloonShape === "shout-burst"
      ? { padX: fontSizePx * 2.0, padY: fontSizePx * 1.8, scaleX: 1.32, scaleY: 1.32 }
      : { padX: fontSizePx * 1.65, padY: fontSizePx * 1.5, scaleX: 1.26, scaleY: 1.26 };

  return {
    contentWidthPx, contentHeightPx, eojeolCount, hadEmergencyTokenSplit, lineCount, lines, maxLinePixelWidth,
    recommendedHeightPx: Math.ceil(contentHeightPx * shapeFactor.scaleY + shapeFactor.padY),
    recommendedWidthPx: Math.ceil(contentWidthPx * shapeFactor.scaleX + shapeFactor.padX),
  };
}

function makeConflict(
  anchorId: string,
  cutId: string,
  kind: SyncConflictKind,
  appliedPolicy: SyncConflictResolutionPolicy,
  baseValue: string,
  storyboardValue: string,
  manuscriptValue: string,
  descriptionKo: string,
): SyncConflictRecord {
  return { anchorId, appliedPolicy, baseValue, cutId, descriptionKo, kind, manuscriptValue, storyboardValue };
}

function makeSyncedResult(
  fields: Omit<SyncedDialogueAnchorResult, "styleOverrides">,
  styleOverrides?: ArtistBalloonStyleOverrides,
): SyncedDialogueAnchorResult {
  return styleOverrides !== undefined ? { ...fields, styleOverrides } : fields;
}

/**
 * 기준 스냅샷(`baseAnchors`), 스토리보드(`storyboardAnchors`), 고해상도 원고(`manuscriptBalloons`)를
 * 3-Way 병합하여 대사 변경·컷 순서 재배열·작가 수동 배치 보존·충돌 감지를 수행한다.
 */
export function syncStoryboardWithManuscript(input: StoryboardManuscriptSyncInput): StoryboardManuscriptSyncResult {
  const conflictPolicy: SyncConflictResolutionPolicy = input.conflictPolicy ?? "prefer-manuscript-flag-conflict";
  const defaultFontSizePx = Math.max(8, input.defaultFontSizePx ?? 24);
  const cutSafeWidthPx = Math.max(120, input.cutSafeWidthPx ?? 620);
  const positionEpsilonPx = Math.max(0, input.positionChangeEpsilonPx ?? 0.5);

  const baseMap = new Map(input.baseAnchors.map((b) => [b.anchorId, b]));
  const storyMap = new Map(input.storyboardAnchors.map((s) => [s.anchorId, s]));
  const manuMap = new Map(input.manuscriptBalloons.map((m) => [m.anchorId, m]));
  const sortedIds = [...new Set<string>([...baseMap.keys(), ...storyMap.keys(), ...manuMap.keys()])].sort((a, b) => a.localeCompare(b));

  const syncedAnchors: SyncedDialogueAnchorResult[] = [];
  const deletedAnchorIds: string[] = [];
  const conflicts: SyncConflictRecord[] = [];
  let unchangedCount = 0;
  let updatedFromStoryboardCount = 0;
  let propagatedFromManuscriptCount = 0;
  let createdFromStoryboardCount = 0;
  let createdFromManuscriptCount = 0;

  for (const anchorId of sortedIds) {
    const base = baseMap.get(anchorId);
    const story = storyMap.get(anchorId);
    const manu = manuMap.get(anchorId);

    if (!story && !manu) {
      if (base) deletedAnchorIds.push(anchorId);
      continue;
    }

    if (!base && story && !manu) {
      const box = estimateKoreanBalloonBox({ balloonShape: story.balloonShape, fontSizePx: defaultFontSizePx, text: story.dialogueText });
      createdFromStoryboardCount += 1;
      syncedAnchors.push(makeSyncedResult({
        anchorId, artistPositionPreserved: false, balloonShape: story.balloonShape, cutId: story.cutId,
        cutOrderIndex: story.cutOrderIndex, dialogueText: normalizeDialogueText(story.dialogueText),
        overflowWarning: box.recommendedWidthPx > cutSafeWidthPx, position: story.suggestedPosition ?? { x: 160, y: 140 },
        readingOrderIndex: story.readingOrderIndex, size: { widthPx: box.recommendedWidthPx, heightPx: box.recommendedHeightPx },
        speakerId: story.speakerId, syncStatus: "created-from-storyboard", wrappedLines: box.lines,
      }));
      continue;
    }

    if (!base && !story && manu) {
      const box = estimateKoreanBalloonBox({ balloonShape: manu.balloonShape, fontSizePx: manu.styleOverrides?.fontSizePx ?? defaultFontSizePx, text: manu.dialogueText });
      createdFromManuscriptCount += 1;
      syncedAnchors.push(makeSyncedResult({
        anchorId, artistPositionPreserved: true, balloonShape: manu.balloonShape, cutId: manu.cutId,
        cutOrderIndex: manu.cutOrderIndex, dialogueText: normalizeDialogueText(manu.dialogueText),
        overflowWarning: manu.size.widthPx > cutSafeWidthPx, position: manu.position,
        readingOrderIndex: manu.readingOrderIndex, size: manu.size, speakerId: manu.speakerId,
        syncStatus: "created-from-manuscript", wrappedLines: box.lines,
      }, manu.styleOverrides));
      continue;
    }

    if (base && !story && manu) {
      const moved = Math.hypot(manu.position.x - base.position.x, manu.position.y - base.position.y) > positionEpsilonPx;
      const manuModified = normalizeDialogueText(manu.dialogueText) !== normalizeDialogueText(base.dialogueText)
        || manu.balloonShape !== base.balloonShape || moved || manu.styleOverrides !== undefined;
      if (!manuModified) {
        deletedAnchorIds.push(anchorId);
        continue;
      }
      conflicts.push(makeConflict(
        anchorId, manu.cutId, "delete-modify-conflict", conflictPolicy,
        normalizeDialogueText(base.dialogueText), "<deleted>", normalizeDialogueText(manu.dialogueText),
        "대본에서 삭제된 대사이나 원고에서 작가가 위치·대사·스타일을 수정해 보존 후 충돌로 표시했습니다.",
      ));
      const box = estimateKoreanBalloonBox({ balloonShape: manu.balloonShape, fontSizePx: manu.styleOverrides?.fontSizePx ?? defaultFontSizePx, text: manu.dialogueText });
      syncedAnchors.push(makeSyncedResult({
        anchorId, artistPositionPreserved: true, balloonShape: manu.balloonShape, cutId: manu.cutId,
        cutOrderIndex: manu.cutOrderIndex, dialogueText: normalizeDialogueText(manu.dialogueText),
        overflowWarning: manu.size.widthPx > cutSafeWidthPx, position: manu.position,
        readingOrderIndex: manu.readingOrderIndex, size: manu.size, speakerId: manu.speakerId,
        syncStatus: "conflicted", wrappedLines: box.lines,
      }, manu.styleOverrides));
      continue;
    }

    if (base && story && !manu) {
      const storyModified = normalizeDialogueText(story.dialogueText) !== normalizeDialogueText(base.dialogueText) || story.balloonShape !== base.balloonShape;
      if (!storyModified) {
        deletedAnchorIds.push(anchorId);
        continue;
      }
      conflicts.push(makeConflict(
        anchorId, story.cutId, "delete-modify-conflict", conflictPolicy,
        normalizeDialogueText(base.dialogueText), normalizeDialogueText(story.dialogueText), "<deleted>",
        "원고에서 말풍선이 삭제되었으나 대본에서 대사가 갱신되어 충돌로 기록했습니다.",
      ));
      const box = estimateKoreanBalloonBox({ balloonShape: story.balloonShape, fontSizePx: defaultFontSizePx, text: story.dialogueText });
      syncedAnchors.push(makeSyncedResult({
        anchorId, artistPositionPreserved: false, balloonShape: story.balloonShape, cutId: story.cutId,
        cutOrderIndex: story.cutOrderIndex, dialogueText: normalizeDialogueText(story.dialogueText),
        overflowWarning: box.recommendedWidthPx > cutSafeWidthPx, position: story.suggestedPosition ?? base.position,
        readingOrderIndex: story.readingOrderIndex, size: { widthPx: box.recommendedWidthPx, heightPx: box.recommendedHeightPx },
        speakerId: story.speakerId, syncStatus: "conflicted", wrappedLines: box.lines,
      }));
      continue;
    }

    if (!story || !manu) continue;

    const baseText = base ? normalizeDialogueText(base.dialogueText) : "";
    const storyText = normalizeDialogueText(story.dialogueText);
    const manuText = normalizeDialogueText(manu.dialogueText);
    const storyChangedText = base ? storyText !== baseText : storyText !== manuText;
    const manuChangedText = base ? manuText !== baseText : storyText !== manuText;

    let hadAnchorConflict = false;
    let resolvedText: string;
    let textUpdatedByStoryboard = false;
    let textPropagatedFromManuscript = false;

    if (storyChangedText && manuChangedText && storyText !== manuText) {
      hadAnchorConflict = true;
      resolvedText = conflictPolicy === "prefer-storyboard-flag-conflict" ? storyText : manuText;
      conflicts.push(makeConflict(anchorId, story.cutId, "concurrent-dialogue-edit", conflictPolicy, baseText, storyText, manuText, "대본과 원고에서 동일 앵커의 대사가 서로 다르게 동시 수정되었습니다."));
    } else if (storyChangedText && !manuChangedText) {
      resolvedText = storyText;
      textUpdatedByStoryboard = true;
    } else if (!storyChangedText && manuChangedText) {
      resolvedText = manuText;
      textPropagatedFromManuscript = true;
    } else {
      resolvedText = storyText;
    }

    const baseShape = base?.balloonShape ?? manu.balloonShape;
    const storyChangedShape = story.balloonShape !== baseShape;
    const manuChangedShape = manu.balloonShape !== baseShape;
    let resolvedShape: BalloonShapeKind;

    if (storyChangedShape && manuChangedShape && story.balloonShape !== manu.balloonShape) {
      hadAnchorConflict = true;
      resolvedShape = conflictPolicy === "prefer-storyboard-flag-conflict" ? story.balloonShape : manu.balloonShape;
      conflicts.push(makeConflict(anchorId, story.cutId, "concurrent-shape-edit", conflictPolicy, baseShape, story.balloonShape, manu.balloonShape, "대본과 원고에서 말풍선 외곽 형태가 서로 다르게 변경되었습니다."));
    } else {
      resolvedShape = storyChangedShape ? story.balloonShape : manu.balloonShape;
    }

    const baseCutId = base?.cutId ?? manu.cutId;
    const storyMovedCut = story.cutId !== baseCutId;
    const manuMovedCut = manu.cutId !== baseCutId;
    let resolvedCutId = story.cutId;
    let resolvedCutOrderIndex = story.cutOrderIndex;

    if (storyMovedCut && manuMovedCut && story.cutId !== manu.cutId) {
      hadAnchorConflict = true;
      resolvedCutId = conflictPolicy === "prefer-storyboard-flag-conflict" ? story.cutId : manu.cutId;
      resolvedCutOrderIndex = conflictPolicy === "prefer-storyboard-flag-conflict" ? story.cutOrderIndex : manu.cutOrderIndex;
      conflicts.push(makeConflict(anchorId, resolvedCutId, "concurrent-cut-assignment", conflictPolicy, baseCutId, story.cutId, manu.cutId, "대본과 원고에서 말풍선이 서로 다른 컷으로 이동되었습니다."));
    }

    const estimatedBox = estimateKoreanBalloonBox({ balloonShape: resolvedShape, fontSizePx: manu.styleOverrides?.fontSizePx ?? defaultFontSizePx, text: resolvedText });
    const shouldResize = textUpdatedByStoryboard || (hadAnchorConflict && conflictPolicy === "prefer-storyboard-flag-conflict") || (storyChangedShape && !manuChangedShape);
    const resolvedSize: SyncSize2D = shouldResize ? { widthPx: estimatedBox.recommendedWidthPx, heightPx: estimatedBox.recommendedHeightPx } : manu.size;
    const prevArea = Math.max(1, manu.size.widthPx * manu.size.heightPx);
    const overflowWarning = resolvedSize.widthPx > cutSafeWidthPx || resolvedSize.widthPx * resolvedSize.heightPx > prevArea * 1.45;
    const cutOrderChanged = base !== undefined && resolvedCutOrderIndex !== base.cutOrderIndex;
    const readingOrderChanged = base !== undefined && story.readingOrderIndex !== base.readingOrderIndex;

    let syncStatus: AnchorSyncStatus = "unchanged";
    if (hadAnchorConflict) {
      syncStatus = "conflicted";
    } else if (textUpdatedByStoryboard || (storyChangedShape && !manuChangedShape) || storyMovedCut || cutOrderChanged || readingOrderChanged) {
      syncStatus = "updated-from-storyboard";
      updatedFromStoryboardCount += 1;
    } else if (textPropagatedFromManuscript || manuChangedShape || manuMovedCut) {
      syncStatus = "propagated-from-manuscript";
      propagatedFromManuscriptCount += 1;
    } else {
      unchangedCount += 1;
    }

    syncedAnchors.push(makeSyncedResult({
      anchorId, artistPositionPreserved: true, balloonShape: resolvedShape, cutId: resolvedCutId,
      cutOrderIndex: resolvedCutOrderIndex, dialogueText: resolvedText, overflowWarning,
      position: manu.position, readingOrderIndex: story.readingOrderIndex, size: resolvedSize,
      speakerId: story.speakerId, syncStatus, wrappedLines: estimatedBox.lines,
    }, manu.styleOverrides));
  }

  syncedAnchors.sort((a, b) => a.cutOrderIndex - b.cutOrderIndex || a.readingOrderIndex - b.readingOrderIndex || a.anchorId.localeCompare(b.anchorId));

  return {
    conflicts,
    deletedAnchorIds,
    summary: {
      conflictCount: conflicts.length, createdFromManuscriptCount, createdFromStoryboardCount,
      deletedCount: deletedAnchorIds.length, propagatedFromManuscriptCount, unchangedCount, updatedFromStoryboardCount,
    },
    syncedAnchors,
  };
}
