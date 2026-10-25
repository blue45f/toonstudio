import { useState } from "react";

import {
  STUDIO_BG3D_ESSENTIAL_ASSET_CATEGORIES,
  STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG,
  fetchStudioBg3dEssentialGlbAsFile,
  listStudioBg3dEssentialAssetsByCategory,
  resolveStudioBg3dRefinedV8PropCounterpart,
  searchStudioBg3dEssentialAssets,
  type StudioBg3dEssentialAssetCategory,
  type StudioBg3dEssentialAssetEntry,
} from "./studio-bg3d-essential-pose-prop-catalog";

import { cx } from "@/shared/lib/cx";

export interface StudioBg3dEssentialPosePropPanelProps {
  readonly disabled?: boolean;
  readonly defaultExpanded?: boolean;
  readonly onFile: (file: File) => void;
  readonly onBusyChange?: (busy: boolean) => void;
}

function categoryShortLabel(category: StudioBg3dEssentialAssetCategory): string {
  switch (category) {
    case "pose-3d":
      return "3D 포즈";
    case "essential-prop-3d":
      return "건축 소품";
    case "refined-v8-prop-3d":
      return "V8 히어로";
    case "original-scene-prop-3d":
      return "배경·가구";
    case "original-hand-wear-prop-3d":
      return "일상·착용";
  }
}

export function StudioBg3dEssentialPosePropPanel({
  disabled = false,
  defaultExpanded = false,
  onFile,
  onBusyChange,
}: StudioBg3dEssentialPosePropPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [category, setCategory] = useState<StudioBg3dEssentialAssetCategory | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeTurnaroundEntry, setActiveTurnaroundEntry] =
    useState<StudioBg3dEssentialAssetEntry | null>(null);

  const visibleAssets = searchStudioBg3dEssentialAssets(category, query);

  const handleImport = async (entry: StudioBg3dEssentialAssetEntry) => {
    if (disabled || busyId !== null) return;
    setBusyId(entry.id);
    onBusyChange?.(true);
    setStatusMessage(`${entry.labelKo} GLB 모델을 준비하고 있습니다...`);
    try {
      const file = await fetchStudioBg3dEssentialGlbAsFile(entry);
      onFile(file);
      setStatusMessage(`${entry.labelKo} 모델을 가져오기 경로로 전달했습니다.`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : `${entry.labelKo} 모델을 가져오지 못했습니다.`,
      );
    } finally {
      setBusyId(null);
      onBusyChange?.(false);
    }
  };

  return (
    <section
      data-testid="bg3d-essential-pose-prop-panel"
      aria-label="필수 포즈 마네킹 및 히어로 소품 라이브러리"
      className="mt-3 rounded-xl border border-line bg-card/60 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-fg">
            3D 인체 포즈 마네킹 · 필수 건축/히어로/오리지널 소품 ({STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG.length}종)
          </h4>
          <p className="mt-0.5 text-[0.62rem] text-fg-3">
            포즈 마네킹 8종(3면도 포함) · 필수 건축 8종 · V8 히어로 11종 · 오리지널 가구/배경/일상/착용 소품 68종 (CC0 1.0)
          </p>
        </div>
        <button
          type="button"
          disabled={disabled && busyId === null}
          aria-expanded={expanded}
          data-testid="bg3d-essential-pose-prop-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          className="shrink-0 rounded-lg border border-line bg-panel px-2.5 py-1 text-[0.64rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:opacity-45"
        >
          {expanded ? "카탈로그 접기" : `포즈·소품 ${STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG.length}종 열기`}
        </button>
      </div>

      {expanded ? (
        <div className="mt-2.5 space-y-2.5 border-t border-line/70 pt-2.5">
          {/* Category Filter Chips */}
          <div className="flex flex-wrap gap-1" role="group" aria-label="포즈·소품 분류 필터">
            <button
              type="button"
              disabled={disabled || busyId !== null}
              aria-pressed={category === null}
              data-testid="bg3d-essential-cat-all"
              onClick={() => setCategory(null)}
              className={cx(
                "rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold transition-colors",
                category === null
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-3 hover:bg-raised hover:text-fg",
              )}
            >
              전체 ({STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG.length})
            </button>
            {STUDIO_BG3D_ESSENTIAL_ASSET_CATEGORIES.map((cat) => {
              const count = listStudioBg3dEssentialAssetsByCategory(cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  disabled={disabled || busyId !== null}
                  aria-pressed={category === cat.id}
                  data-testid={`bg3d-essential-cat-${cat.id}`}
                  title={cat.descriptionKo}
                  onClick={() => setCategory(cat.id)}
                  className={cx(
                    "rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold transition-colors",
                    category === cat.id
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-3 hover:bg-raised hover:text-fg",
                  )}
                >
                  {cat.labelKo} ({count})
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="search"
              value={query}
              disabled={disabled || busyId !== null}
              aria-label="포즈·소품 이름 검색"
              data-testid="bg3d-essential-search-input"
              placeholder="칠판, 책상, 소파, 휠체어, 포장마차, 카타나, 카메라..."
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-lg border border-line bg-panel px-2.5 py-1 text-[0.64rem] text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            />
            <span className="shrink-0 text-[0.58rem] text-fg-3">
              {visibleAssets.length}종 표시
            </span>
          </div>

          {activeTurnaroundEntry?.turnaround2dUrl ? (
            <div
              data-testid="bg3d-essential-turnaround-viewer"
              className="rounded-lg border border-accent/40 bg-panel p-2"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[0.64rem] font-bold text-fg">
                  {activeTurnaroundEntry.labelKo} · 3면도 데생 가이드 (정면·측면·후면)
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTurnaroundEntry(null)}
                  className="text-[0.6rem] font-semibold text-fg-3 hover:text-fg"
                >
                  닫기
                </button>
              </div>
              <img
                src={activeTurnaroundEntry.turnaround2dUrl}
                alt={`${activeTurnaroundEntry.labelKo} 3면도 데생 가이드`}
                className="max-h-36 w-full rounded border border-line/60 bg-card object-contain"
              />
            </div>
          ) : null}

          <div
            className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1"
            role="group"
            aria-label="포즈 마네킹 및 필수 소품 목록"
          >
            {visibleAssets.map((entry) => {
              const isBusy = busyId === entry.id;
              const refinedCounterpart = resolveStudioBg3dRefinedV8PropCounterpart(entry);
              return (
                <div
                  key={entry.id}
                  data-testid={`bg3d-essential-item-${entry.id}`}
                  className="flex flex-col justify-between gap-1.5 rounded-lg border border-line bg-panel p-2"
                >
                  <div className="flex items-center gap-2">
                    {entry.previewUrl ? (
                      <img
                        src={entry.previewUrl}
                        alt={entry.labelKo}
                        loading="lazy"
                        className="size-10 shrink-0 rounded border border-line/60 bg-card object-contain"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="grid size-10 shrink-0 place-items-center rounded border border-line/60 bg-card text-[0.55rem] font-bold text-accent"
                      >
                        GLB
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.64rem] font-bold text-fg">{entry.labelKo}</p>
                      <p className="truncate text-[0.55rem] text-fg-3">
                        {entry.license} · {categoryShortLabel(entry.category)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={disabled || busyId !== null}
                      data-testid={`bg3d-essential-import-${entry.id}`}
                      onClick={() => void handleImport(entry)}
                      className="flex-1 rounded border border-accent/50 bg-accent-soft px-2 py-1 text-[0.6rem] font-bold text-accent transition-colors hover:bg-accent/20 disabled:opacity-45"
                    >
                      {isBusy ? "전달 중..." : "3D 장면에 가져오기"}
                    </button>
                    {refinedCounterpart ? (
                      <button
                        type="button"
                        disabled={disabled || busyId !== null}
                        data-testid={`bg3d-essential-upgrade-v8-${entry.id}`}
                        title={`${refinedCounterpart.labelKo} 고품질 히어로 모델로 가져오기`}
                        onClick={() => void handleImport(refinedCounterpart)}
                        className="rounded border border-accent/40 bg-card px-1.5 py-1 text-[0.58rem] font-semibold text-accent hover:bg-accent-soft disabled:opacity-45"
                      >
                        V8 고품질본
                      </button>
                    ) : null}
                    {entry.turnaround2dUrl ? (
                      <button
                        type="button"
                        data-testid={`bg3d-essential-turnaround-btn-${entry.id}`}
                        title="정면·측면·후면 3면도 데생 가이드 보기"
                        onClick={() =>
                          setActiveTurnaroundEntry((prev) =>
                            prev?.id === entry.id ? null : entry,
                          )
                        }
                        className="rounded border border-line bg-card px-1.5 py-1 text-[0.58rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg"
                      >
                        3면도
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {statusMessage ? (
            <p
              role="status"
              data-testid="bg3d-essential-status"
              className="text-[0.62rem] text-fg-3"
            >
              {statusMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
