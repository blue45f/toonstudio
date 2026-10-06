import { useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

import { SpectacleBackdrop } from "./SpectacleBackdrop";
import { SpectacleBarChart } from "./SpectacleBarChart";
import { SpectacleArt } from "./SpectacleArt";
import { SpectacleCountUp } from "./SpectacleCountUp";
import { SpectacleEmptyState } from "./SpectacleEmptyState";
import { SpectacleGlowButton } from "./SpectacleGlowButton";
import { SpectacleHero } from "./SpectacleHero";
import { SpectaclePageTransition } from "./SpectaclePageTransition";
import { SpectacleProgressRing } from "./SpectacleProgressRing";
import { SpectacleReveal } from "./SpectacleReveal";
import { SpectacleSkeleton } from "./SpectacleSkeleton";
import { SpectacleTiltCard } from "./SpectacleTiltCard";
import { SpectacleTypewriter } from "./SpectacleTypewriter";
import { useSpectacle } from "./useSpectacle";
import { useSpectacleCelebration } from "./useSpectacleCelebration";
import { getSpectacleLabels } from "./spectacle-labels";

import "./spectacle-effects.css";

function ShowcaseSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-10">
      <h2 className="mb-4 text-xl font-bold text-fg">{title}</h2>
      <div className="rounded-2xl border border-line bg-card/70 p-6 shadow-sm backdrop-blur">
        {children}
      </div>
    </section>
  );
}

/**
 * 스펙터클 연출 쇼케이스 (데모 페이지).
 *
 * 라우트 연결은 상위에서: 예) /spectacle-showcase → <SpectacleShowcase />
 * 모든 연출을 한 화면에서 확인·상호작용할 수 있다.
 */
export function SpectacleShowcase() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const labels = getSpectacleLabels(lang);
  const { level } = useSpectacle();
  const { celebrate, fireworks } = useSpectacleCelebration();
  const [skeletonLoading, setSkeletonLoading] = useState(true);
  const [pageKey, setPageKey] = useState("a");

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <SpectacleHero className="px-6 py-20 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">
          {ko ? "스펙터클 쇼케이스" : "Spectacle Showcase"}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold md:text-6xl">
          <SpectacleTypewriter
            lines={
              ko
                ? ["와, 소리 나는 연출", "사이트 곳곳의 작은 마법", "성능은 지키면서"]
                : ["Visual wow moments", "Little magic everywhere", "Without hurting performance"]
            }
          />
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-fg-2">
          {ko
            ? `현재 스펙터클 수준: ${level} — 설정에서 연출 강도를 바꿔보세요.`
            : `Current spectacle level: ${level} — try changing the intensity in settings.`}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          {/* 핵심 액션 1개만 강조 — 나머지는 격하 */}
          <button
            type="button"
            onClick={() => celebrate()}
            className="spectacle-pop-in rounded-full bg-accent px-8 py-3.5 text-base font-bold text-on-accent shadow-xl shadow-accent/30 transition hover:bg-accent-2 hover:shadow-accent-2/40 active:scale-95"
          >
            🎉 {labels.celebrate}
          </button>
          <button
            type="button"
            onClick={() => fireworks()}
            className="text-sm font-medium text-fg-3 underline-offset-4 transition hover:text-fg hover:underline"
          >
            {ko ? "폭죽으로 축하하기" : "Celebrate with fireworks"}
          </button>
        </div>
      </SpectacleHero>

      <ShowcaseSection title={ko ? "스크롤 리빌" : "Scroll Reveal"}>
        <SpectacleReveal stagger={90}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="mb-3 rounded-xl bg-accent-soft p-4 text-sm font-medium"
            >
              {ko
                ? `스크롤하면 순차 등장하는 블록 ${i + 1}`
                : `Block ${i + 1} appearing in sequence on scroll`}
            </div>
          ))}
        </SpectacleReveal>
      </ShowcaseSection>

      <ShowcaseSection title={ko ? "페이지 전환" : "Page Transition"}>
        <button
          type="button"
          onClick={() => setPageKey((k) => (k === "a" ? "b" : "a"))}
          className="mb-4 rounded-full border border-line px-4 py-2 text-sm font-medium"
        >
          {ko ? "페이지 전환" : "Switch page"}
        </button>
        <SpectaclePageTransition transitionKey={pageKey}>
          <div className="rounded-2xl bg-gradient-to-br from-accent/15 to-warn/15 p-6">
            <p className="font-semibold">
              {pageKey === "a"
                ? ko
                  ? "페이지 A — 버튼을 눌러보세요"
                  : "Page A — press the button"
                : ko
                  ? "페이지 B — 페이드+블러로 전환됐어요"
                  : "Page B — transitioned with fade + blur"}
            </p>
          </div>
        </SpectaclePageTransition>
      </ShowcaseSection>

      <ShowcaseSection title={ko ? "글로우 버튼" : "Glow Buttons"}>
        <div className="flex flex-wrap gap-3">
          <SpectacleGlowButton
            onClick={() => celebrate({ count: 40 })}
            className="bg-accent px-6 py-3 font-semibold text-on-accent shadow-lg"
          >
            ✨ {ko ? "마우스를 올려보세요" : "Hover me"}
          </SpectacleGlowButton>
          <SpectacleGlowButton
            glowColor="rgba(236, 72, 153, 0.55)"
            // eslint-disable-next-line shadcn/no-raw-colors -- 글로우 연출 데모의 핑크 샘플 버튼: 색 자체가 데모 콘텐츠라 토큰으로 바꾸면 시연 의미가 달라진다. 예외 원장: docs/SHADCN_RAW_COLORS_EXCEPTIONS.md
            className="bg-pink-600 px-6 py-3 font-semibold text-white shadow-lg"
          >
            💖 {ko ? "핑크 글로우" : "Pink glow"}
          </SpectacleGlowButton>
        </div>
      </ShowcaseSection>

      <ShowcaseSection title={ko ? "막대 차트" : "Bar Chart"}>
        <SpectacleBarChart
          data={[
            { label: ko ? "월" : "Mon", value: 42 },
            { label: ko ? "화" : "Tue", value: 68 },
            { label: ko ? "수" : "Wed", value: 55 },
            { label: ko ? "목" : "Thu", value: 91 },
            { label: ko ? "금" : "Fri", value: 76 },
          ]}
        />
      </ShowcaseSection>

      <ShowcaseSection title={ko ? "숫자 · 프로그레스" : "Numbers · Progress"}>
        <div className="flex flex-wrap items-center gap-10">
          <div className="text-center">
            <SpectacleCountUp value={128400} className="text-4xl font-extrabold text-accent" />
            <p className="mt-1 text-sm text-fg-3">{ko ? "누적 창작자" : "Total creators"}</p>
          </div>
          <div className="text-center">
            <SpectacleCountUp value={98.6} decimals={1} className="text-4xl font-extrabold text-good" />
            <p className="mt-1 text-sm text-fg-3">{ko ? "만족도 %" : "Satisfaction %"}</p>
          </div>
          <SpectacleProgressRing value={0.72} label={ko ? "진행률" : "Progress"} />
          <SpectacleProgressRing value={0.35} size={72} strokeWidth={8} />
        </div>
      </ShowcaseSection>

      <ShowcaseSection title={ko ? "3D 틸트 카드" : "3D Tilt Cards"}>
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              { art: "celebration", title: ko ? "틸트" : "Tilt", desc: ko ? "마우스를 올려보세요" : "Hover to tilt", color: "text-cool" },
              { art: "magic", title: ko ? "광택" : "Glare", desc: ko ? "빛 반사가 스칩니다" : "A light glare sweeps", color: "text-accent" },
              { art: "growth", title: ko ? "복귀" : "Return", desc: ko ? "떼면 제자리로" : "Eases back on leave", color: "text-good" },
            ] as const
          ).map((card) => (
            <SpectacleTiltCard
              key={card.title}
              className="rounded-2xl border border-line bg-gradient-to-br from-accent/10 to-warn/10 p-6"
            >
              <SpectacleArt kind={card.art} className={card.color} />
              <p className="mt-2 text-lg font-bold">{card.title}</p>
              <p className="mt-1 text-sm text-fg-3">{card.desc}</p>
            </SpectacleTiltCard>
          ))}
        </div>
      </ShowcaseSection>

      <ShowcaseSection title={ko ? "스켈레톤 모핑" : "Skeleton Morph"}>
        <button
          type="button"
          onClick={() => setSkeletonLoading((v) => !v)}
          className="mb-4 rounded-full border border-line px-4 py-2 text-sm font-medium"
        >
          {skeletonLoading ? (ko ? "콘텐츠 표시" : "Show content") : ko ? "로딩으로" : "Show skeleton"}
        </button>
        <SpectacleSkeleton
          loading={skeletonLoading}
          skeletonClassName="h-24 w-full"
          label={labels.loading}
          className="w-full"
        >
          <div className="rounded-2xl bg-good-soft p-6">
            <p className="font-semibold">{ko ? "짜잔! 콘텐츠가 나타났어요" : "Ta-da! Content appeared"}</p>
            <p className="mt-1 text-sm text-fg-3">
              {ko ? "블러·스케일·페이드로 부드럽게 모핑됩니다" : "Morphs in with blur, scale, and fade"}
            </p>
          </div>
        </SpectacleSkeleton>
      </ShowcaseSection>

      <ShowcaseSection title={ko ? "빈 상태 일러스트" : "Empty Illustrations"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SpectacleEmptyState kind="empty" />
          <SpectacleEmptyState kind="success" />
        </div>
      </ShowcaseSection>

      <SpectacleBackdrop variants={["aurora", "beams", "noise"]} className="py-16 text-center">
        <h2 className="text-2xl font-extrabold">{ko ? "배경 연출" : "Backdrop FX"}</h2>
        <p className="mt-2 text-fg-2">
          {ko ? "오로라 + 빛줄기 + 노이즈 레이어" : "Aurora + light beams + grain layers"}
        </p>
      </SpectacleBackdrop>

      <SpectacleBackdrop variants={["grid"]} className="border-t border-line py-10 text-center">
        <p className="text-sm text-fg-3">
          {ko
            ? "이 페이지는 데모용입니다. 라우트에 연결해 사용하세요."
            : "This is a demo page. Wire it to a route to use it."}
        </p>
      </SpectacleBackdrop>
    </div>
  );
}
