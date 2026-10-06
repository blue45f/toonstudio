import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookmarkPlus, Share2 } from "lucide-react";
import { fortuneKstDate } from "@toonstudio/core/fortune";
import { cn } from "@/shared/lib/utils";
import { useFortuneStore } from "./fortune-store";
import { drawFortuneTodayCards, fortuneTodayCardsText, type FortuneTodayCard } from "./fortune-today-cards";
import { getTarotVisual, tarotAccent, tarotFaceGradient } from "./tarot-visuals";
import { TarotMotif } from "./TarotMotif";
import type { FortuneTab } from "./fortune-page-data";

// 시안(s4/fortune.png)의 착지 구도 — 좌 루나 입력 카드 + 우 오늘의 카드.
// 칩은 캐릭터 운세의 도구 탭으로, 카드와 CTA는 기존 라우트·스토어로만 연결한다.
const LUNA_MODES: readonly { tab: FortuneTab; label: string }[] = [
  { tab: "saju", label: "사주" },
  { tab: "zodiac", label: "별자리" },
  { tab: "tarot", label: "타로" },
  { tab: "compatibility", label: "궁합" },
];

const COMPANION_GRADIENT = "linear-gradient(135deg, oklch(0.87 0.13 172), oklch(0.7 0.18 296))";
const CTA_GRADIENT = "linear-gradient(90deg, oklch(0.87 0.13 172), oklch(0.74 0.16 296))";
const CTA_INK = "oklch(0.16 0.03 280)";

function TodayCardArt({ card, onOpen }: { card: FortuneTodayCard; onOpen: () => void }) {
  const visual = getTarotVisual(card.id);
  const accent = tarotAccent(visual.hue);
  return (
    <article className="overflow-hidden rounded-3xl border border-line bg-panel/30">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${card.name} 타로 리딩 열기`}
        className="block w-full text-left"
      >
        <div className="relative h-40 overflow-hidden sm:h-44" style={{ backgroundImage: tarotFaceGradient(visual.hue) }}>
          <div
            aria-hidden
            className="absolute right-5 top-1/2 -translate-y-1/2"
            style={{ color: accent, filter: `drop-shadow(0 4px 18px ${accent})` }}
          >
            <TarotMotif id={visual.motif} size={88} strokeWidth={1.25} />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-4 pt-12">
            <span className="block text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
              {card.nameEn}
            </span>
            <span className="mt-0.5 block font-serif text-lg font-extrabold text-white">
              {card.name} — {card.keywords[0]}의 컷
            </span>
          </div>
        </div>
        <p className="px-4 py-3.5 text-sm leading-relaxed text-fg-2 line-clamp-2">{card.line}</p>
      </button>
    </article>
  );
}

export function FortuneLunaHero({ onSaveTodayCards }: { onSaveTodayCards: (text: string) => void }) {
  const navigate = useNavigate();
  const savedBirthDate = useFortuneStore((s) => s.birthDate);
  const setProfile = useFortuneStore((s) => s.setProfile);
  const [mode, setMode] = useState<FortuneTab>("saju");
  const [birthDate, setBirthDate] = useState(savedBirthDate);
  const [notice, setNotice] = useState("");
  const [today] = useState(fortuneKstDate);
  const [cards] = useState<readonly FortuneTodayCard[]>(() => drawFortuneTodayCards(today));

  // 입력한 생년월일은 기존 운세 프로필 스토어(이 기기 전용)에만 실어 보내고,
  // 캐릭터 운세 라우트가 초기값으로 읽는다. 서버 저장은 없다.
  const openReading = () => {
    if (birthDate) setProfile({ birthDate });
    navigate(`/fortune/${mode}`);
  };

  const shareTodayCards = async () => {
    const text = fortuneTodayCardsText(today, cards);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: "오늘의 카드", text });
        setNotice("오늘의 카드를 공유했어요.");
        return;
      }
      await navigator.clipboard.writeText(text);
      setNotice("오늘의 카드를 클립보드에 복사했어요.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("공유를 열지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <section aria-labelledby="fortune-luna-title" className="mb-10">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* 왼쪽: 루나 패널 — 말풍선·종류 칩·생년월일 입력 카드 1장 */}
        <div className="flex flex-col gap-4 rounded-3xl border border-line bg-panel/40 p-6">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-12 w-12 shrink-0 rounded-full" style={{ background: COMPANION_GRADIENT }} />
            <div>
              <h2 id="fortune-luna-title" className="font-bold text-fg">루나 · 오늘의 운세</h2>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-3">Fortune Companion</p>
            </div>
          </div>
          <p className="rounded-2xl rounded-tl-md border border-accent/25 bg-accent-soft/60 px-4 py-3 leading-relaxed text-fg-2">
            오늘 하루는 어떨까요? 태어난 날을 알려주면, 사주와 별자리로 오늘의 컷을 읽어줄게요.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="운세 종류">
            {LUNA_MODES.map((item) => (
              <button
                key={item.tab}
                type="button"
                aria-pressed={mode === item.tab}
                onClick={() => setMode(item.tab)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  mode === item.tab
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-fg-2 hover:text-fg"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="fortune-luna-birth-date" className="mb-1.5 block text-xs font-semibold text-fg-2">
              생년월일
            </label>
            <input
              id="fortune-luna-birth-date"
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-fg focus:border-accent focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-fg-3">
              생년월일은 이 기기에만 저장돼요. 서버에는 저장하지 않아요.
            </p>
          </div>
          <button
            type="button"
            onClick={openReading}
            className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl py-3 font-bold transition-transform hover:-translate-y-0.5"
            style={{ background: CTA_GRADIENT, color: CTA_INK }}
          >
            오늘의 운세 보기 <ArrowRight size={16} />
          </button>
          <p className="text-[11px] leading-relaxed text-fg-3">
            운세는 재미와 참고용입니다. 계산 기준과 한계는 결과 아래에 밝힙니다.
          </p>
        </div>

        {/* 오른쪽: 오늘의 카드 2×2 + 저장·공유 바 */}
        <div className="flex flex-col gap-4">
          <h2 className="font-bold text-fg">오늘의 카드</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {cards.map((card) => (
              <TodayCardArt key={card.id} card={card} onOpen={() => navigate("/fortune/tarot")} />
            ))}
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel/30 px-5 py-4">
            <p className="text-fg-2">결과는 카드 단위로 저장·공유할 수 있습니다</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSaveTodayCards(fortuneTodayCardsText(today, cards))}
                className="flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 font-semibold text-fg-2 transition-colors hover:text-fg"
              >
                <BookmarkPlus size={15} /> 결과 저장
              </button>
              <button
                type="button"
                onClick={shareTodayCards}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 font-bold transition-transform hover:-translate-y-0.5"
                style={{ background: CTA_GRADIENT, color: CTA_INK }}
              >
                <Share2 size={15} /> 공유하기
              </button>
            </div>
          </div>
          {notice && (
            <p role="status" aria-live="polite" className="text-xs text-fg-3">
              {notice}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
