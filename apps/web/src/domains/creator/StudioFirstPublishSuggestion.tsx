/**
 * StudioFirstPublishSuggestion — 첫 게시 후속 제안 카드 (first-run F6.2)
 *
 * 저장 상태 표시(StudioSaveStatusChromeMount) 아래에 한 번만 뜨는 비모달 카드.
 * 코치 4단계가 "저장"에서 끝난 뒤의 다음 단계 — 게시 준비(사전검사·게시 센터) —
 * 를 잇는다. 표시 판정·1회성 기억은 순수 모듈
 * `studio-first-publish-suggestion`이 소유하고, 이 컴포넌트는 렌더와
 * 닫기/CTA 배선만 맡는다.
 *
 * 1회성 계약:
 * - 닫기(✕)를 누르면 기기에 기억해 같은 문서에서는 다시 띄우지 않는다.
 * - "게시 준비 확인하기"를 눌러도 같은 기억을 남긴다 — 이미 행동한 사용자에게
 *   같은 제안을 반복하는 것은 안내가 아니라 잔소리다.
 * - 기억은 렌더 전에 읽으므로, 닫은 뒤 새로고침해도 깜빡이며 다시 뜨지 않는다.
 */

import { CheckCircle2, Info, X } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import {
  browserFirstPublishSuggestionStorage,
  markFirstPublishSuggestionDismissed,
  readFirstPublishSuggestionDismissed,
  shouldSuggestFirstPublish,
} from "./studio-first-publish-suggestion";

// StudioSaveStatusBar와 같은 이중언어 패턴: 컴포넌트 이름 네임스페이스에 한·영 병기.
const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("StudioFirstPublishSuggestion", ko, en);

export interface StudioFirstPublishSuggestionProps {
  /** 오토세이브 receipt로 확인된 첫 저장 완료 여부 (studio-save-sync-signals의 lastReceipt). */
  readonly firstSaveCompleted: boolean;
  /** 현재 회차에 쌓인 컷 수. 호스트가 모르면 0 — 첫 저장 조건만으로 발동한다. */
  readonly cutCount: number;
  /** 이미 게시된 문서면 제안하지 않는다. */
  readonly alreadyPublished?: boolean;
  /** 1회성 기억의 단위. 문서(회차) 식별자 — 문서가 바뀌면 새 첫 게시 흐름으로 본다. */
  readonly scope: string;
  /** "게시 준비 확인하기" — 게시 사전검사/게시 센터로 이동시키는 호스트 콜백. */
  readonly onCheckPublishReady: () => void;
}

export function StudioFirstPublishSuggestion({
  firstSaveCompleted,
  cutCount,
  alreadyPublished = false,
  scope,
  onCheckPublishReady,
}: StudioFirstPublishSuggestionProps) {
  useBilingualI18nRevision();
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const disclosureRef = useRef<HTMLButtonElement>(null);
  const [dismissed, setDismissed] = useState<boolean>(() =>
    readFirstPublishSuggestionDismissed(browserFirstPublishSuggestionStorage(), scope),
  );

  if (
    !shouldSuggestFirstPublish({
      firstSaveCompleted,
      cutCount,
      alreadyPublished,
      dismissed,
    })
  ) {
    return null;
  }

  const rememberAndHide = () => {
    markFirstPublishSuggestionDismissed(browserFirstPublishSuggestionStorage(), scope);
    setDismissed(true);
  };

  const handleCheckPublishReady = () => {
    rememberAndHide();
    onCheckPublishReady();
  };

  const handleEscape = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape" || !expanded) return;
    event.preventDefault();
    event.stopPropagation();
    setExpanded(false);
    disclosureRef.current?.focus({ preventScroll: true });
  };

  return (
    <section
      data-studio-first-publish-suggestion="true"
      data-studio-shortcut-boundary="true"
      aria-label={bi("게시 준비 제안", "Publish readiness suggestion")}
      className="pointer-events-auto w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-accent/35 bg-panel/95 p-2 shadow-lg backdrop-blur-md"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onKeyDown={handleEscape}
          onClick={handleCheckPublishReady}
          className="flex h-11 min-h-11 min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-2 text-xs font-semibold text-fg transition-colors hover:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <CheckCircle2 size={15} className="shrink-0" aria-hidden />
          {bi("게시 준비 확인하기", "Check publish readiness")}
        </button>
        <button
          ref={disclosureRef}
          type="button"
          onKeyDown={handleEscape}
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={expanded
            ? bi("게시 준비 설명 접기", "Hide publish readiness details")
            : bi("게시 준비 설명 보기", "Show publish readiness details")}
          className="grid size-11 shrink-0 touch-manipulation place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <Info size={16} aria-hidden />
        </button>
        <button
          type="button"
          onKeyDown={handleEscape}
          onClick={rememberAndHide}
          aria-label={bi("게시 준비 제안 닫기", "Dismiss the publish readiness suggestion")}
          className="grid size-11 shrink-0 touch-manipulation place-items-center rounded-lg border border-line text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <p className="mt-1 px-1 text-xs leading-snug text-fg-2">
        {bi("게시는 확인 후 따로 진행해요.", "Publishing is a separate step after the check.")}
      </p>
      <p id={detailsId} hidden={!expanded} className="mt-2 border-t border-line px-1 pt-2 text-xs leading-relaxed text-fg-2">
        {bi(
          "게시 전에 빠진 게 없는지 미리 확인하면, 다 그린 뒤에 되돌아오는 일을 줄일 수 있어요. 게시는 확인 뒤에 따로 진행돼요.",
          "A quick check now means fewer surprises after you finish drawing. Publishing itself happens separately, after the check.",
        )}
      </p>
    </section>
  );
}

export default StudioFirstPublishSuggestion;
