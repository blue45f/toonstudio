/**
 * Plotr 대본/소설 원고 → 컷 분해 엔진 (Script Insight), 180° 리버스 샷 축 점검,
 * 말풍선 원본 대사 동기화, 컷 분할·병합·순서 변경 순수 연산 모듈.
 */
import type {
  PlotrCameraSide,
  PlotrConsistencyAsset,
  PlotrCutCard,
  PlotrCutDialogue,
  PlotrEffectLineKind,
  PlotrInputMode,
  PlotrOutputFormat,
  PlotrReverseShotWarning,
} from "./plotr-types";

export interface ParseScriptToCutsInput {
  readonly script: string;
  readonly format: PlotrOutputFormat;
  readonly inputMode: PlotrInputMode;
  readonly worldSettingNote?: string;
  readonly assets?: readonly PlotrConsistencyAsset[];
  readonly panelBorderEnabled?: boolean;
  readonly panelBorderWidthPx?: number;
}

const MARKER_LINE_RE = /^(?:\[\s*컷\s*(\d+)\s*\]|컷\s*(\d+)\s*[:.]|(\d+)\.\s+)(.*)$/u;
const DIALOGUE_LINE_RE = /^([가-힣A-Za-z0-9\s]{1,14})\s*:\s*(.+)$/u;

function inferCameraAndEmotion(
  action: string,
  dialogues: readonly PlotrCutDialogue[],
  cutIndex: number,
  totalCuts: number,
  format: PlotrOutputFormat,
): {
  readonly cameraShot: string;
  readonly cameraSide: PlotrCameraSide;
  readonly emotionBeat: string;
  readonly tensionScore: number;
  readonly effectLine: PlotrEffectLineKind;
  readonly sfxText: string;
  readonly durationSec?: number;
} {
  const combined = `${action} ${dialogues.map((d) => d.text).join(" ")}`;
  let cameraShot = "미디엄샷 · 아이레벨";
  let emotionBeat = "전개 집중";
  let effectLine: PlotrEffectLineKind = "none";
  let sfxText = "";
  let baseTension = Math.round(40 + ((cutIndex + 1) / Math.max(1, totalCuts)) * 48);

  if (/눈동자|클로즈업|시선|표정|손바닥|손목|LED|경고등/u.test(combined)) {
    cameraShot = "익스트림 클로즈업 85mm";
    emotionBeat = "긴장 · 포착";
    effectLine = "focus";
    baseTension += 8;
  } else if (/돌진|단검|균열|열리며|소리|깜빡|잡힌다|뒤집/u.test(combined)) {
    cameraShot = "로우앵글 다이내믹 28mm";
    emotionBeat = "충격 · 반전";
    effectLine = "speed";
    sfxText = /균열|문|쾅/u.test(combined) ? "쾅!" : "번쩍!";
    baseTension += 12;
  } else if (/하늘|전경|연회장|승강장|현관|창밖/u.test(combined)) {
    cameraShot = "와이드 풀샷 · 공간 설정";
    emotionBeat = "분위기 도입";
  } else if (/웃으며|두근|햇살|새빨개/u.test(combined)) {
    cameraShot = "바스트 투샷 50mm";
    emotionBeat = "설렘 · 여운";
    sfxText = "두근…";
  }

  if (cutIndex === totalCuts - 1) {
    baseTension = Math.min(98, Math.max(baseTension, 84));
    if (effectLine === "none") effectLine = "focus";
  }

  if (format === "cuttoon") {
    cameraShot = cameraShot.replace("와이드 풀샷", "정방형 풀샷");
  } else if (format === "print-manga") {
    cameraShot = `${Math.floor(cutIndex / 4) + 1}쪽 ${(cutIndex % 4) + 1}칸 · ${cameraShot}`;
  }

  const cameraSide: PlotrCameraSide =
    dialogues.length > 0 && cutIndex % 2 === 1
      ? "right"
      : dialogues.length > 0 && cutIndex % 2 === 0
        ? "left"
        : "center";

  const durationSec =
    format === "video-storyboard"
      ? cutIndex === totalCuts - 1
        ? 5
        : dialogues.length > 0
          ? 4
          : 3
      : undefined;

  return {
    cameraShot,
    cameraSide,
    emotionBeat,
    tensionScore: Math.max(20, Math.min(99, baseTension)),
    effectLine,
    sfxText,
    durationSec,
  };
}

function matchReferencedAssets(
  text: string,
  assets: readonly PlotrConsistencyAsset[],
): { readonly ids: readonly string[]; readonly locationName: string } {
  const ids: string[] = [];
  let locationName = "";
  for (const asset of assets) {
    if (!asset.name.trim()) continue;
    if (text.includes(asset.name.trim())) {
      ids.push(asset.id);
      if (asset.category === "location" && !locationName) {
        locationName = asset.name.trim();
      }
    }
  }
  return { ids: Object.freeze(ids), locationName };
}

function splitProseIntoChunks(script: string, format: PlotrOutputFormat): string[] {
  const paragraphs = script
    .split(/\n{2,}/u)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length >= 2) return paragraphs;

  const sentences = script
    .split(/(?<=[.?!…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const groupSize = format === "cuttoon" ? 1 : 2;
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += groupSize) {
    chunks.push(sentences.slice(i, i + groupSize).join("\n"));
  }
  return chunks.length > 0 ? chunks : [script.trim()];
}

/**
 * 대본([컷 N] 마커) 또는 웹소설 산문(스토리 모드)을 형식별 컷 카드 목록으로 분해한다.
 */
export function parseScriptToPlotrCuts(
  input: ParseScriptToCutsInput,
): readonly PlotrCutCard[] {
  const trimmed = input.script.trim();
  if (!trimmed) return Object.freeze([]);

  const assets = input.assets ?? [];
  const rawLines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  const hasMarkers = rawLines.some((line) => MARKER_LINE_RE.test(line));

  interface RawCutBucket {
    actionParts: string[];
    dialogues: PlotrCutDialogue[];
  }
  const buckets: RawCutBucket[] = [];

  if (input.inputMode === "script" && hasMarkers) {
    let current: RawCutBucket | null = null;
    rawLines.forEach((line, lineIdx) => {
      const marker = MARKER_LINE_RE.exec(line);
      if (marker) {
        current = { actionParts: [], dialogues: [] };
        buckets.push(current);
        const rest = (marker[4] ?? "").trim();
        if (rest) current.actionParts.push(rest);
        return;
      }
      if (!current) {
        current = { actionParts: [], dialogues: [] };
        buckets.push(current);
      }
      const dlg = DIALOGUE_LINE_RE.exec(line);
      if (dlg) {
        const speaker = dlg[1]!.trim();
        const rawText = dlg[2]!.trim();
        const isNarration = /^\((?:나레이션|독백|혼잣말)\)/u.test(rawText);
        const cleanText = rawText
          .replace(/^\((?:나레이션|독백|혼잣말)\)\s*/u, "")
          .replace(/^["“]|["”]$/gu, "")
          .trim();
        current.dialogues.push({
          id: `dlg-${buckets.length}-${lineIdx}`,
          speaker: isNarration ? "" : speaker,
          text: cleanText,
          kind: isNarration ? "narration" : "speech",
        });
      } else {
        current.actionParts.push(line);
      }
    });
  } else {
    const chunks = splitProseIntoChunks(trimmed, input.format);
    chunks.forEach((chunk, chunkIdx) => {
      const bucket: RawCutBucket = { actionParts: [], dialogues: [] };
      chunk.split("\n").forEach((line, lineIdx) => {
        const dlg = DIALOGUE_LINE_RE.exec(line);
        const quoteMatch = /^[“"]([^”"]+)[”"]$/u.exec(line);
        if (dlg) {
          bucket.dialogues.push({
            id: `dlg-p-${chunkIdx}-${lineIdx}`,
            speaker: dlg[1]!.trim(),
            text: dlg[2]!.replace(/^["“]|["”]$/gu, "").trim(),
            kind: "speech",
          });
        } else if (quoteMatch) {
          bucket.dialogues.push({
            id: `dlg-q-${chunkIdx}-${lineIdx}`,
            speaker: "등장인물",
            text: quoteMatch[1]!.trim(),
            kind: "speech",
          });
        } else {
          bucket.actionParts.push(line);
        }
      });
      buckets.push(bucket);
    });
  }

  let lastLocation =
    assets.find((a) => a.category === "location")?.name ??
    (input.worldSettingNote?.trim().slice(0, 18) || "주요 무대");

  const cuts: PlotrCutCard[] = buckets.map((bucket, idx) => {
    const actionSummary =
      bucket.actionParts.join(" ").trim() ||
      bucket.dialogues[0]?.text ||
      `${idx + 1}번 장면`;
    const combinedText = `${actionSummary} ${bucket.dialogues.map((d) => `${d.speaker} ${d.text}`).join(" ")}`;
    const matched = matchReferencedAssets(combinedText, assets);
    if (matched.locationName) lastLocation = matched.locationName;

    const meta = inferCameraAndEmotion(
      actionSummary,
      bucket.dialogues,
      idx,
      buckets.length,
      input.format,
    );
    const contextPrefix = input.worldSettingNote?.trim()
      ? `[세계관 반영] ${input.worldSettingNote.trim().slice(0, 36)} · `
      : "";

    return Object.freeze({
      id: `plotr-cut-${idx + 1}`,
      orderIndex: idx,
      sceneTitle: `${idx + 1}컷`,
      actionSummary,
      dialogues: Object.freeze(bucket.dialogues),
      cameraShot: meta.cameraShot,
      cameraSide: meta.cameraSide,
      locationName: matched.locationName || lastLocation,
      emotionBeat: meta.emotionBeat,
      tensionScore: meta.tensionScore,
      effectLine: meta.effectLine,
      sfxText: meta.sfxText,
      referencedAssetIds: matched.ids,
      bubblesApplied: false,
      panelBorderEnabled: input.panelBorderEnabled ?? true,
      panelBorderWidthPx: input.panelBorderWidthPx ?? 3,
      renderReady: false,
      compositionBrief: `${contextPrefix}${meta.cameraShot} · ${actionSummary}`,
      ...(meta.durationSec !== undefined ? { durationSec: meta.durationSec } : {}),
      ...(idx === buckets.length - 1 ? { foreshadowTag: "다음 화 클리프행어" } : {}),
    });
  });

  return Object.freeze(cuts);
}

/**
 * 플로터 영화/영상 콘티 180° 규칙(리버스 샷 축 유지) 점검기.
 * 같은 장소에서 서로 다른 화자가 이어질 때 카메라 측이 같은 방향에 겹치면 경고를 낸다.
 */
export function auditReverseShotAxis(
  cuts: readonly PlotrCutCard[],
): readonly PlotrReverseShotWarning[] {
  const warnings: PlotrReverseShotWarning[] = [];
  for (let i = 1; i < cuts.length; i += 1) {
    const prev = cuts[i - 1]!;
    const curr = cuts[i]!;
    const prevSpeaker = prev.dialogues[0]?.speaker.trim() ?? "";
    const currSpeaker = curr.dialogues[0]?.speaker.trim() ?? "";
    if (
      prevSpeaker &&
      currSpeaker &&
      prevSpeaker !== currSpeaker &&
      prev.locationName === curr.locationName &&
      prev.cameraSide !== "center" &&
      prev.cameraSide === curr.cameraSide
    ) {
      warnings.push({
        cutId: curr.id,
        previousCutId: prev.id,
        locationName: curr.locationName,
        messageKo: `${prev.sceneTitle}(${prevSpeaker}) → ${curr.sceneTitle}(${currSpeaker})가 같은 장소('${curr.locationName}')에서 같은 카메라 축(${curr.cameraSide === "left" ? "좌측" : "우측"})에 겹쳐 180° 시선 축이 흔들립니다.`,
      });
    }
  }
  return Object.freeze(warnings);
}

export function fixReverseShotAxisOnCut(
  cuts: readonly PlotrCutCard[],
  cutId: string,
): readonly PlotrCutCard[] {
  const startIdx = cuts.findIndex((c) => c.id === cutId);
  if (startIdx < 0) return cuts;
  const copy = cuts.map((cut) => ({ ...cut }));
  const target = copy[startIdx]!;
  target.cameraSide = target.cameraSide === "left" ? "right" : "left";

  // 같은 장소의 연속 리버스 샷이 다시 겹치지 않도록 이어지는 컷들의 좌/우 축도 교차 정렬한다.
  for (let i = startIdx + 1; i < copy.length; i += 1) {
    const prev = copy[i - 1]!;
    const curr = copy[i]!;
    const prevSpeaker = prev.dialogues[0]?.speaker.trim() ?? "";
    const currSpeaker = curr.dialogues[0]?.speaker.trim() ?? "";
    if (
      prevSpeaker &&
      currSpeaker &&
      prevSpeaker !== currSpeaker &&
      prev.locationName === curr.locationName &&
      prev.cameraSide !== "center" &&
      prev.cameraSide === curr.cameraSide
    ) {
      curr.cameraSide = curr.cameraSide === "left" ? "right" : "left";
    }
  }
  return Object.freeze(copy.map((cut) => Object.freeze(cut)));
}

/**
 * 컷 위 말풍선 대사를 수정하면 원본 대사 배열에도 즉시 반영해,
 * '말풍선 삭제' 후 '말풍선 다시 올리기'를 해도 수정 대사가 보존되게 한다.
 */
export function updateCutDialoguePreservingSource(
  cuts: readonly PlotrCutCard[],
  cutId: string,
  dialogueId: string,
  nextText: string,
): readonly PlotrCutCard[] {
  return Object.freeze(
    cuts.map((cut) => {
      if (cut.id !== cutId) return cut;
      return Object.freeze({
        ...cut,
        dialogues: Object.freeze(
          cut.dialogues.map((dlg) =>
            dlg.id === dialogueId ? Object.freeze({ ...dlg, text: nextText }) : dlg,
          ),
        ),
      });
    }),
  );
}

export function batchToggleCutBubbles(
  cuts: readonly PlotrCutCard[],
  apply: boolean,
): readonly PlotrCutCard[] {
  return Object.freeze(
    cuts.map((cut) => {
      if (!apply) {
        return Object.freeze({ ...cut, bubblesApplied: false });
      }
      // 대사가 있고 콘티 조립이 끝났거나 편집 중인 컷에 말풍선 활성화
      return Object.freeze({
        ...cut,
        bubblesApplied: cut.dialogues.length > 0,
      });
    }),
  );
}

export function applyGlobalPanelBorder(
  cuts: readonly PlotrCutCard[],
  enabled: boolean,
  widthPx: number,
): readonly PlotrCutCard[] {
  const safeWidth = Math.max(1, Math.min(12, Math.round(widthPx)));
  return Object.freeze(
    cuts.map((cut) =>
      Object.freeze({
        ...cut,
        panelBorderEnabled: enabled,
        panelBorderWidthPx: safeWidth,
      }),
    ),
  );
}

export function toggleCutAssetReference(
  cuts: readonly PlotrCutCard[],
  cutId: string,
  assetId: string,
): readonly PlotrCutCard[] {
  return Object.freeze(
    cuts.map((cut) => {
      if (cut.id !== cutId) return cut;
      const exists = cut.referencedAssetIds.includes(assetId);
      const nextRefs = exists
        ? cut.referencedAssetIds.filter((id) => id !== assetId)
        : [...cut.referencedAssetIds, assetId];
      return Object.freeze({
        ...cut,
        referencedAssetIds: Object.freeze(nextRefs),
      });
    }),
  );
}

export function movePlotrCut(
  cuts: readonly PlotrCutCard[],
  cutId: string,
  direction: -1 | 1,
): readonly PlotrCutCard[] {
  const idx = cuts.findIndex((c) => c.id === cutId);
  const targetIdx = idx + direction;
  if (idx < 0 || targetIdx < 0 || targetIdx >= cuts.length) return cuts;
  const copy = [...cuts];
  const [moved] = copy.splice(idx, 1);
  copy.splice(targetIdx, 0, moved!);
  return Object.freeze(
    copy.map((cut, orderIndex) =>
      Object.freeze({
        ...cut,
        orderIndex,
        sceneTitle: `${orderIndex + 1}컷`,
      }),
    ),
  );
}

export function splitPlotrCut(
  cuts: readonly PlotrCutCard[],
  cutId: string,
): readonly PlotrCutCard[] {
  const idx = cuts.findIndex((c) => c.id === cutId);
  if (idx < 0) return cuts;
  const target = cuts[idx]!;
  const halfDlg = Math.ceil(target.dialogues.length / 2);
  const firstCut: PlotrCutCard = Object.freeze({
    ...target,
    dialogues: Object.freeze(target.dialogues.slice(0, halfDlg)),
  });
  const secondCut: PlotrCutCard = Object.freeze({
    ...target,
    id: `${target.id}-split-${cuts.length + 1}`,
    actionSummary: `${target.actionSummary} (이어지는 리액션)`,
    dialogues: Object.freeze(target.dialogues.slice(halfDlg)),
    cameraSide: target.cameraSide === "left" ? "right" : "left",
    renderReady: false,
  });
  const combined = [...cuts.slice(0, idx), firstCut, secondCut, ...cuts.slice(idx + 1)];
  return Object.freeze(
    combined.map((cut, orderIndex) =>
      Object.freeze({
        ...cut,
        orderIndex,
        sceneTitle: `${orderIndex + 1}컷`,
      }),
    ),
  );
}

export function mergePlotrCutWithNext(
  cuts: readonly PlotrCutCard[],
  cutId: string,
): readonly PlotrCutCard[] {
  const idx = cuts.findIndex((c) => c.id === cutId);
  if (idx < 0 || idx >= cuts.length - 1) return cuts;
  const a = cuts[idx]!;
  const b = cuts[idx + 1]!;
  const mergedRefs = Array.from(new Set([...a.referencedAssetIds, ...b.referencedAssetIds]));
  const merged: PlotrCutCard = Object.freeze({
    ...a,
    actionSummary: `${a.actionSummary} ${b.actionSummary}`.trim(),
    dialogues: Object.freeze([...a.dialogues, ...b.dialogues]),
    referencedAssetIds: Object.freeze(mergedRefs),
    tensionScore: Math.max(a.tensionScore, b.tensionScore),
  });
  const combined = [...cuts.slice(0, idx), merged, ...cuts.slice(idx + 2)];
  return Object.freeze(
    combined.map((cut, orderIndex) =>
      Object.freeze({
        ...cut,
        orderIndex,
        sceneTitle: `${orderIndex + 1}컷`,
      }),
    ),
  );
}
