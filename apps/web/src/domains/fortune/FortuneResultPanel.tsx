import {
  Pause,
  Play,
  RotateCcw,
  Share2,
  SkipBack,
  SkipForward,
  Sparkle,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import { motion } from "motion/react";

import { TitleCard } from "@/shared/components/title-card";
import { cn } from "@/shared/lib/utils";

import { ConfettiBurst, CountUp } from "./fortune-fx";
import {
  ELEMENT_KO,
  FORTUNE_TAB_META,
  type Character,
  type FortuneResult,
  type FortuneTab,
} from "./fortune-page-data";
import { FortuneGlobalHoroscope } from "./FortuneGlobalHoroscope";
import { FortuneSajuResult } from "./FortuneSajuResult";
import { FortuneVoiceNarration } from "./FortuneVoiceNarration";
import { TarotCardFace } from "./TarotCardFace";
import { WebtoonStrip } from "./WebtoonStrip";

import type { useFortunePlayback } from "./useFortunePlayback";

/**
 * 운세 결과 출력 패널 — 오늘의 운세, 별자리, 독서 처방전, 궁합, 사주, 타로 결과 뷰와
 * 운세 웹툰 스트립(재생 컨트롤바 포함) 및 행운의 타이틀 추천 영역.
 * FortunePage에서 표현 계층을 분리한 순수 프레젠테이션 컴포넌트(동작·마크업 변경 없음).
 */
export interface FortuneResultPanelProps {
  activeTab: FortuneTab;
  fortuneResult: FortuneResult;
  selectedChar: Character;
  characters: Character[];
  playback: ReturnType<typeof useFortunePlayback>;
  onTogglePlay: () => void;
  onOpenShare: () => void;
  onReset: () => void;
  resultHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  shareTriggerRef: React.RefObject<HTMLButtonElement | null>;
  tx: (source: string) => string;
}

export function FortuneResultPanel({
  activeTab,
  fortuneResult,
  selectedChar,
  characters,
  playback,
  onTogglePlay,
  onOpenShare,
  onReset,
  resultHeadingRef,
  shareTriggerRef,
  tx,
}: FortuneResultPanelProps) {
  return (
    <div className="space-y-8 animate-reveal">

      {/* 결과 상단 공통 헤더 */}
      <div className="border-b border-line/60 pb-4 flex justify-between items-center">
        <div>
          <h3
            ref={resultHeadingRef}
            tabIndex={-1}
            className="text-xl font-extrabold text-fg font-display uppercase tracking-tight outline-none"
          >
            {FORTUNE_TAB_META[activeTab].heroEn}
          </h3>
          <p className="text-xs text-fg-3 mt-0.5">
            {FORTUNE_TAB_META[activeTab].taglineKo}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button ref={shareTriggerRef} type="button" onClick={onOpenShare} className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent">
            <Share2 className="h-3 w-3" /> {tx("공유·저장")}
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-fg-3 hover:text-fg"
          >
            <RotateCcw className="h-3 w-3" /> {tx("다시 보기")}
          </button>
        </div>
      </div>

      {/* 오늘의 운세 전용 결과 디스플레이 */}
      {activeTab === "today" && fortuneResult.today && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">

          {/* 오늘의 운세 지수 원형 도넛/게이지 */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-4 border border-line/45 rounded-2xl bg-card/30 relative overflow-hidden">
            {/* 고득점 축포 — 컨페티 버스트 */}
            {fortuneResult.today.score >= 85 && <ConfettiBurst count={28} />}
            <span className="text-[10px] font-bold text-fg-3 uppercase tracking-wider mb-2">FORTUNE SCORE</span>
            <div className="relative flex items-center justify-center w-28 h-28">
              {/* SVG 원형 프로그레스 */}
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  className="stroke-line/50"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  className="transition-all duration-1000 ease-out"
                  style={{ stroke: "var(--char-accent)" }}
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 48}
                  strokeDashoffset={2 * Math.PI * 48 * (1 - fortuneResult.today.score / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <CountUp value={fortuneResult.today.score} className="text-3xl font-extrabold font-display text-fg" />
                <span className="text-[9px] font-bold text-accent">SCORE</span>
              </div>
            </div>
            <p className="mt-3 text-xs font-semibold text-fg-2">
              {fortuneResult.today.score >= 90 ? "★ 최고의 하루 ★" : fortuneResult.today.score >= 80 ? "☆ 맑음 & 평온 ☆" : "무난하고 조심스러운 하루"}
            </p>
            {/* 오늘의 운세 요약 음성 낭독 */}
            <FortuneVoiceNarration
              text={`오늘의 운세 ${fortuneResult.today.score}점. ${fortuneResult.today.score >= 90 ? "최고의 하루입니다." : fortuneResult.today.score >= 80 ? "맑고 평온한 하루입니다." : "무난하고 조심스러운 하루입니다."} 행운의 컬러는 ${fortuneResult.today.color}, 행운의 방향은 ${fortuneResult.today.direction}, 행운의 시간대는 ${fortuneResult.today.time}, 행운의 숫자는 ${fortuneResult.today.luckyNumber}입니다.`}
              characterId={selectedChar?.id}
              className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[11px] font-bold text-fg-2 hover:text-fg"
            />
          </div>

          {/* 행운의 요소 그리드 */}
          <div className="md:col-span-8 grid grid-cols-2 gap-3.5">
            {[
              { label: tx("행운의 컬러"), value: fortuneResult.today.color, desc: tx("의상이나 소품으로 챙겨보세요") },
              { label: tx("행운의 방향"), value: fortuneResult.today.direction, desc: tx("이 방향으로 이동해 보세요") },
              { label: tx("행운의 시간대"), value: fortuneResult.today.time, desc: tx("가장 좋은 일이 생길 타이밍") },
              { label: tx("행운의 숫자"), value: fortuneResult.today.luckyNumber, desc: tx("오늘 당신의 수호 숫자") },
            ].map((item, idx) => (
              <div key={idx} className="p-3 border border-line/45 bg-card/20 rounded-xl flex flex-col">
                <span className="text-[10px] font-bold text-accent uppercase tracking-wider">{item.label}</span>
                <span className="text-base font-extrabold text-fg mt-1 font-serif">{item.value}</span>
                <span className="text-xs text-fg-3 mt-0.5">{item.desc}</span>
              </div>
            ))}
          </div>

          {/* 사주 기반 개인화 안내 — 생년월일 입력 시 노출 */}
          {fortuneResult.luckyElement && fortuneResult.saju && (
            <div className="md:col-span-12 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-accent/20 bg-accent-soft/40 px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent">{tx("내 사주 연동")}</span>
              <span className="text-xs text-fg-2">
                일주 <strong className="text-fg">{fortuneResult.saju.dayPillar.kanKorean}{fortuneResult.saju.dayPillar.jiKorean}</strong>
              </span>
              <span className="text-xs text-fg-2">
                오늘 보완하면 좋은 기운 <strong className="text-fg">{ELEMENT_KO[fortuneResult.luckyElement] ?? fortuneResult.luckyElement}</strong>
              </span>
              <span className="text-xs text-fg-3">→ 행운 컬러·방향이 이 기운에 맞춰졌어요</span>
            </div>
          )}

          {/* 세부운 4분면 — 애정·금전·직장·건강 (일진 십성 기반) */}
          {fortuneResult.categories && (
            <div className="md:col-span-12 grid grid-cols-2 gap-x-5 gap-y-3 rounded-xl border border-line/45 bg-card/20 p-4 sm:grid-cols-4">
              {([
                { key: "love", label: "애정운", emoji: "💕", hue: 350 },
                { key: "money", label: "금전운", emoji: "💰", hue: 90 },
                { key: "work", label: "직장운", emoji: "💼", hue: 250 },
                { key: "health", label: "건강운", emoji: "🌿", hue: 150 },
              ] as const).map((cat) => {
                const val = fortuneResult.categories![cat.key];
                return (
                  <div key={cat.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-fg-2">{cat.emoji} {cat.label}</span>
                      <span className="font-display font-bold text-fg">{val}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-card">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: `oklch(0.72 0.15 ${cat.hue})` }}
                        initial={{ width: 0 }}
                        animate={{ width: `${val}%` }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* 별자리 전용 결과 디스플레이 */}
      {activeTab === "zodiac" && fortuneResult.zodiac && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* 별자리 글리프 카드 */}
          <div className="md:col-span-4 flex flex-col items-center justify-center rounded-2xl border border-line/45 bg-card/30 p-5 text-center">
            <motion.span
              className="text-6xl"
              initial={{ scale: 0, rotate: -30, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 140, damping: 12 }}
              style={{ filter: "drop-shadow(0 3px 14px var(--color-accent))" }}
            >
              {fortuneResult.zodiac.glyph}
            </motion.span>
            <span className="mt-2 text-lg font-bold text-fg">{fortuneResult.zodiac.ko}</span>
            <span className="text-[11px] text-fg-3">{fortuneResult.zodiac.en} · {fortuneResult.zodiac.dateRange}</span>
            <span className="mt-2 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent">
              {fortuneResult.zodiac.element}의 별자리 · {fortuneResult.zodiac.ruling}
            </span>
          </div>

          {/* 별자리 운세 지수 + 성향 + 행운 */}
          <div className="md:col-span-8 space-y-4">
            <div className="flex items-baseline gap-2">
              <CountUp value={fortuneResult.zodiac.score} className="font-display text-4xl font-extrabold" style={{ color: "var(--char-accent)" }} />
              <span className="text-sm font-bold text-fg-2">점 · 오늘의 별자리 운세</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {fortuneResult.zodiac.traits.map((tr) => (
                <span key={tr} className="rounded-full border border-line/50 bg-card/40 px-3 py-1 text-xs font-semibold text-fg-2">
                  #{tr}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line/45 bg-card/20 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent">행운 컬러</span>
                <span className="mt-1 block font-serif text-base font-extrabold text-fg">{fortuneResult.zodiac.luckyColor}</span>
              </div>
              <div className="rounded-xl border border-line/45 bg-card/20 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent">행운 숫자</span>
                <span className="mt-1 block font-serif text-base font-extrabold text-fg">{fortuneResult.zodiac.luckyNumber}</span>
              </div>
            </div>
            {/* 무료 글로벌 별자리 API 운세 (실패 시 자동 숨김) */}
            <FortuneGlobalHoroscope signId={fortuneResult.zodiac.id} signKo={fortuneResult.zodiac.ko} />
          </div>
        </div>
      )}

      {/* 독서 처방전 전용 결과 디스플레이 */}
      {activeTab === "prescription" && fortuneResult.query && (
        <div className="p-5 border border-warn/15 bg-gradient-to-br from-warn/5 to-card rounded-2xl relative overflow-hidden space-y-4 text-left">
          {/* 고풍스러운 문양 장식 */}
          <div className="absolute top-2 right-4 text-[10px] font-bold text-warn/40 uppercase tracking-widest font-display">Prescribed by {selectedChar.name}</div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-warn/70 uppercase tracking-wider">PRESCRIPTION SLIP</span>
            <h4 className="text-sm font-semibold text-fg-2">분석된 고민: "{fortuneResult.query}"</h4>
          </div>

          <div className="h-px bg-warn/10" />

          {/* 독서 가이드 / 연출 문구 */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-warn/60 uppercase tracking-wider block">{tx("독서 처방 가이드")}</span>
            <p className="text-xs leading-relaxed text-fg-3 italic">
              * 아래 추천된 책(웹툰)을 하루 1회, 3화 이상 읽으며 마음에 평온을 부어넣으세요. 부작용으로 몰입 과다에 따른 수면 부족이 생길 수 있으니 주의 바랍니다.
            </p>
          </div>
        </div>
      )}

      {/* 궁합 전용 결과 디스플레이 */}
      {activeTab === "compatibility" && fortuneResult.score && fortuneResult.mySaju && fortuneResult.partnerSaju && (
        <div className="space-y-6">

          {/* 궁합 요약 매칭 바 */}
          <div className="p-5 border border-line/45 bg-card/30 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col gap-1 text-center md:text-left">
              <span className="text-[10px] font-bold text-accent uppercase tracking-wider">COMPATIBILITY MATCH</span>
              <h4 className="text-lg font-bold text-fg">웹툰 주인공 같은 두 사람의 만남</h4>
              <p className="text-xs text-fg-3">오행의 상생 흐름과 상성 결합도를 분석한 결과입니다.</p>
            </div>
            <div className="flex items-center gap-3.5 bg-card px-5 py-3.5 rounded-xl border border-line/40">
              <div className="text-right">
                <span className="text-[10px] font-bold text-fg-3 block">{tx("궁합 지수")}</span>
                <span className="text-2xl font-extrabold text-accent font-display">
                  <CountUp value={fortuneResult.score} />%
                </span>
              </div>
              <div className="h-8 w-px bg-line" />
              <span className="text-xs font-semibold text-fg-2">
                {fortuneResult.score >= 90 ? "신이 내린 찰떡궁합" : fortuneResult.score >= 80 ? "든든하고 편안한 연인" : fortuneResult.score >= 70 ? "서로 맞춰가는 든든한 동반자" : "유연한 소통이 필요한 인연"}
              </span>
            </div>
          </div>

          {/* 두 사람의 사주 대조 뷰 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 본인 사주 */}
            <div className="p-4 border border-line/40 rounded-xl bg-card/15 space-y-2">
              <span className="text-xs font-bold text-accent uppercase tracking-wider">나의 사주 기운</span>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-fg">일주: {fortuneResult.mySaju.dayPillar.kanKorean}{fortuneResult.mySaju.dayPillar.jiKorean}</span>
                <span className="text-xs text-fg-3">
                  목({fortuneResult.mySaju.elementsRatio.wood}%) 화({fortuneResult.mySaju.elementsRatio.fire}%) 토({fortuneResult.mySaju.elementsRatio.earth}%) 금({fortuneResult.mySaju.elementsRatio.metal}%) 수({fortuneResult.mySaju.elementsRatio.water}%)
                </span>
              </div>
            </div>
            {/* 상대방 사주 */}
            <div className="p-4 border border-line/40 rounded-xl bg-card/15 space-y-2">
              <span className="text-xs font-bold text-accent uppercase tracking-wider">상대방의 사주 기운</span>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-fg">일주: {fortuneResult.partnerSaju.dayPillar.kanKorean}{fortuneResult.partnerSaju.dayPillar.jiKorean}</span>
                <span className="text-xs text-fg-3">
                  목({fortuneResult.partnerSaju.elementsRatio.wood}%) 화({fortuneResult.partnerSaju.elementsRatio.fire}%) 토({fortuneResult.partnerSaju.elementsRatio.earth}%) 금({fortuneResult.partnerSaju.elementsRatio.metal}%) 수({fortuneResult.partnerSaju.elementsRatio.water}%)
                </span>
              </div>
            </div>
          </div>

          {/* 명리 근거 — 잘 맞는 점 / 조율이 필요한 점 + 오행 보완 */}
          {fortuneResult.compat && (fortuneResult.compat.positives?.length || fortuneResult.compat.cautions?.length) && (
            <div className="space-y-3">
              {fortuneResult.compat.elementComplement != null && (
                <div className="rounded-xl border border-line/45 bg-card/20 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-fg-2">{tx("오행 보완도")}</span>
                    <span className="font-display font-bold text-accent">{fortuneResult.compat.elementComplement}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-card">
                    <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${fortuneResult.compat.elementComplement}%` }} transition={{ duration: 0.9, ease: "easeOut" }} />
                  </div>
                </div>
              )}
              {fortuneResult.compat.positives && fortuneResult.compat.positives.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {fortuneResult.compat.positives.map((p, i) => (
                    <span key={i} className="rounded-full border border-good/25 bg-good/10 px-2.5 py-1 text-[11px] font-semibold text-good">✓ {p}</span>
                  ))}
                </div>
              )}
              {fortuneResult.compat.cautions && fortuneResult.compat.cautions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {fortuneResult.compat.cautions.map((c, i) => (
                    <span key={i} className="rounded-full border border-warn/25 bg-warn/10 px-2.5 py-1 text-[11px] font-semibold text-warn">⚠ {c}</span>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* 사주 전용 결과 디스플레이 */}
      {activeTab === "saju" && fortuneResult.saju && (
        <FortuneSajuResult saju={fortuneResult.saju} yearLuck={fortuneResult.yearLuck} tx={tx} />
      )}

      {/* 타로 전용 결과 디스플레이 — 3카드 스프레드 / 단일 카드 */}
      {activeTab === "tarot" && fortuneResult.cards && fortuneResult.cards.length > 1 && (
        <div className="space-y-4">
          <div className={cn(
            "grid gap-3 sm:gap-5",
            fortuneResult.cards.length <= 3 && "grid-cols-3",
            fortuneResult.cards.length > 3 && fortuneResult.cards.length <= 6 && "grid-cols-2 sm:grid-cols-3",
            fortuneResult.cards.length > 6 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          )}>
            {fortuneResult.cards.map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent">{c.position}</span>
                <motion.div
                  className="w-full max-w-[160px]"
                  style={{ perspective: 1000 }}
                  initial={{ rotateY: 180, scale: 0.7, opacity: 0 }}
                  animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                  transition={{ duration: 0.7, ease: "easeOut", type: "spring", stiffness: 120, damping: 14, delay: i * 0.18 }}
                >
                  <TarotCardFace card={c} />
                </motion.div>
                {c.positionMeaningKo && (
                  <span className="text-center text-[10px] leading-snug text-fg-3">{c.positionMeaningKo}</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-fg-3">
            {fortuneResult.spread === "celtic-cross"
              ? "켈틱 크로스 10장으로 현재 상황과 흐름을 깊이 있게 풀어드려요."
              : fortuneResult.spread === "relationship"
                ? "관계 스프레드 6장으로 두 사람의 기운을 풀어드려요."
                : `과거 · 현재 · 미래의 흐름을 ${selectedChar.name}가 웹툰으로 풀어드려요.`}
          </p>
          {/* 심층 스프레드 상세 해석 (위치별 의미 + 음성 낭독) */}
          {(fortuneResult.spread === "celtic-cross" || fortuneResult.spread === "relationship") && fortuneResult.interpretation && (
            <div className="rounded-xl border border-line/45 bg-card/20 p-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-fg">{tx("위치별 상세 해석")}</h4>
                <FortuneVoiceNarration
                  text={fortuneResult.interpretation}
                  characterId={selectedChar?.id}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-fg-2 hover:text-fg"
                />
              </div>
              <div className="mt-2 space-y-2">
                {fortuneResult.interpretation.split("\n").map((line, i) => (
                  <p key={i} className="text-xs leading-relaxed text-fg-2">{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {activeTab === "tarot" && fortuneResult.card && (!fortuneResult.cards || fortuneResult.cards.length <= 1) && (
        <div className="flex flex-col md:flex-row gap-6 items-center">
          {/* 카드별 고유 디자인의 타로 카드 페이스 — 3D 플립 리빌 */}
          <motion.div
            className="w-52 shrink-0"
            style={{ perspective: 1000 }}
            initial={{ rotateY: 180, scale: 0.7, opacity: 0 }}
            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut", type: "spring", stiffness: 120, damping: 14 }}
          >
            <TarotCardFace card={fortuneResult.card} />
          </motion.div>

          {/* 타로 카드 풀이 */}
          <div className="flex-1 space-y-4 text-left">
            <div className="space-y-1">
              <span className="text-[10px] tracking-wider text-accent uppercase font-bold">CARD OVERVIEW</span>
              <h4 className="text-lg font-bold text-fg">
                {fortuneResult.card.name} 카드의 수호 메시지
              </h4>
            </div>
            <p className="text-sm leading-relaxed text-fg-3">
              오늘 당신이 드로우한 <strong>{fortuneResult.card.name}</strong> 카드는 {fortuneResult.card.type === "upright" ? "순리적인 출발과 원활한 조화" : "통제하기 어려운 과잉 혹은 억압 상태"}를 상징합니다.
              이 기운에 매핑되는 캐릭터 조언을 곱씹으며 오늘 하루 조심스러운 균형을 잡아보시길 바랍니다.
            </p>
          </div>
        </div>
      )}

      {/* 운세 웹툰 — 캐릭터가 컷·말풍선으로 풀어주는 해석 (음성+애니메이션 재생) */}
      {fortuneResult.panels && fortuneResult.panels.length > 0 && (
        <div className="border-t border-line/80 pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-3">
              <Sparkle className="h-3.5 w-3.5 text-accent" />
              <span>{tx("운세 웹툰")} · {selectedChar.name}</span>
            </h4>

            {/* 재생 컨트롤바 */}
            {playback.supported && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={playback.prev}
                  aria-label={tx("이전 컷")}
                  disabled={playback.status === "idle"}
                  className="flex items-center justify-center rounded-full border border-line px-2 py-1.5 text-fg-2 transition-colors hover:bg-card disabled:opacity-40"
                >
                  <SkipBack className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={onTogglePlay}
                  className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-[11px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent"
                >
                  {playback.status === "playing" ? (
                    <><Pause className="h-3 w-3" /> {tx("일시정지")}</>
                  ) : playback.status === "paused" ? (
                    <><Play className="h-3 w-3" /> {tx("이어 보기")}</>
                  ) : (
                    <><Play className="h-3 w-3" /> {tx("웹툰 재생")}</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={playback.next}
                  aria-label={tx("다음 컷")}
                  disabled={playback.status === "idle"}
                  className="flex items-center justify-center rounded-full border border-line px-2 py-1.5 text-fg-2 transition-colors hover:bg-card disabled:opacity-40"
                >
                  <SkipForward className="h-3 w-3" />
                </button>
                {playback.status !== "idle" && (
                  <button
                    type="button"
                    onClick={playback.stop}
                    aria-label={tx("정지")}
                    className="flex items-center justify-center rounded-full border border-line px-2 py-1.5 text-fg-2 transition-colors hover:bg-card"
                  >
                    <Square className="h-3 w-3" />
                  </button>
                )}
                {/* 재생 속도 */}
                <div className="flex items-center overflow-hidden rounded-full border border-line">
                  {[0.8, 1, 1.3].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => playback.setSpeed(s)}
                      className={cn(
                        "min-h-10 px-2.5 text-xs font-bold transition-colors",
                        playback.speed === s ? "bg-accent text-on-accent" : "text-fg-3 hover:text-fg"
                      )}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 음성 안내 — 아라·레오나만 음성, 그 외 캐릭터는 무음 자막 재생 */}
          {playback.supported && (
            <p className="mb-4 flex items-center gap-1.5 text-[11px] text-fg-3">
              <Volume2 className="h-3.5 w-3.5" />
              {selectedChar.id === "ara" || selectedChar.id === "leona"
                ? "유나 보이스로 낭독됩니다."
                : "이 캐릭터는 아직 음성이 없어 자막으로 재생돼요. (아라·레오나는 음성 지원)"}
            </p>
          )}

          <WebtoonStrip
            panels={fortuneResult.panels}
            characters={characters}
            selectedCharacterId={selectedChar.id}
            playback={{
              active: playback.status !== "idle",
              steps: playback.steps,
              activeStep: playback.activeStep,
              activePanel: playback.activePanel,
              typed: playback.typed,
            }}
          />
        </div>
      )}

      {/* 행운의 웹툰/웹소설 추천 영역 — 추천이 있을 때만 표시한다.
          로컬 계산에서 카탈로그 스토어가 아직 비어 있으면 추천이 없을 수 있다. */}
      {fortuneResult.recommendations.length > 0 && (
        <div className="border-t border-line/80 pt-6">
          <h4 className="text-xs font-bold text-fg-3 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span>{tx("행운의 타이틀")} · {selectedChar.name}</span>
          </h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {fortuneResult.recommendations.map((title) => (
              <TitleCard key={title.id} title={title} size="sm" />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
