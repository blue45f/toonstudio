/**
 * 상단 바: 엔진 명시 선택 [WebGPU] [WebGL2](자동 선택·자동 전환 없음, ADR-0018), 활성 backend·어댑터 배지,
 * Undo/Redo(Ctrl/Cmd+Z, Shift로 Redo), PBR↔툰 스위치, 품질 프리셋.
 * 엔진 생성에 쓸 캔버스는 viewport-registry에서 `claim()`으로 꺼낸다(백엔드를 바꿔 다시 고르면 새 캔버스, 없으면 fail-visible 실패 이벤트).
 */
import { useEffect, useState } from "react";

import { ENGINE_BACKENDS, ENGINE_BACKEND_LABELS_KO, QUALITY_PRESETS, QUALITY_PRESET_LABELS_KO, applyQualityPreset, failVisible } from "../../contracts";
import { stableStringify } from "../../shared/stable-json";

import { describeEngineStatus } from "./engine-status-text";
import { useDispatch, useEngineSession, useLabState, useLabStore, useUiActions, useViewportRegistry } from "./lab-store-context";
import { INSPECTOR_TAB_IDS } from "./ui-state";

import type { EngineBackend, QualityPresetId, ShadingMode, ShadingProfile } from "../../contracts";

const QUALITY_PRESET_IDS: readonly QualityPresetId[] = ["preview", "standard", "hero"];

export interface QuickStylePreset {
  readonly id: string;
  readonly label: string;
  readonly mode: ShadingMode;
  readonly quality: QualityPresetId;
}

export const QUICK_STYLE_PRESETS: readonly QuickStylePreset[] = [
  { id: "toon-standard", label: "툰 스탠다드", mode: "toon", quality: "standard" },
  { id: "pbr-studio", label: "PBR 스튜디오", mode: "pbr", quality: "standard" },
  { id: "hero-quality", label: "고품질 히어로", mode: "toon", quality: "hero" },
];

/** 현재 셰이딩이 어느 품질 프리셋과 같은지(mode·toon 옵션은 비교에서 제외). 어느 것과도 다르면 null. */
export function detectQualityPreset(profile: ShadingProfile): QualityPresetId | null {
  const key = stableStringify({ shadows: profile.shadows, postfx: profile.postfx, ibl: profile.ibl });
  for (const id of QUALITY_PRESET_IDS) {
    const preset = QUALITY_PRESETS[id];
    if (stableStringify({ shadows: preset.shadows, postfx: preset.postfx, ibl: preset.ibl }) === key) return id;
  }
  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

export function TopBar() {
  const state = useLabState();
  const store = useLabStore();
  const dispatch = useDispatch();
  const engineSession = useEngineSession();
  const viewport = useViewportRegistry();
  const { setInspectorTab } = useUiActions();
  const [helpOpen, setHelpOpen] = useState(false);

  const engineText = describeEngineStatus(state.engine);
  const initializing = state.engine.phase === "initializing";
  const activeBackend = state.engine.phase === "ready" ? state.engine.backend : null;
  const shading = state.recipe.shading;
  const quality = detectQualityPreset(shading);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        const history = store.getState().history;
        const redo = event.shiftKey;
        if (redo ? !history.canRedo : !history.canUndo) return;
        event.preventDefault();
        dispatch({ type: redo ? "history/redo" : "history/undo" });
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen((prev) => !prev);
        return;
      }
      if (event.key === "Escape") {
        setHelpOpen(false);
        return;
      }
      if (event.key >= "1" && event.key <= "9") {
        const tab = INSPECTOR_TAB_IDS[Number(event.key) - 1];
        if (tab) {
          event.preventDefault();
          setInspectorTab(tab);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, store, setInspectorTab]);

  const selectBackend = (backend: EngineBackend): void => {
    // 컨텍스트(webgpu|webgl2)는 캔버스에 잠기므로 엔진 생성마다 아직 쓰지 않은 캔버스를 받는다.
    const canvas = viewport.claim();
    if (!canvas) {
      store.applyEvent({
        type: "failure",
        failure: failVisible("viewport-canvas-missing", "뷰포트 캔버스를 찾을 수 없어 엔진을 만들 수 없습니다. 뷰포트가 마운트된 뒤 다시 선택하세요."),
      });
      return;
    }
    void engineSession.select(backend, canvas);
  };

  const applyQuickStyle = (preset: QuickStylePreset): void => {
    dispatch({
      type: "shading/set",
      profile: {
        ...applyQualityPreset(shading, preset.quality),
        mode: preset.mode,
      },
    });
  };

  return (
    <header className="cl-topbar">
      <div className="cl-topbar-brand">
        <p className="cl-eyebrow">실험 앱 · 배포 대상 아님</p>
        <h1 className="cl-title">ToonStudio Character Lab</h1>
      </div>
      <div className="cl-topbar-group" role="group" aria-label="엔진 선택">
        {ENGINE_BACKENDS.map((backend) => (
          <button
            key={backend}
            type="button"
            className="cl-button"
            aria-pressed={activeBackend === backend}
            disabled={initializing}
            onClick={() => selectBackend(backend)}
          >
            {ENGINE_BACKEND_LABELS_KO[backend]}
          </button>
        ))}
        <span className="cl-engine-badge" data-tone={engineText.tone} role="status">
          {engineText.text}
        </span>
      </div>
      <div className="cl-topbar-group" role="group" aria-label="히스토리">
        <button type="button" className="cl-button" disabled={!state.history.canUndo} onClick={() => dispatch({ type: "history/undo" })}>
          실행 취소
        </button>
        <button type="button" className="cl-button" disabled={!state.history.canRedo} onClick={() => dispatch({ type: "history/redo" })}>
          다시 실행
        </button>
        <span className="cl-muted">깊이 {state.history.depth} · rev {state.history.revision}</span>
      </div>
      <div className="cl-topbar-group" role="group" aria-label="셰이딩">
        <button
          type="button"
          className="cl-button"
          aria-pressed={shading.mode === "toon"}
          onClick={() => dispatch({ type: "shading/set", profile: { mode: shading.mode === "toon" ? "pbr" : "toon" } })}
        >
          {shading.mode === "toon" ? "툰 셰이딩" : "PBR 셰이딩"}
        </button>
        <label className="cl-select-label">
          품질
          <select
            className="cl-select"
            value={quality ?? "custom"}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "preview" || next === "standard" || next === "hero") {
                dispatch({ type: "shading/set", profile: applyQualityPreset(shading, next) });
              }
            }}
          >
            {QUALITY_PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {QUALITY_PRESET_LABELS_KO[id]}
              </option>
            ))}
            <option value="custom" disabled>
              사용자 지정
            </option>
          </select>
        </label>
      </div>
      <div className="cl-topbar-group" role="group" aria-label="빠른 스타일 프리셋">
        {QUICK_STYLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cl-button cl-button-small"
            aria-pressed={shading.mode === preset.mode && quality === preset.quality}
            onClick={() => applyQuickStyle(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="cl-topbar-group">
        <button
          type="button"
          className="cl-button cl-button-small"
          data-testid="topbar-help-toggle"
          aria-expanded={helpOpen}
          aria-controls="cl-shortcut-guide"
          onClick={() => setHelpOpen((prev) => !prev)}
        >
          ? 단축키·가이드
        </button>
      </div>
      {helpOpen ? (
        <div
          id="cl-shortcut-guide"
          className="cl-help-panel"
          data-testid="topbar-help-panel"
          role="region"
          aria-label="단축키 및 워크플로 가이드"
        >
          <div className="cl-help-panel-header">
            <strong>단축키 &amp; 워크플로 안내</strong>
            <button type="button" className="cl-button cl-button-small" onClick={() => setHelpOpen(false)}>
              닫기
            </button>
          </div>
          <dl className="cl-help-shortcuts">
            <div>
              <dt><kbd>Ctrl/Cmd + Z</kbd> (<kbd>Shift + Z</kbd>)</dt>
              <dd>실행 취소 / 다시 실행 (되돌리기)</dd>
            </div>
            <div>
              <dt><kbd>1</kbd> ~ <kbd>9</kbd></dt>
              <dd>우측 탭 전환 (파라미터·표정·포즈·물리·렌더·페인트·비전·제작 패키지·내보내기)</dd>
            </div>
            <div>
              <dt><kbd>F</kbd> / <kbd>B</kbd> / <kbd>C</kbd></dt>
              <dd>전신 / 상반신 / 얼굴 카메라 프레이밍</dd>
            </div>
            <div>
              <dt><kbd>?</kbd> / <kbd>Esc</kbd></dt>
              <dd>도움말 패널 열기·닫기 / 관절 드래그 취소</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </header>
  );
}

