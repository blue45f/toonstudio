"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { GalleryVertical, LayoutGrid, Lock } from "lucide-react";
import { Component, Suspense, lazy, useId, useRef, useState, type ReactElement, type ReactNode } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { PanelNotice } from "./PanelNotice";
import { PANEL_FOCUS_RING, PANEL_SKELETON } from "./panel-import-styles";
import { usePanelT } from "./use-panel-t";

import type { PanelImportEnvironment } from "./panel-import-env";
import type { PanelImportMode, PanelImportWorkbench as PanelImportWorkbenchComponent } from "./PanelImportWorkbench";

export type PanelWorkbenchLoader = () => Promise<{ readonly default: typeof PanelImportWorkbenchComponent }>;

// 무거운 알고리즘·편집 화면은 사용자가 시작을 누른 뒤에만 불러온다(Studio 가져오기 첫 화면을 가볍게 유지).
const loadWorkbench: PanelWorkbenchLoader = () => import("./PanelImportWorkbench").then((module) => ({ default: module.PanelImportWorkbench }));

interface PanelImportEntryProps {
  /** 시험·특수 환경에서만 쓴다. */
  readonly environment?: Partial<PanelImportEnvironment>;
  /** 시험에서 작업대 불러오기 실패를 흉내 낼 때만 쓴다. */
  readonly loadWorkbench?: PanelWorkbenchLoader;
}

interface LoadBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
}

/** 작업대 코드를 불러오지 못했거나 그리다 실패했을 때 가져오기 화면 전체가 아니라 이 구역만 안내로 바꾼다. */
class WorkbenchLoadBoundary extends Component<LoadBoundaryProps, { readonly failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const MODES: ReadonlyArray<{
  readonly mode: PanelImportMode;
  readonly Icon: typeof LayoutGrid;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly actionKey: string;
}> = [
  {
    mode: "reflow",
    Icon: GalleryVertical,
    titleKey: "panelImport.mode.reflow.title",
    bodyKey: "panelImport.mode.reflow.body",
    actionKey: "panelImport.mode.reflow.action",
  },
  {
    mode: "cards",
    Icon: LayoutGrid,
    titleKey: "panelImport.mode.cards.title",
    bodyKey: "panelImport.mode.cards.body",
    actionKey: "panelImport.mode.cards.action",
  },
];

/**
 * Studio 가져오기 화면의 "원고 이미지에서 컷 찾기 / 카드뉴스" 진입 구역.
 * 작업대는 시작을 누르면 불러오고, 모든 처리는 이 기기 안에서 끝난다.
 */
export function PanelImportEntry({ environment, loadWorkbench: loader = loadWorkbench }: PanelImportEntryProps): ReactElement {
  const t = usePanelT();
  const headingId = useId().replace(/:/gu, "");
  const [mode, setMode] = useState<PanelImportMode | null>(null);
  // lazy 자원은 실패를 기억하므로, 사용자가 다시 시도할 때만 새로 만든다.
  const [attempt, setAttempt] = useState(() => ({ sequence: 0, Workbench: lazy(loader) }));
  const { Workbench } = attempt;
  const retry = (): void => { setAttempt((current) => ({ sequence: current.sequence + 1, Workbench: lazy(loader) })); };
  const sectionRef = useRef<HTMLElement>(null);

  const open = (next: PanelImportMode): void => {
    setMode(next);
    // 열린 작업대가 화면 안에 보이도록 구역 맨 위로 스크롤한다(모션 감소 설정이면 즉시 이동).
    const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sectionRef.current?.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      data-panel-import-entry="true"
      className="mt-8 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-6"
    >
      <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
        {t("panelImport.entry.eyebrow")}
      </p>
      <h2 id={headingId} className="mt-1 text-xl font-black text-fg">
        {t("panelImport.entry.title")}
      </h2>
      <p className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-fg-3">
        <Lock size={15} className="mt-1 shrink-0" aria-hidden="true" />
        <span>
          {t("panelImport.entry.privacy")}
        </span>
      </p>

      {mode === null ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {MODES.map(({ mode: value, Icon, titleKey, bodyKey, actionKey }) => (
            <article key={value} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel/55 p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <h3 className="text-base font-black text-fg">{t(titleKey)}</h3>
              </div>
              <p className="flex-1 text-sm leading-6 text-fg-3">{t(bodyKey)}</p>
              <button
                type="button"
                onClick={() => open(value)}
                className={cn("min-h-11 self-start rounded-xl bg-accent px-4 text-sm font-black text-on-accent transition-colors hover:bg-accent-2", PANEL_FOCUS_RING)}
              >
                {t(actionKey)}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <WorkbenchLoadBoundary
            key={attempt.sequence}
            fallback={
              <PanelNotice
                tone="bad"
                live="alert"
                actions={
                  <>
                    <button type="button" onClick={retry} className={buttonClass({ variant: "outline", size: "sm" })}>{t("panelImport.common.retry")}</button>
                    <button type="button" onClick={() => setMode(null)} className={buttonClass({ variant: "quiet", size: "sm" })}>{t("panelImport.common.close")}</button>
                  </>
                }
              >
                {/* 이 안내는 불러오기 실패뿐 아니라 이미지를 읽은 뒤의 그리기 오류에도 뜬다. 이미지를 읽었는지는 말하지 않는다. */}
                {t("panelImport.entry.loadFailed")}
              </PanelNotice>
            }
          >
            <Suspense
              fallback={
                <div role="status" aria-busy="true" aria-label={t("panelImport.entry.loading")} className="grid gap-3">
                  <div className={cn(PANEL_SKELETON, "h-6 w-1/3")} />
                  <div className={cn(PANEL_SKELETON, "h-48 w-full")} />
                </div>
              }
            >
              <Workbench mode={mode} onClose={() => setMode(null)} environment={environment} />
            </Suspense>
          </WorkbenchLoadBoundary>
        </div>
      )}
    </section>
  );
}
