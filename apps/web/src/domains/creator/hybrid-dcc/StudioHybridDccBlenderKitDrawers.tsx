import {
  Aperture,
  ArrowLeftRight,
  Building2,
  ChevronDown,
  CloudRain,
  Compass,
  DoorOpen,
  Flame,
  Gem,
  Hammer,
  Layers,
  PackageOpen,
  PersonStanding,
  Sun,
  Type,
  Users2,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_HYBRID_DCC_BLENDER_V28_VRM_KIT } from "./studio-hybrid-dcc-blender-v28-kit";
import { STUDIO_HYBRID_DCC_BLENDER_V29_DUO_KIT } from "./studio-hybrid-dcc-blender-v29-kit";
import {
  STUDIO_HYBRID_DCC_BLENDER_V13_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V18_HANDOFF_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V19_DATUM_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V20_ARTICULATED_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V21_GODRAY_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V22_BOKEH_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V23_ZDEPTH_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V24_WEATHER_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V25_DRAPE_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V26_AFTERMATH_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V27_HEATHAZE_KIT,
  type StudioHybridDccBlenderKitItem,
  type StudioHybridDccPrecisionBgKitItem,
} from "./studio-hybrid-dcc-primitives";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const TILE_PRESS =
  "transition-[background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

interface KitDrawerGroupSpec {
  readonly key: string;
  readonly summaryTestId?: string;
  readonly icon: LucideIcon;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly items: readonly (StudioHybridDccBlenderKitItem | StudioHybridDccPrecisionBgKitItem)[];
}

const BLENDER_KIT_DRAWER_GROUPS: readonly KitDrawerGroupSpec[] = [
  {
    key: "v29-duo",
    summaryTestId: "studio-hybrid-dcc-v29-duo-kit-summary",
    icon: Users2,
    titleKo: `2인 시선·키 차이·OTS 듀오 V29 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V29_DUO_KIT.length}종)`,
    titleEn: `Duo eye-line & OTS V29 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V29_DUO_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V29_DUO_KIT,
  },
  {
    key: "v28-vrm",
    summaryTestId: "studio-hybrid-dcc-v28-vrm-kit-summary",
    icon: PersonStanding,
    titleKo: `VRM 해부학 포즈 마네킹 V28 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V28_VRM_KIT.length}종)`,
    titleEn: `VRM pose mannequin V28 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V28_VRM_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V28_VRM_KIT,
  },
  {
    key: "v27-heathaze",
    summaryTestId: "studio-hybrid-dcc-v27-heathaze-kit-summary",
    icon: Flame,
    titleKo: `잔류 연무·열기 아지랑이 V27 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V27_HEATHAZE_KIT.length}종)`,
    titleEn: `Post-impact dust & heat-haze V27 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V27_HEATHAZE_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V27_HEATHAZE_KIT,
  },
  {
    key: "v26-aftermath",
    summaryTestId: "studio-hybrid-dcc-v26-aftermath-kit-summary",
    icon: Hammer,
    titleKo: `3단계 파손·흔적 V26 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V26_AFTERMATH_KIT.length}종)`,
    titleEn: `3-stage aftermath V26 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V26_AFTERMATH_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V26_AFTERMATH_KIT,
  },
  {
    key: "v25-drape",
    summaryTestId: "studio-hybrid-dcc-v25-drape-kit-summary",
    icon: Wind,
    titleKo: `기류 패브릭·하프 미러 반사창 V25 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V25_DRAPE_KIT.length}종)`,
    titleEn: `Wind drape & half-mirror V25 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V25_DRAPE_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V25_DRAPE_KIT,
  },
  {
    key: "v24-weather",
    summaryTestId: "studio-hybrid-dcc-v24-weather-kit-summary",
    icon: CloudRain,
    titleKo: `건축 차폐 기상·수막 파문 V24 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V24_WEATHER_KIT.length}종)`,
    titleEn: `Weather occlusion & wet ripples V24 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V24_WEATHER_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V24_WEATHER_KIT,
  },
  {
    key: "v23-zdepth",
    summaryTestId: "studio-hybrid-dcc-v23-zdepth-kit-summary",
    icon: Type,
    titleKo: `Z-심도 효과음·군중·시간대 V23 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V23_ZDEPTH_KIT.length}종)`,
    titleEn: `Z-depth SFX, crowd & ToD V23 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V23_ZDEPTH_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V23_ZDEPTH_KIT,
  },
  {
    key: "v22-bokeh",
    summaryTestId: "studio-hybrid-dcc-v22-bokeh-kit-summary",
    icon: Aperture,
    titleKo: `보케 파티클·심도(DoF) V22 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V22_BOKEH_KIT.length}종)`,
    titleEn: `Atmospheric bokeh & DoF V22 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V22_BOKEH_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V22_BOKEH_KIT,
  },
  {
    key: "v21-godray",
    summaryTestId: "studio-hybrid-dcc-v21-godray-kit-summary",
    icon: Sun,
    titleKo: `슬릿 고드레이 3연속 시퀀스 V21 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V21_GODRAY_KIT.length}종)`,
    titleEn: `Slit god-ray 3-beat sequence V21 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V21_GODRAY_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V21_GODRAY_KIT,
  },
  {
    key: "v20-articulated",
    summaryTestId: "studio-hybrid-dcc-v20-articulated-kit-summary",
    icon: DoorOpen,
    titleKo: `개폐형 가동 파츠·IK 소켓 V20 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V20_ARTICULATED_KIT.length}종)`,
    titleEn: `Articulated props & IK sockets V20 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V20_ARTICULATED_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V20_ARTICULATED_KIT,
  },
  {
    key: "v19-datum",
    summaryTestId: "studio-hybrid-dcc-v19-datum-kit-summary",
    icon: Compass,
    titleKo: `공통 기준선 현대·무협·SF V19 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V19_DATUM_KIT.length}종)`,
    titleEn: `Shared datum modern/murim/sci-fi V19 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V19_DATUM_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V19_DATUM_KIT,
  },
  {
    key: "v18-handoff",
    summaryTestId: "studio-hybrid-dcc-v18-handoff-kit-summary",
    icon: ArrowLeftRight,
    titleKo: `회차 전환 듀얼 장르 브리지 V18 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V18_HANDOFF_KIT.length}종)`,
    titleEn: `Episode dual-genre bridge V18 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V18_HANDOFF_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V18_HANDOFF_KIT,
  },
  {
    key: "v17-salon",
    summaryTestId: "studio-hybrid-dcc-v17-salon-kit-summary",
    icon: Gem,
    titleKo: `블렌더 5.3 뤼미에르 살롱 V17 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT.length}종)`,
    titleEn: `Blender 5.3 Lumiere salon V17 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT,
  },
  {
    key: "v16-lumiere",
    summaryTestId: "studio-hybrid-dcc-v16-lumiere-kit-summary",
    icon: Gem,
    titleKo: `블렌더 5.3 뤼미에르 아틀리에 V16 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT.length}종)`,
    titleEn: `Blender 5.3 Lumiere atelier V16 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT,
  },
  {
    key: "v14-bg",
    summaryTestId: "studio-hybrid-dcc-v14-bg-kit-summary",
    icon: Building2,
    titleKo: `정밀 웹툰 배경 베이 V14 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT.length}종)`,
    titleEn: `Precision webtoon BG bays V14 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT,
  },
  {
    key: "v15-artisan",
    summaryTestId: "studio-hybrid-dcc-v15-artisan-kit-summary",
    icon: Layers,
    titleKo: `아티잔 아틀리에 V15 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT.length}종)`,
    titleEn: `Artisan atelier V15 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT.length})`,
    items: STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT,
  },
  {
    key: "v13-flagship",
    icon: PackageOpen,
    titleKo: "플래그십 스타터 모델 (CC0 · 8종)",
    titleEn: "Flagship starter models (CC0 · 8)",
    items: STUDIO_HYBRID_DCC_BLENDER_V13_KIT,
  },
];

export interface StudioHybridDccBlenderKitDrawersProps {
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly fetchingId: string | null;
  readonly onSelectKitItem: (
    item: StudioHybridDccBlenderKitItem | StudioHybridDccPrecisionBgKitItem,
  ) => void;
}

/**
 * React TS Architecture & Codebase Hardening 원칙에 따라 분리된 데이터 기반 Blender CC0 키트 아코디언 목록.
 */
export function StudioHybridDccBlenderKitDrawers({
  disabled,
  disabledReason,
  fetchingId,
  onSelectKitItem,
}: StudioHybridDccBlenderKitDrawersProps) {
  const bt = useBilingual("StudioHybridDccPrimitiveBar");
  const unavailableTitle = disabled ? disabledReason : undefined;

  return (
    <>
      {BLENDER_KIT_DRAWER_GROUPS.map((group) => {
        const Icon = group.icon;
        return (
          <details
            key={group.key}
            className="group rounded-xl border border-line bg-canvas/35"
          >
            <summary
              data-testid={group.summaryTestId}
              className={cn(
                "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium leading-[1.4] text-fg-2 hover:bg-raised/45 [word-break:keep-all] [&::-webkit-details-marker]:hidden",
                FOCUS_RING,
              )}
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <Icon
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="shrink-0 text-fg-3 group-open:text-fg"
                />
                <span className="truncate tabular-nums">
                  {bt(group.titleKo, group.titleEn)}
                </span>
              </span>
              <ChevronDown
                size={16}
                strokeWidth={1.5}
                aria-hidden="true"
                className="shrink-0 text-fg-3 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <div className="max-h-80 space-y-2 overflow-y-auto overscroll-contain border-t border-line p-2">
              {group.items.map((item) => {
                const loading = fetchingId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    title={unavailableTitle}
                    data-studio-hybrid-dcc-kit-item={item.id}
                    onClick={() => onSelectKitItem(item)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-lg border border-line bg-card p-2 text-left leading-[1.4] hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 [word-break:keep-all]",
                      TILE_PRESS,
                      FOCUS_RING,
                    )}
                  >
                    <img
                      src={item.previewUrl}
                      alt=""
                      loading="lazy"
                      width={40}
                      height={40}
                      className="size-10 shrink-0 rounded-md bg-canvas object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-fg">
                        {loading
                          ? bt("불러오는 중…", "Loading…")
                          : bt(item.label[0], item.label[1])}
                      </span>
                      <span className="block truncate font-mono text-xs tabular-nums text-fg-3">
                        {bt(item.hint[0], item.hint[1])} ·{" "}
                        {item.triangles.toLocaleString("ko-KR")} tris
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </details>
        );
      })}
    </>
  );
}
