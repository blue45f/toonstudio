/**
 * Plotr 회차 텐션 곡선 SVG 차트 · 작품 공통 그림체 8종 + 커스텀 화풍 프리셋 패널.
 */
import { useMemo, useState } from "react";
import { PLOTR_ART_STYLE_PRESETS } from "./plotr-consistency-and-batch";
import type { PlotrArtStyleDna, PlotrDocumentState } from "./plotr-types";

export interface PlotrTensionAndStylePanelProps {
  readonly document: PlotrDocumentState;
  readonly expertMode: boolean;
  readonly onUpdateDocument: (
    updater: (prev: PlotrDocumentState) => PlotrDocumentState,
    noticeKo?: string,
  ) => void;
}

const BTN =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function PlotrTensionAndStylePanel({
  document,
  expertMode,
  onUpdateDocument,
}: PlotrTensionAndStylePanelProps) {
  const [customStyleName, setCustomStyleName] = useState("");

  const tensionPath = useMemo(() => {
    if (document.cuts.length === 0) return "";
    const width = 320;
    const height = 74;
    const stepX = document.cuts.length > 1 ? width / (document.cuts.length - 1) : 0;
    return document.cuts
      .map((cut, idx) => {
        const x = document.cuts.length > 1 ? Math.round(idx * stepX) : width / 2;
        const y = Math.round(height - 10 - (cut.tensionScore / 100) * (height - 20));
        return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [document.cuts]);

  const handleSaveCustomStyle = () => {
    const labelKo = customStyleName.trim();
    if (!labelKo) return;
    const custom: PlotrArtStyleDna = {
      ...document.artStyle,
      presetId: "custom",
      labelKo,
    };
    onUpdateDocument(
      (prev) => ({
        ...prev,
        artStyle: custom,
        customStylePresets: [
          custom,
          ...prev.customStylePresets.filter((p) => p.labelKo !== labelKo),
        ],
      }),
      `내 커스텀 그림체 '${labelKo}'를 저장해 작품 전체에 적용했어요.`,
    );
    setCustomStyleName("");
  };

  return (
    <details open={expertMode} className="rounded-xl border border-line bg-panel p-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-bold text-fg">
        <span>텐션 곡선 · 프로젝트 그림체 설정 ({document.artStyle.labelKo})</span>
        <span className="text-fg-3">프리셋 8종 · 커스텀 화풍</span>
      </summary>
      <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-2">
        <div className="plotr-tension-surface space-y-2 rounded-xl p-3">
          <h4 className="text-xs font-bold text-fg">회차 텐션 곡선</h4>
          {tensionPath ? (
            <svg
              role="img"
              aria-label="회차 컷별 텐션 곡선"
              viewBox="0 0 320 74"
              className="h-20 w-full"
            >
              <path
                d={tensionPath}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <p className="text-xs text-fg-3">컷이 생기면 텐션 흐름이 그려집니다.</p>
          )}
          <p className="text-xs text-fg-2 tabular-nums">
            평균 텐션{" "}
            {document.cuts.length > 0
              ? Math.round(
                  document.cuts.reduce((s, c) => s + c.tensionScore, 0) /
                    document.cuts.length,
                )
              : 0}
            점 · 총 {document.cuts.length}컷
          </p>
        </div>

        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
          <h4 className="text-xs font-bold text-fg">작품 공통 그림체 (8종 + 내 프리셋)</h4>
          <div className="flex flex-wrap gap-1.5">
            {[...PLOTR_ART_STYLE_PRESETS, ...document.customStylePresets].map((preset) => {
              const active = document.artStyle.labelKo === preset.labelKo;
              return (
                <button
                  key={`${preset.presetId}-${preset.labelKo}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onUpdateDocument(
                      (prev) => ({ ...prev, artStyle: preset }),
                      `작품 전체 그림체를 '${preset.labelKo}'로 설정했어요.`,
                    )
                  }
                  className={`${BTN} ${
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel text-fg-2 hover:text-fg"
                  }`}
                >
                  {preset.labelKo}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={customStyleName}
              onChange={(e) => setCustomStyleName(e.target.value)}
              placeholder="내 커스텀 그림체 이름"
              aria-label="커스텀 그림체 이름"
              className="min-h-11 flex-1 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
            />
            <button
              type="button"
              disabled={!customStyleName.trim()}
              title={!customStyleName.trim() ? "저장할 그림체 이름을 적어 주세요" : undefined}
              onClick={handleSaveCustomStyle}
              className={`${BTN} border-line bg-panel text-fg hover:bg-raised disabled:opacity-40`}
            >
              프리셋 저장
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}

export default PlotrTensionAndStylePanel;
