import { useEffect, useState } from "react";
import { ArrowRight, Check, RotateCcw, Sparkles } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  EXAMPLE_PROJECT_ID,
  EXAMPLE_PROJECT_TITLE,
  exampleJourneyProgress,
  exampleJourneySteps,
  readExampleJourney,
  setExampleJourneyDismissed,
  toggleExampleJourneyStep,
  type ExampleJourneyState,
  type ExampleJourneyStepId,
} from "../studio-example-project-content";
import { ensureExampleProjectSeeded } from "../studio-example-project-seed";
import { restoreStudioProject } from "../studio-project-library-store";

type BannerState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly editorHref: string; readonly journey: ExampleJourneyState }
  | { readonly kind: "trashed" }
  | { readonly kind: "full" }
  | { readonly kind: "error" };

/**
 * 라이브러리 상단 고정: 신규 기기에서는 예제 프로젝트를 한 번 심고,
 * 완주 여정 체크리스트를 목록 위에 고정한다.
 * 시딩 실패(저장소 접근 불가 등)는 라이브러리 전체를 막지 않고 이 배너 안에서만 알린다.
 */
export function StudioExampleProjectBanner() {
  const bt = useBilingual("StudioExampleProjectBanner");
  const [state, setState] = useState<BannerState>({ kind: "loading" });
  const [journeyError, setJourneyError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const result = ensureExampleProjectSeeded(window.localStorage, { target: window });
      if (result.status === "trashed") {
        setState({ kind: "trashed" });
        return;
      }
      if (result.status === "full") {
        setState({ kind: "full" });
        return;
      }
      setState({
        kind: "ready",
        editorHref: result.editorHref,
        journey: readExampleJourney(window.localStorage),
      });
    } catch {
      setState({ kind: "error" });
    }
  }, [attempt]);

  if (state.kind === "loading") {
    return (
      <section
        className="mt-6 rounded-3xl border border-line bg-card px-5 py-6"
        aria-busy="true"
        aria-label={bt("예제 프로젝트 준비 중", "Preparing the example project")}
        data-example-project-banner="loading"
      >
        <p className="text-sm font-bold text-fg-3">
          {bt("예제 프로젝트를 준비하고 있어요…", "Preparing your example project…")}
        </p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        className="mt-6 rounded-3xl border border-line bg-card px-5 py-6"
        role="alert"
        data-example-project-banner="error"
      >
        <h2 className="text-base font-black text-fg">
          {bt("예제 프로젝트를 준비하지 못했어요", "We couldn't prepare the example project")}
        </h2>
        <p className="mt-1 text-sm leading-6 text-fg-3">
          {bt(
            "브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요. 내 작품 목록은 그대로 쓸 수 있습니다.",
            "Check your browser storage and try again. Your own work list is unaffected.",
          )}
        </p>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-fg"
          onClick={() => { setState({ kind: "loading" }); setAttempt((value) => value + 1); }}
        >
          <RotateCcw size={13} aria-hidden="true" />
          {bt("다시 시도", "Try again")}
        </button>
      </section>
    );
  }

  if (state.kind === "full") return null;

  if (state.kind === "trashed") {
    return (
      <section
        className="mt-6 rounded-3xl border border-dashed border-line bg-card/60 px-5 py-5"
        data-example-project-banner="trashed"
      >
        <p className="text-sm leading-6 text-fg-3">
          {bt(
            "예제 프로젝트는 휴지통에 있어요. 필요하면 다시 꺼내 쓸 수 있습니다.",
            "The example project is in Trash. You can bring it back whenever you need it.",
          )}
        </p>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-fg"
          onClick={() => {
            try {
              restoreStudioProject(window.localStorage, EXAMPLE_PROJECT_ID, { target: window });
              setAttempt((value) => value + 1);
            } catch {
              setState({ kind: "error" });
            }
          }}
        >
          <RotateCcw size={13} aria-hidden="true" />
          {bt("예제 프로젝트 복원", "Restore the example project")}
        </button>
      </section>
    );
  }

  const { journey, editorHref } = state;
  const progress = exampleJourneyProgress(journey);
  const steps = exampleJourneySteps(editorHref);

  if (journey.dismissed) {
    return (
      <section
        className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-card px-5 py-4"
        data-example-project-banner="dismissed"
      >
        <p className="inline-flex items-center gap-2 text-sm font-bold text-fg">
          <Sparkles size={16} aria-hidden="true" />
          {bt("예제 프로젝트와 완주 여정", "Example project and finish-line journey")}
          <span className="text-xs font-bold text-fg-3">{progress.done}/{progress.total}</span>
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-fg"
          onClick={() => {
            try {
              const next = setExampleJourneyDismissed(window.localStorage, false);
              setJourneyError(false);
              setState({ kind: "ready", editorHref, journey: next });
            } catch {
              setJourneyError(true);
            }
          }}
        >
          {bt("여정 다시 보기", "Show the journey again")}
        </button>
      </section>
    );
  }

  return (
    <section
      className="mt-6 rounded-3xl border border-line bg-card px-5 py-6"
      aria-labelledby="example-project-banner-title"
      data-example-project-banner="ready"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-widest text-fg-3">
            {bt("처음이라면 여기부터", "Start here")}
          </p>
          <h2 id="example-project-banner-title" className="mt-1 text-xl font-black text-fg">
            {bt("예제 프로젝트로 한 컷을 완주해 보세요", "Finish one panel with the example project")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-3">
            {bt(
              "선화·채색·말풍선이 이미 들어 있어요. 여는 순간부터 직접 만져 볼 수 있습니다.",
              "Line art, colour and a speech balloon are already in. You can start touching it the moment it opens.",
            )}
          </p>
        </div>
        <Link
          href={editorHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-fg px-4 py-2 text-sm font-black text-bg"
        >
          {bt("예제 열기", "Open the example")}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-line/60"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-label={bt("완주 여정 진행도", "Finish-line journey progress")}
        >
          <div className="h-full bg-fg" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
        </div>
        <span className="text-xs font-bold text-fg-3">
          {bt("완주까지", "To the finish")} {progress.done}/{progress.total}
        </span>
        <button
          type="button"
          className="text-xs font-bold text-fg-3 underline underline-offset-2"
          onClick={() => {
            try {
              const next = setExampleJourneyDismissed(window.localStorage, true);
              setJourneyError(false);
              setState({ kind: "ready", editorHref, journey: next });
            } catch {
              setJourneyError(true);
            }
          }}
        >
          {bt("접어 두기", "Collapse")}
        </button>
      </div>

      <ol className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((step) => {
          const done = journey.doneIds.includes(step.id as ExampleJourneyStepId);
          return (
            <li key={step.id} className="rounded-2xl border border-line px-4 py-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={done}
                  onChange={() => {
                    try {
                      const next = toggleExampleJourneyStep(
                        window.localStorage,
                        step.id as ExampleJourneyStepId,
                      );
                      setJourneyError(false);
                      setState({ kind: "ready", editorHref, journey: next });
                    } catch {
                      setJourneyError(true);
                    }
                  }}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-black text-fg">
                    {done ? <Check size={14} aria-hidden="true" /> : null}
                    {bt(step.titleKo, step.titleEn)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-fg-3">
                    {bt(step.hintKo, step.hintEn)}
                  </span>
                </span>
              </label>
              <Link
                href={step.href}
                className="mt-2 inline-flex items-center gap-1 pl-7 text-xs font-bold text-fg underline underline-offset-2"
              >
                {step.id === "open-example" ? EXAMPLE_PROJECT_TITLE : bt("바로 가기", "Go there")}
                <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ol>

      {journeyError ? (
        <p role="alert" className="mt-3 text-xs font-bold text-warning">
          {bt("진행 상황을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.", "Progress couldn't be saved. Check your browser storage.")}
        </p>
      ) : null}
      {progress.done === progress.total ? (
        <p className="mt-3 text-sm font-black text-fg">
          {bt("완주했어요! 이제 내 작품으로 같은 흐름을 이어가 보세요.", "You finished the journey! Now run the same flow on your own work.")}
        </p>
      ) : null}
    </section>
  );
}
