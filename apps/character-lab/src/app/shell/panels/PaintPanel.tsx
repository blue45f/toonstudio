/**
 * PaintPanel: 브러시/지우개 모드, SHAPER 다중 드로잉 서브레이어(Layer 0~5 · 숨김 · 순서 · 불투명도 · 비우기),
 * 좌우 대칭 그리기(U축 미러), 웹툰 디테일 스탬프(데칼), 브러시 크기·색·불투명도·경도·간격,
 * 레이어(부위) 선택, UV 랩, 페인트 undo·레이어 비우기·구버전 비표준 부위 보존 안내/비우기.
 * 브러시 상태는 paint/paint-session(React 밖 스토어)에 있고 뷰포트 드로잉 포인터가 같은 세션을 쓴다.
 */
import { useCallback, useId, useSyncExternalStore } from "react";

import { PAINTABLE_PART_ROLES, PART_ROLE_LABELS_KO, isPartRole } from "../../../contracts";
import { kitPaintWarningKo, kitPaintWarningsForLayers } from "../../../paint/paint-kit-warning";
import { isPaintPressureMode } from "../../../paint/paint-pressure";
import { getDefaultPaintSession } from "../../../paint/paint-session";
import { WEBTOON_DECAL_SPECS } from "../../../paint/webtoon-decals";
import { useDispatch, useEngineSession, useLabState } from "../lab-store-context";

import { PaintSublayerControls } from "./paint-sublayer-controls";

import type { PaintUndoToken, PartRole } from "../../../contracts";
import type { PaintSession, PaintSessionState } from "../../../paint/paint-session";
import type { PaintSublayerIndex, SublayerMoveDirection } from "../../../paint/paint-sublayers";
import type { WebtoonDecalId } from "../../../paint/webtoon-decals";

export interface PaintPanelProps {
  readonly session?: PaintSession;
}

export function usePaintSessionState(session: PaintSession): PaintSessionState {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}

interface SliderProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly onChange: (value: number) => void;
}

function Slider({ id, label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div className="cl-paint-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <output htmlFor={id}>{format(value)}</output>
    </div>
  );
}

export function PaintPanel({ session = getDefaultPaintSession() }: PaintPanelProps) {
  const state = usePaintSessionState(session);
  const labState = useLabState();
  const dispatch = useDispatch();
  const engineSession = useEngineSession();
  const ids = useId();
  const activeLayer = state.layers.get(state.activePart);
  const activeSublayerMetas = state.sublayers.get(state.activePart);
  const activeSublayerOrder = state.sublayerOrders.get(state.activePart);
  const paintGuard = session.canPaintActiveSublayer(state.activePart);
  const engineReady = labState.engine.phase === "ready";
  const sourceKind = labState.recipe.source.kind;
  const activeKitWarning = kitPaintWarningKo(sourceKind, state.activePart);
  const otherKitWarnings = kitPaintWarningsForLayers(sourceKind, [...state.layers.values()]).filter((warning) => warning.part !== state.activePart);
  const preservedLegacyLayers = [...state.layers.values()].filter(
    (layer) => !(PAINTABLE_PART_ROLES as readonly string[]).includes(layer.part) && layer.rgba.some((b) => b !== 0),
  );

  const onUndo = useCallback(() => {
    dispatch({ type: "history/undo" });
  }, [dispatch]);

  const onCommitUndoToken = useCallback(
    (undoToken: PaintUndoToken) => {
      dispatch({ type: "paint/stroke", undoToken });
    },
    [dispatch],
  );

  const onClearPreservedPart = useCallback(
    (part: PartRole) => {
      const token = session.clearLayer(part);
      if (!token) return;
      dispatch({ type: "paint/stroke", undoToken: token });
      engineSession.engine()?.updatePaintTexture(session.layer(part));
    },
    [dispatch, engineSession, session],
  );

  const onClear = useCallback(() => {
    const part = state.activePart;
    const token = session.clearLayer(part);
    if (!token) return;
    dispatch({ type: "paint/stroke", undoToken: token });
    engineSession.engine()?.updatePaintTexture(session.layer(part));
  }, [dispatch, engineSession, session, state.activePart]);

  const onClearSublayer = useCallback(
    (index: PaintSublayerIndex) => {
      const part = state.activePart;
      const token = session.clearSublayer(part, index);
      if (!token) return;
      dispatch({ type: "paint/stroke", undoToken: token });
      engineSession.engine()?.updatePaintTexture(session.layer(part));
    },
    [dispatch, engineSession, session, state.activePart],
  );

  const onToggleSublayerVisible = useCallback(
    (index: PaintSublayerIndex, nextVisible: boolean) => {
      const part = state.activePart;
      const token = session.setSublayerVisible(part, index, nextVisible);
      if (!token) return;
      dispatch({ type: "paint/stroke", undoToken: token });
      engineSession.engine()?.updatePaintTexture(session.layer(part));
    },
    [dispatch, engineSession, session, state.activePart],
  );

  const onChangeSublayerOpacity = useCallback(
    (index: PaintSublayerIndex, opacity: number): PaintUndoToken | null => {
      const part = state.activePart;
      const token = session.setSublayerOpacity(part, index, opacity);
      if (token) {
        engineSession.engine()?.updatePaintTexture(session.layer(part));
      }
      return token;
    },
    [engineSession, session, state.activePart],
  );

  const onMoveSublayer = useCallback(
    (index: PaintSublayerIndex, direction: SublayerMoveDirection) => {
      const part = state.activePart;
      const token = session.moveSublayer(part, index, direction);
      if (!token) return;
      dispatch({ type: "paint/stroke", undoToken: token });
      engineSession.engine()?.updatePaintTexture(session.layer(part));
    },
    [dispatch, engineSession, session, state.activePart],
  );

  const onStampDecal = useCallback(
    (decalId: WebtoonDecalId) => {
      const part = state.activePart;
      const token = session.stampDecal(decalId, { part, opacity: state.brush.opacity });
      if (!token) return;
      dispatch({ type: "paint/stroke", undoToken: token });
      engineSession.engine()?.updatePaintTexture(session.layer(part));
    },
    [dispatch, engineSession, session, state.activePart, state.brush.opacity],
  );

  return (
    <section className="cl-paint-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>페인트</h2>
      {!engineReady ? <p className="cl-paint-hint" role="status">엔진이 준비되지 않아 드로잉이 모델에 반영되지 않습니다(레이어에는 기록됩니다).</p> : null}
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-part`}>레이어(부위)</label>
        <select
          id={`${ids}-part`}
          value={state.activePart}
          onChange={(event) => {
            if (isPartRole(event.target.value)) session.setActivePart(event.target.value);
          }}
        >
          {PAINTABLE_PART_ROLES.map((part) => (
            <option key={part} value={part}>
              {PART_ROLE_LABELS_KO[part]}
            </option>
          ))}
        </select>
      </div>
      {activeKitWarning ? (
        <p className="cl-paint-hint cl-paint-kit-warning" role="note">
          {activeKitWarning}
        </p>
      ) : null}
      {otherKitWarnings.length > 0 ? (
        <ul className="cl-paint-hint cl-paint-kit-warnings" aria-label="어긋날 수 있는 레이어">
          {otherKitWarnings.map((warning) => (
            <li key={warning.part} data-part={warning.part}>
              이미 칠한 {PART_ROLE_LABELS_KO[warning.part]} 레이어: {warning.messageKo}
            </li>
          ))}
        </ul>
      ) : null}
      {preservedLegacyLayers.length > 0 ? (
        <ul className="cl-paint-hint" aria-label="구버전 보존 부위 레이어" data-testid="paint-preserved-legacy-layers">
          {preservedLegacyLayers.map((layer) => (
            <li key={layer.part} data-part={layer.part}>
              구버전 보존 레이어: {PART_ROLE_LABELS_KO[layer.part]} ({layer.width}×{layer.height}){" "}
              <button
                type="button"
                className="cl-button cl-button-small"
                data-testid={`paint-clear-legacy-${layer.part}`}
                onClick={() => onClearPreservedPart(layer.part)}
              >
                {`${PART_ROLE_LABELS_KO[layer.part]} 레이어 비우기`}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <PaintSublayerControls
        activePart={state.activePart}
        activeSublayer={state.activeSublayer}
        metas={activeSublayerMetas}
        order={activeSublayerOrder}
        paintGuard={paintGuard}
        onSelectSublayer={(index) => session.setActiveSublayer(index)}
        onToggleVisible={onToggleSublayerVisible}
        onChangeOpacity={onChangeSublayerOpacity}
        onCommitUndoToken={onCommitUndoToken}
        onMoveSublayer={onMoveSublayer}
        onClearSublayer={onClearSublayer}
      />
      <div className="cl-paint-row" role="group" aria-label="드로잉 도구 모드" data-testid="paint-tool-mode-group">
        <button
          type="button"
          className="cl-preset-chip"
          aria-pressed={state.toolMode === "brush"}
          data-testid="paint-tool-brush"
          onClick={() => session.setToolMode("brush")}
        >
          브러시 펜
        </button>
        <button
          type="button"
          className="cl-preset-chip"
          aria-pressed={state.toolMode === "eraser"}
          data-testid="paint-tool-eraser"
          onClick={() => session.setToolMode("eraser")}
        >
          지우개
        </button>
      </div>
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-symmetry`}>좌우 대칭 그리기 (U축 미러)</label>
        <input
          id={`${ids}-symmetry`}
          type="checkbox"
          checked={state.symmetry}
          onChange={(event) => session.setSymmetry(event.target.checked)}
        />
      </div>
      <div className="cl-paint-row" role="group" aria-label="빠른 브러시 프리셋" data-testid="paint-brush-presets">
        {(
          [
            { id: "fine-line", label: "세밀 선화 (4px)", radiusPx: 4, opacity: 1, hardness: 0.92 },
            { id: "soft-shade", label: "부드러운 음영 (36px)", radiusPx: 36, opacity: 0.45, hardness: 0.25 },
            { id: "base-fill", label: "넓은 밑색 (96px)", radiusPx: 96, opacity: 1, hardness: 0.85 },
          ] as const
        ).map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cl-preset-chip"
            aria-pressed={
              state.toolMode === "brush" &&
              state.brush.radiusPx === preset.radiusPx &&
              Math.abs(state.brush.opacity - preset.opacity) < 1e-4 &&
              Math.abs(state.brush.hardness - preset.hardness) < 1e-4
            }
            onClick={() => {
              session.setToolMode("brush");
              session.setBrush({ radiusPx: preset.radiusPx, opacity: preset.opacity, hardness: preset.hardness });
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="cl-paint-row" role="group" aria-label="웹툰 디테일 스탬프" data-testid="paint-webtoon-decals">
        {WEBTOON_DECAL_SPECS.map((spec) => (
          <button
            key={spec.id}
            type="button"
            className="cl-preset-chip"
            data-testid={`paint-decal-${spec.id}`}
            disabled={!paintGuard.ok}
            title={
              paintGuard.ok
                ? `${spec.labelKo} 디테일 스탬프를 현재 레이어(${PART_ROLE_LABELS_KO[state.activePart]} · L${state.activeSublayer})에 추가합니다`
                : paintGuard.reasonKo
            }
            onClick={() => onStampDecal(spec.id)}
          >
            {`스탬프: ${spec.labelKo}`}
          </button>
        ))}
      </div>
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-color`}>색</label>
        <input id={`${ids}-color`} type="color" value={state.brush.color} onChange={(event) => session.setBrush({ color: event.target.value })} />
      </div>
      <Slider id={`${ids}-radius`} label="크기(px)" value={state.brush.radiusPx} min={1} max={256} step={1} format={(v) => `${Math.round(v)} px`} onChange={(radiusPx) => session.setBrush({ radiusPx })} />
      <Slider id={`${ids}-opacity`} label="불투명도" value={state.brush.opacity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => session.setBrush({ opacity })} />
      <Slider id={`${ids}-hardness`} label="경도" value={state.brush.hardness} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(hardness) => session.setBrush({ hardness })} />
      <Slider id={`${ids}-spacing`} label="간격(반지름 비율)" value={state.brush.spacing} min={0.05} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(spacing) => session.setBrush({ spacing })} />
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-wrap`}>UV 경계 감싸기</label>
        <input id={`${ids}-wrap`} type="checkbox" checked={state.wrap} onChange={(event) => session.setWrap(event.target.checked)} />
      </div>
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-pressure-mode`}>3D 스트로크 필압 모드</label>
        <select
          id={`${ids}-pressure-mode`}
          value={state.pressureMode}
          onChange={(event) => {
            const val = event.target.value;
            if (isPaintPressureMode(val)) session.setPressureMode(val);
          }}
        >
          <option value="constant">고정 반지름 (기본)</option>
          <option value="fake">가상 필압 · 양끝 가늘게</option>
          <option value="pen">타블렛 펜 필압</option>
        </select>
      </div>
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-body-mask`}>의상 뒤 신체 페인트 차단</label>
        <input
          id={`${ids}-body-mask`}
          type="checkbox"
          checked={state.bodyLineMaskEnabled}
          onChange={(event) => session.setBodyLineMaskEnabled(event.target.checked)}
        />
      </div>
      <p className="cl-paint-hint" data-testid="shaper-paint-stroke-readout">
        도구 {state.toolMode === "eraser" ? "지우개" : "브러시"} · 서브레이어 L{state.activeSublayer} · 대칭 {state.symmetry ? "ON" : "OFF"} · 기준 반지름 {state.brush.radiusPx.toFixed(1)} px · 의상 마스킹 {state.bodyLineMaskEnabled ? "ON" : "OFF"}
      </p>
      <p className="cl-paint-hint">선화(L0)·볼터치(L1)·문양(L2)·음영(L3)을 서브레이어별로 분리해 그리면 눈썹·선화를 지우지 않고 볼터치나 문양만 켜고 끄거나 순서를 바꿀 수 있습니다.</p>
      <p className="cl-paint-status">
        {PART_ROLE_LABELS_KO[state.activePart]} 레이어 {activeLayer ? `${activeLayer.width}×${activeLayer.height} · 개정 ${activeLayer.revision}` : "(아직 없음)"}
        {state.strokeActive ? " · 스트로크 진행 중" : ""}
      </p>
      <div className="cl-paint-actions">
        <button type="button" onClick={onUndo} disabled={!labState.history.canUndo}>
          되돌리기
        </button>
        <button type="button" onClick={onClear} disabled={!activeLayer}>
          레이어 비우기
        </button>
      </div>
    </section>
  );
}
