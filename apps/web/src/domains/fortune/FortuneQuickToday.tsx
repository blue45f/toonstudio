import { useEffect, useEffectEvent, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

import { getCurrentUiLocale, translateAuthoredSourceText } from "@/shared/lib/i18n-bilingual-copy";

import { kstDateString } from "./fortune-page-data";
import { buildQuickTodayFortune, type QuickTodayFortune } from "./fortune-quick-today";

// 1단계: 캐릭터 없이 바로 보는 오늘의 운세 (discover D-11, 진입 장벽 완화).
//
// 캐릭터 선택이 첫 화면을 가로막던 기존 흐름 앞에 둔다. 산출은 날짜만으로
// 결정적인 buildQuickTodayFortune이 담당하므로 입력·로그인·선택이 전혀
// 필요 없고, 결과 아래의 계속 버튼이 2단계(캐릭터 선택 → 개인화 운세)로
// 자연스럽게 이어진다. 상태는 로딩(스켈레톤, 스피너 금지)·에러(재시도)·
// 빈 상태·결과를 모두 갖춘다 — 계산이 동기 함수라 로딩은 마운트 직후
// 1틱 동안만 보이지만, 상태 전이를 명시해 두어 이후 비동기화로 바뀌어도
// 표면 계약이 유지된다.

export interface FortuneQuickTodayProps {
  /** KST 날짜(YYYY-MM-DD). 생략하면 오늘(KST)로 본다. */
  date?: string;
  /** 2단계(캐릭터 선택)로 이어지는 계속 버튼 클릭 핸들러. 없으면 버튼을 숨긴다. */
  onContinue?: () => void;
  /**
   * 산출 함수 주입 지점 — 기본값은 실제 buildQuickTodayFortune이다.
   * 테스트가 에러·빈 상태를 결정적으로 만들 때만 바꾼다.
   */
  compute?: (date: string) => QuickTodayFortune | null;
}

type QuickTodayStatus = "loading" | "ready" | "error" | "empty";

export function FortuneQuickToday({ date, onContinue, compute = buildQuickTodayFortune }: FortuneQuickTodayProps) {
  const locale = getCurrentUiLocale();
  const tx = (source: string) => translateAuthoredSourceText(locale, "ko", "FortuneQuickToday", source);
  const [dateStr] = useState(() => date ?? kstDateString());
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<QuickTodayStatus>("loading");
  const [quick, setQuick] = useState<QuickTodayFortune | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // tx는 렌더마다 새로 만들어지는 로케일 파생 함수라 의존성에 넣으면 효과가 매 렌더 다시 돈다.
  // 에러 문구를 만들 때만 Effect Event 로 최신 로케일 값을 읽는다 (FortuneGlobalHoroscope와 같은 방식).
  const loadFailedMessage = useEffectEvent(() =>
    tx("오늘의 운세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."),
  );

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setErrorMsg(null);
    // 동기 산출을 1틱 미뤄 로딩 스켈레톤이 먼저 그려지게 한다(상태 전이 명시).
    const timer = setTimeout(() => {
      if (!alive) return;
      try {
        const result = compute(dateStr);
        if (!alive) return;
        if (!result) {
          setQuick(null);
          setStatus("empty");
          return;
        }
        setQuick(result);
        setStatus("ready");
      } catch (error) {
        if (!alive) return;
        console.error("오늘의 운세 1단계 산출 실패:", error);
        setQuick(null);
        setErrorMsg(
          error instanceof Error && error.message
            ? error.message
            : loadFailedMessage()
        );
        setStatus("error");
      }
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [dateStr, attempt, compute]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <section
      data-testid="fortune-quick-today"
      aria-labelledby="fortune-quick-today-title"
      aria-busy={status === "loading"}
      className="mx-auto mb-10 w-full max-w-3xl rounded-2xl border border-accent/25 bg-panel/35 p-5 sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-center">
        <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent">
          <Sparkles className="h-3 w-3" /> {tx("1단계 · 캐릭터 없이 바로 보기")}
        </span>
        <span className="text-[11px] font-semibold text-fg-3">{dateStr}</span>
      </div>
      <h2 id="fortune-quick-today-title" className="text-center font-display text-xl font-extrabold tracking-tight text-fg">
        {tx("오늘의 운세")}
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-center text-xs leading-relaxed text-fg-2">
        {tx("캐릭터를 고르지 않아도, 생년월일을 입력하지 않아도 오늘의 운세를 바로 볼 수 있어요.")}
      </p>

      {status === "loading" && (
        <div role="status" className="mt-5 space-y-3">
          <p className="text-center text-xs text-fg-3">{tx("오늘의 운세를 불러오는 중이에요")}</p>
          <div className="mx-auto h-16 w-16 rounded-full skeleton" aria-hidden="true" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl skeleton" aria-hidden="true" />
            ))}
          </div>
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="mt-5 flex flex-col items-center gap-3 py-4 text-center">
          <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-2 text-sm text-fg-2">
            {errorMsg ?? tx("오늘의 운세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")}
          </p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-on-accent hover:bg-accent-2"
          >
            {tx("다시 시도")}
          </button>
        </div>
      )}

      {status === "empty" && (
        <div role="status" className="mt-5 flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm text-fg-2">{tx("오늘은 아직 준비된 운세가 없어요. 잠시 후 다시 확인해 주세요.")}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-on-accent hover:bg-accent-2"
          >
            {tx("다시 시도")}
          </button>
        </div>
      )}

      {status === "ready" && quick && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-3">FORTUNE SCORE</span>
            <span className="font-display text-5xl font-extrabold text-fg">
              {quick.score}
              <span className="ml-1 text-base font-bold text-accent">{tx("점")}</span>
            </span>
            <span className="text-sm font-semibold text-fg-2">{quick.headline}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: tx("행운의 컬러"), value: quick.color, desc: tx("의상이나 소품으로 챙겨보세요") },
              { label: tx("행운의 방향"), value: quick.direction, desc: tx("이 방향으로 이동해 보세요") },
              { label: tx("행운의 시간대"), value: quick.time, desc: tx("가장 좋은 일이 생길 타이밍") },
              { label: tx("행운의 숫자"), value: String(quick.luckyNumber), desc: tx("오늘 당신의 수호 숫자") },
            ].map((item) => (
              <div key={item.label} className="flex flex-col rounded-xl border border-line/45 bg-card/20 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent">{item.label}</span>
                <span className="mt-1 font-serif text-base font-extrabold text-fg">{item.value}</span>
                <span className="mt-0.5 text-xs text-fg-3">{item.desc}</span>
              </div>
            ))}
          </div>

          {quick.card && (
            <div className="rounded-xl border border-line/45 bg-card/20 p-4 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent">{tx("오늘의 카드")}</span>
              <p className="mt-1 font-serif text-base font-extrabold text-fg">
                {quick.card.name}
                <span className="ml-2 text-xs font-semibold text-fg-3">{quick.card.keywords.join(" · ")}</span>
              </p>
              {quick.card.line && <p className="mt-1 text-xs leading-relaxed text-fg-2">{quick.card.line}</p>}
            </div>
          )}

          <p className="text-center text-[11px] leading-relaxed text-fg-3">
            {tx("이 결과는 날짜만으로 보는 모두의 오늘 기운이에요. 내 사주와 캐릭터 해석으로 더 자세히 보려면 아래에서 캐릭터를 골라 주세요.")}
          </p>

          {onContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3.5 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2"
            >
              <span>{tx("캐릭터를 골라 내 운세 더 자세히 보기")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
