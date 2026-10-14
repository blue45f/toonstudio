/**
 * 창작 멘토 챗 패널 — 페르소나를 골라 묻고 배우는 창작 보조 표면.
 *
 * 상태 계약:
 * - 빈 상태: 페르소나 인사 + 추천 질문 칩이 첫 행동을 안내한다.
 * - 미설정 상태: 엔진이 not_configured를 돌려주면 가짜 답변 대신 키 등록
 *   안내와 페르소나의 "준비된 안내"(물을 수 있는 주제)를 보여준다.
 * - 로딩: 전송 중에는 입력·전송이 잠기고 취소할 수 있다.
 * - 에러: 원인과 다음 행동(다시 시도 / 키 등록)을 함께 보여준다.
 * 답변 조절(난이도·길이·창의성)은 세그먼트 컨트롤로 상시 노출한다 —
 * 투닝 챗의 조절 설정을 흡수하되, 설정 탭 뒤에 숨기지 않는다.
 */

import { useMemo, useRef, useState } from "react";

import { AnswerTuningControls } from "../creator/ai/AnswerTuningControls";
import type { MentorEngine, MentorEngineResult } from "./creator-mentor-engine";
import { MENTOR_PERSONAS } from "./creator-mentor-personas";
import {
  DEFAULT_MENTOR_CONTROLS,
  type MentorAnswerControls,
  type MentorChatMessage,
  type MentorPersona,
  type MentorPersonaId,
} from "./creator-mentor-types";

export interface CreatorMentorChatPanelProps {
  readonly engine: MentorEngine;
  /** AI 키 등록 화면(/settings/ai)으로 보내는 동선. */
  readonly onOpenAiSettings: () => void;
}

type SendState =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "error"; readonly message: string; readonly code: string };

export function CreatorMentorChatPanel(props: CreatorMentorChatPanelProps) {
  const [personaId, setPersonaId] = useState<MentorPersonaId>("story-mentor");
  const persona: MentorPersona = useMemo(
    () => MENTOR_PERSONAS.find((entry) => entry.id === personaId) ?? MENTOR_PERSONAS[0],
    [personaId],
  );
  const [controls, setControls] = useState<MentorAnswerControls>(DEFAULT_MENTOR_CONTROLS);
  const [messagesByPersona, setMessagesByPersona] = useState<
    Partial<Record<MentorPersonaId, readonly MentorChatMessage[]>>
  >({});
  const [draft, setDraft] = useState("");
  const [sendState, setSendState] = useState<SendState>({ kind: "idle" });
  const [notConfigured, setNotConfigured] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const messages = messagesByPersona[personaId] ?? [];
  const sending = sendState.kind === "sending";

  const send = async (text: string) => {
    const userText = text.trim();
    if (!userText || sending) return;
    const history = messages;
    const nextHistory: readonly MentorChatMessage[] = [
      ...history,
      { role: "creator", text: userText },
    ];
    setMessagesByPersona((prev) => ({ ...prev, [personaId]: nextHistory }));
    setDraft("");
    setSendState({ kind: "sending" });
    const controller = new AbortController();
    abortRef.current = controller;
    const result: MentorEngineResult = await props.engine.generateReply({
      persona,
      controls,
      history,
      userText,
      signal: controller.signal,
    });
    abortRef.current = null;
    if (result.ok) {
      setNotConfigured(false);
      setMessagesByPersona((prev) => ({
        ...prev,
        [personaId]: [...nextHistory, { role: "mentor", text: result.text }],
      }));
      setSendState({ kind: "idle" });
    } else {
      if (result.code === "not_configured") setNotConfigured(true);
      setSendState({ kind: "error", message: result.error, code: result.code });
    }
  };

  return (
    <section aria-label="창작 멘토 챗" className="flex flex-col gap-4">
      {/* 페르소나 선택 */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="멘토 선택">
        {MENTOR_PERSONAS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={entry.id === personaId}
            onClick={() => {
              setPersonaId(entry.id);
              setSendState({ kind: "idle" });
            }}
            className={
              entry.id === personaId
                ? "min-h-11 rounded-2xl border border-accent bg-accent/10 px-4 text-left"
                : "min-h-11 rounded-2xl border border-line bg-panel px-4 text-left hover:bg-panel-2"
            }
          >
            <span className="block text-sm font-bold text-fg">{entry.name}</span>
            <span className="block text-xs text-fg-3">{entry.roleLabel}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-fg-2">{persona.description}</p>

      {/* 답변 조절 — 난이도·길이·창의성 (공통 부품 AnswerTuningControls) */}
      <AnswerTuningControls value={controls} onChange={setControls} disabled={sending} />

      {/* 대화 영역 */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm leading-relaxed text-fg">{persona.greeting}</p>
            <p className="mt-3 text-xs font-bold text-fg-3">이렇게 물어보세요</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {persona.questionChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void send(chip)}
                  disabled={sending}
                  className="min-h-9 rounded-full border border-line bg-panel-2 px-3 text-xs font-semibold text-fg-2 hover:text-fg"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3" aria-live="polite">
            {messages.map((message, index) => (
              <li
                key={index}
                className={
                  message.role === "creator"
                    ? "self-end rounded-2xl bg-accent/10 px-4 py-2 text-sm text-fg"
                    : "self-start rounded-2xl bg-panel-2 px-4 py-2 text-sm leading-relaxed text-fg"
                }
              >
                {message.text}
              </li>
            ))}
          </ul>
        )}
        {sending ? (
          <p className="flex items-center gap-3 text-sm text-fg-3">
            멘토가 답을 준비하고 있어요…
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="min-h-9 rounded-full border border-line px-3 text-xs font-bold text-fg-2"
            >
              취소
            </button>
          </p>
        ) : null}
      </div>

      {/* 미설정 안내 — 가짜 답변 대신 준비된 안내와 키 등록 동선 */}
      {notConfigured ? (
        <div className="rounded-2xl border border-line bg-panel-2 p-4" role="note">
          <p className="text-sm font-bold text-fg">
            AI 키를 등록하면 {persona.name}와 대화를 시작할 수 있어요.
          </p>
          <p className="mt-1 text-sm text-fg-2">
            그전까지는 이 멘토에게 물을 수 있는 주제를 먼저 확인해 보세요.
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-fg-2">
            {persona.starterTopics.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={props.onOpenAiSettings}
            className="mt-3 min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-white"
          >
            AI 키 등록하러 가기
          </button>
        </div>
      ) : null}

      {/* 에러 — 원인 + 다음 행동 */}
      {sendState.kind === "error" && !notConfigured ? (
        <p className="rounded-2xl border border-line bg-panel-2 px-4 py-3 text-sm text-fg-2" role="alert">
          {sendState.message}
        </p>
      ) : null}

      {/* 입력 */}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor="mentor-chat-input" className="sr-only">
          {persona.name}에게 질문
        </label>
        <input
          id="mentor-chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`${persona.name}에게 물어보세요`}
          className="min-h-12 flex-1 rounded-2xl border border-line bg-panel px-4 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="min-h-12 rounded-2xl bg-accent px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          보내기
        </button>
      </form>
    </section>
  );
}
