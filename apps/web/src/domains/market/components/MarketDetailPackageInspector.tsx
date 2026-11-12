import { Check, Copy, Cpu, FileCheck2, FileJson, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { formatMarketByteSize } from "../models/market-kind";
import { MarketWebtoonSpecInspector } from "../models/market-webtoon-spec-inspector";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const DELIVERY_LABELS: Record<string, string> = {
  "portable-json": "portable JSON",
  "procedural-recipe": "절차형 레시피",
  "builtin-ref": "스튜디오 내장 참조",
};

const ENGINE_LABELS: Record<string, string> = {
  canvas2d: "Canvas 2D",
  webgl2: "WebGL 2",
  webgpu: "WebGPU",
  three: "Three.js",
};

const specInspector = new MarketWebtoonSpecInspector();

interface MarketDetailPackageInspectorProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly onDownloadMetadata: () => void;
}

/**
 * 패키지 구성 항목 탐색기 + manifest 무결성(SHA-256) 및 기술 사양 점검 패널.
 * 근거 없는 메시 폴리곤 수나 GLB 포맷을 지어내지 않고 실제 게시된 manifest 엔트리만 검증한다.
 */
export function MarketDetailPackageInspector({
  record,
  onDownloadMetadata,
}: MarketDetailPackageInspectorProps) {
  const t = useBilingual("MarketDetailPackageInspector");
  const [entryFilter, setEntryFilter] = useState("");
  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);
  const [failedHash, setFailedHash] = useState<string | null>(null);

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
    setCopiedHashId(null);
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        setFailedHash(sha256);
        return;
      }
      await navigator.clipboard.writeText(sha256);
      setFailedHash(null);
      setCopiedHashId(key);
      window.setTimeout(() => setCopiedHashId(null), 1800);
    } catch {
      setFailedHash(sha256);
    }
  };

  return (
    <section aria-labelledby="market-entries-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="market-entries-heading" className="eyebrow text-fg-3">
          {t("구성 항목 · ", "Included items · ")}
          <span className="numeral tnum">{record.entries.length}</span>
          {t("개", "")}
        </h2>
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
            placeholder={t("구성 항목 찾기…", "Find an included item…")}
            className="min-h-12 w-full rounded-xl border border-line bg-card pl-8 pr-3 text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/70"
          />
        </div>
      ) : null}

      <ul aria-label={t("구성 항목", "Included items")} className="divide-y divide-line rounded-xl border border-line bg-card">
        {filteredEntries.map((entry) => (
          <li key={entry.id} className="px-4 py-3 text-sm font-medium text-fg break-words">{entry.name}</li>
        ))}
      </ul>
      {filteredEntries.length === 0 ? (
        <p role="status" className="text-sm text-fg-2">
          {t("일치하는 구성 항목이 없어요. 검색어를 바꿔 보세요.", "No included items match. Try another search.")}
        </p>
      ) : null}
      <details data-market-technical-details className="group rounded-xl border border-line bg-card">
        <summary className="min-h-12 cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {t("기술 정보 · 패키지와 파일", "Technical details · package and files")}
        </summary>
        <div className="space-y-3 border-t border-line p-3">
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            {[
              [t("패키지 ID", "Package ID"), record.packageId],
              [t("버전", "Version"), `v${record.resourceVersion}`],
              [t("호환 엔진", "Compatible engines"), record.compatibility.engines.map((engine) => ENGINE_LABELS[engine] ?? engine).join(", ")],
              [t("최소 스튜디오 버전", "Minimum Studio version"), `v${record.minimumStudioVersion}`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-fg-3">{label}</dt>
                <dd className="mt-1 min-w-0 max-w-full break-all text-fg">{value}</dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={onDownloadMetadata} className={buttonClass({ variant: "outline", size: "sm", className: "h-auto min-h-12 whitespace-normal py-2 pointer-coarse:h-auto [--site-control-size:48px]" })}>
            <FileJson className="size-4 shrink-0" aria-hidden="true" />
            {t("메타데이터 스냅샷 다운로드", "Download metadata snapshot")}
          </button>
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <span>
              {t("manifest 크기: ", "manifest size: ")}
              {formatMarketByteSize(record.manifestByteSize)}
            </span>
            <button
              type="button"
              onClick={() => void copyHash("manifest", record.manifestHash)}
              aria-label={t("패키지 manifest SHA-256 해시 복사", "Copy manifest SHA-256 hash")}
              className="inline-flex min-h-12 min-w-12 items-center gap-1 rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[11px] text-fg-2 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {copiedHashId === "manifest" ? (
                <Check className="size-3 text-good" aria-hidden="true" />
              ) : (
                <Copy className="size-3" aria-hidden="true" />
              )}
              SHA-256 {record.manifestHash.slice(0, 8)}…
            </button>
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
                    specSummary.proceduralCount > 0 ? `${t("절차형", "Procedural")} ${specSummary.proceduralCount}` : null,
                    specSummary.builtinCount > 0 ? `${t("내장 참조", "Built-in ref")} ${specSummary.builtinCount}` : null,
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

          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {filteredEntries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{entry.name}</p>
                  <p className="break-all font-mono text-xs text-fg-3">{entry.id}</p>
                </div>
                <div className="flex max-w-full flex-wrap items-center gap-2">
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
                    aria-label={`${entry.name} ${t("SHA-256 해시 복사", "Copy SHA-256 hash")}`}
                    className="inline-flex min-h-12 min-w-12 items-center gap-1 rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-fg-3 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
          {copiedHashId ? <p role="status" className="text-sm text-good">{t("해시를 복사했어요.", "Hash copied.")}</p> : null}
          {failedHash ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-fg">
                {t("복사하지 못했어요. 아래 원문을 선택해 복사하거나 복사 버튼으로 다시 시도하세요.", "Could not copy. Select the original text below to copy it, or try the copy button again.")}
              </p>
              <textarea
                readOnly
                value={failedHash}
                aria-label={t("복사할 해시 원문", "Original hash to copy")}
                onFocus={(event) => event.currentTarget.select()}
                className="min-h-12 w-full rounded-lg border border-line bg-panel p-3 font-mono text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
