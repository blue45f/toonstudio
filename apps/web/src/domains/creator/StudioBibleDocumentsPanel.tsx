import { panelStatusText } from "./studio-panel-status-i18n-r3c06";
import { AlertTriangle, BookOpenCheck, Clapperboard, Megaphone, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import {
  STUDIO_BIBLE_DOCUMENT_PURPOSES,
  STUDIO_BIBLE_PURPOSE_LABELS,
  buildSeasonArcBoard,
  formatBibleDocumentStampLine,
  summarizeSeasonArcDocument,
  validateBibleDocument,
  type StudioBibleDocument,
  type StudioBibleDocumentPurpose,
  type StudioSeasonArcBibleDocument,
} from "./studio-bible-documents";

export interface StudioBibleDocumentsPanelProps {
  readonly documents: readonly StudioBibleDocument[];
  readonly loading?: boolean;
  readonly error?: string | null;
  /** 빈 용도에서 템플릿으로 새 문서를 만든다. 호스트가 스탬프(버전·시즌)를 붙여 저장한다. */
  readonly onCreateFromTemplate?: (purpose: StudioBibleDocumentPurpose) => void;
  /** 문서 행의 "열기" — 호스트가 해당 문서 편집 화면으로 이동한다. */
  readonly onSelectDocument?: (documentId: string) => void;
}

const PURPOSE_ICONS: Readonly<Record<StudioBibleDocumentPurpose, typeof Megaphone>> = {
  pitch: Megaphone,
  "season-arc": Clapperboard,
  "continuity-db": BookOpenCheck,
};

function SeasonArcBoard({ document }: { readonly document: StudioSeasonArcBibleDocument }) {
  const board = useMemo(() => buildSeasonArcBoard(document), [document]);
  const summary = useMemo(() => summarizeSeasonArcDocument(document), [document]);
  return (
    <div className="mt-3 space-y-3">
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed text-fg-2">
        {summary.lines[1]}
        <span className="mt-1 block font-semibold text-fg">{summary.lines[2]}</span>
      </p>

      <div>
        <h5 className="text-xs font-black text-fg">캐릭터별 원하는 것 / 필요한 것</h5>
        {document.characterArcs.length === 0 ? (
          <p className="mt-1 text-xs text-fg-3">{panelStatusText("studio.panelStatus.bibleDocuments.characterArcsEmpty", "아직 캐릭터 아크가 없어요.")}</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {document.characterArcs.map((arc) => (
              <li key={arc.characterId} className="rounded-xl border border-line px-3 py-2 text-xs leading-relaxed">
                <span className="font-bold text-fg">{arc.characterName}</span>
                <span className="mt-0.5 block text-fg-2">원하는 것: {arc.want || "(미작성)"}</span>
                <span className="block text-fg-2">필요한 것: {arc.need || "(미작성)"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h5 className="text-xs font-black text-fg">전 회차 스레드</h5>
        {document.threads.length === 0 ? (
          <p className="mt-1 text-xs text-fg-3">{panelStatusText("studio.panelStatus.bibleDocuments.threadsEmpty", "아직 스레드가 없어요.")}</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {document.threads.map((thread) => (
              <li key={thread.id} className="flex items-baseline gap-2 text-xs text-fg-2">
                <span className="font-bold text-fg">{thread.title}</span>
                <span>{thread.introducedEpisodeLabel}부터</span>
                <span className="text-fg-3">
                  {thread.status === "resolved" ? "해결됨" : thread.status === "advanced" ? "진행 중" : "열림"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h5 className="text-xs font-black text-fg">회차별 비트 보드</h5>
        {board.length === 0 ? (
          <p className="mt-1 text-xs text-fg-3">{panelStatusText("studio.panelStatus.bibleDocuments.beatsEmpty", "아직 회차 비트가 없어요.")}</p>
        ) : (
          <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
            {board.map((column) => (
              <div key={column.episodeId} className="w-44 shrink-0 rounded-xl border border-line px-3 py-2">
                <p className="text-xs font-bold text-fg">
                  {column.episodeLabel} · {column.title}
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-fg-2">
                  {column.beats.map((beat) => (
                    <li key={beat}>{beat}</li>
                  ))}
                </ul>
                {column.threadTitles.length > 0 ? (
                  <p className="mt-1 text-[11px] text-fg-3">스레드: {column.threadTitles.join(", ")}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 바이블 용도 분리 패널.
 * 세계관 문서를 피치·소개용 / 시즌 아크 개발용 / 설정 검수용 DB 세 용도로 나눠
 * 보여 준다. 어떤 용도를 열어도 모든 문서에 버전·작성 시즌 표기가 붙어 있고,
 * 시즌 아크는 보드형+요약, 캐릭터 want/need, 스레드, 회차 비트를 표준으로 낸다.
 */
export function StudioBibleDocumentsPanel({
  documents,
  loading = false,
  error = null,
  onCreateFromTemplate,
  onSelectDocument,
}: StudioBibleDocumentsPanelProps) {
  const [purpose, setPurpose] = useState<StudioBibleDocumentPurpose>("pitch");
  const visible = useMemo(
    () => documents.filter((document) => document.purpose === purpose),
    [documents, purpose],
  );
  const counts = useMemo(() => {
    const result: Record<StudioBibleDocumentPurpose, number> = {
      pitch: 0,
      "season-arc": 0,
      "continuity-db": 0,
    };
    for (const document of documents) result[document.purpose] += 1;
    return result;
  }, [documents]);

  if (loading) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-8 text-sm text-fg-3">
        바이블 문서를 읽고 있어요…
      </div>
    );
  }

  const label = STUDIO_BIBLE_PURPOSE_LABELS[purpose];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {error ? (
        <p role="alert" className="m-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-xs leading-relaxed text-bad">
          {error}
        </p>
      ) : null}

      <div className="px-4 pt-4 sm:px-5">
        <h3 className="text-sm font-black text-fg">바이블 문서</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">
          세계관 문서는 용도마다 따로 만들어요. 모든 문서에는 버전과 작성 시즌이 반드시 붙어요.
        </p>
        <div role="tablist" aria-label="바이블 문서 용도" className="mt-3 flex flex-wrap gap-1.5">
          {STUDIO_BIBLE_DOCUMENT_PURPOSES.map((candidate) => {
            const Icon = PURPOSE_ICONS[candidate];
            const active = candidate === purpose;
            return (
              <button
                key={candidate}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPurpose(candidate)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                  active ? "bg-fg text-bg" : "bg-surface-2 text-fg-2"
                }`}
              >
                <Icon size={13} aria-hidden />
                {STUDIO_BIBLE_PURPOSE_LABELS[candidate].ko}
                <span className={active ? "text-bg/70" : "text-fg-3"}>{counts[candidate]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-fg-3">{label.hintKo}</p>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center">
            <p className="text-sm font-bold text-fg">아직 {label.ko} 문서가 없어요</p>
            <p className="mt-1 text-xs text-fg-3">템플릿으로 시작하면 버전·작성 시즌 표기가 자동으로 붙어요.</p>
            {onCreateFromTemplate ? (
              <button
                type="button"
                onClick={() => onCreateFromTemplate(purpose)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-fg px-3 py-1.5 text-xs font-bold text-bg"
              >
                <Plus size={13} aria-hidden /> 템플릿으로 만들기
              </button>
            ) : null}
          </div>
        ) : (
          visible.map((document) => {
            const issues = validateBibleDocument(document);
            const errors = issues.filter((item) => item.severity === "error");
            return (
              <article key={document.id} className="rounded-2xl border border-line px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h4 className="text-sm font-black text-fg">{document.title}</h4>
                  {/* 버전·작성 시즌 표기 — 모든 산출물에 강제 표시 */}
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-fg-2">
                    {formatBibleDocumentStampLine(document.stamp)}
                  </span>
                  {onSelectDocument ? (
                    <button
                      type="button"
                      onClick={() => onSelectDocument(document.id)}
                      className="ml-auto text-xs font-bold text-fg-2 underline underline-offset-2"
                    >
                      열기
                    </button>
                  ) : null}
                </div>

                {document.purpose === "pitch" ? (
                  <div className="mt-2 space-y-1 text-xs leading-relaxed text-fg-2">
                    <p className="font-semibold text-fg">{document.logline || "로그라인 미작성"}</p>
                    <p>{document.synopsis || panelStatusText("studio.panelStatus.bibleDocuments.synopsisEmpty", "줄거리 소개가 아직 없어요.")}</p>
                    {document.hookPoints.length > 0 ? <p>매력 포인트: {document.hookPoints.join(" · ")}</p> : null}
                    {document.toneKeywords.length > 0 ? <p>톤: {document.toneKeywords.join(", ")}</p> : null}
                    {document.targetAudience ? <p>대상: {document.targetAudience}</p> : null}
                  </div>
                ) : null}

                {document.purpose === "season-arc" ? <SeasonArcBoard document={document} /> : null}

                {document.purpose === "continuity-db" ? (
                  document.facts.length === 0 ? (
                    <p className="mt-2 text-xs text-fg-3">{panelStatusText("studio.panelStatus.bibleDocuments.factsEmpty", "아직 등록된 사실이 없어요.")}</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {document.facts.map((fact) => (
                        <li key={fact.id} className="text-xs leading-relaxed text-fg-2">
                          <span className="font-semibold text-fg">{fact.label}</span>
                          {fact.detail ? <span className="block text-fg-3">{fact.detail}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}

                {errors.length > 0 ? (
                  <p role="alert" className="mt-2 inline-flex items-start gap-1.5 rounded-xl bg-bad/10 px-3 py-2 text-xs leading-relaxed text-bad">
                    <AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0" />
                    {errors[0]?.messageKo}
                    {errors.length > 1 ? ` 외 ${errors.length - 1}건` : ""}
                  </p>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
