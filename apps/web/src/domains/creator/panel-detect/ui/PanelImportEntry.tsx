"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

import { GalleryVertical, LayoutGrid, Lock } from "lucide-react";
import { Component, Suspense, lazy, useId, useRef, useState, type ReactElement, type ReactNode } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { PanelNotice } from "./PanelNotice";
import { bi } from "./panel-import-bi";
import { PANEL_FOCUS_RING, PANEL_SKELETON } from "./panel-import-styles";

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
  readonly title: [string, string];
  readonly body: [string, string];
  readonly action: [string, string];
}> = [
  {
    mode: "reflow",
    Icon: GalleryVertical,
    title: ["컷 자동 감지 · 세로 재배열", "Auto panel detection · vertical rearrange"],
    body: [
      "스캔한 만화 페이지나 긴 웹툰 이미지에서 컷 경계를 찾고, 고친 뒤 690/720px 세로 스트립으로 다시 배열해 Studio 문서의 컷으로 넣어요.",
      "Find panel borders in a scanned comic page or a long webtoon image, fix them, rearrange into a 690/720 px vertical strip and insert them as Studio panels.",
    ],
    action: ["컷 찾기 시작", "Start finding panels"],
  },
  {
    mode: "cards",
    Icon: LayoutGrid,
    title: ["카드뉴스 슬라이스 (4:5)", "Card-news slicer (4:5)"],
    body: [
      "긴 세로 원고를 인스타그램용 1080×1350 카드 여러 장으로 나눠요. 말풍선과 그림을 피해 여백에서 자르고, ZIP(PNG)으로 내보내요.",
      "Slice a long vertical manuscript into several 1080×1350 cards for Instagram, cutting in gutters away from balloons and art, and export a ZIP of PNGs.",
    ],
    action: ["카드 나누기 시작", "Start slicing cards"],
  },
];

/**
 * Studio 가져오기 화면의 "원고 이미지에서 컷 찾기 / 카드뉴스" 진입 구역.
 * 작업대는 시작을 누르면 불러오고, 모든 처리는 이 기기 안에서 끝난다.
 */
export function PanelImportEntry({ environment, loadWorkbench: loader = loadWorkbench }: PanelImportEntryProps): ReactElement {
  useBilingualI18nRevision();
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
        {bi("원고 이미지 도우미", "MANUSCRIPT HELPER")}
      </p>
      <h2 id={headingId} className="mt-1 text-xl font-black text-fg">
        {bi("스캔한 원고에서 컷을 찾거나, 긴 원고를 카드로 나누기", "Find panels in a scan, or slice a long manuscript into cards")}
      </h2>
      <p className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-fg-3">
        <Lock size={15} className="mt-1 shrink-0" aria-hidden="true" />
        <span>
          {bi(
            "이 도구는 이미지를 이 기기 안에서만 처리하고 서버로 보내지 않아요. 컷을 Studio 문서로 넣은 뒤의 저장과 동기화는 Studio 의 규칙을 따라요. 내가 권리를 가진 원고이거나 이용 허락을 받은 원고만 사용해 주세요.",
            "This tool processes images only on this device and does not send them to a server. After panels are inserted into a Studio document, Studio’s own saving and sync rules apply. Use only manuscripts you own or have permission to use.",
          )}
        </span>
      </p>

      {mode === null ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {MODES.map(({ mode: value, Icon, title, body, action }) => (
            <article key={value} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel/55 p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <h3 className="text-base font-black text-fg">{bi(title[0], title[1])}</h3>
              </div>
              <p className="flex-1 text-sm leading-6 text-fg-3">{bi(body[0], body[1])}</p>
              <button
                type="button"
                onClick={() => open(value)}
                className={cn("min-h-11 self-start rounded-xl bg-accent px-4 text-sm font-black text-on-accent transition-colors hover:bg-accent-2", PANEL_FOCUS_RING)}
              >
                {bi(action[0], action[1])}
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
                    <button type="button" onClick={retry} className={buttonClass({ variant: "outline", size: "sm" })}>{bi("다시 시도", "Try again")}</button>
                    <button type="button" onClick={() => setMode(null)} className={buttonClass({ variant: "quiet", size: "sm" })}>{bi("닫기", "Close")}</button>
                  </>
                }
              >
                {bi(
                  // 이 안내는 불러오기 실패뿐 아니라 이미지를 읽은 뒤의 그리기 오류에도 뜬다. 이미지를 읽었는지는 말하지 않는다.
                  "작업대를 열지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요. 이 도구는 이미지를 서버로 보내지 않아요.",
                  "The workbench could not be opened. Check your connection and try again. This tool does not send images to a server.",
                )}
              </PanelNotice>
            }
          >
            <Suspense
              fallback={
                <div role="status" aria-busy="true" aria-label={bi("작업대를 불러오는 중", "Loading the workbench")} className="grid gap-3">
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
