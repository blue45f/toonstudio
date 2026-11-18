/**
 * StudioAnimProToolsDrawer — 애니메이션 전문 도구 통합 서랍(점진적 공개 `<details>` 구성).
 *
 * 통합 도메인:
 * 1. 노출표 입출력 · 셀 일괄 배치 (실제 `AnimationTimelineDoc` 트랙·길이 갱신)
 * 2. 라이트 테이블 · 밑그림 참조 (`toonstudio:anim-light-table:v1` 로컬 유지, 출력 제외)
 * 3. 속도 곡선(`evaluateFunctionCurveChannel`) 실시간 보간값 · 2D 카메라 이동 경로(`locus`)
 * 4. 움직이는 이미지(WebP) 실제 래스터 인코딩 · `muxAnimatedWebpFrames` · `downloadBlob` 저장
 * 5. 동영상 프레임 불러오기(`<input type="file" accept="video/*">` + `extractVideoFramesWithAdapter`)
 *
 * REA 근거: ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68,
 * ev_84e24ea66b2393d0fa57182b4de9dbe3be9c25ee54f982c2dcfc534bf63eddda,
 * ev_853855365e8ebbed8b4f1694c57c2f224a338610827337312b0d42739c4eb4bc,
 * ev_c10045d52f80466e2efbf42d666690099f787c85c31682edf4b202e78622f2f1
 */
import { useEffect, useMemo, useState } from "react";

import { canvasToBlob, downloadBlob } from "../export/studio-export";
import { normalizeAnimationTimelineDoc } from "../studio-anim-tracks";
import { DEFAULT_ONION_SKIN } from "../studio-frame-animation";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { createStudioAnimCamera2DFolder, generateCamera2DLocus, setCamera2DKeyframe } from "./studio-anim-camera-2d";
import {
  FUNCTION_CURVE_CHANNELS, createEmptyFunctionCurveChannel, evaluateFunctionCurveChannel, upsertFunctionCurveKeyframe,
} from "./studio-function-curve";
import {
  createEmptyLightTableState, normalizeLightTableEntry, registerOnionSkinFramesToLightTable,
  resolveActiveLightTableStack, setLightTableEnabled,
} from "./studio-light-table";
import { extractVideoFramesWithAdapter, planMovieToCelImport } from "./studio-movie-import";
import { muxAnimatedWebpFrames } from "./studio-webp-anim-muxer";
import {
  animationTimelineDocToXdts, batchAssignTrackCels, normalizeCelsByTimelineOrder,
  parseXdtsTimesheet, serializeXdtsTimesheet,
} from "./studio-xdts-timesheet";

import type { AnimationTimelineDoc, StudioAnimKeyframe } from "../studio-anim-tracks";
import type { StudioAnimFrame } from "../studio-frame-animation";
import type { FunctionCurveChannelId, FunctionCurveInterpolation } from "./studio-function-curve";
import type { LightTableEntry, StudioLightTableState } from "./studio-light-table";
import type { MovieToCelImportPlan, VideoFrameDecodeAdapter } from "./studio-movie-import";
import type { AnimatedWebpFrameInput } from "./studio-webp-anim-muxer";
import type { StudioXdtsDocument } from "./studio-xdts-timesheet";
import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export const LIGHT_TABLE_STORAGE_KEY = "toonstudio:anim-light-table:v1";

export interface LightTableStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioAnimProToolsDrawerProps {
  readonly doc: AnimationTimelineDoc;
  readonly activeTrackId: string;
  readonly availableCels?: readonly StudioAnimFrame[];
  readonly onDocChange: (nextDoc: AnimationTimelineDoc) => void;
  readonly onXdtsImported?: (xdts: StudioXdtsDocument) => void;
  readonly onRequestAnimatedWebpExport?: (options: { readonly loopCount: number }) => void;
  readonly onRequestMovieImport?: (plan: MovieToCelImportPlan) => void;
  readonly lightTableStorage?: LightTableStorageLike | null;
  readonly encodeFrameWebpBytes?: (frame: StudioAnimFrame) => Promise<Uint8Array>;
  readonly createVideoDecodeAdapter?: (file: File) => VideoFrameDecodeAdapter;
}

function defaultLightTableStorage(): LightTableStorageLike | null {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined" ? window.localStorage : null;
}

function loadPersistedLightTable(storage?: LightTableStorageLike | null): StudioLightTableState {
  const store = storage === undefined ? defaultLightTableStorage() : storage;
  if (!store) return createEmptyLightTableState(true);
  try {
    const raw = store.getItem(LIGHT_TABLE_STORAGE_KEY);
    if (!raw) return createEmptyLightTableState(true);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return createEmptyLightTableState(true);
    const globalEntries = Array.isArray(parsed.globalEntries)
      ? (parsed.globalEntries as LightTableEntry[]).map(normalizeLightTableEntry)
      : [];
    const celEntriesByCelId: Record<string, readonly LightTableEntry[]> = {};
    if (parsed.celEntriesByCelId && typeof parsed.celEntriesByCelId === "object") {
      for (const [celId, list] of Object.entries(parsed.celEntriesByCelId as Record<string, unknown>)) {
        if (Array.isArray(list)) celEntriesByCelId[celId] = (list as LightTableEntry[]).map(normalizeLightTableEntry);
      }
    }
    return { enabled: parsed.enabled !== false, globalEntries, celEntriesByCelId };
  } catch {
    return createEmptyLightTableState(true);
  }
}

function savePersistedLightTable(state: StudioLightTableState, storage?: LightTableStorageLike | null): void {
  const store = storage === undefined ? defaultLightTableStorage() : storage;
  if (!store) return;
  try {
    store.setItem(LIGHT_TABLE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 차단 환경에서는 세션 상태만 유지한다.
  }
}

function createPlaceholderCelDataUrl(label: string): string {
  const safe = encodeURIComponent(label.slice(0, 12));
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="%23ffffff"/><text x="64" y="70" font-size="24" text-anchor="middle" fill="%23111111">${safe}</text></svg>`;
}

function convertXdtsToTimelineDoc(
  xdts: StudioXdtsDocument,
  baseDoc: AnimationTimelineDoc,
  activeTrackId: string,
  availableCels: readonly StudioAnimFrame[],
): AnimationTimelineDoc {
  const firstTable = xdts.timeTables[0];
  if (!firstTable) return baseDoc;
  const knownByLabel = new Map<string, StudioAnimFrame>();
  for (const track of Object.values(baseDoc.tracks)) {
    for (const kf of track) knownByLabel.set(kf.frame.id, kf.frame);
  }
  availableCels.forEach((cel, idx) => {
    knownByLabel.set(cel.id, cel);
    knownByLabel.set(String(idx + 1), cel);
  });
  const nextTracks: Record<string, StudioAnimKeyframe[]> = { ...baseDoc.tracks };
  const headerNames = firstTable.timeTableHeaders.find((h) => h.fieldId === 0)?.names ?? [];
  const grouped = new Map<number, StudioAnimKeyframe[]>();
  for (const span of firstTable.resolvedCellExposures) {
    const existing = knownByLabel.get(span.celLabel);
    const frame: StudioAnimFrame = existing
      ? { ...existing, id: span.celLabel }
      : { id: span.celLabel, src: createPlaceholderCelDataUrl(span.celLabel) };
    const list = grouped.get(span.trackNo) ?? [];
    list.push({ frameIndex: span.startFrame, frame });
    grouped.set(span.trackNo, list);
  }
  for (const [trackNo, kfs] of grouped) {
    const targetId = trackNo === 0 ? activeTrackId : (headerNames[trackNo] ?? `track-${trackNo + 1}`);
    nextTracks[targetId] = kfs;
  }
  return normalizeAnimationTimelineDoc({ ...baseDoc, frameCount: firstTable.duration, tracks: nextTracks });
}

async function rasterizeFrameToWebpBytes(frame: StudioAnimFrame): Promise<Uint8Array> {
  if (typeof document === "undefined") throw new Error("브라우저 캔버스 환경을 사용할 수 없습니다.");
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`셀 이미지(${frame.id})를 읽지 못했습니다.`));
    el.src = frame.src;
  });
  const w = Math.max(2, (img.naturalWidth || 128) & ~1);
  const h = Math.max(2, (img.naturalHeight || 128) & ~1);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 캔버스 컨텍스트를 열 수 없습니다.");
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasToBlob(canvas, "image/webp", 0.92);
  return new Uint8Array(await blob.arrayBuffer());
}

function createDomVideoDecodeAdapter(file: File): VideoFrameDecodeAdapter {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  const canvas = document.createElement("canvas");
  let readyPromise: Promise<void> | null = null;
  const ensureReady = (): Promise<void> => {
    if (video.readyState >= 1) return Promise.resolve();
    readyPromise ??= new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("동영상 파일을 읽을 수 없습니다."));
    });
    return readyPromise;
  };
  return {
    async decodeFrameAt(sampleTimeSec: number) {
      await ensureReady();
      const targetTime = Math.max(0, Math.min(video.duration || sampleTimeSec, sampleTimeSec));
      if (Math.abs(video.currentTime - targetTime) > 1e-3) {
        await new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve();
          video.onerror = () => reject(new Error("동영상 프레임 탐색에 실패했습니다."));
          video.currentTime = targetTime;
        });
      }
      const width = Math.max(2, video.videoWidth || 320);
      const height = Math.max(2, video.videoHeight || 180);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("동영상 캡처 캔버스를 초기화하지 못했습니다.");
      ctx.drawImage(video, 0, 0, width, height);
      return { src: canvas.toDataURL("image/png"), width, height };
    },
    close() {
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
    },
  };
}

const TRANSITION_INTERACTIVE =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";
const SUMMARY_CLASS = cn(
  "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-bold text-fg select-none [word-break:keep-all] hover:bg-raised/80",
  TRANSITION_INTERACTIVE, STUDIO_FOCUS_RING,
);
const ACTION_BTN_CLASS = cn(
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg-2 [word-break:keep-all] hover:border-accent/60 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_INTERACTIVE, STUDIO_FOCUS_RING,
);
const PRIMARY_BTN_CLASS = cn(
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs font-bold text-on-accent [word-break:keep-all] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_INTERACTIVE, STUDIO_FOCUS_RING,
);
const NUMBER_INPUT_CLASS = cn(
  "min-h-11 w-20 rounded-lg border border-line bg-canvas px-2.5 text-right text-xs tabular-nums text-fg focus:border-accent outline-none",
  TRANSITION_INTERACTIVE, STUDIO_FOCUS_RING,
);

const CHANNEL_LABELS: Readonly<Record<FunctionCurveChannelId, string>> = {
  x: "가로 위치", y: "세로 위치", scaleX: "가로 배율", scaleY: "세로 배율", rotationDeg: "회전 각도", opacity: "불투명도",
};
const INTERP_LABELS: Readonly<Record<FunctionCurveInterpolation, string>> = {
  constant: "계단 유지", linear: "일정 속도", smooth: "부드러운 가감속",
};

export function StudioAnimProToolsDrawer({
  doc, activeTrackId, availableCels = [], onDocChange, onXdtsImported,
  onRequestAnimatedWebpExport, onRequestMovieImport, lightTableStorage,
  encodeFrameWebpBytes, createVideoDecodeAdapter,
}: StudioAnimProToolsDrawerProps): ReactElement {
  const [xdtsText, setXdtsText] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [holdFrames, setHoldFrames] = useState(2);
  const [lightTable, setLightTable] = useState<StudioLightTableState>(() => loadPersistedLightTable(lightTableStorage));
  const [selectedChannel, setSelectedChannel] = useState<FunctionCurveChannelId>("x");
  const [selectedInterp, setSelectedInterp] = useState<FunctionCurveInterpolation>("smooth");
  const [curveEndValue, setCurveEndValue] = useState(120);
  const [showLocus, setShowLocus] = useState(true);
  const [camStartX, setCamStartX] = useState(36);
  const [camEndX, setCamEndX] = useState(204);
  const [webpLoopCount, setWebpLoopCount] = useState(0);
  const [busyExport, setBusyExport] = useState(false);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [movieDurationSec, setMovieDurationSec] = useState(6);
  const [movieSourceFps] = useState(24);
  const [movieInSec, setMovieInSec] = useState(0);
  const [movieOutSec, setMovieOutSec] = useState(6);
  const [movieTargetFps, setMovieTargetFps] = useState(doc.fps);
  const [busyMovie, setBusyMovie] = useState(false);

  useEffect(() => {
    savePersistedLightTable(lightTable, lightTableStorage);
  }, [lightTable, lightTableStorage]);

  const activeLightStack = useMemo(
    () => resolveActiveLightTableStack(lightTable, { activeCelId: activeTrackId }),
    [lightTable, activeTrackId],
  );
  const activeTrackKeyframes = useMemo(() => doc.tracks[activeTrackId] ?? [], [activeTrackId, doc.tracks]);

  const channelEvaluation = useMemo(() => {
    let channel = createEmptyFunctionCurveChannel(selectedChannel);
    const lastFrame = Math.max(1, doc.frameCount - 1);
    const startVal = selectedChannel === "scaleX" || selectedChannel === "scaleY" || selectedChannel === "opacity" ? 1 : 0;
    const targetVal = selectedChannel === "opacity" ? Math.min(1, Math.max(0, curveEndValue / 100)) : curveEndValue;
    channel = upsertFunctionCurveKeyframe(channel, { frame: 0, value: startVal, interpolation: selectedInterp, handleMode: "auto-monotone" });
    if (activeTrackKeyframes.length >= 2) {
      const midKf = activeTrackKeyframes[Math.floor(activeTrackKeyframes.length / 2)]!;
      if (midKf.frameIndex > 0 && midKf.frameIndex < lastFrame) {
        channel = upsertFunctionCurveKeyframe(channel, {
          frame: midKf.frameIndex, value: (startVal + targetVal) * 0.5, interpolation: selectedInterp, handleMode: "auto-monotone",
        });
      }
    }
    channel = upsertFunctionCurveKeyframe(channel, { frame: lastFrame, value: targetVal, interpolation: selectedInterp, handleMode: "auto-monotone" });
    const midFrame = Math.floor(lastFrame * 0.5);
    return {
      start: evaluateFunctionCurveChannel(channel, 0),
      midFrame,
      mid: evaluateFunctionCurveChannel(channel, midFrame),
      endFrame: lastFrame,
      end: evaluateFunctionCurveChannel(channel, lastFrame),
    };
  }, [activeTrackKeyframes, curveEndValue, doc.frameCount, selectedChannel, selectedInterp]);

  const locusPreview = useMemo(() => {
    const endFrame = Math.max(2, doc.frameCount - 1);
    const midFrame = activeTrackKeyframes[1]?.frameIndex ?? Math.max(1, Math.floor(endFrame * 0.5));
    let cam = createStudioAnimCamera2DFolder({ id: "drawer-cam-2d", baseWidth: 240, baseHeight: 135, showLocus });
    cam = setCamera2DKeyframe(cam, 0, { centerX: camStartX, centerY: 96, zoom: 1 }, selectedInterp);
    cam = setCamera2DKeyframe(cam, Math.min(endFrame - 1, Math.max(1, midFrame)), { centerX: (camStartX + camEndX) * 0.5, centerY: 42, zoom: 1.2 }, selectedInterp);
    cam = setCamera2DKeyframe(cam, endFrame, { centerX: camEndX, centerY: 88, zoom: 1.05 }, selectedInterp);
    return generateCamera2DLocus(cam, { startFrame: 0, endFrame: Math.min(24, endFrame), subStepsPerFrame: 2, tickHalfLengthPx: 4 });
  }, [activeTrackKeyframes, camEndX, camStartX, doc.frameCount, selectedInterp, showLocus]);

  const moviePlan = useMemo(
    () => planMovieToCelImport({
      sourceDurationSec: movieDurationSec, sourceFps: movieSourceFps, targetTimelineFps: movieTargetFps,
      inSec: movieInSec, outSec: movieOutSec,
    }),
    [movieDurationSec, movieSourceFps, movieTargetFps, movieInSec, movieOutSec],
  );

  const handleExportXdts = () => {
    setXdtsText(serializeXdtsTimesheet(animationTimelineDocToXdts(doc, { name: "스튜디오 노출표" })));
    setStatusNotice("현재 타임라인을 디지털 노출표 원문으로 만들었어요.");
  };

  const handleImportXdts = () => {
    try {
      const parsed = parseXdtsTimesheet(xdtsText);
      onDocChange(convertXdtsToTimelineDoc(parsed, doc, activeTrackId, availableCels));
      onXdtsImported?.(parsed);
      const spanCount = parsed.timeTables.reduce((sum, tt) => sum + tt.resolvedCellExposures.length, 0);
      setStatusNotice(`노출표 문서를 타임라인에 반영했어요 (노출 구간 ${spanCount}개).`);
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : "노출표 해석에 실패했어요.");
    }
  };

  const handleBatchAssign = () => {
    const celsToUse: readonly StudioAnimFrame[] = availableCels.length > 0
      ? availableCels
      : [{ id: "1", src: createPlaceholderCelDataUrl("1") }, { id: "2", src: createPlaceholderCelDataUrl("2") }];
    onDocChange(batchAssignTrackCels(doc, {
      trackId: activeTrackId, cels: celsToUse, startFrame: 0, endFrame: doc.frameCount - 1, holdFrames, loopToEnd: true,
    }));
    setStatusNotice(`${holdFrames}칸 유지 간격으로 트랙 셀을 일괄 배치했어요.`);
  };

  const handleNormalizeOrder = () => {
    const { doc: normalized, renamedMap } = normalizeCelsByTimelineOrder(doc, activeTrackId);
    onDocChange(normalized);
    setStatusNotice(`타임라인 순서대로 셀 ${renamedMap.size}개의 번호를 정리했어요.`);
  };

  const handleRegisterOnionToLightTable = () => {
    const sourceFrames = availableCels.length >= 2 ? availableCels : activeTrackKeyframes.map((k) => k.frame);
    if (sourceFrames.length < 2) {
      setStatusNotice("라이트 테이블에 등록하려면 최소 2장 이상의 셀 프레임이 필요해요.");
      return;
    }
    setLightTable(registerOnionSkinFramesToLightTable(lightTable, sourceFrames, 0, DEFAULT_ONION_SKIN, { targetCelId: activeTrackId }));
    setStatusNotice("인접 어니언스킨 프레임을 라이트 테이블에 등록했어요.");
  };

  const handleAnimatedWebpExport = async () => {
    if (onRequestAnimatedWebpExport) {
      onRequestAnimatedWebpExport({ loopCount: webpLoopCount });
      setStatusNotice("움직이는 이미지 내보내기를 상위 렌더러에 전달했어요.");
      return;
    }
    const unitMs = Math.max(16, Math.round(1000 / doc.fps));
    const segments = activeTrackKeyframes.length > 0
      ? activeTrackKeyframes.map((kf, idx) => {
          const nextIdx = idx + 1 < activeTrackKeyframes.length ? activeTrackKeyframes[idx + 1]!.frameIndex : doc.frameCount;
          return { frame: kf.frame, durationMs: Math.max(1, nextIdx - kf.frameIndex) * unitMs };
        })
      : availableCels.map((cel) => ({ frame: cel, durationMs: unitMs }));
    if (segments.length === 0) {
      setStatusNotice("저장할 키프레임 셀이 없습니다. 먼저 트랙에 셀을 추가해 주세요.");
      return;
    }
    setBusyExport(true);
    try {
      const encoder = encodeFrameWebpBytes ?? rasterizeFrameToWebpBytes;
      const inputs: AnimatedWebpFrameInput[] = [];
      for (const seg of segments) {
        inputs.push({ webpBytes: await encoder(seg.frame), durationMs: seg.durationMs });
      }
      const muxed = muxAnimatedWebpFrames(inputs, { loopCount: webpLoopCount });
      downloadBlob(new Blob([muxed.slice()], { type: "image/webp" }), "animation-export.webp");
      setStatusNotice(`움직이는 이미지 파일(${inputs.length}장)을 저장했어요.`);
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : "현재 브라우저 환경에서는 움직이는 이미지 저장을 완료하지 못했어요.");
    } finally {
      setBusyExport(false);
    }
  };

  const handleMovieImport = async () => {
    if (moviePlan.plannedCels.length === 0) return;
    if (selectedVideoFile) {
      setBusyMovie(true);
      try {
        const adapter = createVideoDecodeAdapter ? createVideoDecodeAdapter(selectedVideoFile) : createDomVideoDecodeAdapter(selectedVideoFile);
        const extracted = await extractVideoFramesWithAdapter(moviePlan, adapter);
        onDocChange(normalizeAnimationTimelineDoc({
          ...doc,
          frameCount: Math.max(doc.frameCount, extracted.keyframes.length),
          tracks: { ...doc.tracks, [activeTrackId]: [...extracted.keyframes] },
        }));
        onRequestMovieImport?.(moviePlan);
        setStatusNotice(`동영상에서 셀 ${extracted.keyframes.length}장을 추출해 트랙에 넣었어요.`);
      } catch (err) {
        setStatusNotice(err instanceof Error ? err.message : "동영상 프레임 추출에 실패했어요.");
      } finally {
        setBusyMovie(false);
      }
      return;
    }
    if (onRequestMovieImport) {
      onRequestMovieImport(moviePlan);
      setStatusNotice(`선택 구간(${moviePlan.plannedCels.length}장) 불러오기를 요청했어요.`);
      return;
    }
    setStatusNotice("먼저 불러올 동영상 파일을 선택해 주세요.");
  };

  return (
    <aside aria-label="애니메이션 전문 도구 서랍" className="space-y-2.5 rounded-xl border border-line bg-panel p-3 text-fg [word-break:keep-all]">
      <header className="space-y-0.5 px-1">
        <h3 className="text-sm font-bold text-fg">애니메이션 전문 도구</h3>
        <p className="text-xs leading-relaxed text-fg-3">
          노출표 입출력·라이트 테이블·속도 곡선·카메라 경로·움직이는 이미지·동영상 불러오기를 단계별로 다룹니다.
        </p>
      </header>

      {statusNotice ? (
        <p role="status" aria-live="polite" className="rounded-lg border border-accent/40 bg-accent-soft/40 px-3 py-2 text-xs font-medium text-fg">
          {statusNotice}
        </p>
      ) : null}

      <details open className="rounded-xl border border-line bg-card/60 p-1.5">
        <summary className={SUMMARY_CLASS}>
          <span>노출표 입출력 · 셀 일괄 배치</span>
          <span className="text-[0.68rem] font-normal tabular-nums text-fg-3">표준 호환</span>
        </summary>
        <div className="space-y-2.5 px-2 pb-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-fg-2">
              유지 칸수
              <input type="number" min={1} max={24} aria-label="일괄 셀 유지 프레임 수" value={holdFrames}
                onChange={(e) => setHoldFrames(Math.max(1, Number(e.target.value) || 1))} className={NUMBER_INPUT_CLASS} />
            </label>
            <button type="button" onClick={handleBatchAssign} className={ACTION_BTN_CLASS}>셀 일괄 배치</button>
            <button type="button" onClick={handleNormalizeOrder} className={ACTION_BTN_CLASS}>순서대로 셀 번호 정리</button>
          </div>
          <label className="block space-y-1 text-xs text-fg-2">
            <span>노출표 원문 데이터</span>
            <textarea rows={3} aria-label="노출표 원문 데이터" value={xdtsText} onChange={(e) => setXdtsText(e.target.value)}
              placeholder="디지털 노출표 데이터를 붙여넣거나 아래 버튼으로 생성하세요."
              className={cn("w-full rounded-lg border border-line bg-canvas p-2 font-mono text-xs text-fg", STUDIO_FOCUS_RING)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleExportXdts} className={ACTION_BTN_CLASS}>노출표 원문 만들기</button>
            <button type="button" disabled={!xdtsText.trim()} onClick={handleImportXdts} className={PRIMARY_BTN_CLASS}>
              노출표 불러와 타임라인 반영
            </button>
          </div>
        </div>
      </details>

      <details className="rounded-xl border border-line bg-card/60 p-1.5">
        <summary className={SUMMARY_CLASS}>
          <span>라이트 테이블 · 밑그림 참조</span>
          <span className="text-[0.68rem] font-normal tabular-nums text-fg-3">활성 참조 {activeLightStack.length}개 · 출력 제외</span>
        </summary>
        <div className="space-y-2 px-2 pb-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={lightTable.enabled}
              onClick={() => setLightTable((prev) => setLightTableEnabled(prev, !prev.enabled))} className={ACTION_BTN_CLASS}>
              {lightTable.enabled ? "라이트 테이블 켜짐" : "라이트 테이블 꺼짐"}
            </button>
            <button type="button" onClick={handleRegisterOnionToLightTable} className={ACTION_BTN_CLASS}>어니언스킨 프레임 등록</button>
          </div>
          <p className="text-[0.7rem] leading-relaxed text-fg-3">참조 설정은 이 브라우저에 유지되며, 내보내기 결과물에는 합성되지 않습니다.</p>
        </div>
      </details>

      <details className="rounded-xl border border-line bg-card/60 p-1.5">
        <summary className={SUMMARY_CLASS}>
          <span>속도 곡선 · 카메라 이동 경로</span>
          <span className="text-[0.68rem] font-normal tabular-nums text-fg-3">눈금 {locusPreview.frameTicks.length}개</span>
        </summary>
        <div className="space-y-2.5 px-2 pb-2 pt-1">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-xs text-fg-2">
              <span>편집 채널</span>
              <select aria-label="속도 곡선 채널 선택" value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value as FunctionCurveChannelId)}
                className={cn("min-h-11 w-full rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg", STUDIO_FOCUS_RING)}>
                {FUNCTION_CURVE_CHANNELS.map((ch) => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-fg-2">
              <span>보간 방식</span>
              <select aria-label="속도 곡선 보간 방식" value={selectedInterp}
                onChange={(e) => setSelectedInterp(e.target.value as FunctionCurveInterpolation)}
                className={cn("min-h-11 w-full rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg", STUDIO_FOCUS_RING)}>
                {(Object.keys(INTERP_LABELS) as FunctionCurveInterpolation[]).map((mode) => (
                  <option key={mode} value={mode}>{INTERP_LABELS[mode]}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-fg-2">
              <span>끝 프레임 목표값</span>
              <input type="number" aria-label="속도 곡선 목표값" value={curveEndValue}
                onChange={(e) => setCurveEndValue(Number(e.target.value) || 0)} className={cn(NUMBER_INPUT_CLASS, "w-full")} />
            </label>
          </div>

          <p className="rounded-lg border border-line/70 bg-canvas px-2.5 py-1.5 text-[0.7rem] tabular-nums text-fg-2">
            {`${CHANNEL_LABELS[selectedChannel]} 보간 결과: 시작 ${channelEvaluation.start.toFixed(2)} → 중간(${channelEvaluation.midFrame + 1}프레임) ${channelEvaluation.mid.toFixed(2)} → 끝(${channelEvaluation.endFrame + 1}프레임) ${channelEvaluation.end.toFixed(2)}`}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-pressed={showLocus} onClick={() => setShowLocus((prev) => !prev)} className={ACTION_BTN_CLASS}>
                {showLocus ? "카메라 이동 경로 표시 중" : "카메라 이동 경로 숨김"}
              </button>
              <label className="flex items-center gap-1 text-xs text-fg-2">
                시작 가로
                <input type="number" aria-label="카메라 시작 가로 좌표" value={camStartX}
                  onChange={(e) => setCamStartX(Number(e.target.value) || 0)} className={NUMBER_INPUT_CLASS} />
              </label>
              <label className="flex items-center gap-1 text-xs text-fg-2">
                끝 가로
                <input type="number" aria-label="카메라 끝 가로 좌표" value={camEndX}
                  onChange={(e) => setCamEndX(Number(e.target.value) || 0)} className={NUMBER_INPUT_CLASS} />
              </label>
            </div>
            <span className="text-[0.7rem] tabular-nums text-fg-3">경로 점 {locusPreview.polyline.length}개</span>
          </div>

          {showLocus ? (
            <svg viewBox="0 0 240 135" role="img" aria-label="카메라 이동 경로 미리보기"
              className="h-24 w-full rounded-lg border border-line bg-canvas text-accent">
              <polyline fill="none" stroke="currentColor" strokeWidth="2"
                points={locusPreview.polyline.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} />
              {locusPreview.frameTicks.map((tick) => (
                <line key={tick.frame} x1={tick.p1.x} y1={tick.p1.y} x2={tick.p2.x} y2={tick.p2.y}
                  stroke="currentColor" strokeWidth={tick.isKeyframe ? "2" : "1"} />
              ))}
            </svg>
          ) : null}
        </div>
      </details>

      <details className="rounded-xl border border-line bg-card/60 p-1.5">
        <summary className={SUMMARY_CLASS}>
          <span>움직이는 이미지 저장</span>
          <span className="text-[0.68rem] font-normal tabular-nums text-fg-3">
            {webpLoopCount === 0 ? "무한 반복" : `${webpLoopCount}회 반복`}
          </span>
        </summary>
        <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pt-1">
          <label className="flex items-center gap-1.5 text-xs text-fg-2">
            반복 횟수(0=무한)
            <input type="number" min={0} max={65535} aria-label="움직이는 이미지 반복 횟수" value={webpLoopCount}
              onChange={(e) => setWebpLoopCount(Math.max(0, Number(e.target.value) || 0))} className={NUMBER_INPUT_CLASS} />
          </label>
          <button type="button" disabled={busyExport} onClick={() => { void handleAnimatedWebpExport(); }} className={PRIMARY_BTN_CLASS}>
            {busyExport ? "이미지 묶는 중…" : "움직이는 이미지 파일 저장"}
          </button>
        </div>
      </details>

      <details className="rounded-xl border border-line bg-card/60 p-1.5">
        <summary className={SUMMARY_CLASS}>
          <span>동영상 프레임 불러오기</span>
          <span className="text-[0.68rem] font-normal tabular-nums text-fg-3">예정 {moviePlan.plannedCels.length}장</span>
        </summary>
        <div className="space-y-2.5 px-2 pb-2 pt-1">
          <label className="block space-y-1 text-xs text-fg-2">
            <span>원본 동영상 파일</span>
            <input type="file" accept="video/*" aria-label="동영상 파일 선택"
              onChange={(e) => setSelectedVideoFile(e.target.files?.[0] ?? null)}
              className={cn("block min-h-11 w-full rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs text-fg", STUDIO_FOCUS_RING)} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-fg-2">
              시작(초)
              <input type="number" min={0} step={0.5} aria-label="동영상 구간 시작 초" value={movieInSec}
                onChange={(e) => setMovieInSec(Math.max(0, Number(e.target.value) || 0))} className={NUMBER_INPUT_CLASS} />
            </label>
            <label className="flex items-center gap-1 text-xs text-fg-2">
              종료(초)
              <input type="number" min={0} step={0.5} aria-label="동영상 구간 종료 초" value={movieOutSec}
                onChange={(e) => {
                  const nextOut = Math.max(0, Number(e.target.value) || 0);
                  setMovieOutSec(nextOut);
                  if (nextOut > movieDurationSec) setMovieDurationSec(nextOut);
                }} className={NUMBER_INPUT_CLASS} />
            </label>
            <label className="flex items-center gap-1 text-xs text-fg-2">
              초당 프레임 수
              <input type="number" min={1} max={60} aria-label="불러오기 초당 프레임 수" value={movieTargetFps}
                onChange={(e) => setMovieTargetFps(Math.max(1, Math.min(60, Number(e.target.value) || 12)))} className={NUMBER_INPUT_CLASS} />
            </label>
          </div>
          {moviePlan.warnings.map((warning) => (
            <p key={warning} role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs text-fg">{warning}</p>
          ))}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs tabular-nums text-fg-3">
              변환 예정: {moviePlan.plannedCels.length}장 (원본 요청 {moviePlan.requestedFrameCount}장)
            </span>
            <button type="button"
              disabled={busyMovie || moviePlan.plannedCels.length === 0 || (!selectedVideoFile && !onRequestMovieImport)}
              onClick={() => { void handleMovieImport(); }} className={PRIMARY_BTN_CLASS}>
              {busyMovie ? "프레임 추출 중…" : "동영상 셀 불러오기 실행"}
            </button>
          </div>
        </div>
      </details>
    </aside>
  );
}
