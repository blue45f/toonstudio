import { Layers, Lightbulb, Sliders } from "lucide-react";

import type { CreatorMarketplaceResourceKind } from "@/shared/lib/creator-marketplace-resource-contract";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface MarketDetailUsageGuideProps {
  readonly kind: CreatorMarketplaceResourceKind;
}

/**
 * 리소스 종류별 웹툰 실전 활용 팁 & 추천 Studio 설정 패널.
 * 주의: `3d-preset`의 경우 "3D ... 삽입" 문구를 쓰지 않는 테스트 불변식을 준수한다.
 */
export function MarketDetailUsageGuide({ kind }: MarketDetailUsageGuideProps) {
  const t = useBilingual("MarketDetailUsageGuide");

  const tips =
    kind === "3d-asset"
      ? [
          {
            icon: Sliders,
            tone: "text-accent",
            title: t("3D 카메라 & 구도 잡기", "3D camera & framing"),
            body: t(
              "Three.js 뷰포트에서 마우스 회전과 줌으로 하이앵글·로우앵글 투시도를 빠르게 맞출 수 있습니다.",
              "Orbit and zoom in the Three.js viewport to dial in high-angle or low-angle perspective shots.",
            ),
          },
          {
            icon: Layers,
            tone: "text-cool",
            title: t("선화(Line) 추출 가이드", "Line extraction tip"),
            body: t(
              "외곽선 잉크 두께를 1.5~2.0px로 맞추면 일반 G펜 브러시 펜선과 자연스럽게 어울립니다.",
              "Set outline ink thickness around 1.5–2.0px to blend cleanly with G-pen linework.",
            ),
          },
        ]
      : kind === "3d-preset"
        ? [
            {
              icon: Sliders,
              tone: "text-accent",
              title: t("배경 조명 & 엠비언트 매칭", "Lighting & ambient matching"),
              body: t(
                "스토리 시간대에 맞춰 주간/노을/야간 조명을 고른 뒤 Studio 컬러 필터와 결합해 무드를 통일하세요.",
                "Pick day, sunset, or night lighting to match the scene time, then pair with Studio color filters.",
              ),
            },
            {
              icon: Layers,
              tone: "text-cool",
              title: t("소점 및 컷 스냅", "Vanishing point & panel snap"),
              body: t(
                "씬의 소점 가이드를 컷 박스에 맞추어 인물과 배경 사이의 투시 왜곡을 방지합니다.",
                "Align scene vanishing-point guides to your panel frame to avoid perspective mismatch.",
              ),
            },
          ]
        : kind === "brush"
          ? [
              {
                icon: Sliders,
                tone: "text-accent",
                title: t("추천 필압 및 손떨림 보정", "Recommended pressure & stabilization"),
                body: t(
                  "선화 작업 시 추천 브러시 크기는 8~14px이며 손떨림 보정 15 내외에서 깔끔한 펜선이 나옵니다.",
                  "Use 8–14px brush size with stabilization around 15 for crisp comic lineart.",
                ),
              },
              {
                icon: Layers,
                tone: "text-cool",
                title: t("레이어 블렌딩 모드", "Layer blending mode"),
                body: t(
                  "음영 채색 시 곱하기(Multiply) 모드에 불투명도 70~80%를 적용하면 자연스러운 입체감을 얻습니다.",
                  "Apply Multiply blending at 70–80% opacity for smooth cel-shaded depth.",
                ),
              },
            ]
          : kind === "palette"
            ? [
                {
                  icon: Sliders,
                  tone: "text-accent",
                  title: t("배색 황금비율 적용", "60-30-10 color balance"),
                  body: t(
                    "주조색 60%, 보조색 30%, 강조색 10% 비율로 배색하면 안정된 컷 톤 밸런스가 완성됩니다.",
                    "Balance 60% base, 30% secondary, and 10% accent colors for cohesive panels.",
                  ),
                },
                {
                  icon: Layers,
                  tone: "text-cool",
                  title: t("Studio 스와치 등록", "Studio swatch registration"),
                  body: t(
                    "설치 후 스튜디오 컬러 피커 팔레트 목록에서 스포이드 없이 바로 색상을 선택할 수 있습니다.",
                    "Once installed, pick colors directly from the Studio color picker swatch list.",
                  ),
                },
              ]
            : [
                {
                  icon: Sliders,
                  tone: "text-accent",
                  title: t("Studio 원터치 핸드오프", "Studio handoff"),
                  body: t(
                    "스튜디오 작업실로 연결하면 해당 종류의 적용 정책에 맞춰 바로 불러올 수 있습니다.",
                    "Open in Studio to apply according to this package kind's workflow policy.",
                  ),
                },
                {
                  icon: Layers,
                  tone: "text-cool",
                  title: t("세로 스크롤 원고 호환", "Vertical scroll manuscript ready"),
                  body: t(
                    "세로 스크롤 웹툰 컷 규격(720px~1080px 너비)에서 레이어 편집이 용이하도록 구성되어 있습니다.",
                    "Structured for clean layer editing across standard 720px–1080px vertical webtoon cuts.",
                  ),
                },
              ];

  return (
    <section
      aria-labelledby="market-usage-guide-heading"
      className="rounded-xl border border-line bg-card p-5"
    >
      <h2
        id="market-usage-guide-heading"
        className="flex items-center gap-2 text-sm font-bold text-fg"
      >
        <Lightbulb className="h-4 w-4 text-accent" aria-hidden="true" />
        {t("프로 작가 소재 활용 팁 & 추천 설정", "Artist usage tips & recommended settings")}
      </h2>
      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        {tips.map((tip) => {
          const Icon = tip.icon;
          return (
            <div
              key={tip.title}
              className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-panel/50 p-3"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tip.tone}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-fg">{tip.title}</p>
                <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">{tip.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
