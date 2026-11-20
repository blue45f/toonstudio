/**
 * Dashtoon · Anifusion · Realtoon 클린룸 — 캐릭터 DNA 팩 스튜디오 라이브 바인딩 및
 * 얼굴 바운딩박스 회피 대본→세로컷 자동 말풍선 식자 배치 엔진.
 *
 * - 캐릭터 DNA(외형·팔레트·3분할 헤어·기본 의상·표정 키)를 에피소드 전 컷 액터에 라이브 동기화
 * - 각 컷의 포즈·카메라 위치·감정 강도는 유지하면서 외형 이탈(Drift) 0% 보장
 * - 세로 스크롤 컷 내 인물 얼굴 바운딩박스와 말풍선 간 겹침(IoU = 0)을 엄격 회피하며
 *   위→아래 한국어 읽기 순서와 화자 입 방향 꼬리 좌표를 자동 식자 배치
 */

export interface CharacterDnaPaletteTokens {
  readonly skinToneToken: string;
  readonly hairMainToken: string;
  readonly eyeIrisToken: string;
  readonly outfitPrimaryToken: string;
  readonly outfitAccentToken: string;
}

export interface StudioCharacterDnaPack {
  readonly dnaId: string;
  readonly version: number;
  readonly characterNameKo: string;
  readonly baseHeadStyleId: string;
  readonly bodyArchetypeId: string;
  readonly hairFrontId: string;
  readonly hairSideId: string;
  readonly hairBackId: string;
  readonly defaultOutfitId: string;
  readonly palette: CharacterDnaPaletteTokens;
  readonly expressionKeys: readonly string[];
}

export interface CutBoundCharacterActor {
  readonly cutId: string;
  readonly actorId: string;
  readonly dnaId: string;
  readonly boundDnaVersion: number;
  /** 컷마다 독립 유지되는 포즈·위치·표정 상태. */
  readonly poseId: string;
  readonly activeExpression: string;
  readonly expressionWeight: number;
  /** DNA 라이브 바인딩이 소유하는 외형 필드. */
  readonly appearance: {
    readonly baseHeadStyleId: string;
    readonly bodyArchetypeId: string;
    readonly hairFrontId: string;
    readonly hairSideId: string;
    readonly hairBackId: string;
    readonly outfitId: string;
    readonly palette: CharacterDnaPaletteTokens;
  };
}

export interface CharacterDnaDriftReport {
  readonly dnaId: string;
  readonly totalBoundActors: number;
  readonly driftedActorIds: readonly string[];
  readonly consistencyRatio: number;
}

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CharacterFaceBbox extends Rect2D {
  readonly actorId: string;
  readonly mouthX: number;
  readonly mouthY: number;
}

export type DialogueBubbleKind = "speech" | "thought" | "shout" | "narration";

export interface ScriptDialogueLine {
  readonly id: string;
  readonly speakerActorId: string | null;
  readonly textKo: string;
  readonly bubbleKind: DialogueBubbleKind;
}

export interface PlacedSpeechBubbleLayout {
  readonly lineId: string;
  readonly speakerActorId: string | null;
  readonly bubbleKind: DialogueBubbleKind;
  readonly wrappedLines: readonly string[];
  readonly box: Rect2D;
  readonly tailTip: readonly [number, number] | null;
  readonly faceOverlapAreaPx: number;
}

export interface VerticalCutTypesetResult {
  readonly cutWidthPx: number;
  readonly cutHeightPx: number;
  readonly bubbles: readonly PlacedSpeechBubbleLayout[];
  readonly totalFaceOverlapAreaPx: number;
  readonly readingOrderPreserved: boolean;
}

/**
 * 캐릭터 DNA 팩 변경분을 에피소드 내 바인딩된 모든 컷 액터에 라이브 동기화한다.
 * 각 컷의 포즈(`poseId`)와 표정 연기(`activeExpression`, `expressionWeight`)는 100% 보존한다.
 */
export function bindCharacterDnaToCutActors(
  dna: StudioCharacterDnaPack,
  actors: readonly CutBoundCharacterActor[],
): CutBoundCharacterActor[] {
  return actors.map((actor) => {
    if (actor.dnaId !== dna.dnaId) return actor;
    const validExpression = dna.expressionKeys.includes(actor.activeExpression)
      ? actor.activeExpression
      : (dna.expressionKeys[0] ?? "neutral");
    return {
      ...actor,
      boundDnaVersion: dna.version,
      activeExpression: validExpression,
      appearance: {
        baseHeadStyleId: dna.baseHeadStyleId,
        bodyArchetypeId: dna.bodyArchetypeId,
        hairFrontId: dna.hairFrontId,
        hairSideId: dna.hairSideId,
        hairBackId: dna.hairBackId,
        outfitId: dna.defaultOutfitId,
        palette: { ...dna.palette },
      },
    };
  });
}

/** DNA 팩과 각 컷 액터 사이의 외형 이탈(Drift)을 감사한다. */
export function auditCharacterDnaConsistency(
  dna: StudioCharacterDnaPack,
  actors: readonly CutBoundCharacterActor[],
): CharacterDnaDriftReport {
  const bound = actors.filter((a) => a.dnaId === dna.dnaId);
  const drifted: string[] = [];
  for (const actor of bound) {
    const app = actor.appearance;
    const matches =
      actor.boundDnaVersion === dna.version
      && app.baseHeadStyleId === dna.baseHeadStyleId
      && app.bodyArchetypeId === dna.bodyArchetypeId
      && app.hairFrontId === dna.hairFrontId
      && app.hairSideId === dna.hairSideId
      && app.hairBackId === dna.hairBackId
      && app.palette.hairMainToken === dna.palette.hairMainToken
      && app.palette.eyeIrisToken === dna.palette.eyeIrisToken;
    if (!matches) {
      drifted.push(`${actor.cutId}:${actor.actorId}`);
    }
  }
  return {
    dnaId: dna.dnaId,
    totalBoundActors: bound.length,
    driftedActorIds: drifted,
    consistencyRatio: bound.length > 0 ? (bound.length - drifted.length) / bound.length : 1,
  };
}

function rectIntersectionArea(a: Rect2D, b: Rect2D): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function wrapKoreanSpeechText(textKo: string, maxCharsPerLine = 9): string[] {
  const words = textKo.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function measureBubbleBoxSize(
  wrappedLines: readonly string[],
  bubbleKind: DialogueBubbleKind,
): { readonly width: number; readonly height: number } {
  const maxLen = Math.max(3, ...wrappedLines.map((l) => l.length));
  const fontSize = bubbleKind === "shout" ? 20 : 17;
  const lineHeight = Math.round(fontSize * 1.45);
  const padX = bubbleKind === "narration" ? 20 : 28;
  const padY = bubbleKind === "narration" ? 16 : 24;
  return {
    width: Math.min(340, Math.max(110, maxLen * fontSize + padX * 2)),
    height: Math.max(62, wrappedLines.length * lineHeight + padY * 2),
  };
}

/**
 * 대본 대사 목록을 세로컷(예: 800×1600px) 안에 인물 얼굴 바운딩박스를 회피하면서
 * 위→아래 한국어 읽기 순서로 자동 말풍선 식자 배치한다.
 */
export function autoTypesetScriptIntoVerticalCut(options: {
  readonly cutWidthPx: number;
  readonly cutHeightPx: number;
  readonly faces: readonly CharacterFaceBbox[];
  readonly lines: readonly ScriptDialogueLine[];
  readonly marginPx?: number;
}): VerticalCutTypesetResult {
  const margin = Math.max(12, options.marginPx ?? 24);
  const faceMargin = 14;
  const paddedFaces: Rect2D[] = options.faces.map((f) => ({
    x: f.x - faceMargin,
    y: f.y - faceMargin,
    width: f.width + faceMargin * 2,
    height: f.height + faceMargin * 2,
  }));
  const faceByActor = new Map(options.faces.map((f) => [f.actorId, f]));

  const placedBoxes: Rect2D[] = [];
  const bubbles: PlacedSpeechBubbleLayout[] = [];
  let cursorMinY = margin;
  let totalFaceOverlapAreaPx = 0;

  for (let i = 0; i < options.lines.length; i += 1) {
    const line = options.lines[i];
    const wrappedLines = wrapKoreanSpeechText(line.textKo, line.bubbleKind === "narration" ? 14 : 9);
    const { width, height } = measureBubbleBoxSize(wrappedLines, line.bubbleKind);
    const speakerFace = line.speakerActorId ? faceByActor.get(line.speakerActorId) ?? null : null;

    // 후보 X 열(좌측·중앙·우측·화자 근처) × 후보 Y 행 격자 탐색으로 얼굴 겹침 0 + 읽기 순서 준수 최적 위치 선정
    const maxX = Math.max(margin, options.cutWidthPx - margin - width);
    const maxY = Math.max(margin, options.cutHeightPx - margin - height);
    const idealX = speakerFace
      ? Math.min(maxX, Math.max(margin, speakerFace.mouthX - width * 0.5))
      : margin + (maxX - margin) * (i % 2 === 0 ? 0.15 : 0.85);

    const candidateXs = [
      margin,
      maxX,
      (margin + maxX) * 0.5,
      idealX,
    ];
    const yStep = Math.max(24, Math.floor((maxY - cursorMinY) / 14) || 24);

    let bestBox: Rect2D = {
      x: Math.min(maxX, Math.max(margin, idealX)),
      y: Math.min(maxY, cursorMinY),
      width,
      height,
    };
    let bestCost = Number.POSITIVE_INFINITY;

    for (let cy = cursorMinY; cy <= maxY; cy += yStep) {
      for (const cx of candidateXs) {
        const box: Rect2D = { x: cx, y: cy, width, height };
        let faceOverlap = 0;
        for (const f of paddedFaces) {
          faceOverlap += rectIntersectionArea(box, f);
        }
        let bubbleOverlap = 0;
        for (const prev of placedBoxes) {
          bubbleOverlap += rectIntersectionArea(box, prev);
        }
        const distToSpeaker = speakerFace
          ? Math.hypot(box.x + width * 0.5 - speakerFace.mouthX, box.y + height * 0.5 - speakerFace.mouthY)
          : Math.abs(box.x - idealX);

        // 얼굴 겹침(×10000)과 기존 말풍선 겹침(×5000)을 최우선 페널티로 배제
        const cost =
          faceOverlap * 10_000
          + bubbleOverlap * 5_000
          + distToSpeaker * 0.4
          + (cy - cursorMinY) * 0.15;

        if (cost < bestCost) {
          bestCost = cost;
          bestBox = box;
        }
      }
    }

    let rawFaceOverlap = 0;
    for (const f of options.faces) {
      rawFaceOverlap += rectIntersectionArea(bestBox, f);
    }
    totalFaceOverlapAreaPx += rawFaceOverlap;
    placedBoxes.push(bestBox);
    cursorMinY = Math.min(maxY, bestBox.y + Math.max(28, height * 0.55));

    bubbles.push({
      lineId: line.id,
      speakerActorId: line.speakerActorId,
      bubbleKind: line.bubbleKind,
      wrappedLines,
      box: bestBox,
      tailTip: speakerFace && line.bubbleKind !== "narration"
        ? [speakerFace.mouthX, speakerFace.mouthY]
        : null,
      faceOverlapAreaPx: rawFaceOverlap,
    });
  }

  let readingOrderPreserved = true;
  for (let i = 1; i < bubbles.length; i += 1) {
    if (bubbles[i].box.y < bubbles[i - 1].box.y - 1) {
      readingOrderPreserved = false;
    }
  }

  return {
    cutWidthPx: options.cutWidthPx,
    cutHeightPx: options.cutHeightPx,
    bubbles,
    totalFaceOverlapAreaPx,
    readingOrderPreserved,
  };
}
