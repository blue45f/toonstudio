/**
 * StudioAiColorizeExtras.tsx — 채색 패널 확장 배선 (후보·맥락·라이브러리·참조·부분 재시도).
 *
 * 호스트가 소유하는 후보·맥락·참조 상태는 wiring prop으로 받고, 프롬프트
 * 라이브러리와 부분 재시도 요청은 이 컴포넌트가 소유한다. 단일 채색 경로
 * (StudioAiColorizePanel의 "선택 이미지 채색")는 건드리지 않는다.
 */

import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { composeColorizeContextPrompt } from "./studio-ai-context-prompt";
import { contextNoteToPromptContext } from "./studio-ai-context-note";
import type { StudioAiColorizeWiring } from "./studio-ai-colorize-wiring";
import {
  addPromptLibraryEntry,
  listPromptLibraryEntries,
  removePromptLibraryEntry,
  touchPromptLibraryEntry,
  type StudioAiPromptLibraryEntry,
} from "./studio-ai-prompt-library";
import {
  loadPromptLibraryEntries,
  savePromptLibraryEntries,
  type StudioAiPromptLibraryStore,
} from "./studio-ai-prompt-library-storage";
import {
  createPartialRetryRequest,
  type StudioAiPartialRetryRequest,
} from "./studio-ai-partial-retry";
import {
  endRetryRegionSelection,
  moveRetryRegionSelection,
  startRetryRegionSelection,
} from "./studio-ai-retry-region";

const SECTION =
  "space-y-2 rounded-xl border border-line bg-panel/50 p-3";
const LABEL = "text-[0.62rem] font-semibold text-fg-2";
const INPUT =
  "w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-[0.68rem] text-fg outline-none placeholder:text-fg-3 focus:border-accent disabled:opacity-60";
const SMALL_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[0.68rem] font-semibold text-fg hover:border-accent/40 disabled:opacity-50";

function localLibraryStore(): StudioAiPromptLibraryStore | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function StudioAiColorizeExtras({
  wiring,
  prompt,
  onPromptChange,
  configured,
  busy,
  selectedId,
  selectedSrc,
}: {
  wiring: StudioAiColorizeWiring;
  prompt: string;
  onPromptChange: (value: string) => void;
  configured: boolean;
  busy: boolean;
  selectedId: string | null;
  selectedSrc: string;
}) {
  const session = wiring.candidateSession;
  const candidates = session.candidates;

  // 프롬프트 라이브러리 (Web Storage, 키 toonstudio.ai.prompt-library.v1).
  const [library, setLibrary] = useState<readonly StudioAiPromptLibraryEntry[]>(
    () => {
      const store = localLibraryStore();
      return store ? loadPromptLibraryEntries(store) : [];
    },
  );
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null);
  const persistLibrary = (entries: readonly StudioAiPromptLibraryEntry[]) => {
    setLibrary(entries);
    const store = localLibraryStore();
    if (store && !savePromptLibraryEntries(store, entries)) {
      setLibraryNotice("라이브러리 저장에 실패했어요. 저장 공간을 확인해 주세요.");
    } else {
      setLibraryNotice(null);
    }
  };
  const saveCurrentPrompt = () => {
    const result = addPromptLibraryEntry(library, { text: prompt, kind: "prompt" });
    persistLibrary(result.entries);
    setLibraryNotice(
      result.added ? "프롬프트를 라이브러리에 저장했어요." : "이미 있는 프롬프트라 사용 시각만 갱신했어요.",
    );
  };
  const useLibraryEntry = (entry: StudioAiPromptLibraryEntry) => {
    onPromptChange(entry.text);
    persistLibrary(touchPromptLibraryEntry(library, entry.id));
  };

  // 맥락 노트 편집 (쉼표 구분 입력 → 배열).
  const note = wiring.contextNote;
  const noteSummary = contextNoteToPromptContext(note);
  const joinItems = (items: readonly string[]) => items.join(", ");
  const splitItems = (value: string) =>
    value.split(",").map((item) => item.trim()).filter(Boolean);
  const applyNoteToPrompt = () => {
    onPromptChange(composeColorizeContextPrompt({ basePrompt: prompt, note }));
  };

  // 참조 첨부 입력.
  const [refLabel, setRefLabel] = useState("");
  const [refKind, setRefKind] = useState<"image" | "text">("image");
  const [refText, setRefText] = useState("");
  const [refError, setRefError] = useState<string | null>(null);
  const addReferenceFromFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const error = wiring.onAddReferenceAttachment({
        kind: "image",
        label: refLabel.trim() || file.name,
        ref: dataUrl,
      });
      setRefError(error);
      if (!error) setRefLabel("");
    };
    reader.readAsDataURL(file);
  };
  const addTextReference = () => {
    const error = wiring.onAddReferenceAttachment({
      kind: "text",
      label: refLabel.trim() || "텍스트 지시",
      ref: refText,
    });
    setRefError(error);
    if (!error) {
      setRefLabel("");
      setRefText("");
    }
  };

  // 부분 재시도: 숫자 입력 영역을 드래그 상태 기계로 정규화한 뒤 요청을 만든다.
  // 마스크 합성 적용 경로는 없으므로 요청 구성까지만 수행한다.
  const [retryX, setRetryX] = useState("0.1");
  const [retryY, setRetryY] = useState("0.1");
  const [retryW, setRetryW] = useState("0.5");
  const [retryH, setRetryH] = useState("0.5");
  const [retryResult, setRetryResult] = useState<
    | { ok: true; request: StudioAiPartialRetryRequest }
    | { ok: false; reason: string }
    | null
  >(null);
  const buildRetryRequest = () => {
    const x = Number.parseFloat(retryX);
    const y = Number.parseFloat(retryY);
    const width = Number.parseFloat(retryW);
    const height = Number.parseFloat(retryH);
    const selection = moveRetryRegionSelection(
      startRetryRegionSelection(x, y),
      x + width,
      y + height,
    );
    const region = endRetryRegionSelection(selection);
    if (!region.ok) {
      setRetryResult({ ok: false, reason: "영역 면적이 0이거나 선택이 비활성 상태예요." });
      return;
    }
    const result = createPartialRetryRequest({
      region: region.region,
      prompt,
      sourceImageId: selectedId ?? "",
    });
    setRetryResult(
      result.ok
        ? { ok: true, request: result.request }
        : { ok: false, reason: result.reason },
    );
  };

  const capNote = useMemo(
    () => `후보 ${candidates.length}/${session.cap}장 · 후보 1장당 채색 호출 1회 과금`,
    [candidates.length, session.cap],
  );

  return (
    <div className="space-y-3" data-studio-ai-colorize-extras="true">
      {/* 1. 채색 후보: 모으기/선택/확정 분리 */}
      <section className={SECTION} aria-label="채색 후보">
        <p className={LABEL}>채색 후보 — 모으는 동안에는 원본이 바뀌지 않아요</p>
        <p className="text-[0.62rem] leading-relaxed text-fg-3">{capNote}</p>
        {candidates.length === 0 ? (
          <p className="text-[0.62rem] leading-relaxed text-fg-3">
            “후보 모으기”를 누르면 채색을 1회 실행해 결과를 후보로 쌓아요. 상한에
            닿으면 더 모을 수 없어요.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-2 py-1.5">
                  <input
                    type="radio"
                    name="studio-ai-colorize-candidate"
                    checked={session.selectedId === candidate.id}
                    onChange={() => wiring.onSelectCandidate(candidate.id)}
                    disabled={busy}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={candidate.dataUrl} alt="채색 후보" className="size-10 shrink-0 rounded object-cover" />
                  <span className="min-w-0 flex-1 truncate text-[0.62rem] text-fg-2">
                    {candidate.prompt || "채색 후보"}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={cn(SMALL_BUTTON, STUDIO_EASE, STUDIO_FOCUS_RING)} disabled={!configured || busy || !prompt.trim()} onClick={wiring.onCollectCandidate}>
            후보 모으기
          </button>
          <button type="button" className={cn(SMALL_BUTTON, STUDIO_EASE, STUDIO_FOCUS_RING)} disabled={busy || session.status !== "ready" || !wiring.candidateTargetId} onClick={wiring.onApplyCandidate}>
            선택 후보 적용
          </button>
          <button type="button" className={cn(SMALL_BUTTON, STUDIO_EASE, STUDIO_FOCUS_RING)} disabled={busy || candidates.length === 0} onClick={wiring.onClearCandidates}>
            후보 비우기
          </button>
        </div>
        <p className="text-[0.62rem] leading-relaxed text-fg-3">
          적용은 선택한 후보 1장만 원본 이미지에 덮어씁니다. 후보를 고르면
          “적용 준비” 상태가 돼요.
        </p>
      </section>

      {/* 2. 맥락 노트: 표시 + 편집 + 프롬프트 합성 */}
      <section className={SECTION} aria-label="맥락 노트">
        <p className={LABEL}>맥락 노트 — 작품 일관성 규칙 (이 기기에 저장돼요)</p>
        {noteSummary ? (
          <p className="whitespace-pre-line text-[0.62rem] leading-relaxed text-fg-2">{noteSummary}</p>
        ) : (
          <p className="text-[0.62rem] leading-relaxed text-fg-3">
            아직 저장된 규칙이 없어요. 아래에 쉼표로 구분해 입력하세요.
          </p>
        )}
        <label className="block space-y-1">
          <span className={LABEL}>캐릭터 규칙</span>
          <input className={INPUT} value={joinItems(note.characterRules)} onChange={(e) => wiring.onContextNoteChange({ characterRules: splitItems(e.target.value) })} placeholder="예: 빨간 머리, 왼쪽 눈 밑 점" />
        </label>
        <label className="block space-y-1">
          <span className={LABEL}>팔레트</span>
          <input className={INPUT} value={joinItems(note.palette)} onChange={(e) => wiring.onContextNoteChange({ palette: splitItems(e.target.value) })} placeholder="예: 파스텔, 따뜻한 노랑" />
        </label>
        <label className="block space-y-1">
          <span className={LABEL}>배경 규칙</span>
          <input className={INPUT} value={joinItems(note.backgroundRules)} onChange={(e) => wiring.onContextNoteChange({ backgroundRules: splitItems(e.target.value) })} placeholder="예: 배경은 단순하게" />
        </label>
        <label className="block space-y-1">
          <span className={LABEL}>금지 사항</span>
          <input className={INPUT} value={joinItems(note.prohibitions)} onChange={(e) => wiring.onContextNoteChange({ prohibitions: splitItems(e.target.value) })} placeholder="예: 얼굴 변형 금지" />
        </label>
        <button type="button" className={cn(SMALL_BUTTON, STUDIO_EASE, STUDIO_FOCUS_RING)} disabled={!prompt.trim()} onClick={applyNoteToPrompt}>
          맥락을 채색 지시에 적용
        </button>
        <p className="text-[0.62rem] leading-relaxed text-fg-3">
          합성 프롬프트는 300자 상한으로 뒤쪽부터 잘릴 수 있어요. 단일 채색·후보
          모으기 실행 시에도 같은 합성이 적용돼요.
        </p>
      </section>

      {/* 6. 프롬프트 라이브러리 */}
      <section className={SECTION} aria-label="프롬프트 라이브러리">
        <p className={LABEL}>프롬프트 라이브러리 — 자주 쓰는 지시 저장·불러오기</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={cn(SMALL_BUTTON, STUDIO_EASE, STUDIO_FOCUS_RING)} disabled={!prompt.trim()} onClick={saveCurrentPrompt}>
            현재 프롬프트 저장
          </button>
        </div>
        {listPromptLibraryEntries(library).length === 0 ? (
          <p className="text-[0.62rem] leading-relaxed text-fg-3">저장된 프롬프트가 없어요.</p>
        ) : (
          <ul className="space-y-1">
            {listPromptLibraryEntries(library).slice(0, 10).map((entry) => (
              <li key={entry.id} className="flex items-center gap-1.5">
                <button type="button" className="min-w-0 flex-1 truncate rounded-lg border border-line bg-card px-2 py-1.5 text-left text-[0.62rem] text-fg-2 hover:border-accent/40" onClick={() => useLibraryEntry(entry)} title={entry.text}>
                  {entry.text}
                </button>
                <button type="button" className="shrink-0 rounded-lg border border-line px-2 py-1.5 text-[0.62rem] text-fg-3 hover:text-fg" aria-label="라이브러리에서 삭제" onClick={() => persistLibrary(removePromptLibraryEntry(library, entry.id))}>
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
        {libraryNotice ? <p className="text-[0.62rem] text-fg-2" role="status">{libraryNotice}</p> : null}
      </section>

      {/* 7. 참조 첨부 */}
      <section className={SECTION} aria-label="참조 첨부">
        <p className={LABEL}>참조 첨부 — 최대 6개 (요청 구성까지만, 채색 호출에는 아직 안 보내요)</p>
        <input className={INPUT} value={refLabel} onChange={(e) => setRefLabel(e.target.value)} placeholder="참조 이름 (예: 주인공 얼굴)" />
        <div className="flex gap-1.5">
          <select className={cn(INPUT, "w-auto")} value={refKind} onChange={(e) => setRefKind(e.target.value as "image" | "text")} aria-label="참조 종류">
            <option value="image">이미지</option>
            <option value="text">텍스트 지시</option>
          </select>
          {refKind === "image" ? (
            <input className={INPUT} type="file" accept="image/*" onChange={(e) => addReferenceFromFile(e.target.files?.[0])} aria-label="참조 이미지 파일" />
          ) : (
            <input className={INPUT} value={refText} onChange={(e) => setRefText(e.target.value)} placeholder="텍스트 지시를 입력하세요" />
          )}
          {refKind === "text" ? (
            <button type="button" className={cn(SMALL_BUTTON, STUDIO_EASE, STUDIO_FOCUS_RING)} onClick={addTextReference}>추가</button>
          ) : null}
        </div>
        {refError ? <p className="text-[0.62rem] text-bad" role="alert">{refError}</p> : null}
        {wiring.referenceAttachments.length > 0 ? (
          <ul className="space-y-1">
            {wiring.referenceAttachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center gap-1.5 text-[0.62rem] text-fg-2">
                <span className="min-w-0 flex-1 truncate">{attachment.label} ({attachment.kind === "image" ? "이미지" : "텍스트"})</span>
                <button type="button" className="shrink-0 rounded-lg border border-line px-2 py-1 text-fg-3 hover:text-fg" onClick={() => wiring.onRemoveReferenceAttachment(attachment.id)}>삭제</button>
              </li>
            ))}
          </ul>
        ) : null}
        {wiring.referenceWarnings.map((warning) => (
          <p key={warning} className="text-[0.62rem] leading-relaxed text-fg-3" role="status">{warning}</p>
        ))}
        <p className="text-[0.62rem] leading-relaxed text-fg-3">
          현재 채색 호출은 참조 이미지를 보내지 않는 단순화 버전이라, 첨부는
          요청 페이로드 구성·경고까지만 연결돼 있어요.
        </p>
      </section>

      {/* 4. 부분 재시도 */}
      <section className={SECTION} aria-label="부분 재시도">
        <p className={LABEL}>부분 재시도 — 영역 지정 다시 채색 (요청까지만)</p>
        <p className="text-[0.62rem] leading-relaxed text-fg-3">
          정규화 좌표(0~1)로 영역을 지정해요. 캔버스 드래그 오버레이는 아직
          없고, 숫자 입력으로 영역을 정합니다. 정식 인페인팅이 아니라 전체
          재생성 후 선택 영역만 합성하는 폴백이에요.
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          <label className="space-y-1"><span className={LABEL}>x</span><input className={INPUT} inputMode="decimal" value={retryX} onChange={(e) => setRetryX(e.target.value)} /></label>
          <label className="space-y-1"><span className={LABEL}>y</span><input className={INPUT} inputMode="decimal" value={retryY} onChange={(e) => setRetryY(e.target.value)} /></label>
          <label className="space-y-1"><span className={LABEL}>너비</span><input className={INPUT} inputMode="decimal" value={retryW} onChange={(e) => setRetryW(e.target.value)} /></label>
          <label className="space-y-1"><span className={LABEL}>높이</span><input className={INPUT} inputMode="decimal" value={retryH} onChange={(e) => setRetryH(e.target.value)} /></label>
        </div>
        <button type="button" className={cn(SMALL_BUTTON, STUDIO_EASE, STUDIO_FOCUS_RING)} disabled={!selectedId || !prompt.trim()} onClick={buildRetryRequest}>
          부분 재시도 요청 만들기
        </button>
        {retryResult ? (
          retryResult.ok ? (
            <p className="text-[0.62rem] leading-relaxed text-fg-2" role="status">
              요청 준비됨 — 영역 x {retryResult.request.region.x.toFixed(2)}, y {retryResult.request.region.y.toFixed(2)}, {retryResult.request.region.width.toFixed(2)}×{retryResult.request.region.height.toFixed(2)} · 폴백 {retryResult.request.fallback} · 마스크 합성 적용 경로는 아직 없어요.
            </p>
          ) : (
            <p className="text-[0.62rem] text-bad" role="alert">요청 실패: {retryResult.reason}</p>
          )
        ) : null}
        {selectedSrc ? null : <p className="text-[0.62rem] text-fg-3">이미지를 선택하면 원본 id가 요청에 들어갑니다.</p>}
      </section>
    </div>
  );
}
