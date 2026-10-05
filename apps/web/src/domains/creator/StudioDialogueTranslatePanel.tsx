import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
// 대사 번역(BYOK) 패널 — 캔버스의 말풍선·텍스트 요소를 사용자의 API 키로 다른 언어로 일괄
// 번역한다. draft prop 유무로 두 화면을 자동 전환한다: (A) 생성 화면(대상 언어·용어집 입력 →
// 번역 생성), (B) 검토·적용 화면(원문/번역 나란히, 손으로 고친 뒤 적용). 순수 계산은
// studio-dialogue-translate.ts(청크 분할·프롬프트·병합)와 studio-dialogue-batch.ts(목록화),
// 실제 BYOK 호출은 studio-ai-client.ts, 상태·히스토리 커밋은 StudioPage(메인 루프)가 담당한다.
// 자체완결 플로팅 패널: StudioDialogueBatchPanel과 동일한 셸(우측 상단, Esc로 닫힘).
//
// (C) 현지화 QA 화면 — `qaOpen`이 켜지면 두 화면 대신 그려진다. 문체 린트(영문 규칙표)와 말풍선
// 넘침 예측을 같은 큐 위에서 돌려 MQM 차원별 발견 + 품질 점수 하나를 낸다. 조립은 전부
// lettering/studio-localization-qa.ts(순수)가 하고, 여기서는 측정기만 주입한다 — 초안이 있으면
// **적용 전** 초안을, 없으면 지금 문서에 들어 있는 문자열을 검사한다.
// 보고서는 스냅샷이다: 검사 입력(대사·상자·서체·초안·로케일·테마)의 지문을 함께 저장해 두고,
// 지문이 어긋나면 "다시 검사" 배너를 띄운다. 캔버스에서 말풍선 하나를 옮길 때마다 회차 전체를
// 다시 재지 않으려는 선택이다 — 넘침 판정은 큐마다 글자 폭을 재는 이진 탐색이라 공짜가 아니다.
//
// (D) 번역 대조 검수 화면 — `reviewOpen`이 켜지면 그려진다. 적용이 끝난 번역(dialogueI18n)을
// 원문과 나란히 놓고 승인/수정 필요를 남기는 상설 검수 표면이다(초안 검토와 별개). 조립은
// lettering/StudioDialogueReviewSection.tsx + studio-dialogue-review.ts(순수)가 하고, 문서
// 커밋은 호스트 콜백으로 위임한다. QA에는 용어집 규칙을 파싱해 넘긴다 — 예전에는 규칙을
// 넘기지 않아 QA의 용어집 검사가 실제 경로에서 돌지 않았다.
//
// 용어집은 작품(workScope)별로 localStorage에 남긴다(lettering/studio-dialogue-glossary-store).
// 호스트의 세션 상태만으로는 새로고침마다 용어집이 사라져 작품 자산이 되지 못했다.
import { BookOpenCheck, Check, Globe2, Languages, ListChecks, Loader2, ScanText, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import {
  createCanvasBubbleTextMeasurer,
  type BubbleTextMeasurer,
  type BubbleWebtoonTheme,
} from "./lettering/studio-bubble-text-fit";
import {
  collectDialogueItems,
  isDialogueElement,
  type DialogueBatchItem,
} from "./lettering/studio-dialogue-batch";
import {
  loadStudioDialogueGlossaryTextAsync,
  saveStudioDialogueGlossaryTextAsync,
} from "./lettering/studio-dialogue-glossary-store";
import { StudioDialogueGlossaryEditor } from "./lettering/StudioDialogueGlossaryEditor";
import {
  StudioDialogueReviewSection,
} from "./lettering/StudioDialogueReviewSection";
import {
  type DialogueReviewPageLike,
  type DialogueReviewStatus,
} from "./lettering/studio-dialogue-review";
import { DIALOGUE_LOCALE_PRESETS, SOURCE_LOCALE, localeLabel } from "./lettering/studio-dialogue-translate";
import { parseStudioTranslationMemoryGlossaryText } from "./studio-translation-glossary";
import {
  runStudioLocalizationQa,
  studioLocalizationQaCueIndex,
  studioLocalizationQaGroups,
  type StudioLocalizationQaElementTypography,
  type StudioLocalizationQaReport as QaReport,
} from "./lettering/studio-localization-qa";
import { STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "./studio-panel-ui";
import {
  StudioLocalizationQaReport,
  type StudioLocalizationQaDimensionSection,
} from "./StudioLocalizationQaReport";

import { AiRecoveryNotice } from "@/shared/ai/AiRecoveryNotice";
import { cx } from "@/shared/lib/cx";

/**
 * 호스트가 들고 있는 이 패널의 표시 상태. `false`면 닫힘, 아니면 처음 보여 줄 화면이다 —
 * 메뉴의 두 진입점(텍스트 ▸ 대사 번역 / 텍스트 ▸ 현지화 QA)이 이 값 하나로 갈린다.
 * 별도 boolean 을 하나 더 두지 않는 이유: 호스트 세션 백(any 개수)과 뷰포트 prop 묶음이
 * 래칫으로 동결돼 있어, 새 키 하나가 곧 래칫 위반이다.
 */
export type StudioDialogueTranslateSurface = false | "translate" | "qa" | "review";

export type StudioDialogueTranslatePanelProps = {
  /** 전체 페이지(요소·그룹·번역·검수 저장소 포함) — StudioPage 의 pages 를 그대로 받는다. */
  pages: readonly DialogueReviewPageLike[];
  /** API 키 설정 완료 여부 — false 면 "번역 생성" 이 비활성화된다(네트워크 요청 없음). */
  configured: boolean;
  providerLabel?: string;
  /** 문서 전체에 지금 "표시 중"인 로케일(SOURCE_LOCALE 포함) — 칩 바 강조 표시 기준. */
  activeLocale: string;
  /** 이미 번역이 하나라도 있는 로케일 코드 목록(등장 순서, SOURCE_LOCALE 제외). */
  availableLocales: string[];
  coverageFor: (locale: string) => { total: number; translated: number };
  targetLocale: string;
  onTargetLocaleChange: (code: string) => void;
  glossary: string;
  onGlossaryChange: (value: string) => void;
  busy: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
  /** 생성된 번역 초안 — null 이면 생성 화면, 채워지면 검토 화면으로 자동 전환. */
  draft: Map<string, string> | null;
  onGenerate: () => void;
  onDraftChange: (id: string, text: string) => void;
  onApplyDraft: () => void;
  onDiscardDraft: () => void;
  /** 재생성 없이 이미 만들어진 번역 사이를 토글(로케일 칩 클릭). */
  onSwitchLocale: (locale: string) => void;
  onClose: () => void;
  /** Stable local/server document scope used to isolate translation-memory entries. */
  workScope?: string;
  /**
   * 현지화 QA 화면 표시 여부. 넘기면 제어형 — 메뉴(텍스트 ▸ 현지화 QA)가 패널을 QA 화면으로
   * 바로 연다. 안 넘기면 패널이 헤더 토글로 스스로 전환한다(기존 호출부는 그대로 컴파일된다).
   */
  qaOpen?: boolean;
  onQaOpenChange?: (open: boolean) => void;
  /**
   * 번역 대조 검수 화면 표시 여부 — QA와 같은 제어형 패턴. 검수 화면은 적용이 끝난 번역을
   * 원문과 나란히 놓고 판정하는 상설 표면이라 초안 유무와 무관하게 열 수 있다.
   */
  reviewOpen?: boolean;
  onReviewOpenChange?: (open: boolean) => void;
  /** 검수 화면에서 번역문 하나를 저장할 때 — 호스트가 dialogueI18n 갱신을 문서에 커밋한다. */
  onReviewTextChange?: (pageId: string, elId: string, locale: string, text: string) => void;
  /** 검수 화면에서 승인/수정 필요를 남길 때 — null은 상태 지우기(미검수 복귀). */
  onReviewStatusChange?: (
    pageId: string,
    elId: string,
    locale: string,
    status: DialogueReviewStatus | null
  ) => void;
  /** 말풍선 테마 — 행간·자간 기본값을 고른다. 없으면 리졸버의 안전 기본값을 쓴다. */
  webtoonTheme?: BubbleWebtoonTheme;
  /** 발견 → 캔버스 요소 선택(다른 페이지면 전환). 없으면 초안 화면 안에서만 되짚는다. */
  onRevealCue?: (pageId: string, elId: string) => void;
  /** 글자 폭 측정기 주입 구멍 — 제품 코드는 넘기지 않는다(테스트 seam). */
  measurer?: BubbleTextMeasurer;
};

const StudioDialogueTranslationMemoryPanel = lazy(() =>
  import("./StudioDialogueTranslationMemoryPanel").then((module) => ({
    default: module.StudioDialogueTranslationMemoryPanel,
  }))
);

// select 의 "직접 입력…" 옵션 값 — 실제 로케일 코드로 저장되지 않는 내부 센티널.
const CUSTOM_LOCALE_OPTION = "__custom__";

const inputClass =
  "w-full rounded-lg border border-line bg-card px-2 py-1.5 text-[0.7rem] text-fg outline-none transition-colors placeholder:text-fg-4 focus:border-accent/50";

const localeChipClass = (active: boolean) =>
  cx(
    "rounded-full border px-2 py-0.5 text-[0.62rem] font-medium transition-colors",
    active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-3 hover:bg-raised"
  );

// ── 현지화 QA 스냅샷 ────────────────────────────────────────────────────────

type QaSnapshot = {
  readonly report: QaReport;
  /** 검사 당시 입력의 지문 — 지금 입력과 다르면 보고서가 낡은 것이다. */
  readonly fingerprint: string;
};

type QaInput = {
  readonly pages: readonly DialogueReviewPageLike[];
  readonly draft: Map<string, string> | null;
  /** 캔버스에 지금 표시 중인 로케일 — 초안 검사 중이고 이 값이 원문이면 요소의 text 가 곧 원문이다. */
  readonly activeLocale: string;
  /** 검사 대상 문자열의 로케일(초안이면 대상 언어, 아니면 표시 중인 언어). */
  readonly locale: string;
  readonly theme: BubbleWebtoonTheme | undefined;
  /** 용어집 자유 텍스트 — 파싱된 규칙이 QA의 용어집 검사(위반 표시)에 들어간다. */
  readonly glossary: string;
};

/**
 * 검사 입력의 지문. 넘침 판정이 읽는 필드(문자열·상자·서체·세로쓰기·숨김/잠금)를 전부 싣는다 —
 * 하나라도 빠지면 그 필드만 바뀐 회차가 "여전히 통과"로 보인다.
 */
function qaFingerprint(input: QaInput): string {
  const parts: string[] = [input.locale, input.theme ?? "", input.glossary];
  for (const page of input.pages) {
    for (const el of page.elements) {
      if (!isDialogueElement(el)) continue;
      const typo = el as typeof el & StudioLocalizationQaElementTypography;
      parts.push(
        [
          el.id,
          input.draft?.get(el.id) ?? el.text,
          el.width ?? "",
          el.height ?? "",
          typo.fontSize ?? "",
          typo.font ?? "",
          typo.fontStyle ?? "",
          typo.lineHeight ?? "",
          typo.vertical ? 1 : 0,
          el.hidden ? 1 : 0,
          el.locked ? 1 : 0,
        ].join("\u001f")
      );
    }
  }
  return parts.join("\u001e");
}

/** 순수 조립층을 부르고 지문과 함께 묶는다 — 자동 실행(효과)과 "다시 검사"(클릭)가 같은 길을 탄다. */
function computeQaSnapshot(input: QaInput, measurer: BubbleTextMeasurer): QaSnapshot {
  // 원문 확보 경로가 두 가지다. 초안 검사 중이고 캔버스가 원문을 보여 주고 있으면 요소의
  // 현재 text 가 원문이다. 적용된 번역을 검사할 때는 dialogueI18n의 원문 스냅샷이 원문이다 —
  // 스냅샷이 없는 큐는 sourceTextFor가 undefined를 돌려줘, 전제(원문)가 없는 검사가 조용히
  // 건너뛰어진다(QA 조립층 계약). 검사 대상이 원문 자체면 원문을 넘기지 않는다.
  const sourceById = (() => {
    if (input.draft) {
      return input.activeLocale === SOURCE_LOCALE
        ? new Map(collectDialogueItems(input.pages).map((item) => [item.id, item.text]))
        : null;
    }
    if (input.locale === SOURCE_LOCALE) return null;
    const map = new Map<string, string>();
    for (const page of input.pages) {
      if (!page.dialogueI18n) continue;
      for (const [elId, entry] of Object.entries(page.dialogueI18n)) {
        const source = entry[SOURCE_LOCALE];
        if (source !== undefined) map.set(elId, source);
      }
    }
    return map.size > 0 ? map : null;
  })();
  // 용어집 규칙 주입 — 지금까지 이 패널은 규칙을 넘기지 않아 QA의 용어집 검사가 실제
  // 사용 경로에서는 0개 규칙으로 돌았다. 규칙이 있을 때만 넘긴다(없으면 검사 자체가 없다).
  const glossaryRules = parseStudioTranslationMemoryGlossaryText(input.glossary);
  const report = runStudioLocalizationQa(input.pages, measurer, {
    targetLocale: input.locale,
    ...(input.draft ? { translations: input.draft } : {}),
    ...(sourceById ? { sourceTextFor: (cueId: string) => sourceById.get(cueId) } : {}),
    ...(glossaryRules.length > 0 ? { glossaryRules } : {}),
    ...(input.theme === undefined ? {} : { theme: input.theme }),
  });
  return { report, fingerprint: qaFingerprint(input) };
}

function qaSections(report: QaReport): readonly StudioLocalizationQaDimensionSection[] {
  return studioLocalizationQaGroups(report).map((group) => ({
    dimension: group.rollup.dimension,
    label: group.rollup.label,
    penalty: group.rollup.penalty,
    errorCount: group.rollup.errorCount,
    errors: group.errors,
  }));
}

export function StudioDialogueTranslatePanel({
  pages,
  configured,
  providerLabel = "AI",
  activeLocale,
  availableLocales,
  coverageFor,
  targetLocale,
  onTargetLocaleChange,
  glossary,
  onGlossaryChange,
  busy,
  progress,
  error,
  draft,
  onGenerate,
  onDraftChange,
  onApplyDraft,
  onDiscardDraft,
  onSwitchLocale,
  onClose,
  workScope,
  qaOpen,
  onQaOpenChange,
  reviewOpen,
  onReviewOpenChange,
  onReviewTextChange,
  onReviewStatusChange,
  webtoonTheme,
  onRevealCue,
  measurer,
}: StudioDialogueTranslatePanelProps) {
  const [memoryEntry, setMemoryEntry] = useState<DialogueBatchItem | null>(null);
  // Esc 로 닫기 — 입력 필드 안의 Esc 는 무시한다(StudioDialogueBatchPanel 과 동일 관례).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 대상 언어가 프리셋 코드가 아니면(빈 문자열 포함) "직접 입력" 모드 — 별도 로컬 상태 없이
  // targetLocale 값 자체로부터 화면을 파생시킨다(이 패널은 상태를 소유하지 않는다).
  const isPresetTarget = DIALOGUE_LOCALE_PRESETS.some((p) => p.code === targetLocale);
  const items = collectDialogueItems(pages);
  const draftItems = draft ? items.filter((it) => draft.has(it.id)) : [];

  const grouped: { pageId: string; pageIndex: number; items: typeof draftItems }[] = [];
  for (const it of draftItems) {
    const last = grouped[grouped.length - 1];
    if (last && last.pageId === it.pageId) last.items.push(it);
    else grouped.push({ pageId: it.pageId, pageIndex: it.pageIndex, items: [it] });
  }

  // 대상 언어 검증 — 직접 입력 모드에서는 빈 문자열·예약어("source")가 들어올 수 있다.
  // 빈 코드로 생성하면 dialogueI18n[""] 쓰레기 항목이, "source"로 생성하면 원문 스냅샷이
  // 번역문으로 덮인다(applyDialogueTranslations는 로케일 키를 검증하지 않는다).
  const targetLocaleError =
    targetLocale.trim() === ""
      ? translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "번역할 대상 언어를 입력하세요.")
      : targetLocale.trim() === SOURCE_LOCALE
        ? translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "대상 언어는 원문과 달라야 해요.")
        : null;
  const canGenerate = configured && !busy && items.length > 0 && targetLocaleError === null;
  const resolvedWorkScope = workScope?.trim() || `local:${pages[0]?.id ?? "untitled"}`;

  // ── 용어집 작품별 영속 — 세션 상태(호스트 useState)는 새로고침에 사라진다 ──────
  // 작품이 확정되면 저장본을 한 번 읽어, 지금 용어집이 비어 있을 때만 채운다(사용자가
  // 이미 입력한 텍스트를 저장본으로 덮지 않는다). 이후 변경은 같은 키로 되돌려 저장한다.
  // 저장 정본은 IndexedDB라 읽기가 비동기다 — 읽기가 끝난 뒤에야 scopeReady를 세워,
  // 아직 읽지 않은 빈 상태가 저장본을 지우는 저장으로 이어지지 않게 한다. 이미 입력이
  // 있는 경우에는 채울 것이 없으므로 기다리지 않고 바로 준비 상태로 둔다.
  const [glossaryScopeReady, setGlossaryScopeReady] = useState<string | null>(null);
  useEffect(() => {
    if (glossaryScopeReady === resolvedWorkScope) return;
    if (glossary !== "") {
      setGlossaryScopeReady(resolvedWorkScope);
      return;
    }
    let active = true;
    void (async () => {
      const saved = await loadStudioDialogueGlossaryTextAsync(resolvedWorkScope);
      if (!active) return;
      if (saved !== "") onGlossaryChange(saved);
      setGlossaryScopeReady(resolvedWorkScope);
    })();
    return () => {
      active = false;
    };
  }, [glossary, glossaryScopeReady, onGlossaryChange, resolvedWorkScope]);
  useEffect(() => {
    if (glossaryScopeReady !== resolvedWorkScope) return;
    void saveStudioDialogueGlossaryTextAsync(resolvedWorkScope, glossary);
  }, [glossary, resolvedWorkScope, glossaryScopeReady]);

  // ── 현지화 QA — 제어형/비제어형 화면 전환 + 스냅샷 ─────────────────────────
  const [uncontrolledQaOpen, setUncontrolledQaOpen] = useState(false);
  const qaVisible = qaOpen ?? uncontrolledQaOpen;
  const setQaVisible = (open: boolean) => {
    if (qaOpen === undefined) setUncontrolledQaOpen(open);
    onQaOpenChange?.(open);
  };
  // ── 번역 대조 검수 — QA와 같은 제어형/비제어형 패턴 ────────────────────────
  const [uncontrolledReviewOpen, setUncontrolledReviewOpen] = useState(false);
  const reviewVisible = reviewOpen ?? uncontrolledReviewOpen;
  const setReviewVisible = (open: boolean) => {
    if (reviewOpen === undefined) setUncontrolledReviewOpen(open);
    onReviewOpenChange?.(open);
  };
  const [qaSnapshot, setQaSnapshot] = useState<QaSnapshot | null>(null);
  // 발견 → 초안 행으로 되짚을 때 포커스할 textarea. QA 화면이 닫히고 초안 행이 다시 그려진 뒤에야
  // 요소가 존재하므로 "포커스 대기" 상태로 한 프레임 넘긴다.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const draftRowRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const resolvedMeasurer = useMemo(() => measurer ?? createCanvasBubbleTextMeasurer(), [measurer]);

  // 검사 로케일: 초안이 있으면 초안의 언어, 없으면 캔버스에 지금 표시 중인 언어(원문 포함).
  const qaLocale = draft ? targetLocale : activeLocale;
  const qaInput: QaInput = {
    pages,
    draft,
    activeLocale,
    locale: qaLocale,
    theme: webtoonTheme,
    glossary,
  };
  const qaStale = qaVisible && qaSnapshot !== null && qaSnapshot.fingerprint !== qaFingerprint(qaInput);

  // QA 화면이 열렸는데 보고서가 없으면 한 번 자동 실행한다 — 메뉴에서 열었을 때 버튼을 한 번 더
  // 누르게 하지 않는다. 이후 입력이 바뀌면 자동 재실행이 아니라 "다시 검사" 배너다.
  useEffect(() => {
    if (!qaVisible || qaSnapshot !== null) return;
    setQaSnapshot(
      computeQaSnapshot(
        { pages, draft, activeLocale, locale: qaLocale, theme: webtoonTheme, glossary },
        resolvedMeasurer
      )
    );
  }, [qaVisible, qaSnapshot, pages, draft, activeLocale, qaLocale, webtoonTheme, glossary, resolvedMeasurer]);

  useEffect(() => {
    if (pendingFocusId === null) return;
    const row = draftRowRefs.current.get(pendingFocusId);
    if (row) {
      row.focus();
      if (typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
    }
    setPendingFocusId(null);
  }, [pendingFocusId]);

  const runQa = () => setQaSnapshot(computeQaSnapshot(qaInput, resolvedMeasurer));
  const qaCueIndex = qaSnapshot ? studioLocalizationQaCueIndex(qaSnapshot.report) : null;
  const revealQaCue = (cueId: string) => {
    const cue = qaCueIndex?.get(cueId);
    if (!cue) return;
    onRevealCue?.(cue.pageId, cue.id);
    if (draft?.has(cue.id)) {
      setQaVisible(false);
      setPendingFocusId(cue.id);
    }
  };
  const qaJumpAvailable = draft !== null || onRevealCue !== undefined;
  const qaTargetLabel = draft
    ? `번역 초안(적용 전) · ${localeLabel(targetLocale)}`
    : activeLocale === SOURCE_LOCALE
      ? "문서 원문"
      : `문서 · ${localeLabel(activeLocale)}`;

  return (
    <section
      aria-label={translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "대사 번역")}
      className="absolute right-3 top-3 z-40 flex max-h-[calc(100%-5rem)] w-[min(22rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-panel/95 shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <Languages size={13} className="text-accent" aria-hidden />
          {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "대사 번역")}<span className="font-medium text-fg-4">· {providerLabel}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setReviewVisible(!reviewVisible)}
            aria-pressed={reviewVisible}
            title={translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "번역 대조 검수 — 적용된 번역을 원문과 나란히 놓고 승인·수정 필요를 남긴다")}
            className={cx(
              "inline-flex items-center gap-1 rounded-lg border px-2 text-[0.62rem] font-semibold transition-colors",
              reviewVisible
                ? "border-accent/35 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised",
              STUDIO_FOCUS_RING,
              STUDIO_TOUCH_TARGET
            )}
          >
            <ListChecks size={12} aria-hidden />
            {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "대조 검수")}</button>
          <button
            type="button"
            onClick={() => setQaVisible(!qaVisible)}
            aria-pressed={qaVisible}
            title={translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "현지화 QA — 말풍선 넘침·영문 레터링 문체·MQM 품질 점수")}
            className={cx(
              "inline-flex items-center gap-1 rounded-lg border px-2 text-[0.62rem] font-semibold transition-colors",
              qaVisible
                ? "border-accent/35 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised",
              STUDIO_FOCUS_RING,
              STUDIO_TOUCH_TARGET
            )}
          >
            <ScanText size={12} aria-hidden />
            {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "현지화 QA")}</button>
          <button
            type="button"
            onClick={onClose}
            aria-label={translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "대사 번역 닫기")}
            className="grid size-6 place-items-center rounded-lg border border-line text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* 로케일 칩 바 — 세 화면 공통. 클릭 시 재생성 없이 이미 만들어진 번역 사이를 즉시 토글한다. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line/60 px-3 py-2">
        <button
          type="button"
          onClick={() => onSwitchLocale(SOURCE_LOCALE)}
          aria-pressed={activeLocale === SOURCE_LOCALE}
          className={localeChipClass(activeLocale === SOURCE_LOCALE)}
        >
          {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "원문")}</button>
        {availableLocales.map((code) => {
          const coverage = coverageFor(code);
          const pct = coverage.total > 0 ? Math.round((coverage.translated / coverage.total) * 100) : 0;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onSwitchLocale(code)}
              aria-pressed={activeLocale === code}
              title={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "{v0} · {v1}/{v2} 번역됨"), { v0: String(localeLabel(code)), v1: String(coverage.translated), v2: String(coverage.total) })}
              className={localeChipClass(activeLocale === code)}
            >
              {localeLabel(code)} <span className="opacity-70">{pct}%</span>
            </button>
          );
        })}
        {availableLocales.length === 0 && (
          <span className="text-[0.62rem] text-fg-4">{translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "아직 번역된 언어가 없어요.")}</span>
        )}
      </div>

      {reviewVisible ? (
        // ── D. 번역 대조 검수 화면 ────────────────────────────────────────
        <StudioDialogueReviewSection
          pages={pages}
          activeLocale={activeLocale}
          availableLocales={availableLocales}
          glossary={glossary}
          onTextChange={(pageId, elId, locale, text) => onReviewTextChange?.(pageId, elId, locale, text)}
          onStatusChange={(pageId, elId, locale, status) => onReviewStatusChange?.(pageId, elId, locale, status)}
          {...(onRevealCue ? { onRevealCue } : {})}
        />
      ) : qaVisible ? (
        // ── C. 현지화 QA 화면 ─────────────────────────────────────────────
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="border-b border-line/60 px-3 py-1.5 text-[0.62rem] text-fg-3">
            {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "검사 대상: ")}<span className="font-medium text-fg-2">{qaTargetLabel}</span>
          </p>
          {qaSnapshot === null ? (
            <p role="status" className="flex items-center gap-1.5 px-3 py-4 text-[0.66rem] text-fg-3">
              <Loader2 size={11} className="animate-spin text-accent motion-reduce:animate-none" aria-hidden />
              {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "검사 준비 중…")}</p>
          ) : (
            <StudioLocalizationQaReport
              report={qaSnapshot.report}
              sections={qaSections(qaSnapshot.report)}
              cueIndex={qaCueIndex ?? new Map()}
              stale={qaStale}
              onRerun={runQa}
              {...(qaJumpAvailable ? { onSelectCue: revealQaCue } : {})}
              jumpLabel={draft ? translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "초안에서 고치기") : translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "캔버스에서 선택")}
            />
          )}
        </div>
      ) : draft === null ? (
        // ── A. 생성 화면 ──────────────────────────────────────────────────
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
          <div className="space-y-1">
            <label className="block text-[0.66rem] font-medium text-fg-3" htmlFor="dialogue-translate-target">
              {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "대상 언어")}</label>
            {isPresetTarget ? (
              <select
                id="dialogue-translate-target"
                value={targetLocale}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_LOCALE_OPTION) onTargetLocaleChange("");
                  else onTargetLocaleChange(e.target.value);
                }}
                className={inputClass}
              >
                {DIALOGUE_LOCALE_PRESETS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
                <option value={CUSTOM_LOCALE_OPTION}>{translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "직접 입력…")}</option>
              </select>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={targetLocale}
                  onChange={(e) => onTargetLocaleChange(e.target.value)}
                  placeholder={translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "언어 코드 또는 이름(예: pt-BR, 베트남어)")}
                  aria-label={translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "대상 언어(직접 입력)")}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => onTargetLocaleChange(DIALOGUE_LOCALE_PRESETS[0].code)}
                  className="shrink-0 whitespace-nowrap text-[0.62rem] font-medium text-accent hover:underline"
                >
                  {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "목록에서 선택")}</button>
              </div>
            )}
            {targetLocaleError ? (
              <p role="alert" className="text-[0.62rem] leading-relaxed text-warn">
                {targetLocaleError}
              </p>
            ) : null}
          </div>

          <StudioDialogueGlossaryEditor glossary={glossary} onGlossaryChange={onGlossaryChange} />

          {!configured ? (
            <AiRecoveryNotice
              code="not_configured"
              message="번역 초안은 유지됩니다. 로그인해 자동 무료 AI를 사용하거나 통합 AI 설정에서 개인 무료 키를 연결하세요."
              compact
            />
          ) : null}
          {error ? (
            <AiRecoveryNotice
              message={error}
              onRetry={canGenerate ? onGenerate : undefined}
              compact
            />
          ) : null}
          {busy && progress && (
            <p role="status" className="flex items-center gap-1.5 text-[0.66rem] text-fg-3">
              <Loader2 size={11} className="animate-spin text-accent" aria-hidden />
              {progress.done}/{progress.total} {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "청크 처리 중…")}</p>
          )}

          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className={cx(
              "flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors",
              canGenerate ? "bg-accent text-on-accent hover:opacity-90" : "cursor-not-allowed bg-card text-fg-4"
            )}
          >
            {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Globe2 size={12} aria-hidden />}
            {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "번역 생성")}</button>
          {items.length === 0 && (
            <p className="text-center text-[0.62rem] text-fg-4">{translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "번역할 말풍선·텍스트가 없어요.")}</p>
          )}
        </div>
      ) : (
        // ── B. 검토·적용 화면 ─────────────────────────────────────────────
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
            {grouped.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-4">
                {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "생성된 번역이 없어요.")}</p>
            ) : (
              <div className="space-y-2.5">
                {grouped.map((group) => (
                  <section key={group.pageId} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "{v0}페이지 번역"), { v0: String(group.pageIndex + 1) })}>
                    <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-fg-3">
                      {group.pageIndex + 1}{translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "페이지")}</p>
                    <ul className="space-y-1.5">
                      {group.items.map((entry) => (
                        <li key={entry.id} className="rounded-lg border border-line bg-card/45 p-1.5">
                          <div className="mb-1 flex min-w-0 items-center gap-1.5">
                            <p className="min-w-0 flex-1 truncate text-[0.64rem] text-fg-4" title={entry.text}>
                              {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "원문: ")}{entry.text}
                            </p>
                            <button
                              type="button"
                              onClick={() => setMemoryEntry(entry)}
                              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-[0.62rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                              title={translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "이 대사와 유사한 검토·승인 번역을 찾거나 현재 번역을 로컬 메모리에 저장")}
                            >
                              <BookOpenCheck size={12} aria-hidden />
                              {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "메모리")}</button>
                          </div>
                          <textarea
                            ref={(node) => {
                              if (node) draftRowRefs.current.set(entry.id, node);
                              else draftRowRefs.current.delete(entry.id);
                            }}
                            value={draft.get(entry.id) ?? entry.text}
                            onChange={(e) => onDraftChange(entry.id, e.target.value)}
                            rows={Math.min(4, Math.max(1, (draft.get(entry.id) ?? entry.text).split("\n").length))}
                            aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "{v0}페이지 대사 번역 수정"), { v0: String(group.pageIndex + 1) })}
                            className={cx(inputClass, "resize-y py-1 leading-snug")}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 border-t border-line/60 px-3 py-2">
            <button
              type="button"
              onClick={onDiscardDraft}
              className="flex-1 rounded-lg border border-line bg-card py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised"
            >
              {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "취소")}</button>
            <button
              type="button"
              onClick={onApplyDraft}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-on-accent transition-colors hover:opacity-90"
            >
              <Check size={12} aria-hidden /> {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "적용")}</button>
          </div>
        </>
      )}
      {memoryEntry && draft ? (
        <div className="absolute inset-0 z-50 overflow-y-auto overscroll-contain bg-panel/98 p-2 backdrop-blur">
          <Suspense
            fallback={
              <div
                role="status"
                className="grid min-h-40 place-items-center text-xs text-fg-3"
              >
                {translateCurrentStaticSourceText("domains.creator.StudioDialogueTranslatePanel", "ko", "번역 메모리를 여는 중…")}</div>
            }
          >
            <StudioDialogueTranslationMemoryPanel
              workScope={resolvedWorkScope}
              sourceText={memoryEntry.text}
              sourceLocale={SOURCE_LOCALE}
              targetLocale={targetLocale}
              sourceRevision={`${memoryEntry.pageId}:${memoryEntry.id}:${memoryEntry.text}`}
              glossaryText={glossary}
              initialTranslation={draft.get(memoryEntry.id) ?? memoryEntry.text}
              onReuse={(translation) => onDraftChange(memoryEntry.id, translation)}
              onClose={() => setMemoryEntry(null)}
            />
          </Suspense>
        </div>
      ) : null}
    </section>
  );
}
