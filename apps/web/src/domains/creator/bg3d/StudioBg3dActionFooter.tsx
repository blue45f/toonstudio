import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Save, X } from "lucide-react";

import { useT } from "@/shared/lib/i18n";
import "../studio-bg3d-panel-status-i18n";

import {
  STUDIO_BG3D_CONTROL_BUTTON as CONTROL_BUTTON,
  studioBg3dClassNames as cx,
} from "./studio-bg3d-editor-ui";

import type {
  StudioBg3dSharedStageMaterializationKind,
  StudioBg3dSharedStageMutationKind,
} from "./studio-bg3d-shared-stage-editor-session";
import type { StudioBg3dWebglContextState } from "./studio-bg3d-webgl-context-guard";

interface StudioBg3dActionFooterProps {
  readonly webglContextState?: StudioBg3dWebglContextState;
  readonly frozenCut?: boolean;
  readonly teamCut?: boolean;
  readonly sixPass?: boolean;
  readonly onChooseSixPass?: (enabled: boolean) => void;
  readonly sixPassUnavailableReason?: string | null;
  readonly outputFormatLocked?: boolean;
  readonly sceneRecoveryError: string | null;
  readonly hasCloneFailure: boolean;
  readonly isRestoringScene: boolean;
  readonly hasPendingClone: boolean;
  readonly hasPendingSharedCharacter: boolean;
  readonly hasFilledOutput: boolean;
  readonly onEnableFilledOutput: () => void;
  readonly sharedStageUpdateBlockedReason: string | null;
  readonly onOpenSharedStage: () => void;
  readonly error: string | null;
  readonly outputUnavailableReason?: string | null;
  readonly saveNotice: string | null;
  readonly isCapturing: boolean;
  readonly deletingModelInProgress: boolean;
  readonly saveDisabled: boolean;
  readonly onClose: () => void;
  readonly onSave: () => void;
  readonly insertDisabled: boolean;
  readonly onInsert: () => void;
  readonly operation: "insert" | "update";
  readonly mutationKind: StudioBg3dSharedStageMutationKind;
  readonly materializationKind: StudioBg3dSharedStageMaterializationKind;
  readonly captureElementCount: number;
  readonly toneOutputType: string;
  readonly simpleMode?: boolean;
}

export function StudioBg3dActionFooter({
  webglContextState = "active",
  frozenCut,
  teamCut,
  sixPass, onChooseSixPass, sixPassUnavailableReason, outputFormatLocked,
  sceneRecoveryError,
  hasCloneFailure,
  isRestoringScene,
  hasPendingClone,
  hasPendingSharedCharacter,
  hasFilledOutput,
  onEnableFilledOutput,
  sharedStageUpdateBlockedReason,
  onOpenSharedStage,
  error,
  outputUnavailableReason,
  saveNotice,
  isCapturing,
  deletingModelInProgress,
  saveDisabled,
  onClose,
  onSave,
  insertDisabled,
  onInsert,
  operation,
  mutationKind,
  materializationKind,
  captureElementCount,
  toneOutputType,
  simpleMode = false,
}: StudioBg3dActionFooterProps) {
  const t = useT();
  const fixedCutLabel = frozenCut && sixPass ? (operation === "update" ? "고정 컷 6패스 저장" : "고정 컷 6패스 추가") : teamCut ? "팀에 새 컷 레이어 저장" : frozenCut ? (operation === "update" ? "고정 컷 레이어 업데이트" : "고정 컷 레이어 추가") : null;
  const isPreparing = isCapturing || isRestoringScene || hasPendingClone || hasPendingSharedCharacter;

  return (
    <>
      {webglContextState !== "active" ? (
        <div
          role="status"
          aria-live="polite"
          data-studio-bg3d-webgl-recovery="true"
          className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-warn/45 bg-[oklch(0.82_0.15_80/0.08)] px-3 py-2 text-xs leading-relaxed break-keep text-fg sm:mx-5"
        >
          <Loader2 className="shrink-0 animate-spin motion-reduce:animate-none text-warn" size={14} strokeWidth={1.5} aria-hidden />
          <span>
            {webglContextState === "restoring"
              ? "3D 그래픽 컨텍스트를 복구하고 있습니다. 잠시만 기다려 주세요."
              : "백그라운드 전환으로 3D 화면이 잠시 중단되었습니다. 자동으로 다시 연결합니다."}
          </span>
        </div>
      ) : null}

      {sceneRecoveryError || hasCloneFailure ? (
        <div role="alert" className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-bad/45 bg-[oklch(0.66_0.20_25/0.10)] px-3 py-2 text-xs leading-relaxed break-keep text-fg sm:mx-5">
          <AlertTriangle className="mt-0.5 shrink-0 text-bad" size={14} strokeWidth={1.5} aria-hidden />
          <span>
            {sceneRecoveryError ?? t("studio.bg3dPanelStatus.actionFooter.renderInstanceFailed", "검증된 모델의 렌더 인스턴스를 만들지 못했습니다. 기존 PNG를 보존하기 위해 저장을 막았습니다.")}
          </span>
        </div>
      ) : null}

      {isRestoringScene || hasPendingClone || hasPendingSharedCharacter ? (
        <div aria-live="polite" className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs leading-relaxed break-keep text-fg-2 sm:mx-5">
          <Loader2 className="shrink-0 animate-spin motion-reduce:animate-none text-accent" size={14} strokeWidth={1.5} aria-hidden />
          {isRestoringScene ? "검증된 3D 장면 원본을 복원하는 중입니다." : "모델 렌더 인스턴스를 준비하는 중입니다."}
        </div>
      ) : null}

      {!hasFilledOutput && !isRestoringScene ? (
        <div
          role="status"
          className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/45 bg-[oklch(0.82_0.15_80/0.08)] px-3 py-2 text-xs leading-relaxed break-keep text-fg sm:mx-5"
        >
          <span className="flex min-w-0 flex-1 items-start gap-2">
            <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={14} strokeWidth={1.5} aria-hidden />
            <span>현재 설정은 재질색과 명암을 빼고 선화만 추가합니다.</span>
          </span>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-warn/55 bg-panel px-3 text-xs font-medium break-keep text-warn transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none sm:min-h-9"
            onClick={onEnableFilledOutput}
          >
            컬러 렌더 켜기
          </button>
        </div>
      ) : null}

      {sharedStageUpdateBlockedReason ? (
        <div
          role="alert"
          className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed break-keep text-warning sm:mx-5"
        >
          <AlertTriangle className="mt-0.5 shrink-0" size={14} strokeWidth={1.5} aria-hidden />
          <div className="min-w-0 flex-1">
            <p>{sharedStageUpdateBlockedReason}</p>
            <button
              type="button"
              className="mt-2 min-h-11 rounded-lg border border-warning/50 bg-panel px-3 text-xs font-medium break-keep text-warning transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none sm:min-h-9"
              onClick={onOpenSharedStage}
            >
              연결 설정 열기
            </button>
          </div>
        </div>
      ) : null}

      {saveNotice ? (
        <div role="status" className="mx-4 mb-2 flex items-start gap-2 whitespace-pre-line rounded-lg border border-good/40 bg-good-soft/20 px-3 py-2 text-xs leading-relaxed break-keep text-good sm:mx-5">
          <CheckCircle2 className="mt-0.5 shrink-0" size={14} strokeWidth={1.5} aria-hidden />
          <span>{saveNotice}</span>
        </div>
      ) : null}

      {error || outputUnavailableReason ? (
        <div role={error ? "alert" : "status"} className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs leading-relaxed break-keep text-fg-2 sm:mx-5">
          <AlertTriangle className="mt-0.5 shrink-0 text-accent" size={14} strokeWidth={1.5} aria-hidden />
          {error ?? outputUnavailableReason}
        </div>
      ) : null}

      {frozenCut && onChooseSixPass ? (
        <div className="mx-4 mb-2 text-xs sm:mx-5">
          <label className="flex min-h-11 items-center justify-between gap-3 font-medium break-keep">
            원고 출력 형식
            <select className="min-h-11 min-w-0 rounded-lg border border-line bg-card px-3 text-xs text-fg"
              value={sixPass ? "six-pass" : "color"} disabled={isPreparing || outputFormatLocked}
              onChange={event => onChooseSixPass(event.currentTarget.value === "six-pass")}>
              <option value="color">컬러 한 장</option>
              <option value="six-pass" disabled={!!sixPassUnavailableReason}>웹툰 6패스</option>
            </select>
          </label>
          {sixPassUnavailableReason && !sixPass && <p className="mt-1 leading-relaxed break-keep text-fg-2">{sixPassUnavailableReason}</p>}
        </div>
      ) : null}

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 min-[360px]:px-4 sm:px-5 sm:pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label={simpleMode ? "3D 장면 연출 닫기" : "3D 배경 편집기 닫기"}
            className={cx(
              CONTROL_BUTTON,
              "shrink-0 whitespace-nowrap border-line bg-card text-fg-2 hover:bg-raised hover:text-fg max-[359px]:size-11 max-[359px]:px-0",
            )}
            disabled={isCapturing}
            aria-disabled={deletingModelInProgress || undefined}
            onClick={onClose}
          >
            <X size={14} strokeWidth={1.5} className="hidden max-[359px]:block" aria-hidden />
            <span className="max-[359px]:sr-only">닫기</span>
          </button>
          <button
            type="button"
            aria-label={simpleMode ? "3D 장면 저장" : "3D 소재 저장"}
            className={cx(
              CONTROL_BUTTON,
              "shrink-0 whitespace-nowrap border-line bg-card text-fg-2 hover:bg-raised hover:text-fg max-[359px]:size-11 max-[359px]:px-0",
            )}
            disabled={saveDisabled}
            onClick={onSave}
          >
            <Save size={14} strokeWidth={1.5} className="min-[360px]:mr-1.5" aria-hidden />
            <span className="max-[359px]:sr-only">{simpleMode ? "장면 저장" : "소재 저장"}</span>
          </button>
        </div>
        <button
          type="button"
          className={cx(
            CONTROL_BUTTON,
            "min-w-0 shrink whitespace-nowrap tabular-nums border-accent/60 bg-accent text-on-accent hover:bg-accent/90 min-[360px]:min-w-36",
          )}
          aria-label={fixedCutLabel ?? undefined}
          disabled={insertDisabled}
          onClick={onInsert}
        >
          {isPreparing ? <Loader2 className="animate-spin motion-reduce:animate-none" size={14} strokeWidth={1.5} aria-hidden /> : <ImagePlus size={14} strokeWidth={1.5} aria-hidden />}
          <span className="max-[359px]:hidden">
            {fixedCutLabel ?? (mutationKind === "unlink"
              ? materializationKind === "detached-editable-composite"
                ? "3D 원본 유지 · 한 장으로 정리"
                : "연결 해제하고 배경 업데이트"
              : mutationKind === "relink"
                ? "원본 다시 연결하고 업데이트"
                : mutationKind === "connect"
                  ? `${captureElementCount}명과 연결해 ${operation === "update" ? "업데이트" : "추가"}`
                  : simpleMode
                    ? operation === "update" ? "작화에 다시 적용" : "작화에 적용"
                    : operation === "update"
                      ? "3D 배경 업데이트"
                      : !hasFilledOutput
                        ? "선화만 추가"
                        : toneOutputType === "color"
                          ? "컬러 배경 추가"
                          : "톤 배경 추가")}
          </span>
          <span className="hidden max-[359px]:inline">
            {fixedCutLabel ?? (mutationKind === "unlink"
              ? materializationKind === "detached-editable-composite"
                ? "한 장 정리"
                : "연결 해제"
              : mutationKind === "relink"
                ? "다시 연결"
                : mutationKind === "connect"
                  ? "연결해 적용"
                  : simpleMode
                    ? operation === "update" ? "다시 적용" : "적용"
                    : operation === "update" ? "업데이트" : "배경 추가")}
          </span>
        </button>
      </footer>
    </>
  );
}
