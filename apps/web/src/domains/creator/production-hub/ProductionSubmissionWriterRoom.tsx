import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ProductionProjectAggregate, Submission } from "@toonstudio/core/production";
import { STUDIO_WRITER_ROOM_STAGES, type StudioWriterRoomCaptureResponse, type StudioWriterRoomDocument, type StudioWriterRoomStage } from "@toonstudio/contracts/studio-writer-room";
import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getStudioWriterRoomCapture } from "../writer-room/studio-writer-room-capture-client";
import { studioVirtualSpaceReviewHref } from "../virtual-space/studio-virtual-space-review-invitation";

const subscribe = (notify: () => void) => { const listener = () => notify(); listeners.add(listener); return () => { listeners.delete(listener); }; };
const labels: Record<StudioWriterRoomStage, readonly [string, string]> = { premise: ["기획 전제", "Premise"], synopsis: ["시놉시스", "Synopsis"],
  "episode-outline": ["회차 개요", "Episode outline"], beats: ["비트", "Beats"], scenes: ["장면", "Scenes"],
  "panel-plan": ["컷 플랜", "Panel plan"], "dialogue-sfx": ["대사·효과음", "Dialogue and SFX"] };
const Text = ({ children }: { readonly children: string }) => <p className="whitespace-pre-wrap break-words text-sm leading-7">{children === "" ? "—" : children}</p>;
const Ref = ({ name, values }: { readonly name: string; readonly values: readonly string[] }) => values.length ? <p className="whitespace-pre-wrap break-all text-xs text-fg-2">{name}: {values.join(" · ")}</p> : null;
const Card = ({ title, children }: { readonly title: string; readonly children: ReactNode }) => <article className="space-y-2 rounded-xl border border-line bg-panel p-3"><h5 className="whitespace-pre-wrap break-all text-sm font-semibold">{title}</h5>{children}</article>;

/** 모든 stage와 문단을 그대로 읽으며 완료 표시는 작가실 작성 상태로만 해석한다. */
export function PinnedWriterRoomDocument({ document }: { readonly document: StudioWriterRoomDocument }) {
  const bt = useBilingual("ProductionSubmissionWriterRoom"), stages = document.stages;
  const body = (stage: StudioWriterRoomStage): ReactNode => {
    if (stage === "premise" || stage === "synopsis") return <><Text>{stages[stage].text}</Text><Ref name={bt("등장인물 참조", "Character references")} values={stages[stage].characterIds} /></>;
    if (stage === "episode-outline") return <><Text>{stages[stage].title}</Text><Text>{stages[stage].summary}</Text><Ref name={bt("등장인물 참조", "Character references")} values={stages[stage].characterIds} /></>;
    if (stage === "beats") return <div className="space-y-3">{stages.beats.items.map((beat) => <Card key={beat.id} title={`${beat.order + 1} · ${beat.title} · ${beat.id}`}><Text>{beat.summary}</Text><Ref name={bt("등장인물 참조", "Character references")} values={beat.characterIds} /></Card>)}</div>;
    if (stage === "scenes") return <div className="space-y-3">{stages.scenes.items.map((scene) => <Card key={scene.id} title={`${scene.order + 1} · ${scene.heading} · ${scene.id}`}>
      <Text>{scene.summary}</Text><Text>{scene.location}</Text><Text>{scene.time}</Text><Ref name={bt("비트 참조", "Beat references")} values={scene.beatIds} /><Ref name={bt("등장인물 참조", "Character references")} values={scene.characterIds} /></Card>)}</div>;
    if (stage === "panel-plan") return <div className="space-y-3">{stages[stage].items.map((panel) => <Card key={panel.id} title={`${panel.order + 1} · ${panel.shot} · ${panel.id}`}>
      <Text>{panel.action}</Text><Ref name={bt("장면 참조", "Scene reference")} values={panel.sceneId ? [panel.sceneId] : []} /><Ref name={bt("등장인물 참조", "Character references")} values={panel.characterIds} /></Card>)}</div>;
    return <div className="space-y-3">{stages["dialogue-sfx"].dialogue.map((dialogue) => <Card key={`dialogue:${dialogue.id}`} title={`${dialogue.order + 1} · ${bt("대사", "Dialogue")} · ${dialogue.id}`}>
      <Text>{dialogue.text}</Text><Ref name={bt("컷 참조", "Panel reference")} values={dialogue.panelId ? [dialogue.panelId] : []} /><Ref name={bt("등장인물 참조", "Character reference")} values={dialogue.characterId ? [dialogue.characterId] : []} /></Card>)}
      {stages["dialogue-sfx"].sfx.map((sfx) => <Card key={`sfx:${sfx.id}`} title={`${sfx.order + 1} · ${bt("효과음", "SFX")} · ${sfx.id}`}>
        <Text>{sfx.customText}</Text><Ref name={bt("컷 참조", "Panel reference")} values={sfx.panelId ? [sfx.panelId] : []} />
        <Ref name={bt("효과음 프리셋 참조", "SFX preset reference")} values={sfx.presetId ? [sfx.presetId] : []} /><p className="text-xs text-fg-2">{sfx.style.emphasis} · {sfx.style.scale}</p></Card>)}</div>;
  };
  const value = (entry: unknown) => typeof entry === "string" ? <Text>{entry}</Text> : <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(entry, null, 2)}</pre>;
  return <div className="space-y-4" aria-label={bt("고정 Writer Room 전체 본문", "Full pinned Writer Room document")}>
    {STUDIO_WRITER_ROOM_STAGES.map((stage) => <section key={stage} className="space-y-3 rounded-xl border border-line bg-card p-3" aria-label={bt(...labels[stage])}>
      <h4 className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">{bt(...labels[stage])}<span className="text-xs font-normal text-fg-2">{document.completion[stage] ? bt("작가실 작성 완료 표시", "Writer Room marked complete") : bt("작가실 작성 진행 표시", "Writer Room marked in progress")}</span></h4>
      {body(stage)}
    </section>)}
    {document.suggestions.length ? <details className="space-y-3 rounded-xl border border-line p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{bt("제안·반영 기록", "Suggestions and resolution history")} · {document.suggestions.length}</summary>
      {document.suggestions.map((suggestion) => <Card key={suggestion.id} title={`${suggestion.id} · ${suggestion.status}`}>
        <p className="break-all text-xs text-fg-2">{suggestion.targetPath} · {suggestion.createdAt}{suggestion.resolvedAt ? ` · ${suggestion.resolvedAt}` : ""}</p>
        <p className="text-xs font-semibold">{bt("기존 내용", "Previous value")}</p>{value(suggestion.currentValue)}<p className="text-xs font-semibold">{bt("제안 내용", "Suggested value")}</p>{value(suggestion.proposedValue)}
        <Text>{suggestion.rationale}</Text>{suggestion.provenanceRef ? <p className="break-all text-xs text-fg-2">{suggestion.provenanceRef}</p> : null}
      </Card>)}
    </details> : null}
    {document.lastDecision ? <details className="rounded-xl border border-line p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{bt("마지막 반영 결정 원문", "Original last resolution")}</summary><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(document.lastDecision, null, 2)}</pre></details> : null}
  </div>;
}

export default function ProductionSubmissionWriterRoom({ aggregate, submission }: { readonly aggregate: ProductionProjectAggregate; readonly submission: Submission }) {
  const revision = useSyncExternalStore(subscribe, getAuthSessionRevision, () => 0), actor = getAuthUserId();
  return <WriterRoomReader key={JSON.stringify([aggregate.projectId, aggregate.workId, submission.id, submission.revisionRef, submission.sourceEvidence, actor, revision])}
    aggregate={aggregate} submission={submission} actor={actor ?? null} authRevision={revision} />;
}
function WriterRoomReader({ aggregate, submission, actor, authRevision }: {
  readonly aggregate: ProductionProjectAggregate; readonly submission: Submission; readonly actor: string | null; readonly authRevision: number;
}) {
  const bt = useBilingual("ProductionSubmissionWriterRoom"), [opened, open] = useState(false), [attempt, retry] = useState(0);
  const [state, setState] = useState<{ readonly kind: "loading" } | { readonly kind: "error"; readonly message: string } | { readonly kind: "ready"; readonly data: StudioWriterRoomCaptureResponse; readonly href: string }>({ kind: "loading" });
  const [binding] = useState(() => ({ projectId: aggregate.projectId, workId: aggregate.workId, submissionProjectId: submission.projectId,
    submissionId: submission.id, evidence: submission.sourceEvidence, revisionRef: submission.revisionRef }));
  const evidence = binding.evidence;
  useEffect(() => {
    if (!opened || !actor || !evidence || binding.projectId === "sample-project") return;
    if (evidence.subject.workId !== binding.workId || binding.submissionProjectId !== binding.projectId) {
      setState({ kind: "error", message: "선택한 작품·제작 프로젝트와 제출 대본이 다릅니다." }); return;
    }
    const controller = new AbortController(); setState({ kind: "loading" });
    void getStudioWriterRoomCapture({ productionProjectId: binding.projectId, submissionId: binding.submissionId, subject: evidence.subject }, controller.signal).then((data) => {
      if (controller.signal.aborted || getAuthUserId() !== actor || getAuthSessionRevision() !== authRevision) return;
      if (data.sourceServerRevision !== evidence.sourceServerRevision || data.captureSequence !== evidence.captureSequence
        || data.sourceServerRevision !== binding.revisionRef.revision || binding.revisionRef.digest !== `sha256:${data.subject.rootGraphHash}`) throw new Error("제출본과 고정 대본의 저장 버전이 다릅니다.");
      const href = studioVirtualSpaceReviewHref(data.subject);
      setState({ kind: "ready", data, href });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && getAuthUserId() === actor && getAuthSessionRevision() === authRevision) setState({ kind: "error", message: cause instanceof Error ? cause.message : "고정 대본을 확인하지 못했습니다." });
    });
    return () => controller.abort();
  }, [opened, actor, authRevision, binding, evidence, attempt]);
  return <section className="space-y-3 border-b border-line bg-panel/50 p-4" aria-label={bt("고정 제출 대본", "Pinned submitted script")}>
    <h3 className="text-sm font-bold">{bt("제출 원고의 고정 대본", "Pinned script in this submission")}</h3>
    <p className="text-xs text-fg-2">{bt("선택한 제출본에 저장된 모든 작가실 단계와 문단을 읽습니다. 작성 완료 표시는 제작 검수 승인과 별개입니다.", "Read every Writer Room stage and paragraph saved in this submission. Writer Room completion is separate from production approval.")}</p>
    {!actor ? <p role="status">{bt("로그인 후 고정 대본을 확인할 수 있습니다.", "Sign in to read the pinned script.")}</p> : !evidence ? <p role="status">{bt("이 과거 제출본에는 고정 대본을 검증할 원고 연결 근거가 없습니다.", "This historical submission has no source evidence for a pinned script.")}</p> : <>
      <button type="button" className={buttonClass({ variant: "outline", className: "min-h-11" })} disabled={aggregate.projectId === "sample-project" || (opened && state.kind === "loading")} onClick={() => { open(true); retry((value) => value + 1); }}>{opened ? bt("같은 고정 대본 다시 읽기", "Reload the same pinned script") : bt("제출 고정 대본 열기", "Open the pinned submitted script")}</button>
      {opened && state.kind === "loading" ? <p role="status">{bt("제출본의 고정 대본과 저장 근거를 확인하고 있습니다.", "Checking the pinned script and saved evidence.")}</p> : null}
      {opened && state.kind === "error" ? <p role="alert" className="text-sm text-bad">{state.message}</p> : null}
      {opened && state.kind === "ready" ? <>
        <p className="break-all text-xs text-fg-2">{submission.id} · {state.data.subject.revisionId} · v{state.data.sourceServerRevision}</p>
        {state.data.status === "available" ? <PinnedWriterRoomDocument document={state.data.writerRoom} /> : <p role="status" className="text-sm">{state.data.status === "missing"
          ? bt("이 고정 원고에는 Writer Room 본문이 없습니다.", "This pinned manuscript contains no Writer Room document.") : state.data.status === "unbound"
            ? bt("이 제출본과 고정 대본의 연결 근거가 없습니다.", "This submission has no binding to the pinned script.")
            : bt("이 고정 대본의 형식이나 전체 분량을 확인할 수 없어 일부 본문으로 대체하지 않았습니다.", "The pinned script format or complete size could not be verified; no partial document is shown.")}</p>}
        <a className={buttonClass({ variant: "outline", className: "min-h-11" })} href={state.href}>{bt("이 고정 검수의 의견·결정 열기", "Open feedback and decisions for this pinned review")}</a>
      </> : null}
    </>}
  </section>;
}
