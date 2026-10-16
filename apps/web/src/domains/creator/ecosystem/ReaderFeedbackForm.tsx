import { Copy, Download, RotateCcw, Share2 } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { downloadEcosystemJson } from "./ecosystem-preview";
import { ChoiceChip, FieldError, ScaleField } from "./ReaderFeedbackFields";
import {
  buildResponseFromDraft,
  createEmptyDraft,
  type DraftError,
  type DraftErrorField,
  type KnownFeedbackTarget,
  type ReaderFeedbackDraft,
} from "./reader-feedback-draft";
import {
  EMOTION_LABELS,
  FUN_LEVEL_LABELS,
  RF_BUTTON,
  RF_CONTROL,
  RF_PRIMARY,
  UNDERSTANDING_LEVEL_LABELS,
} from "./reader-feedback-copy";
import {
  canShareReaderFeedback,
  copyReaderFeedback,
  createReaderFeedbackFile,
  readerFeedbackFilename,
  serializeReaderFeedbackFile,
  shareReaderFeedback,
} from "./reader-feedback-io";
import { READER_EMOTION_IDS, READER_FEEDBACK_LIMITS, type ReaderEmotionId } from "./reader-feedback-schema";
import { hasContactInfo } from "./reader-feedback-text";

const LIMITS = READER_FEEDBACK_LIMITS;
/** 미리보기용 응답을 만들 때만 쓰는 자리 표시 값. 화면에는 이 값 대신 "저장할 때 정해져요" 안내를 보인다. */
const PREVIEW_INSTANT = "1970-01-01T00:00:00.000Z";
const PREVIEW_ID = "preview";

type FormStatus =
  | { readonly kind: "saved"; readonly filename: string }
  | { readonly kind: "shared"; readonly filename: string }
  | { readonly kind: "copied" }
  | { readonly kind: "share-cancelled" }
  | { readonly kind: "share-failed" }
  | { readonly kind: "copy-failed" };

export interface ReaderFeedbackFormProps {
  /** 패키지·작품에서 이미 아는 대상. 없으면 독자가 작품 이름을 직접 적는다. */
  readonly target?: KnownFeedbackTarget | null;
}

function newResponseId(): string {
  return crypto.randomUUID();
}

export function ReaderFeedbackForm({ target = null }: ReaderFeedbackFormProps) {
  const bt = useBilingual("ReaderFeedback");
  const uid = useId();
  const [draft, setDraft] = useState<ReaderFeedbackDraft>(() => createEmptyDraft());
  const [errors, setErrors] = useState<readonly DraftError[]>([]);
  const [status, setStatus] = useState<FormStatus | null>(null);
  // 같은 폼에서 고쳐 다시 내보내면 같은 id 로 나가, 작가의 요약에서는 최신 한 건으로 합쳐진다.
  const [responseId, setResponseId] = useState<string | null>(null);
  const [canShare] = useState(() => canShareReaderFeedback(typeof navigator === "undefined" ? undefined : navigator, "reader-feedback.json"));

  const ids = {
    title: `${uid}-title`, episode: `${uid}-episode`, cut: `${uid}-cut`, comment: `${uid}-comment`,
    commentHint: `${uid}-comment-hint`, commentCount: `${uid}-comment-count`, nickname: `${uid}-nickname`,
    nicknameHint: `${uid}-nickname-hint`, scroll: `${uid}-scroll`, contact: `${uid}-contact`, errors: `${uid}-errors`,
  };
  const cutLimit = target?.cutCount ?? LIMITS.maxCut;

  const patch = (change: Partial<ReaderFeedbackDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setErrors([]);
    setStatus(null);
  };

  const errorOf = (field: DraftErrorField): DraftError | undefined => errors.find((error) => error.field === field);
  const messageOf = (error: DraftError): string => {
    switch (error.field) {
      case "title": return bt("작품 이름을 적어 주세요.", "Enter the story title.");
      case "episode": return bt(`회차는 1~${LIMITS.maxEpisode} 사이의 숫자로 적어 주세요.`, `Enter an episode number between 1 and ${LIMITS.maxEpisode}.`);
      case "cut": return error.code === "required"
        ? bt("멈춘 컷 번호를 적어 주세요.", "Enter the cut number where you stopped.")
        : formatI18nTemplate(bt("컷 번호는 1~{limit} 사이의 숫자로 적어 주세요.", "Enter a cut number between 1 and {limit}."), { limit: cutLimit });
      case "empty": return bt("재미·이해·읽은 정도·감정·의견 중 하나 이상 답해 주세요.", "Answer at least one of: fun, clarity, how far you read, emotions, or a comment.");
      default: return bt("입력한 내용을 파일로 만들지 못했어요. 값을 다시 확인해 주세요.", "Couldn't turn your answers into a file. Please check the values.");
    }
  };

  const preview = useMemo(() => {
    const built = buildResponseFromDraft(draft, target, { id: responseId ?? PREVIEW_ID, createdAt: PREVIEW_INSTANT });
    if (!built.ok) return null;
    // 저장할 때 정해지는 값(id·시각)만 안내 문구로 바꿔 보여 준다. 문자열 치환이 아니라 값 단위로 바꾼다.
    const pending = bt("(저장할 때 정해져요)", "(set when you save)");
    const file = createReaderFeedbackFile(built.response, PREVIEW_INSTANT);
    return JSON.stringify({
      ...file,
      exportedAt: pending,
      responses: file.responses.map((response) => ({ ...response, id: responseId ?? pending, createdAt: pending })),
    }, null, 2);
  }, [draft, target, responseId, bt]);

  const exportWith = async (method: "download" | "share" | "copy") => {
    const id = responseId ?? newResponseId();
    if (responseId === null) setResponseId(id);
    const now = new Date().toISOString();
    const built = buildResponseFromDraft(draft, target, { id, createdAt: now });
    if (!built.ok) {
      setErrors(built.errors);
      setStatus(null);
      const first = built.errors[0];
      const focusId = first ? (first.field === "empty" || first.field === "schema" ? ids.comment : ids[first.field]) : null;
      if (focusId) document.getElementById(focusId)?.focus();
      return;
    }
    setErrors([]);
    const file = createReaderFeedbackFile(built.response, now);
    const filename = readerFeedbackFilename(built.response);
    if (method === "download") {
      downloadEcosystemJson(filename, file);
      setStatus({ kind: "saved", filename });
      return;
    }
    const json = serializeReaderFeedbackFile(file);
    if (method === "share") {
      const outcome = await shareReaderFeedback(navigator, json, filename, built.response.target.title);
      setStatus(outcome === "shared" ? { kind: "shared", filename } : outcome === "cancelled" ? { kind: "share-cancelled" } : { kind: "share-failed" });
      return;
    }
    const outcome = await copyReaderFeedback(navigator.clipboard, json);
    setStatus(outcome === "copied" ? { kind: "copied" } : { kind: "copy-failed" });
  };

  const startOver = () => {
    setResponseId(null);
    setDraft(createEmptyDraft());
    setErrors([]);
    setStatus(null);
  };

  const statusText = (() => {
    if (!status) return "";
    switch (status.kind) {
      case "saved": return formatI18nTemplate(bt("{filename} 파일을 저장했어요. 작가에게 이 파일을 보내 주세요. 서버로는 아무것도 보내지 않았어요.", "Saved {filename}. Send this file to the author. Nothing was uploaded to a server."), { filename: status.filename });
      case "shared": return formatI18nTemplate(bt("{filename} 파일을 공유했어요.", "Shared {filename}."), { filename: status.filename });
      case "copied": return bt("내용을 복사했어요. 작가에게 붙여 넣어 보내거나, 파일로도 저장할 수 있어요.", "Copied. Paste it to the author, or save it as a file instead.");
      case "share-cancelled": return bt("공유를 취소했어요. 파일 저장이나 복사를 이용할 수도 있어요.", "Sharing was cancelled. You can still save a file or copy the text.");
      case "share-failed": return bt("공유하지 못했어요. 파일로 저장하거나 복사해 보내 주세요.", "Couldn't share. Save a file or copy the text instead.");
      default: return bt("복사하지 못했어요. 아래 '내보낼 내용 미리 보기'에서 직접 선택해 복사하거나 파일로 저장해 주세요.", "Couldn't copy. Select the text under 'Preview what will be exported' yourself, or save a file.");
    }
  })();
  const statusIsError = status?.kind === "share-failed" || status?.kind === "copy-failed";
  const finished = status?.kind === "saved" || status?.kind === "shared" || status?.kind === "copied";

  const toggleEmotion = (id: ReaderEmotionId) => patch({
    emotions: draft.emotions.includes(id) ? draft.emotions.filter((item) => item !== id) : [...draft.emotions, id],
  });
  const clearLabel = bt("선택 취소", "Clear choice");
  const contactWarning = hasContactInfo(draft.comment) || hasContactInfo(draft.nickname);
  const titleError = errorOf("title");
  const episodeError = errorOf("episode");
  const cutError = errorOf("cut");

  return (
    <section aria-labelledby={`${uid}-heading`} className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <h3 id={`${uid}-heading`} className="text-lg font-black text-fg">{bt("회차 피드백 남기기", "Leave feedback on an episode")}</h3>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
        {bt(
          "재미·이해·멈춘 곳·감정을 가볍게 남기면 작가가 여러 독자의 응답을 모아 봅니다. 서버로 보내지 않고, 만들어진 파일을 작가에게 직접 전달해요.",
          "Leave a quick note on how fun and clear it was, where you stopped, and how it felt. The author combines files from many readers. Nothing is uploaded — you send the file to the author yourself.",
        )}
      </p>
      <form
        noValidate
        className="mt-5 space-y-6"
        onSubmit={(event) => { event.preventDefault(); void exportWith("download"); }}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="min-w-0 space-y-6">
            {target ? (
              <p className="text-sm text-fg-2">
                {bt("대상", "Target")}: <strong className="text-fg [overflow-wrap:anywhere]">{target.title}</strong>
                {target.episode ? <span>{formatI18nTemplate(bt(" · {n}화", " · Ep. {n}"), { n: target.episode })}</span> : null}
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor={ids.title} className="text-sm font-bold text-fg">{bt("작품 이름", "Story title")}</label>
                  <input
                    id={ids.title} className={`${RF_CONTROL} mt-1`} value={draft.title} maxLength={LIMITS.maxTitleLength}
                    aria-invalid={titleError ? true : undefined} aria-describedby={titleError ? `${ids.title}-error` : undefined}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                  {titleError ? <FieldError id={`${ids.title}-error`}>{messageOf(titleError)}</FieldError> : null}
                </div>
                <div>
                  <label htmlFor={ids.episode} className="text-sm font-bold text-fg">{bt("회차 번호 (선택)", "Episode number (optional)")}</label>
                  <input
                    id={ids.episode} className={`${RF_CONTROL} mt-1 max-w-40`} inputMode="numeric" value={draft.episode} maxLength={5}
                    aria-invalid={episodeError ? true : undefined} aria-describedby={episodeError ? `${ids.episode}-error` : undefined}
                    onChange={(event) => patch({ episode: event.target.value })}
                  />
                  {episodeError ? <FieldError id={`${ids.episode}-error`}>{messageOf(episodeError)}</FieldError> : null}
                </div>
              </div>
            )}

            <ScaleField legend={bt("얼마나 재밌었나요?", "How fun was it?")} name={`${uid}-fun`} labels={FUN_LEVEL_LABELS} value={draft.fun} onChange={(fun) => patch({ fun })} localize={bt} clearLabel={clearLabel} />
            <ScaleField legend={bt("내용이 잘 이해됐나요?", "Was it easy to follow?")} name={`${uid}-understanding`} labels={UNDERSTANDING_LEVEL_LABELS} value={draft.understanding} onChange={(understanding) => patch({ understanding })} localize={bt} clearLabel={clearLabel} />

            <fieldset className="min-w-0">
              <legend className="text-sm font-bold text-fg">{bt("어디까지 읽었나요?", "How far did you read?")}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <ChoiceChip type="radio" name={`${uid}-reading`} value="finished" checked={draft.reading === "finished"} onChange={() => patch({ reading: "finished" })}>{bt("끝까지 읽었어요", "I finished it")}</ChoiceChip>
                <ChoiceChip type="radio" name={`${uid}-reading`} value="left" checked={draft.reading === "left"} onChange={() => patch({ reading: "left" })}>{bt("중간에 멈췄어요", "I stopped partway")}</ChoiceChip>
              </div>
              {draft.reading !== "unset" ? (
                <button
                  type="button"
                  onClick={() => patch({ reading: "unset" })}
                  className="mt-1 min-h-11 rounded-lg px-2 text-xs font-bold text-fg-3 underline underline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {clearLabel}
                </button>
              ) : null}
              {draft.reading === "left" ? (
                <div className="mt-3 space-y-3 border-l-2 border-line pl-3">
                  <fieldset className="min-w-0">
                    <legend className="text-sm font-bold text-fg">{bt("멈춘 곳을 알려 주는 방법", "How to point to where you stopped")}</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <ChoiceChip type="radio" name={`${uid}-mode`} value="cut" checked={draft.pointMode === "cut"} onChange={() => patch({ pointMode: "cut" })}>{bt("컷 번호", "Cut number")}</ChoiceChip>
                      <ChoiceChip type="radio" name={`${uid}-mode`} value="scroll" checked={draft.pointMode === "scroll"} onChange={() => patch({ pointMode: "scroll" })}>{bt("스크롤 위치", "Scroll position")}</ChoiceChip>
                    </div>
                  </fieldset>
                  {draft.pointMode === "cut" ? (
                    <div>
                      <label htmlFor={ids.cut} className="text-sm font-bold text-fg">{bt("몇 번째 컷에서 멈췄나요?", "Which cut did you stop at?")}</label>
                      <input
                        id={ids.cut} className={`${RF_CONTROL} mt-1 max-w-40`} type="number" inputMode="numeric" min={1} max={cutLimit} value={draft.cut}
                        aria-invalid={cutError ? true : undefined} aria-describedby={cutError ? `${ids.cut}-error` : `${ids.cut}-hint`}
                        onChange={(event) => patch({ cut: event.target.value })}
                      />
                      <p id={`${ids.cut}-hint`} className="mt-1 text-xs text-fg-3">
                        {target?.cutCount
                          ? formatI18nTemplate(bt("이 회차는 모두 {count}컷이에요.", "This episode has {count} cuts in total."), { count: target.cutCount })
                          : bt("컷을 세기 어려우면 '스크롤 위치'로 알려 주세요.", "If counting cuts is hard, use 'Scroll position' instead.")}
                      </p>
                      {cutError ? <FieldError id={`${ids.cut}-error`}>{messageOf(cutError)}</FieldError> : null}
                    </div>
                  ) : (
                    <div>
                      <label htmlFor={ids.scroll} className="text-sm font-bold text-fg">{bt("회차 전체 중 어디쯤에서 멈췄나요?", "Roughly where in the episode did you stop?")}</label>
                      <div className="mt-1 flex items-center gap-3">
                        <input
                          id={ids.scroll} className="min-h-11 w-full accent-[var(--color-accent)]" type="range" min={0} max={100} step={5} value={draft.scroll}
                          aria-valuetext={formatI18nTemplate(bt("맨 위에서 {percent}% 내려온 곳", "{percent}% down from the top"), { percent: draft.scroll })}
                          onChange={(event) => patch({ scroll: Number(event.target.value) })}
                        />
                        <output htmlFor={ids.scroll} className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-fg">{draft.scroll}%</output>
                      </div>
                      <p className="mt-1 flex justify-between text-xs text-fg-3"><span>{bt("맨 위", "Top")}</span><span>{bt("맨 아래", "Bottom")}</span></p>
                    </div>
                  )}
                </div>
              ) : null}
            </fieldset>
          </div>

          <div className="min-w-0 space-y-6">
            <fieldset className="min-w-0">
              <legend className="text-sm font-bold text-fg">
                {bt(`느낀 감정 (최대 ${LIMITS.maxEmotions}개)`, `How it felt (up to ${LIMITS.maxEmotions})`)}
                <span className="ml-2 text-xs font-normal text-fg-3" aria-live="polite">{draft.emotions.length}/{LIMITS.maxEmotions}</span>
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {READER_EMOTION_IDS.map((id) => {
                  const checked = draft.emotions.includes(id);
                  return (
                    <ChoiceChip key={id} type="checkbox" name={`${uid}-emotion`} value={id} checked={checked} disabled={!checked && draft.emotions.length >= LIMITS.maxEmotions} onChange={() => toggleEmotion(id)}>
                      {bt(EMOTION_LABELS[id].ko, EMOTION_LABELS[id].en)}
                    </ChoiceChip>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor={ids.comment} className="text-sm font-bold text-fg">{bt("자유 의견 (선택)", "Comment (optional)")}</label>
              <textarea
                id={ids.comment} className={`${RF_CONTROL} mt-1`} rows={5} maxLength={LIMITS.maxCommentLength} value={draft.comment}
                placeholder={bt("어디에서 멈추거나 다시 읽었는지, 좋았던 점을 적어 주세요.", "Where did you stop or re-read? What worked well?")}
                aria-describedby={`${ids.commentHint} ${ids.commentCount}${contactWarning ? ` ${ids.contact}` : ""}`}
                onChange={(event) => patch({ comment: event.target.value })}
              />
              <p id={ids.commentHint} className="mt-1 text-xs text-fg-3">{bt("그림·글 수정 지시나 작가 평가 대신, 읽은 사람으로서 느낀 점을 적어 주세요.", "Describe what you felt as a reader rather than giving drawing or writing orders.")}</p>
              <p id={ids.commentCount} className="text-right text-xs tabular-nums text-fg-3">{draft.comment.length}/{LIMITS.maxCommentLength}</p>
              <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-fg-2">
                <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={draft.spoiler} onChange={(event) => patch({ spoiler: event.target.checked })} />
                {bt("이 의견에는 줄거리 스포일러가 있어요", "This comment contains story spoilers")}
              </label>
            </div>

            <div>
              <label htmlFor={ids.nickname} className="text-sm font-bold text-fg">{bt("닉네임 (선택)", "Nickname (optional)")}</label>
              <input
                id={ids.nickname} className={`${RF_CONTROL} mt-1`} value={draft.nickname} maxLength={LIMITS.maxNicknameLength} autoComplete="off"
                aria-describedby={`${ids.nicknameHint}${contactWarning ? ` ${ids.contact}` : ""}`}
                onChange={(event) => patch({ nickname: event.target.value })}
              />
              <p id={ids.nicknameHint} className="mt-1 text-xs text-fg-3">{bt("비워도 돼요. 실명·연락처·계정 이름은 적지 마세요.", "You can leave it empty. Don't use your real name, contact info, or account name.")}</p>
            </div>
            {contactWarning ? (
              <p id={ids.contact} role="status" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs leading-5 text-fg">
                {bt("이메일·전화번호처럼 보이는 내용은 파일에 담을 때 [연락처 가림]으로 바뀌거나 비워져요.", "Anything that looks like an email or phone number is masked as [contact hidden] or dropped when saved.")}
              </p>
            ) : null}
          </div>
        </div>

        <p className="border-t border-line pt-4 text-xs leading-5 text-fg-3">
          {bt("파일에는 위에서 답한 내용만 담겨요. 이메일·IP·계정 정보는 담지 않아요.", "The file only holds the answers above — no email, IP address, or account details.")}
        </p>

        {errors.length > 0 ? (
          <div id={ids.errors} role="alert" className="rounded-lg border border-bad/35 bg-bad/10 p-3 text-sm text-bad">
            <p className="font-bold">{bt("입력을 확인해 주세요", "Please check your answers")}</p>
            <ul className="mt-1 list-disc pl-5">{errors.map((error) => <li key={`${error.field}-${error.code}`}>{messageOf(error)}</li>)}</ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={RF_PRIMARY}><Download size={16} aria-hidden /> {bt("파일로 저장", "Save as file")}</button>
          {canShare ? <button type="button" className={RF_BUTTON} onClick={() => void exportWith("share")}><Share2 size={16} aria-hidden /> {bt("공유하기", "Share")}</button> : null}
          <button type="button" className={RF_BUTTON} onClick={() => void exportWith("copy")}><Copy size={16} aria-hidden /> {bt("내용 복사", "Copy text")}</button>
          {finished ? <button type="button" className={RF_BUTTON} onClick={startOver}><RotateCcw size={16} aria-hidden /> {bt("새 의견 쓰기", "Write another")}</button> : null}
        </div>

        <p role={statusIsError ? "alert" : "status"} className={statusIsError ? "text-sm font-bold text-bad" : "text-sm text-fg-2"}>{statusText}</p>

        <details className="border-t border-line pt-4">
          <summary className="min-h-11 cursor-pointer text-sm font-bold text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {bt("내보낼 내용 미리 보기", "Preview what will be exported")}
          </summary>
          {preview ? (
            <textarea
              readOnly rows={14} value={preview} spellCheck={false}
              aria-label={bt("내보낼 파일 내용 (읽기 전용)", "File content to export (read-only)")}
              className={`${RF_CONTROL} mt-2 font-mono text-xs`}
            />
          ) : (
            <p className="mt-2 text-sm text-fg-3">{bt("답할 내용을 입력하면 여기에 파일 내용이 보여요.", "Fill in your answers and the file content appears here.")}</p>
          )}
        </details>
      </form>
    </section>
  );
}
