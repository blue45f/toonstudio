/**
 * PaintPanel: 브러시 크기·색·불투명도·경도·간격, 레이어(부위) 선택, UV 랩, 페인트 undo·레이어 비우기.
 * 브러시 상태는 paint/paint-session(React 밖 스토어)에 있고 뷰포트 드로잉 포인터가 같은 세션을 쓴다.
 * undo는 history/undo 명령으로 보내며 토큰 적용(session.applyToken → engine.updatePaintTexture)은 셸이 한다.
 * 레이어 비우기는 패널이 직접 비운 레이어를 `engine.updatePaintTexture`로 올린다(레이어 revision을 구독하는 곳이 없다).
 *
 * 키트 소스 경고(계약 문서 8.4절, `paint/paint-kit-warning`): 페인트 레이어는 역할 단위 하나인데 헤어·의상·신발·액세서리는 변형(프리셋)마다 UV가 달라
 * 변형을 바꾸면 그림이 어긋난다. 칠하는 것은 막지 않고, 선택한 부위의 경고와 이미 칠한 다른 부위(레시피를 불러온 직후 포함)의 경고를 보인다.
 */
import { useCallback, useId, useSyncExternalStore } from "react";

import { PAINTABLE_PART_ROLES, PART_ROLE_LABELS_KO, isPartRole } from "../../../contracts";
import { kitPaintWarningKo, kitPaintWarningsForLayers } from "../../../paint/paint-kit-warning";
import { getDefaultPaintSession } from "../../../paint/paint-session";
import { useDispatch, useEngineSession, useLabState } from "../lab-store-context";

import type { PaintSession, PaintSessionState } from "../../../paint/paint-session";

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
  const engineReady = labState.engine.phase === "ready";
  const sourceKind = labState.recipe.source.kind;
  const activeKitWarning = kitPaintWarningKo(sourceKind, state.activePart);
  // 이미 칠한 다른 부위 중 변형을 바꾸면 어긋날 수 있는 것(선택한 부위는 위 경고가 이미 말한다)
  const otherKitWarnings = kitPaintWarningsForLayers(sourceKind, [...state.layers.values()]).filter((warning) => warning.part !== state.activePart);

  const onUndo = useCallback(() => {
    dispatch({ type: "history/undo" });
  }, [dispatch]);

  const onClear = useCallback(() => {
    const part = state.activePart;
    const token = session.clearLayer(part);
    if (!token) return;
    dispatch({ type: "paint/stroke", undoToken: token });
    // 레이어 revision을 구독해 엔진에 올리는 곳이 없으므로 비운 레이어를 직접 올린다(스트로크·undo와 같은 `updatePaintTexture` 경로).
    // 올리지 않으면 뷰포트·PNG는 이전 칠을 보이고, 이후 undo가 엔진에 '비워지지 않은' 상태를 다시 올려 실제 상태를 알 수 없게 된다.
    engineSession.engine()?.updatePaintTexture(session.layer(part));
  }, [dispatch, engineSession, session, state.activePart]);

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
