import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Gauge,
  Maximize2,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

import type { BilingualText } from "./flagship-showcase-data";
import {
  LIVE_TECH_PROOFS,
  PROOF_GALLERY_SHEETS,
  runLiveBrowserTechBenchmark,
  type BrowserTechBenchmarkResult,
  type LiveTechProofId,
  type ProofGallerySheetSpec,
} from "./live-tech-proof-data";
import "./live-tech-proof-strip.css";

export interface HomeLiveTechProofStripProps {
  readonly lang?: "ko" | "en";
}

function pick(text: BilingualText, lang: "ko" | "en"): string {
  return lang === "en" ? text.en : text.ko;
}

/**
 * 홈(`/`) · `/tech` 최상단 최첨단 기술 실물 증명 스트립.
 *
 * ① 5대 실측 엔진 증명 스트립(Rust Wasm64 · WebGPU 제로카피 · Kubelka-Munk · 3D BVH/NPR · BYOT/C2PA)
 * ② '내 브라우저에서 직접 측정해 보기' 100% 실제 실행 하드웨어 벤치마크
 * ③ 실물 렌더링 브러시 검증 시트 2장 갤러리 및 Escape 확대 보기 모달
 */
export function HomeLiveTechProofStrip({ lang: propLang }: HomeLiveTechProofStripProps = {}) {
  const storeLang = useI18n((state) => state.lang);
  const lang: "ko" | "en" = propLang ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko");

  const [activeProofId, setActiveProofId] = useState<LiveTechProofId>("wasm64");
  const [benchmarking, setBenchmarking] = useState(false);
  const [benchmark, setBenchmark] = useState<BrowserTechBenchmarkResult | null>(null);
  const [zoomedSheet, setZoomedSheet] = useState<ProofGallerySheetSpec | null>(null);

  const lastSheetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modalCloseBtnRef = useRef<HTMLButtonElement | null>(null);
  const headingId = useId();
  const modalTitleId = useId();

  const activeProof = useMemo(
    () => LIVE_TECH_PROOFS.find((item) => item.id === activeProofId) ?? LIVE_TECH_PROOFS[0],
    [activeProofId],
  );

  const closeModal = useCallback(() => {
    setZoomedSheet(null);
    lastSheetTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!zoomedSheet) return;
    modalCloseBtnRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      closeModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomedSheet, closeModal]);

  const handleRunBenchmark = async () => {
    if (benchmarking) return;
    setBenchmarking(true);
    try {
      const result = await runLiveBrowserTechBenchmark();
      setBenchmark(result);
    } finally {
      setBenchmarking(false);
    }
  };

  return (
    <article
      className="ltp-block [word-break:keep-all]"
      data-testid="home-live-tech-proof-strip"
      aria-labelledby={headingId}
    >
      <div className="ltp-top">
        <div className="ltp-heading">
          <span className="ltp-kicker">
            <Sparkles size={13} strokeWidth={1.8} aria-hidden="true" />
            {lang === "en" ? "MEASURED ENGINE PROOF & REAL BRUSH RENDERS" : "실측 엔진 증명 · 실물 브러시 렌더링 증거"}
          </span>
          <h3 id={headingId}>
            {lang === "en"
              ? "Not claims — measured numbers, real brush renders, and a live test on your browser."
              : "말뿐인 스펙이 아닌 실측 수치 · 실물 브러시 시트 · 내 브라우저 실시간 측정"}
          </h3>
          <p>
            {lang === "en"
              ? "Inspect all 5 verified core engines, verify native Wasm64/WebGPU/P3/Kubelka-Munk right on your device, and zoom into real rendered proof sheets."
              : "5대 핵심 엔진의 실측 근거를 눌러 확인하고, 지금 접속한 브라우저의 Wasm64·WebGPU·Display-P3·16파장 광학 혼색 속도를 직접 측정해 보세요."}
          </p>
        </div>

        <button
          type="button"
          className="ltp-bench-btn"
          data-testid="live-tech-benchmark-btn"
          disabled={benchmarking}
          onClick={() => void handleRunBenchmark()}
        >
          <Gauge size={16} strokeWidth={1.9} aria-hidden="true" />
          <span>
            {benchmarking
              ? (lang === "en" ? "Measuring this browser..." : "브라우저 실측 중...")
              : benchmark
                ? (lang === "en" ? "Re-run Browser Benchmark" : "내 브라우저 다시 측정하기")
                : (lang === "en" ? "Benchmark This Browser Live" : "내 브라우저에서 직접 측정해 보기")}
          </span>
        </button>
      </div>

      {/* ③ 인브라우저 실시간 하드웨어 벤치마크 결과 */}
      <div
        className="ltp-bench-panel"
        data-testid="live-tech-benchmark-results"
        aria-live="polite"
      >
        <div className="ltp-bench-head">
          <strong className="inline-flex items-center gap-1.5">
            <Activity size={14} strokeWidth={1.9} aria-hidden="true" />
            {benchmark
              ? (lang === "en"
                ? "Live Runtime Telemetry (Measured on This Browser)"
                : "현재 브라우저 실시간 실측 결과")
              : (lang === "en"
                ? "Ready to run 4 real runtime checks: Wasm64 memory64 · WebGPU · Display-P3 · 16-Band Kubelka-Munk"
                : "버튼을 누르면 Wasm64 memory64 · WebGPU · Display-P3 · 16파장 Kubelka-Munk 2,000회 연산을 현재 브라우저에서 즉시 실행합니다.")}
          </strong>
          {benchmark ? (
            <span className="inline-flex items-center gap-1 ltp-tabular">
              <CheckCircle2 size={13} aria-hidden="true" />
              {lang === "en" ? "4 / 4 live checks executed" : "4 / 4 항목 실시간 측정 완료"}
            </span>
          ) : null}
        </div>

        {benchmark ? (
          <div className="ltp-bench-grid">
            <div
              className="ltp-bench-badge"
              data-testid="benchmark-badge-wasm64"
              data-state={benchmark.wasm64.supported ? "ready" : "fallback"}
            >
              <small>WebAssembly memory64 (i64)</small>
              <span className="ltp-bench-value">{pick(benchmark.wasm64.label, lang)}</span>
            </div>

            <div
              className="ltp-bench-badge"
              data-testid="benchmark-badge-webgpu"
              data-state={benchmark.webgpu.status === "adapter" ? "ready" : "fallback"}
            >
              <small>navigator.gpu (WebGPU)</small>
              <span className="ltp-bench-value">{pick(benchmark.webgpu.label, lang)}</span>
            </div>

            <div
              className="ltp-bench-badge"
              data-testid="benchmark-badge-p3"
              data-state={benchmark.displayP3.supported ? "ready" : "fallback"}
            >
              <small>color-gamut: p3</small>
              <span className="ltp-bench-value">{pick(benchmark.displayP3.label, lang)}</span>
            </div>

            <div
              className="ltp-bench-badge"
              data-testid="benchmark-badge-km"
              data-state={benchmark.kubelkaMunk.greenDominant ? "ready" : "fallback"}
            >
              <small>
                {lang === "en"
                  ? `16-Band Kubelka-Munk (${benchmark.kubelkaMunk.iterations.toLocaleString("en-US")} mixes)`
                  : `16파장 Kubelka-Munk (${benchmark.kubelkaMunk.iterations.toLocaleString("en-US")}회)`}
              </small>
              <span className="ltp-bench-value ltp-tabular">
                <span
                  className="ltp-km-swatch"
                  style={{ backgroundColor: benchmark.kubelkaMunk.mixedOklch }}
                  aria-hidden="true"
                />
                <span>
                  {benchmark.kubelkaMunk.elapsedMs.toFixed(2)}ms · {benchmark.kubelkaMunk.peakWavelengthNm}nm{" "}
                  {benchmark.kubelkaMunk.greenDominant
                    ? (lang === "en" ? "Green Verified" : "초록 실측")
                    : (lang === "en" ? "Computed" : "연산 완료")}
                </span>
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* ① 5대 실측 엔진 증명 스트립 */}
      <div
        className="ltp-chip-strip"
        role="group"
        aria-label={lang === "en" ? "5 measured core engine proofs" : "5대 실측 엔진 증명 선택"}
      >
        {LIVE_TECH_PROOFS.map((proof) => (
          <button
            key={proof.id}
            type="button"
            className="ltp-chip"
            data-testid={`live-proof-chip-${proof.id}`}
            aria-pressed={activeProofId === proof.id}
            onClick={() => setActiveProofId(proof.id)}
          >
            <span className="ltp-chip-index ltp-tabular">{proof.index}</span>
            <strong>{pick(proof.chipTitle, lang)}</strong>
            <span className="ltp-tabular">{pick(proof.chipStat, lang)}</span>
          </button>
        ))}
      </div>

      <div className="ltp-detail-card" data-testid="live-proof-detail" data-proof-id={activeProof.id}>
        <div className="ltp-detail-head">
          <div className="ltp-detail-copy">
            <h4 className="ltp-tabular">
              <Cpu size={15} strokeWidth={1.85} aria-hidden="true" className="mr-1.5 inline align-text-bottom" />
              {pick(activeProof.headline, lang)}
            </h4>
            <p>{pick(activeProof.measuredBasis, lang)}</p>
          </div>
          <Link href={activeProof.href} className="ltp-link" data-testid="live-proof-detail-cta">
            <span>{pick(activeProof.ctaLabel, lang)}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <ul className="ltp-detail-metrics">
          {activeProof.metrics.map((metric) => (
            <li key={`${activeProof.id}-${metric.label.en}`} className="ltp-detail-metric">
              <small>{pick(metric.label, lang)}</small>
              <strong className="ltp-tabular">{pick(metric.value, lang)}</strong>
            </li>
          ))}
        </ul>
      </div>

      {/* ② 실물 렌더링 브러시 증명 갤러리 (2장) */}
      <div className="ltp-gallery" data-testid="live-proof-gallery">
        {PROOF_GALLERY_SHEETS.map((sheet) => (
          <figure key={sheet.id} className="ltp-sheet-card" data-testid={`proof-sheet-card-${sheet.id}`}>
            <button
              type="button"
              className="ltp-sheet-trigger outline-1 -outline-offset-1"
              data-testid={`proof-sheet-zoom-${sheet.id}`}
              aria-label={
                lang === "en"
                  ? `Inspect full proof sheet: ${sheet.title.en}`
                  : `실물 검증 시트 확대 보기: ${sheet.title.ko}`
              }
              onClick={(event) => {
                lastSheetTriggerRef.current = event.currentTarget;
                setZoomedSheet(sheet);
              }}
            >
              <img
                src={sheet.src}
                width={sheet.width}
                height={sheet.height}
                loading="lazy"
                decoding="async"
                alt={pick(sheet.alt, lang)}
                className="ltp-sheet-img"
              />
              <span className="ltp-sheet-zoom-pill">
                <Maximize2 size={12} aria-hidden="true" />
                {lang === "en" ? "Zoom Sheet" : "원본 확대"}
              </span>
            </button>
            <figcaption className="ltp-sheet-meta">
              <span className="ltp-sheet-badge ltp-tabular">{pick(sheet.badge, lang)}</span>
              <strong className="ltp-tabular">{pick(sheet.title, lang)}</strong>
              <p className="ltp-tabular">{pick(sheet.caption, lang)}</p>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* 확대 보기 모달 (Escape 닫기 + 포커스 복원) */}
      {zoomedSheet ? (
        <div className="ltp-modal-backdrop" data-testid="proof-sheet-modal-backdrop">
          <button
            type="button"
            className="ltp-modal-scrim"
            tabIndex={-1}
            aria-label={lang === "en" ? "Dismiss proof sheet modal" : "실물 시트 확대 창 닫기"}
            onClick={closeModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            data-testid="proof-sheet-modal"
            className="ltp-modal-dialog [word-break:keep-all]"
          >
            <div className="ltp-modal-head">
              <h4 id={modalTitleId} className="ltp-tabular">{pick(zoomedSheet.title, lang)}</h4>
              <button
                ref={modalCloseBtnRef}
                type="button"
                className="ltp-modal-close"
                data-testid="proof-sheet-modal-close"
                aria-label={lang === "en" ? "Close full sheet preview" : "확대 보기 닫기"}
                onClick={closeModal}
              >
                <X size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{lang === "en" ? "Close" : "닫기"}</span>
              </button>
            </div>
            <div className="ltp-modal-body">
              <img
                src={zoomedSheet.src}
                width={zoomedSheet.width}
                height={zoomedSheet.height}
                alt={pick(zoomedSheet.alt, lang)}
                className="ltp-modal-img outline-1 -outline-offset-1"
              />
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
