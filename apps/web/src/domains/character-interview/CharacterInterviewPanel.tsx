/**
 * 캐릭터 인터뷰 패널 — 작가가 자기 캐릭터와 대화하며 설정·말투를 검증하는 표면.
 *
 * 동선:
 *  1. 캐릭터를 고르면 캐논 시트 근거(고정된 필드·빈 필드)가 먼저 보인다.
 *     성격·말투가 비면 인터뷰를 시작할 수 없고 "시트 쓰기"가 첫 행동이다.
 *  2. 검증 질문 칩이나 자유 질문으로 대화한다. 생성은 character-chat
 *     엔진을 재사용하는 인터뷰 어댑터가 맡고, 인터뷰 대화는 팬 챗
 *     세션·스토어와 섞이지 않게 이 패널 안에서만 유지한다.
 *  3. 캐릭터 답변마다 "설정 메모로 저장"이 붙는다. 종류를 고르면 메모가
 *     되고, 시트에 덧붙일 수 있는 종류는 반영 미리보기(패치)까지 보여준다.
 *     실제 시트 저장은 호스트 콜백 몫이다 — 패널이 시트를 몰래 고치지 않는다.
 *
 * 상태 계약: 미설정(not_configured)은 가짜 답변 대신 키 등록 안내를,
 * 에러는 원인과 다시 시도를, 빈 상태는 근거 카드 + 질문 칩으로 안내한다.
 */

import { BookOpen, Save, Send } from "lucide-react";
import { useMemo, useState } from "react";

import type { StudioStoryBibleNarrative } from "../creator/planning/studio-character-profile";
import type { StudioStoryBible } from "../creator/studio-story-bible";

import {
  buildCharacterInterviewCanon,
  buildInterviewMemo,
  buildInterviewQuestionChips,
  findInterviewExchange,
  interviewMemoSheetPatch,
  INTERVIEW_GROUNDING_FIELD_LABELS,
  INTERVIEW_MEMO_KIND_LABELS,
  INTERVIEW_MEMO_KINDS,
  type CharacterInterviewMemo,
  type CharacterInterviewMessage,
  type InterviewMemoKind,
} from "./character-interview";
import type { CharacterInterviewEngine } from "./character-interview-engine";

export interface CharacterInterviewPanelProps {
  readonly bible: StudioStoryBible;
  readonly narrative: StudioStoryBibleNarrative;
  /** character-chat 엔진을 감싼 인터뷰 엔진(호스트가 resolveCharacterChatEngine 결과를 주입). */
  readonly engine: CharacterInterviewEngine;
  /** AI 키가 등록돼 대화할 수 있는 상태인지. */
  readonly ready: boolean;
  readonly workTitle?: string;
  readonly authorName?: string;
  readonly initialCharacterId?: string;
  /** 저장된 메모(controlled). 없으면 패널 내부에 쌓는다. */
  readonly memos?: readonly CharacterInterviewMemo[];
  readonly onSaveMemo?: (memo: CharacterInterviewMemo) => void;
  /** 캐논 시트 쓰기/편집 화면으로 보내는 동선. */
  readonly onOpenCanonSheet?: (characterId: string) => void;
  /** AI 키 등록 화면(/settings/ai)으로 보내는 동선. */
  readonly onOpenAiSettings?: () => void;
}

let messageSeq = 0;
function nextMessageId(): string {
  messageSeq += 1;
  return `interview-msg-${messageSeq}`;
}

function MemoSaveRow(props: {
  readonly disabled: boolean;
  readonly onSave: (kind: InterviewMemoKind) => void;
}) {
  const [kind, setKind] = useState<InterviewMemoKind>("free");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        aria-label="메모 종류"
        value={kind}
        disabled={props.disabled}
        onChange={(event) => setKind(event.target.value as InterviewMemoKind)}
        className="min-h-9 rounded-lg border border-line bg-panel px-2 text-xs font-semibold text-fg-2"
      >
        {INTERVIEW_MEMO_KINDS.map((entry) => (
          <option key={entry} value={entry}>
            {INTERVIEW_MEMO_KIND_LABELS[entry]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => props.onSave(kind)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-accent disabled:opacity-50"
      >
        <Save size={13} aria-hidden />
        설정 메모로 저장
      </button>
    </div>
  );
}

export function CharacterInterviewPanel(props: CharacterInterviewPanelProps) {
  const characters = props.bible.characters;
  const [characterId, setCharacterId] = useState<string>(
    props.initialCharacterId ?? characters[0]?.id ?? "",
  );
  const canon = useMemo(
    () =>
      characterId
        ? buildCharacterInterviewCanon(props.bible, props.narrative, characterId, {
            workTitle: props.workTitle,
            authorName: props.authorName,
          })
        : null,
    [props.bible, props.narrative, characterId, props.workTitle, props.authorName],
  );
  const chips = useMemo(() => (canon ? buildInterviewQuestionChips(canon) : []), [canon]);

  const [messagesByCharacter, setMessagesByCharacter] = useState<
    Readonly<Record<string, readonly CharacterInterviewMessage[]>>
  >({});
  const [internalMemos, setInternalMemos] = useState<readonly CharacterInterviewMemo[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const messages = (characterId ? messagesByCharacter[characterId] : undefined) ?? [];
  const memos = props.memos ?? internalMemos;
  const characterMemos = memos.filter((memo) => memo.characterId === characterId);
  const sheetProfile =
    props.narrative.profiles.find((profile) => profile.characterId === characterId) ?? null;
  const canChat = Boolean(canon?.grounding.grounded) && props.ready;

  const send = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || sending || !canon || !canChat) return;
    const history = messages;
    const authorMessage: CharacterInterviewMessage = {
      id: nextMessageId(),
      role: "author",
      text,
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [...history, authorMessage];
    setMessagesByCharacter((prev) => ({ ...prev, [characterId]: nextHistory }));
    setDraft("");
    setError(null);
    setSavedNotice(null);
    setSending(true);
    const result = await props.engine.generateReply({
      profile: canon.profile,
      history,
      userText: text,
    });
    setSending(false);
    if (result.ok) {
      setNotConfigured(false);
      const characterMessage: CharacterInterviewMessage = {
        id: nextMessageId(),
        role: "character",
        text: result.text,
        createdAt: new Date().toISOString(),
      };
      setMessagesByCharacter((prev) => ({
        ...prev,
        [characterId]: [...nextHistory, characterMessage],
      }));
    } else {
      if (result.code === "not_configured") setNotConfigured(true);
      setError(result.error);
    }
  };

  const saveMemo = (answer: CharacterInterviewMessage, kind: InterviewMemoKind) => {
    if (!canon) return;
    const exchange = findInterviewExchange(messages, answer.id);
    const memo = buildInterviewMemo({
      characterId,
      characterName: canon.grounding.characterName,
      kind,
      answer,
      question: exchange?.question ?? null,
    });
    if (!memo) return;
    if (props.onSaveMemo) props.onSaveMemo(memo);
    else setInternalMemos((prev) => [memo, ...prev]);
    setSavedNotice(`"${memo.title}"를 저장했어요.`);
  };

  if (characters.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-base font-black text-fg">캐릭터 인터뷰</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          아직 캐릭터가 없어요. 스토리 바이블에 캐릭터를 먼저 만들면 그 캐릭터와 인터뷰할 수
          있어요.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col rounded-2xl border border-line bg-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="text-base font-black text-fg">캐릭터 인터뷰</h2>
        <label className="sr-only" htmlFor="character-interview-character">
          인터뷰할 캐릭터
        </label>
        <select
          id="character-interview-character"
          value={characterId}
          onChange={(event) => {
            setCharacterId(event.target.value);
            setDraft("");
            setError(null);
            setSavedNotice(null);
          }}
          className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg"
        >
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
        {props.onOpenCanonSheet && characterId ? (
          <button
            type="button"
            onClick={() => props.onOpenCanonSheet?.(characterId)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
          >
            <BookOpen size={15} aria-hidden />
            캐논 시트 열기
          </button>
        ) : null}
      </header>

      {canon ? (
        <div className="border-b border-line bg-panel px-4 py-3" aria-label="캐논 근거">
          <p className="text-xs font-bold text-fg-3">
            캐논 근거 고정 — 답변은 아래 시트 내용만 근거로 만들어요.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {canon.grounding.sourcedFields.map((field) => (
              <span
                key={field}
                className="rounded-full bg-accent-soft px-2.5 py-1 text-[0.7rem] font-bold text-accent"
              >
                {INTERVIEW_GROUNDING_FIELD_LABELS[field]} 고정됨
              </span>
            ))}
            {canon.grounding.missingFields.map((field) => (
              <span
                key={field}
                className="rounded-full border border-line px-2.5 py-1 text-[0.7rem] font-semibold text-fg-3"
              >
                {INTERVIEW_GROUNDING_FIELD_LABELS[field]} 비어 있음
              </span>
            ))}
          </div>
          {!canon.grounding.grounded ? (
            <p role="alert" className="mt-2 text-xs leading-relaxed text-warn">
              성격과 말투가 시트에 있어야 인터뷰를 시작할 수 있어요. 비어 있는 항목을 먼저
              채워 주세요 — 근거 없는 답은 설정 검증이 되지 않아요.
            </p>
          ) : null}
        </div>
      ) : null}

      <ul role="log" aria-label="인터뷰 내용" className="flex max-h-[26rem] flex-col gap-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <li className="text-sm leading-relaxed text-fg-2">
            {canon?.grounding.grounded
              ? `${canon.grounding.characterName}에게 설정과 말투를 물어보세요. 아래 질문 칩으로 바로 시작할 수 있어요.`
              : "캐논 시트를 채우면 인터뷰를 시작할 수 있어요."}
          </li>
        ) : null}
        {messages.map((message) => (
          <li
            key={message.id}
            className={message.role === "author" ? "flex flex-col items-end" : "flex flex-col items-start"}
          >
            <p
              className={
                message.role === "author"
                  ? "inline-block max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-left text-sm leading-relaxed text-on-accent"
                  : "inline-block max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-panel px-3.5 py-2.5 text-left text-sm leading-relaxed text-fg"
              }
            >
              {message.text}
            </p>
            {message.role === "character" ? (
              <MemoSaveRow disabled={sending} onSave={(kind) => saveMemo(message, kind)} />
            ) : null}
          </li>
        ))}
        {sending ? (
          <li className="text-sm text-fg-3">{canon?.grounding.characterName}님이 답을 쓰는 중…</li>
        ) : null}
      </ul>

      <div className="border-t border-line px-4 py-3">
        {chips.length > 0 && canon?.grounding.grounded ? (
          <div className="mb-3 flex flex-wrap gap-1.5" aria-label="검증 질문">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={!canChat || sending}
                onClick={() => void send(chip)}
                className="min-h-9 rounded-full border border-line px-3 text-xs font-semibold text-fg-2 hover:border-accent/50 hover:text-accent disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
        ) : null}
        {notConfigured ? (
          <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 text-xs leading-relaxed text-warn">
            <span className="flex-1">
              AI 키를 등록하면 인터뷰를 시작할 수 있어요. 키가 없어도 캐논 시트 근거는 위에서
              확인할 수 있어요.
            </span>
            {props.onOpenAiSettings ? (
              <button
                type="button"
                onClick={props.onOpenAiSettings}
                className="min-h-9 rounded-lg border border-line px-3 font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
              >
                AI 키 등록하기
              </button>
            ) : null}
          </div>
        ) : null}
        {error && !notConfigured ? (
          <p role="alert" className="mb-2 text-xs leading-relaxed text-bad">
            {error}
          </p>
        ) : null}
        {savedNotice ? (
          <p className="mb-2 text-xs font-semibold text-accent">{savedNotice}</p>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
          className="flex items-end gap-2"
        >
          <label className="sr-only" htmlFor="character-interview-input">
            캐릭터에게 물어볼 질문
          </label>
          <textarea
            id="character-interview-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(draft);
              }
            }}
            rows={2}
            maxLength={1000}
            disabled={!canChat || sending}
            placeholder={
              !canon?.grounding.grounded
                ? "캐논 시트의 성격·말투를 먼저 채워 주세요"
                : !props.ready
                  ? "AI 키를 등록하면 인터뷰할 수 있어요"
                  : `${canon.grounding.characterName}에게 물어보세요`
            }
            className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canChat || sending || !draft.trim()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={15} aria-hidden />
            묻기
          </button>
        </form>
      </div>

      {characterMemos.length > 0 ? (
        <div className="border-t border-line px-4 py-3" aria-label="저장한 설정 메모">
          <h3 className="text-sm font-black text-fg">설정 메모 ({characterMemos.length})</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {characterMemos.map((memo) => {
              const patch = interviewMemoSheetPatch(memo, sheetProfile);
              return (
                <li key={memo.id} className="rounded-xl border border-line bg-panel px-3 py-2.5">
                  <p className="text-xs font-bold text-fg-2">{memo.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-fg">{memo.body}</p>
                  {patch ? (
                    <p className="mt-1 text-[0.7rem] leading-relaxed text-fg-3">
                      {patch.alreadyReflected
                        ? `이미 시트 ${patch.fieldLabel}에 반영돼 있어요.`
                        : `시트 ${patch.fieldLabel}에 덧붙일 수 있어요 — 캐논 시트에서 확인하고 저장해 주세요.`}
                    </p>
                  ) : (
                    <p className="mt-1 text-[0.7rem] leading-relaxed text-fg-3">
                      자유 메모는 시트에 바로 붙지 않아요. 작가 메모로만 남아요.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
