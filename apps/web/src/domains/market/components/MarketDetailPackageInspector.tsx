import { Check, Copy, Cpu, FileCheck2, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { formatMarketByteSize } from "../models/market-kind";
import { MarketWebtoonSpecInspector } from "../models/market-webtoon-spec-inspector";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const DELIVERY_LABELS: Record<string, string> = {
  "portable-json": "portable JSON",
  "procedural-recipe": "절차형 레시피",
  "builtin-ref": "스튜디오 내장 참조",
};

const specInspector = new MarketWebtoonSpecInspector();

interface MarketDetailPackageInspectorProps {
  readonly record: CreatorMarketplaceResourceRecord;
}

/**
 * 패키지 구성 항목 탐색기 + manifest 무결성(SHA-256) 및 기술 사양 점검 패널.
 * 근거 없는 메시 폴리곤 수나 GLB 포맷을 지어내지 않고 실제 게시된 manifest 엔트리만 검증한다.
 */
export function MarketDetailPackageInspector({
  record,
}: MarketDetailPackageInspectorProps) {
  const t = useBilingual("MarketDetailPackageInspector");
  const [entryFilter, setEntryFilter] = useState("");
  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);

  const normalizedQuery = entryFilter.trim().toLocaleLowerCase("ko-KR");
  const filteredEntries = useMemo(() => {
    if (!normalizedQuery) return record.entries;
    return record.entries.filter(
      (entry) =>
        entry.name.toLocaleLowerCase("ko-KR").includes(normalizedQuery) ||
        entry.id.toLocaleLowerCase("ko-KR").includes(normalizedQuery) ||
        entry.delivery.mode.toLocaleLowerCase("ko-KR").includes(normalizedQuery),
    );
  }, [normalizedQuery, record.entries]);

  const specSummary = useMemo(() => {
    const portableCount = record.entries.filter(
      (entry) => entry.delivery.mode === "portable-json",
    ).length;
    const proceduralCount = record.entries.filter(
      (entry) => entry.delivery.mode === "procedural-recipe",
    ).length;
    const builtinCount = record.entries.filter(
      (entry) => entry.delivery.mode === "builtin-ref",
    ).length;
    const formatLabel =
      portableCount > 0
        ? specInspector.getFormatLabel("portable-json")
        : proceduralCount > 0
          ? t("절차형 레시피 manifest (툰스튜디오 규격)", "Procedural recipe manifest")
          : t("스튜디오 내장 참조 manifest (툰스튜디오 규격)", "Studio built-in reference manifest");
    const lightweight = record.manifestByteSize <= 64 * 1024;
    return {
      portableCount,
      proceduralCount,
      builtinCount,
      formatLabel,
      lightweight,
    };
  }, [record.entries, record.manifestByteSize, t]);

  const copyHash = async (key: string, sha256: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(sha256);
      } catch {
        // Clipboard permission restricted
      }
    }
    setCopiedHashId(key);
    window.setTimeout(() => setCopiedHashId(null), 1800);
  };

  return (
    <section aria-labelledby="market-entries-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="market-entries-heading" className="eyebrow text-fg-3">
          {t("패키지 항목 · ", "Package entries · ")}
          <span className="numeral tnum">{record.entries.length}</span>
          {t("개", "")}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
          <span>
            {t("manifest 크기: ", "manifest size: ")}
            {formatMarketByteSize(record.manifestByteSize)}
          </span>
          <button
            type="button"
            onClick={() => void copyHash("manifest", record.manifestHash)}
            aria-label={t("패키지 manifest SHA-256 해시 복사", "Copy manifest SHA-256 hash")}
            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[11px] text-fg-2 transition-colors hover:border-accent/40 hover:text-accent"
          >
            {copiedHashId === "manifest" ? (
              <Check className="size-3 text-good" aria-hidden="true" />
            ) : (
              <Copy className="size-3" aria-hidden="true" />
            )}
            SHA-256 {record.manifestHash.slice(0, 8)}…
          </button>
        </div>
      </div>

      <div
        data-testid="market-detail-spec-audit"
        className="grid gap-2 rounded-xl border border-line bg-panel/60 p-3 text-xs sm:grid-cols-3"
      >
        <div className="flex items-start gap-2">
          <FileCheck2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <strong className="block font-semibold text-fg">
              {t("패키지 규격", "Package spec")}
            </strong>
            <span className="text-fg-2">{specSummary.formatLabel}</span>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Cpu className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />
          <div>
            <strong className="block font-semibold text-fg">
              {t("전달 구성", "Delivery breakdown")}
            </strong>
            <span className="text-fg-2">
              {[
                specSummary.portableCount > 0 ? `JSON ${specSummary.portableCount}` : null,
                specSummary.proceduralCount > 0 ? `절차형 ${specSummary.proceduralCount}` : null,
                specSummary.builtinCount > 0 ? `내장 참조 ${specSummary.builtinCount}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </span>
          </div>
        </div>
        <div>
          <strong className="block font-semibold text-fg">
            {t("캔버스 로딩 부하", "Canvas payload load")}
          </strong>
          <span className="text-fg-2">
            {specSummary.lightweight
              ? t("경량 manifest (즉시 로드 적합)", "Lightweight manifest (fast load)")
              : t("다중 데이터 포함 (상세 용량 확인)", "Multi-entry payload")}
          </span>
        </div>
      </div>

      {record.entries.length > 2 ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-3"
            aria-hidden="true"
          />
          <input
            type="search"
            value={entryFilter}
            onChange={(event) => setEntryFilter(event.target.value)}
            aria-label={t("패키지 구성 항목 검색", "Search package entries")}
            placeholder={t("항목 이름·식별자·전달 방식 검색…", "Filter entries by name, ID, or delivery mode…")}
            className="h-9 w-full rounded-xl border border-line bg-card pl-8 pr-3 text-xs text-fg focus:border-accent focus:outline-none"
          />
        </div>
      ) : null}

      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {filteredEntries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{entry.name}</p>
              <p className="truncate font-mono text-xs text-fg-3">{entry.id}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded bg-raised px-1.5 py-0.5 text-[0.65rem] text-fg-2">
                {DELIVERY_LABELS[entry.delivery.mode] ?? entry.delivery.mode}
              </span>
              <span className="numeral tnum text-xs text-fg-3">
                {entry.delivery.byteSize > 0
                  ? formatMarketByteSize(entry.delivery.byteSize)
                  : t("내장 참조", "Built-in ref")}
              </span>
              <button
                type="button"
                onClick={() => void copyHash(entry.id, entry.delivery.sha256)}
                aria-label={`${entry.name} SHA-256 해시 복사`}
                className="inline-flex min-h-7 items-center gap-1 rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-fg-3 hover:text-accent"
              >
                {copiedHashId === entry.id ? (
                  <Check className="size-3 text-good" aria-hidden="true" />
                ) : (
                  <Copy className="size-3" aria-hidden="true" />
                )}
                {entry.delivery.sha256.slice(0, 6)}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
