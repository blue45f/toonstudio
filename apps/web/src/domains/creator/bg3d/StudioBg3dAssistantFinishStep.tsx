import { Check, Save, SunMedium } from "lucide-react";
import { useId, type Ref } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  matchStudioBg3dCaptureAspectPreset,
  STUDIO_BG3D_CAPTURE_ASPECT_CUSTOM_PRESET_ID,
  STUDIO_BG3D_CAPTURE_ASPECT_PRESETS,
} from "./studio-bg3d-capture-frame-geometry";
import {
  STUDIO_BG3D_ASSISTANT_OUTPUT_STYLES,
  type StudioBg3dAssistantOutputStyle,
} from "./studio-bg3d-scene-assistant";

const SIMPLE_CAPTURE_ASPECT_PRESETS = STUDIO_BG3D_CAPTURE_ASPECT_PRESETS.filter(
  (preset) => preset.ratio === null || ["16-9", "4-3", "1-1", "9-16"].includes(preset.id),
);

interface StudioBg3dAssistantFinishStepProps {
  readonly outputStyle: StudioBg3dAssistantOutputStyle;
  readonly busy: boolean;
  readonly hasScene: boolean;
  readonly onOutputStyle: (style: StudioBg3dAssistantOutputStyle) => void;
  readonly aspectRatio: number | null;
  readonly aspectRatioDisabled: boolean;
  readonly aspectSelectRef: Ref<HTMLSelectElement>;
  readonly onAspectRatio: ((aspectRatio: number | null) => void) | undefined;
  readonly onViewCrop: (() => void) | undefined;
  readonly saveDisabled: boolean;
  readonly onSaveToLibrary: () => void;
}

export function StudioBg3dAssistantFinishStep({
  outputStyle,
  busy,
  hasScene,
  onOutputStyle,
  aspectRatio,
  aspectRatioDisabled,
  aspectSelectRef,
  onAspectRatio,
  onViewCrop,
  saveDisabled,
  onSaveToLibrary,
}: StudioBg3dAssistantFinishStepProps) {
  const bt = useBilingual("StudioBg3dAssistantFinishStep");
  const aspectId = useId();
  const aspectHintId = `${aspectId}-hint`;
  const aspectPresetId = matchStudioBg3dCaptureAspectPreset(aspectRatio);
  const retainedAspectRatio = aspectRatio !== null
    && !SIMPLE_CAPTURE_ASPECT_PRESETS.some((preset) => preset.id === aspectPresetId)
    ? (aspectPresetId === STUDIO_BG3D_CAPTURE_ASPECT_CUSTOM_PRESET_ID
      ? `${aspectRatio.toFixed(2)}:1`
      : aspectPresetId.replace("-", ":"))
    : null;

  return (
    <div className="scene-assistant__step-body" data-step="finish">
      <section className="scene-assistant__finish-hero">
        <div className="scene-assistant__finish-art" aria-hidden>
          <span className="color" /><span className="line" /><span className="tone" />
        </div>
        <div>
          <p><SunMedium size={13} aria-hidden /> 웹툰 적용 준비</p>
          <h3>어떤 모습으로 넣을까요?</h3>
          <span>적용 후에도 연결된 장면을 다시 열어 구도와 스타일을 바꿀 수 있습니다.</span>
        </div>
      </section>

      <section aria-labelledby="scene-assistant-output-title">
        <div className="scene-assistant__section-title compact">
          <h4 id="scene-assistant-output-title">작화 스타일</h4>
          <span>추천: 컬러 배경</span>
        </div>
        <div className="scene-assistant__output-grid">
          {STUDIO_BG3D_ASSISTANT_OUTPUT_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              aria-pressed={outputStyle === style.id}
              disabled={busy}
              onClick={() => onOutputStyle(style.id)}
            >
              <span className={`scene-assistant__output-preview is-${style.id}`} aria-hidden>
                <span /><span /><span />
              </span>
              <span><strong>{style.label}</strong><small>{style.description}</small></span>
              {outputStyle === style.id ? <Check size={15} aria-hidden /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="scene-assistant__apply-benefits">
        <div className="justify-between">
          <label htmlFor={aspectId} className="font-semibold text-fg">
            {bt("삽입 비율", "Insert aspect ratio")}
          </label>
          <select
            ref={aspectSelectRef}
            id={aspectId}
            aria-describedby={aspectHintId}
            className="min-h-11 max-w-full min-w-0 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            value={aspectPresetId}
            disabled={aspectRatioDisabled || !onAspectRatio}
            onChange={(event) => {
              if (aspectRatioDisabled || !onAspectRatio) return;
              const preset = SIMPLE_CAPTURE_ASPECT_PRESETS.find((option) => option.id === event.target.value);
              if (preset) onAspectRatio(preset.ratio);
            }}
          >
            {retainedAspectRatio ? (
              <option value={aspectPresetId}>{retainedAspectRatio}</option>
            ) : null}
            {SIMPLE_CAPTURE_ASPECT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.ratio === null ? bt("화면 맞춤", "Fit to view") : preset.id.replace("-", ":")}
              </option>
            ))}
          </select>
        </div>
        <p id={aspectHintId} className="text-xs leading-relaxed text-fg-3" aria-live="polite">
          {aspectRatio === null
            ? bt("3D 화면 전체를 사용해 화면 크기에 따라 삽입 비율이 달라집니다.", "Uses the full 3D view, so the insert ratio follows the view size.")
            : bt("3D 화면의 점선 테두리 안쪽을 삽입합니다.", "Inserts the area inside the dashed frame in the 3D view.")}
        </p>
        <button type="button" className="scene-assistant__crop-preview-action"
          disabled={busy || !hasScene || !onViewCrop} onClick={onViewCrop}>
          {bt("컷 범위 보기", "View crop")}
        </button>
        <div><Check size={14} aria-hidden /><span>원본 3D 장면을 함께 보존</span></div>
        <div><Check size={14} aria-hidden /><span>캔버스에서 다시 편집 가능</span></div>
      </section>

      <button type="button" className="scene-assistant__save" disabled={busy || !hasScene || saveDisabled} onClick={onSaveToLibrary}>
        <Save size={16} aria-hidden /><span><strong>장면을 소재로도 저장</strong><small>다른 컷과 다음 화에서 다시 사용합니다.</small></span>
      </button>
    </div>
  );
}
