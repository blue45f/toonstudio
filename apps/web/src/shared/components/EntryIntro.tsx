import { useEffect, useRef, useState } from "react";

import { resolveAssetUrl } from "@/shared/catalog/catalog-static";
import { useMediaQuery } from "@/shared/hooks/use-media-query";

import { ToonStudioWordmark } from "./toonstudio-brand";
import { markEntryIntroSeen, shouldPlayEntryIntro } from "./entry-intro-session";
import styles from "./EntryIntro.module.css";

/** 본 연출 유지 시간(ms). 등장 스테이징이 끝난 완성 카드가 읽힐 시간을 포함한다. */
export const ENTRY_INTRO_HOLD_MS = 2350;
/** 자연 종료 시 페이드 시간(ms). 유지와 합친 총 길이는 2.9초 — 계약 구간 2.6~3.2초 안. */
export const ENTRY_INTRO_FADE_MS = 550;
/** 사용자 입력으로 건너뛸 때의 짧은 페이드 시간(ms). */
export const ENTRY_INTRO_SKIP_FADE_MS = 200;
/**
 * 마운트 직후 이 시간(ms) 안의 입력은 스킵으로 치지 않는다.
 * 페이지 로딩 중 우발적인 클릭·키 입력으로 연출이 시작하자마자 증발하는 것을 막는
 * 최소 보호 구간이며, 이 시간이 지나면 기존처럼 즉시 스킵된다.
 */
export const ENTRY_INTRO_SKIP_GUARD_MS = 400;
/** reduced-motion 사용자에게 정적 카드를 보여주는 시간(ms). 페이드 없이 끝난다. */
export const ENTRY_INTRO_REDUCED_HOLD_MS = 1200;

export interface EntryIntroProps {
  /**
   * 세션당 1회만 노출(sessionStorage). 기본 true.
   * false면 마운트마다 노출한다(스토리·테스트용).
   */
  once?: boolean;
  /** 인트로가 완전히 사라진 뒤 호출된다. */
  onDone?: () => void;
}

type Phase = "show" | "fade" | "gone";

/**
 * EntryIntro — 사이트 진입 브랜드 인트로의 단일 시스템.
 *
 * 과거에는 진입 스플래시가 세 컴포넌트로 흩어져 세션마다 무작위로 하나가
 * 골라졌고, 구 브랜드 표기·2.8초·스킵 불가에 로딩 폴백 화면까지 겹쳤다.
 * 이 컴포넌트로 통합한다:
 *
 * - 연출은 하나만: 인트로 전용 고품질 히어로 아트 위에 현행 워드마크와
 *   태그라인 "Stories Come to Life"가 마크 → 워드마크 → 구분선 → 태그라인
 *   순으로 차분히 등장한다. 사라지면 같은 계열 아트의 홈이 이미 완성돼 있다.
 * - 본문은 아래에서 먼저 그려지고, 오버레이는 pointer-events:none이라 입력을
 *   막지 않는다. 클릭·키 입력으로 스킵되되, 마운트 직후 400ms는 우발 입력
 *   보호 구간이라 스킵되지 않는다.
 * - 총 길이 2.9초(유지 2350 + 페이드 550). reduced-motion에서는 애니메이션 없는
 *   정적 카드를 1.2초 보여준다.
 * - 소리는 내지 않는다. BGM은 기존 배경음악 시스템 소관이다.
 */
export function EntryIntro({ once, onDone }: EntryIntroProps = {}) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [shouldPlay] = useState(() => shouldPlayEntryIntro(once));
  const [phase, setPhase] = useState<Phase>("show");
  const [skipped, setSkipped] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!shouldPlay || phase !== "show") return;
    // 표시가 결정된 시점에 기록한다 — 인트로 도중 새로고침해도 다시 뜨지 않는다.
    if (once !== false) markEntryIntroSeen();

    if (reducedMotion) {
      const removeTimer = setTimeout(() => {
        setPhase("gone");
        onDoneRef.current?.();
      }, ENTRY_INTRO_REDUCED_HOLD_MS);
      return () => clearTimeout(removeTimer);
    }

    const fadeTimer = setTimeout(() => setPhase("fade"), ENTRY_INTRO_HOLD_MS);
    return () => clearTimeout(fadeTimer);
  }, [shouldPlay, once, reducedMotion, phase]);

  useEffect(() => {
    if (!shouldPlay || phase !== "fade") return;
    const removeTimer = setTimeout(
      () => {
        setPhase("gone");
        onDoneRef.current?.();
      },
      skipped ? ENTRY_INTRO_SKIP_FADE_MS : ENTRY_INTRO_FADE_MS,
    );
    return () => clearTimeout(removeTimer);
  }, [shouldPlay, phase, skipped]);

  // 클릭·키 입력으로 스킵. 오버레이가 pointer-events:none이라 본문 입력은
  // 인트로 표시 중에도 그대로 동작하고, 이 리스너는 연출만 앞당긴다.
  // 단 마운트 직후 보호 구간(ENTRY_INTRO_SKIP_GUARD_MS) 안의 입력은 로딩 중
  // 우발 입력으로 보고 무시한다.
  useEffect(() => {
    if (!shouldPlay || phase !== "show") return;
    let armed = false;
    const armTimer = setTimeout(() => {
      armed = true;
    }, ENTRY_INTRO_SKIP_GUARD_MS);
    const skip = () => {
      if (!armed) return;
      if (reducedMotion) {
        setPhase("gone");
        onDoneRef.current?.();
        return;
      }
      setSkipped(true);
      setPhase("fade");
    };
    window.addEventListener("pointerdown", skip, { capture: true });
    window.addEventListener("keydown", skip, { capture: true });
    return () => {
      clearTimeout(armTimer);
      window.removeEventListener("pointerdown", skip, { capture: true });
      window.removeEventListener("keydown", skip, { capture: true });
    };
  }, [shouldPlay, phase, reducedMotion]);

  if (!shouldPlay || phase === "gone") return null;

  return (
    <div
      aria-hidden="true"
      className={styles.root}
      data-phase={phase}
      data-skipped={skipped || undefined}
    >
      <img
        src={resolveAssetUrl("/images/hero-main-intro.webp")}
        alt=""
        className={styles.art}
        decoding="async"
      />
      <div className={styles.scrim} />
      <div className={styles.content}>
        <div className={styles.brandRow}>
          {/* 브랜드 마크 컴포넌트는 size-8 고정 계약이라, 인트로의 큰 마크는 같은
              브랜드 에셋을 직접 그린다. 192px PNG를 키워 쓰면 흐려져서, 같은 마크의
              벡터 원본(favicon.svg)을 쓴다. 워드마크는 공용 컴포넌트를 그대로 쓴다. */}
          <img
            src={resolveAssetUrl("/brand/spectrum-ribbon-v2/favicon.svg")}
            alt=""
            className={styles.mark}
            decoding="async"
          />
          <span className={styles.wordmark}>
            <ToonStudioWordmark />
          </span>
        </div>
        <div className={styles.line} />
        <p className={styles.tagline} lang="en">
          Stories Come to Life
        </p>
      </div>
    </div>
  );
}

export default EntryIntro;
