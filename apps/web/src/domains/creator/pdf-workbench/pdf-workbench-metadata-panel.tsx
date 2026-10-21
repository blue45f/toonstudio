/**
 * pdf-workbench-metadata-panel.tsx — 워크벤치 출력 설정의 문서 속성 표면.
 *
 * 위쪽은 결과 PDF에 기록할 속성 입력(제목·저자·주제·키워드), 아래쪽은 가져온
 * 소스 PDF에 이미 들어 있는 속성의 읽기 전용 표시다. 상태와 변환 규칙은 전부
 * pdf-workbench-metadata 모델이 갖고, 이 컴포넌트는 표시와 입력 전달만 맡는다
 * (제어 컴포넌트 — 호스트가 value를 소유하고 다운로드 시 metadataFromFormValue로
 * 엔진에 넘긴다).
 *
 * 배선 (호스트):
 *   const [form, setForm] = useState(EMPTY_PDF_METADATA_FORM);
 *   <PdfWorkbenchMetadataPanel value={form} onChange={setForm} sources={inspected} />
 *   buildMergedPdfBytes({ state, bytesBySourceId, metadata: metadataFromFormValue(form) ?? undefined })
 */

import {
  PDF_METADATA_FIELD_LIMITS,
  describePdfSourceMetadataRows,
  formValueFromMetadata,
  hasPdfMetadata,
  type PdfMetadataFormValue,
  type PdfSourceMetadata,
} from "./pdf-workbench-metadata";

export interface PdfWorkbenchMetadataPanelSource {
  readonly id: string;
  readonly name: string;
  readonly metadata?: PdfSourceMetadata;
}

export interface PdfWorkbenchMetadataPanelProps {
  readonly value: PdfMetadataFormValue;
  readonly onChange: (next: PdfMetadataFormValue) => void;
  /** inspectPdfSource 결과에서 뽑은 소스 목록 — 속성 읽기를 표시한다. */
  readonly sources: readonly PdfWorkbenchMetadataPanelSource[];
  readonly disabled?: boolean;
}

const inputClassName =
  "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 disabled:bg-neutral-100 disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
const labelClassName = "text-xs font-medium text-neutral-600 dark:text-neutral-300";

export function PdfWorkbenchMetadataPanel({ value, onChange, sources, disabled }: PdfWorkbenchMetadataPanelProps) {
  const patch = (partial: Partial<PdfMetadataFormValue>) => onChange({ ...value, ...partial });
  const firstSourceWithMetadata = sources.find((source) => hasPdfMetadata(source.metadata));

  return (
    <section aria-label="문서 속성" data-pdf-metadata-panel="" className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3" disabled={disabled}>
        <legend className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">출력 문서 속성</legend>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          병합·분할한 PDF 파일 정보에 그대로 기록돼요. 비워 두면 기록하지 않아요.
        </p>
        <label className="flex flex-col gap-1">
          <span className={labelClassName}>제목</span>
          <input
            className={inputClassName}
            value={value.title}
            maxLength={PDF_METADATA_FIELD_LIMITS.title}
            placeholder="예: 단행본 1권 합본"
            onChange={(event) => patch({ title: event.target.value })}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelClassName}>저자</span>
            <input
              className={inputClassName}
              value={value.author}
              maxLength={PDF_METADATA_FIELD_LIMITS.author}
              placeholder="예: 작가 이름"
              onChange={(event) => patch({ author: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassName}>주제</span>
            <input
              className={inputClassName}
              value={value.subject}
              maxLength={PDF_METADATA_FIELD_LIMITS.subject}
              placeholder="예: 1~10화 합본"
              onChange={(event) => patch({ subject: event.target.value })}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClassName}>키워드</span>
          <input
            className={inputClassName}
            value={value.keywordsText}
            placeholder="쉼표로 구분해 입력 — 예: 웹툰, 단행본, 합본"
            onChange={(event) => patch({ keywordsText: event.target.value })}
          />
        </label>
        {firstSourceWithMetadata ? (
          <button
            type="button"
            className="self-start rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={() => onChange(formValueFromMetadata(firstSourceWithMetadata.metadata))}
          >
            소스 속성 가져오기 ({firstSourceWithMetadata.name})
          </button>
        ) : null}
      </fieldset>

      {sources.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">소스 문서 속성</h3>
          {sources.map((source) => {
            const rows = describePdfSourceMetadataRows(source.metadata);
            return (
              <div
                key={source.id}
                data-pdf-source-metadata={source.id}
                className="rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800"
              >
                <p className="truncate text-xs font-medium text-neutral-700 dark:text-neutral-200">{source.name}</p>
                {rows.length > 0 ? (
                  <dl className="mt-1.5 flex flex-col gap-1">
                    {rows.map((row) => (
                      <div key={row.key} className="flex gap-2 text-xs">
                        <dt className="w-20 shrink-0 text-neutral-500 dark:text-neutral-400">{row.label}</dt>
                        <dd className="min-w-0 break-words text-neutral-800 dark:text-neutral-100">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">기록된 속성이 없어요.</p>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
