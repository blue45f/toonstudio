import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { MyStoryAskStage, type MyStorySaveState } from "./MyStoryAskStage";
import { MyStoryPickStage } from "./MyStoryPickStage";
import { MyStoryPrivacyNotice } from "./MyStoryPrivacyNotice";
import { MyStoryReviewStage } from "./MyStoryReviewStage";
import type { MyStoryTextCompleter } from "./my-story-ai";
import { completeMyStoryText } from "./my-story-ai-client";
import { buildMyStoryDraft } from "./my-story-draft";
import {
  MyStoryHandoffError,
  openMyStoryInStudio,
  type MyStoryHandoffStorage,
} from "./my-story-handoff";
import {
  createMyStorySession,
  myStoryHasProgress,
  myStoryInterviewReducer,
  myStoryQuestionAt,
  type MyStoryAction,
  type MyStorySession,
} from "./my-story-interview";
import type { MyStoryLocale, MyStoryTemplateId } from "./my-story-model";
import {
  clearMyStorySession,
  readMyStorySession,
  writeMyStorySession,
  type MyStorySessionStorage,
} from "./my-story-session-store";
import { myStoryTemplateById } from "./my-story-templates";

export type MyStoryFlowStorage = MyStorySessionStorage & MyStoryHandoffStorage;

export interface MyStoryStartFlowProps {
  /** 주소의 ?topic= 로 넘어온 주제. 이어 쓸 진행이 없을 때만 바로 첫 질문에서 시작한다. */
  readonly initialTemplateId?: MyStoryTemplateId | null;
  /** 임시저장·작품 생성 저장소. 기본은 이 브라우저의 localStorage(막혀 있으면 null). 테스트가 주입한다. */
  readonly storage?: MyStoryFlowStorage | null;
  /** 텍스트 AI 호출자. 기본은 기존 무료 우선 클라우드 텍스트 AI 경로. */
  readonly complete?: MyStoryTextCompleter;
  readonly now?: () => string;
}

type WithoutAt<T> = T extends { readonly at: string } ? Omit<T, "at"> : T;

/** restore만 시각이 없다 — 나머지 액션은 at을 붙이면 원래 액션 형태가 된다. */
function withTimestamp(action: WithoutAt<MyStoryAction>, at: string): MyStoryAction {
  return action.type === "restore" ? action : { ...action, at };
}

const AUTOSAVE_DELAY_MS = 300;

function defaultNow(): string {
  return new Date().toISOString();
}

/**
 * 이어 쓸지 아직 정하지 않은 저장본이 있는데 지금 세션에는 답이 하나도 없으면 임시저장을 건너뛴다.
 * 새 주제를 눌러 보기만 했을 뿐인데 쓰던 이야기가 빈 세션으로 덮어쓰이는 일을 막는다.
 */
function holdsUndecidedProgress(session: MyStorySession, resumable: MyStorySession | null): boolean {
  return resumable !== null && !myStoryHasProgress(session);
}

/** localStorage 접근 자체가 던질 수 있다(사생활 보호 모드·차단). 그 경우 저장소 없이 계속 동작한다. */
function browserStorage(): MyStoryFlowStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * "내 이야기를 웹툰으로" — 질문형 인터뷰 → 규칙 기반 초안 → 스튜디오 대본·콘티로 열기.
 * 상태는 인터뷰 리듀서 하나가 소유하고, 쓰는 대로 이 기기에 임시저장한다.
 */
export function MyStoryStartFlow({
  initialTemplateId = null,
  storage: storageProp,
  complete = completeMyStoryText,
  now = defaultNow,
}: MyStoryStartFlowProps) {
  const bt = useBilingual("MyStoryStartFlow");
  const navigate = useNavigate();
  const lang = useI18n((state) => state.lang);
  const locale: MyStoryLocale = lang === "ko" ? "ko" : "en";
  const storage = useMemo(() => (storageProp === undefined ? browserStorage() : storageProp), [storageProp]);

  // 처음 열 때 이 기기에 남아 있던 진행 — 자동으로 덮어쓰지 않고 이어 쓸지 묻는다.
  const [resumable, setResumable] = useState<MyStorySession | null>(() => {
    const saved = readMyStorySession(storage);
    return saved && myStoryHasProgress(saved) ? saved : null;
  });
  const [session, dispatch] = useReducer(myStoryInterviewReducer, undefined, () => {
    const at = now();
    const empty = createMyStorySession(at);
    return initialTemplateId && !resumable
      ? myStoryInterviewReducer(empty, { type: "start", templateId: initialTemplateId, at })
      : empty;
  });
  const [interacted, setInteracted] = useState(false);
  const [saveState, setSaveState] = useState<MyStorySaveState>("idle");
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const latestSession = useRef(session);
  const latestResumable = useRef(resumable);
  const handedOff = useRef(false);

  const act = useCallback((action: WithoutAt<MyStoryAction>) => {
    setInteracted(true);
    // 새 답변을 적기 시작하면 이전 저장본은 곧 대체되므로 더는 "이어 쓸 기록"으로 두지 않는다.
    if (action.type === "answer") setResumable(null);
    dispatch(withTimestamp(action, now()));
  }, [now]);

  useEffect(() => {
    latestSession.current = session;
    latestResumable.current = resumable;
  }, [session, resumable]);

  // 쓰는 대로 이 기기에만 임시저장한다(외부 저장소와의 동기화). 짧게 모아서 쓴다.
  useEffect(() => {
    if (session.templateId === null || handedOff.current) return undefined;
    const timer = window.setTimeout(() => {
      if (holdsUndecidedProgress(latestSession.current, latestResumable.current)) return;
      setSaveState(writeMyStorySession(storage, latestSession.current) ? "saved" : "failed");
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [session, storage]);

  // 화면을 떠나는 순간에는 기다리지 않고 마지막 상태를 바로 저장한다.
  useEffect(() => () => {
    if (handedOff.current || latestSession.current.templateId === null) return;
    if (holdsUndecidedProgress(latestSession.current, latestResumable.current)) return;
    writeMyStorySession(storage, latestSession.current);
  }, [storage]);

  // 단계가 바뀌면 제목(질문 단계는 입력칸)으로 초점을 옮겨 스크린리더가 새 화면을 알게 한다.
  const stageKey = session.stage === "ask" ? `ask:${session.step}` : session.stage;
  const lastStageKey = useRef(stageKey);
  useEffect(() => {
    if (lastStageKey.current === stageKey) return;
    lastStageKey.current = stageKey;
    if (session.stage !== "ask") headingRef.current?.focus();
  }, [stageKey, session.stage]);

  const template = myStoryTemplateById(session.templateId);
  const question = myStoryQuestionAt(session);
  const draft = useMemo(
    () => (session.stage === "review" ? buildMyStoryDraft(session, locale) : null),
    [session, locale],
  );

  // 주제 선택 화면에서 보여 줄 "이어 쓰기" 후보: 처음 열 때 저장돼 있던 진행, 없으면 지금 쓰던 진행.
  const resumeCandidate = resumable ?? (session.templateId !== null && myStoryHasProgress(session) ? session : null);

  function resume() {
    const target = resumable ?? session;
    setResumable(null);
    // 저장 당시가 주제 선택 화면이었어도 이어 쓰기는 질문으로 돌아간다.
    act({ type: "restore", session: { ...target, stage: target.stage === "pick" ? "ask" : target.stage } });
  }

  function discard() {
    clearMyStorySession(storage);
    setResumable(null);
    setSaveState("idle");
    setOpenError(null);
    act({ type: "reset" });
  }

  function start(templateId: MyStoryTemplateId) {
    // 저장본(resumable)은 첫 답변을 적을 때까지 그대로 둔다 — 주제만 눌러 보고 돌아와도 이어 쓸 수 있다.
    setSaveState("idle");
    act({ type: "start", templateId });
  }

  function openInStudio() {
    if (opening) return;
    if (!storage) {
      setOpenError(bt(
        "이 브라우저에서는 저장 공간을 쓸 수 없어 작품을 만들 수 없어요. 사생활 보호 모드나 저장소 차단 설정을 확인해 주세요.",
        "This browser does not allow storage, so the work cannot be created. Check private mode or storage blocking.",
      ));
      return;
    }
    setOpening(true);
    setOpenError(null);
    try {
      const result = openMyStoryInStudio(storage, session, { locale, now: now(), target: window });
      handedOff.current = true;
      // 답변은 이제 새 작품의 대본이 되었다. 같은 내용이 임시저장에 따로 남지 않게 지운다.
      clearMyStorySession(storage);
      navigate(result.href, { replace: true });
    } catch (error) {
      setOpening(false);
      setOpenError(error instanceof MyStoryHandoffError
        ? error.message
        : bt("스튜디오에서 열지 못했어요. 잠시 뒤 다시 시도해 주세요.", "Could not open the studio. Please try again in a moment."));
    }
  }

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{bt("내 이야기", "My story")}</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-fg sm:text-4xl">
          {bt("내 이야기를 웹툰으로", "Turn my story into a webtoon")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-fg-2 sm:text-base sm:leading-7">
          {bt(
            "도구가 아니라 내 이야기에서 시작해요. 질문에 답하면 4컷·8컷 초안이 만들어지고, 그 초안을 스튜디오에서 이어 그릴 수 있어요.",
            "Start from your story, not from the tools. Answer a few questions to get a 4- or 8-panel draft that you can keep working on in the studio.",
          )}
        </p>
      </header>

      <MyStoryPrivacyNotice compact={session.stage !== "pick"} />

      {session.stage === "pick" || !template ? (
        <MyStoryPickStage
          headingRef={headingRef}
          initialTemplateId={initialTemplateId}
          resumable={resumeCandidate}
          onStart={start}
          onResume={resume}
          onDiscardResumable={discard}
        />
      ) : null}

      {session.stage === "ask" && template && question ? (
        <MyStoryAskStage
          key={session.step}
          session={session}
          template={template}
          question={question}
          focusOnMount={interacted}
          saveState={saveState}
          onAnswer={(text) => act({ type: "answer", slot: question.slot, text })}
          onPrev={() => act({ type: "prev" })}
          onNext={() => act({ type: "next" })}
          onGoto={(step) => act({ type: "goto", step })}
          onReview={() => act({ type: "review" })}
          onBackToPick={() => act({ type: "back-to-pick" })}
        />
      ) : null}

      {session.stage === "review" && template && draft ? (
        <MyStoryReviewStage
          headingRef={headingRef}
          session={session}
          template={template}
          draft={draft}
          locale={locale}
          complete={complete}
          opening={opening}
          openError={openError}
          saveState={saveState}
          onTitle={(title) => act({ type: "set-title", title })}
          onCutCount={(cutCount) => act({ type: "set-cut-count", cutCount })}
          onTone={(toneId) => act({ type: "set-tone", toneId })}
          onEditQuestion={(step) => act({ type: "goto", step })}
          onAdopt={(slot, text) => act({ type: "adopt-narration", slot, text })}
          onClearNarration={(slot) => act({ type: "clear-narration", slot })}
          onOpen={openInStudio}
          onBack={() => act({ type: "prev" })}
          onRestart={discard}
        />
      ) : null}
    </div>
  );
}
