import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LaneUnavailableError, SumiError } from "../../engine/core/errors";
import {
  clearCanvas,
  documentTileCount,
  fitDocumentSize,
  flattenOnWhite,
  MAX_DOCUMENT_TILES,
  presentLabImage,
  presentPreview,
} from "../../platform/canvas-present";
import { downloadPng } from "../../platform/download";
import { createLazyBrush } from "../../platform/lazy-brush";
import { createSpeedPressureSimulator } from "../../platform/pressure-sim";
import { useDrawSelector, useLab, useLabSelector } from "../shell/lab-context";
import { describeLaneError } from "../state/draw-error-text";
import {
  decideInitialLane,
  INITIAL_LANE_PRIORITY,
  lanePresentsLive,
  lazyRadiusPx,
  nearestRankPercentile,
  resolveDrawProgram,
} from "../state/draw-program";
import { DRAW_CANVAS_MODES } from "../state/draw-store";
import { findDescriptor } from "../state/lane-helpers";
import { LiveStrokeSession } from "../state/live-session";
import { codeOf, messageOf, probeLane } from "../state/run-compare";
import { DrawBrushPicker } from "../ui/DrawBrushPicker";
import { DrawCanvas } from "../ui/DrawCanvas";
import { DrawHud } from "../ui/DrawHud";
import { DrawLaneSelect } from "../ui/DrawLaneSelect";
import { DrawParamPanel } from "../ui/DrawParamPanel";

import type { RawSample } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type { FitDocumentResult, PreviewPoint } from "../../platform/canvas-present";
import type { DrawCanvasMode } from "../state/draw-store";
import type { LiveStrokeAbort, LiveStrokeResult } from "../state/live-session";
import type { DrawSurface } from "../ui/DrawCanvas";

/** 기본 문서 크기 고정 모드. `fit`은 별도 계산. */
const FIXED_DOCUMENT: Record<Exclude<DrawCanvasMode, "fit">, { width: number; height: number }> = {
  "1024x640": { width: 1024, height: 640 },
  "512": { width: 512, height: 512 },
  "1024": { width: 1024, height: 1024 },
};

/** 세션 기본 시드(획마다 시드에 획 순번이 더해진다). 같은 입력이면 같은 결과가 나오도록 고정한다. */
const DRAW_SEED = 1;

function isCanvasMode(value: string): value is DrawCanvasMode {
  return DRAW_CANVAS_MODES.some((m) => m.id === value);
}

function timestampForFile(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function viewportHeight(): number {
  return typeof window !== "undefined" && Number.isFinite(window.innerHeight) && window.innerHeight > 0 ? window.innerHeight : 800;
}

/**
 * "그리기" 탭: 브러시로 직접 그려 보는 **손맛 시험용 샌드박스**(PNG 스냅샷만 — undo·레이어·문서 저장·서버 연동 없음).
 * 큰 캔버스 + 접이식 설정 패널(엔진·브러시·파라미터). 문서는 선택한 레인 안에 있으므로 레인·크기를 바꾸거나 지우면 새 세션이 시작된다.
 * 레인 생명주기는 `LiveStrokeSession`(포인터 캡처 → rAF 프레임당 addSamples 1회 → 획 종료 시 readback)이 맡는다.
 * 레인 초기화 실패는 사유 코드로 드러내고 다른 레인으로 전환하지 않는다(ADR-0018).
 */
export function DrawView() {
  const { registry, env, store, actions, drawStore, drawActions, runner } = useLab();
  const laneId = useDrawSelector((s) => s.laneId);
  const laneChosen = useDrawSelector((s) => s.laneChosenByUser);
  const initialPicked = useDrawSelector((s) => s.initialLanePicked);
  const nonce = useDrawSelector((s) => s.nonce);
  const canvasMode = useDrawSelector((s) => s.canvasMode);
  const panelOpen = useDrawSelector((s) => s.panelOpen);
  const presetId = useDrawSelector((s) => s.presetId);
  const overrides = useDrawSelector((s) => s.overrides);
  const paperKind = useDrawSelector((s) => s.paperKind);
  const stabilizerMode = useDrawSelector((s) => s.stabilizerMode);
  const stabilizerPct = useDrawSelector((s) => s.stabilizerPct);
  const mouseSim = useDrawSelector((s) => s.mousePressureSim);
  const color = useDrawSelector((s) => s.color);
  const notices = useDrawSelector((s) => s.notices);
  const lastImage = useDrawSelector((s) => s.lastImage);
  const capability = useLabSelector((s) => s.capability);

  // ---- 문서 크기 ----
  const fitBoxRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<FitDocumentResult | null>(null);
  const measureFit = useCallback((): FitDocumentResult => {
    const box = fitBoxRef.current;
    const availW = box && box.clientWidth > 0 ? box.clientWidth : 800;
    const availH = Math.max(320, viewportHeight() - 300);
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    return fitDocumentSize(availW, availH, dpr);
  }, []);
  // 화면 맞춤은 선택하는 순간(또는 '다시 맞춤')의 영역으로 계산해 고정한다(창 크기를 바꿔도 그리던 문서가 사라지지 않게).
  const docSize = useMemo(() => {
    if (canvasMode === "fit") return fit?.document ?? FIXED_DOCUMENT["1024x640"];
    return FIXED_DOCUMENT[canvasMode];
  }, [canvasMode, fit]);
  const cssWidth = canvasMode === "fit" && fit ? fit.css.width : docSize.width;

  // ---- 프로그램 ----
  const resolved = useMemo(
    () => resolveDrawProgram({ presetId, overrides, paperKind, stabilizerMode, stabilizerPct }),
    [presetId, overrides, paperKind, stabilizerMode, stabilizerPct],
  );
  const programRef = useRef<BrushProgram | null>(resolved.program);
  if (resolved.program) programRef.current = resolved.program;
  const programErrorRef = useRef(resolved.error);
  programErrorRef.current = resolved.error;
  const sessionRef = useRef<LiveStrokeSession | null>(null);
  useEffect(() => {
    // 다음 획부터 새 프로그램을 쓴다(문서·레인은 그대로).
    if (resolved.program && sessionRef.current) sessionRef.current.setProgram(resolved.program);
  }, [resolved.program]);

  // ---- 입력 보정(마우스 압력 시뮬레이션 → 끈 당김) ----
  const pressureSim = useRef(createSpeedPressureSimulator());
  const lazy = useRef(createLazyBrush(0));
  const mouseSimRef = useRef(mouseSim);
  mouseSimRef.current = mouseSim;
  const lazyOnRef = useRef(false);
  lazyOnRef.current = stabilizerMode === "lazy-brush";
  lazy.current.setRadius(lazyRadiusPx(stabilizerPct));
  const colorRef = useRef(color);
  colorRef.current = color;
  const transform = useCallback((raw: RawSample[]): RawSample[] => {
    let out = raw;
    if (mouseSimRef.current) out = pressureSim.current.apply(out);
    if (lazyOnRef.current) out = lazy.current.apply(out);
    return out;
  }, []);

  // ---- 표면(캔버스 요소)과 세션 키 ----
  const [surface, setSurface] = useState<DrawSurface | null>(null);
  const sessionKey = `${laneId ?? "none"}|${docSize.width}x${docSize.height}|${nonce}`;

  // ---- 시작 레인: 능력 탐지로 한 번만 정한다(ADR-0018) ----
  const probing = useRef(new Set<string>());
  const noInitialNoticed = useRef(false);
  useEffect(() => {
    if (initialPicked || laneChosen) return;
    const decision = decideInitialLane(registry, capability);
    if (decision.kind === "picked") {
      drawActions.pickInitialLane(decision.laneId);
      return;
    }
    if (decision.kind === "none") {
      if (noInitialNoticed.current) return;
      noInitialNoticed.current = true;
      drawActions.pushNotice("no-initial-lane", "시작할 수 있는 레인이 없다(후보 모두 unavailable). 엔진 목록에서 사유를 보고 직접 고른다.");
      return;
    }
    // pending: 아직 probe하지 않은 첫 후보를 probe한다(앱의 autoProbe가 꺼져 있어도 진행되도록).
    for (const id of INITIAL_LANE_PRIORITY) {
      const desc = findDescriptor(registry, id);
      if (!desc || desc.status === "reserved") continue;
      if (capability[id] !== null) continue;
      if (probing.current.has(id)) return;
      probing.current.add(id);
      probeLane(desc, env)
        .then((report) => actions.setCapability(id, report))
        .catch((error: unknown) => drawActions.pushNotice(codeOf(error), `레인 probe 실패: ${messageOf(error)}`))
        .finally(() => probing.current.delete(id));
      return;
    }
  }, [initialPicked, laneChosen, registry, capability, env, actions, drawActions]);

  // ---- 세션 생명주기 ----
  const trailRef = useRef<PreviewPoint[]>([]);
  useEffect(() => {
    if (!surface || surface.key !== sessionKey || laneId === null) return undefined;
    const desc = findDescriptor(registry, laneId);
    if (!desc) {
      drawActions.pushNotice("lane-unknown", `레인 '${laneId}'이(가) 레지스트리에 없다`);
      drawActions.setSessionStatus("error");
      return undefined;
    }
    const live = lanePresentsLive(laneId);
    const { width, height } = docSize;
    let cancelled = false;
    let session: LiveStrokeSession | null = null;
    let detach: (() => void) | null = null;
    trailRef.current = [];
    pressureSim.current.reset();
    lazy.current.reset();
    drawActions.setSessionStatus("starting");
    drawActions.resetDocumentStats();
    drawActions.setDocumentSize({ width, height });

    const drawPreview = (predicted: PreviewPoint[]): void => {
      try {
        const canvas = surface.preview;
        // GPU 레인은 획 도중 결과를 직접 표시하므로 궤적 미리보기를 겹치지 않는다.
        if (live) {
          presentPreview(canvas, [], 1);
          return;
        }
        const program = programRef.current;
        presentPreview(canvas, [...trailRef.current, ...predicted], program ? program.tip.sizePx / 2 : 4);
      } catch (error) {
        drawActions.pushNotice(codeOf(error), `미리보기 표시 실패: ${messageOf(error)}`);
      }
    };

    const onStrokeEnd = (res: LiveStrokeResult): void => {
      trailRef.current = [];
      drawPreview([]);
      try {
        if (!live) presentLabImage(surface.present, res.image);
      } catch (error) {
        drawActions.pushNotice(codeOf(error), `캔버스 표시 실패: ${messageOf(error)}`);
      }
      const add = res.timings.addSamplesMs;
      drawActions.recordStroke(
        {
          addSamplesP50Ms: nearestRankPercentile(add, 50),
          addSamplesP95Ms: nearestRankPercentile(add, 95),
          endStrokeMs: res.timings.endStrokeMs,
          readbackMs: res.timings.readbackMs,
          dabCount: res.receipt.dabCount,
          overflowDabs: res.receipt.overflowDabs,
          frames: res.frames.length,
          receipt: res.receipt,
          timings: res.timings,
        },
        { width: res.image.width, height: res.image.height, data: res.image.data },
      );
      drawActions.commitColor(colorRef.current);
    };

    const onStrokeAbort = (abort: LiveStrokeAbort): void => {
      trailRef.current = [];
      drawPreview([]);
      const why = abort.cause === "pointercancel" ? "포인터 취소(pointercancel/캡처 상실)" : "레인 오류";
      if (abort.laneReplaced) {
        try {
          if (!live) clearCanvas(surface.present);
        } catch (error) {
          drawActions.pushNotice(codeOf(error), `캔버스 비우기 실패: ${messageOf(error)}`);
        }
        drawActions.resetDocumentStats();
        drawActions.pushNotice(
          "document-not-preserved",
          `${why}로 획을 버렸지만 레인이 문서를 보존하지 못해 캔버스를 비웠다${abort.receipt?.reasonKo ? `: ${abort.receipt.reasonKo}` : ""}`,
        );
      } else {
        drawActions.pushNotice(
          cancelCode(abort),
          `${why}로 진행 중이던 획을 버렸다(문서에 합성하지 않음, 버린 dab ${abort.receipt?.discardedDabs ?? 0}개). 그때까지 그린 그림은 그대로다.`,
        );
      }
    };

    const start = async (): Promise<void> => {
      const program = programRef.current;
      if (!program) {
        throw new SumiError("program-invalid", programErrorRef.current ?? "브러시 프로그램을 해석하지 못했다");
      }
      const report = store.get().capability[laneId] ?? (await probeLane(desc, env));
      actions.setCapability(laneId, report);
      if (report.status === "unavailable") {
        const code = report.reasons[0] ?? "not-implemented";
        throw new LaneUnavailableError(code, `레인 '${desc.label}'을(를) 쓸 수 없다(${report.reasons.join(", ") || "사유 없음"}). 다른 레인으로 자동 전환하지 않는다.`);
      }
      const created = await LiveStrokeSession.create({
        createLane: () => desc.create(),
        env,
        program,
        seed: DRAW_SEED,
        width,
        height,
        ...(live ? { presentCanvas: surface.present } : {}),
        wetCapacityTiles: Math.min(MAX_DOCUMENT_TILES, Math.max(2048, documentTileCount({ width, height }))),
        skipLinear: true,
        transformSamples: transform,
        onCanonical: (samples) => {
          if (live) return;
          for (const s of samples) {
            if (s.phase === "down") trailRef.current = [];
            trailRef.current.push({ x: s.x, y: s.y, pressure: s.pressure });
          }
        },
        onPreview: drawPreview,
        onStrokeEnd,
        onStrokeAbort,
        onError: (error) => drawActions.pushNotice(codeOf(error), describeLaneError(error)),
      });
      if (cancelled) {
        created.dispose();
        return;
      }
      session = created;
      sessionRef.current = created;
      // 사이에 바뀐 프로그램이 있으면 반영한다.
      const latest = programRef.current;
      if (latest) created.setProgram(latest);
      detach = created.attach(surface.stage, { blockContextMenu: true, primaryButtonOnly: true });
      drawActions.setSessionStatus("ready");
    };

    // StrictMode 개발 모드의 즉시 정리→재실행이 같은 캔버스에 레인 두 개를 동시에 붙이지 않도록 한 틱 미룬다.
    const timer = setTimeout(() => {
      start().catch((error: unknown) => {
        if (cancelled) return;
        drawActions.setSessionStatus("error");
        drawActions.pushNotice(codeOf(error), `레인 시작 실패: ${messageOf(error)}`);
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (detach) detach();
      if (session) session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
    // 세션은 표면(키)·레인·문서 크기가 바뀔 때만 다시 만든다. 프로그램·색·보정은 ref/setProgram으로 반영한다.
  }, [surface, sessionKey, laneId, docSize, registry, env, store, actions, drawActions, transform]);

  // ---- 동작 ----
  const onClear = (): void => {
    drawActions.clearDocument();
  };

  const onSavePng = (): void => {
    const image = drawStore.get().lastImage;
    if (!image) return;
    try {
      const flat = flattenOnWhite({ width: image.width, height: image.height, data: image.data });
      const name = `brush-draw-${presetId}-${laneId ?? "lane"}-${timestampForFile(new Date())}.png`;
      downloadPng(name, runner.labImageToPngBytes(flat));
    } catch (error) {
      drawActions.pushNotice("download-failed", `PNG 저장 실패: ${messageOf(error)}`);
    }
  };

  const onRefit = (): void => {
    setFit(measureFit());
    drawActions.clearDocument();
  };

  const desc = laneId ? findDescriptor(registry, laneId) : null;
  const surfaceLabel = `그리기 캔버스(${docSize.width}×${docSize.height}, ${desc ? desc.label : "레인 미정"}) — 마우스·펜·터치로 그린다`;

  return (
    <div className="lab-draw" data-testid="lab-draw-view">
      <div className="lab-draw-main">
        <div className="lab-draw-toolbar" role="toolbar" aria-label="그리기 도구">
          <button type="button" className="lab-button" data-testid="lab-draw-clear" onClick={onClear}>
            지우기
          </button>
          <button type="button" className="lab-button" data-testid="lab-draw-save" disabled={lastImage === null} onClick={onSavePng}>
            PNG 저장
          </button>
          <div className="lab-field lab-draw-size-field">
            <label htmlFor="lab-draw-canvas-size">
              <span>캔버스 크기</span>
            </label>
            <select
              id="lab-draw-canvas-size"
              value={canvasMode}
              onChange={(e) => {
                if (isCanvasMode(e.target.value)) {
                  // 화면 맞춤은 고르는 순간의 영역으로 계산해 고정한다.
                  if (e.target.value === "fit") setFit(measureFit());
                  drawActions.setCanvasMode(e.target.value);
                }
              }}
            >
              {DRAW_CANVAS_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {canvasMode === "fit" ? (
            <button type="button" className="lab-button" data-testid="lab-draw-refit" onClick={onRefit}>
              화면에 다시 맞춤
            </button>
          ) : null}
          <button
            type="button"
            className="lab-button"
            data-testid="lab-draw-panel-toggle"
            aria-expanded={panelOpen}
            aria-controls="lab-draw-side"
            onClick={() => drawActions.setPanelOpen(!panelOpen)}
          >
            {panelOpen ? "설정 패널 접기" : "설정 패널 펴기"}
          </button>
        </div>
        <div ref={fitBoxRef} className="lab-draw-fitbox">
          <DrawCanvas
            key={sessionKey}
            surfaceKey={sessionKey}
            width={docSize.width}
            height={docSize.height}
            cssWidth={cssWidth}
            label={surfaceLabel}
            onSurface={setSurface}
          />
        </div>
        <p className="lab-muted" data-testid="lab-draw-hint">
          {canvasMode === "fit" && fit
            ? `화면 맞춤: 문서 ${fit.document.width}×${fit.document.height} px(표시 ${fit.css.width}×${fit.css.height} CSS px${fit.reduced ? ", 한도 때문에 해상도를 줄였다" : ""}). `
            : ""}
          캔버스 크기·레인을 바꾸거나 지우면 새 문서로 시작한다. 저장은 PNG 스냅샷뿐이며 undo·레이어·문서 저장은 없다.
        </p>
        <DrawHud />
        {notices.length > 0 ? (
          <div className="lab-draw-notices" data-testid="lab-draw-notices">
            <ul role="alert" aria-label="그리기 알림">
              {notices.map((n) => (
                <li key={n.seq}>
                  <code>{n.code}</code> {n.message}
                </li>
              ))}
            </ul>
            <button type="button" className="lab-button" onClick={() => drawActions.clearNotices()}>
              알림 지우기
            </button>
          </div>
        ) : null}
      </div>
      {panelOpen ? (
        <aside id="lab-draw-side" className="lab-draw-side" aria-label="그리기 설정">
          <DrawLaneSelect />
          <DrawBrushPicker />
          <DrawParamPanel />
        </aside>
      ) : null}
    </div>
  );
}

function cancelCode(abort: LiveStrokeAbort): string {
  return abort.cause === "pointercancel" ? "stroke-canceled" : "stroke-aborted";
}
