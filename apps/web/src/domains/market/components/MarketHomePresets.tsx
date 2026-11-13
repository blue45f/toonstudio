import { ArrowRight, HelpCircle } from "lucide-react";
import type { Ref } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { MARKET_ECOSYSTEM_PRESETS, runSameDocumentViewTransition, type MarketEcosystemPresetId } from "@/shared/navigation/webtoon-platform-router-ux-model";

const PRESET_EN_COPY: Readonly<Record<MarketEcosystemPresetId, { readonly label: string; readonly description: string; readonly studioMountLabel: string }>> = {
  all: { label: "All Creator Materials", description: "Browse every production category from 2D brushes and screentones to 3D stages and character poses.", studioMountLabel: "Open Studio Asset Library" },
  "brush-2d": { label: "2D Pens, Brushes & Line Art", description: "Mount ink pens, watercolor nibs, and effect brushes straight into the Studio Brush Engine.", studioMountLabel: "Mount in Brush Manager" },
  "bg-3d": { label: "3D Webtoon Stages & Rooms", description: "Stage interior, city, and fantasy 3D environments with camera angles and lighting for your panels.", studioMountLabel: "Open in 3D Scene Lab" },
  "char-pose-3d": { label: "3D Characters, Dolls & Poses", description: "Lock tricky high-angle and low-angle anatomy or hand poses in the 3D Character Lab.", studioMountLabel: "Open in 3D Character Lab" },
  "tone-sfx": { label: "Screentones, Balloons & SFX", description: "Equip print-and-scroll screentones, dialogue balloons, and sound-effect lettering packs.", studioMountLabel: "Mount in Comic Studio" },
  "free-point": { label: "Curated Time-Saving Picks", description: "Verified time-saving assets most downloaded by webtoon creators this week.", studioMountLabel: "View My Purchased Assets" },
};

/** 소재 종류 선택과 설명만 소유하고 실제 목록·미리보기는 페이지가 유지한다. */
export function MarketHomePresets({ activeId, onSelect, allButtonRef }: {
  readonly activeId: MarketEcosystemPresetId;
  readonly onSelect: (id: MarketEcosystemPresetId) => void;
  readonly allButtonRef: Ref<HTMLButtonElement>;
}) {
  const t = useBilingual("MarketHomePage");
  const presetShortLabels: Record<MarketEcosystemPresetId, string> = {
    all: t("전체", "All"),
    "brush-2d": t("브러시", "Brushes"),
    "bg-3d": t("3D 배경", "3D scenes"),
    "char-pose-3d": t("캐릭터·포즈", "Character poses"),
    "tone-sfx": t("톤·효과", "Tones & effects"),
    "free-point": t("추천 소재", "Featured"),
  };
  const activePreset =
    MARKET_ECOSYSTEM_PRESETS.find((preset) => preset.id === activeId) ??
    MARKET_ECOSYSTEM_PRESETS[0];

  return (
        <section
          aria-label={t("2D·3D 창작 에셋 프리셋 및 스튜디오 즉시 장착", "2D/3D creator asset presets & 1-click Studio mount")}
          data-testid="market-rea-ecosystem-presets"
          className="mb-6 rounded-2xl border border-line bg-card/85 p-4 shadow-sm sm:p-5"
        >
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-fg sm:text-base">
              {t("소재 유형", "Material types")}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label={t("에셋 프리셋 선택", "Select asset preset")}
              onFocusCapture={(event) => {
                const button = event.target;
                const group = event.currentTarget;
                if (!(button instanceof HTMLButtonElement) || button.parentElement !== group || group.scrollWidth <= group.clientWidth) return;
                const bounds = group.getBoundingClientRect();
                const target = button.getBoundingClientRect();
                const delta = target.left < bounds.left + 4
                  ? target.left - bounds.left - 4
                  : target.right > bounds.right - 4 ? target.right - bounds.right + 4 : 0;
                if (delta !== 0) group.scrollBy({ left: delta, behavior: "instant" });
              }}>
              {MARKET_ECOSYSTEM_PRESETS.map((preset) => {
                const selected = preset.id === activeId;
                return (
                  <button
                    key={preset.id}
                    ref={preset.id === "all" ? allButtonRef : undefined}
                    type="button"
                    aria-pressed={selected}
                    title={t(preset.label, PRESET_EN_COPY[preset.id].label)}
                    onClick={() => {
                      runSameDocumentViewTransition(() => {
                        onSelect(preset.id);
                      });
                    }}
                    className={cn(
                      "inline-flex min-h-11 [min-block-size:2.75rem]! items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      selected
                        ? "border-accent bg-accent text-canvas shadow-sm"
                        : "border-line bg-panel/70 text-fg-2 hover:border-accent/45 hover:text-fg",
                    )}
                  >
                    <span aria-hidden="true">{presetShortLabels[preset.id]}</span>
                    <span className="sr-only">{t(preset.label, PRESET_EN_COPY[preset.id].label)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {activePreset ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3 text-xs text-fg-2">
              <details className="w-full">
                <summary className="flex min-h-11 [min-block-size:2.75rem]! cursor-pointer items-center gap-2 rounded-lg px-2 font-semibold text-fg focus-visible:outline-2 focus-visible:outline-accent">
                  <HelpCircle size={16} aria-hidden="true" />
                  {t("소재 안내 · 사용하기", "Material guide & use")}
                  <span aria-hidden="true">⌄</span>
                </summary>
                <div className="flex items-center gap-3 px-2 pb-3 pt-2">
                <img
                  src={
                    activePreset.id === "brush-2d"
                      ? "/assets/site-experience/site-art-v1/cards/nb-create-canvas-640.webp"
                      : activePreset.id === "bg-3d" || activePreset.id === "char-pose-3d"
                        ? "/assets/site-experience/site-art-v1/cards/nb-spatial-stage-640.webp"
                        : activePreset.id === "tone-sfx"
                          ? "/assets/site-experience/site-art-v1/cards/nb-production-control-640.webp"
                          : "/assets/site-experience/site-art-v1/cards/nb-market-atelier-640.webp"
                  }
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="h-12 w-20 shrink-0 rounded-xl border border-line/70 object-cover"
                />
                <div className="max-w-2xl">
                  <p className="mb-1 text-[10px] font-bold text-fg-3">{activePreset.badge}</p>
                  <p>{t(activePreset.description, PRESET_EN_COPY[activePreset.id].description)}</p>
                </div>
                </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={activePreset.studioMountRoute}
                  className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11 [min-block-size:2.75rem]! gap-1.5 rounded-full px-4 text-xs font-bold" })}
                >
                  {t(activePreset.studioMountLabel, PRESET_EN_COPY[activePreset.id].studioMountLabel)}
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
                <Link
                  href="/market/browse"
                  className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 [min-block-size:2.75rem]! rounded-full px-3.5 text-xs font-semibold" })}
                >
                  {t("전체 에셋 카탈로그", "Full asset catalog")}
                </Link>
              </div>
              </details>
            </div>
          ) : null}
        </section>
  );
}
