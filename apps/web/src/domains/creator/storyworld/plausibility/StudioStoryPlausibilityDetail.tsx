/**
 * 오른쪽 근거 상세: 무슨 일인지, 작가에게 던지는 질문, 근거(원고 인용 강조), 해결 선택지, 처리 기록.
 *
 * 해결 선택지는 어느 것도 문서를 자동으로 바꾸지 않는다. 이동하거나(질문지·설정), 안내문을 복사하거나,
 * 읽을거리를 보여 줄 뿐이다. 처리 기록(해결함·의도된 설정·나중에)은 사유와 함께 남기고, 처리한 항목은 목록에서
 * 접어 둘 뿐 사라지지 않는다.
 */
import { BookOpenText, Check, Clock3, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import type { StoryworldProject, StoryworldQuestionId } from "../studio-storyworld-causality";
import { ConfidenceBadge, SeverityBadge } from "./StudioStoryPlausibilityParts";
import {
  PLAUSIBILITY_EVIDENCE_KIND_LABELS,
  PLAUSIBILITY_SOURCE_LABELS,
  copyText,
} from "./studio-story-plausibility-display";
import { buildPlausibilitySourceView } from "./studio-story-plausibility-source-view";
import { directionSuffix } from "./studio-story-plausibility-text";
import {
  PLAUSIBILITY_DISPOSITION_LABELS,
  plausibilityCategoryLabel,
  type PlausibilityDispositionStatus,
  type PlausibilityEvidence,
  type PlausibilityFinding,
  type PlausibilityHandledFinding,
  type PlausibilityResolutionOption,
} from "./studio-story-plausibility-types";

export interface PlausibilityDetailProps {
  readonly finding: PlausibilityFinding | null;
  readonly handled: PlausibilityHandledFinding | null;
  readonly project: StoryworldProject;
  readonly manuscripts: ReadonlyMap<string, string>;
  readonly readOnly: boolean;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onSetDisposition: (finding: PlausibilityFinding, status: PlausibilityDispositionStatus, note?: string) => void;
  readonly onClearDisposition: (finding: PlausibilityFinding) => void;
  readonly onOpenQuestionnaire: (sceneId: string, question?: StoryworldQuestionId) => void;
  readonly onOpenSettings: (target: "scene" | "fact" | "character", id: string) => void;
}

const RECORDABLE: readonly Exclude<PlausibilityDispositionStatus, "ignored">[] = ["resolved", "intended", "deferred"];

const RECORD_HINTS: Readonly<Record<Exclude<PlausibilityDispositionStatus, "ignored">, string>> = {
  resolved: "고쳤거나 문제가 아니라고 확인했어요. 점수에서 빠져요.",
  intended: "일부러 그렇게 쓴 연출이에요. 점수에서 빠지고 사유가 남아요.",
  deferred: "지금은 두고 나중에 볼게요. 점수에는 계속 반영돼요.",
};

function DispositionControls({ finding, handled, readOnly, onSet, onClear }: {
  readonly finding: PlausibilityFinding;
  readonly handled: PlausibilityHandledFinding | null;
  readonly readOnly: boolean;
  readonly onSet: PlausibilityDetailProps["onSetDisposition"];
  readonly onClear: PlausibilityDetailProps["onClearDisposition"];
}) {
  const [pending, setPending] = useState<Exclude<PlausibilityDispositionStatus, "ignored"> | null>(null);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pending !== null) noteRef.current?.focus();
  }, [pending]);

  if (handled) {
    return (
      <div className="plausibility-disposition">
        <p>
          <span className="plausibility-badge plausibility-badge--muted"><Check aria-hidden size={13} />{PLAUSIBILITY_DISPOSITION_LABELS[handled.status]}</span>
          {handled.note ? <span> {handled.note}</span> : null}
        </p>
        <div className="plausibility-disposition__buttons">
          <button className="storyworld-button" disabled={readOnly} onClick={() => onClear(finding)} type="button">
            <Undo2 aria-hidden size={14} /> 처리 되돌리기
          </button>
        </div>
      </div>
    );
  }

  const cancel = () => {
    setPending(null);
    setNote("");
  };
  const submit = () => {
    if (pending === null) return;
    const trimmed = note.trim();
    onSet(finding, pending, trimmed ? trimmed : undefined);
    cancel();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="plausibility-disposition">
      <div className="plausibility-disposition__buttons" role="group" aria-label="이 항목 처리하기">
        {RECORDABLE.map((status) => (
          <button
            aria-pressed={pending === status}
            className="storyworld-button"
            disabled={readOnly}
            key={status}
            onClick={() => setPending(status)}
            type="button"
          >
            {status === "deferred" ? <Clock3 aria-hidden size={14} /> : <Check aria-hidden size={14} />}
            {PLAUSIBILITY_DISPOSITION_LABELS[status]}
          </button>
        ))}
      </div>
      {readOnly ? <p className="plausibility-hint">예시 이야기에서는 처리 기록을 남기지 않아요.</p> : null}
      {pending !== null ? (
        <>
          <p className="plausibility-hint" id={`pl-note-hint-${finding.id}`}>{RECORD_HINTS[pending]}</p>
          <label>
            <span className="plausibility-hint">사유 (선택, 최대 300자)</span>
            <textarea
              aria-describedby={`pl-note-hint-${finding.id}`}
              maxLength={300}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={pending === "intended" ? "예: 회상 장면이라 시간이 거꾸로 가요" : "예: 3화에서 다시 볼게요"}
              ref={noteRef}
              value={note}
            />
          </label>
          <div className="plausibility-disposition__buttons">
            <button className="storyworld-button storyworld-button--primary" onClick={submit} type="button">
              ‘{PLAUSIBILITY_DISPOSITION_LABELS[pending]}’{directionSuffix(PLAUSIBILITY_DISPOSITION_LABELS[pending])} 기록하기
            </button>
            <button className="storyworld-button" onClick={cancel} type="button"><X aria-hidden size={14} /> 취소</button>
          </div>
          <p className="plausibility-hint">Ctrl+Enter로 기록하고 Esc로 취소해요.</p>
        </>
      ) : null}
    </div>
  );
}

function OptionItem({ option, onOpenQuestionnaire, onOpenSettings }: {
  readonly option: PlausibilityResolutionOption;
  readonly onOpenQuestionnaire: PlausibilityDetailProps["onOpenQuestionnaire"];
  readonly onOpenSettings: PlausibilityDetailProps["onOpenSettings"];
}) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const { action } = option;
  if (action.kind === "info") {
    return (
      <li>
        <strong>{option.label}</strong>
        <small>{option.description}</small>
      </li>
    );
  }
  const run = async () => {
    if (action.kind === "open-questionnaire") onOpenQuestionnaire(action.sceneId, action.question);
    else if (action.kind === "open-settings") onOpenSettings(action.target, action.id);
    else setCopied((await copyText(action.text)) ? "done" : "failed");
  };
  return (
    <li>
      <button className="storyworld-button" onClick={() => { void run(); }} type="button">{option.label}</button>
      <small>{option.description}</small>
      {action.kind === "copy" && copied === "done" ? <small role="status">복사했어요. 원하는 곳에 붙여 넣어 주세요.</small> : null}
      {action.kind === "copy" && copied === "failed" ? (
        <small role="status">복사하지 못했어요. 아래 글을 직접 복사해 주세요: {action.text}</small>
      ) : null}
    </li>
  );
}

function EvidenceItem({ item, project, manuscripts }: {
  readonly item: PlausibilityEvidence;
  readonly project: StoryworldProject;
  readonly manuscripts: ReadonlyMap<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const scene = item.sceneId ? project.scenes.find((candidate) => candidate.id === item.sceneId) : undefined;
  const canView = item.sceneId !== undefined && scene?.source !== undefined;
  const view = open ? buildPlausibilitySourceView(scene, manuscripts, item.quote) : null;
  const quoteChars = item.quote ? Array.from(item.quote.text) : [];
  return (
    <li>
      <span>
        <span className="plausibility-badge plausibility-badge--muted">{PLAUSIBILITY_EVIDENCE_KIND_LABELS[item.kind]}</span>
        {" "}<strong>{item.label}</strong>
        {item.detail ? <span className="plausibility-hint"> · {item.detail}</span> : null}
      </span>
      {item.quote ? (
        <blockquote className="plausibility-quote" lang="ko">
          {quoteChars.slice(0, item.quote.highlightStart).join("")}
          <mark>{quoteChars.slice(item.quote.highlightStart, item.quote.highlightEnd).join("")}</mark>
          {quoteChars.slice(item.quote.highlightEnd).join("")}
        </blockquote>
      ) : null}
      {item.sceneId !== undefined ? (
        <div>
          <button
            aria-expanded={open}
            className="storyworld-button"
            disabled={!canView}
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            <BookOpenText aria-hidden size={14} /> {open ? "원고 접기" : "원고에서 보기"}
          </button>
          {!canView ? <small className="plausibility-hint"> 이 장면은 원고에서 가져온 것이 아니에요.</small> : null}
        </div>
      ) : null}
      {view ? (
        <section aria-label={`‘${item.label}’ 원고`} className="plausibility-source-view">
          {view.note ? <p className="plausibility-hint" role="note">{view.note}</p> : null}
          {view.mode !== "none" ? (
            <pre lang="ko">
              {view.truncatedStart ? "…\n" : ""}
              {view.before}
              {view.highlight ? <mark>{view.highlight}</mark> : null}
              {view.after}
              {view.truncatedEnd ? "\n…" : ""}
            </pre>
          ) : null}
        </section>
      ) : null}
    </li>
  );
}

export function StudioStoryPlausibilityDetail(props: PlausibilityDetailProps) {
  const { finding, handled, project, manuscripts, readOnly, headingRef } = props;
  if (!finding) {
    return (
      <aside aria-label="근거 상세" className="plausibility-detail">
        <section className="plausibility-card">
          <h3 ref={headingRef} tabIndex={-1}>항목을 골라 보세요</h3>
          <p className="plausibility-hint">목록에서 항목을 고르면 근거와 해결 방법을 여기서 볼 수 있어요.</p>
        </section>
      </aside>
    );
  }
  return (
    <aside aria-label="근거 상세" className="plausibility-detail">
      <article className="plausibility-card" key={finding.id}>
        <div className="plausibility-row__top">
          <SeverityBadge severity={finding.severity} />
          <ConfidenceBadge confidence={finding.confidence} />
          <span className="plausibility-badge plausibility-badge--muted">{plausibilityCategoryLabel(finding.category)}</span>
        </div>
        <h3 ref={headingRef} tabIndex={-1}>{finding.title}</h3>
        <p>{finding.message}</p>
        {finding.confidence === "heuristic" ? (
          <p className="plausibility-hint">추정이에요. 글쓰기 관습에 기댄 의심이라 틀릴 수 있어요. 의도한 연출이면 아래에 ‘의도된 설정’으로 남겨 주세요.</p>
        ) : null}
        <div className="plausibility-question">
          <h4>작가님께 드리는 질문</h4>
          <p>{finding.question}</p>
        </div>

        {finding.evidence.length > 0 ? (
          <section aria-labelledby={`pl-evidence-${finding.id}`}>
            <h4 id={`pl-evidence-${finding.id}`}>근거</h4>
            <ul className="plausibility-evidence">
              {finding.evidence.map((item, index) => (
                <EvidenceItem item={item} key={`${item.kind}:${item.id}:${index}`} manuscripts={manuscripts} project={project} />
              ))}
            </ul>
          </section>
        ) : null}

        {finding.options.length > 0 ? (
          <section aria-labelledby={`pl-options-${finding.id}`}>
            <h4 id={`pl-options-${finding.id}`}>해결하는 방법 (고르기 전에는 아무것도 바뀌지 않아요)</h4>
            <ul className="plausibility-options">
              {finding.options.map((option) => (
                <OptionItem
                  key={option.id}
                  onOpenQuestionnaire={props.onOpenQuestionnaire}
                  onOpenSettings={props.onOpenSettings}
                  option={option}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby={`pl-record-${finding.id}`}>
          <h4 id={`pl-record-${finding.id}`}>처리 기록</h4>
          <DispositionControls
            finding={finding}
            handled={handled}
            key={`${finding.id}:${handled?.status ?? "open"}`}
            onClear={props.onClearDisposition}
            onSet={props.onSetDisposition}
            readOnly={readOnly}
          />
        </section>

        <p className="plausibility-hint">
          출처: {PLAUSIBILITY_SOURCE_LABELS[finding.source.module]} · <code>{finding.source.code}</code>
        </p>
      </article>
    </aside>
  );
}
