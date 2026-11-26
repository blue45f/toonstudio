import { ArrowRight, ChevronDown, HelpCircle } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type Ref } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import {
  MARKET_ECOSYSTEM_PRESETS,
  runSameDocumentViewTransition,
  type MarketEcosystemPresetId,
} from "@/shared/navigation/webtoon-platform-router-ux-model";

const PRESET_EN_COPY: Readonly<
  Record<
    MarketEcosystemPresetId,
    { readonly label: string; readonly description: string; readonly studioMountLabel: string }
  >
> = {
  all: {
    label: "All Creator Materials",
    description:
      "Browse every production category from 2D brushes and screentones to 3D stages and character poses.",
    studioMountLabel: "Open Studio Asset Library",
  },
  "brush-2d": {
    label: "2D Pens, Brushes & Line Art",
    description:
      "Mount ink pens, watercolor nibs, and effect brushes straight into the Studio Brush Engine.",
    studioMountLabel: "Mount in Brush Manager",
  },
  "bg-3d": {
    label: "3D Webtoon Stages & Rooms",
    description:
      "Stage interior, city, and fantasy 3D environments with camera angles and lighting for your panels.",
    studioMountLabel: "Open in 3D Scene Lab",
  },
  "char-pose-3d": {
    label: "3D Characters, Dolls & Poses",
    description: "Adjust high-angle and low-angle anatomy and hand poses in the Studio character editor.",
    studioMountLabel: "Open in Studio Characters",
  },
  "tone-sfx": {
    label: "Screentones, Balloons & SFX",
    description:
      "Equip print-and-scroll screentones, dialogue balloons, and sound-effect lettering packs.",
    studioMountLabel: "Mount in Comic Studio",
  },
  "free-point": {
    label: "Curated Time-Saving Picks",
    description: "Verified time-saving assets most downloaded by webtoon creators this week.",
    studioMountLabel: "View My Purchased Assets",
  },
};

function assignButtonRef(targetRef: Ref<HTMLButtonElement> | undefined, node: HTMLButtonElement | null) {
  if (!targetRef) return;
  if (typeof targetRef === "function") {
    targetRef(node);
  } else {
    (targetRef as { current: HTMLButtonElement | null }).current = node;
  }
}

/** 소재 종류 선택 레일(슬라이딩 인디케이터 포함)과 접이식 안내만 소유하고 실제 목록은 페이지가 유지한다. */
export function MarketHomePresets({
  activeId,
  onSelect,
  allButtonRef,
}: {
  readonly activeId: MarketEcosystemPresetId;
  readonly onSelect: (id: MarketEcosystemPresetId) => void;
  readonly allButtonRef: Ref<HTMLButtonElement>;
}) {
  const t = useBilingual("MarketHomePage");
  const railRef = useRef<HTMLDivElement | null>(null);
  const buttonMapRef = useRef(new Map<MarketEcosystemPresetId, HTMLButtonElement>());

  const presetShortLabels: Record<MarketEcosystemPresetId, string> = {
    all: t("전체", "All"),
    "brush-2d": t("브러시", "Brushes"),
    "bg-3d": t("3D 배경", "3D scenes"),
    "char-pose-3d": t("캐릭터·포즈", "Character poses"),
    "tone-sfx": t("톤·효과", "Tones & effects"),
    "free-point": t("추천 소재", "Featured"),
  };

  const activePreset =
    MARKET_ECOSYSTEM_PRESETS.find((preset) => preset.id === activeId) ?? MARKET_ECOSYSTEM_PRESETS[0];

  useLayoutEffect(() => {
    const rail = railRef.current;
    const activeBtn = buttonMapRef.current.get(activeId);
    if (!rail || !activeBtn) return;
    const updateIndicator = () => {
      const width = activeBtn.offsetWidth;
      if (width <= 0) {
        rail.removeAttribute("data-rail-measured");
        return;
      }
      rail.setAttribute("data-rail-measured", "true");
      rail.style.setProperty("--rail-x", `${activeBtn.offsetLeft}px`);
      rail.style.setProperty("--rail-scale", `${width / 100}`);
    };
    updateIndicator();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(rail);
    observer.observe(activeBtn);
    return () => observer.disconnect();
  }, [activeId]);

  useEffect(() => {
    const rail = railRef.current;
    const activeBtn = buttonMapRef.current.get(activeId);
    if (!rail || !activeBtn || activeBtn.offsetWidth <= 0) return;
    rail.setAttribute("data-rail-measured", "true");
    rail.style.setProperty("--rail-x", `${activeBtn.offsetLeft}px`);
    rail.style.setProperty("--rail-scale", `${activeBtn.offsetWidth / 100}`);
  });

  return (
    <section
      aria-label={t(
        "2D·3D 창작 에셋 프리셋 및 스튜디오 즉시 장착",
        "2D/3D creator asset presets & 1-click Studio mount",
      )}
      data-testid="market-rea-ecosystem-presets"
    >
      <div className="flex flex-col gap-2 border-b border-line sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div
          ref={railRef}
          className="market-category-rail relative flex max-w-full items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label={t("에셋 프리셋 선택", "Select asset preset")}
          style={{ "--rail-x": "0px", "--rail-scale": "0" } as CSSProperties}
          onFocusCapture={(event) => {
            const button = event.target;
            const group = event.currentTarget;
            if (
              !(button instanceof HTMLButtonElement) ||
              button.parentElement !== group ||
              group.scrollWidth <= group.clientWidth
            ) {
              return;
            }
            const bounds = group.getBoundingClientRect();
            const target = button.getBoundingClientRect();
            const delta =
              target.left < bounds.left + 4
                ? target.left - bounds.left - 4
                : target.right > bounds.right - 4
                  ? target.right - bounds.right + 4
                  : 0;
            if (delta !== 0) group.scrollBy({ left: delta, behavior: "instant" });
          }}
        >
          {MARKET_ECOSYSTEM_PRESETS.map((preset) => {
            const selected = preset.id === activeId;
            return (
              <button
                key={preset.id}
                ref={(node) => {
                  if (node) buttonMapRef.current.set(preset.id, node);
                  else buttonMapRef.current.delete(preset.id);
                  if (preset.id === "all") assignButtonRef(allButtonRef, node);
                }}
                type="button"
                aria-pressed={selected}
                title={t(preset.label, PRESET_EN_COPY[preset.id].label)}
                onClick={() => {
                  runSameDocumentViewTransition(() => {
                    onSelect(preset.id);
                  });
                }}
                className={cn(
                  "market-category-rail__btn relative inline-flex shrink-0 min-h-11 [min-block-size:2.75rem]! items-center justify-center whitespace-nowrap rounded-t-[8px] px-3.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
                  selected
                    ? "font-medium text-fg"
                    : "font-normal text-fg-2 hover:bg-raised/40 hover:text-fg",
                )}
              >
                <span aria-hidden="true">{presetShortLabels[preset.id]}</span>
                <span className="sr-only">{t(preset.label, PRESET_EN_COPY[preset.id].label)}</span>
              </button>
            );
          })}
          <span aria-hidden="true" className="market-category-rail__indicator" />
        </div>

        {activePreset ? (
          <details className="group/preset-guide shrink-0 break-keep [overflow-wrap:break-word] text-xs text-fg-2">
            <summary className="flex min-h-11 [min-block-size:2.75rem]! cursor-pointer list-none items-center gap-1.5 rounded-[8px] px-2.5 font-medium text-fg-2 transition-colors duration-150 hover:bg-raised/50 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              <HelpCircle size={14} strokeWidth={1.5} aria-hidden="true" />
              <span>{t("소재 안내 · 사용하기", "Material guide & use")}</span>
              <ChevronDown
                size={14}
                strokeWidth={1.5}
                aria-hidden="true"
                className="transition-transform duration-150 group-open/preset-guide:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <div className="my-2 flex flex-col gap-3 rounded-[12px] border border-line bg-panel p-3.5 sm:max-w-xl">
              <div className="flex items-start gap-3">
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
                  className="h-12 w-20 shrink-0 rounded-[8px] object-cover"
                />
                <div className="min-w-0">
                  <p className="mb-0.5 text-xs font-semibold leading-[1.4] text-fg">
                    {t(activePreset.label, PRESET_EN_COPY[activePreset.id].label)}
                  </p>
                  <p className="leading-[1.6] tracking-[-0.01em] text-fg-2">
                    {t(activePreset.description, PRESET_EN_COPY[activePreset.id].description)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 border-t border-line pt-2.5 sm:flex sm:flex-wrap sm:items-center">
                <Link
                  href={activePreset.studioMountRoute}
                  className={buttonClass({
                    variant: "solid",
                    size: "sm",
                    className: "min-h-11 [min-block-size:2.75rem]! w-full justify-center gap-1.5 rounded-[8px] px-3.5 text-xs font-medium sm:w-auto",
                  })}
                >
                  {t(activePreset.studioMountLabel, PRESET_EN_COPY[activePreset.id].studioMountLabel)}
                  <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
                </Link>
                <Link
                  href="/market/browse"
                  className={buttonClass({
                    variant: "outline",
                    size: "sm",
                    className: "min-h-11 [min-block-size:2.75rem]! w-full justify-center rounded-[8px] px-3.5 text-xs font-medium sm:w-auto",
                  })}
                >
                  {t("전체 에셋 카탈로그", "Full asset catalog")}
                </Link>
              </div>
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
