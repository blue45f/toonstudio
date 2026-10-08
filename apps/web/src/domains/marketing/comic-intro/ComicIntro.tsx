import { useEffect, useRef, useState, type CSSProperties } from "react";

import { COMIC_INTRO_ART_URL } from "./comic-intro-art";
import "./comic-intro.css";

export type ComicIntroVariant = "full" | "short";

export interface ComicIntroProps {
  readonly variant: ComicIntroVariant;
  readonly onDone: () => void;
}

/**
 * 인트로 타이밍의 단일 출처. `leaveAt`은 페이드아웃이 시작되는 시각으로
 * CSS 변수(--ci-leave-delay)로 그대로 전달된다 — CSS에 숫자를 따로 적으면
 * 둘 중 하나만 바뀔 때 장면이 다 차오르기 전에 사라지는 깜빡임이 재발한다.
 *
 * 두 변형 모두 컷·말풍선·로고가 전부 등장한 뒤 최소 0.5초 이상 완성된
 * 장면이 유지되도록 잡았다. 짧은 버전은 재방문용이라 등장 간격을 압축했을 뿐,
 * 예전처럼 장면이 완성되기도 전에 사라지지 않는다.
 * - full: 장면 완성 ≈1.88초 → 페이드 2.2초 → 종료 2.45초
 * - short: 장면 완성 ≈1.04초 → 페이드 1.6초 → 종료 1.85초
 */
const INTRO_TIMING: Record<ComicIntroVariant, { total: number; leaveAt: number }> = {
  full: { total: 2450, leaveAt: 2200 },
  short: { total: 1850, leaveAt: 1600 },
};

/**
 * 만화 컷이 넘어가듯 등장하는 짧은 인트로 오버레이.
 *
 * - 컷 3개가 차례로 미끄러져 들어오고, 가운데 컷의 키비주얼과 말풍선이 이야기를 완성한다.
 * - 스킵 버튼이나 ESC로 언제든 바로 끝낼 수 있다.
 * - 사운드나 별도 재생 UI는 붙이지 않는다 — 소리는 기존 배경음악 기능을 그대로 쓴다.
 */
export function ComicIntro({ variant, onDone }: ComicIntroProps) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);
  const skipButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    skipButtonRef.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    };
    const dismiss = () => {
      setLeaving(true);
      window.setTimeout(finish, 160);
    };
    const { total } = INTRO_TIMING[variant];
    const doneTimer = window.setTimeout(finish, total);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(doneTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [variant, onDone]);

  const skip = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  return (
    <div
      className="comic-intro"
      data-comic-intro={variant}
      data-leaving={leaving ? "true" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="인트로"
      style={{ "--ci-leave-delay": `${INTRO_TIMING[variant].leaveAt}ms` } as CSSProperties}
    >
      <div className="comic-intro-stage" aria-hidden="true">
        <div className="comic-panel comic-panel--one">
          <p className="comic-panel-caption">오늘은 어떤 이야기를</p>
          <svg className="comic-panel-doodle" viewBox="0 0 120 60" focusable="false">
            <path d="M8 48 C 30 20, 52 44, 74 22 S 104 30, 112 14" fill="none" strokeWidth="3" strokeLinecap="round" />
            <circle cx="104" cy="12" r="4" />
          </svg>
        </div>
        <div className="comic-panel comic-panel--two">
          <img className="comic-panel-art" src={COMIC_INTRO_ART_URL} alt="" draggable={false} />
          <div className="comic-intro-bubble">
            <p>만들까요?</p>
          </div>
        </div>
        <div className="comic-panel comic-panel--three">
          <svg className="comic-speedlines" viewBox="0 0 200 120" focusable="false">
            <g>
              <path d="M100 60 L8 8" />
              <path d="M100 60 L44 2" />
              <path d="M100 60 L100 0" />
              <path d="M100 60 L156 2" />
              <path d="M100 60 L192 8" />
              <path d="M100 60 L196 60" />
              <path d="M100 60 L192 112" />
              <path d="M100 60 L156 118" />
              <path d="M100 60 L100 120" />
              <path d="M100 60 L44 118" />
              <path d="M100 60 L8 112" />
              <path d="M100 60 L4 60" />
            </g>
          </svg>
          <p className="comic-panel-logo">
            툰스튜디오
            <span>에서 시작해요</span>
          </p>
        </div>
      </div>
      <button ref={skipButtonRef} type="button" className="comic-intro-skip" onClick={skip}>
        건너뛰기
      </button>
    </div>
  );
}
