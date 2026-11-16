import { ArrowLeft, Loader2, TriangleAlert } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioBg3dEngineRecoveryActions } from "./StudioBg3dEngineRecoveryActions";
import {
  STUDIO_BG3D_CONTROL_BUTTON,
  studioBg3dClassNames,
} from "./studio-bg3d-editor-ui";
import type { StudioBg3dEnginePreference } from "./studio-bg3d-engine-selection";
import type { StudioBg3dReadinessSnapshot } from "./studio-bg3d-readiness-state";
import type { StudioBg3dResourceRecoveryPorts } from "./studio-bg3d-resource-recovery-host";

export interface StudioBg3dAssistantReadinessHostLike {
  readonly readinessState?: StudioBg3dReadinessSnapshot;
  readonly engineRuntime?: {
    readonly preference: StudioBg3dEnginePreference;
    readonly setPreference: (preference: StudioBg3dEnginePreference) => void;
  };
  readonly resourceRecovery?: StudioBg3dResourceRecoveryPorts;
  readonly requestUserClose?: () => void;
}

export interface StudioBg3dAssistantReadinessBannerProps {
  readonly readiness: StudioBg3dReadinessSnapshot;
  readonly preference: StudioBg3dEnginePreference;
  readonly hasDraftScene: boolean;
  readonly onPreferenceChange?: (preference: StudioBg3dEnginePreference) => void;
  readonly onReopenLowQuality?: () => void;
  readonly onReturnTo2d?: () => void;
}

export function StudioBg3dAssistantReadinessBanner({
  readiness,
  preference,
  hasDraftScene,
  onPreferenceChange,
  onReopenLowQuality,
  onReturnTo2d,
}: StudioBg3dAssistantReadinessBannerProps) {
  const bt = useBilingual("StudioBg3dAssistantReadinessBanner");

  if (readiness.phase === "ready") return null;

  if (readiness.phase === "initializing") {
    return (
      <section
        role="status"
        aria-live="polite"
        data-testid="studio-bg3d-assistant-initializing"
        className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/35 bg-accent-soft/60 px-3 py-2.5 text-xs text-fg"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Loader2
            size={15}
            className="shrink-0 animate-spin text-accent motion-reduce:animate-none"
            aria-hidden
          />
          <div className="min-w-0">
            <strong className="block font-bold text-fg">
              {bt(readiness.badgeLabelKo, readiness.badgeLabelEn)}
            </strong>
            <span className="text-[0.7rem] text-fg-2 [word-break:keep-all]">
              {bt(
                "엔진 연결이 끝나면 장면 프리셋과 배치 도구가 바로 열립니다.",
                "Scene presets and placement controls unlock as soon as the engine connects.",
              )}
            </span>
          </div>
        </div>
        {onReturnTo2d ? (
          <button
            type="button"
            data-testid="studio-bg3d-assistant-init-return-2d"
            onClick={onReturnTo2d}
            className={studioBg3dClassNames(
              STUDIO_BG3D_CONTROL_BUTTON,
              "min-h-11 border-line bg-panel px-3 text-xs font-semibold text-fg hover:bg-raised",
            )}
          >
            <ArrowLeft size={14} aria-hidden />
            <span>{bt("2D 원고로 복귀", "Return to 2D")}</span>
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      role="alert"
      data-testid="studio-bg3d-assistant-error"
      className="mx-3 mt-3 rounded-xl border border-warn/45 bg-panel p-3 text-xs text-fg shadow-sm"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1">
          <strong className="block font-bold text-fg [word-break:keep-all]">
            {bt(readiness.badgeLabelKo, readiness.badgeLabelEn)}
          </strong>
          <p className="mt-1 leading-relaxed text-fg-2 [word-break:keep-all]">
            {bt(readiness.detailKo, readiness.detailEn)}
          </p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-fg-3 [word-break:keep-all]">
            {hasDraftScene
              ? bt(
                  "직접 선택한 엔진 설정과 작업 중인 3D 장면 초안은 그대로 보존됩니다.",
                  "Your explicit engine choice and current 3D scene draft remain preserved.",
                )
              : bt(
                  "직접 선택한 엔진 설정은 자동 변경되지 않으며, 사용할 엔진을 선택하면 프리셋이 바로 활성화됩니다.",
                  "Your explicit engine choice is preserved; select an available engine to unlock presets.",
                )}
          </p>
        </div>
      </div>
      {onPreferenceChange ? (
        <StudioBg3dEngineRecoveryActions
          preference={preference}
          onPreferenceChange={onPreferenceChange}
          onReopenLowQuality={onReopenLowQuality}
          onReturnTo2d={onReturnTo2d}
          testIdPrefix="studio-bg3d-assistant-recovery"
        />
      ) : null}
    </section>
  );
}

export function StudioBg3dAssistantHostReadinessBanner({
  host,
  hasDraftScene,
}: {
  readonly host: StudioBg3dAssistantReadinessHostLike;
  readonly hasDraftScene: boolean;
}) {
  if (!host.readinessState) return null;
  return (
    <StudioBg3dAssistantReadinessBanner
      readiness={host.readinessState}
      preference={host.engineRuntime?.preference ?? host.readinessState.selectedEngine}
      hasDraftScene={hasDraftScene}
      onPreferenceChange={host.engineRuntime?.setPreference}
      onReopenLowQuality={host.resourceRecovery?.reopenLowQuality}
      onReturnTo2d={host.resourceRecovery?.returnTo2d ?? host.requestUserClose}
    />
  );
}
