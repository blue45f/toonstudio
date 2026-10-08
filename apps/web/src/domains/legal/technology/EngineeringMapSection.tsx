import { ExternalLink, Lightbulb, Table2 } from "lucide-react";

import { EngineeringDiagramFrame } from "./EngineeringDiagramFrame";
import type { EngineeringMap, EngineeringMapColumn, EngineeringMapRow } from "./engineering-map-types";
import type { LocalizedText } from "./engineering-story-content";
import { EngineeringStatusBadge } from "./EngineeringStoryUi";

import { cx } from "@/shared/lib/cx";
import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo => translateBilingualValueForActiveLocale("EngineeringMapSection", ko, en);
const text = (value: LocalizedText | undefined): string => (value ? bi(value.ko, value.en) : "—");

function RowIdentity({
  mapId,
  row,
  visibleAtlas,
}: {
  readonly mapId: string;
  readonly row: EngineeringMapRow;
  /** 지금 화면에 보이는 도감 카드(id → 이름). 보이는 카드만 링크로 잇는다. */
  readonly visibleAtlas: ReadonlyMap<string, string>;
}) {
  const atlasLinks = (row.atlasIds ?? []).flatMap((id) => {
    const name = visibleAtlas.get(id);
    return name ? [{ id, name }] : [];
  });
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {row.link ? (
          <a
            href={row.link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-black text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {row.name}
            <ExternalLink size={12} aria-hidden="true" className="shrink-0" />
            <span className="sr-only">{bi("(공식 사이트, 새 탭에서 열림)", "(official site, opens in a new tab)")}</span>
          </a>
        ) : (
          <span className="font-black text-fg">{row.name}</span>
        )}
        {row.status ? <EngineeringStatusBadge status={row.status} /> : null}
      </div>
      {row.asOf ? (
        <p className="text-[0.66rem] font-bold text-fg-3">
          {bi("기준일", "As of")} <time dateTime={row.asOf}>{row.asOf}</time>
        </p>
      ) : null}
      {atlasLinks.length > 0 ? (
        <p className="flex flex-wrap gap-1.5 text-[0.7rem]">
          {atlasLinks.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 font-bold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {bi("도감 카드", "Atlas card")} · {item.name}
            </a>
          ))}
        </p>
      ) : null}
      <details className="text-xs">
        <summary className="inline-flex min-h-6 cursor-pointer items-center text-fg-3 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {bi("근거 경로", "Evidence")} ({row.evidence.length})
        </summary>
        <ul className="mt-1.5 grid gap-1" aria-label={`${row.name} ${bi("근거 파일", "evidence files")}`}>
          {row.evidence.map((path) => (
            <li key={`${mapId}-${row.id}-${path}`}>
              <code className="eng-code block max-w-full break-all rounded-lg px-2 py-1 font-mono text-[0.66rem]">{path}</code>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function cellOf(row: EngineeringMapRow, column: EngineeringMapColumn): string {
  return text(row.cells[column.id]);
}

/**
 * 기술 지도 한 장: 제목·쉬운 소개·한 줄 결론 → 큰 그림 도식 → 표(넓은 화면) / 카드 목록(좁은 화면) → 읽는 법.
 * 필터는 호출하는 쪽이 `filterMapRows` 로 미리 적용해 `rows` 로 넘긴다.
 */
export function EngineeringMapSection({
  map,
  rows,
  visibleAtlas,
}: {
  readonly map: EngineeringMap;
  readonly rows: readonly EngineeringMapRow[];
  readonly visibleAtlas: ReadonlyMap<string, string>;
}) {
  useBilingualI18nRevision();
  const headingId = `map-${map.id}-title`;
  return (
    <section
      id={`map-${map.id}`}
      aria-labelledby={headingId}
      className="scroll-mt-32 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 font-display text-[0.68rem] font-black uppercase tracking-[0.17em] text-accent-2">
          <Table2 size={13} aria-hidden="true" />
          {bi("기술 지도", "Tech map")}
        </p>
        <span className="text-[0.66rem] font-bold text-fg-3">{bi("코드 대조", "Verified")} {map.reviewedAt}</span>
      </div>
      <h3 id={headingId} className="mt-4 text-balance break-keep text-2xl font-black tracking-tight text-fg">
        {text(map.title)}
        <span className="ml-3 text-base font-bold text-fg-3">
          {rows.length === map.rows.length ? map.rows.length : `${rows.length}/${map.rows.length}`}
        </span>
      </h3>
      <p className="mt-3 max-w-4xl text-base leading-8 text-fg-2">{text(map.intro)}</p>
      <p className="mt-4 flex items-start gap-2.5 rounded-2xl border border-accent-2/35 bg-accent-2/10 px-4 py-3 text-sm leading-7 text-fg-2">
        <Lightbulb size={16} className="mt-1 shrink-0 text-accent-2" aria-hidden="true" />
        <span>
          <strong className="mr-1 text-fg">{bi("한 줄 결론", "In one line")}</strong>
          {text(map.takeaway)}
        </span>
      </p>

      {map.diagram ? (
        <div className="mt-5 rounded-3xl border border-line/65 bg-card/70 p-3 sm:p-5">
          <EngineeringDiagramFrame diagram={map.diagram} />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line-strong bg-card/50 p-5 text-center text-sm leading-7 text-fg-2">
          {bi("조건에 맞는 항목이 없습니다.", "No rows match the current filters.")}
        </p>
      ) : (
        <>
          <div className="mt-6 hidden lg:block">
            <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
              <caption className="sr-only">{text(map.title)}</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[13.5rem] border-b border-line px-3 py-2.5 text-xs font-black text-fg-3">
                    {bi("이름", "Name")}
                  </th>
                  {map.columns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className={cx("border-b border-line px-3 py-2.5 text-xs font-black text-fg-3", column.narrow && "w-28")}
                    >
                      {text(column.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} id={`map-${map.id}-${row.id}`} className="scroll-mt-32 align-top">
                    <th scope="row" className="border-b border-line/60 px-3 py-3 text-left text-[0.86rem] font-normal">
                      <RowIdentity mapId={map.id} row={row} visibleAtlas={visibleAtlas} />
                    </th>
                    {map.columns.map((column) => (
                      <td key={column.id} className="break-words border-b border-line/60 px-3 py-3 text-[0.82rem] leading-6 text-fg-2">
                        {cellOf(row, column)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-6 grid gap-3 lg:hidden" aria-label={text(map.title)}>
            {rows.map((row) => (
              <li key={row.id} className="rounded-3xl border border-line/65 bg-card/65 p-4">
                <RowIdentity mapId={map.id} row={row} visibleAtlas={visibleAtlas} />
                <dl className="mt-3 grid gap-2.5">
                  {map.columns.map((column) => (
                    <div key={column.id}>
                      <dt className="text-[0.66rem] font-black text-fg-3">{text(column.label)}</dt>
                      <dd className="text-sm leading-7 text-fg-2">{cellOf(row, column)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}

      {map.notes?.length ? (
        <ul className="mt-6 grid gap-2" aria-label={bi("읽는 법과 주의", "How to read this map")}>
          {map.notes.map((note) => (
            <li key={note.ko} className="flex gap-2.5 text-sm leading-7 text-fg-2">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden="true" />
              <span>{text(note)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
