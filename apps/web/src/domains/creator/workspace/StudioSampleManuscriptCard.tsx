import { useEffect, useState } from "react";
import { ArrowRight, Eye, Layers, Lock, Pencil, RotateCcw } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  SAMPLE_EDITOR_HREF,
  SAMPLE_MANUSCRIPT_LAYERS,
  SAMPLE_MANUSCRIPT_LICENSE_NOTICE,
  SAMPLE_PROJECT_ID,
} from "../studio-sample-manuscript-content";
import {
  createSampleManuscriptPracticeCopy,
  ensureSampleManuscriptSeeded,
  findSampleManuscriptPracticeCopy,
  type SamplePracticeCopyRef,
  type SamplePracticeMode,
} from "../studio-sample-manuscript-seed";
import { restoreStudioProject } from "../studio-project-library-store";

type CardState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly copy: SamplePracticeCopyRef | null }
  | { readonly kind: "trashed" }
  | { readonly kind: "full" }
  | { readonly kind: "error" };

/**
 * 라이브러리 상단: 완성 샘플 원고를 구조 그대로 여는 연습 표면.
 *
 * 원본은 "뜯어보기" 전용 기준본으로 시딩만 하고, 실제 그리기는 연습 사본에서만
 * 일어난다. 따라 그리기 사본은 원본을 흐리게 잠가 깔아 두므로, 사본에서 무엇을
 * 해도 원본 원고는 바뀌지 않는다.
 */
export function StudioSampleManuscriptCard() {
  const bt = useBilingual("StudioSampleManuscriptCard");
  const [state, setState] = useState<CardState>({ kind: "loading" });
  const [copyError, setCopyError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const result = ensureSampleManuscriptSeeded(window.localStorage, { target: window });
      if (result.status === "trashed") {
        setState({ kind: "trashed" });
        return;
      }
      if (result.status === "full") {
        setState({ kind: "full" });
        return;
      }
      setState({ kind: "ready", copy: findSampleManuscriptPracticeCopy(window.localStorage) });
    } catch {
      setState({ kind: "error" });
    }
  }, [attempt]);

  const createCopy = (mode: SamplePracticeMode) => {
    try {
      const result = createSampleManuscriptPracticeCopy(window.localStorage, { target: window, mode });
      if (result.status === "sample-trashed") {
        setState({ kind: "trashed" });
        return;
      }
      if (result.status === "full") {
        setState({ kind: "full" });
        return;
      }
      setCopyError(false);
      setState({
        kind: "ready",
        copy: {
          project: result.project,
          documentId: result.documentId,
          editorHref: result.editorHref,
          mode: result.mode,
        },
      });
    } catch {
      setCopyError(true);
    }
  };

  if (state.kind === "loading") {
    return (
      <section
        className="mt-6 rounded-3xl border border-line bg-card px-5 py-6"
        aria-busy="true"
        aria-label={bt("샘플 원고 준비 중", "Preparing the sample manuscript")}
        data-sample-manuscript-card="loading"
      >
        <p className="text-sm font-bold text-fg-3">
          {bt("샘플 원고를 준비하고 있어요…", "Preparing the sample manuscript…")}
        </p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        className="mt-6 rounded-3xl border border-line bg-card px-5 py-6"
        role="alert"
        data-sample-manuscript-card="error"
      >
        <h2 className="text-base font-black text-fg">
          {bt("샘플 원고를 준비하지 못했어요", "We couldn't prepare the sample manuscript")}
        </h2>
        <p className="mt-1 text-sm leading-6 text-fg-3">
          {bt(
            "브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요. 내 작품 목록은 그대로 쓸 수 있습니다.",
            "Check your browser storage and try again. Your own work list is unaffected.",
          )}
        </p>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-fg"
          onClick={() => { setState({ kind: "loading" }); setAttempt((value) => value + 1); }}
        >
          <RotateCcw size={13} aria-hidden="true" />
          {bt("다시 시도", "Try again")}
        </button>
      </section>
    );
  }

  if (state.kind === "full") return null;

  if (state.kind === "trashed") {
    return (
      <section
        className="mt-6 rounded-3xl border border-dashed border-line bg-card/60 px-5 py-5"
        data-sample-manuscript-card="trashed"
      >
        <p className="text-sm leading-6 text-fg-3">
          {bt(
            "샘플 원고는 휴지통에 있어요. 복원하면 구조 뜯어보기와 연습 사본을 다시 쓸 수 있습니다.",
            "The sample manuscript is in Trash. Restore it to inspect its structure and make practice copies again.",
          )}
        </p>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-fg"
          onClick={() => {
            try {
              restoreStudioProject(window.localStorage, SAMPLE_PROJECT_ID, { target: window });
              setAttempt((value) => value + 1);
            } catch {
              setState({ kind: "error" });
            }
          }}
        >
          <RotateCcw size={13} aria-hidden="true" />
          {bt("샘플 원고 복원", "Restore the sample manuscript")}
        </button>
      </section>
    );
  }

  const { copy } = state;

  return (
    <section
      className="mt-6 rounded-3xl border border-line bg-card px-5 py-6"
      aria-labelledby="sample-manuscript-card-title"
      data-sample-manuscript-card="ready"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[0.68rem] font-black uppercase tracking-widest text-fg-3">
            <Layers size={13} aria-hidden="true" />
            {bt("연습용 샘플 원고", "Practice sample manuscript")}
          </p>
          <h2 id="sample-manuscript-card-title" className="mt-1 text-xl font-black text-fg">
            {bt("완성 원고를 뜯어보고, 따라 그려 보세요", "Take a finished manuscript apart, then trace it")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-3">
            {bt(
              "빈 캔버스가 아닙니다. 완성된 2페이지 원고를 레이어·톤·말풍선 구조 그대로 열어 보고, 연습 사본에서 원본 위에 겹쳐 따라 그립니다.",
              "Not a blank canvas: open a finished two-page manuscript with its layer, tone and balloon structure intact, then trace over it in a practice copy.",
            )}
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-fg-3">{SAMPLE_MANUSCRIPT_LICENSE_NOTICE}</p>
        </div>
        <Link
          href={SAMPLE_EDITOR_HREF}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-black text-fg"
        >
          <Eye size={15} aria-hidden="true" />
          {bt("원본 열기 · 구조 보기", "Open original · view structure")}
        </Link>
      </div>

      <ol className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {SAMPLE_MANUSCRIPT_LAYERS.map((layer) => (
          <li key={layer.id} className="rounded-2xl border border-line px-4 py-3">
            <p className="text-sm font-black text-fg">{bt(layer.titleKo, layer.titleEn)}</p>
            <p className="mt-0.5 text-xs leading-5 text-fg-3">{bt(layer.lookKo, layer.lookEn)}</p>
            <p className="mt-1.5 inline-flex items-start gap-1 text-xs font-bold leading-5 text-fg">
              <Pencil size={12} aria-hidden="true" />
              <span>{bt(layer.missionKo, layer.missionEn)}</span>
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {copy ? (
          <Link
            href={copy.editorHref}
            className="inline-flex items-center gap-1.5 rounded-full bg-fg px-4 py-2 text-sm font-black text-bg"
          >
            {copy.mode === "trace"
              ? bt("연습 사본 이어서 따라 그리기", "Keep tracing in your practice copy")
              : bt("복습 사본 이어서 열기", "Reopen your study copy")}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        ) : (
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-fg px-4 py-2 text-sm font-black text-bg"
              onClick={() => createCopy("trace")}
            >
              <Pencil size={15} aria-hidden="true" />
              {bt("연습 사본 만들어 따라 그리기", "Make a practice copy and trace")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-black text-fg"
              onClick={() => createCopy("study")}
            >
              {bt("구조 복습 사본 만들기", "Make a structure study copy")}
            </button>
          </>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-bold text-fg-3">
          <Lock size={12} aria-hidden="true" />
          {bt("연습은 사본에서만 — 원본 원고는 바뀌지 않습니다.", "Practice happens in the copy only — the original never changes.")}
        </span>
      </div>

      {copyError ? (
        <p role="alert" className="mt-3 text-xs font-bold text-warning">
          {bt("연습 사본을 만들지 못했습니다. 브라우저 저장 공간을 확인해 주세요.", "The practice copy couldn't be created. Check your browser storage.")}
        </p>
      ) : null}
    </section>
  );
}
