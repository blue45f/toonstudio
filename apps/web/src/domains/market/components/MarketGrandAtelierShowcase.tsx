import { ArrowRight, CheckCircle2, Sparkles, Wand2 } from "lucide-react";
import type { ReactNode } from "react";

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
    titleKo: "서울 노스탤지어 카페 & 비 오는 거리 3D",
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
    titleKo: "감정선 말풍선 & 집중선·속도선 세트",
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
    <ContainerWrapper>
      <nav
        aria-label={t("아틀리에 소재 빠른 리본", "Atelier material quick ribbon")}
        data-testid="market-atelier-ribbon"
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-panel/85 p-2.5"
      >
        <div className="flex flex-wrap items-center gap-2">
          {ATELIER_RIBBON_ITEMS.map((item, index) => (
            <Link
              key={item.id}
              href={item.href}
              className={
                index === 0
                  ? "inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent bg-accent/15 px-3 py-2 text-xs font-bold text-accent"
                  : "inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-canvas/85 px-3 py-2 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
              }
            >
              <img
                src={item.iconSrc}
                alt=""
                aria-hidden="true"
                width={24}
                height={24}
                loading="lazy"
                decoding="async"
                className="size-6 shrink-0 rounded-md object-cover"
              />
              <span>{t(item.ko, item.en)}</span>
            </Link>
          ))}
        </div>
        <Link
          href="/market/fit"
          data-testid="market-fit-lab-pill"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-good/40 bg-good/10 px-3.5 py-2 text-xs font-bold text-good transition-colors hover:border-good"
        >
          <Wand2 size={14} aria-hidden="true" />
          <span>{t("클릭 1번으로 내 원고 위 바로 테스트 (Fit Lab)", "1-Click Test on Manuscript (Fit Lab)")}</span>
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </nav>

      <section
        aria-label={t("스튜디오 기본 탑재 아틀리에 쇼케이스", "Built-in studio atelier showcase")}
        data-testid="market-grand-atelier-showcase"
        className="mt-5 rounded-2xl border border-accent/30 bg-gradient-to-br from-panel via-card to-panel p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-accent">
              <Sparkles size={13} aria-hidden="true" />
              {t("스튜디오 기본 패키지 · 바로 쓰는 추천 소재", "STUDIO CURATION · READY TO EQUIP")}
            </p>
            <h2 className="mt-1 text-base font-bold text-fg sm:text-lg">
              {t(
                "웹툰의 한 컷을 완성하는 브러시 · 3D 배경 · 캐릭터 셰이퍼 대표 소재",
                "Signature pressure brushes, 3D stages, and Character Shaper packs ready for your panel",
              )}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/market/publish"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-xs font-bold text-fg transition-colors hover:border-accent/55 hover:text-accent"
            >
              <span>{t("내 소재 공유 · 판매 등록하기", "Publish or Sell Materials")}</span>
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BUILTIN_ATELIER_PACKS.map((pack) => (
            <article
              key={pack.id}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-canvas/90 transition-colors hover:border-accent/55"
            >
              <div>
                <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-line/70 bg-panel">
                  <img
                    src={pack.artSrc}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                  />
                  <span className="absolute left-2 top-2 rounded-md border border-line/80 bg-canvas/90 px-2 py-0.5 text-[11px] font-bold text-accent backdrop-blur-sm">
                    {t(pack.badgeKo, pack.badgeEn)}
                  </span>
                </div>
                <div className="p-3.5">
                  <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-good">
                    <CheckCircle2 size={12} aria-hidden="true" />
                    <span>{t(pack.licenseKo, pack.licenseEn)}</span>
                  </p>
                  <h3 className="mt-1.5 text-sm font-bold text-fg">{t(pack.titleKo, pack.titleEn)}</h3>
                  <p className="mt-1 text-xs leading-5 text-fg-2">{t(pack.bodyKo, pack.bodyEn)}</p>
                </div>
              </div>
              <div className="px-3.5 pb-3.5">
                <Link
                  href={pack.href}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent"
                >
                  <span>{t(pack.ctaKo, pack.ctaEn)}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </ContainerWrapper>
  );
}

function ContainerWrapper({ children }: { readonly children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">{children}</div>;
}
