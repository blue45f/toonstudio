import { panelStatusText } from "./studio-panel-status-i18n-r3c06";
import { useCallback, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { getStudioBg3dWebglRecoverySnapshot, STUDIO_BG3D_WEBGL_RECOVERY_EVENT } from "./bg3d/studio-bg3d-webgl-context-recovery";
import type { StudioBg3dWebglRecoveryPhase } from "./bg3d/studio-bg3d-webgl-context-recovery";

import {
  enableStudio3dHighAssetQuality,
  getStudio3dAssetQualityServerSnapshot,
  getStudio3dAssetQualitySnapshot,
  initializeStudio3dAssetQualitySession,
  resetStudio3dAssetQualityMode,
  subscribeStudio3dAssetQuality,
} from "./studio-3d-asset-quality-session";

interface Studio3dAssetQualityPanelProps {
  readonly active: boolean;
  readonly disabled: boolean;
  readonly emptyScene: boolean;
  readonly deviceLostMessage?: string | null;
  /** 실제 BG3D renderer의 canvas만 복구 이벤트의 소유자로 인정한다. */
  readonly ownerCanvas?: HTMLCanvasElement | null;
  readonly onBeforeEnable: () => Promise<boolean>;
}

const BUTTON = "min-h-11 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

export function Studio3dAssetQualityPanel({
  active, disabled, emptyScene, deviceLostMessage, ownerCanvas, onBeforeEnable,
}: Studio3dAssetQualityPanelProps) {
  const copy = useBilingual("scene3d-asset-quality-preservation");
  const headingId = useId();
  const { mode, notice } = useSyncExternalStore(
    subscribeStudio3dAssetQuality,
    getStudio3dAssetQualitySnapshot,
    getStudio3dAssetQualityServerSnapshot,
  );
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryPhase, setRecoveryPhase] = useState<StudioBg3dWebglRecoveryPhase | null>(null);
  const generation = useRef(0);
  const recoveryUnavailable = recoveryPhase === "lost" || recoveryPhase === "degraded" || recoveryPhase === "failed";
  const gpuUnavailable = Boolean(deviceLostMessage) || recoveryUnavailable;

  const cancelPending = useCallback(() => {
    generation.current += 1;
    setSaving(false);
    setConfirming(false);
    setAcknowledged(false);
  }, []);

  // commit 직후 늦은 Promise가 완료되어도 닫힌 패널·이전 renderer의 설정을 확정하지 않는다.
  useLayoutEffect(() => {
    cancelPending();
    setRecoveryPhase(null);
    setError(null);
    // 초기 page의 legacy auto만 초기화하며, 같은 page의 remount는 선택한 high를 보존한다.
    if (active) initializeStudio3dAssetQualitySession();
    return () => { generation.current += 1; };
  }, [active, ownerCanvas, cancelPending]);

  useLayoutEffect(() => {
    if (!active || !ownerCanvas) return;
    const canvas = ownerCanvas;
    function applyPhase(phase: StudioBg3dWebglRecoveryPhase): void {
      setRecoveryPhase(phase);
      if (phase === "lost" || phase === "failed" || phase === "degraded") {
        cancelPending();
        setError(null);
      }
    }
    function onRecovery(event: Event): void {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (typeof detail !== "object" || detail === null || !("owner" in detail)
        || detail.owner !== canvas || !("snapshot" in detail)) return;
      // 과거 controller의 알림·dispose가 새 owner의 현재 상태를 덮지 못하게 권위에서 다시 읽는다.
      const current = getStudioBg3dWebglRecoverySnapshot(canvas);
      if (current) applyPhase(current.phase);
      else if (detail.snapshot === null) applyPhase("lost");
    }
    window.addEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, onRecovery);
    const current = getStudioBg3dWebglRecoverySnapshot(canvas);
    if (current) applyPhase(current.phase);
    return () => window.removeEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, onRecovery);
  }, [active, ownerCanvas, cancelPending]);

  useLayoutEffect(() => {
    if (!active || !deviceLostMessage) return;
    cancelPending();
    setError(null);
  }, [active, deviceLostMessage, cancelPending]);

  async function enableAfterCheckpoint(): Promise<void> {
    if (!active || disabled || saving || !acknowledged || gpuUnavailable) return;
    const token = ++generation.current;
    const selection = getStudio3dAssetQualitySnapshot();
    setSaving(true);
    setError(null);
    try {
      const saved = emptyScene || await onBeforeEnable();
      if (generation.current !== token || getStudio3dAssetQualitySnapshot() !== selection) return;
      if (!saved) {
        setError(panelStatusText("studio.panelStatus.assetQuality3d.checkpointIncomplete", "장면 사본 저장을 완료하지 못해 자동 모드를 유지했습니다. 저장 공간과 장면 상태를 확인해 주세요."));
        return;
      }
      enableStudio3dHighAssetQuality();
      setConfirming(false);
      setAcknowledged(false);
    } catch {
      if (generation.current === token) {
        setError(panelStatusText("studio.panelStatus.assetQuality3d.checkpointSaveFailed", "장면 사본을 저장하지 못했습니다. 고품질 설정은 적용하지 않았습니다."));
      }
    } finally {
      if (generation.current === token) setSaving(false);
    }
  }

  return (
    <section aria-labelledby={headingId} className="mb-4 space-y-2 rounded-xl border border-line bg-raised/60 p-3" data-studio-3d-asset-quality={mode}>
      <h3 id={headingId} className="text-sm font-bold text-fg">3D 모델 메모리 모드</h3>
      <p className="text-xs leading-relaxed text-fg-3">
        기본은 자동 모드입니다. 고품질은 모바일 모델별 텍스처 예상 용량을 128MiB에서 최대 256MiB로 완화합니다.
        더 엄격한 문서 한도와 파일·메시·형식 검사는 유지하며, 화면 해상도·그림자나 기기의 실제 메모리 한도는 바꾸지 않습니다.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="3D 모델 메모리 모드 선택">
        <button type="button" className={BUTTON} aria-pressed={mode === "auto"} disabled={saving} onClick={() => {
          resetStudio3dAssetQualityMode(panelStatusText("studio.panelStatus.assetQuality3d.backToAuto", "자동 모드로 돌아왔습니다. 다음 모델 불러오기부터 안전 한도를 적용합니다."));
          setConfirming(false); setAcknowledged(false); setError(null);
        }}>자동 · 기본</button>
        <button type="button" className={BUTTON} aria-pressed={mode === "high"} disabled={!active || disabled || saving || gpuUnavailable || mode === "high"} onClick={() => {
          setConfirming(true); setAcknowledged(false); setError(null);
        }}>고품질 · 현재 실행만</button>
      </div>
      {confirming && mode === "auto" && <div className="space-y-2 rounded-lg border border-line bg-card p-3">
        <p className="text-xs leading-relaxed text-fg-2">
          고품질 원본은 느려짐·발열·페이지 재로딩을 유발할 수 있습니다.
          {emptyScene ? panelStatusText("studio.panelStatus.assetQuality3d.emptySceneSkip", " 현재 배경 장면이 비어 있어 사본 저장은 생략합니다.") : " 전환 전에 현재 배경 장면을 이 기기의 템플릿 라이브러리에 사본으로 저장합니다."}
          이는 전체 작품의 백업을 대신하지 않습니다.
        </p>
        <label className="flex min-h-11 items-start gap-2 text-xs leading-relaxed text-fg-2">
          <input type="checkbox" className="mt-1" checked={acknowledged} disabled={saving} onChange={event => setAcknowledged(event.target.checked)} />
          <span>기기 메모리 부족으로 페이지가 종료될 수 있으며, 새로고침 후 자동 모드로 시작한다는 점을 확인했습니다.</span>
        </label>
        <button type="button" className={`${BUTTON} w-full`} disabled={!acknowledged || disabled || saving || !active || gpuUnavailable} onClick={() => { void enableAfterCheckpoint(); }}>
          {saving ? panelStatusText("studio.panelStatus.assetQuality3d.savingCheckpoint", "장면 사본 저장 중") : emptyScene ? "확인 후 고품질 사용" : "장면 사본 저장 후 고품질 사용"}
        </button>
      </div>}
      {error && <p role="alert" className="text-xs leading-relaxed text-fg-2">{error}</p>}
      {active && gpuUnavailable && <p role="alert" className="text-xs leading-relaxed text-fg-2">
        {deviceLostMessage ?? copy("GPU 연결이 끊겨 화면 복구를 기다리고 있습니다.", "The GPU connection was lost. Waiting for viewport recovery.")}
        {" "}{copy("선택한 메모리 모드는 유지하며, 화면 복구 전에는 고품질 허용을 새로 켜지 않습니다.", "The selected memory mode is preserved. High-quality admission cannot be newly enabled before viewport recovery.")}
      </p>}
      {notice && <p role="status" className="text-xs leading-relaxed text-fg-2">{notice}</p>}
      <p className="text-[0.65rem] leading-relaxed text-fg-3">
        새로 불러오는 배경 3D 모델부터 적용합니다. 이미 배치한 원본을 자동 삭제·교체하지 않으며, 자동 모드 전환만으로 현재 메모리가 즉시 줄어들지는 않습니다.
        CC0 라이브러리에서 원본 또는 텍스처 메모리 절약본을 선택해 가져오세요.
      </p>
    </section>
  );
}
