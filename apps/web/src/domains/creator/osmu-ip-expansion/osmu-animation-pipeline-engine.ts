/**
 * OSMU IP 확장 엔진 2부 — 애니메이션(TV · OTT · 숏폼 무빙툰/애니) 24fps X-Sheet ·
 * 2.5D 패럴랙스 깊이 카메라 워킹 · 한국어 음소 립싱크 · 원화/동화/채색 분업 패키저.
 *
 * 100% 무과금(₩0) 결정론적 로컬 계산 엔진이다.
 */

export const STANDARD_ANIMATION_FPS = 24;

export const ANIMATION_LAYER_ORDER = ["BG", "MID", "CHAR", "FX", "SPEECH"] as const;
type AnimationLayerKind = (typeof ANIMATION_LAYER_ORDER)[number];

export const VISEME_SHAPES = ["Closed", "A", "I", "U", "E", "O"] as const;
type LipSyncViseme = (typeof VISEME_SHAPES)[number];

export type AnimationFormatId = "tv-anime" | "ott-series" | "shortform-movingtoon";
export type AnimationAspectRatio = "16:9" | "9:16";
export type AnimationKomaStyle = "1s" | "2s" | "3s";
type AnimationCameraMove =
  | "STATIC"
  | "PAN_LEFT"
  | "PAN_RIGHT"
  | "TILT_UP"
  | "TILT_DOWN"
  | "DOLLY_IN"
  | "DOLLY_OUT"
  | "TRUCK_PARALLAX";
type AnimationActionComplexity = "hold" | "simple" | "standard" | "sakuga";

interface AnimationLayerInput {
  readonly kind: AnimationLayerKind;
  readonly label: string;
  readonly assetRef: string;
  readonly opacity?: number;
  readonly motionHint?: string;
}

interface AnimationDialogueCue {
  readonly speaker: string;
  readonly text: string;
  readonly startOffsetSec: number;
}

interface AnimationCutInput {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneTitle: string;
  readonly durationSec: number;
  readonly cameraMove: AnimationCameraMove;
  readonly cameraIntensity: "subtle" | "medium" | "dynamic";
  readonly actionComplexity: AnimationActionComplexity;
  readonly layers: readonly AnimationLayerInput[];
  readonly dialogues: readonly AnimationDialogueCue[];
}

interface AnimationProductionOptions {
  readonly fps?: number;
  readonly format?: AnimationFormatId;
  readonly aspectRatio?: AnimationAspectRatio;
  readonly komaStyle?: AnimationKomaStyle;
  readonly seriesTitle?: string;
}

interface ParallaxLayerTrack {
  readonly kind: AnimationLayerKind;
  readonly roleKo: string;
  readonly label: string;
  readonly assetRef: string;
  readonly zDepthMeters: number;
  readonly parallaxMultiplier: number;
  readonly opacity: number;
  readonly startOffsetPx: { readonly x: number; readonly y: number };
  readonly endOffsetPx: { readonly x: number; readonly y: number };
  readonly scaleStart: number;
  readonly scaleEnd: number;
  readonly motionHint: string;
}

interface LipSyncKeyFrame {
  readonly speaker: string;
  readonly syllable: string;
  readonly viseme: LipSyncViseme;
  readonly mouthOpenRatio: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly durationFrames: number;
  readonly startSec: number;
  readonly endSec: number;
}

interface XSheetFrameRow {
  readonly globalFrame: number;
  readonly cutFrame: number;
  readonly secondMark: string;
  readonly bgCel: string;
  readonly midCel: string;
  readonly charKeyCel: string;
  readonly fxCel: string;
  readonly speechHold: string;
  readonly cameraCue: string;
  readonly lipSyncViseme: LipSyncViseme;
  readonly dialogueSyllable: string;
  readonly isKeyFrame: boolean;
}

interface DivisionWorkOrder {
  readonly komaCadence: AnimationKomaStyle;
  readonly keyAnimationCount: number;
  readonly inBetweenCount: number;
  readonly paintCelCount: number;
  readonly compositeLayerCount: number;
  readonly estimatedDepartmentHours: {
    readonly keyAnimation: number;
    readonly inBetween: number;
    readonly paintColor: number;
    readonly compositeParallax: number;
  };
  readonly deliverableChecklist: readonly string[];
}

interface AnimationCutPacket {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneTitle: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly durationFrames: number;
  readonly durationSec: number;
  readonly startTimecode: string;
  readonly endTimecode: string;
  readonly parallaxPlan: {
    readonly cameraMove: AnimationCameraMove;
    readonly cameraMoveLabelKo: string;
    readonly cameraEasing: string;
    readonly layers: readonly ParallaxLayerTrack[];
  };
  readonly xSheetRows: readonly XSheetFrameRow[];
  readonly lipSyncTracks: readonly LipSyncKeyFrame[];
  readonly divisionWorkOrder: DivisionWorkOrder;
}

export interface AnimationProductionPacket {
  readonly seriesTitle: string;
  readonly fps: number;
  readonly format: AnimationFormatId;
  readonly formatLabelKo: string;
  readonly aspectRatio: AnimationAspectRatio;
  readonly komaStyle: AnimationKomaStyle;
  readonly totalCuts: number;
  readonly totalFrames: number;
  readonly totalDurationSec: number;
  readonly formattedTimecode: string;
  readonly cuts: readonly AnimationCutPacket[];
  readonly departmentSummary: {
    readonly totalKeyDrawings: number;
    readonly totalInBetweens: number;
    readonly totalPaintCels: number;
    readonly totalLipSyncKeys: number;
    readonly estimatedTotalHours: number;
    readonly byDepartment: {
      readonly keyAnimationHours: number;
      readonly inBetweenHours: number;
      readonly paintColorHours: number;
      readonly compositeParallaxHours: number;
    };
  };
  readonly jsonExport: string;
  readonly markdownExport: string;
}

export const ANIMATION_FORMAT_SPECS: Readonly<
  Record<
    AnimationFormatId,
    {
      readonly labelKo: string;
      readonly defaultAspect: AnimationAspectRatio;
      readonly descriptionKo: string;
    }
  >
> = Object.freeze({
  "tv-anime": {
    labelKo: "TV 애니메이션 (24fps · 16:9)",
    defaultAspect: "16:9",
    descriptionKo: "2코마(12 drawings/s) 표준 방송 애니메이션 X-Sheet · 원화/동화 분업 규격",
  },
  "ott-series": {
    labelKo: "OTT 오리지널 애니 (24fps · 16:9)",
    defaultAspect: "16:9",
    descriptionKo: "고밀도 패럴랙스 합성 및 작화 집중 구간 1코마 혼용 OTT 제작 패킷",
  },
  "shortform-movingtoon": {
    labelKo: "숏폼 무빙툰/세로 애니 (24fps · 9:16)",
    defaultAspect: "9:16",
    descriptionKo: "웹툰 분리 레이어 2.5D Z-depth 카메라 + 립싱크 숏폼 영상화 패킷",
  },
});

const LAYER_DEPTH_PRESETS: Readonly<
  Record<
    AnimationLayerKind,
    { readonly zDepthMeters: number; readonly parallaxMultiplier: number; readonly roleKo: string }
  >
> = Object.freeze({
  BG: { zDepthMeters: -12.0, parallaxMultiplier: 0.25, roleKo: "원경 배경" },
  MID: { zDepthMeters: -4.5, parallaxMultiplier: 0.6, roleKo: "중경 소품·건축" },
  CHAR: { zDepthMeters: 0.0, parallaxMultiplier: 1.0, roleKo: "주연 캐릭터 액팅" },
  FX: { zDepthMeters: 1.8, parallaxMultiplier: 1.35, roleKo: "전경 이펙트·입자" },
  SPEECH: { zDepthMeters: 3.2, parallaxMultiplier: 1.55, roleKo: "말풍선·자막 오버레이" },
});

const CAMERA_MOVE_LABELS_KO: Readonly<Record<AnimationCameraMove, string>> = Object.freeze({
  STATIC: "고정 샷 (Fix)",
  PAN_LEFT: "좌측 팬 (Pan Left)",
  PAN_RIGHT: "우측 팬 (Pan Right)",
  TILT_UP: "상향 틸트 (Tilt Up)",
  TILT_DOWN: "하향 틸트 (Tilt Down)",
  DOLLY_IN: "트랙 인 / 줌인 (Dolly In)",
  DOLLY_OUT: "트랙 아웃 / 줌아웃 (Dolly Out)",
  TRUCK_PARALLAX: "2.5D 측면 트럭 패럴랙스 (Truck)",
});

const CAMERA_BASE_DISPLACEMENT: Readonly<
  Record<
    AnimationCameraMove,
    { readonly dx: number; readonly dy: number; readonly dScale: number; readonly easing: string }
  >
> = Object.freeze({
  STATIC: { dx: 0, dy: 0, dScale: 0, easing: "linear (hold)" },
  PAN_LEFT: { dx: -120, dy: 0, dScale: 0.02, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" },
  PAN_RIGHT: { dx: 120, dy: 0, dScale: 0.02, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" },
  TILT_UP: { dx: 0, dy: -96, dScale: 0.015, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  TILT_DOWN: { dx: 0, dy: 96, dScale: 0.015, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  DOLLY_IN: { dx: 0, dy: -12, dScale: 0.14, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  DOLLY_OUT: { dx: 0, dy: 12, dScale: -0.11, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  TRUCK_PARALLAX: { dx: -148, dy: -18, dScale: 0.05, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
});

const VISEME_MOUTH_OPEN: Readonly<Record<LipSyncViseme, number>> = Object.freeze({
  Closed: 0,
  A: 0.92,
  I: 0.45,
  U: 0.38,
  E: 0.68,
  O: 0.78,
});

/** 24fps 기준 프레임 수를 MM:SS:FF 타임코드로 포맷한다. */
export function formatFrameTimecode(totalFrames: number, fps = STANDARD_ANIMATION_FPS): string {
  const safeFps = Math.max(1, Math.round(fps));
  const safeFrames = Math.max(0, Math.round(totalFrames));
  const totalSeconds = Math.floor(safeFrames / safeFps);
  const frames = safeFrames % safeFps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

/**
 * 한글 음절의 중성 모음(유니코드 자모 분해) 또는 영문 모음을 애니메이션 립싱크 음소(`A/I/U/E/O/Closed`)로 변환한다.
 */
function charToLipSyncViseme(char: string): LipSyncViseme {
  if (/[\s.,!?…·\-:;'"“”‘’()]/u.test(char)) return "Closed";
  const code = char.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jungIndex = Math.floor(((code - 0xac00) % 588) / 28);
    // 0:ㅏ 1:ㅐ 2:ㅑ 3:ㅒ 4:ㅓ 5:ㅔ 6:ㅕ 7:ㅖ 8:ㅗ 9:ㅘ 10:ㅙ 11:ㅚ 12:ㅛ 13:ㅜ 14:ㅝ 15:ㅞ 16:ㅟ 17:ㅠ 18:ㅡ 19:ㅢ 20:ㅣ
    if (
      jungIndex === 0 ||
      jungIndex === 1 ||
      jungIndex === 2 ||
      jungIndex === 3 ||
      jungIndex === 9 ||
      jungIndex === 10
    ) {
      return "A";
    }
    if (jungIndex === 20 || jungIndex === 19 || jungIndex === 16) return "I";
    if (jungIndex === 13 || jungIndex === 17 || jungIndex === 18) return "U";
    if (
      jungIndex === 4 ||
      jungIndex === 5 ||
      jungIndex === 6 ||
      jungIndex === 7 ||
      jungIndex === 14 ||
      jungIndex === 15
    ) {
      return "E";
    }
    return "O"; // 8:ㅗ, 11:ㅚ, 12:ㅛ
  }
  const lower = char.toLowerCase();
  if (lower === "a") return "A";
  if (lower === "i" || lower === "y") return "I";
  if (lower === "u" || lower === "w") return "U";
  if (lower === "e") return "E";
  if (lower === "o") return "O";
  return "Closed";
}

/**
 * 대사 문자열을 24fps 프레임 기반 음소 립싱크 타임라인(`A/I/U/E/O/Closed`)으로 분해한다.
 */
export function extractLipSyncVisemesFromKorean(params: {
  readonly speaker: string;
  readonly text: string;
  readonly startFrame: number;
  readonly fps?: number;
  readonly framesPerSyllable?: number;
}): readonly LipSyncKeyFrame[] {
  const fps = Math.max(1, Math.round(params.fps ?? STANDARD_ANIMATION_FPS));
  const framesPerSyllable = Math.max(1, Math.round(params.framesPerSyllable ?? 3));
  const chars = [...params.text.trim()];
  if (chars.length === 0) return [];

  const keys: LipSyncKeyFrame[] = [];
  let cursor = Math.max(1, Math.round(params.startFrame));

  for (const ch of chars) {
    const viseme = charToLipSyncViseme(ch);
    const isPause = viseme === "Closed";
    const durationFrames = isPause ? Math.max(1, Math.floor(framesPerSyllable / 2)) : framesPerSyllable;
    const startFrame = cursor;
    const endFrame = cursor + durationFrames - 1;
    keys.push({
      speaker: params.speaker,
      syllable: isPause ? "·" : ch,
      viseme,
      mouthOpenRatio: VISEME_MOUTH_OPEN[viseme],
      startFrame,
      endFrame,
      durationFrames,
      startSec: Number(((startFrame - 1) / fps).toFixed(3)),
      endSec: Number((endFrame / fps).toFixed(3)),
    });
    cursor = endFrame + 1;
  }

  // 발화 종료 후 입을 닫는 마무리 키프레임(Closed)을 항상 추가한다.
  if (keys[keys.length - 1]?.viseme !== "Closed") {
    const startFrame = cursor;
    const endFrame = cursor + 1;
    keys.push({
      speaker: params.speaker,
      syllable: "—",
      viseme: "Closed",
      mouthOpenRatio: 0,
      startFrame,
      endFrame,
      durationFrames: 2,
      startSec: Number(((startFrame - 1) / fps).toFixed(3)),
      endSec: Number((endFrame / fps).toFixed(3)),
    });
  }

  return keys;
}

function buildParallaxTracks(cut: AnimationCutInput): readonly ParallaxLayerTrack[] {
  const intensityScale =
    cut.cameraIntensity === "subtle" ? 0.6 : cut.cameraIntensity === "dynamic" ? 1.55 : 1.0;
  const base = CAMERA_BASE_DISPLACEMENT[cut.cameraMove];

  const byKind = new Map<AnimationLayerKind, AnimationLayerInput>();
  for (const layer of cut.layers) {
    byKind.set(layer.kind, layer);
  }

  const tracks: ParallaxLayerTrack[] = [];
  for (const kind of ANIMATION_LAYER_ORDER) {
    const layer = byKind.get(kind);
    if (!layer) continue;
    const preset = LAYER_DEPTH_PRESETS[kind];
    const mult = preset.parallaxMultiplier * intensityScale;
    const endX = Number((base.dx * mult).toFixed(1));
    const endY = Number((base.dy * mult).toFixed(1));
    const scaleDelta = Number((base.dScale * preset.parallaxMultiplier * intensityScale).toFixed(3));
    const scaleStart = 1.0;
    const scaleEnd = Number(Math.max(0.75, scaleStart + scaleDelta).toFixed(3));

    tracks.push({
      kind,
      roleKo: preset.roleKo,
      label: layer.label,
      assetRef: layer.assetRef,
      zDepthMeters: preset.zDepthMeters,
      parallaxMultiplier: preset.parallaxMultiplier,
      opacity: layer.opacity ?? 1,
      startOffsetPx: { x: 0, y: 0 },
      endOffsetPx: { x: endX, y: endY },
      scaleStart,
      scaleEnd,
      motionHint:
        layer.motionHint ??
        `${preset.roleKo} · Z=${preset.zDepthMeters}m (배율 ${preset.parallaxMultiplier}x)`,
    });
  }

  return tracks;
}

function komaStepSize(komaStyle: AnimationKomaStyle): number {
  if (komaStyle === "1s") return 1;
  if (komaStyle === "3s") return 3;
  return 2;
}

function buildCutDivisionWorkOrder(
  cut: AnimationCutInput,
  durationFrames: number,
  komaStyle: AnimationKomaStyle,
  activeLayerCount: number,
): DivisionWorkOrder {
  const step = komaStepSize(komaStyle);
  const complexityFactor =
    cut.actionComplexity === "hold"
      ? 0.35
      : cut.actionComplexity === "simple"
        ? 0.65
        : cut.actionComplexity === "sakuga"
          ? 1.4
          : 1.0;

  const totalDrawings = Math.max(2, Math.ceil((durationFrames / step) * complexityFactor));
  const keyRatio = cut.actionComplexity === "sakuga" ? 0.42 : cut.actionComplexity === "hold" ? 0.5 : 0.3;
  const keyAnimationCount = Math.max(2, Math.round(totalDrawings * keyRatio));
  const inBetweenCount = Math.max(0, totalDrawings - keyAnimationCount);
  const fxActive = cut.layers.some((layer) => layer.kind === "FX");
  const paintCelCount = (keyAnimationCount + inBetweenCount) * (fxActive ? 2 : 1);

  const keyAnimation = Number((keyAnimationCount * 0.55).toFixed(1));
  const inBetween = Number((inBetweenCount * 0.25).toFixed(1));
  const paintColor = Number((paintCelCount * 0.14).toFixed(1));
  const compositeParallax = Number((activeLayerCount * 0.35 + durationFrames / 60).toFixed(1));

  const deliverableChecklist = [
    `원화(LO·Genga) ${keyAnimationCount}매 키포즈 검수 완료`,
    `동화(Douga) ${inBetweenCount}매 ${komaStyle} 타이밍 시트 정합`,
    `채색(Finish) ${paintCelCount}셀 컬러 스크립트 LUT 일치`,
    `2.5D 합성(Composite) ${activeLayerCount}개 분리 레이어(${cut.cameraMove}) 패럴랙스 렌더`,
  ];

  return {
    komaCadence: komaStyle,
    keyAnimationCount,
    inBetweenCount,
    paintCelCount,
    compositeLayerCount: activeLayerCount,
    estimatedDepartmentHours: {
      keyAnimation,
      inBetween,
      paintColor,
      compositeParallax,
    },
    deliverableChecklist,
  };
}

/**
 * 3. 애니메이션(TV · OTT · 숏폼 무빙툰/애니) 24fps X-Sheet · 2.5D 패럴랙스 · 립싱크 · 분업 패킷 생성.
 */
export function buildAnimationProductionPacket(
  cuts: readonly AnimationCutInput[],
  options?: AnimationProductionOptions,
): AnimationProductionPacket {
  const fps = Math.max(1, Math.round(options?.fps ?? STANDARD_ANIMATION_FPS));
  const format = options?.format ?? "tv-anime";
  const formatSpec = ANIMATION_FORMAT_SPECS[format];
  const aspectRatio = options?.aspectRatio ?? formatSpec.defaultAspect;
  const komaStyle = options?.komaStyle ?? "2s";
  const seriesTitle = options?.seriesTitle ?? "시간의 대장간";
  const step = komaStepSize(komaStyle);

  const cutPackets: AnimationCutPacket[] = [];
  let globalFrameCursor = 1;

  for (const cut of cuts) {
    const durationFrames = Math.max(1, Math.round(cut.durationSec * fps));
    const startFrame = globalFrameCursor;
    const endFrame = startFrame + durationFrames - 1;
    globalFrameCursor = endFrame + 1;

    const parallaxLayers = buildParallaxTracks(cut);
    const hasBg = parallaxLayers.some((l) => l.kind === "BG");
    const hasMid = parallaxLayers.some((l) => l.kind === "MID");
    const hasFx = parallaxLayers.some((l) => l.kind === "FX");
    const hasSpeech = parallaxLayers.some((l) => l.kind === "SPEECH");

    // 컷 내부 대사별 립싱크 키프레임 생성(컷 프레임 범위 안으로 클램프)
    const lipSyncTracks: LipSyncKeyFrame[] = [];
    for (const cue of cut.dialogues) {
      const cueStartLocal = Math.min(
        durationFrames,
        Math.max(1, Math.round(cue.startOffsetSec * fps) + 1),
      );
      const rawKeys = extractLipSyncVisemesFromKorean({
        speaker: cue.speaker,
        text: cue.text,
        startFrame: startFrame + cueStartLocal - 1,
        fps,
        framesPerSyllable: 3,
      });
      for (const key of rawKeys) {
        if (key.startFrame > endFrame) break;
        const clampedEnd = Math.min(endFrame, key.endFrame);
        lipSyncTracks.push({
          ...key,
          endFrame: clampedEnd,
          durationFrames: clampedEnd - key.startFrame + 1,
          endSec: Number((clampedEnd / fps).toFixed(3)),
        });
      }
    }

    const workOrder = buildCutDivisionWorkOrder(cut, durationFrames, komaStyle, parallaxLayers.length);

    // 24fps X-Sheet 프레임별 노출표 생성
    const xSheetRows: XSheetFrameRow[] = [];
    let drawingSerial = 1;
    let fxSerial = 1;
    const keyInterval = Math.max(step * 2, Math.floor(durationFrames / Math.max(1, workOrder.keyAnimationCount)));

    for (let cutFrame = 1; cutFrame <= durationFrames; cutFrame += 1) {
      const globalFrame = startFrame + cutFrame - 1;
      const isNewDrawing = (cutFrame - 1) % step === 0;
      const isKeyFrame = cutFrame === 1 || cutFrame === durationFrames || (cutFrame - 1) % keyInterval === 0;

      let charKeyCel = "—";
      if (isKeyFrame) {
        charKeyCel = `K-${String(drawingSerial).padStart(2, "0")}`;
        drawingSerial += 1;
      } else if (isNewDrawing) {
        charKeyCel = `IB-${String(drawingSerial).padStart(2, "0")}`;
        drawingSerial += 1;
      }

      let fxCel = hasFx ? "—" : "·";
      if (hasFx && (cutFrame === 1 || (cutFrame - 1) % Math.max(2, step) === 0)) {
        fxCel = `FX-${String(fxSerial).padStart(2, "0")}`;
        fxSerial += 1;
      }

      const activeLip = lipSyncTracks.find(
        (item) => globalFrame >= item.startFrame && globalFrame <= item.endFrame,
      );

      const cameraCue =
        cutFrame === 1
          ? `${cut.cameraMove} START`
          : cutFrame === durationFrames
            ? `${cut.cameraMove} END`
            : cutFrame === Math.ceil(durationFrames / 2)
              ? `${cut.cameraMove} MID`
              : "│";

      xSheetRows.push({
        globalFrame,
        cutFrame,
        secondMark: formatFrameTimecode(globalFrame - 1, fps),
        bgCel: hasBg ? (cutFrame === 1 ? "BG-01" : "│") : "·",
        midCel: hasMid ? (cutFrame === 1 ? "MID-01" : "│") : "·",
        charKeyCel,
        fxCel,
        speechHold: hasSpeech && activeLip ? `SP:${activeLip.speaker}` : hasSpeech ? "SP-HOLD" : "·",
        cameraCue,
        lipSyncViseme: activeLip?.viseme ?? "Closed",
        dialogueSyllable: activeLip?.syllable ?? "·",
        isKeyFrame,
      });
    }

    cutPackets.push({
      cutId: cut.cutId,
      cutNumber: cut.cutNumber,
      sceneTitle: cut.sceneTitle,
      startFrame,
      endFrame,
      durationFrames,
      durationSec: Number((durationFrames / fps).toFixed(3)),
      startTimecode: formatFrameTimecode(startFrame - 1, fps),
      endTimecode: formatFrameTimecode(endFrame, fps),
      parallaxPlan: {
        cameraMove: cut.cameraMove,
        cameraMoveLabelKo: CAMERA_MOVE_LABELS_KO[cut.cameraMove],
        cameraEasing: CAMERA_BASE_DISPLACEMENT[cut.cameraMove].easing,
        layers: parallaxLayers,
      },
      xSheetRows,
      lipSyncTracks,
      divisionWorkOrder: workOrder,
    });
  }

  const totalFrames = cutPackets.reduce((sum, item) => sum + item.durationFrames, 0);
  const totalDurationSec = Number((totalFrames / fps).toFixed(3));
  const formattedTimecode = formatFrameTimecode(totalFrames, fps);

  const totalKeyDrawings = cutPackets.reduce((sum, c) => sum + c.divisionWorkOrder.keyAnimationCount, 0);
  const totalInBetweens = cutPackets.reduce((sum, c) => sum + c.divisionWorkOrder.inBetweenCount, 0);
  const totalPaintCels = cutPackets.reduce((sum, c) => sum + c.divisionWorkOrder.paintCelCount, 0);
  const totalLipSyncKeys = cutPackets.reduce((sum, c) => sum + c.lipSyncTracks.length, 0);

  const keyAnimationHours = Number(
    cutPackets.reduce((sum, c) => sum + c.divisionWorkOrder.estimatedDepartmentHours.keyAnimation, 0).toFixed(1),
  );
  const inBetweenHours = Number(
    cutPackets.reduce((sum, c) => sum + c.divisionWorkOrder.estimatedDepartmentHours.inBetween, 0).toFixed(1),
  );
  const paintColorHours = Number(
    cutPackets.reduce((sum, c) => sum + c.divisionWorkOrder.estimatedDepartmentHours.paintColor, 0).toFixed(1),
  );
  const compositeParallaxHours = Number(
    cutPackets
      .reduce((sum, c) => sum + c.divisionWorkOrder.estimatedDepartmentHours.compositeParallax, 0)
      .toFixed(1),
  );
  const estimatedTotalHours = Number(
    (keyAnimationHours + inBetweenHours + paintColorHours + compositeParallaxHours).toFixed(1),
  );

  const departmentSummary: AnimationProductionPacket["departmentSummary"] = {
    totalKeyDrawings,
    totalInBetweens,
    totalPaintCels,
    totalLipSyncKeys,
    estimatedTotalHours,
    byDepartment: {
      keyAnimationHours,
      inBetweenHours,
      paintColorHours,
      compositeParallaxHours,
    },
  };

  const jsonExport = JSON.stringify(
    {
      seriesTitle,
      fps,
      format,
      aspectRatio,
      komaStyle,
      totalCuts: cutPackets.length,
      totalFrames,
      totalDurationSec,
      formattedTimecode,
      departmentSummary,
      cuts: cutPackets.map((c) => ({
        cutId: c.cutId,
        cutNumber: c.cutNumber,
        sceneTitle: c.sceneTitle,
        startFrame: c.startFrame,
        endFrame: c.endFrame,
        durationFrames: c.durationFrames,
        parallaxPlan: c.parallaxPlan,
        lipSyncTracks: c.lipSyncTracks,
        divisionWorkOrder: c.divisionWorkOrder,
        xSheetRowCount: c.xSheetRows.length,
      })),
    },
    null,
    2,
  );

  const markdownExport = [
    `# ${seriesTitle} — 애니메이션 24fps X-Sheet · 2.5D 패럴랙스 제작 패킷`,
    "",
    `- **포맷**: ${formatSpec.labelKo} (${aspectRatio}, ${komaStyle} 코마)`,
    `- **총 러닝타임**: ${totalFrames}프레임 / ${totalDurationSec}초 (타임코드 \`${formattedTimecode}\` @ ${fps}fps)`,
    `- **분업 집계**: 원화 ${totalKeyDrawings}매 · 동화 ${totalInBetweens}매 · 채색 ${totalPaintCels}셀 · 립싱크 키 ${totalLipSyncKeys}건 (예상 ${estimatedTotalHours}h)`,
    "",
    ...cutPackets.map(
      (cut) =>
        `## ${cut.cutId} (${cut.sceneTitle}) — ${cut.startFrame}~${cut.endFrame}f (${cut.durationFrames}f, ${cut.durationSec}s)\n` +
        `- 카메라: ${cut.parallaxPlan.cameraMoveLabelKo} (\`${cut.parallaxPlan.cameraEasing}\`)\n` +
        `- 2.5D 레이어: ${cut.parallaxPlan.layers.map((l) => `${l.kind}(Z=${l.zDepthMeters}m, ${l.parallaxMultiplier}x)`).join(" → ")}\n` +
        `- 분업: 원화 ${cut.divisionWorkOrder.keyAnimationCount} / 동화 ${cut.divisionWorkOrder.inBetweenCount} / 채색 ${cut.divisionWorkOrder.paintCelCount}`,
    ),
    "",
  ].join("\n");

  return {
    seriesTitle,
    fps,
    format,
    formatLabelKo: formatSpec.labelKo,
    aspectRatio,
    komaStyle,
    totalCuts: cutPackets.length,
    totalFrames,
    totalDurationSec,
    formattedTimecode,
    cuts: cutPackets,
    departmentSummary,
    jsonExport,
    markdownExport,
  };
}

export const SAMPLE_ANIMATION_CUTS: readonly AnimationCutInput[] = Object.freeze([
  {
    cutId: "C001",
    cutNumber: 1,
    sceneTitle: "자정 시계탑 옥상 패럴랙스 도입",
    durationSec: 3.0,
    cameraMove: "TRUCK_PARALLAX",
    cameraIntensity: "medium",
    actionComplexity: "standard",
    layers: [
      { kind: "BG", label: "비 내리는 서울 야경 원경", assetRef: "layers/c001_bg_seoul_night.png" },
      { kind: "MID", label: "멈춘 시계탑 문자판·난간", assetRef: "layers/c001_mid_clocktower.png" },
      { kind: "CHAR", label: "서진우 코트 바람 액팅", assetRef: "layers/c001_char_jinwoo.png" },
      { kind: "FX", label: "전경 빗방울·푸른 시간 입자", assetRef: "layers/c001_fx_rain_particles.png", opacity: 0.9 },
      { kind: "SPEECH", label: "서진우 첫 대사 자막/말풍선", assetRef: "layers/c001_speech_01.svg" },
    ],
    dialogues: [{ speaker: "서진우", text: "시간 틈이 열렸군.", startOffsetSec: 0.5 }],
  },
  {
    cutId: "C002",
    cutNumber: 2,
    sceneTitle: "톱니 화로 점화 · 한서연 클로즈업",
    durationSec: 2.5,
    cameraMove: "DOLLY_IN",
    cameraIntensity: "dynamic",
    actionComplexity: "sakuga",
    layers: [
      { kind: "BG", label: "어두운 지하 톱니바퀴 벽면", assetRef: "layers/c002_bg_gear_room.png" },
      { kind: "MID", label: "붉게 달아오른 대장간 화로", assetRef: "layers/c002_mid_forge.png" },
      { kind: "CHAR", label: "한서연 회중시계 각성 액팅", assetRef: "layers/c002_char_seoyeon.png" },
      { kind: "FX", label: "불꽃 스파크·열기 왜곡", assetRef: "layers/c002_fx_embers.png", opacity: 0.85 },
      { kind: "SPEECH", label: "한서연 대사 자막", assetRef: "layers/c002_speech_02.svg" },
    ],
    dialogues: [{ speaker: "한서연", text: "화로 온도가 떨어져요!", startOffsetSec: 0.25 }],
  },
  {
    cutId: "C003",
    cutNumber: 3,
    sceneTitle: "강태오 난입 · 봉인서 투척",
    durationSec: 2.0,
    cameraMove: "PAN_RIGHT",
    cameraIntensity: "dynamic",
    actionComplexity: "standard",
    layers: [
      { kind: "BG", label: "철문 너머 붉은 복도", assetRef: "layers/c003_bg_corridor.png" },
      { kind: "MID", label: "대장간 중앙 모루", assetRef: "layers/c003_mid_anvil.png" },
      { kind: "CHAR", label: "강태오 봉인서 투척 액팅", assetRef: "layers/c003_char_taeo.png" },
      { kind: "FX", label: "충격파 스피드라인", assetRef: "layers/c003_fx_impact.png" },
      { kind: "SPEECH", label: "강태오 경고 대사", assetRef: "layers/c003_speech_03.svg" },
    ],
    dialogues: [{ speaker: "강태오", text: "당장 그 화로 꺼라.", startOffsetSec: 0.2 }],
  },
]);
