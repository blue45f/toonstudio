import { Clapperboard, Download, ExternalLink, Languages, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PROMO_DOCUMENT_CUTS_MAX } from "../promo/promo-handoff-contract";
import { SHOWCASE_PROMO_PATH } from "../publishing/showcase-links";
import { downloadBlob } from "./studio-export";
import {
  exceedsStudioPromoCutLimit,
  listStudioPromoCuts,
  STUDIO_PROMO_CUT_RECOMMENDED_SCALE,
} from "./studio-promo-cuts";
import {
  exceedsStudioPromoTranslationLimit,
  listStudioPromoTranslations,
} from "./studio-promo-translations";

import type { DialogueReviewPageLike } from "../lettering/studio-dialogue-review";
import type { WatermarkSettings } from "../studio-watermark";
import type { StudioExportMenuPackageContext } from "./StudioExportMenuPanel";

type Action = "cuts" | "translations";
interface Status {
  action: Action;
  /** 상태가 만들어진 페이지 범위. 범위가 바뀌면 이전 결과를 보여 주지 않는다. */
  rangeLabel: string;
  tone: "info" | "good" | "warn";
  text: string;
  percent?: number;
}

export interface StudioPromoHandoffSectionProps {
  context: StudioExportMenuPackageContext;
  /** 문서의 모든 페이지(대사·프레임 포함). 없으면 이 화면에서는 만들 수 없다. */
  pages: readonly DialogueReviewPageLike[] | null | undefined;
  /** 문서 캔버스 폭 — 캡처 폭 ÷ 이 값이 내보내기 배율이다. */
  canvasWidth: number;
  exportScale: number;
  exportTitle: string;
  watermark: WatermarkSettings;
  sourceWorkId: string | null | undefined;
  /** 컷 묶음을 만드는 동안 다른 내보내기를 잠그도록 부모에게 알린다. */
  onBusyChange: (busy: boolean) => void;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
}

const NOTE = "text-[0.6rem] leading-relaxed text-fg-3";
const ACTION_BUTTON =
  "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/15 px-2 text-[0.68rem] font-bold text-accent transition-colors hover:bg-accent/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";

/**
 * Studio 문서를 홍보 쇼츠 편집기로 넘기는 파일을 내보낸다 — 컷 묶음(컷 이미지 + 컷 안 말풍선 글)과 번역 초안.
 * 파일을 만드는 코드는 버튼을 누를 때 불러오고, 페이지 캡처는 내보내기 메뉴의 공용 캡처(선택한 페이지 범위)를 쓴다.
 */
export function StudioPromoHandoffSection({
  context,
  pages,
  canvasWidth,
  exportScale,
  exportTitle,
  watermark,
  sourceWorkId,
  onBusyChange,
}: StudioPromoHandoffSectionProps) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const busyChangeRef = useRef(onBusyChange);

  useEffect(() => {
    busyChangeRef.current = onBusyChange;
  });
  useEffect(() => {
    busyChangeRef.current(busy !== null);
  }, [busy]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      busyChangeRef.current(false);
    };
  }, []);

  // 부모가 렌더마다 새 배열을 넘기므로, 값이 같은 동안은 같은 배열을 쓰도록 문자열 키에서 다시 만든다.
  const indicesKey = context.pageIndices.join(",");
  const pageIndices = useMemo(() => (indicesKey ? indicesKey.split(",").map(Number) : []), [indicesKey]);
  const cuts = useMemo(() => (pages ? listStudioPromoCuts(pages, pageIndices) : null), [pages, pageIndices]);
  const translations = useMemo(() => (pages ? listStudioPromoTranslations(pages, pageIndices) : null), [pages, pageIndices]);

  const tooManyCuts = cuts ? exceedsStudioPromoCutLimit(cuts) : false;
  const tooManyTranslations = translations ? exceedsStudioPromoTranslationLimit(translations) : false;
  const cutsReady = Boolean(cuts && cuts.frames.length > 0 && !tooManyCuts);
  const translationsReady = Boolean(translations && translations.entries.length > 0 && !tooManyTranslations);
  const locked = busy !== null || context.busy || !context.canExport;
  const visibleStatus = status && status.rangeLabel === context.rangeLabel ? status : null;

  const finish = (next: Status | null) => {
    if (abortRef.current) abortRef.current = null;
    if (!mountedRef.current) return;
    setBusy(null);
    setStatus(next);
  };

  const exportCuts = async () => {
    if (!cuts || !cutsReady || locked) return;
    const rangeLabel = context.rangeLabel;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("cuts");
    setStatus({ action: "cuts", rangeLabel, tone: "info", text: `페이지를 캡처하는 중이에요. (${rangeLabel})`, percent: 0 });
    let owned: HTMLCanvasElement[] = [];
    try {
      const captured = await context.capturePages();
      owned = captured.pages;
      if (controller.signal.aborted) throw new DOMException("취소", "AbortError");
      if (captured.pages.length !== captured.indices.length) throw new Error("페이지 캡처가 끝까지 되지 않았어요. 다시 시도해 주세요.");
      const handoff = await import("./studio-promo-handoff");
      const result = await handoff.buildStudioPromoCutBundle({
        listing: cuts,
        captures: captured.indices.map((pageIndex, index) => ({ pageIndex, canvas: captured.pages[index] })),
        canvasWidth,
        title: exportTitle,
        documentId: sourceWorkId ?? null,
        render: handoff.createStudioPromoCutImageRenderer({ watermark }),
        signal: controller.signal,
        onProgress: (done, total) => {
          if (!mountedRef.current) return;
          setStatus({ action: "cuts", rangeLabel, tone: "info", text: `컷 이미지를 만드는 중이에요. ${done}/${total}`, percent: Math.round((done / total) * 100) });
        },
      });
      downloadBlob(new Blob([result.json], { type: "application/json" }), result.fileName);
      finish({
        action: "cuts",
        rangeLabel,
        tone: result.skippedFrameCount > 0 ? "warn" : "good",
        percent: 100,
        text: result.skippedFrameCount > 0
          ? `컷 ${result.bundle.cuts.length}개를 저장했어요. 캡처 밖에 있는 컷 ${result.skippedFrameCount}개는 담지 못했어요. 홍보 영상 편집기의 「Studio 문서에서 컷 가져오기」에서 불러오세요.`
          : `컷 ${result.bundle.cuts.length}개를 저장했어요. 홍보 영상 편집기의 「Studio 문서에서 컷 가져오기」에서 불러오세요.`,
      });
    } catch (error) {
      finish({
        action: "cuts",
        rangeLabel,
        tone: "warn",
        text: isAbort(error)
          ? "컷 묶음 만들기를 취소했어요. 다시 시도할 수 있어요."
          : error instanceof Error ? error.message : "컷 묶음을 만들지 못했어요. 다시 시도해 주세요.",
      });
    } finally {
      // 캡처한 큰 캔버스는 이 파일이 만든 뒤 아무도 쓰지 않는다. 바로 놓는다.
      owned.forEach(releaseCanvas);
    }
  };

  const exportTranslations = async () => {
    if (!translations || !translationsReady || locked) return;
    const rangeLabel = context.rangeLabel;
    setBusy("translations");
    setStatus({ action: "translations", rangeLabel, tone: "info", text: "번역 초안 파일을 만드는 중이에요." });
    try {
      const handoff = await import("./studio-promo-handoff");
      const result = handoff.buildStudioPromoTranslationFile({ listing: translations, documentId: sourceWorkId ?? null, title: exportTitle, exportedAt: new Date() });
      downloadBlob(new Blob([result.json], { type: "application/json" }), result.fileName);
      finish({
        action: "translations",
        rangeLabel,
        tone: "good",
        text: `로케일 ${result.localeCount}개, 번역 ${result.draftCount}건을 저장했어요. 홍보 영상 편집기의 「로케일별 자막 일괄 출력」에서 불러오세요.`,
      });
    } catch (error) {
      finish({ action: "translations", rangeLabel, tone: "warn", text: error instanceof Error ? error.message : "번역 초안을 만들지 못했어요. 다시 시도해 주세요." });
    }
  };

  const cancel = () => {
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) return;
    controller.abort();
    setStatus({ action: "cuts", rangeLabel: context.rangeLabel, tone: "info", text: "현재 단계를 마친 뒤 컷 묶음 만들기를 멈추고 있어요." });
  };

  const retryCuts = visibleStatus?.action === "cuts" && visibleStatus.tone === "warn" && busy === null;
  const retryTranslations = visibleStatus?.action === "translations" && visibleStatus.tone === "warn" && busy === null;
  const scaleLow = exportScale < STUDIO_PROMO_CUT_RECOMMENDED_SCALE;
  const withoutFrames = cuts?.pagesWithoutFrames.map((index) => index + 1) ?? [];
  const warnTone = visibleStatus?.tone === "warn";

  return (
    <section
      data-studio-promo-handoff="true"
      aria-labelledby="studio-promo-handoff-title"
      aria-busy={busy !== null}
      className="mt-3 rounded-xl border border-accent/25 bg-accent/5 p-2.5"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
          <Clapperboard size={16} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span id="studio-promo-handoff-title" className="block text-[0.72rem] font-bold text-fg">
            홍보 쇼츠로 보내기
          </span>
          <span className="mt-0.5 block text-[0.61rem] leading-relaxed text-fg-3">
            문서에 그린 컷(프레임)과 컷 안 말풍선 글을 홍보 영상 편집기가 읽는 JSON으로 저장해요. 이미지에서 컷을 찾지는
            않아요.
          </span>
        </span>
      </div>

      {!pages ? (
        <p className={`mt-2 rounded-lg border border-line/70 bg-panel/70 px-2 py-1.5 ${NOTE}`}>
          이 화면에서는 문서의 컷과 대사 정보를 받지 못해 홍보 쇼츠용 파일을 만들 수 없어요.
        </p>
      ) : (
        <>
          <div className="mt-2 rounded-lg border border-line/70 bg-panel/70 p-2">
            <p className="text-[0.66rem] font-semibold text-fg-2">홍보 쇼츠용 컷 묶음</p>
            {cuts && cuts.frames.length > 0 ? (
              <p className="mt-0.5 text-[0.61rem] tabular-nums text-fg-3">
                {context.rangeLabel} · 컷 {cuts.frames.length.toLocaleString("ko-KR")}개 · 말풍선{" "}
                {cuts.dialogueCount.toLocaleString("ko-KR")}개
              </p>
            ) : (
              <p className={`mt-0.5 ${NOTE}`}>
                선택한 범위({context.rangeLabel})에 컷(프레임)이 없어요. 프레임을 그린 페이지를 선택해 주세요.
              </p>
            )}
            {tooManyCuts && cuts ? (
              <p role="alert" className="mt-1 text-[0.61rem] leading-relaxed text-warn">
                컷이 {cuts.frames.length}개예요. 한 묶음은 {PROMO_DOCUMENT_CUTS_MAX}컷까지 담을 수 있어요. 페이지 범위를 줄여 주세요.
              </p>
            ) : null}
            {cutsReady && cuts ? (
              <ul className={`mt-1 list-disc space-y-0.5 pl-4 ${NOTE}`}>
                <li>컷 이미지에는 말풍선이 그려진 채로 들어가요. 영상 자막이 겹쳐 보이면 홍보 편집기에서 자막을 비워 두세요.</li>
                {scaleLow ? <li>내보내기 배율이 {exportScale}×예요. 영상에서는 {STUDIO_PROMO_CUT_RECOMMENDED_SCALE}× 이상을 권장해요.</li> : null}
                {translations && translations.translatedVisibleCount > 0 ? (
                  <li>말풍선 {translations.translatedVisibleCount}개가 번역 언어로 보이고 있어요. 자막이 번역문으로 담겨요. 원문 언어로 돌린 뒤 내보내는 것을 권장해요.</li>
                ) : null}
                {cuts.outsideDialogueCount > 0 ? <li>컷 밖에 놓인 말풍선 {cuts.outsideDialogueCount}개는 자막 후보에서 뺐어요.</li> : null}
                {cuts.clippedDialogueCount > 0 ? <li>한 컷에 40개를 넘는 말풍선 {cuts.clippedDialogueCount}개는 뺐어요.</li> : null}
                {cuts.skippedFrameCount > 0 ? <li>숨겼거나 너무 작은 프레임 {cuts.skippedFrameCount}개는 컷으로 보지 않았어요.</li> : null}
                {withoutFrames.length > 0 ? <li>컷이 없는 페이지: {withoutFrames.slice(0, 8).join(", ")}{withoutFrames.length > 8 ? " 외" : ""}</li> : null}
                <li>컷 순서는 대사 읽기 순서(위→아래, 왼→오른)예요. 홍보 편집기의 미리보기에서 바꿀 수 있어요.</li>
              </ul>
            ) : null}
            {visibleStatus?.action === "cuts" && visibleStatus.percent !== undefined && busy === "cuts" ? (
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/20"
                role="progressbar"
                aria-label="홍보 쇼츠용 컷 묶음 진행률"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={visibleStatus.percent}
              >
                <div className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${visibleStatus.percent}%` }} />
              </div>
            ) : null}
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                className={ACTION_BUTTON}
                disabled={locked || !cutsReady}
                onClick={() => void exportCuts()}
              >
                {retryCuts ? <RotateCcw size={14} aria-hidden /> : <Download size={14} aria-hidden />}
                {busy === "cuts" ? "컷 묶음 만드는 중" : retryCuts ? "컷 묶음 다시 시도" : "홍보 쇼츠용 컷 묶음 저장"}
              </button>
              {busy === "cuts" ? (
                <button
                  type="button"
                  onClick={cancel}
                  className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-line bg-panel text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
                  aria-label="홍보 쇼츠용 컷 묶음 만들기 취소"
                  title="컷 묶음 만들기 취소"
                >
                  <X size={15} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-line/70 bg-panel/70 p-2">
            <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-2">
              <Languages size={13} aria-hidden /> 번역 초안 JSON
            </p>
            {translations && translations.locales.length > 0 ? (
              <ul className="mt-0.5 space-y-0.5 text-[0.61rem] tabular-nums text-fg-3" aria-label="로케일별 번역 현황">
                {translations.locales.map((locale) => (
                  <li key={locale.code}>
                    {locale.code} · 번역 {locale.total}건 · 승인 {locale.approved}건
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`mt-0.5 ${NOTE}`}>
                선택한 범위에 번역된 대사가 없어요. 대사 번역 패널에서 번역을 만들고 검수한 뒤 내보낼 수 있어요.
              </p>
            )}
            {tooManyTranslations ? (
              <p role="alert" className="mt-1 text-[0.61rem] leading-relaxed text-warn">
                번역 초안이 너무 많아요. 페이지 범위를 줄여 주세요.
              </p>
            ) : null}
            {translationsReady && translations ? (
              <ul className={`mt-1 list-disc space-y-0.5 pl-4 ${NOTE}`}>
                <li>검수에서 승인한 번역만 승인으로 담아요. 승인 전 초안과 원문이 바뀐 번역은 홍보 편집기에서 경고해요.</li>
                {translations.skippedLocales.length > 0 ? <li>로케일 코드 모양이 맞지 않아 뺀 언어: {translations.skippedLocales.join(", ")} (예: en, ja, zh-Hans)</li> : null}
                {translations.oversizedCount > 0 ? <li>ID나 글자 수 상한을 넘는 {translations.oversizedCount}건은 뺐어요.</li> : null}
              </ul>
            ) : null}
            <div className="mt-2">
              <button
                type="button"
                className={ACTION_BUTTON}
                disabled={locked || !translationsReady}
                onClick={() => void exportTranslations()}
              >
                {retryTranslations ? <RotateCcw size={14} aria-hidden /> : <Download size={14} aria-hidden />}
                {busy === "translations" ? "번역 초안 만드는 중" : retryTranslations ? "번역 초안 다시 시도" : "번역 초안 JSON 저장"}
              </button>
            </div>
          </div>
        </>
      )}

      {visibleStatus ? (
        warnTone ? (
          <p role="alert" className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-2 py-1.5 text-[0.61rem] leading-relaxed text-warn">
            {visibleStatus.text}
          </p>
        ) : (
          <p
            role="status"
            className={`mt-2 rounded-lg border px-2 py-1.5 text-[0.61rem] leading-relaxed ${visibleStatus.tone === "good" ? "border-good/40 bg-good/10 text-good" : "border-line bg-card text-fg-3"}`}
          >
            {visibleStatus.text}
          </p>
        )
      ) : null}

      <a
        href={SHOWCASE_PROMO_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-[0.64rem] font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        홍보 영상 편집기 열기 <ExternalLink size={12} aria-hidden />
        <span className="sr-only">(새 탭)</span>
      </a>
    </section>
  );
}
