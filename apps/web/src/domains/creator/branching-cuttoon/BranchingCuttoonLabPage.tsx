"use no memo";
// 문구는 useBranchingT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import {
  createBranchingGraph,
  validateBranchingCuttoon,
  type BranchingCuttoonGraph,
  type BranchingIssue,
} from "./model";
import { FileJson, FlaskConical, Pencil, Play } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { Container } from "@/shared/components/container";
import { cn } from "@/shared/lib/utils";

import { type BranchingJumpRequest } from "./branching-cuttoon-dom";
import { createSampleBranchingGraph } from "./branching-cuttoon-sample";
import { browserLocalStorage, readDraft, writeDraft } from "./branching-cuttoon-storage";
import {
  BC_DANGER_BUTTON,
  BC_FOCUS_RING,
  BC_HEADING,
  BC_HINT,
  BC_PRIMARY_BUTTON,
  BC_SMALL_BUTTON,
  BC_SURFACE,
} from "./branching-cuttoon-styles";
import { BranchingCuttoonEditor } from "./BranchingCuttoonEditor";
import { BranchingCuttoonPlayer } from "./BranchingCuttoonPlayer";
import { BranchingIssuePanel } from "./BranchingIssuePanel";
import { BranchingNotice } from "./BranchingNotice";
import { BranchingTransferPanel } from "./BranchingTransferPanel";
import { useBranchingT } from "./use-branching-t";

import type { StorageResolver } from "@/shared/lib/browser-preferences";

/** 읽던 위치를 저장하는 작품 식별자. 이 화면의 초안은 작품이 하나뿐이다. */
const DRAFT_WORK_ID = "draft";

type Mode = "edit" | "play";
type ReplaceKind = "sample" | "new" | "import";

interface PendingReplace {
  readonly kind: ReplaceKind;
  readonly graph: BranchingCuttoonGraph;
  readonly ignoredFieldCount: number;
}

interface AppliedNotice {
  readonly kind: ReplaceKind;
  readonly nodeCount: number;
  readonly ignoredFieldCount: number;
}

export interface BranchingCuttoonLabPageProps {
  /** 시험에서 저장소를 바꿔 끼울 때만 쓴다. */
  readonly storage?: StorageResolver;
}

/** 아무것도 만들지 않은 초안인지: 장면이 시작 하나뿐이고 컷·선택지가 없다. */
function isPristine(graph: BranchingCuttoonGraph): boolean {
  return graph.cuts.length === 0 && graph.nodes.length <= 1 && graph.nodes.every((node) => node.cutIds.length === 0 && node.choices.length === 0);
}

/**
 * 분기형 컷툰 실험실(Labs): 독자가 선택지를 눌러 이야기가 갈라지는 컷툰을 목록으로 만들고, 점검하고, 미리 읽는다.
 * 서버 저장·독자 통계·정산은 없다. 초안은 이 브라우저(localStorage)에만 저장하고, JSON 으로 내보내고 가져올 수 있다.
 */
export function BranchingCuttoonLabPage({ storage }: BranchingCuttoonLabPageProps): ReactElement {
  const t = useBranchingT();
  const resolve = storage ?? browserLocalStorage;
  const [initial] = useState(() => {
    const draft = readDraft(resolve);
    return {
      graph: draft.kind === "restored"
        ? draft.graph
        : createBranchingGraph({ title: t("branchingCuttoon.page.newGraphTitle"), startTitle: t("branchingCuttoon.page.newStartTitle") }),
      unreadable: draft.kind === "unreadable",
    };
  });
  const [graph, setGraph] = useState<BranchingCuttoonGraph>(initial.graph);
  const [mode, setMode] = useState<Mode>("edit");
  const [selectedNodeId, setSelectedNodeId] = useState(initial.graph.startNodeId);
  const [jump, setJump] = useState<BranchingJumpRequest | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [draftUnreadable, setDraftUnreadable] = useState(initial.unreadable);
  const [pending, setPending] = useState<PendingReplace | null>(null);
  const [applied, setApplied] = useState<AppliedNotice | null>(null);
  const report = useMemo(() => validateBranchingCuttoon(graph), [graph]);

  const commitGraph = (next: BranchingCuttoonGraph): void => {
    setGraph(next);
    setSaveFailed(!writeDraft(resolve, next));
    setDraftUnreadable(false);
    setApplied(null);
  };

  const nextJump = (request: Omit<BranchingJumpRequest, "nonce">): void => {
    setJump((current) => ({ ...request, nonce: (current?.nonce ?? 0) + 1 }));
  };

  const selectNode = (nodeId: string, focus: boolean): void => {
    setSelectedNodeId(nodeId);
    if (focus) nextJump({ nodeId });
  };

  const jumpToIssue = (issue: BranchingIssue): void => {
    if (issue.nodeId === undefined) return;
    setSelectedNodeId(issue.nodeId);
    nextJump({ nodeId: issue.nodeId, choiceId: issue.choiceId, cutId: issue.cutId });
  };

  const applyReplace = (replacement: PendingReplace): void => {
    commitGraph(replacement.graph);
    setSelectedNodeId(replacement.graph.startNodeId);
    setJump(null);
    setPending(null);
    setApplied({ kind: replacement.kind, nodeCount: replacement.graph.nodes.length, ignoredFieldCount: replacement.ignoredFieldCount });
  };

  /** 지금 초안을 다른 그래프로 바꾼다. 만들어 둔 내용이 있으면 먼저 확인한다. */
  const requestReplace = (replacement: PendingReplace): void => {
    if (isPristine(graph)) applyReplace(replacement);
    else setPending(replacement);
  };

  const loadSample = (): void => requestReplace({ kind: "sample", graph: createSampleBranchingGraph(t), ignoredFieldCount: 0 });
  const startNew = (): void => requestReplace({
    kind: "new",
    graph: createBranchingGraph({ title: t("branchingCuttoon.page.newGraphTitle"), startTitle: t("branchingCuttoon.page.newStartTitle") }),
    ignoredFieldCount: 0,
  });

  const modeButton = (value: Mode, label: string, Icon: typeof Pencil): ReactElement => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors duration-150 motion-reduce:transition-none",
        BC_FOCUS_RING,
        mode === value ? "border-accent/60 bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
      )}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </button>
  );

  const appliedMessage = applied === null
    ? null
    : applied.kind === "sample"
      ? t("branchingCuttoon.page.appliedSample")
      : applied.kind === "new"
        ? t("branchingCuttoon.page.appliedNew")
        : t("branchingCuttoon.page.appliedImport", { count: applied.nodeCount });

  return (
    <div data-branching-cuttoon-lab="true" className="min-h-[calc(100vh-4rem)] break-keep">
      <Container size="standard" className="py-7 sm:py-10">
        <header aria-labelledby="branching-cuttoon-title">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-accent">
            <FlaskConical size={14} aria-hidden="true" />
            {t("branchingCuttoon.page.eyebrow")}
          </p>
          <h1 id="branching-cuttoon-title" className="mt-3 text-balance text-3xl font-black tracking-[-0.03em] text-fg sm:text-4xl">
            {t("branchingCuttoon.page.title")}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-fg-2">{t("branchingCuttoon.page.intro")}</p>
          <ul className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-fg-2">
            <li className="inline-flex min-h-7 items-center rounded-full border border-warn/50 bg-warn/10 px-3">{t("branchingCuttoon.page.badgeExperimental")}</li>
            <li className="inline-flex min-h-7 items-center rounded-full border border-line bg-card px-3">{t("branchingCuttoon.page.badgeLocal")}</li>
          </ul>
          <BranchingNotice tone="info" className="mt-4 max-w-3xl">{t("branchingCuttoon.page.limitsNote")}</BranchingNotice>
        </header>

        <div className="mt-6 grid gap-3">
          {draftUnreadable ? <BranchingNotice tone="warn">{t("branchingCuttoon.storage.draftUnreadable")}</BranchingNotice> : null}
          {saveFailed ? <BranchingNotice tone="warn">{t("branchingCuttoon.storage.saveFailed")}</BranchingNotice> : null}
          {appliedMessage ? (
            <BranchingNotice tone="good">
              {appliedMessage}
              {applied !== null && applied.ignoredFieldCount > 0 ? ` ${t("branchingCuttoon.page.appliedIgnored", { count: applied.ignoredFieldCount })}` : ""}
            </BranchingNotice>
          ) : null}
        </div>

        <div role="group" aria-label={t("branchingCuttoon.mode.groupLabel")} className="mt-6 flex flex-wrap gap-2">
          {modeButton("edit", t("branchingCuttoon.mode.edit"), Pencil)}
          {modeButton("play", t("branchingCuttoon.mode.play"), Play)}
        </div>

        {pending ? (
          <section role="group" aria-label={t("branchingCuttoon.page.replaceLabel")} className={cn(BC_SURFACE, "mt-4 grid gap-3")}>
            <p className="text-sm leading-6 text-fg-2">{t("branchingCuttoon.page.replaceConfirm", { count: graph.nodes.length })}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => applyReplace(pending)} className={BC_DANGER_BUTTON}>{t("branchingCuttoon.page.replaceAction")}</button>
              <button type="button" onClick={() => setPending(null)} className={BC_SMALL_BUTTON}>{t("branchingCuttoon.common.cancel")}</button>
            </div>
          </section>
        ) : null}

        {mode === "edit" ? (
          <section aria-labelledby="branching-cuttoon-edit-heading" className="mt-6 grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 id="branching-cuttoon-edit-heading" className={BC_HEADING}>{t("branchingCuttoon.editor.heading")}</h2>
                <p className={cn(BC_HINT, "mt-1")}>{t("branchingCuttoon.editor.intro")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={loadSample} className={BC_SMALL_BUTTON}>
                  <FileJson size={15} aria-hidden="true" />
                  {t("branchingCuttoon.page.loadSample")}
                </button>
                <button type="button" onClick={startNew} className={BC_SMALL_BUTTON}>{t("branchingCuttoon.page.startNew")}</button>
              </div>
            </div>

            <BranchingIssuePanel graph={graph} report={report} onJump={jumpToIssue} />

            {graph.nodes.length === 0 ? (
              <section role="status" className={BC_SURFACE}>
                <h3 className={BC_HEADING}>{t("branchingCuttoon.editor.emptyTitle")}</h3>
                <p className="mt-2 text-sm leading-6 text-fg-2">{t("branchingCuttoon.editor.emptyBody")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={startNew} className={BC_PRIMARY_BUTTON}>{t("branchingCuttoon.editor.emptyCreate")}</button>
                  <button type="button" onClick={loadSample} className={BC_SMALL_BUTTON}>{t("branchingCuttoon.page.loadSample")}</button>
                </div>
              </section>
            ) : (
              <BranchingCuttoonEditor
                graph={graph}
                report={report}
                selectedNodeId={selectedNodeId}
                onSelectNode={selectNode}
                onChange={commitGraph}
                jump={jump}
                onJumpHandled={() => setJump(null)}
              />
            )}

            <BranchingTransferPanel
              graph={graph}
              onImport={(imported, ignoredFieldCount) => requestReplace({ kind: "import", graph: imported, ignoredFieldCount })}
            />
          </section>
        ) : (
          <section aria-labelledby="branching-cuttoon-play-heading" className="mt-6 grid gap-4">
            <div>
              <h2 id="branching-cuttoon-play-heading" className={BC_HEADING}>{t("branchingCuttoon.player.heading")}</h2>
              <p className={cn(BC_HINT, "mt-1")}>{t("branchingCuttoon.player.intro")}</p>
            </div>
            <BranchingCuttoonPlayer graph={graph} workId={DRAFT_WORK_ID} storage={resolve} onOpenEditor={() => setMode("edit")} />
          </section>
        )}
      </Container>
    </div>
  );
}
