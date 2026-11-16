import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_HYBRID_DCC_BLENDER_V13_KIT,
  STUDIO_HYBRID_DCC_STARTER_PRIMITIVES,
  type StudioHybridDccBlenderKitItem,
  type StudioHybridDccStarterPrimitiveKind,
} from "./studio-hybrid-dcc-primitives";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export interface StudioHybridDccPrimitiveBarProps {
  readonly busy: boolean;
  readonly onAddPrimitive: (kind: StudioHybridDccStarterPrimitiveKind, label: string) => void;
  readonly onImportFile: (file: File) => void;
}

/** 8종 기본 도형 생성 팔레트 및 Blender 5.2 CC0 검증 스타터 키트 즉시 불러오기 막대. */
export function StudioHybridDccPrimitiveBar({
  busy,
  onAddPrimitive,
  onImportFile,
}: StudioHybridDccPrimitiveBarProps) {
  const bt = useBilingual("StudioHybridDccPrimitiveBar");
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState("");

  const loadBlenderKitAsset = async (item: StudioHybridDccBlenderKitItem) => {
    if (busy || fetchingId) return;
    setFetchingId(item.id);
    setFetchError("");
    try {
      const response = await fetch(item.glbUrl);
      if (!response.ok) {
        throw new Error(
          bt(
            `스타터 에셋을 불러오지 못했습니다 (${response.status}).`,
            `Could not load starter asset (${response.status}).`,
          ),
        );
      }
      const bytes = await response.arrayBuffer();
      const file = new File([bytes], item.fileName, { type: "model/gltf-binary" });
      onImportFile(file);
    } catch (error) {
      setFetchError(
        error instanceof Error
          ? error.message
          : bt("스타터 에셋 로드에 실패했습니다.", "Failed to load the starter asset."),
      );
    } finally {
      setFetchingId(null);
    }
  };

  const disabled = busy || fetchingId !== null;

  return (
    <section
      aria-label={bt("빠른 도형·스타터 에셋 추가", "Quick primitives and starter assets")}
      data-studio-hybrid-dcc-primitive-bar="true"
      className="rounded-2xl border border-line bg-panel p-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 pb-2">
        <span className="text-xs font-semibold text-fg-2">
          {bt("기본 도형 8종 즉시 추가", "Add starter primitives")}
        </span>
        <span className="text-[0.6875rem] text-fg-3">
          {bt("클릭 즉시 매니폴드 원본 생성 · Ctrl+Z 복원", "1-click manifold mesh · Undo supported")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {STUDIO_HYBRID_DCC_STARTER_PRIMITIVES.map((spec) => {
          const label = bt(spec.label[0], spec.label[1]);
          return (
            <button
              key={spec.kind}
              type="button"
              disabled={disabled}
              data-studio-hybrid-dcc-primitive={spec.kind}
              onClick={() => onAddPrimitive(spec.kind, `${label} 추가`)}
              className={cn(
                "flex min-h-11 min-w-0 flex-col items-start justify-center rounded-lg border border-line bg-card px-2.5 py-1.5 text-left transition-colors hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45",
                FOCUS_RING,
              )}
            >
              <span className="truncate text-xs font-semibold text-fg">{label}</span>
              <span className="truncate text-[0.65rem] text-fg-3">{bt(spec.hint[0], spec.hint[1])}</span>
            </button>
          );
        })}
      </div>

      <details className="group mt-2 rounded-xl border border-line/70 bg-canvas/35">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-fg-2 [&::-webkit-details-marker]:hidden",
            FOCUS_RING,
          )}
        >
          <span>
            {bt(
              "웹툰 모듈러 스타터 키트 (CC0 · 4종 GLB)",
              "Webtoon modular starter kit (CC0 · 4 GLBs)",
            )}
          </span>
          <span className="text-[0.6875rem] font-normal text-fg-3 group-open:text-accent">
            {bt("펼쳐서 불러오기", "Browse & import")}
          </span>
        </summary>
        <div className="grid grid-cols-1 gap-2 border-t border-line/60 p-2 sm:grid-cols-2">
          {STUDIO_HYBRID_DCC_BLENDER_V13_KIT.map((item) => {
            const loading = fetchingId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                data-studio-hybrid-dcc-kit-item={item.id}
                onClick={() => {
                  void loadBlenderKitAsset(item);
                }}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg border border-line bg-card p-2 text-left transition-colors hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45",
                  FOCUS_RING,
                )}
              >
                <img
                  src={item.previewUrl}
                  alt=""
                  loading="lazy"
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-md border border-line/60 bg-canvas object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-fg">
                    {loading
                      ? bt("불러오는 중…", "Loading…")
                      : bt(item.label[0], item.label[1])}
                  </span>
                  <span className="block truncate text-[0.65rem] text-fg-3">
                    {bt(item.hint[0], item.hint[1])} · {item.triangles.toLocaleString("ko-KR")} tris
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </details>
      {fetchError ? (
        <p role="alert" className="mt-1.5 text-xs text-bad">
          {fetchError}
        </p>
      ) : null}
    </section>
  );
}
