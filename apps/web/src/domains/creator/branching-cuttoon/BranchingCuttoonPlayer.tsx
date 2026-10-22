"use no memo";
// 문구는 useBranchingT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import {
  canStepBack,
  chooseBranch,
  findBranchingNode,
  readerScene,
  startReading,
  stepBack,
  validateBranchingCuttoon,
  type BranchingCuttoonGraph,
  type BranchingReaderState,
} from "./model";
import { ArrowLeft, Flag, RotateCcw } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

import { choiceDisplayLabel, kindLabel, nodeDisplayTitle } from "./branching-cuttoon-copy";
import { browserLocalStorage, readProgress, writeProgress } from "./branching-cuttoon-storage";
import {
  BC_CHOICE_BUTTON,
  BC_FOCUS_RING,
  BC_HINT,
  BC_KIND_BADGE,
  BC_SMALL_BUTTON,
  BC_SURFACE,
} from "./branching-cuttoon-styles";
import { BranchingNotice } from "./BranchingNotice";
import { PlayerBoundary, PlayerStateNotice } from "./BranchingPlayerStates";
import { useBranchingT } from "./use-branching-t";

import type { StorageResolver } from "@/shared/lib/browser-preferences";

export interface BranchingCuttoonPlayerProps {
  readonly graph: BranchingCuttoonGraph;
  /** 읽던 위치를 저장하는 키로 쓰는 작품 식별자. 같은 작품은 같은 위치를 이어 읽는다. */
  readonly workId: string;
  /** 시험에서 저장소를 바꿔 끼울 때만 쓴다. */
  readonly storage?: StorageResolver;
  /** 읽을 수 없을 때 "만들기"로 돌아가는 동작. 없으면 단추를 보이지 않는다. */
  readonly onOpenEditor?: () => void;
}

type ResumeNotice = "none" | "resumed" | "reset";

interface ReaderBodyProps {
  readonly graph: BranchingCuttoonGraph;
  readonly workId: string;
  readonly storage: StorageResolver;
}

function ReaderBody({ graph, workId, storage }: ReaderBodyProps): ReactElement | null {
  const t = useBranchingT();
  const headingId = useId().replace(/:/gu, "");
  const choicesId = useId().replace(/:/gu, "");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [initial] = useState(() => {
    const restored = readProgress(storage, workId, graph);
    return { state: restored.state ?? startReading(graph), notice: restored.outcome };
  });
  const [state, setState] = useState<BranchingReaderState | null>(initial.state);
  const [notice, setNotice] = useState<ResumeNotice>(initial.notice);
  const [saveFailed, setSaveFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [focusTick, setFocusTick] = useState(0);

  // 장면이 바뀌면 새 장면 제목으로 초점을 옮겨 키보드·화면 낭독 사용자가 장면 맨 위에서 이어 읽게 한다(모션 감소 설정이면 즉시 이동).
  useEffect(() => {
    if (focusTick === 0) return;
    const heading = headingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [focusTick]);

  const scene = state ? readerScene(graph, state) : null;
  if (!state || !scene) {
    return <PlayerStateNotice title={t("branchingCuttoon.player.emptyTitle")} body={t("branchingCuttoon.player.emptyBody")} />;
  }

  const sceneTitle = nodeDisplayTitle(t, scene.node);

  const commit = (next: BranchingReaderState, message: string): void => {
    setState(next);
    setSaveFailed(!writeProgress(storage, workId, graph, next));
    setAnnouncement(message);
    setNotice("none");
    setFocusTick((tick) => tick + 1);
  };

  const announceArrival = (next: BranchingReaderState): string => {
    const node = findBranchingNode(graph, next.nodeId);
    const title = nodeDisplayTitle(t, node);
    return node?.kind === "ending"
      ? t("branchingCuttoon.player.announceEnding", { title })
      : t("branchingCuttoon.player.announceScene", { title, count: node?.choices.length ?? 0 });
  };

  const choose = (choiceId: string): void => {
    const next = chooseBranch(graph, state, choiceId);
    if (next) commit(next, announceArrival(next));
  };

  const goBack = (): void => {
    const next = stepBack(state);
    if (next) commit(next, t("branchingCuttoon.player.announceBack", { title: nodeDisplayTitle(t, findBranchingNode(graph, next.nodeId)) }));
  };

  const restart = (): void => {
    const next = startReading(graph);
    if (next) commit(next, t("branchingCuttoon.player.announceRestart", { title: nodeDisplayTitle(t, findBranchingNode(graph, next.nodeId)) }));
  };

  return (
    <div className="grid gap-4">
      {notice === "resumed" ? <BranchingNotice tone="info">{t("branchingCuttoon.player.resumed")}</BranchingNotice> : null}
      {notice === "reset" ? <BranchingNotice tone="warn">{t("branchingCuttoon.player.resetByChange")}</BranchingNotice> : null}
      {saveFailed ? <BranchingNotice tone="warn">{t("branchingCuttoon.player.saveFailed")}</BranchingNotice> : null}

      <article aria-labelledby={headingId} className={BC_SURFACE}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-bold", BC_KIND_BADGE[scene.node.kind])}>
            {scene.isEnding ? <Flag size={12} className="mr-1" aria-hidden="true" /> : null}
            {kindLabel(t, scene.node.kind)}
          </span>
          <span className={BC_HINT}>{t("branchingCuttoon.player.visitedCount", { visited: state.visited.length, total: graph.nodes.length })}</span>
        </div>
        <h3
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className={cn("mt-2 text-xl font-black text-fg [overflow-wrap:anywhere] focus:outline-none", BC_FOCUS_RING)}
        >
          {sceneTitle}
        </h3>

        {scene.cuts.length === 0 ? (
          <p className={cn(BC_HINT, "mt-4")}>{t("branchingCuttoon.player.noCuts")}</p>
        ) : (
          <ol aria-label={t("branchingCuttoon.player.cutsLabel")} className="mt-4 grid gap-3">
            {scene.cuts.map((cut, index) => (
              <li key={`${cut.id}-${index}`} className="rounded-xl border border-line bg-panel/55 p-4">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
                  {t("branchingCuttoon.player.cutOrdinal", { n: index + 1, total: scene.cuts.length })}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-7 text-fg [overflow-wrap:anywhere]">
                  {cut.caption ?? t("branchingCuttoon.player.cutMissing")}
                </p>
              </li>
            ))}
          </ol>
        )}

        {scene.isEnding ? (
          <section aria-label={t("branchingCuttoon.player.endingLabel")} className="mt-5 rounded-xl border border-good/40 bg-good/10 p-4">
            <p className="flex items-center gap-2 text-base font-black text-fg">
              <Flag size={16} aria-hidden="true" />
              {t("branchingCuttoon.player.endingTitle")}
            </p>
            <p className="mt-1 text-sm leading-6 text-fg-2">{t("branchingCuttoon.player.endingHint")}</p>
          </section>
        ) : (
          <section className="mt-5">
            <h4 id={choicesId} className="text-sm font-black text-fg">{t("branchingCuttoon.player.choicesHeading")}</h4>
            <div role="group" aria-labelledby={choicesId} className="mt-2 grid gap-2 sm:grid-cols-2">
              {scene.choices.map((choice) => (
                <button key={choice.id} type="button" onClick={() => choose(choice.id)} className={BC_CHOICE_BUTTON}>
                  {choiceDisplayLabel(t, choice.label)}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          <button type="button" onClick={goBack} disabled={!canStepBack(state)} className={BC_SMALL_BUTTON}>
            <ArrowLeft size={15} aria-hidden="true" />
            {t("branchingCuttoon.player.back")}
          </button>
          <button type="button" onClick={restart} className={BC_SMALL_BUTTON}>
            <RotateCcw size={15} aria-hidden="true" />
            {t("branchingCuttoon.player.restart")}
          </button>
        </div>

        {state.trail.length > 0 ? (
          <details className="mt-4">
            <summary className={cn("flex min-h-11 cursor-pointer items-center text-sm font-bold text-fg-2", BC_FOCUS_RING)}>
              {t("branchingCuttoon.player.trailSummary", { count: state.trail.length })}
            </summary>
            <ol aria-label={t("branchingCuttoon.player.trailLabel")} className="mt-2 grid gap-1 text-sm text-fg-2">
              {state.trail.map((step, index) => {
                const from = findBranchingNode(graph, step.nodeId);
                const choice = from?.choices.find((candidate) => candidate.id === step.choiceId);
                return (
                  <li key={`${step.nodeId}-${step.choiceId}-${index}`} className="[overflow-wrap:anywhere]">
                    {t("branchingCuttoon.player.trailStep", { title: nodeDisplayTitle(t, from), label: choiceDisplayLabel(t, choice?.label) })}
                  </li>
                );
              })}
            </ol>
          </details>
        ) : null}
      </article>

      {/* 장면이 바뀌었음을 화면 낭독기에 알린다. 처음 그릴 때는 비어 있어 아무것도 읽지 않는다. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
    </div>
  );
}

/**
 * 분기형 컷툰 최소 플레이어. 장면의 컷을 위에서 아래로 보여 주고, 끝에서 선택지를 고르게 한다.
 * 읽던 위치는 이 브라우저에만 저장하고(저장이 안 돼도 읽기는 계속된다), 고칠 항목이 남은 이야기는 읽게 하지 않는다.
 */
export function BranchingCuttoonPlayer({ graph, workId, storage, onOpenEditor }: BranchingCuttoonPlayerProps): ReactElement {
  const t = useBranchingT();
  const report = useMemo(() => validateBranchingCuttoon(graph), [graph]);

  if (graph.nodes.length === 0) {
    return (
      <PlayerStateNotice
        title={t("branchingCuttoon.player.emptyTitle")}
        body={t("branchingCuttoon.player.emptyBody")}
        actionLabel={onOpenEditor ? t("branchingCuttoon.player.emptyAction") : undefined}
        onAction={onOpenEditor}
      />
    );
  }
  if (!report.valid) {
    return (
      <PlayerStateNotice
        title={t("branchingCuttoon.player.blockedTitle")}
        body={t("branchingCuttoon.player.blockedBody", { count: report.errorCount })}
        actionLabel={onOpenEditor ? t("branchingCuttoon.player.blockedAction") : undefined}
        onAction={onOpenEditor}
      />
    );
  }
  return (
    <PlayerBoundary>
      {/* 장면·선택지의 연결이 바뀌면(그래프 판이 달라지면) 읽기 상태를 새로 시작한다. */}
      <ReaderBody key={report.graphVersion} graph={graph} workId={workId} storage={storage ?? browserLocalStorage} />
    </PlayerBoundary>
  );
}
