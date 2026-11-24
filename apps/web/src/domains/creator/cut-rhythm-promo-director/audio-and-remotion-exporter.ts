/**
 * 박자 양자화 BGM/SFX 큐시트 생성기 + Remotion 9:16 / 16:9 프로모 매니페스트 익스포터.
 *
 * - 순수 결정론적 연산 전용.
 * - 영속 저장소 비의존(인메모리 조회용 Map 이름은 `cueIndex` 사용).
 */

import type {
  AudioCueLookupIndex,
  AudioCueSheet,
  BgmSectionKind,
  BgmTransitionCue,
  CutParallaxTrack,
  CutRhythmAnalysisReport,
  PromoAspectPreset,
  RemotionManifestOptions,
  RemotionPromoManifest,
  RemotionSequenceSpec,
  SfxCueMarker,
  SfxMarkerKind,
} from "./types";

export const BGM_SECTION_LABELS_KO: Readonly<Record<BgmSectionKind, string>> = {
  intro: "인트로",
  build: "빌드업",
  drop: "드롭",
  sting: "스팅",
};

export const SFX_MARKER_LABELS_KO: Readonly<Record<SfxMarkerKind, string>> = {
  whoosh: "우쉬 전환",
  "impact-hit": "임팩트 타격",
  heartbeat: "심장박동",
  "spark-chime": "스파크 차임",
  "page-turn": "페이지 넘김",
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

function quantizeFrameToBeat(
  rawFrame: number,
  framesPerBeat: number,
  maxFrame: number,
  maxSnapToleranceFrames?: number,
): { readonly frame: number; readonly beatIndex: number } {
  const clampedRaw = Math.round(clamp(rawFrame, 0, maxFrame));
  const beatIndex = Math.max(0, Math.round(clampedRaw / framesPerBeat));
  const snappedFrame = Math.round(clamp(beatIndex * framesPerBeat, 0, maxFrame));
  if (
    maxSnapToleranceFrames !== undefined &&
    Math.abs(snappedFrame - clampedRaw) > maxSnapToleranceFrames
  ) {
    return { frame: clampedRaw, beatIndex };
  }
  return { frame: snappedFrame, beatIndex };
}

/**
 * 컷 전환과 클라이맥스 프레임에 맞춘 박자 양자화 BGM 에너지 전환(intro/build/drop/sting)과
 * SFX 마커(whoosh/impact-hit/heartbeat/spark-chime/page-turn) 큐시트를 자동 배치한다.
 */
export function generateAudioCueSheet(rhythmReport: CutRhythmAnalysisReport): AudioCueSheet {
  const { recommendedBpm: bpm, fps, totalFrames, framesPerBeat, cuts } = rhythmReport;
  const maxFrame = Math.max(0, totalFrames - 1);

  const firstCut = cuts[0];
  const lastCut = cuts[cuts.length - 1];
  if (!firstCut || !lastCut) {
    throw new Error("오디오 큐시트를 생성할 웹툰 컷이 없습니다.");
  }

  const beatGridFrames: number[] = [];
  const totalBeatCount = Math.floor(maxFrame / framesPerBeat);
  for (let b = 0; b <= totalBeatCount; b += 1) {
    beatGridFrames.push(Math.round(clamp(b * framesPerBeat, 0, maxFrame)));
  }

  const climaxCut = cuts.find((c) => c.id === rhythmReport.climaxCutId) ?? firstCut;
  const firstTensionCut =
    cuts.find((c) => c.beat === "tension-rise") ?? cuts[Math.min(1, cuts.length - 1)] ?? firstCut;

  const introFrame = 0;
  const dropQ = quantizeFrameToBeat(climaxCut.startFrame, framesPerBeat, maxFrame, 4);
  const dropFrame = Math.max(introFrame + 1, Math.min(maxFrame - 1, dropQ.frame));

  const rawBuildQ = quantizeFrameToBeat(firstTensionCut.startFrame, framesPerBeat, maxFrame);
  const buildFrame =
    rawBuildQ.frame > introFrame && rawBuildQ.frame < dropFrame
      ? rawBuildQ.frame
      : Math.max(introFrame + 1, Math.min(dropFrame - 1, Math.round(dropFrame * 0.45)));

  const rawStingTarget =
    lastCut.id !== climaxCut.id
      ? lastCut.startFrame
      : Math.max(dropFrame + 1, totalFrames - Math.round(fps * 1.1));
  const stingQ = quantizeFrameToBeat(rawStingTarget, framesPerBeat, maxFrame, 6);
  const stingFrame = Math.min(maxFrame, Math.max(dropFrame + 1, stingQ.frame));

  const makeBgmCue = (
    section: BgmSectionKind,
    frame: number,
    energyLevel: number,
    cutId: string,
    noteKo: string,
  ): BgmTransitionCue => ({
    id: `bgm-${section}-${frame}`,
    section,
    frame,
    timeSec: roundTo(frame / fps, 3),
    beatIndex: Math.max(0, Math.round(frame / framesPerBeat)),
    energyLevel: roundTo(energyLevel, 2),
    cutId,
    labelKo: BGM_SECTION_LABELS_KO[section],
    noteKo,
  });

  const bgmTransitions: BgmTransitionCue[] = [
    makeBgmCue("intro", introFrame, 0.38, firstCut.id, "첫 컷 시선 고정용 인트로 패드 진입"),
    makeBgmCue("build", buildFrame, 0.68, firstTensionCut.id, "긴장 상승 구간 퍼커션·라이저 빌드업"),
    makeBgmCue("drop", dropFrame, 0.98, climaxCut.id, "클라이맥스 컷 진입과 동시 메인 드롭"),
    makeBgmCue("sting", stingFrame, 0.56, lastCut.id, "클리프행어 여운 및 엔딩 스팅"),
  ];

  const rawSfx: SfxCueMarker[] = [];
  const pushSfx = (
    kind: SfxMarkerKind,
    frame: number,
    cutId: string,
    gainDb: number,
    reasonKo: string,
  ): void => {
    const safeFrame = Math.round(clamp(frame, 0, maxFrame));
    rawSfx.push({
      id: `sfx-${kind}-${safeFrame}-${rawSfx.length + 1}`,
      kind,
      frame: safeFrame,
      timeSec: roundTo(safeFrame / fps, 3),
      beatIndex: Math.max(0, Math.round(safeFrame / framesPerBeat)),
      cutId,
      gainDb: roundTo(gainDb, 1),
      labelKo: SFX_MARKER_LABELS_KO[kind],
      reasonKo,
    });
  };

  if (firstCut.actionIntensity >= 0.65) {
    pushSfx("whoosh", 0, firstCut.id, -3.0, "오프닝 훅 고속 카메라 푸시인");
  } else {
    pushSfx("spark-chime", 0, firstCut.id, -4.5, "오프닝 시선 집중 톤 알림");
  }

  for (let i = 1; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (!cut) continue;
    if (cut.beat === "setup") {
      pushSfx("page-turn", cut.startFrame, cut.id, -5.5, "도입 컷 전개 전환음");
    } else if (cut.beat === "tension-rise") {
      pushSfx("whoosh", Math.max(0, cut.startFrame - 2), cut.id, -3.2, "긴장 상승 컷 전환 프리랩");
      if (cut.gutterWhitespaceRatio >= 0.4 || cut.actionIntensity >= 0.58) {
        const pulseFrame = Math.round(cut.startFrame + cut.durationFrames * 0.52);
        const pulseQ = quantizeFrameToBeat(pulseFrame, framesPerBeat, maxFrame, 6);
        const boundedPulse = clamp(
          pulseQ.frame,
          cut.startFrame + 2,
          Math.max(cut.startFrame + 2, cut.endFrame - 2),
        );
        pushSfx("heartbeat", boundedPulse, cut.id, -4.0, "여백 호흡·긴장 고조 심박 강조");
      }
    } else if (cut.beat === "climax-drop") {
      pushSfx("impact-hit", cut.startFrame, cut.id, -0.5, "클라이맥스 스냅 줌 정면 임팩트");
      const peakSparkFrame = Math.round(cut.startFrame + cut.durationFrames * 0.28);
      if (peakSparkFrame > cut.startFrame && peakSparkFrame < cut.endFrame) {
        pushSfx("spark-chime", peakSparkFrame, cut.id, -2.5, "각성·하이라이트 정점 반짝임");
      }
    } else if (cut.beat === "cliffhanger") {
      const cliffSfx: SfxMarkerKind = cut.gutterWhitespaceRatio >= 0.55 ? "heartbeat" : "spark-chime";
      pushSfx(
        cliffSfx,
        cut.startFrame,
        cut.id,
        -2.8,
        cliffSfx === "heartbeat" ? "반전 직후 정적 심박 여운" : "다음 화 예고 포인트 차임",
      );
    }
  }

  const seenKeys = new Set<string>();
  const sfxMarkers = rawSfx
    .filter((marker) => {
      const key = `${marker.kind}:${marker.frame}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    })
    .sort((a, b) => (a.frame !== b.frame ? a.frame - b.frame : a.id.localeCompare(b.id)));

  return {
    bpm,
    fps,
    totalFrames,
    beatGridFrames,
    bgmTransitions,
    sfxMarkers,
  };
}

/**
 * 컷별 SFX 마커와 섹션별 BGM 전환을 즉시 조회하기 위한 인메모리 인덱스(`cueIndex`)를 생성한다.
 */
export function createAudioCueIndex(cueSheet: AudioCueSheet): AudioCueLookupIndex {
  const cueIndex = new Map<string, SfxCueMarker[]>();
  for (const marker of cueSheet.sfxMarkers) {
    const list = cueIndex.get(marker.cutId) ?? [];
    list.push(marker);
    cueIndex.set(marker.cutId, list);
  }
  const bgmBySection = new Map<BgmSectionKind, BgmTransitionCue>();
  for (const cue of cueSheet.bgmTransitions) {
    bgmBySection.set(cue.section, cue);
  }
  return { cueIndex, bgmBySection };
}

function toSafeRemotionCompositionId(raw: string): string {
  const cleaned = raw
    .replace(/[^A-Za-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return cleaned.length > 0 ? cleaned : "ToonStudioPromo";
}

/**
 * 9:16(1080×1920) 또는 16:9(1920×1080) Remotion 렌더링용 결정론적 JSON 매니페스트를 빌드한다.
 */
export function buildRemotionPromoManifest(
  rhythmReport: CutRhythmAnalysisReport,
  parallaxTracks: readonly CutParallaxTrack[],
  audioCueSheet: AudioCueSheet,
  options: RemotionManifestOptions = {},
): RemotionPromoManifest {
  const aspectRatio: PromoAspectPreset = options.aspectPreset ?? "9:16";
  const width = aspectRatio === "9:16" ? 1080 : 1920;
  const height = aspectRatio === "9:16" ? 1920 : 1080;
  const safeZoneBottomPx = aspectRatio === "9:16" ? 320 : 140;

  const trackEntries = new Map<string, CutParallaxTrack>();
  for (const track of parallaxTracks) {
    trackEntries.set(track.cutId, track);
  }

  const sequences: RemotionSequenceSpec[] = rhythmReport.cuts.map((cut, index) => {
    const track = trackEntries.get(cut.id);
    if (!track) {
      throw new Error(`컷(${cut.id})에 대응하는 패럴랙스 트랙을 찾을 수 없습니다.`);
    }
    return {
      sequenceId: `seq-${String(index + 1).padStart(2, "0")}-${cut.id}`,
      cutId: cut.id,
      title: cut.title,
      beat: cut.beat,
      from: cut.startFrame,
      durationInFrames: cut.durationFrames,
      endFrame: cut.endFrame,
      depthPlanes: {
        bgParallax: track.layerSpeeds.bgParallax,
        mgParallax: track.layerSpeeds.mgParallax,
        fgParallax: track.layerSpeeds.fgParallax,
        bgMotif: cut.depthLayers.bgMotif,
        mgSubject: cut.depthLayers.mgSubject,
        fgAccent: cut.depthLayers.fgAccent,
        focusPoint: cut.depthLayers.focusPoint,
        toneTag: cut.depthLayers.toneTag,
      },
      cameraKeyframes: track.keyframes,
      caption: {
        lines: cut.balloonTexts,
        charCount: cut.balloonCharCount,
        wordCount: cut.balloonWordCount,
        safeZoneBottomPx,
      },
    };
  });

  const sumSeqFrames = sequences.reduce((acc, seq) => acc + seq.durationInFrames, 0);
  const presetId = options.presetId ?? "custom-storyboard";
  const aspectSlug = aspectRatio === "9:16" ? "9x16" : "16x9";
  const compositionId = toSafeRemotionCompositionId(
    options.compositionId ??
      `ToonStudioPromo-${presetId}-${aspectSlug}-${rhythmReport.targetDurationSec}s`,
  );

  return {
    schemaVersion: "toonstudio.remotion-promo.v1",
    compositionId,
    aspectRatio,
    width,
    height,
    fps: rhythmReport.fps,
    durationInFrames: rhythmReport.totalFrames,
    durationSec: rhythmReport.targetDurationSec,
    recommendedBpm: rhythmReport.recommendedBpm,
    frameDrift: rhythmReport.totalFrames - sumSeqFrames,
    metadata: {
      seriesTitle: options.seriesTitle ?? "툰스튜디오 오리지널",
      episodeTitle: options.episodeTitle ?? "에피소드 프로모 티저",
      presetId,
      profile: "2.5d-moving-toon-auto-director",
    },
    sequences,
    audioTrack: {
      bpm: audioCueSheet.bpm,
      bgmTransitions: audioCueSheet.bgmTransitions,
      sfxMarkers: audioCueSheet.sfxMarkers,
    },
    renderSettings: {
      codec: "h264",
      pixelFormat: "yuv420p",
      crf: 18,
      audioBitrate: "192k",
    },
  };
}

export function serializeRemotionPromoManifest(manifest: RemotionPromoManifest): string {
  return JSON.stringify(manifest, null, 2);
}
