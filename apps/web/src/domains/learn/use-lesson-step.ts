import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

export type LessonStep = "goal" | "practice" | "check" | "reference";

function anchoredStep(lessonId: string, hash: string): LessonStep | null {
  if (hash.startsWith(`#${lessonId}-concept-`)) return "reference";
  if (hash === `#${lessonId}-lab` || hash === `#${lessonId}-practice`) return "practice";
  if (hash === `#${lessonId}-quiz` || hash === `#${lessonId}-notes`) return "check";
  return null;
}

export function useLessonStep(lessonId: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const params = new URLSearchParams(location.search);
  const selected = params.get("lesson-step");
  const step: LessonStep = anchoredStep(lessonId, location.hash)
    ?? (selected === "practice" || selected === "check" || selected === "reference" ? selected
      : selected === "goal" ? "goal"
        : ["labValue", "labFrame", "labView"].some((key) => params.has(key)) ? "practice" : "goal");
  const rootRef = useRef<HTMLElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef(false);
  const previousKey = useRef(location.key);
  const history = useRef(new Map<string, { trigger: HTMLElement | null; scroll: number }>());

  function goToStep(next: LessonStep, trigger: HTMLElement | null = null) {
    if (next === step) return;
    history.current.set(location.key, { trigger, scroll: window.scrollY });
    pendingFocus.current = true;
    const updated = new URLSearchParams(location.search);
    updated.set("lesson-step", next);
    navigate({
      pathname: location.pathname,
      search: `?${updated}`,
      // 이전 강좌 링크의 앵커는 단계 선택보다 우선하므로 직접 이동할 때만 제거한다.
      hash: anchoredStep(lessonId, location.hash) ? "" : location.hash,
    });
  }

  useEffect(() => {
    if (previousKey.current === location.key) return;
    previousKey.current = location.key;
    const focused = document.activeElement;
    const outsideFocus = focused instanceof HTMLElement && focused !== document.body
      && !rootRef.current?.contains(focused);
    if (navigationType === "POP") {
      pendingFocus.current = false;
      const entry = history.current.get(location.key);
      if (outsideFocus || !entry?.trigger?.isConnected || entry.trigger.closest("[hidden]")) return;
      entry.trigger.focus({ preventScroll: true });
      window.scrollTo({ top: entry.scroll, behavior: "auto" });
    } else if (pendingFocus.current) {
      pendingFocus.current = false;
      if (outsideFocus) return;
      stepHeadingRef.current?.focus({ preventScroll: true });
      stepHeadingRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    }
  }, [location.key, navigationType, step]);

  return { step, goToStep, rootRef, stepHeadingRef, hash: location.hash };
}
