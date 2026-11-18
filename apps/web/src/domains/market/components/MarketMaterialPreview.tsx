import { ArrowRight, Brush, Layers3, Palette, type LucideIcon } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import "./market-atelier.css";

interface SwatchSpecimen {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly previewStyle?: string;
}

interface MaterialLens {
  readonly id: "brush" | "palette" | "asset";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly icon: LucideIcon;
  readonly imageSrc: string;
  readonly imagePosition: string;
  readonly captionKo: string;
  readonly captionEn: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly textKo: string;
  readonly textEn: string;
  readonly specKo: string;
  readonly specEn: string;
  readonly href: string;
  readonly actionKo: string;
  readonly actionEn: string;
  readonly swatches: readonly SwatchSpecimen[];
}

const MATERIALS: readonly MaterialLens[] = [
  {
    id: "brush",
    labelKo: "선과 질감",
    labelEn: "Line & texture",
    icon: Brush,
    imageSrc: "/brand/atelier-materials.webp",
    imagePosition: "50% 42%",
    captionKo: "필압 펜선 · 수채 질감",
    captionEn: "Pressure ink · wash grain",
    titleKo: "한 획에도 살아나는 작품의 성격",
    titleEn: "Character in every single stroke",
    textKo: "선화와 머리카락, 거친 먹선에 맞춘 브러시 필압과 질감을 미리 확인하고 내 컷에 고릅니다.",
    textEn: "Preview pressure response and grain for line art, hair, and expressive ink strokes.",
    specKo: "필압 · 손떨림 보정 프리셋",
    specEn: "Pressure & stabilization presets",
    href: "/market/browse?kind=brush",
    actionKo: "브러시 탐색",
    actionEn: "Browse brushes",
    swatches: [
      { id: "gpen", labelKo: "본선 G펜 1.4mm", labelEn: "Main G-Pen 1.4mm" },
      { id: "razor", labelKo: "세필 칼선 0.6mm", labelEn: "Fine Razor 0.6mm" },
      { id: "dry-ink", labelKo: "갈필 먹선 3.2mm", labelEn: "Dry Sumi 3.2mm" },
    ],
  },
  {
    id: "palette",
    labelKo: "색과 분위기",
    labelEn: "Color & mood",
    icon: Palette,
    imageSrc: "/brand/atelier-world.webp",
    imagePosition: "52% 46%",
    captionKo: "시간대 조명 · 배색 세트",
    captionEn: "Time-of-day lighting palettes",
    titleKo: "같은 장면, 다른 색의 온도",
    titleEn: "Same scene, different temperature",
    textKo: "낮·노을·심야의 공기감을 담은 배색표에서 출발해 에피소드 전체의 색 흐름을 맞춥니다.",
    textEn: "Start from daylight, dusk, and midnight palettes to keep episode color consistent.",
    specKo: "피부 · 조명 · 그림자 5단 배색",
    specEn: "5-step skin, light & shadow ramps",
    href: "/market/browse?kind=palette",
    actionKo: "팔레트 탐색",
    actionEn: "Browse palettes",
    swatches: [
      { id: "sunset", labelKo: "옥상 노을 온도", labelEn: "Rooftop dusk", previewStyle: "#e07a5f" },
      { id: "midnight", labelKo: "심야 골목 네온", labelEn: "Midnight alley", previewStyle: "#3d5a80" },
      { id: "morning", labelKo: "교실 아침 채광", labelEn: "Morning classroom", previewStyle: "#f2cc8f" },
    ],
  },
  {
    id: "asset",
    labelKo: "장면과 소재",
    labelEn: "Scene & props",
    icon: Layers3,
    imageSrc: "/assets/studio/cc0-20260906/assets/polyhaven-background-wooden-lounge/background.webp",
    imagePosition: "50% 50%",
    captionKo: "실내외 배경 · 소품 · 말풍선",
    captionEn: "Stages, props & speech balloons",
    titleKo: "이야기를 채우는 공간과 소품",
    titleEn: "Spaces and props that ground the cut",
    textKo: "반복해서 등장하는 방·학교·거리 배경과 말풍선 소재를 얹어 원고 마감 속도를 높입니다.",
    textEn: "Place recurring rooms, streets, props, and balloons to keep manuscript pacing steady.",
    specKo: "2D·3D 배경 · 벡터 말풍선",
    specEn: "2D/3D stages & vector balloons",
    href: "/market/browse?kind=asset",
    actionKo: "장면 소재 탐색",
    actionEn: "Browse scene assets",
    swatches: [
      { id: "room", labelKo: "실내 배경 세트", labelEn: "Interior stage" },
      { id: "balloon", labelKo: "감정선 말풍선", labelEn: "Dialogue balloons" },
      { id: "tone", labelKo: "마감 스크린톤", labelEn: "Finish screentone" },
    ],
  },
] as const;

export function MarketMaterialPreview() {
  const t = useBilingual("MarketMaterialPreview");
  const [selected, setSelected] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [wipeTick, setWipeTick] = useState(0);
  const [activeSwatchIndex, setActiveSwatchIndex] = useState(0);
  const deskRef = useRef<HTMLElement | null>(null);

  const material = MATERIALS[selected] ?? MATERIALS[0];
  const prevMaterial = previous !== null ? MATERIALS[previous] ?? null : null;

  const selectLens = (index: number) => {
    if (index === selected) return;
    setPrevious(selected);
    setSelected(index);
    setActiveSwatchIndex(0);
    setWipeTick((count) => count + 1);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const node = deskRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--tilt-rx", `${(-ny * 4.2).toFixed(2)}deg`);
    node.style.setProperty("--tilt-ry", `${(nx * 5.2).toFixed(2)}deg`);
  };

  const handlePointerLeave = () => {
    const node = deskRef.current;
    if (!node) return;
    node.style.setProperty("--tilt-rx", "0deg");
    node.style.setProperty("--tilt-ry", "0deg");
  };

  return (
    <figure
      ref={deskRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="market-material-preview ink-stage-tilt ink-frame"
    >
      <div className="market-material-header">
        <div
          className="market-material-tabs"
          role="group"
          aria-label={t("작업에 필요한 재료 선택", "Choose material lens")}
        >
          {MATERIALS.map((item, index) => {
            const Icon = item.icon;
            const isSelected = selected === index;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => selectLens(index)}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{t(item.labelKo, item.labelEn)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="market-material-image ink-sheen">
        {prevMaterial ? (
          <img
            src={prevMaterial.imageSrc}
            alt=""
            aria-hidden="true"
            className="market-material-layer market-material-layer--base"
            style={{ objectPosition: prevMaterial.imagePosition }}
          />
        ) : null}
        <img
          key={`${material.id}-${wipeTick}`}
          src={material.imageSrc}
          alt=""
          className={
            wipeTick > 0
              ? "market-material-layer market-material-layer--wipe"
              : "market-material-layer"
          }
          style={{ objectPosition: material.imagePosition }}
        />

        {material.id === "brush" ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 240 68"
            className="market-material-specimen"
          >
            <path
              d="M16 48 C 62 14, 114 58, 168 26 S 212 34, 226 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={activeSwatchIndex === 0 ? "3.5" : activeSwatchIndex === 1 ? "1.8" : "5.2"}
              strokeLinecap="round"
            />
          </svg>
        ) : null}

        <span className="market-material-caption">
          <span className="market-material-dot" aria-hidden="true" />
          {t(material.captionKo, material.captionEn)}
        </span>
      </div>

      <figcaption>
        <div
          className="market-material-swatches"
          role="group"
          aria-label={t("세부 견본 선택", "Select material swatch")}
        >
          {material.swatches.map((swatch, index) => {
            const active = activeSwatchIndex === index;
            return (
              <button
                key={swatch.id}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveSwatchIndex(index)}
                className="market-material-swatch"
              >
                {swatch.previewStyle ? (
                  <span
                    aria-hidden="true"
                    className="market-material-swatch__chip"
                    style={{ backgroundColor: swatch.previewStyle }}
                  />
                ) : (
                  <span aria-hidden="true" className="market-material-swatch__dot" />
                )}
                <span>{t(swatch.labelKo, swatch.labelEn)}</span>
              </button>
            );
          })}
        </div>

        <div className="market-material-description" aria-live="polite">
          <p className="market-material-title">{t(material.titleKo, material.titleEn)}</p>
          <p className="market-material-copy">{t(material.textKo, material.textEn)}</p>
        </div>

        <div className="market-material-bottom">
          <span>{t(material.specKo, material.specEn)}</span>
          <Link href={material.href} className="ink-arrow">
            <span>{t(material.actionKo, material.actionEn)}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </figcaption>
    </figure>
  );
}
