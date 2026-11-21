/**
 * Plotr 1문장 아이디어 → 4컷 비주얼 웹툰 즉시 생성 바.
 *
 * - 외부 API 호출 없이 한 문장 입력 또는 빠른 예시 칩 4종 원탭으로
 *   4컷 드라마틱 웹툰 대본·인물/배경/소품 일관성 에셋·구도·조명·말풍선을 즉시 조립한다.
 */
import { Clapperboard, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  PLOTR_IDEA_QUICK_PRESETS,
  PLOTR_LIGHTING_MOOD_PRESETS,
  type PlotrIdeaQuickPreset,
} from "./plotr-visual-cut-renderer";

export interface PlotrIdeaToWebtoonBarProps {
  readonly initialIdea?: string;
  readonly cutCount: number;
  readonly onGenerateFromIdea: (idea: string) => void;
}

const BTN =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function PlotrIdeaToWebtoonBar({
  initialIdea = "",
  cutCount,
  onGenerateFromIdea,
}: PlotrIdeaToWebtoonBarProps) {
  const [ideaInput, setIdeaInput] = useState(initialIdea);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = ideaInput.trim();
    if (!clean) return;
    setActivePresetId(null);
    onGenerateFromIdea(clean);
  };

  const handleSelectPreset = (preset: PlotrIdeaQuickPreset) => {
    setIdeaInput(preset.idea);
    setActivePresetId(preset.id);
    onGenerateFromIdea(preset.idea);
  };

  return (
    <section
      aria-label="한 문장 아이디어로 4컷 비주얼 웹툰 바로 만들기"
      data-testid="plotr-idea-to-webtoon-bar"
      className="plotr-idea-hero space-y-3 rounded-2xl p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-bold tracking-tight text-fg">
            <Clapperboard className="size-4 text-accent" aria-hidden="true" />
            <span>한 문장 아이디어 → 4컷 비주얼 웹툰</span>
          </h3>
          <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            떠오른 장면 한 줄만 적으면 카메라 구도·조명 무드·인물 팔레트·대사 말풍선까지 4컷 스토리보드로 바로 그려드려요.
          </p>
        </div>
        <span className="rounded-full border border-line bg-card/80 px-2.5 py-1 text-[11px] font-semibold text-fg-2 tabular-nums">
          현재 {cutCount}컷 구성
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="plotr-one-line-idea-input">
          한 문장 웹툰 아이디어 입력
        </label>
        <input
          id="plotr-one-line-idea-input"
          type="text"
          data-testid="plotr-idea-input"
          value={ideaInput}
          onChange={(e) => {
            setIdeaInput(e.target.value);
            if (activePresetId) setActivePresetId(null);
          }}
          placeholder="예: 비 오는 옥상에서 옛 연인과 다시 마주쳤다"
          className="min-h-11 flex-1 rounded-xl border border-line bg-card px-3.5 text-xs text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="submit"
          data-testid="plotr-idea-generate-btn"
          disabled={!ideaInput.trim()}
          title={!ideaInput.trim() ? "장면 아이디어 한 문장을 입력해 주세요" : undefined}
          className={`${BTN} plotr-spectrum-cta shrink-0 rounded-xl px-4 disabled:opacity-40`}
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          <span>4컷 비주얼 웹툰 생성</span>
        </button>
      </form>

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-fg-3">
          빠른 예시 칩 (누르면 즉시 4컷 생성)
        </p>
        <div
          role="group"
          aria-label="빠른 아이디어 예시 4종"
          className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {PLOTR_IDEA_QUICK_PRESETS.map((preset) => {
            const mood = PLOTR_LIGHTING_MOOD_PRESETS[preset.moodId];
            const isSelected = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`plotr-idea-preset-${preset.id}`}
                data-active={isSelected ? "true" : "false"}
                aria-pressed={isSelected}
                style={{ ["--mood-accent" as string]: mood.accentOklch }}
                onClick={() => handleSelectPreset(preset)}
                className="plotr-idea-chip plotr-btn-tactile flex min-h-11 flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="flex w-full items-center justify-between gap-1.5 text-xs font-bold text-fg">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: mood.accentOklch }}
                    />
                    <span>{preset.labelKo}</span>
                  </span>
                  <span className="text-[10px] font-medium text-fg-3">
                    {mood.labelKo}
                  </span>
                </span>
                <span className="line-clamp-1 text-[11px] text-fg-2 [word-break:keep-all]">
                  {preset.idea}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default PlotrIdeaToWebtoonBar;
