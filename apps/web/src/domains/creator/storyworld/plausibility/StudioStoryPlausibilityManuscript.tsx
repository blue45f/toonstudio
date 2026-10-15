/**
 * 원고로 시작하기: 붙여 넣기 → 장면 나누기 미리보기 → 확인 → 초안 만들기.
 *
 * 추출은 규칙만 쓰는 제안이다. 장면 경계, 등록된 이름의 글자 일치, 원문에 적힌 시간 표현만 가져오고, 동기·원인·
 * 정보 같은 의미 칸은 비워 둔다(‘미입력’). 작가가 미리보기에서 제목·등장인물·장소·경계를 고치고 확인하기 전에는
 * 문서가 바뀌지 않는다. 지금 설정을 덮어쓰는 경우에는 무엇이 사라지는지 먼저 보여 주고 확인을 받는다.
 */
import { FileUp, Merge, Scissors } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import type { StoryworldProject } from "../studio-storyworld-causality";
import {
  MANUSCRIPT_MAX_CHARS,
  addManuscriptBoundaryAt,
  extractManuscriptAsync,
  manuscriptParagraphStarts,
  removeManuscriptBoundary,
  type ManuscriptBoundary,
  type ManuscriptExtraction,
  type ManuscriptNameEntry,
  type ManuscriptSceneDraft,
} from "./studio-story-manuscript-extractor";
import {
  buildManuscriptRegister,
  buildProjectFromManuscript,
  manuscriptFingerprint,
  type ManuscriptDraftOverride,
  type ManuscriptDraftOverrides,
} from "./studio-story-manuscript-project";
import { storyworldManuscriptStore } from "./studio-story-manuscript-store";
import {
  MANUSCRIPT_BOUNDARY_LABELS,
  effectiveLocationName,
  effectiveParticipantRefs,
  unresolvedMatches,
} from "./studio-story-plausibility-manuscript-edit";

export interface ManuscriptFlowProps {
  readonly project: StoryworldProject;
  /** 처리 기록·원고 사본을 찾는 열쇠(랩 저장 열쇠). */
  readonly scopeKey: string;
  /** 지금 문서가 처음 보여 준 예시 데이터인가. 예시는 새로 시작할 때 이어받지 않는다. */
  readonly isExampleSeed: boolean;
  readonly now: () => Date;
  /** 지금 설정을 파일로 저장한다(덮어쓰기 전에 보관하도록 권한다). */
  readonly onExportCurrent: () => void;
  readonly onCreate: (project: StoryworldProject, message: string) => void;
  readonly onCancel: () => void;
}

type Step = "paste" | "preview" | "confirm";

const PAGE = 30;

function normalizeText(raw: string): string {
  return raw.replace(/\r\n?/gu, "\n");
}

function hasContent(project: StoryworldProject): boolean {
  return project.scenes.length > 0 || project.facts.length > 0;
}

export function StudioStoryPlausibilityManuscript(props: ManuscriptFlowProps) {
  const { project } = props;
  const register = useMemo(() => buildManuscriptRegister({ project }), [project]);
  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [extraction, setExtraction] = useState<ManuscriptExtraction | null>(null);
  const [overrides, setOverrides] = useState<ManuscriptDraftOverrides>({});
  const [visible, setVisible] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"replace" | "append">(hasContent(project) && !props.isExampleSeed ? "append" : "replace");
  const [acknowledged, setAcknowledged] = useState(false);
  const [title, setTitle] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const run = async (source: string, boundaries?: readonly ManuscriptBoundary[]) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const result = await extractManuscriptAsync(
        source,
        register,
        boundaries ? { boundaries } : {},
        { signal: controller.signal, onProgress: setProgress },
      );
      if (controller.signal.aborted) return;
      setExtraction(result);
      setStep("preview");
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
      setError("원고를 읽는 중 문제가 생겼어요. 글을 확인하고 다시 시도해 주세요.");
    } finally {
      if (controllerRef.current === controller) setBusy(false);
    }
  };

  const cancelRun = () => {
    controllerRef.current?.abort();
    setBusy(false);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MANUSCRIPT_MAX_CHARS * 4) {
      setError("파일이 너무 커요. 100만 자 이하로 나눠서 넣어 주세요.");
      return;
    }
    try {
      setText(normalizeText(await file.text()));
      setError(null);
    } catch {
      setError("파일을 읽지 못했어요. 텍스트(.txt, .md) 파일인지 확인해 주세요.");
    }
  };

  const tooLong = text.length > MANUSCRIPT_MAX_CHARS;
  const drafts = extraction?.scenes ?? [];
  const updateOverride = (key: string, patch: ManuscriptDraftOverride) =>
    setOverrides((previous) => ({ ...previous, [key]: { ...previous[key], ...patch } }));

  const rerunWith = (boundaries: readonly ManuscriptBoundary[]) => { void run(text, boundaries); };

  const characterEntries = register.filter((entry) => entry.kind === "character");
  const locationEntries = register.filter((entry) => entry.kind === "location");
  const nameOfRef = (ref: string) => characterEntries.find((entry) => entry.refId === ref)?.name ?? ref;
  const unresolvedScenes = drafts.filter((draft) => unresolvedMatches(draft, overrides[draft.key]).length > 0).length;

  const create = async (withCopy: boolean) => {
    if (!extraction) return;
    setBusy(true);
    setError(null);
    setCopyFailed(false);
    const copyId = manuscriptFingerprint(text);
    if (withCopy) {
      try {
        await storyworldManuscriptStore.save(props.scopeKey, text, props.now().toISOString());
      } catch {
        setCopyFailed(true);
        setBusy(false);
        return;
      }
    }
    try {
      const replace = mode === "replace";
      const base = replace && props.isExampleSeed ? null : project;
      const result = buildProjectFromManuscript(base, drafts, register, overrides, {
        mode,
        ...(title.trim() ? { projectTitle: title.trim() } : {}),
        ...(withCopy ? { copyId } : {}),
      });
      const skipped = result.skippedSceneCount > 0 ? ` 문서 한도 때문에 ${result.skippedSceneCount}개는 가져오지 못했어요. 원고를 나눠서 다시 가져와 주세요.` : "";
      props.onCreate(
        result.project,
        `장면 ${result.addedSceneIds.length}개를 만들었어요. 동기·원인·정보 칸은 비워 뒀으니 질문지로 채워 주세요.${skipped}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? `초안을 만들지 못했어요. ${caught.message}` : "초안을 만들지 못했어요.");
      setBusy(false);
    }
  };

  const baseLabel = props.isExampleSeed ? "예시 데이터" : "지금 설정";

  return (
    <div className="plausibility-hub plausibility-ms">
      <div className="plausibility-hub__header">
        <div className="plausibility-hub__intro">
          <h2 ref={headingRef} tabIndex={-1}>
            {step === "paste" ? "원고로 시작하기" : step === "preview" ? "장면 나누기 미리보기" : "초안 만들기 확인"}
          </h2>
          <p>
            원고에서 가져오는 것은 장면 경계, 등록된 이름의 글자 일치, 원문에 적힌 시간 표현뿐이에요. 동기·원인·정보는 비워 두고 질문지로 채워요.
            네트워크로 보내지 않고 이 기기 안에서만 읽어요.
          </p>
        </div>
        <div className="plausibility-hub__actions">
          <button className="storyworld-button" onClick={props.onCancel} type="button">취소하고 돌아가기</button>
        </div>
      </div>

      {error ? <p className="plausibility-banner plausibility-banner--error" role="alert">{error}</p> : null}

      {step === "paste" ? (
        <section className="plausibility-card" aria-label="원고 넣기">
          <label>
            <span className="plausibility-hint">원고를 붙여 넣거나 파일로 가져오세요 ({MANUSCRIPT_MAX_CHARS.toLocaleString("ko-KR")}자까지)</span>
            <textarea
              onChange={(event) => setText(normalizeText(event.target.value))}
              placeholder={"1화 비 내리는 시장\n\n장면 1. 기억 시장\n하은이 걸었다. 다음 날 아침이 밝았다.\n\n* * *\n\n장면 2\n도진이 금고 앞에서 말했다."}
              value={text}
            />
          </label>
          <p aria-live="polite" className="plausibility-hint" role="status">
            {text.length.toLocaleString("ko-KR")}자{tooLong ? ` · ${(text.length - MANUSCRIPT_MAX_CHARS).toLocaleString("ko-KR")}자 넘었어요. 나눠서 넣어 주세요.` : ""}
          </p>
          <details className="plausibility-details">
            <summary>어떤 표시로 장면을 나누나요?</summary>
            <ul className="plausibility-sources">
              <li className="plausibility-hint">장면 번호 줄: ‘장면 3’, ‘씬 3’, ‘S#3’, ‘3컷’ 처럼 번호가 있는 줄</li>
              <li className="plausibility-hint">구분선: ‘***’, ‘---’, ‘* * *’</li>
              <li className="plausibility-hint">제목 줄: 마크다운 ‘#’ 제목, ‘1화 제목’ 같은 회차 줄</li>
              <li className="plausibility-hint">빈 줄이 두 줄 이상 이어질 때 (가장 약한 표지예요)</li>
            </ul>
          </details>
          <div className="plausibility-hub__actions">
            <button
              className="storyworld-button storyworld-button--primary"
              disabled={busy || text.trim().length === 0 || tooLong}
              onClick={() => { void run(text); }}
              type="button"
            >
              장면 나누기 미리보기
            </button>
            <label className="storyworld-button">
              <FileUp aria-hidden size={14} /> 파일로 가져오기
              <input accept=".txt,.md,text/plain,text/markdown" className="sr-only" onChange={(event) => { void onFile(event); }} type="file" />
            </label>
            {busy ? (
              <span className="plausibility-ms__progress" role="status">
                읽는 중… ({progress}단계)
                <button className="storyworld-button" onClick={cancelRun} type="button">취소</button>
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === "preview" && extraction ? (
        <section aria-label="장면 나누기 미리보기" className="plausibility-ms">
          <p aria-live="polite" className="plausibility-hint" role="status">
            장면 {drafts.length}개를 찾았어요{unresolvedScenes > 0 ? ` · 이름이 같은 사람이 있는 장면 ${unresolvedScenes}개는 직접 골라 주세요` : ""}.
            제목·등장인물·장소를 고치고, 합치거나 나눌 수 있어요.
          </p>
          {extraction.warnings.length > 0 ? (
            <ul aria-label="읽으면서 알게 된 점" className="plausibility-sources" role="status">
              {extraction.warnings.slice(0, 5).map((warning, index) => <li className="plausibility-hint" key={`${warning.code}:${index}`}>{warning.message}</li>)}
            </ul>
          ) : null}
          <ol className="plausibility-ms__scenes">
            {drafts.slice(0, visible).map((draft, index) => (
              <SceneRow
                characterEntries={characterEntries}
                draft={draft}
                index={index}
                key={draft.key}
                locationEntries={locationEntries}
                nameOfRef={nameOfRef}
                onMerge={() => rerunWith(removeManuscriptBoundary(extraction.boundaries, index))}
                onOverride={(patch) => updateOverride(draft.key, patch)}
                onSplit={(offset) => rerunWith(addManuscriptBoundaryAt(text, extraction.boundaries, offset))}
                override={overrides[draft.key]}
                register={register}
                text={text}
              />
            ))}
          </ol>
          {drafts.length > visible ? (
            <button className="storyworld-button" onClick={() => setVisible((value) => value + 50)} type="button">
              더 보기 (남은 {drafts.length - visible}개)
            </button>
          ) : null}
          <div className="plausibility-hub__actions">
            <button className="storyworld-button" onClick={() => setStep("paste")} type="button">원고 다시 고치기</button>
            <button className="storyworld-button storyworld-button--primary" disabled={busy || drafts.length === 0} onClick={() => setStep("confirm")} type="button">
              이대로 계속
            </button>
            {busy ? <span className="plausibility-ms__progress" role="status">다시 나누는 중…</span> : null}
          </div>
        </section>
      ) : null}

      {step === "confirm" && extraction ? (
        <section aria-label="초안 만들기 확인" className="plausibility-card plausibility-ms">
          <p>장면 {drafts.length}개로 {mode === "replace" ? "새 초안을 만들어요" : "지금 설정 뒤에 덧붙여요"}.</p>
          <fieldset className="plausibility-field">
            <legend>어떻게 만들까요?</legend>
            <label>
              <input checked={mode === "replace"} name="plausibility-ms-mode" onChange={() => { setMode("replace"); setAcknowledged(false); }} type="radio" />
              새로 시작하기 (인물 이름은 남기고 장면·설정·복선을 새로 만들어요)
            </label>
            <label>
              <input checked={mode === "append"} name="plausibility-ms-mode" onChange={() => setMode("append")} type="radio" />
              지금 설정 뒤에 덧붙이기 (기존 장면·설정은 그대로 둬요)
            </label>
          </fieldset>
          {mode === "replace" && hasContent(project) && !props.isExampleSeed ? (
            <div className="plausibility-banner plausibility-banner--warn" role="alert">
              <p>
                덮어쓰기 경고: {baseLabel}의 장면 {project.scenes.length}개, 설정(사실) {project.facts.length}개, 복선 {(project.setupContracts ?? []).length}개가
                새 초안에서 사라져요. 질문지로 답한 내용도 함께 사라져요.
              </p>
              <button className="storyworld-button" onClick={props.onExportCurrent} type="button">먼저 지금 설정을 파일로 저장</button>
              <label>
                <input checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} type="checkbox" />
                사라지는 내용을 확인했어요
              </label>
            </div>
          ) : null}
          {mode === "replace" && props.isExampleSeed ? (
            <p className="plausibility-hint">지금 설정은 처음 보여 드린 예시라서, 새로 시작해도 잃을 내 작업이 없어요.</p>
          ) : null}
          <label className="plausibility-field">
            <span>작품 이름 (선택)</span>
            <input maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="비워 두면 지금 이름을 써요" type="text" value={title} />
          </label>
          {unresolvedScenes > 0 ? (
            <p className="plausibility-hint">이름이 같은 사람이 있는 장면 {unresolvedScenes}개는 등장인물을 비워 두고 만들어요. 나중에 설정에서 채울 수 있어요.</p>
          ) : null}
          {copyFailed ? (
            <div className="plausibility-banner plausibility-banner--warn" role="alert">
              <p>원고 사본을 이 기기에 저장하지 못했어요. 사본 없이 만들면 ‘원고에서 보기’에서 장면의 앞부분 발췌만 볼 수 있고, 이름 표기 검사는 건너뛰어요.</p>
              <button className="storyworld-button" onClick={() => { void create(false); }} type="button">사본 없이 만들기</button>
              <button className="storyworld-button" onClick={() => { void create(true); }} type="button">다시 저장해 보기</button>
            </div>
          ) : null}
          <div className="plausibility-hub__actions">
            <button className="storyworld-button" onClick={() => setStep("preview")} type="button">미리보기로 돌아가기</button>
            <button
              className="storyworld-button storyworld-button--primary"
              disabled={busy || (mode === "replace" && hasContent(project) && !props.isExampleSeed && !acknowledged)}
              onClick={() => { void create(true); }}
              type="button"
            >
              초안 만들기
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SceneRow({ draft, index, register, characterEntries, locationEntries, override, text, nameOfRef, onOverride, onMerge, onSplit }: {
  readonly draft: ManuscriptSceneDraft;
  readonly index: number;
  readonly register: readonly ManuscriptNameEntry[];
  readonly characterEntries: readonly ManuscriptNameEntry[];
  readonly locationEntries: readonly ManuscriptNameEntry[];
  readonly override: ManuscriptDraftOverride | undefined;
  readonly text: string;
  readonly nameOfRef: (ref: string) => string;
  readonly onOverride: (patch: ManuscriptDraftOverride) => void;
  readonly onMerge: () => void;
  readonly onSplit: (offset: number) => void;
}) {
  const refs = effectiveParticipantRefs(draft, register, override);
  const unresolved = unresolvedMatches(draft, override);
  const location = effectiveLocationName(draft, register, override);
  const splitPoints = useMemo(() => manuscriptParagraphStarts(text, draft.start, draft.end, 12), [text, draft.start, draft.end]);
  const label = `장면 ${index + 1}`;
  return (
    <li className="plausibility-ms__scene">
      <div className="plausibility-row__top">
        <strong>{label}</strong>
        <span className="plausibility-badge plausibility-badge--muted">{MANUSCRIPT_BOUNDARY_LABELS[draft.boundary]}</span>
        <span className="plausibility-hint">{draft.charCount.toLocaleString("ko-KR")}자{draft.episodeNumber !== undefined ? ` · ${draft.episodeNumber}화` : ""}</span>
      </div>
      <label className="plausibility-field">
        <span>{label} 제목</span>
        <input maxLength={120} onChange={(event) => onOverride({ title: event.target.value })} type="text" value={override?.title ?? draft.title} />
      </label>
      <p className="plausibility-ms__excerpt" lang="ko">{draft.excerpt}</p>
      <div className="plausibility-field">
        <span>등장인물</span>
        <div className="plausibility-chips">
          {refs.length === 0 ? <span className="plausibility-hint">확정된 인물이 없어요</span> : null}
          {refs.map((ref) => (
            <button
              aria-label={`${nameOfRef(ref)} 빼기`}
              className="plausibility-chip-button"
              key={ref}
              onClick={() => onOverride({ participantRefIds: refs.filter((item) => item !== ref) })}
              type="button"
            >
              {nameOfRef(ref)} ×
            </button>
          ))}
        </div>
        {unresolved.map((match) => (
          <label key={match.surface}>
            <span>‘{match.surface}’은 누구인가요? (이름이 같은 사람이 여럿이에요)</span>
            <select
              onChange={(event) => {
                const picked = register.find((entry) => entry.id === event.target.value);
                onOverride({ participantRefIds: picked ? [...refs, picked.refId] : refs });
              }}
              value=""
            >
              <option value="">고르지 않아요</option>
              {match.candidateIds.map((id) => {
                const entry = register.find((candidate) => candidate.id === id);
                return entry ? <option key={id} value={id}>{entry.name} ({entry.refId})</option> : null;
              })}
            </select>
          </label>
        ))}
        <label>
          <span>인물 더하기</span>
          <select
            onChange={(event) => {
              if (event.target.value) onOverride({ participantRefIds: [...refs, event.target.value] });
            }}
            value=""
          >
            <option value="">고르세요</option>
            {characterEntries.filter((entry) => !refs.includes(entry.refId)).map((entry) => <option key={entry.id} value={entry.refId}>{entry.name}</option>)}
          </select>
        </label>
      </div>
      <label className="plausibility-field">
        <span>장소</span>
        <select onChange={(event) => onOverride({ locationName: event.target.value || null })} value={location ?? ""}>
          <option value="">장소 없음</option>
          {locationEntries.map((entry) => <option key={entry.id} value={entry.refId}>{entry.name}</option>)}
        </select>
      </label>
      {draft.timeCues.length > 0 ? <p className="plausibility-hint">원문에 적힌 시간 표현: {draft.timeCues.join(", ")} (시간 값으로 바꾸지는 않아요)</p> : null}
      <div className="plausibility-hub__actions">
        {index > 0 ? (
          <button className="storyworld-button" onClick={onMerge} type="button"><Merge aria-hidden size={14} /> {label} · 앞 장면과 합치기</button>
        ) : null}
        {splitPoints.length > 0 ? (
          <details className="plausibility-details">
            <summary><Scissors aria-hidden size={13} /> {label} · 나누기…</summary>
            <ul className="plausibility-sources">
              {splitPoints.map((offset) => (
                <li key={offset}>
                  <button className="storyworld-text-button" onClick={() => onSplit(offset)} type="button">
                    여기서 나누기: {text.slice(offset, offset + 36).replace(/\s+/gu, " ")}…
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </li>
  );
}
