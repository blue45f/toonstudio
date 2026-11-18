import { ArrowRight, CheckCircle2, ChevronDown, Wand2 } from "lucide-react";

import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const ATELIER_RIBBON_ITEMS = [
  {
    id: "market-home",
    href: "/market",
    iconSrc: "/brand/luminous-atelier-20261114/icon-nav-asset-market.webp",
    ko: "통합 소재 마켓 홈",
    en: "Curated Market Hub",
  },
  {
    id: "wgsl-brush",
    href: "/studio/assets/brushes/new",
    iconSrc: "/brand/luminous-atelier-20261114/icon-studio-pen-ink.webp",
    ko: "펜·브러시 · 톤",
    en: "Pens, Brushes & Tones",
  },
  {
    id: "bg3d-stage",
    href: "/studio/bg3d",
    iconSrc: "/brand/toonstudio-premium-icons/background.webp",
    ko: "3D 배경 · LT 선화",
    en: "3D Stage · LT Lines",
  },
  {
    id: "character-shaper",
    href: "/studio/assets/characters/new",
    iconSrc: "/brand/luminous-atelier-20261114/icon-studio-3d-pose.webp",
    ko: "3D 캐릭터 셰이퍼",
    en: "3D Character Shaper",
  },
  {
    id: "seller-license",
    href: "/market/seller",
    iconSrc: "/brand/toonstudio-premium-icons/materials.webp",
    ko: "판매자 · 사용권 센터",
    en: "Seller & License Center",
  },
] as const;

const BUILTIN_ATELIER_PACKS = [
  {
    id: "master-gpen-pack",
    href: "/studio/brushes",
    artSrc: "/brand/luminous-atelier-20261114/scene-brush-lab-master-atelier.webp",
    badgeKo: "필압 브러시 · 무료 기본",
    badgeEn: "Pressure Brush · Built-in Free",
    licenseKo: "상업 연재 가능 · No-AI",
    licenseEn: "Commercial OK · No-AI",
    titleKo: "마스터 G펜 · 필압 칼선 24종 팩",
    titleEn: "Master G-Pen & Razor Ink 24-Pack",
    bodyKo: "이중 질감 필압 · 손떨림 보정 프리셋 내장",
    bodyEn: "Dual-texture ink pens with stabilization presets",
    ctaKo: "브러시 보관함 장착",
    ctaEn: "Equip in Brushes",
  },
  {
    id: "seoul-cafe-3d",
    href: "/studio/bg3d",
    artSrc: "/brand/lobby-hq-20261003/background-city-768.webp",
    badgeKo: "3D 공간 · LT 선화 추출",
    badgeEn: "3D Stage · LT Line Extract",
    licenseKo: "팀 공유 허용 · CC0 호환",
    licenseEn: "Team Share · CC0 Ready",
    titleKo: "서울 노스탤지어 카페 · 비 오는 거리 3D",
    titleEn: "Seoul Nostalgia Cafe & Rainy Street 3D",
    bodyKo: "낮·노을·심야 조명 프리셋 및 문·소품 가동 지원",
    bodyEn: "Day, sunset & midnight lighting presets with articulated props",
    ctaKo: "3D 세트 열기",
    ctaEn: "Open 3D Stage",
  },
  {
    id: "webtoon-protagonist-shaper",
    href: "/studio/assets/characters/new",
    artSrc: "/brand/luminous-atelier-20261114/scene-character-lab-shaper-showcase.webp",
    badgeKo: "캐릭터 셰이퍼 · 16종 아키타입",
    badgeEn: "Character Shaper · 16 Archetypes",
    licenseKo: "상업 연재 가능 · 포즈 20종",
    licenseEn: "Commercial OK · 20 Poses",
    titleKo: "웹툰 주인공 등신대 · 로판/액션 포즈 팩",
    titleEn: "Webtoon Hero Proportions & Action Poses",
    bodyKo: "8.5등신 실루엣부터 시선·손발 IK 포징 즉시 투입",
    bodyEn: "8.5-head silhouettes with hand, foot, and gaze IK controls",
    ctaKo: "셰이퍼로 열기",
    ctaEn: "Open in Shaper",
  },
  {
    id: "balloon-sfx-vector",
    href: "/studio/comic",
    artSrc: "/brand/luminous-atelier-20261114/scene-studio-canvas-aura.webp",
    badgeKo: "벡터 말풍선 · 집중선",
    badgeEn: "Vector Balloons · Speed Lines",
    licenseKo: "비파괴 편집 · No-AI 검증",
    licenseEn: "Non-destructive · No-AI",
    titleKo: "감정선 말풍선 · 집중선·속도선 세트",
    titleEn: "Emotion Speech Balloons & Speed Lines",
    bodyKo: "외곽선 두께·꼬리 각도 실시간 조절 벡터 소재",
    bodyEn: "Live-editable stroke width and tail direction vector set",
    ctaKo: "캔버스에 담기",
    ctaEn: "Use on Canvas",
  },
] as const;

export function MarketGrandAtelierShowcase() {
  const t = useBilingual("MarketHomePage");

  return (
    <Container size="wide" className="pb-10">
      <details
        data-testid="market-grand-atelier-showcase"
        className="group rounded-[14px] border border-line bg-panel px-4 py-1 open:pb-4"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 [word-break:keep-all]">
            {t("스튜디오 기본 추천 소재 · 작업실 바로가기", "Built-in Studio starter packs & tools")}
            <span className="ml-2 text-xs font-normal text-fg-3">
              {t("브러시 · 3D 배경 · 캐릭터 셰이퍼 · 원고 시험", "Brushes · 3D stages · Character Shaper · Fit Lab")}
            </span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>

        <div className="mt-2 space-y-4 border-t border-line/70 pt-3.5">
          <nav
            aria-label={t("아틀리에 소재 빠른 리본", "Atelier material quick ribbon")}
            data-testid="market-atelier-ribbon"
            className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-card p-2"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {ATELIER_RIBBON_ITEMS.map((item, index) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={
                    index === 0
                      ? "inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-accent/60 bg-accent-soft px-3 py-1.5 text-xs font-medium text-fg"
                      : "inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line bg-panel px-3 py-1.5 text-xs font-normal text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                  }
                >
                  <img
                    src={item.iconSrc}
                    alt=""
                    aria-hidden="true"
                    width={20}
                    height={20}
                    loading="lazy"
                    decoding="async"
                    className="size-5 shrink-0 rounded-[5px] object-cover"
                  />
                  <span>{t(item.ko, item.en)}</span>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href="/market/fit"
                data-testid="market-fit-lab-pill"
                className="ink-arrow inline-flex min-h-11 items-center gap-1.5 rounded-[8px] border border-line bg-panel px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
              >
                <Wand2 size={14} aria-hidden="true" />
                <span>{t("내 원고 위 바로 시험 (Fit Lab)", "Test on Manuscript (Fit Lab)")}</span>
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
              <Link
                href="/market/publish"
                className="ink-arrow inline-flex min-h-11 items-center gap-1.5 rounded-[8px] border border-line bg-panel px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
              >
                <span>{t("내 소재 공유 · 판매 등록하기", "Publish or Sell Materials")}</span>
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </nav>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {BUILTIN_ATELIER_PACKS.map((pack) => (
              <article
                key={pack.id}
                className="ink-frame group/pack flex flex-col justify-between overflow-hidden rounded-[12px] border border-line bg-card transition-colors hover:border-line-strong"
              >
                <div>
                  <div className="ink-cover ink-sheen relative aspect-[16/10] w-full overflow-hidden border-b border-line bg-panel">
                    <img
                      src={pack.artSrc}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                    <span className="absolute left-2 top-2 z-[3] rounded-[6px] border border-line bg-canvas/90 px-2 py-0.5 text-xs font-medium text-fg-2">
                      {t(pack.badgeKo, pack.badgeEn)}
                    </span>
                  </div>
                  <div className="p-3.5">
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-3">
                      <span className="size-1.5 rounded-full bg-good" aria-hidden="true" />
                      <CheckCircle2 size={12} aria-hidden="true" />
                      <span>{t(pack.licenseKo, pack.licenseEn)}</span>
                    </p>
                    <h3 className="mt-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
                      {t(pack.titleKo, pack.titleEn)}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-fg-2 [word-break:keep-all]">
                      {t(pack.bodyKo, pack.bodyEn)}
                    </p>
                  </div>
                </div>
                <div className="px-3.5 pb-3.5">
                  <Link
                    href={pack.href}
                    className="ink-arrow inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[8px] border border-line bg-panel px-3 py-2 text-xs font-medium text-fg transition-colors hover:border-accent hover:text-accent"
                  >
                    <span>{t(pack.ctaKo, pack.ctaEn)}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </details>
    </Container>
  );
}
