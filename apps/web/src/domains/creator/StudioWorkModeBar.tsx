/**
 * 스튜디오 작업 모드 바 — 지금 단계의 도구만 앞에 두는 모드 전환 띠.
 *
 * - 모드 버튼: 전체/콘티/스케치·선화/채색/식자/효과·마감.
 * - 단계 제안 배너: 회차 단계 도출값이 현재 모드와 다르면 "바꿀까요?"만 묻고
 *   강제로 바꾸지 않는다 (resolveStudioWorkMode의 제안 규칙과 짝).
 * - 다음 단계 버튼: 파이프라인 순서의 다음 모드로 한 번에 이동.
 *
 * 문구는 studio-work-mode.ts의 메타(ko/en)를 쓴다. i18n 사전 키는
 * STUDIO_WORK_MODE_META.i18nKey로 이미 고정돼 있어 사전 등록 시 교체하면 된다.
 * 호스트 장착 지점은 HOST_INSERTION_SPEC.md.
 */
import {
  STUDIO_WORK_MODES,
  STUDIO_WORK_MODE_META,
  nextStudioWorkMode,
  type StudioWorkMode,
} from "./studio-work-mode";

export interface StudioWorkModeBarProps {
  readonly mode: StudioWorkMode;
  readonly onModeChange: (mode: StudioWorkMode) => void;
  /** 회차 단계에서 도출된 제안 모드. 현재 모드와 다를 때만 배너가 뜬다. */
  readonly suggestedMode?: StudioWorkMode | null;
  readonly onDismissSuggestion?: () => void;
  readonly lang?: "ko" | "en";
}

export function StudioWorkModeBar({
  mode,
  onModeChange,
  suggestedMode,
  onDismissSuggestion,
  lang = "ko",
}: StudioWorkModeBarProps) {
  const meta = STUDIO_WORK_MODE_META[mode];
  const next = nextStudioWorkMode(mode);
  const showSuggestion = suggestedMode != null && suggestedMode !== mode;
  const suggestionMeta = showSuggestion ? STUDIO_WORK_MODE_META[suggestedMode] : null;

  return (
    <div className="border-b border-line bg-panel/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={lang === "ko" ? "작업 모드" : "Work mode"} className="flex flex-wrap gap-1">
          {STUDIO_WORK_MODES.map((candidate) => {
            const candidateMeta = STUDIO_WORK_MODE_META[candidate];
            const selected = candidate === mode;
            return (
              <button
                key={candidate}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onModeChange(candidate)}
                className={
                  selected
                    ? "min-h-9 rounded-full bg-accent px-3 text-sm font-bold text-white"
                    : "min-h-9 rounded-full border border-line bg-panel px-3 text-sm text-fg-2 transition-colors hover:bg-panel-2"
                }
              >
                {lang === "ko" ? candidateMeta.labelKo : candidateMeta.labelEn}
              </button>
            );
          })}
        </div>
        {next && (
          <button
            type="button"
            onClick={() => onModeChange(next)}
            className="ml-auto min-h-9 rounded-full border border-accent/50 px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
          >
            {lang === "ko"
              ? `다음 단계: ${STUDIO_WORK_MODE_META[next].labelKo}`
              : `Next: ${STUDIO_WORK_MODE_META[next].labelEn}`}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-fg-3">
        {lang === "ko" ? meta.descriptionKo : meta.descriptionEn}
      </p>
      {showSuggestion && suggestionMeta && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2">
          <p className="text-sm text-fg">
            {lang === "ko"
              ? `지금 회차 단계는 ${suggestionMeta.labelKo}예요. ${suggestionMeta.labelKo} 모드로 바꿀까요?`
              : `This episode is at the ${suggestionMeta.labelEn} stage. Switch to ${suggestionMeta.labelEn} mode?`}
          </p>
          <button
            type="button"
            onClick={() => onModeChange(suggestedMode)}
            className="min-h-8 rounded-full bg-accent px-3 text-xs font-bold text-white"
          >
            {lang === "ko" ? "바꾸기" : "Switch"}
          </button>
          {onDismissSuggestion && (
            <button
              type="button"
              onClick={onDismissSuggestion}
              className="min-h-8 rounded-full px-3 text-xs text-fg-3"
            >
              {lang === "ko" ? "그대로 두기" : "Keep current"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
