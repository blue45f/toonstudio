import { Images } from "lucide-react";
import { useState } from "react";

import {
  marketProductionFitReasonLine,
} from "../models/market-production-fit";
import { filterPreviewData, marketFilterCss } from "../models/market-preview";

import type { MarketProductionFitEvaluation } from "../models/market-production-fit";

import { MarketResourceCover } from "./MarketResourceCover";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/**
 * 올려보기 배경으로 쓰는 실제 Studio 배경 이미지. 전부 저장소에 있는 파일을
 * 그대로 참조하며, 없는 장면을 만들지 않는다.
 */
const FIT_LAB_SCENES = [
  { id: "creator-room", src: "/assets/studio/backgrounds/webtoon_creator_room.png", ko: "창작자의 방", en: "Creator room" },
  { id: "moonlit-forest", src: "/assets/studio/backgrounds/webtoon_moonlit_forest.png", ko: "달빛 숲", en: "Moonlit forest" },
  { id: "neon-alley", src: "/assets/studio/backgrounds/webtoon_neon_alley.png", ko: "네온 골목", en: "Neon alley" },
  { id: "palace", src: "/assets/studio/backgrounds/webtoon_palace.png", ko: "궁궐", en: "Palace" },
  { id: "rooftop-sunset", src: "/assets/studio/backgrounds/webtoon_rooftop_sunset.png", ko: "옥상 노을", en: "Rooftop sunset" },
] as const;

type FitLabSceneId = (typeof FIT_LAB_SCENES)[number]["id"];

interface MarketFitScenePreviewProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly evaluation: MarketProductionFitEvaluation;
}

/**
 * 핏 랩 "장면에 올려보기" 합성 미리보기.
 *
 * 배경은 실제 Studio 배경 이미지만 쓰고, 오버레이는 선택한 리소스의 실데이터만으로
 * 만든다. 필터는 manifest 파라미터를 CSS로 근사해 장면 자체에 적용하고, 그 외
 * 종류는 마켓 표지 레이어(MarketResourceCover)를 투명도·크기를 조절해 겹친다.
 * 어느 쪽도 실제 Studio 렌더가 아니므로 그 사실을 화면에 명시한다.
 */
export function MarketFitScenePreview({ record, evaluation }: MarketFitScenePreviewProps) {
  const t = useBilingual("MarketFitScenePreview");
  const [sceneId, setSceneId] = useState<FitLabSceneId>(FIT_LAB_SCENES[0].id);
  const [opacity, setOpacity] = useState(65);
  const [scale, setScale] = useState(80);

  const scene = FIT_LAB_SCENES.find((candidate) => candidate.id === sceneId) ?? FIT_LAB_SCENES[0];
  const filter = record.kind === "filter" ? filterPreviewData(record)?.[0] : undefined;
  const reason = marketProductionFitReasonLine(evaluation);
  const sceneLabel = t(scene.ko, scene.en);

  return (
    <section
      aria-labelledby="market-fit-scene-preview-title"
      className="rounded-2xl border border-line bg-panel p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-accent">On-scene preview</p>
          <h3
            id="market-fit-scene-preview-title"
            className="mt-1 text-base font-bold text-fg"
          >
            {t("장면에 올려보기", "Preview on a scene")}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            {t(
              "결과 카드에서 고른 리소스를 실제 배경 이미지 위에 겹쳐 제작 장면과 어울리는지 먼저 확인하세요.",
              "Layer the resource picked from the results over a real background image to check it against your scene before acquiring it.",
            )}
          </p>
        </div>
        <div className="min-w-0 max-w-md text-right">
          <p className="truncate text-sm font-bold text-fg" title={record.name}>
            {record.name}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-fg-2">{evaluation.headline}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{reason.text}</p>
        </div>
      </div>

      <div
        role="img"
        aria-label={t(
          `${sceneLabel} 배경에 ${record.name} 리소스를 겹친 합성 미리보기`,
          `Composite preview of ${record.name} layered over the ${sceneLabel} background`,
        )}
        className="relative mt-4 aspect-[16/9] w-full select-none overflow-hidden rounded-xl border border-line bg-canvas"
      >
        <img
          src={scene.src}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
        {filter ? (
          <img
            data-testid="fit-scene-filter-layer"
            src={scene.src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover"
            style={{ filter: marketFilterCss(filter.values), opacity: opacity / 100 }}
          />
        ) : (
          <div
            data-testid="fit-scene-cover-layer"
            className="absolute inset-0 flex items-center justify-center"
            style={{ opacity: opacity / 100 }}
          >
            <div
              className="group relative aspect-[16/9] overflow-hidden rounded-lg shadow-lg ring-1 ring-black/25"
              style={{ width: `${scale}%` }}
            >
              <MarketResourceCover record={record} />
            </div>
          </div>
        )}
        <span className="absolute left-3 top-3 inline-flex min-h-6 items-center gap-1 rounded bg-canvas/85 px-2 text-xs font-semibold text-fg shadow-sm backdrop-blur-sm">
          <Images className="size-3" aria-hidden="true" />
          {sceneLabel}
        </span>
        <span className="numeral tnum absolute bottom-3 right-3 inline-flex min-h-6 items-center rounded bg-canvas/85 px-2 text-xs font-semibold text-fg shadow-sm backdrop-blur-sm">
          {t(`투명도 ${opacity}%`, `Opacity ${opacity}%`)}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div>
          <p id="market-fit-scene-picker-label" className="text-xs font-semibold text-fg-2">
            {t("배경 장면", "Background scene")}
          </p>
          <div
            role="group"
            aria-labelledby="market-fit-scene-picker-label"
            className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1"
          >
            {FIT_LAB_SCENES.map((candidate) => {
              const active = candidate.id === sceneId;
              const label = t(candidate.ko, candidate.en);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSceneId(candidate.id)}
                  className={cn(
                    "w-24 shrink-0 overflow-hidden rounded-lg border text-left transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                    active
                      ? "border-accent ring-1 ring-accent/60"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  <img
                    src={candidate.src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-[16/9] w-full object-cover"
                  />
                  <span
                    className={cn(
                      "block truncate px-1.5 py-1 text-[0.65rem] font-semibold",
                      active ? "bg-accent/10 text-fg" : "bg-card text-fg-2",
                    )}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid content-start gap-3">
          <div>
            <label
              htmlFor="market-fit-scene-opacity"
              className="flex items-center justify-between text-xs font-semibold text-fg-2"
            >
              {t("에셋 투명도", "Asset opacity")}
              <span className="numeral tnum text-fg-3">{opacity}%</span>
            </label>
            <input
              id="market-fit-scene-opacity"
              type="range"
              min={0}
              max={100}
              step={1}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
              aria-valuetext={t(`에셋 투명도 ${opacity}%`, `Asset opacity ${opacity}%`)}
              className="mt-1.5 h-8 w-full cursor-pointer accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:h-11"
            />
          </div>
          {filter ? null : (
            <div>
              <label
                htmlFor="market-fit-scene-scale"
                className="flex items-center justify-between text-xs font-semibold text-fg-2"
              >
                {t("레이어 크기", "Layer size")}
                <span className="numeral tnum text-fg-3">{scale}%</span>
              </label>
              <input
                id="market-fit-scene-scale"
                type="range"
                min={30}
                max={100}
                step={1}
                value={scale}
                onChange={(event) => setScale(Number(event.target.value))}
                aria-valuetext={t(`레이어 크기 ${scale}%`, `Layer size ${scale}%`)}
                className="mt-1.5 h-8 w-full cursor-pointer accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:h-11"
              />
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-fg-3">
        {filter
          ? t(
              "필터의 manifest 파라미터를 브라우저 CSS로 근사해 선택한 장면에 적용한 참고 합성입니다. 실제 Studio 렌더와 다를 수 있습니다.",
              "A reference composite that approximates the filter's manifest parameters with browser CSS on the selected scene. It may differ from the actual Studio render.",
            )
          : t(
              "마켓 표지 레이어를 실제 배경 이미지 위에 겹친 참고 합성입니다. 실제 Studio 렌더와 다를 수 있습니다.",
              "A reference composite of the marketplace cover layer over a real background image. It may differ from the actual Studio render.",
            )}
      </p>
    </section>
  );
}
