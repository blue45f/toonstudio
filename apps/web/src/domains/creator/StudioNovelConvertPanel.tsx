/**
 * Studio Novel Convert Panel — 소설 텍스트 → 글콘티 초안 변환 화면.
 *
 * 작가실(StudioWriterRoomPanel) 안에서 열리는 하위 화면이다. 흐름:
 *  1) 소설 텍스트 붙여넣기 또는 .txt 파일 선택
 *  2) 규칙 기반 파서(studio-novel-convert)가 만든 초안을 컷 단위로 편집
 *     (합치기·나누기·순서 변경·화자 지정)
 *  3) 화자 이름을 캐릭터 사전 항목과 연결하고 작가실 문서에 반영
 *
 * 정직성 경계:
 *  - 화자 추정(inferred)은 "추정" 배지로 구분해 사실처럼 보이지 않게 한다.
 *  - AI 보강은 통합 API 키가 등록된 경우의 자리만 있고, 이번 단계에서는
 *    실제 AI 호출을 하지 않는다. 키가 없으면 그 사실을 안내한다.
 *  - 기존 장면·컷·대사가 있으면 교체 경고를 확인받기 전에는 반영하지 않는다.
 */

import {
  ArrowDown,
  ArrowUp,
  FileText,
  KeyRound,
  Merge,
  Scissors,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";

import { useUserAi } from "@/shared/ai/user-ai-store";
import { USER_AI_SETTINGS_HREF } from "@/shared/ai/user-ai-types";

import { summarizeAiKeyStatus } from "../integrations/api-key-hub/api-key-hub-model";
import {
  buildWriterRoomDocumentFromNovelDraft,
  canMergeNovelCutWithNext,
  canSplitNovelCut,
  collectNovelSpeakers,
  mergeNovelCutWithNext,
  moveNovelCut,
  NOVEL_SOURCE_MAX_CHARS,
  parseNovelToScriptDraft,
  removeNovelCut,
  renameNovelScene,
  setNovelCutSpeaker,
  splitNovelCutAtFirstSentence,
  updateNovelCutText,
  type NovelDraftCut,
  type NovelParseResult,
  type NovelScriptDraft,
  type NovelSpeakerSource,
} from "./studio-novel-convert";
import type { StudioWriterRoomDocument } from "./studio-writer-room";

export interface StudioNovelConvertCharacterRef {
  id: string;
  name: string;
}

export interface StudioNovelConvertPanelProps {
  /** 반영 기준이 되는 현재 작가실 문서. */
  baseDocument: StudioWriterRoomDocument;
  characters: readonly StudioNovelConvertCharacterRef[];
  /** 변환 결과를 작가실 문서로 반영한다 (수용 검증은 호출 측이 수행). */
  onApply: (document: StudioWriterRoomDocument) => void;
  onCancel: () => void;
}

const FIELD_CLASS =
  "mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const SMALL_FIELD_CLASS =
  "min-h-9 rounded-lg border border-line bg-panel px-2 py-1 text-xs leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35";
const ICON_BUTTON_CLASS =
  "grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35";

const SPEAKER_SOURCE_LABEL: Record<NovelSpeakerSource, string> = {
  explicit: "원문 표기",
  inferred: "추정",
  manual: "직접 지정",
  unknown: "미상",
};

function SpeakerSourceBadge({ source }: { source: NovelSpeakerSource }) {
  const tone =
    source === "unknown"
      ? "border-bad/40 bg-bad/10 text-bad"
      : source === "inferred"
        ? "border-cool/40 bg-cool/10 text-cool"
        : "border-line bg-raised text-fg-3";
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[0.62rem] font-semibold ${tone}`}>
      {SPEAKER_SOURCE_LABEL[source]}
    </span>
  );
}

interface NovelCutRowProps {
  cut: NovelDraftCut;
  index: number;
  count: number;
  speakerOptions: string[];
  canMerge: boolean;
  onChange: (draft: NovelScriptDraft) => void;
  draft: NovelScriptDraft;
}

function NovelCutRow({ cut, index, count, speakerOptions, canMerge, onChange, draft }: NovelCutRowProps) {
  return (
    <li className="rounded-xl border border-line bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
            cut.kind === "dialogue" ? "bg-accent-soft text-accent" : "bg-raised text-fg-2"
          }`}
        >
          {cut.kind === "dialogue" ? "대사" : "지문"}
        </span>
        <span className="text-[0.65rem] tabular-nums text-fg-3">
          컷 {index + 1}/{count}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            aria-label={`컷 ${index + 1} 위로 이동`}
            disabled={index === 0}
            onClick={() => onChange(moveNovelCut(draft, cut.id, -1))}
          >
            <ArrowUp size={13} aria-hidden />
          </button>
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            aria-label={`컷 ${index + 1} 아래로 이동`}
            disabled={index === count - 1}
            onClick={() => onChange(moveNovelCut(draft, cut.id, 1))}
          >
            <ArrowDown size={13} aria-hidden />
          </button>
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            aria-label={`컷 ${index + 1} 다음 컷과 합치기`}
            title={
              canMerge
                ? "다음 컷과 합치기"
                : "종류가 다르거나 화자가 다른 대사는 합칠 수 없어요"
            }
            disabled={!canMerge}
            onClick={() => onChange(mergeNovelCutWithNext(draft, cut.id))}
          >
            <Merge size={13} aria-hidden />
          </button>
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            aria-label={`컷 ${index + 1} 첫 문장 뒤에서 나누기`}
            title={canSplitNovelCut(cut) ? "첫 문장 뒤에서 나누기" : "문장이 하나뿐이라 나눌 수 없어요"}
            disabled={!canSplitNovelCut(cut)}
            onClick={() => onChange(splitNovelCutAtFirstSentence(draft, cut.id))}
          >
            <Scissors size={13} aria-hidden />
          </button>
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            aria-label={`컷 ${index + 1} 삭제`}
            onClick={() => onChange(removeNovelCut(draft, cut.id))}
          >
            <Trash2 size={13} aria-hidden />
          </button>
        </span>
      </div>

      {cut.kind === "dialogue" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[0.68rem] font-semibold text-fg-2">
            화자
            <select
              aria-label={`컷 ${index + 1} 화자`}
              className={SMALL_FIELD_CLASS}
              value={cut.speaker ?? ""}
              onChange={(event) =>
                onChange(setNovelCutSpeaker(draft, cut.id, event.currentTarget.value || null))
              }
            >
              <option value="">화자 미상</option>
              {speakerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {cut.speaker && !speakerOptions.includes(cut.speaker) ? (
                <option value={cut.speaker}>{cut.speaker}</option>
              ) : null}
            </select>
          </label>
          <SpeakerSourceBadge source={cut.speakerSource} />
          {cut.speakerSource === "inferred" ? (
            <span className="text-[0.65rem] text-fg-3">
              원문 패턴으로 추정한 화자예요. 틀리면 바꿔 주세요.
            </span>
          ) : null}
        </div>
      ) : null}

      <label className="sr-only" htmlFor={`novel-cut-text-${cut.id}`}>
        컷 {index + 1} 내용
      </label>
      <textarea
        id={`novel-cut-text-${cut.id}`}
        className={FIELD_CLASS}
        rows={Math.min(5, Math.max(2, Math.ceil(cut.text.length / 42)))}
        value={cut.text}
        onChange={(event) => onChange(updateNovelCutText(draft, cut.id, event.currentTarget.value))}
      />
    </li>
  );
}

export function StudioNovelConvertPanel({
  baseDocument,
  characters,
  onApply,
  onCancel,
}: StudioNovelConvertPanelProps) {
  const { configuration } = useUserAi();
  const aiSummary = useMemo(() => summarizeAiKeyStatus(configuration), [configuration]);
  const aiTextReady = aiSummary.coveredCapabilities.includes("text");

  const [sourceText, setSourceText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<NovelParseResult | null>(null);
  const [draft, setDraft] = useState<NovelScriptDraft | null>(null);
  const [speakerLinks, setSpeakerLinks] = useState<Record<string, string>>({});
  const [extraSpeakers, setExtraSpeakers] = useState<string[]>([]);
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);

  const hasExistingContent =
    baseDocument.stages.scenes.items.length > 0 ||
    baseDocument.stages["panel-plan"].items.length > 0 ||
    baseDocument.stages["dialogue-sfx"].dialogue.length > 0;

  const speakers = useMemo(() => (draft ? collectNovelSpeakers(draft) : []), [draft]);
  const speakerOptions = useMemo(() => {
    const names = speakers.map((speaker) => speaker.name);
    // 캐릭터 사전의 이름도 화자 후보로 제안한다 — 감지되지 않은 화자(예: 유일한 대사가
    // 미상으로 남은 인물)도 컷에서 바로 지정할 수 있어야 하기 때문이다.
    for (const character of characters) {
      const name = character.name.trim();
      if (name && !names.includes(name)) names.push(name);
    }
    for (const extra of extraSpeakers) {
      if (!names.includes(extra)) names.push(extra);
    }
    return names;
  }, [speakers, extraSpeakers, characters]);

  const unknownDialogueCount = useMemo(() => {
    if (!draft) return 0;
    return draft.scenes.reduce(
      (sum, scene) =>
        sum + scene.cuts.filter((cut) => cut.kind === "dialogue" && !cut.speaker).length,
      0
    );
  }, [draft]);

  const runConvert = (text: string) => {
    const result = parseNovelToScriptDraft(text);
    if (result.status === "empty") {
      setError("변환할 소설 텍스트가 비어 있어요. 원고를 붙여넣거나 .txt 파일을 선택해 주세요.");
      setParseResult(null);
      setDraft(null);
      return;
    }
    if (result.status === "too-large") {
      setError(result.warnings[0] ?? "원고가 너무 길어 변환하지 않았어요.");
      setParseResult(null);
      setDraft(null);
      return;
    }
    setError(null);
    setParseResult(result);
    setDraft(result.draft);
    setSpeakerLinks({});
    setExtraSpeakers([]);
    setOverwriteConfirmed(false);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    file
      .text()
      .then((text) => {
        setSourceText(text);
        setError(null);
      })
      .catch(() => {
        setError("파일을 읽지 못했어요. 텍스트(.txt) 파일인지 확인해 주세요.");
      });
  };

  const applyDraft = () => {
    if (!draft) return;
    const speakerCharacterIds: Record<string, string | null> = {};
    for (const [name, link] of Object.entries(speakerLinks)) {
      if (link === "auto") continue;
      speakerCharacterIds[name] = link === "none" ? null : link;
    }
    onApply(
      buildWriterRoomDocumentFromNovelDraft(baseDocument, draft, {
        characters,
        speakerCharacterIds,
      })
    );
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <FileText size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-fg">소설에서 글콘티 초안 만들기</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
            소설 원고를 붙여넣으면 장면·대사·지문을 나눈 글콘티 초안을 만들어요. 화자는 원문
            패턴으로만 추정하고, 찾지 못하면 미상으로 남기니 초안에서 확인해 주세요.
          </p>
        </div>
        <button type="button" className={BUTTON_CLASS} onClick={onCancel}>
          작가실로 돌아가기
        </button>
      </div>

      {/* AI 보강 자리 (BYOK) — 실제 AI 호출은 하지 않고 자리와 상태만 정직하게 표시한다. */}
      <section
        aria-label="AI 보강"
        className="mt-4 rounded-xl border border-line bg-card p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles size={14} className="text-accent" aria-hidden />
          <h4 className="text-xs font-bold text-fg">AI 장면 감지 보강</h4>
          {aiTextReady ? (
            <span className="rounded-full border border-good/40 bg-good/10 px-2 py-0.5 text-[0.65rem] font-semibold text-good">
              텍스트 AI 키 등록됨
            </span>
          ) : (
            <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-[0.65rem] font-semibold text-fg-3">
              키 없음 — 규칙 기반만 동작
            </span>
          )}
        </div>
        {aiTextReady ? (
          <p className="mt-1.5 text-xs leading-relaxed text-fg-3">
            통합 API 키 설정에 텍스트 AI 키가 등록되어 있어요. 문장 단위 장면 감지 같은 AI 보강은
            다음 단계에서 이 자리로 연결됩니다. 지금 변환은 규칙 기반으로만 동작해요.
          </p>
        ) : (
          <p className="mt-1.5 text-xs leading-relaxed text-fg-3">
            <KeyRound size={12} className="mr-1 inline" aria-hidden />
            통합 API 키 설정에서 텍스트 AI 키를 등록하면 AI 보강을 켤 수 있어요. 키가 없어도 규칙
            기반 변환은 그대로 동작합니다.{" "}
            <Link
              to={USER_AI_SETTINGS_HREF}
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              API 키 설정 열기
            </Link>
          </p>
        )}
      </section>

      <section aria-label="소설 원고 입력" className="mt-4">
        <label className="text-xs font-bold text-fg" htmlFor="novel-convert-source">
          소설 원고
        </label>
        <textarea
          id="novel-convert-source"
          className={FIELD_CLASS}
          rows={8}
          placeholder={
            "여기에 소설 원고를 붙여넣어 주세요.\n\n장면 전환은 빈 줄 두 번이나 *** 같은 구분선으로 표시하면 장면이 나뉘고,\n따옴표 대사는 화자와 함께 대사 컷으로 분리돼요."
          }
          value={sourceText}
          onChange={(event) => setSourceText(event.currentTarget.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className={`${BUTTON_CLASS} cursor-pointer`}>
            <Upload size={14} aria-hidden />
            .txt 파일 선택
            <input
              type="file"
              accept=".txt,text/plain"
              className="sr-only"
              aria-label="소설 텍스트 파일 선택"
              onChange={onFileChange}
            />
          </label>
          <span
            className={`text-[0.68rem] tabular-nums ${
              sourceText.length > NOVEL_SOURCE_MAX_CHARS ? "font-bold text-bad" : "text-fg-3"
            }`}
          >
            {sourceText.length.toLocaleString("ko-KR")} /{" "}
            {NOVEL_SOURCE_MAX_CHARS.toLocaleString("ko-KR")}자
          </span>
          <button
            type="button"
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!sourceText.trim()}
            onClick={() => runConvert(sourceText)}
          >
            글콘티 초안으로 변환
          </button>
        </div>
      </section>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-bad/35 bg-bad/10 px-3 py-2 text-xs leading-relaxed text-bad">
          {error}
        </p>
      ) : null}

      {draft && parseResult ? (
        <section aria-label="글콘티 초안" className="mt-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
            <span className="font-bold text-fg">변환 결과</span>
            <span>
              장면 {parseResult.stats.sceneCount}개 · 컷 {parseResult.stats.cutCount}개 · 대사{" "}
              {parseResult.stats.dialogueCount}개 · 지문 {parseResult.stats.actionCount}개
            </span>
            {unknownDialogueCount > 0 ? (
              <span className="rounded-full border border-bad/40 bg-bad/10 px-2 py-0.5 text-[0.65rem] font-semibold text-bad">
                화자 미상 대사 {unknownDialogueCount}개
              </span>
            ) : null}
          </div>
          {parseResult.warnings.map((warning) => (
            <p
              key={warning}
              className="mt-2 flex items-start gap-1.5 rounded-lg border border-cool/35 bg-cool/10 px-3 py-2 text-xs leading-relaxed text-cool"
            >
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {warning}
            </p>
          ))}

          {speakers.length > 0 ? (
            <div className="mt-4 rounded-xl border border-line bg-card p-3">
              <h4 className="text-xs font-bold text-fg">등장인물 연결</h4>
              <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                화자 이름을 캐릭터 사전의 인물과 연결하면 작가실 대사에 인물로 반영돼요. 연결하지
                않은 화자는 이름 없이 대사만 반영됩니다.
              </p>
              <ul className="mt-2 space-y-2">
                {speakers.map((speaker) => {
                  const autoMatch = characters.find(
                    (character) => character.name.trim() === speaker.name
                  );
                  const link = speakerLinks[speaker.name] ?? "auto";
                  return (
                    <li key={speaker.name} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-16 text-xs font-semibold text-fg">{speaker.name}</span>
                      <span className="text-[0.68rem] text-fg-3">
                        대사 {speaker.dialogueCount}개
                        {speaker.inferredCount > 0 ? ` · 추정 ${speaker.inferredCount}개 포함` : ""}
                      </span>
                      <label className="sr-only" htmlFor={`novel-speaker-link-${speaker.name}`}>
                        {speaker.name} 캐릭터 연결
                      </label>
                      <select
                        id={`novel-speaker-link-${speaker.name}`}
                        className={SMALL_FIELD_CLASS}
                        value={link}
                        onChange={(event) =>
                          setSpeakerLinks((current) => ({
                            ...current,
                            [speaker.name]: event.currentTarget.value,
                          }))
                        }
                      >
                        <option value="auto">
                          자동 — {autoMatch ? `${autoMatch.name}으로 연결` : "일치하는 인물 없음"}
                        </option>
                        <option value="none">연결 안 함</option>
                        {characters.map((character) => (
                          <option key={character.id} value={character.id}>
                            {character.name}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="novel-new-speaker">
                  새 화자 이름 추가
                </label>
                <input
                  id="novel-new-speaker"
                  className={SMALL_FIELD_CLASS}
                  placeholder="새 화자 이름 (컷 화자 목록에 추가)"
                  value={newSpeakerName}
                  onChange={(event) => setNewSpeakerName(event.currentTarget.value)}
                />
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={!newSpeakerName.trim()}
                  onClick={() => {
                    const name = newSpeakerName.trim();
                    setExtraSpeakers((current) =>
                      current.includes(name) ? current : [...current, name]
                    );
                    setNewSpeakerName("");
                  }}
                >
                  화자 추가
                </button>
              </div>
            </div>
          ) : null}

          {draft.scenes.map((scene, sceneIndex) => (
            <div key={scene.id} className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`novel-scene-title-${scene.id}`}>
                  장면 {sceneIndex + 1} 제목
                </label>
                <input
                  id={`novel-scene-title-${scene.id}`}
                  className={`${SMALL_FIELD_CLASS} min-w-52 flex-1`}
                  placeholder={`장면 ${sceneIndex + 1} 제목 (비우면 첫 지문으로 표시)`}
                  value={scene.title}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? renameNovelScene(current, scene.id, event.currentTarget.value) : current
                    )
                  }
                />
                <span className="text-[0.68rem] text-fg-3">컷 {scene.cuts.length}개</span>
              </div>
              <ul className="mt-2 space-y-2">
                {scene.cuts.map((cut, cutIndex) => (
                  <NovelCutRow
                    key={cut.id}
                    cut={cut}
                    index={cutIndex}
                    count={scene.cuts.length}
                    speakerOptions={speakerOptions}
                    canMerge={canMergeNovelCutWithNext(draft, cut.id)}
                    draft={draft}
                    onChange={setDraft}
                  />
                ))}
              </ul>
              {scene.cuts.length === 0 ? (
                <p className="mt-2 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-3">
                  이 장면에는 컷이 없어요. 작가실에 반영하면 빈 장면으로 들어갑니다.
                </p>
              ) : null}
            </div>
          ))}

          <div className="mt-5 rounded-xl border border-line bg-card p-3">
            {hasExistingContent ? (
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-fg-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-bad)]"
                  checked={overwriteConfirmed}
                  onChange={(event) => setOverwriteConfirmed(event.currentTarget.checked)}
                />
                <span>
                  작가실에 이미 장면·컷·대사가 있어요. 변환 결과를 반영하면{" "}
                  <strong className="text-bad">기존 장면·컷·대사는 초안으로 교체</strong>됩니다.
                  (기획·시놉시스·비트와 효과음은 유지돼요.)
                </span>
              </label>
            ) : (
              <p className="text-xs leading-relaxed text-fg-2">
                반영하면 작가실의 장면·컷·대사 단계에 초안이 들어가고, 기존 스토리보드 흐름
                (캔버스 투영) 그대로 이어서 작업할 수 있어요.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35"
                disabled={hasExistingContent && !overwriteConfirmed}
                onClick={applyDraft}
              >
                작가실에 반영하기
              </button>
              <button type="button" className={BUTTON_CLASS} onClick={onCancel}>
                취소
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
