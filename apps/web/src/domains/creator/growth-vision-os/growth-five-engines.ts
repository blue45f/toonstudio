/**
 * 성장 단계 5대 핵심 엔진 통합 진입 모듈 (ToonStudio Growth Vision OS).
 *
 * 1. 실시간 드로잉 방송 & 미공개 대사 자동 블러 · 15초(9:16 30fps) 타임랩스 쇼츠 송출기
 * 2. 해외 판권 바이어용 1클릭 영·일문 IP 피치 룸 (비밀번호 해시·만료·워터마크·접근 검증)
 * 3. 학원·대학·멘토링 라이브 첨삭 교실 (./growth-five-critique-handoff)
 * 4. 아이패드·갤럭시탭·PC 오프라인 이어 그리기 핸드오프 (./growth-five-critique-handoff)
 * 5. 휴재·완결 공백기 무스포일러 캐릭터 비하인드 카드 & Q&A 봇 (./growth-five-hiatus-qa)
 */

import {
  clampNumber,
  constantTimeEquals,
  deterministicDigest,
  fnv1a32,
  roundTo,
} from "./growth-five-crypto";

export {
  DEFAULT_CRITIQUE_SESSION_INPUT,
  DEFAULT_DEVICE_HANDOFF_STATE,
  appendCritiqueRedlineStroke,
  buildCritiqueReplayFrame,
  createDeviceHandoffSnapshot,
  createLiveCritiqueSession,
  restoreDeviceHandoff,
  type CreateCritiqueSessionInput,
  type CritiquePoint,
  type CritiqueReplayFrame,
  type CritiqueStroke,
  type CritiqueToolKind,
  type DeviceHandoffBrush,
  type DeviceHandoffLayerState,
  type DeviceHandoffRestoreResult,
  type DeviceHandoffSnapshot,
  type DeviceHandoffState,
  type DeviceHandoffViewport,
  type DeviceUnsavedDeltaOp,
  type HandoffDeviceKind,
  type LiveCritiqueSession,
} from "./growth-five-critique-handoff";

export {
  DEFAULT_HIATUS_CHARACTER_BIBLE,
  answerHiatusFanQuestion,
  type CharacterBibleEntry,
  type HiatusBehindCard,
  type HiatusCharacterBible,
  type HiatusQaAnswer,
  type RestrictedSpoilerTerm,
} from "./growth-five-hiatus-qa";

// ---------------------------------------------------------------------------
// 1. 실시간 드로잉 방송 & 미공개 대사 자동 블러 · 15초 타임랩스 쇼츠 송출기
// ---------------------------------------------------------------------------

export type LiveBroadcastLayerKind =
  | "lineart"
  | "color"
  | "speech"
  | "script-note"
  | "spoiler-prop"
  | "background";

export type LiveBroadcastStreamPreset =
  | "chzzk-1080p60"
  | "youtube-1080p60"
  | "soop-1080p60";

export interface LiveBroadcastRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LiveBroadcastLayer {
  readonly id: string;
  readonly name: string;
  readonly kind: LiveBroadcastLayerKind;
  readonly episodeRef?: number;
  readonly bounds: LiveBroadcastRect;
  readonly hasDialogueText?: boolean;
  readonly isMarkedSpoiler?: boolean;
}

export interface LiveBroadcastTimelineSlice {
  readonly id: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly strokeCount: number;
  readonly intensity: number;
  readonly label: string;
  readonly layerId: string;
}

export interface PrepareLiveBroadcastInput {
  readonly episodeNumber: number;
  readonly publishedUpToEpisode: number;
  readonly layers: readonly LiveBroadcastLayer[];
  readonly strokeTimeline: readonly LiveBroadcastTimelineSlice[];
  readonly blurRadiusPx?: number;
  readonly streamPreset?: LiveBroadcastStreamPreset;
  readonly shortsTargetSec?: number;
}

export interface LiveBlurMaskRegion {
  readonly layerId: string;
  readonly layerName: string;
  readonly kind: LiveBroadcastLayerKind;
  readonly reason: string;
  readonly blurRadiusPx: number;
  readonly rect: LiveBroadcastRect;
}

export interface ShortsHighlightSegment {
  readonly sliceId: string;
  readonly label: string;
  readonly sourceStartSec: number;
  readonly sourceEndSec: number;
  readonly outputStartSec: number;
  readonly outputEndSec: number;
  readonly activityScore: number;
  readonly maskedOverlayActive: true;
}

export interface LiveBroadcastPlan {
  readonly episodeNumber: number;
  readonly publishedUpToEpisode: number;
  readonly streamPreset: LiveBroadcastStreamPreset;
  readonly streamSpec: {
    readonly label: string;
    readonly resolution: "1920x1080";
    readonly fps: 60;
    readonly bitrateKbps: number;
  };
  readonly blurMasks: readonly LiveBlurMaskRegion[];
  readonly visibleLayerIds: readonly string[];
  readonly maskedLayerIds: readonly string[];
  readonly spoilerLeakCount: number;
  readonly protectionVerified: boolean;
  readonly shortsExport: {
    readonly aspectRatio: "9:16";
    readonly width: 1080;
    readonly height: 1920;
    readonly fps: 30;
    readonly durationSec: number;
    readonly totalFrames: number;
    readonly sourceDurationSec: number;
    readonly speedupFactor: number;
    readonly excludedSpoilerSliceIds: readonly string[];
    readonly highlightSegments: readonly ShortsHighlightSegment[];
    readonly safeMaskApplied: true;
  };
}

const STREAM_PRESET_SPECS: Record<
  LiveBroadcastStreamPreset,
  { readonly label: string; readonly resolution: "1920x1080"; readonly fps: 60; readonly bitrateKbps: number }
> = {
  "chzzk-1080p60": { label: "치지직 1080p 60fps 저지연 송출", resolution: "1920x1080", fps: 60, bitrateKbps: 8000 },
  "youtube-1080p60": { label: "유튜브 라이브 1080p 60fps 송출", resolution: "1920x1080", fps: 60, bitrateKbps: 9000 },
  "soop-1080p60": { label: "SOOP 1080p 60fps 드로잉 송출", resolution: "1920x1080", fps: 60, bitrateKbps: 8000 },
};

function resolveLayerBlurReason(layer: LiveBroadcastLayer, publishedUpToEpisode: number): string | null {
  if (layer.kind === "speech" || layer.hasDialogueText) {
    return "미공개 대사·말풍선 자동 가림";
  }
  if (layer.kind === "script-note") {
    return "연출 콘티 메모 자동 보호";
  }
  if (layer.kind === "spoiler-prop" || layer.isMarkedSpoiler) {
    return "작가 지정 스포일러 소품 가림";
  }
  if (layer.episodeRef !== undefined && layer.episodeRef > publishedUpToEpisode) {
    return `미공개 ${layer.episodeRef}화 스포일러 차단`;
  }
  return null;
}

export function prepareCreatorLiveBroadcast(input: PrepareLiveBroadcastInput): LiveBroadcastPlan {
  const blurRadiusPx = Math.round(clampNumber(input.blurRadiusPx ?? 24, 12, 48));
  const streamPreset = input.streamPreset ?? "chzzk-1080p60";
  const durationSec = Math.round(clampNumber(input.shortsTargetSec ?? 15, 10, 60));
  const maskPaddingPx = 12;

  const blurMasks: LiveBlurMaskRegion[] = [];
  const visibleLayerIds: string[] = [];
  const maskedLayerIds: string[] = [];
  const maskedLayerSet = new Set<string>();

  for (const layer of input.layers) {
    const reason = resolveLayerBlurReason(layer, input.publishedUpToEpisode);
    if (reason !== null) {
      maskedLayerIds.push(layer.id);
      maskedLayerSet.add(layer.id);
      blurMasks.push({
        layerId: layer.id,
        layerName: layer.name,
        kind: layer.kind,
        reason,
        blurRadiusPx,
        rect: {
          x: Math.max(0, Math.round(layer.bounds.x - maskPaddingPx)),
          y: Math.max(0, Math.round(layer.bounds.y - maskPaddingPx)),
          width: Math.max(16, Math.round(layer.bounds.width + maskPaddingPx * 2)),
          height: Math.max(16, Math.round(layer.bounds.height + maskPaddingPx * 2)),
        },
      });
    } else {
      visibleLayerIds.push(layer.id);
    }
  }

  const excludedSpoilerSliceIds: string[] = [];
  const safeSlices: Array<{ readonly slice: LiveBroadcastTimelineSlice; readonly score: number }> = [];

  for (const slice of input.strokeTimeline) {
    if (maskedLayerSet.has(slice.layerId)) {
      excludedSpoilerSliceIds.push(slice.id);
      continue;
    }
    const clampedIntensity = clampNumber(slice.intensity, 0, 1);
    const score = roundTo(Math.max(1, slice.strokeCount) * (0.4 + clampedIntensity * 0.6), 2);
    safeSlices.push({ slice, score });
  }

  const selected = [...safeSlices]
    .sort((a, b) => b.score - a.score || a.slice.startSec - b.slice.startSec)
    .slice(0, 4)
    .sort((a, b) => a.slice.startSec - b.slice.startSec);

  const totalScore = selected.reduce((sum, item) => sum + item.score, 0) || 1;
  let outputCursor = 0;
  const highlightSegments: ShortsHighlightSegment[] = selected.map((item, idx) => {
    const isLast = idx === selected.length - 1;
    const allocated = isLast
      ? roundTo(Math.max(0.5, durationSec - outputCursor), 2)
      : roundTo(Math.max(1.5, (item.score / totalScore) * durationSec), 2);
    const outputStartSec = roundTo(outputCursor, 2);
    const outputEndSec = isLast ? durationSec : roundTo(Math.min(durationSec, outputCursor + allocated), 2);
    outputCursor = outputEndSec;
    return {
      sliceId: item.slice.id,
      label: item.slice.label,
      sourceStartSec: item.slice.startSec,
      sourceEndSec: item.slice.endSec,
      outputStartSec,
      outputEndSec,
      activityScore: item.score,
      maskedOverlayActive: true,
    };
  });

  const sourceDurationSec = input.strokeTimeline.reduce(
    (maxEnd, slice) => Math.max(maxEnd, slice.endSec),
    0,
  );
  const speedupFactor = roundTo(Math.max(1, sourceDurationSec / durationSec), 1);

  const spoilerLeakCount = input.layers.filter((layer) => {
    const needsMask = resolveLayerBlurReason(layer, input.publishedUpToEpisode) !== null;
    return needsMask && !maskedLayerSet.has(layer.id);
  }).length;

  return {
    episodeNumber: input.episodeNumber,
    publishedUpToEpisode: input.publishedUpToEpisode,
    streamPreset,
    streamSpec: STREAM_PRESET_SPECS[streamPreset],
    blurMasks,
    visibleLayerIds,
    maskedLayerIds,
    spoilerLeakCount,
    protectionVerified: spoilerLeakCount === 0,
    shortsExport: {
      aspectRatio: "9:16",
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec,
      totalFrames: durationSec * 30,
      sourceDurationSec,
      speedupFactor,
      excludedSpoilerSliceIds,
      highlightSegments,
      safeMaskApplied: true,
    },
  };
}

export const DEFAULT_LIVE_BROADCAST_INPUT: PrepareLiveBroadcastInput = {
  episodeNumber: 24,
  publishedUpToEpisode: 21,
  blurRadiusPx: 26,
  streamPreset: "chzzk-1080p60",
  shortsTargetSec: 15,
  layers: [
    { id: "layer-bg-palace", name: "배경 3D 궁전 홀", kind: "background", bounds: { x: 0, y: 0, width: 1600, height: 2200 } },
    { id: "layer-ink-hero", name: "주인공 메인 선화", kind: "lineart", bounds: { x: 320, y: 240, width: 880, height: 1460 } },
    { id: "layer-color-hero", name: "채색·림라이트", kind: "color", bounds: { x: 320, y: 240, width: 880, height: 1460 } },
    {
      id: "layer-speech-ep24",
      name: "24화 반전 대사 말풍선",
      kind: "speech",
      episodeRef: 24,
      hasDialogueText: true,
      bounds: { x: 860, y: 180, width: 520, height: 340 },
    },
    {
      id: "layer-note-pd",
      name: "연출 콘티 메모(흑막 정체)",
      kind: "script-note",
      episodeRef: 24,
      bounds: { x: 110, y: 1680, width: 640, height: 260 },
    },
    {
      id: "layer-prop-crest",
      name: "미공개 가문 문장",
      kind: "spoiler-prop",
      episodeRef: 24,
      isMarkedSpoiler: true,
      bounds: { x: 540, y: 920, width: 220, height: 220 },
    },
  ],
  strokeTimeline: [
    { id: "slice-1", startSec: 0, endSec: 210, strokeCount: 165, intensity: 0.78, label: "주인공 눈빛 클로즈업 선화", layerId: "layer-ink-hero" },
    { id: "slice-2", startSec: 210, endSec: 360, strokeCount: 95, intensity: 0.92, label: "24화 반전 대사 식자 작업", layerId: "layer-speech-ep24" },
    { id: "slice-3", startSec: 360, endSec: 690, strokeCount: 240, intensity: 0.94, label: "검기 이펙트 · 역광 하이라이트", layerId: "layer-color-hero" },
    { id: "slice-4", startSec: 690, endSec: 900, strokeCount: 145, intensity: 0.68, label: "궁전 배경 명암 정리", layerId: "layer-bg-palace" },
  ],
};

// ---------------------------------------------------------------------------
// 2. 해외 판권 바이어용 1클릭 영·일문 IP 피치 룸
// ---------------------------------------------------------------------------

export type PitchLanguage = "en" | "ja";

export interface BuyerSampleEpisode {
  readonly episodeNumber: number;
  readonly titleEn: string;
  readonly titleJa: string;
  readonly panelCount: number;
  readonly translationReady: readonly PitchLanguage[];
}

export interface BuyerCharacterSheet {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly nameJa: string;
  readonly role: string;
  readonly hookEn: string;
  readonly hookJa: string;
  readonly sheetAssetRef: string;
}

export interface BuyerPitchMetrics {
  readonly completionRatePct: number;
  readonly episode1To3RetentionPct: number;
  readonly paidConversionPct: number;
  readonly weeklyActiveReaders: number;
  readonly averageRating: number;
}

export interface CreateBuyerPitchRoomInput {
  readonly workTitleKo: string;
  readonly workTitleEn: string;
  readonly workTitleJa: string;
  readonly buyerOrg: string;
  readonly buyerEmail: string;
  readonly passcode: string;
  readonly createdAtMs: number;
  readonly expiresInHours?: number;
  readonly languages: readonly PitchLanguage[];
  readonly sampleEpisodes: readonly BuyerSampleEpisode[];
  readonly characterSheets: readonly BuyerCharacterSheet[];
  readonly metrics: BuyerPitchMetrics;
}

export interface BuyerPitchRoomPackage {
  readonly roomId: string;
  readonly sharePath: string;
  readonly workTitleKo: string;
  readonly workTitleEn: string;
  readonly workTitleJa: string;
  readonly buyerOrg: string;
  readonly buyerEmailMasked: string;
  readonly languages: readonly PitchLanguage[];
  readonly passcodeSalt: string;
  readonly passcodeHash: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly downloadPolicy: "view-only-watermarked";
  readonly watermark: {
    readonly text: string;
    readonly opacity: number;
    readonly angleDeg: number;
    readonly forensicFingerprint: string;
  };
  readonly sampleEpisodes: readonly BuyerSampleEpisode[];
  readonly characterSheets: readonly BuyerCharacterSheet[];
  readonly metricsSummary: BuyerPitchMetrics & {
    readonly pitchHeadlineEn: string;
    readonly pitchHeadlineJa: string;
  };
}

export interface BuyerPitchAccessRequest {
  readonly passcode: string;
  readonly nowMs: number;
  readonly preferredLanguage: PitchLanguage;
}

export interface BuyerPitchAccessResult {
  readonly granted: boolean;
  readonly reason: "ok" | "expired" | "invalid-passcode" | "language-unavailable";
  readonly messageKo: string;
  readonly remainingHours: number;
  readonly activeLanguage: PitchLanguage;
  readonly watermarkText: string;
  readonly accessibleSampleCount: number;
}

function maskEmailAddress(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 1) return "***@partner.local";
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  return `${local.slice(0, 2)}***@${domain}`;
}

export function createGlobalBuyerPitchRoom(input: CreateBuyerPitchRoomInput): BuyerPitchRoomPackage {
  const cleanPasscode = input.passcode.trim();
  if (cleanPasscode.length < 6) {
    throw new Error("피치 룸 비밀번호는 최소 6자 이상이어야 합니다.");
  }
  const expiresInHours = Math.round(clampNumber(input.expiresInHours ?? 72, 1, 720));
  const expiresAtMs = input.createdAtMs + expiresInHours * 3_600_000;
  const languages: PitchLanguage[] = input.languages.length > 0 ? [...new Set(input.languages)] : ["en", "ja"];
  const roomSeed = `${input.workTitleEn}|${input.buyerOrg}|${input.createdAtMs}`;
  const roomId = `pitch-${fnv1a32(roomSeed, 0x517cc1b7).toString(36).padStart(7, "0")}`;
  const passcodeSalt = `salt-${fnv1a32(`${roomId}:${input.buyerEmail}`, 0x2f6e2b1).toString(16).padStart(8, "0")}`;
  const passcodeHash = deterministicDigest(cleanPasscode, passcodeSalt);
  const buyerEmailMasked = maskEmailAddress(input.buyerEmail);
  const forensicFingerprint = deterministicDigest(`${roomId}:${input.buyerOrg}:${buyerEmailMasked}`, "watermark-fp").slice(6, 18);

  const sampleEpisodes = input.sampleEpisodes
    .filter((ep) => ep.episodeNumber >= 1 && ep.episodeNumber <= 3)
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  const completionRatePct = roundTo(clampNumber(input.metrics.completionRatePct, 0, 100), 1);
  const episode1To3RetentionPct = roundTo(clampNumber(input.metrics.episode1To3RetentionPct, 0, 100), 1);
  const paidConversionPct = roundTo(clampNumber(input.metrics.paidConversionPct, 0, 100), 1);
  const weeklyActiveReaders = Math.max(0, Math.round(input.metrics.weeklyActiveReaders));
  const averageRating = roundTo(clampNumber(input.metrics.averageRating, 0, 10), 2);

  return {
    roomId,
    sharePath: `/pitch-room/${roomId}`,
    workTitleKo: input.workTitleKo,
    workTitleEn: input.workTitleEn,
    workTitleJa: input.workTitleJa,
    buyerOrg: input.buyerOrg.trim(),
    buyerEmailMasked,
    languages,
    passcodeSalt,
    passcodeHash,
    createdAtMs: input.createdAtMs,
    expiresAtMs,
    downloadPolicy: "view-only-watermarked",
    watermark: {
      text: `CONFIDENTIAL · ${input.buyerOrg.trim()} (${buyerEmailMasked}) · ${roomId}`,
      opacity: 0.18,
      angleDeg: -24,
      forensicFingerprint,
    },
    sampleEpisodes,
    characterSheets: [...input.characterSheets],
    metricsSummary: {
      completionRatePct,
      episode1To3RetentionPct,
      paidConversionPct,
      weeklyActiveReaders,
      averageRating,
      pitchHeadlineEn: `${input.workTitleEn} — ${completionRatePct}% completion · ${episode1To3RetentionPct}% Ep.1–3 retention · ${paidConversionPct}% paid conversion`,
      pitchHeadlineJa: `${input.workTitleJa} — 完読率${completionRatePct}%・1〜3話継続率${episode1To3RetentionPct}%・課金転換率${paidConversionPct}%`,
    },
  };
}

export function verifyBuyerPitchAccess(
  room: BuyerPitchRoomPackage,
  request: BuyerPitchAccessRequest,
): BuyerPitchAccessResult {
  if (request.nowMs >= room.expiresAtMs) {
    return {
      granted: false,
      reason: "expired",
      messageKo: "열람 링크 유효 기간이 만료되어 피치 룸을 잠갔습니다.",
      remainingHours: 0,
      activeLanguage: request.preferredLanguage,
      watermarkText: room.watermark.text,
      accessibleSampleCount: 0,
    };
  }

  const candidateHash = deterministicDigest(request.passcode.trim(), room.passcodeSalt);
  if (!constantTimeEquals(candidateHash, room.passcodeHash)) {
    return {
      granted: false,
      reason: "invalid-passcode",
      messageKo: "비밀번호가 일치하지 않습니다. 초대 메일의 코드를 다시 확인해 주세요.",
      remainingHours: roundTo((room.expiresAtMs - request.nowMs) / 3_600_000, 1),
      activeLanguage: request.preferredLanguage,
      watermarkText: room.watermark.text,
      accessibleSampleCount: 0,
    };
  }

  if (!room.languages.includes(request.preferredLanguage)) {
    return {
      granted: false,
      reason: "language-unavailable",
      messageKo: "요청한 언어 팩이 이 피치 룸에 포함되지 않았습니다.",
      remainingHours: roundTo((room.expiresAtMs - request.nowMs) / 3_600_000, 1),
      activeLanguage: room.languages[0] ?? "en",
      watermarkText: room.watermark.text,
      accessibleSampleCount: 0,
    };
  }

  const accessibleSampleCount = room.sampleEpisodes.filter((ep) =>
    ep.translationReady.includes(request.preferredLanguage),
  ).length;

  return {
    granted: true,
    reason: "ok",
    messageKo: `${room.buyerOrg} 전용 워터마크가 적용된 ${request.preferredLanguage === "en" ? "영문" : "일문"} 피치 룸을 열었습니다.`,
    remainingHours: roundTo((room.expiresAtMs - request.nowMs) / 3_600_000, 1),
    activeLanguage: request.preferredLanguage,
    watermarkText: room.watermark.text,
    accessibleSampleCount,
  };
}

export const DEFAULT_BUYER_PITCH_INPUT: CreateBuyerPitchRoomInput = {
  workTitleKo: "은빛 시계탑의 공녀",
  workTitleEn: "Lady of the Silver Clocktower",
  workTitleJa: "白銀の時計塔の公女",
  buyerOrg: "Kadokawa Global IP",
  buyerEmail: "rights@kadokawa-buyer.example",
  passcode: "SILVER2026",
  createdAtMs: 1_763_740_000_000,
  expiresInHours: 72,
  languages: ["en", "ja"],
  sampleEpisodes: [
    { episodeNumber: 1, titleEn: "Ep.1 The Rewound Bell", titleJa: "第1話 巻き戻された鐘", panelCount: 64, translationReady: ["en", "ja"] },
    { episodeNumber: 2, titleEn: "Ep.2 Contract in Ink", titleJa: "第2話 インクの契約", panelCount: 58, translationReady: ["en", "ja"] },
    { episodeNumber: 3, titleEn: "Ep.3 The Third Hand", titleJa: "第3話 第三の針", panelCount: 62, translationReady: ["en", "ja"] },
  ],
  characterSheets: [
    {
      id: "char-serena",
      nameKo: "세레나 아벨",
      nameEn: "Serena Abel",
      nameJa: "セレナ・アベル",
      role: "주인공 · 시간 복원사",
      hookEn: "Rebuilds shattered timelines with a pocket watch at the cost of her memories.",
      hookJa: "記憶を代償に壊れた時間線を修復する若き時計技師。",
      sheetAssetRef: "sheets/serena-turnaround-v3.png",
    },
    {
      id: "char-kain",
      nameKo: "카인 노르트",
      nameEn: "Kain Nord",
      nameJa: "カイン・ノルド",
      role: "북부 기사단장",
      hookEn: "Sworn protector hiding a forbidden crest from Episode 1.",
      hookJa: "第1話から禁じられた紋章を隠し持つ北部騎士団長。",
      sheetAssetRef: "sheets/kain-turnaround-v3.png",
    },
  ],
  metrics: {
    completionRatePct: 86.4,
    episode1To3RetentionPct: 79.2,
    paidConversionPct: 14.8,
    weeklyActiveReaders: 184_000,
    averageRating: 9.82,
  },
};
