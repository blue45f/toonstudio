import { useEffect, useRef, useState, type CSSProperties } from "react";

import { COMIC_INTRO_ART_URL } from "./comic-intro-art";
import "./comic-intro.css";

const COMIC_INTRO_NIB_EMBLEM_URL = "/assets/atelier/jewels/jewel-drawing-nib.webp";
const COMIC_INTRO_BACKDROP_URL = "/assets/atelier/backgrounds/bg-seoul-crosswalk.webp";

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
          <span className="comic-panel-emblem-frame" aria-hidden="true">
            <img
              className="comic-panel-emblem"
              src={COMIC_INTRO_NIB_EMBLEM_URL}
              alt=""
              aria-hidden="true"
              decoding="async"
              draggable={false}
            />
          </span>
          <p className="comic-panel-caption">오늘은 어떤 이야기를</p>
          <svg className="comic-panel-doodle" viewBox="0 0 120 60" focusable="false" aria-hidden="true">
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
          <img
            className="comic-panel-backdrop"
            src={COMIC_INTRO_BACKDROP_URL}
            alt=""
            aria-hidden="true"
            decoding="async"
            draggable={false}
          />
          <div className="comic-panel-vignette" aria-hidden="true" />
          <svg
            className="comic-speedlines"
            viewBox="0 0 200 120"
            preserveAspectRatio="none"
            focusable="false"
            aria-hidden="true"
          >
            <g>
              <path d="M0 0 L7 0 L52 31 Z" />
              <path d="M31 0 L37 0 L67 26 Z" />
              <path d="M69 0 L74 0 L84 22 Z" />
              <path d="M98 0 L102 0 L100 19 Z" />
              <path d="M126 0 L131 0 L116 22 Z" />
              <path d="M163 0 L169 0 L133 26 Z" />
              <path d="M193 0 L200 0 L148 31 Z" />
              <path d="M200 28 L200 34 L156 46 Z" />
              <path d="M200 58 L200 62 L164 60 Z" />
              <path d="M200 86 L200 92 L156 74 Z" />
              <path d="M200 115 L200 120 L193 120 L148 89 Z" />
              <path d="M169 120 L163 120 L133 94 Z" />
              <path d="M131 120 L126 120 L116 98 Z" />
              <path d="M102 120 L98 120 L100 101 Z" />
              <path d="M74 120 L69 120 L84 98 Z" />
              <path d="M37 120 L31 120 L67 94 Z" />
              <path d="M7 120 L0 120 L0 115 L52 89 Z" />
              <path d="M0 92 L0 86 L44 74 Z" />
              <path d="M0 62 L0 58 L36 60 Z" />
              <path d="M0 34 L0 28 L44 46 Z" />
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
