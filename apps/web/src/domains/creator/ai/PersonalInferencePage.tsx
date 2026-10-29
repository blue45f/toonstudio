import { ChevronDown, Cpu, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useUnifiedAiAuxSettings } from "@/shared/ai/unified-ai-settings";
import { Container } from "@/shared/components/section";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { AiCreativeDirectorPanel } from "./AiCreativeDirectorPanel";
import { AiStudioPageHeader, AiStudioSurfaceCards } from "./AiStudioSurfaceNav";
import { PersonalRuntimeWorkspace } from "./PersonalRuntimeWorkspace";
import { AI_DIRECTOR_ANCHOR, AI_RUNTIME_ANCHOR } from "./ai-studio-hub";
import { useHashAnchorScroll } from "./useHashAnchorScroll";

const GENERATION_SETTINGS_ANCHOR = "ai-generation-settings";
const HUB_ANCHORS: readonly string[] = [AI_DIRECTOR_ANCHOR, "ai-stage-workbench", "ai-tools", AI_RUNTIME_ANCHOR, GENERATION_SETTINGS_ANCHOR];
/** 이 해시로 들어오면 접어 둔 "내 AI 런타임"을 먼저 펼친다(접힌 안쪽은 화면에 없어 스크롤할 곳이 없다). */
const RUNTIME_HASHES: readonly string[] = [`#${AI_RUNTIME_ANCHOR}`, `#${GENERATION_SETTINGS_ANCHOR}`];

type AiStageCategory = "all" | "story" | "art" | "spatial" | "review";

interface AiStageAssistantCard {
  readonly id: string;
  readonly category: Exclude<AiStageCategory, "all">;
  readonly badge: { readonly ko: string; readonly en: string };
  readonly title: { readonly ko: string; readonly en: string };
  readonly description: { readonly ko: string; readonly en: string };
  readonly image: string;
  readonly href: string;
  readonly cta: { readonly ko: string; readonly en: string };
}

const AI_STAGE_CATEGORIES: readonly { readonly id: AiStageCategory; readonly label: { readonly ko: string; readonly en: string } }[] = [
  { id: "all", label: { ko: "전체 공정 (6)", en: "All stages (6)" } },
  { id: "story", label: { ko: "기획 · 콘티", en: "Story & Storyboard" } },
  { id: "art", label: { ko: "선화 · 채색 보조", en: "Inking & Color Assist" } },
  { id: "spatial", label: { ko: "3D · 구도 변환", en: "3D & Camera Staging" } },
  { id: "review", label: { ko: "검수 · 예고편", en: "QA & Promo Reel" } },
];

const AI_STAGE_CARDS: readonly AiStageAssistantCard[] = [
  {
    id: "story-arc",
    category: "story",
    badge: { ko: "STEP 1 · 서사 설계", en: "STEP 1 · Story Design" },
    title: { ko: "로그라인 · 인물 관계도 · 회차 비트 보조", en: "Logline, Character Arc & Beat Sheet Assist" },
    description: {
      ko: "원작 소설이나 기획 메모에서 회차별 클리프행어와 대사 호흡을 정리해 스토리랩 보드로 바로 넘깁니다.",
      en: "Turns story notes or novel chapters into episodic cliffhangers and dialogue pacing for Story Lab.",
    },
    image: "/assets/site-experience/site-art-v1/cards/nb-planning-storylab-640.webp",
    href: "/story-lab",
    cta: { ko: "스토리랩에서 열기", en: "Open in Story Lab" },
  },
  {
    id: "scroll-pacing",
    category: "story",
    badge: { ko: "STEP 2 · 세로 스크롤 연출", en: "STEP 2 · Scroll Pacing" },
    title: { ko: "모바일 시선 유도 · 컷 간격 · 말풍선 배치 보조", en: "Mobile Eye-Flow, Cut Spacing & Balloon Assist" },
    description: {
      ko: "대사가 몰리는 구간을 감지하고 감정 고조 컷 직전 여백과 말풍선 읽기 순서를 제안합니다.",
      en: "Detects dialogue-heavy zones and suggests scroll whitespace and balloon reading order before climax cuts.",
    },
    image: "/assets/site-experience/site-art-v1/cards/nb-workflow-bridge-640.webp",
    href: "/studio?lane=blank",
    cta: { ko: "콘티 캔버스 열기", en: "Open Storyboard Canvas" },
  },
  {
    id: "cel-color",
    category: "art",
    badge: { ko: "STEP 3 · 작화 · 채색", en: "STEP 3 · Line & Cel Color" },
    title: { ko: "선화 틈새 보정 · 밑색 채우기 · 조명 림라이트 보조", en: "Gap-Closed Flats, Cel Shading & Rim-Light Assist" },
    description: {
      ko: "캐릭터 파츠별 컬러 팔레트를 유지하면서 닫히지 않은 선화 틈을 보정해 밑색과 그림자 레이어를 분리합니다.",
      en: "Preserves character color sheets while sealing line gaps and separating flat colors from shadow layers.",
    },
    image: "/assets/site-experience/site-art-v1/cards/nb-create-canvas-640.webp",
    href: "/studio",
    cta: { ko: "작화 스튜디오 열기", en: "Open Drawing Studio" },
  },
  {
    id: "spatial-2d",
    category: "spatial",
    badge: { ko: "STEP 4 · 3D 공간 · 2D 변환", en: "STEP 4 · 3D Stage to 2D" },
    title: { ko: "3D 배경 · 캐릭터 구도 캡처 및 만화풍 2D 변환", en: "3D Stage Capture & Comic 2D Style Conversion" },
    description: {
      ko: "복잡한 실내·거리 3D 세트의 카메라 화각과 역광을 맞춘 뒤 웹툰 선화·음영 톤으로 자연스럽게 변환합니다.",
      en: "Matches lens FOV and rim lighting on 3D stages, then converts captures into webtoon line and cel tones.",
    },
    image: "/assets/site-experience/site-art-v1/cards/nb-spatial-stage-640.webp",
    href: "/studio/generate",
    cta: { ko: "생성 실험실 열기", en: "Open Generative Lab" },
  },
  {
    id: "asset-match",
    category: "spatial",
    badge: { ko: "STEP 5 · 소재 톤 매칭", en: "STEP 5 · Asset Tone Match" },
    title: { ko: "배경 · 브러시 · 식자 소재 작품 톤 자동 매칭", en: "Background, Brush & SFX Tone Matching" },
    description: {
      ko: "내 원고의 선 굵기·채도·시대 배경에 어울리는 3D 소품과 효과음 세트를 추천하고 라이선스를 검증합니다.",
      en: "Recommends 3D props and SFX sets that match your manuscript's line weight and palette with license checks.",
    },
    image: "/assets/site-experience/site-art-v1/cards/nb-market-atelier-640.webp",
    href: "/market",
    cta: { ko: "소재 아틀리에 열기", en: "Open Asset Atelier" },
  },
  {
    id: "qa-promo",
    category: "review",
    badge: { ko: "STEP 6 · 마감 검수 · 예고편", en: "STEP 6 · Preflight & Promo" },
    title: { ko: "누락 채색 · 오탈자 검수 및 무빙툰 예고편 제작", en: "Preflight Diff Check & Moving-Toon Promo Reel" },
    description: {
      ko: "연재 업로드 전 레이어 누락·해상도·식자 가독성을 점검하고 핵심 컷으로 숏폼 홍보 영상을 조합합니다.",
      en: "Checks uncolored gaps, resolution, and lettering legibility before upload, and builds short promo reels.",
    },
    image: "/assets/site-experience/site-art-v1/cards/nb-production-control-640.webp",
    href: "/studio/ops",
    cta: { ko: "프로덕션 관제 열기", en: "Open Production Ops" },
  },
];

/**
 * `/studio/ai-lab` — AI 창작 허브.
 * 1) Luna 제안 목록으로 시작하고, 2) AI 화면별 비용·키·데이터 조건을 한눈에 비교한 뒤,
 * 3) 필요하면 내 Creator Runtime으로 영상·3D 변환을 이어간다. 3)은 고급 기능이라
 *    런타임을 이미 연결했거나 해시로 찾아온 경우에만 펼쳐 두어, 처음 오는 사람의 페이지를 길게 만들지 않는다.
 */
export function PersonalInferencePage() {
  const bt = useBilingual("PersonalInferencePage");
  useDocumentTitle(bt("AI 크리에이티브 디렉터 · ToonStudio", "AI creative director · ToonStudio"));
  useHashAnchorScroll(HUB_ANCHORS);

  const { hash } = useLocation();
  const aux = useUnifiedAiAuxSettings();
  const runtimeConnected = Boolean(aux.settings.creatorRuntimeBaseUrl && aux.settings.creatorRuntimeToken);
  const [runtimeOpen, setRuntimeOpen] = useState(() => runtimeConnected || RUNTIME_HASHES.includes(hash));
  const [stageCategory, setStageCategory] = useState<AiStageCategory>("all");

  useEffect(() => {
    if (RUNTIME_HASHES.includes(hash)) setRuntimeOpen(true);
  }, [hash]);

  const visibleStageCards = stageCategory === "all"
    ? AI_STAGE_CARDS
    : AI_STAGE_CARDS.filter((card) => card.category === stageCategory);

  return (
    <div data-ai-hub="director" className="min-w-0 break-keep">
      <Container size="wide" className="space-y-8 py-6 sm:space-y-10 sm:py-10">
        <AiStudioPageHeader
          current="director"
          eyebrow="AI Creative Hub"
          title={bt("AI와 함께, 아이디어를 장면으로", "Turn ideas into scenes with AI")}
          lede={bt("루나에게 제안을 받고, 필요하면 영상·3D 변환까지 이어가세요. 무엇을 할 수 있는지와 비용·키·데이터 조건을 먼저 보여 드려요.", "Get ideas from Luna, then continue into video or 3D conversion. Every tool shows what it does and its cost, key and data conditions up front.")}
          introMotif="spark"
        />

        <SiteArtSurfaceSpotlight cardId="nb-create-canvas" defaultLensId="recipe" compact />

        <AiCreativeDirectorPanel />

        <section id="ai-stage-workbench" aria-labelledby="ai-stage-workbench-title" className="scroll-mt-24 rounded-3xl border border-line bg-card/75 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-accent">
                <Sparkles size={13} aria-hidden="true" />
                {bt("SMART AI ASSIST BY STAGE", "SMART AI ASSIST BY STAGE")}
              </p>
              <h2 id="ai-stage-workbench-title" className="mt-1 text-2xl font-black tracking-[-0.03em] text-fg">
                {bt("공정별 스마트 AI 창작 보조 워크벤치", "Smart AI Assist Workbench by Creation Stage")}
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-fg-2">
                {bt(
                  "기획·콘티부터 선화·밑색, 3D 구도 변환, 연재 전 마감 검수까지 필요한 공정만 골라 AI 보조 도구를 바로 호출하세요.",
                  "Filter by creation stage—from storyboarding and cel coloring to 3D staging and preflight QA—and launch the right AI assistant.",
                )}
              </p>
            </div>
            <div role="group" aria-label={bt("창작 공정 필터", "Creation stage filter")} className="flex flex-wrap gap-1.5">
              {AI_STAGE_CATEGORIES.map((cat) => {
                const active = stageCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStageCategory(cat.id)}
                    className={cn(
                      "min-h-9 rounded-full border px-3.5 text-xs font-bold transition-colors",
                      active
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-panel/70 text-fg-2 hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {bt(cat.label.ko, cat.label.en)}
                  </button>
                );
              })}
            </div>
          </div>

          <ul className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleStageCards.map((card) => (
              <li key={card.id} className="min-w-0">
                <article className="flex h-full flex-col justify-between rounded-2xl border border-line bg-panel/75 p-4 transition-colors hover:border-accent/45">
                  <div>
                    <span
                      aria-hidden="true"
                      className="mb-3 block h-28 w-full rounded-xl border border-line/60 bg-cover bg-center"
                      style={{ backgroundImage: `url(${card.image})` }}
                    />
                    <p className="text-[11px] font-black uppercase tracking-[0.13em] text-accent">
                      {bt(card.badge.ko, card.badge.en)}
                    </p>
                    <h3 className="mt-1 text-base font-black leading-snug text-fg">
                      {bt(card.title.ko, card.title.en)}
                    </h3>
                    <p className="mt-1.5 text-xs leading-5 text-fg-2">
                      {bt(card.description.ko, card.description.en)}
                    </p>
                  </div>
                  <Link
                    href={card.href}
                    className="mt-3.5 inline-flex min-h-10 items-center gap-1 self-start rounded-xl border border-accent/35 bg-accent-soft/45 px-3 text-xs font-bold text-accent hover:bg-accent-soft"
                  >
                    {bt(card.cta.ko, card.cta.en)}
                    <span aria-hidden="true">→</span>
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </section>

        <section id="ai-tools" aria-labelledby="ai-tools-title" className="scroll-mt-24">
          <div className="mb-4 max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">What AI can do</p>
            <h2 id="ai-tools-title" className="mt-1 text-2xl font-black tracking-[-0.03em] text-fg">
              {bt("AI로 할 수 있는 일 · 사용 조건", "What AI can do · conditions")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              {bt("어느 화면이든 결과를 작품에 자동 반영하지 않고, 준비되지 않은 기능은 가짜 결과 대신 이유와 대안을 보여줘요.", "No screen applies results to your work automatically, and anything not ready shows the reason and an alternative instead of a fake result.")}
            </p>
          </div>
          <AiStudioSurfaceCards current="director" />
        </section>

        <details
          open={runtimeOpen}
          onToggle={(event) => setRuntimeOpen(event.currentTarget.open)}
          data-ai-runtime-disclosure
          className="group"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl border border-line bg-panel/60 px-4 py-3 text-left transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Cpu size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-black text-fg">{bt("내 AI 런타임 · 고급", "My AI runtime · advanced")}</span>
              <span className="mt-0.5 block text-sm leading-6 text-fg-2">
                {bt("내가 연결한 클라우드 런타임으로 영상·3D를 변환해요. 처음이라면 건너뛰어도 괜찮아요.", "Convert video and 3D on a cloud runtime you connect yourself. Safe to skip if you're just starting.")}
              </span>
            </span>
            <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="mt-4">
            <PersonalRuntimeWorkspace />
          </div>
        </details>
      </Container>
    </div>
  );
}
