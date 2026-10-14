import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  WORKSPACE_TOUR_STEPS,
  createWorkspaceTourState,
  readWorkspaceTourCompleted,
  workspaceTourReducer,
  workspaceTourStep,
  workspaceTourTargetSelector,
  writeWorkspaceTourCompleted,
  type WorkspaceTourStep,
} from "./studio-workspace-tour-state";

const TOUR_START_DELAY_MS = 700;
const RING_PADDING = 10;
const TOOLTIP_GAP = 16;

/** 작업 바로가기 같은 네이티브 대화상자가 열려 있으면 투어가 포커스를 빼앗아 닫을 때 복귀 지점을 잃으므로 기다린다. */
function dialogIsOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector("dialog[open]") !== null;
}

function measureTourTarget(step: WorkspaceTourStep): DOMRect | null {
  if (typeof document === "undefined") return null;
  const element = document.querySelector(workspaceTourTargetSelector(step));
  if (!(element instanceof HTMLElement)) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

function tourCopy(
  bt: (ko: string, en: string) => string,
  step: WorkspaceTourStep,
  hasProject: boolean,
): { title: string; body: string } {
  switch (step) {
    case "continue":
      // 프로젝트 유무로 분기한다(F2.5): 이어할 원고가 없는 신규 사용자에게
      // "이어가세요"라고 말하면 안내가 거짓이 된다. 강조 대상 버튼 자체는
      // 작품이 없을 때 "새 작품 만들기"로 바뀌어 있다(히어로 CTA).
      return hasProject
        ? {
            title: bt("작업을 이어가세요", "Pick up where you left off"),
            body: bt(
              "마지막으로 펜을 들었던 원고로 바로 돌아갑니다. 지금 이어할 수 있는 작업이 여기 있습니다.",
              "Jump straight back to the manuscript you last touched. Your continuing work is right here.",
            ),
          }
        : {
            title: bt("여기서 첫 작품을 시작하세요", "Start your first work here"),
            body: bt(
              "아직 작품이 없습니다. 이 버튼으로 첫 작품을 만들면, 다음 방문부터는 여기서 이어할 수 있습니다.",
              "You have no work yet. Create your first work with this button — next time, you will pick up right here.",
            ),
          };
    case "quick-actions":
      return hasProject
        ? {
            title: bt("빠른 작업으로 원고를 관리하세요", "Manage manuscripts with quick actions"),
            body: bt(
              "원고 검수와 진행 확인, 협업 공간 입장까지 자주 쓰는 작업을 바로 실행하세요.",
              "Run the tasks you use most — review manuscripts, check production, enter the collaboration space.",
            ),
          }
        : {
            title: bt("시작 방법은 세 가지예요", "Three ways to get started"),
            body: bt(
              "새 작품 만들기, 기존 파일 가져오기, 영감 둘러보기 중 지금 맞는 방법으로 시작하세요.",
              "Start the way that fits you now — create a new work, import existing files, or explore for inspiration.",
            ),
          };
    case "tools":
      return {
        title: bt("도구는 여기서 꺼내세요", "Grab your tools here"),
        body: bt(
          "소재 라이브러리부터 가상스튜디오, 환경 설정까지 창작 도구가 모여 있습니다.",
          "Your creative tools live here — the materials library, your virtual studio, and settings.",
        ),
      };
  }
}

/**
 * First-visit spotlight tour over the workspace home: continue CTA →
 * quick actions → tools menu. Remembers completion in localStorage and
 * honours reduced motion by snapping the spotlight instead of animating it.
 */
export function StudioWorkspaceSpotlightTour({ ready, hasProject = true }: {
  readonly ready: boolean;
  /** 투어 문구의 프로젝트 유무 분기(F2.5). 기본값 true는 기존 호출·테스트의 이어하기 문형을 유지한다. */
  readonly hasProject?: boolean;
}) {
  const bt = useBilingual("StudioWorkspaceSpotlightTour");
  const reducedMotion = useReducedMotion();
  const [state, dispatch] = useReducer(
    workspaceTourReducer,
    undefined,
    () => createWorkspaceTourState(
      typeof window === "undefined" ? true : readWorkspaceTourCompleted(window.localStorage),
    ),
  );
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const active = state.status === "active";
  const step = workspaceTourStep(state);
  const copy = tourCopy(bt, step, hasProject);
  const isLast = state.stepIndex >= WORKSPACE_TOUR_STEPS.length - 1;
  const instant = reducedMotion ? { duration: 0 } : undefined;

  useEffect(() => {
    if (!ready || state.status !== "pending" || typeof window === "undefined") return;
    let timer: number | undefined;
    // 대화상자가 열려 있는 동안에는 시작을 미루고, 닫힌 뒤 다음 확인 때 시작한다.
    const tryStart = () => {
      if (dialogIsOpen()) {
        timer = window.setTimeout(tryStart, TOUR_START_DELAY_MS);
        return;
      }
      dispatch({ type: "start" });
    };
    timer = window.setTimeout(tryStart, TOUR_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, state.status]);

  useEffect(() => {
    if (state.status === "done" && typeof window !== "undefined") {
      writeWorkspaceTourCompleted(window.localStorage);
    }
  }, [state.status]);

  useLayoutEffect(() => {
    if (!active || typeof window === "undefined") return;
    const update = () => setRect(measureTourTarget(step));
    update();
    const retry = window.setTimeout(update, 400);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step]);

  useEffect(() => {
    // 열린 대화상자의 포커스는 가로채지 않는다(닫을 때 호출한 버튼으로 돌아가야 한다).
    if (active && rect && !dialogIsOpen()) cardRef.current?.focus({ preventScroll: true });
  }, [active, rect, step]);

  if (typeof window === "undefined") return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const ring = rect ? {
    top: Math.max(4, rect.top - RING_PADDING),
    left: Math.max(4, rect.left - RING_PADDING),
    width: rect.width + RING_PADDING * 2,
    height: rect.height + RING_PADDING * 2,
  } : null;
  const cardWidth = Math.min(336, viewportWidth - 32);
  let cardTop = rect ? rect.bottom + TOOLTIP_GAP : viewportHeight / 2;
  let cardLeft = rect ? Math.min(Math.max(16, rect.left), Math.max(16, viewportWidth - cardWidth - 16)) : 16;
  if (rect && cardTop + 280 > viewportHeight) cardTop = Math.max(16, rect.top - 296);
  cardLeft = Math.min(cardLeft, Math.max(16, viewportWidth - cardWidth - 16));

  return (
    <AnimatePresence>
      {active && ring ? (
        <>
          <motion.div
            key="tour-ring"
            className="workspace-tour-ring"
            aria-hidden="true"
            style={reducedMotion
              ? { top: ring.top, left: ring.left, width: ring.width, height: ring.height }
              : undefined}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.94 }}
            animate={reducedMotion
              ? { opacity: 1 }
              : { opacity: 1, scale: 1, top: ring.top, left: ring.left, width: ring.width, height: ring.height }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.96 }}
            transition={instant ?? { type: "spring", stiffness: 260, damping: 28 }}
          />
          <motion.div
            key="tour-card"
            ref={cardRef}
            className="workspace-tour-card"
            role="dialog"
            aria-label={bt("스포트라이트 투어", "Spotlight tour")}
            tabIndex={-1}
            style={{ top: cardTop, left: cardLeft, width: cardWidth }}
            initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 10, scale: 0.97 }}
            transition={instant ?? { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={(event) => {
              if (event.key === "Escape") dispatch({ type: "skip" });
            }}
          >
            <p className="workspace-tour-eyebrow">
              <span>{bt("스포트라이트 투어", "Spotlight tour")}</span>
              <span className="workspace-tour-step" aria-label={bt("투어 진행 단계", "Tour progress")}>
                {state.stepIndex + 1} / {WORKSPACE_TOUR_STEPS.length}
              </span>
            </p>
            <h2>{copy.title}</h2>
            <p>{copy.body}</p>
            <div className="workspace-tour-actions">
              <button type="button" className="workspace-tour-skip" onClick={() => dispatch({ type: "skip" })}>
                {bt("건너뛰기", "Skip")}
              </button>
              {state.stepIndex > 0 ? (
                <button type="button" className="workspace-tour-back" onClick={() => dispatch({ type: "back" })}>
                  {bt("이전", "Back")}
                </button>
              ) : null}
              <button type="button" className="workspace-tour-next" onClick={() => dispatch({ type: "next" })}>
                {isLast ? bt("투어 마치기", "Finish tour") : bt("다음", "Next")}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
