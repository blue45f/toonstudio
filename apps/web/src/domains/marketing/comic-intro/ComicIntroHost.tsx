import { useCallback, useEffect, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";

import { COMIC_INTRO_ART_URL } from "./comic-intro-art";
import type { ComicIntroProps } from "./ComicIntro";

/** 한 번 본 사용자는 짧게, 처음 보는 사용자는 풀 버전으로 보여준다. */
const SEEN_KEY = "toonstudio-comic-intro-seen-v1";
/** 같은 브라우저 세션 안에서는 인트로를 한 번만 띄운다(SPA 이동마다 재마운트돼 번쩍이는 것 방지). */
const SESSION_KEY = "toonstudio-comic-intro-session-v1";
/** 키비주얼 선로딩이 이보다 오래 걸리면 기다리지 않고 띄운다 — 컷 배경과 페이드인이 나머지를 덮는다. */
const ART_PRELOAD_TIMEOUT_MS = 600;

type IntroOverlayComponent = ComponentType<ComicIntroProps>;

function sessionAlreadyShown(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) !== null;
  } catch {
    // 저장소를 못 읽는 환경에서는 세션 중복을 막을 수 없으니 그냥 진행한다.
    return false;
  }
}

function markSessionShown() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // 기록 실패는 무시한다.
  }
}

/** 키비주얼을 미리 받아 둔다. 실패·지연은 인트로를 막지 않는다. */
function preloadArt(): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(resolve, ART_PRELOAD_TIMEOUT_MS);
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    image.onload = done;
    image.onerror = done;
    image.src = COMIC_INTRO_ART_URL;
  });
}

/**
 * 만화 인트로를 페이지 로드 뒤에 붙이는 얇은 호스트.
 *
 * - 오버레이 청크는 `window load` 이후에 동적 import로 불러온다 — 첫 화면(LCP)과 경합하지 않는다.
 * - 키비주얼도 청크와 함께 미리 받아, 오버레이가 뜬 뒤 이미지가 늦게 나타나는 깜빡임을 막는다.
 * - 세션당 한 번만 띄운다 — 홈 표면을 오갈 때마다 재마운트돼 번쩍이지 않는다.
 * - `prefers-reduced-motion`이면 아예 띄우지 않는다.
 * - 풀 버전을 끝까지 보거나 건너뛰면 본 것으로 기록하고, 다음부터는 1.85초짜리 짧은 버전만 나간다.
 */
export function ComicIntroHost() {
  const [Overlay, setOverlay] = useState<IntroOverlayComponent | null>(null);
  const [variant, setVariant] = useState<ComicIntroProps["variant"]>("full");

  useEffect(() => {
    // matchMedia가 없는 환경(jsdom 등)에서는 인트로를 띄우지 않는다.
    if (typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (sessionAlreadyShown()) return;

    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      if (sessionAlreadyShown()) return;
      // 띄우기로 확정한 시점에 세션 기록을 남긴다 — 도중에 화면을 떠나도
      // 같은 세션에서 다시 번쩍이지 않게 하기 위해서다.
      markSessionShown();
      let seen = false;
      try {
        seen = window.localStorage.getItem(SEEN_KEY) !== null;
      } catch {
        // 저장소를 못 읽는 환경(시크릿 모드 등)에서는 처음 보는 것으로 취급한다.
      }
      setVariant(seen ? "short" : "full");
      void Promise.all([import("./ComicIntro"), preloadArt()]).then(([module]) => {
        if (!cancelled) setOverlay(() => module.ComicIntro);
      });
    };

    if (document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start, { once: true });
    }
    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
    };
  }, []);

  const handleDone = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // 기록 실패는 무시한다 — 다음 방문에서 풀 버전이 한 번 더 나올 뿐이다.
    }
    setOverlay(null);
  }, []);

  if (!Overlay) return null;
  // 라우트 스테이지의 스태킹 컨텍스트 안에 갇히면 헤더 뒤로 숨으므로 body로 포털한다.
  return createPortal(<Overlay variant={variant} onDone={handleDone} />, document.body);
}
