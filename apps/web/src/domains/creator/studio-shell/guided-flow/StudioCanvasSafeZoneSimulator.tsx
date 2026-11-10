import { BookOpen, LayoutGrid, Smartphone, Tv } from "lucide-react";
import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioProjectFormat } from "../../studio-project-definition";
import {
  analyzeMobileSafeZone,
  type SafeZoneRhythmId,
} from "./studio-guided-flow-catalog";

const RHYTHM_OPTIONS: readonly {
  readonly id: SafeZoneRhythmId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "cinematic", labelKo: "감성 1컷 집중", labelEn: "1-Cut Dramatic" },
  { id: "balanced", labelKo: "표준 2컷 대화", labelEn: "2-Cut Balanced" },
  { id: "snappy", labelKo: "경쾌한 3컷 호흡", labelEn: "3-Cut Snappy" },
] as const;

/**
 * 프로젝트 생성 전 설정한 가로·세로 크기와 작품 형식이 실제 독자의 화면(세로 스크롤·SNS 카드·페이지 만화·와이드)에서
 * 어떤 밀도와 안전영역으로 보이는지 즉시 시뮬레이션해 주는 초보자 친화형 미리보기.
 */
export function StudioCanvasSafeZoneSimulator({
  width,
  height,
  formatId,
  pageCount = 1,
}: {
  readonly width: number;
  readonly height: number;
  readonly formatId?: StudioProjectFormat;
  readonly pageCount?: number;
}) {
  const bt = useBilingual("StudioCanvasSafeZoneSimulator");
  const [rhythm, setRhythm] = useState<SafeZoneRhythmId>("balanced");

  const analysis = useMemo(
    () => analyzeMobileSafeZone(width, height, rhythm, formatId, pageCount),
    [width, height, rhythm, formatId, pageCount],
  );

  const ModeIcon =
    analysis.previewMode === "card-news"
      ? LayoutGrid
      : analysis.previewMode === "page-spread"
        ? BookOpen
        : analysis.previewMode === "landscape"
          ? Tv
          : Smartphone;

  const eyebrowText =
    analysis.previewMode === "card-news"
      ? bt("SNS 카드 안전영역 미리보기", "SOCIAL CARD SAFE-ZONE")
      : analysis.previewMode === "page-spread"
        ? bt("페이지 재단·안전영역 미리보기", "PAGE TRIM SAFE-ZONE")
        : analysis.previewMode === "landscape"
          ? bt("와이드 화면 안전영역 미리보기", "WIDE FRAME SAFE-ZONE")
          : bt("모바일 한 화면 안전영역 미리보기", "MOBILE SAFE-ZONE SIMULATOR");

  const unitLabel =
    analysis.previewMode === "card-news"
      ? bt("카드 장수", "Cards")
      : analysis.previewMode === "page-spread"
        ? bt("시작 페이지", "Pages")
        : analysis.previewMode === "landscape"
          ? bt("화면 비율", "Aspect")
          : bt("폰 스크롤 분량", "Mobile screens");

  const unitValue =
    analysis.previewMode === "card-news"
      ? bt(`${analysis.phoneScreensPerPage}장 세트`, `${analysis.phoneScreensPerPage} cards`)
      : analysis.previewMode === "page-spread"
        ? bt(`${analysis.phoneScreensPerPage}페이지`, `${analysis.phoneScreensPerPage}p`)
        : analysis.previewMode === "landscape"
          ? analysis.aspectRatioLabel
          : bt(`약 ${analysis.phoneScreensPerPage}화면`, `~${analysis.phoneScreensPerPage}x`);

  const densityLabel =
    analysis.previewMode === "card-news"
      ? bt("카드당 권장 구성", "Per card")
      : analysis.previewMode === "page-spread"
        ? bt("페이지 권장 분할", "Panels / page")
        : analysis.previewMode === "landscape"
          ? bt("자막 안전 여백", "Caption safe")
          : bt("한 화면 권장 컷", "Cuts / screen");

  const densityValue =
    analysis.previewMode === "card-news"
      ? bt("1컷 · 말풍선 1~2개", "1 beat · 1–2 bubbles")
      : analysis.previewMode === "page-spread"
        ? bt("4~6컷 + 5% 여백", "4–6 panels + 5% trim")
        : analysis.previewMode === "landscape"
          ? bt("하단 10% 확보", "Bottom 10% safe")
          : bt(`${analysis.cutsPerScreen}컷 호흡`, `${analysis.cutsPerScreen} panel(s)`);

  return (
    <div
      data-testid="studio-canvas-safe-zone-simulator"
      data-preview-mode={analysis.previewMode}
      className="mt-4 rounded-2xl border border-line bg-panel/45 p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <ModeIcon size={13} aria-hidden="true" />
            {eyebrowText}
          </p>
          <p className="mt-1 text-xs font-bold text-fg">
            {bt(analysis.statusKo, analysis.statusEn)}{" "}
            <span className="font-normal text-fg-3">
              ({`${width} × ${height} px · ${analysis.aspectRatioLabel}`})
            </span>
          </p>
          <p className="mt-0.5 text-xs leading-5 text-fg-2">
            {bt(analysis.adviceKo, analysis.adviceEn)}
          </p>
        </div>

        {analysis.previewMode === "vertical-scroll" ? (
          <div
            role="group"
            aria-label={bt("컷 호흡 미리보기 선택", "Choose panel pacing preview")}
            className="flex flex-wrap items-center gap-1.5"
          >
            {RHYTHM_OPTIONS.map((option) => {
              const active = rhythm === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`safe-zone-rhythm-${option.id}`}
                  onClick={() => setRhythm(option.id)}
                  className={cn(
                    "min-h-9 rounded-full border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
                  )}
                >
                  {bt(option.labelKo, option.labelEn)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* 매체별 안전영역 프레임 시뮬레이션 */}
      <div
        aria-hidden="true"
        className="mt-3 grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center"
      >
        {analysis.previewMode === "card-news" ? (
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-xl border-2 border-accent/45 bg-card p-2 shadow-sm">
            <span className="relative h-full w-full rounded-lg border border-dashed border-accent/40 bg-gradient-to-br from-accent-soft to-panel">
              <i className="absolute right-1.5 top-1.5 h-2.5 w-6 rounded-full bg-card" />
              <i className="absolute bottom-1.5 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-accent/40" />
            </span>
          </div>
        ) : analysis.previewMode === "page-spread" ? (
          <div className="mx-auto grid h-28 w-24 grid-cols-2 gap-1 rounded-xl border-2 border-accent/45 bg-card p-2 shadow-sm">
            <span className="rounded border border-line bg-gradient-to-br from-accent-soft to-panel" />
            <span className="rounded border border-line bg-gradient-to-br from-accent-soft to-panel" />
            <span className="col-span-2 rounded border border-line bg-gradient-to-br from-accent-soft to-panel" />
          </div>
        ) : analysis.previewMode === "landscape" ? (
          <div className="mx-auto flex h-20 w-32 flex-col justify-end rounded-xl border-2 border-accent/45 bg-card p-1.5 shadow-sm">
            <span className="relative flex-1 rounded border border-line bg-gradient-to-br from-accent-soft to-panel">
              <i className="absolute inset-x-3 bottom-1.5 h-2 rounded-full bg-card/90" />
            </span>
          </div>
        ) : (
          <div className="mx-auto flex h-32 w-20 flex-col justify-between rounded-xl border-2 border-accent/45 bg-card p-1.5 shadow-sm">
            {Array.from({ length: analysis.cutsPerScreen }).map((_, index) => (
              <span
                key={index}
                className="relative mb-1 flex-1 rounded border border-line bg-gradient-to-br from-accent-soft to-panel last:mb-0"
              >
                <i className="absolute right-1 top-1 h-2 w-5 rounded-full bg-card" />
              </span>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-card p-2.5">
            <span className="block text-[0.68rem] text-fg-3">{unitLabel}</span>
            <strong className="mt-0.5 block font-black text-fg">{unitValue}</strong>
          </div>
          <div className="rounded-xl border border-line bg-card p-2.5">
            <span className="block text-[0.68rem] text-fg-3">{densityLabel}</span>
            <strong className="mt-0.5 block font-black text-fg">{densityValue}</strong>
          </div>
          <div className="col-span-2 rounded-xl border border-line bg-card p-2.5 sm:col-span-1">
            <span className="block text-[0.68rem] text-fg-3">
              {bt("선명도 판정", "Clarity check")}
            </span>
            <strong
              className={cn(
                "mt-0.5 block font-black",
                analysis.readabilityTone === "optimal" ? "text-success" : "text-warning",
              )}
            >
              {analysis.readabilityTone === "optimal"
                ? bt("선명함 · 권장 폭 충족", "Crisp · Spec ready")
                : bt("권장 가로 폭 확인", "Check recommended width")}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
