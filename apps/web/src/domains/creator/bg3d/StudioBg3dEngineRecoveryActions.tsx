import { STUDIO_BG3D_CONTROL_BUTTON, studioBg3dClassNames } from "./studio-bg3d-editor-ui";
import { STUDIO_BG3D_ENGINE_PREFERENCE_LABELS, STUDIO_BG3D_ENGINE_PREFERENCES } from "./studio-bg3d-engine-selection";

import type { StudioBg3dEnginePreference } from "./studio-bg3d-engine-selection";

/**
 * The blocked viewport offers the same explicit choices as the engine panel; never auto-switch.
 * When WebGPU is blocked, "WebGL2로 계속" is the recommended next step, so it comes first and
 * carries the primary style. The user still chooses; nothing launches on mount.
 */
export function StudioBg3dEngineRecoveryActions({
  preference,
  onPreferenceChange,
  onReopenLowQuality,
  onReturnTo2d,
  testIdPrefix = "studio-bg3d-recovery",
}: {
  readonly preference: StudioBg3dEnginePreference;
  readonly onPreferenceChange: (preference: StudioBg3dEnginePreference) => void;
  readonly onReopenLowQuality?: () => void;
  readonly onReturnTo2d?: () => void;
  readonly testIdPrefix?: string;
}) {
  const recommended: StudioBg3dEnginePreference | null = preference === "webgpu" ? "webgl2" : null;
  const ordered = recommended
    ? [recommended, ...STUDIO_BG3D_ENGINE_PREFERENCES.filter((engine) => engine !== recommended)]
    : [preference, ...STUDIO_BG3D_ENGINE_PREFERENCES.filter((engine) => engine !== preference)];
  const defaultPrefix = testIdPrefix === "studio-bg3d-recovery";
  return (
    <div role="group" aria-label="사용할 3D 엔진 직접 선택" className="mt-3 flex max-w-full flex-wrap justify-center gap-2">
      {ordered.map((engine) => {
        const isCurrent = engine === preference;
        const continueWithWebgl = engine === recommended;
        return (
          <button
            key={engine}
            type="button"
            data-testid={`${testIdPrefix}-${engine}`}
            data-studio-bg3d-recovery-recommended={continueWithWebgl ? "true" : undefined}
            className={studioBg3dClassNames(
              STUDIO_BG3D_CONTROL_BUTTON,
              "min-h-11 min-w-11 border-line px-4",
              continueWithWebgl
                ? "border-accent bg-accent font-semibold text-on-accent hover:bg-accent-2"
                : "bg-panel text-fg hover:border-accent/60 hover:bg-raised",
            )}
            onClick={() => onPreferenceChange(engine)}
          >
            {continueWithWebgl
              ? "WebGL2로 계속"
              : `${STUDIO_BG3D_ENGINE_PREFERENCE_LABELS[engine]}${isCurrent ? " 다시 시도" : " 선택"}`}
          </button>
        );
      })}
      {onReopenLowQuality ? (
        <button
          type="button"
          data-testid={defaultPrefix ? "bg3d-engine-reopen-low-quality" : `${testIdPrefix}-low-quality`}
          className={studioBg3dClassNames(
            STUDIO_BG3D_CONTROL_BUTTON,
            "min-h-11 min-w-11 border-line bg-panel px-4 text-fg hover:border-accent/60 hover:bg-raised",
          )}
          onClick={onReopenLowQuality}
        >
          품질 낮춰 다시 열기
        </button>
      ) : null}
      {onReturnTo2d ? (
        <button
          type="button"
          data-testid={defaultPrefix ? "bg3d-engine-return-2d" : `${testIdPrefix}-return-2d`}
          className={studioBg3dClassNames(
            STUDIO_BG3D_CONTROL_BUTTON,
            "min-h-11 min-w-11 border-line bg-panel px-4 text-fg hover:border-accent/60 hover:bg-raised",
          )}
          onClick={onReturnTo2d}
        >
          2D 원고로 복귀
        </button>
      ) : null}
    </div>
  );
}
