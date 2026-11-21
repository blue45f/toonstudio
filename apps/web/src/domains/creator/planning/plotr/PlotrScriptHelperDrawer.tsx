/**
 * Plotr 대본 도우미 드로어(작품 제목·분위기·분량·로그라인·세계관·트렌드 태그·초안 작성).
 */
import { Sparkles } from "lucide-react";
import { PLOTR_TREND_TAGS } from "./plotr-genre-templates";
import type { PlotrDocumentState } from "./plotr-types";

export interface PlotrScriptHelperDrawerProps {
  readonly document: PlotrDocumentState;
  readonly onUpdateDocument: (
    updater: (prev: PlotrDocumentState) => PlotrDocumentState,
    feedback?: string,
  ) => void;
  readonly onGenerateDraft: () => void;
  readonly onExtractCharacters: () => void;
}

const BTN =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function PlotrScriptHelperDrawer({
  document: doc,
  onUpdateDocument,
  onGenerateDraft,
  onExtractCharacters,
}: PlotrScriptHelperDrawerProps) {
  return (
    <div
      data-testid="plotr-script-helper-drawer"
      className="space-y-3 rounded-xl border border-line bg-panel p-3"
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs font-semibold text-fg-2">
          작품 제목
          <input
            type="text"
            value={doc.title}
            onChange={(e) =>
              onUpdateDocument((prev) => ({ ...prev, title: e.target.value }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
          />
        </label>
        <label className="text-xs font-semibold text-fg-2">
          분위기
          <input
            type="text"
            value={doc.helper.mood}
            onChange={(e) =>
              onUpdateDocument((prev) => ({
                ...prev,
                helper: { ...prev.helper, mood: e.target.value },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
          />
        </label>
        <label className="text-xs font-semibold text-fg-2">
          분량
          <select
            value={doc.helper.length}
            onChange={(e) =>
              onUpdateDocument((prev) => ({
                ...prev,
                helper: {
                  ...prev.helper,
                  length: e.target.value as PlotrDocumentState["helper"]["length"],
                },
              }))
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
          >
            <option value="short">짧게 (4컷)</option>
            <option value="medium">보통 (5컷)</option>
            <option value="long">길게 (6컷)</option>
          </select>
        </label>
      </div>
      <label className="block text-xs font-semibold text-fg-2">
        한 줄 소재 (로그라인)
        <input
          type="text"
          value={doc.helper.logline}
          onChange={(e) =>
            onUpdateDocument((prev) => ({
              ...prev,
              helper: { ...prev.helper, logline: e.target.value },
            }))
          }
          placeholder="예: 파혼 직전으로 돌아온 영애가 북부 공작에게 역제안한다"
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
        />
      </label>
      <label className="block text-xs font-semibold text-fg-2">
        작품 설정 (시대·세계관 — 웹소설 원고 분석 시 먼저 반영)
        <input
          type="text"
          value={doc.helper.worldSettingNote}
          onChange={(e) =>
            onUpdateDocument((prev) => ({
              ...prev,
              helper: { ...prev.helper, worldSettingNote: e.target.value },
            }))
          }
          placeholder="예: 19세기 유리온실 제국, 시간 마력이 깃든 회중시계"
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {PLOTR_TREND_TAGS.map((tag) => {
          const active = doc.helper.trendTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onUpdateDocument((prev) => {
                  const exists = prev.helper.trendTags.includes(tag);
                  return {
                    ...prev,
                    helper: {
                      ...prev.helper,
                      trendTags: exists
                        ? prev.helper.trendTags.filter((t) => t !== tag)
                        : [...prev.helper.trendTags, tag],
                    },
                  };
                })
              }
              className={`${BTN} ${
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2"
              }`}
            >
              #{tag}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="plotr-generate-draft-btn"
          onClick={onGenerateDraft}
          className={`${BTN} border-accent bg-accent text-on-accent`}
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          <span>태그로 대본 초안 쓰기</span>
        </button>
        <button
          type="button"
          onClick={onExtractCharacters}
          disabled={!doc.rawScript.trim()}
          title={!doc.rawScript.trim() ? "먼저 대본을 적어 주세요" : undefined}
          className={`${BTN} border-line bg-card text-fg hover:bg-raised disabled:opacity-40`}
        >
          대본에서 인물·배경 뽑기
        </button>
      </div>
    </div>
  );
}

export default PlotrScriptHelperDrawer;
