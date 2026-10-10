import { useRef, useState } from "react";
import { ArrowRight, Heart } from "lucide-react";
import { fortuneKstDate } from "@toonstudio/core/fortune";
import { cn } from "@/shared/lib/utils";
import { FortuneSceneArt } from "./FortuneSceneArt";
import type { FortuneSceneTheme } from "./fortune-cinematic-model";
import { useFortuneStore } from "./fortune-store";
import { ELEMENT_COLORS, ELEMENT_KO, FORTUNE_TAB_META, type FortuneTab } from "./fortune-page-data";
import { FORTUNE_TOOL_HERO, FORTUNE_ZODIAC_GLYPHS, type FortuneToolVisualKind } from "./fortune-tool-hero";
import { drawFortuneTodayCards } from "./fortune-today-cards";
import { getTarotVisual, tarotAccent, tarotFaceGradient } from "./tarot-visuals";
import { getTarotArtPath } from "./tarot-art";
import { TarotMotif } from "./TarotMotif";
import { resolveAssetUrl } from "@/shared/catalog/catalog-static";

// 착지 히어로(FortuneLunaHero)의 루나 패널과 같은 그라디언트 문법을 쓴다.
const COMPANION_GRADIENT = "linear-gradient(135deg, oklch(0.87 0.13 172), oklch(0.7 0.18 296))";
const CTA_GRADIENT = "linear-gradient(90deg, oklch(0.87 0.13 172), oklch(0.74 0.16 296))";
const CTA_INK = "oklch(0.16 0.03 280)";

const ELEMENT_ORDER: readonly { key: string; ko: string; hanja: string }[] = [
  { key: "wood", ko: "목", hanja: "木" },
  { key: "fire", ko: "화", hanja: "火" },
  { key: "earth", ko: "토", hanja: "土" },
  { key: "metal", ko: "금", hanja: "金" },
  { key: "water", ko: "수", hanja: "水" },
];

const MOON_PHASES: readonly { label: string; shade: string }[] = [
  { label: "초승달", shade: "radial-gradient(circle at 78% 50%, oklch(0.87 0.13 172) 0 34%, oklch(0.42 0.05 280) 36% 100%)" },
  { label: "상현달", shade: "linear-gradient(90deg, oklch(0.45 0.05 280) 0 50%, oklch(0.88 0.12 172) 50% 100%)" },
  { label: "보름달", shade: "radial-gradient(circle at 38% 34%, oklch(0.95 0.1 172), oklch(0.8 0.14 200))" },
  { label: "하현달", shade: "linear-gradient(90deg, oklch(0.88 0.12 172) 0 50%, oklch(0.45 0.05 280) 50% 100%)" },
  { label: "그믐달", shade: "radial-gradient(circle at 22% 50%, oklch(0.87 0.13 172) 0 34%, oklch(0.42 0.05 280) 36% 100%)" },
];

function kstMonthDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function ToolVisual({ kind, tab }: { kind: FortuneToolVisualKind; tab: FortuneTab }) {
  const [today] = useState(fortuneKstDate);
  // 타로 카드 사진 아트의 로드 실패 상태 — 실패하면 그라디언트+글리프로 폴백한다.
  const [artFailed, setArtFailed] = useState(false);
  if (kind === "tarot-card") {
    const [card] = drawFortuneTodayCards(today, 1);
    const visual = getTarotVisual(card.id);
    const accent = tarotAccent(visual.hue);
    const artPath = getTarotArtPath(card.id);
    const showArt = artPath !== null && !artFailed;
    return (
      <div className="relative flex h-full min-h-44 items-center justify-center overflow-hidden" style={{ backgroundImage: tarotFaceGradient(visual.hue) }}>
        {showArt && (
          <img
            src={resolveAssetUrl(artPath)}
            alt=""
            aria-hidden
            onError={() => setArtFailed(true)}
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        )}
        {!showArt && (
          <div aria-hidden className="absolute right-6 top-1/2 -translate-y-1/2" style={{ color: accent, filter: `drop-shadow(0 4px 18px ${accent})` }}>
            <TarotMotif id={visual.motif} size={96} strokeWidth={1.25} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-4 pt-12">
          <span className="block text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
            {card.nameEn}
          </span>
          <span className="mt-0.5 block font-serif text-lg font-extrabold text-white">
            오늘의 카드 — {card.name}
          </span>
        </div>
      </div>
    );
  }
  if (kind === "today-sun") {
    return (
      <div className="relative flex h-full min-h-44 flex-col items-center justify-center gap-3 overflow-hidden bg-panel/30 p-6">
        <div aria-hidden className="h-20 w-20 rounded-full" style={{ background: "radial-gradient(circle at 36% 32%, oklch(0.95 0.12 90), oklch(0.78 0.16 55))", boxShadow: "0 0 44px oklch(0.8 0.15 70 / 0.45)" }} />
        <p className="text-center">
          <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-fg-3">Today</span>
          <span className="mt-0.5 block font-serif text-xl font-extrabold text-fg">{kstMonthDay(today)}</span>
        </p>
      </div>
    );
  }
  if (kind === "moon-phases") {
    return (
      <div className="flex h-full min-h-44 flex-col items-center justify-center gap-4 bg-panel/30 p-6">
        <div aria-hidden className="flex items-end gap-3 sm:gap-4">
          {MOON_PHASES.map((phase) => (
            <span key={phase.label} className="h-11 w-11 rounded-full border border-line/50 sm:h-14 sm:w-14" style={{ background: phase.shade }} />
          ))}
        </div>
        <p className="text-xs font-semibold text-fg-3">{MOON_PHASES.map((phase) => phase.label).join(" · ")}</p>
      </div>
    );
  }
  if (kind === "year-grid") {
    return (
      <div className="flex h-full min-h-44 flex-col items-center justify-center gap-3 bg-panel/30 p-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-fg-3">{today.slice(0, 4)} · 열두 달</span>
        <div aria-hidden className="grid grid-cols-4 gap-2">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={cn("rounded-lg border px-3 py-1.5 text-center text-xs font-bold", i + 1 === Number(today.slice(5, 7)) ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2")}>
              {i + 1}월
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "zodiac-glyphs") {
    return (
      <div className="flex h-full min-h-44 flex-col items-center justify-center gap-3 bg-panel/30 p-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-fg-3">12 Constellations</span>
        <div className="grid grid-cols-6 gap-2">
          {FORTUNE_ZODIAC_GLYPHS.map((sign) => (
            <span key={sign.ko} className="flex flex-col items-center gap-0.5 rounded-lg border border-line px-2 py-1.5" title={sign.ko}>
              <span aria-hidden className="text-base leading-none text-accent">{sign.glyph}</span>
              <span className="text-[10px] font-semibold text-fg-3">{sign.ko.replace("자리", "")}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "five-elements") {
    return (
      <div className="flex h-full min-h-44 flex-col items-center justify-center gap-4 bg-panel/30 p-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-fg-3">Five Elements</span>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {ELEMENT_ORDER.map((element) => (
            <span key={element.key} className={cn("flex flex-col items-center gap-1.5 rounded-2xl border border-line px-3.5 py-3", ELEMENT_COLORS[element.ko]?.bg)}>
              <span aria-hidden className={cn("h-3 w-3 rounded-full", ELEMENT_COLORS[element.ko]?.dot)} />
              <span className={cn("font-serif text-lg font-extrabold leading-none", ELEMENT_COLORS[element.ko]?.text)}>{element.hanja}</span>
              <span className="text-[10px] font-semibold text-fg-3">{ELEMENT_KO[element.key]}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "pair-rings") {
    return (
      <div className="relative flex h-full min-h-44 flex-col items-center justify-center gap-3 overflow-hidden bg-panel/30 p-6">
        <div aria-hidden className="relative h-24 w-44">
          <span className="absolute left-2 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full border-2 border-accent/70" />
          <span className="absolute right-2 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full border-2" style={{ borderColor: "oklch(0.74 0.16 296 / 0.7)" }} />
          <Heart aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-accent" size={22} fill="currentColor" />
        </div>
        <p className="text-xs font-semibold text-fg-3">나의 기운 × 상대의 기운</p>
      </div>
    );
  }
  // book-shelf
  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center gap-3 bg-panel/30 p-6">
      <div aria-hidden className="flex items-end gap-2.5">
        {[
          { height: "h-24", bg: "linear-gradient(180deg, oklch(0.7 0.15 172), oklch(0.5 0.1 200))" },
          { height: "h-28", bg: "linear-gradient(180deg, oklch(0.74 0.16 296), oklch(0.52 0.12 300))" },
          { height: "h-20", bg: "linear-gradient(180deg, oklch(0.78 0.15 55), oklch(0.58 0.12 60))" },
        ].map((book, i) => (
          <span key={i} className={cn("flex w-11 flex-col items-center gap-1.5 rounded-t-md px-1.5 pt-3", book.height)} style={{ background: book.bg }}>
            <span className="h-0.5 w-full rounded bg-white/50" />
            <span className="h-0.5 w-3/4 rounded bg-white/35" />
          </span>
        ))}
      </div>
      <p className="text-xs font-semibold text-fg-3">고민에 닿는 책 한 권을 골라줘요</p>
      <span className="sr-only">{tab} 도구 미리보기</span>
    </div>
  );
}

// 도구별 무대 장면 테마 — 관측소 경험 그룹의 색 문법(사주·역법/시간=gold,
// 관계·궁합=rose, 창작·일상=mint, 카드·상징=violet)을 도구 탭에 대응시킨다.
const TOOL_STAGE_THEME: Record<FortuneTab, FortuneSceneTheme> = {
  today: "gold",
  monthly: "gold",
  yearly: "gold",
  saju: "gold",
  compatibility: "rose",
  prescription: "mint",
  tarot: "violet",
  zodiac: "violet",
};

/**
 * 도구 하위 라우트(/fortune/<tool>)의 첫 장면 — 관측소 장면(FortuneSceneArt)을
 * 전폭 무대로 깔고, 그 위에 루나 패널(유리 섬)과 도구 비주얼(섬)을 얹는다.
 * 카피·말풍선·CTA는 전부 장면 위에 종속된다 (웨이브 20 무대 구도 교체).
 *
 * 입력은 본문 폼 한 곳에서만 받는다: 히어로와 본문은 동시에 마운트돼 있어
 * 히어로에서 프로필 스토어에 저장해도 본문 폼의 초기값(마운트 시점 값)이
 * 갱신되지 않기 때문이다. 히어로의 CTA는 캐릭터 선택 영역으로 스크롤해
 * "고르기 → 입력" 동선을 한 화면에서 잇는다.
 */
export function FortuneToolHero({ tab }: { tab: FortuneTab }) {
  const meta = FORTUNE_TAB_META[tab];
  const content = FORTUNE_TOOL_HERO[tab];
  const sectionRef = useRef<HTMLElement>(null);
  const savedBirthDate = useFortuneStore((s) => s.birthDate);
  const savedPartnerBirthDate = useFortuneStore((s) => s.partnerBirthDate);

  const scrollToToolStart = () => {
    const next = sectionRef.current?.nextElementSibling;
    if (!next || typeof next.scrollIntoView !== "function") return;
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    next.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  const savedNote = !content.needsBirth
    ? null
    : content.needsPartnerBirth
      ? savedBirthDate && savedPartnerBirthDate
        ? "두 사람의 생년월일이 저장돼 있어요. 캐릭터를 고르면 바로 궁합을 볼 수 있어요."
        : savedBirthDate
          ? "내 생년월일은 저장돼 있어요. 상대의 생년월일은 캐릭터를 고른 뒤 입력해요."
          : null
      : savedBirthDate
        ? "저장된 생년월일이 있어요. 캐릭터를 고르면 바로 시작해요."
        : null;

  return (
    <section ref={sectionRef} aria-labelledby="fortune-tool-hero-title" className="relative isolate mb-8 overflow-hidden sm:-mx-6 sm:-mt-6">
      {/* 장면 레이어 — 관측소 밤 장면이 무대 전체를 채우고, 카피는 그 위에 뜬다. */}
      <div aria-hidden="true" className="absolute inset-0">
        <FortuneSceneArt theme={TOOL_STAGE_THEME[tab]} fill />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(100deg,oklch(0.11_0.03_280/0.5)_0%,oklch(0.11_0.03_280/0.16)_48%,transparent_75%),linear-gradient(to_top,oklch(0.11_0.03_280/0.42)_0%,transparent_42%)]"
      />
      <div className="relative mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-5 px-4 py-10 sm:px-6 lg:min-h-[460px] lg:grid-cols-[400px_minmax(0,1fr)] lg:py-12">
        {/* 왼쪽: 루나 패널 — 도구 말풍선·저장 상태·시작 CTA (장면 위 유리 섬) */}
        <div className="flex flex-col gap-4 rounded-3xl border border-line bg-panel/70 p-6 shadow-[0_18px_44px_-18px_oklch(0.05_0.02_280/0.55)] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-12 w-12 shrink-0 rounded-full" style={{ background: COMPANION_GRADIENT }} />
            <div>
              <h2 id="fortune-tool-hero-title" className="font-bold text-fg">루나 · {meta.labelKo}</h2>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-3">{meta.heroEn}</p>
            </div>
          </div>
          <p className="rounded-2xl rounded-tl-md border border-accent/25 bg-accent-soft/60 px-4 py-3 leading-relaxed text-fg-2">
            {content.bubble}
          </p>
          {savedNote && (
            <p className="rounded-xl border border-line bg-card/60 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-fg-2">
              {savedNote}
            </p>
          )}
          <button
            type="button"
            onClick={scrollToToolStart}
            className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl py-3 font-bold transition-transform hover:-translate-y-0.5"
            style={{ background: CTA_GRADIENT, color: CTA_INK }}
          >
            {content.ctaLabel} <ArrowRight size={16} />
          </button>
          <p className="text-[11px] leading-relaxed text-fg-3">
            {content.needsBirth
              ? "생년월일은 이 기기에만 저장돼요. 계산도 이 기기에서만 이뤄져 서버로 보내지 않아요. 운세는 재미와 참고용입니다."
              : "운세는 재미와 참고용입니다. 계산 기준과 한계는 결과 아래에 밝힙니다."}
          </p>
        </div>

        {/* 오른쪽: 도구 대표 비주얼 + 한 줄 설명 (장면 위 섬) */}
        <div className="flex flex-col overflow-hidden rounded-3xl border border-line bg-panel/80 shadow-[0_18px_44px_-18px_oklch(0.05_0.02_280/0.55)] backdrop-blur-md">
          <div className="min-h-44 flex-1">
            <ToolVisual kind={content.visual} tab={tab} />
          </div>
          <p className="border-t border-line bg-panel/40 px-5 py-3.5 text-sm leading-relaxed text-fg-2">
            <span className="mr-2 font-bold text-fg">{meta.labelKo}</span>
            {meta.taglineKo}
          </p>
        </div>
      </div>
    </section>
  );
}
