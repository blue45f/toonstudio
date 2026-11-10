import { Smartphone } from "lucide-react";
import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

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
 * 프로젝트 생성 전 설정한 가로·세로 크기가 실제 독자의 스마트폰 한 화면에서
 * 어떤 컷 밀도와 여백으로 보이는지 즉시 시뮬레이션해 주는 초보자 친화형 미리보기.
 */
export function StudioCanvasSafeZoneSimulator({
  width,
  height,
}: {
  readonly width: number;
  readonly height: number;
}) {
  const bt = useBilingual("StudioCanvasSafeZoneSimulator");
  const [rhythm, setRhythm] = useState<SafeZoneRhythmId>("balanced");

  const analysis = useMemo(
    () => analyzeMobileSafeZone(width, height, rhythm),
    [width, height, rhythm],
  );

  return (
    <div
      data-testid="studio-canvas-safe-zone-simulator"
      className="mt-4 rounded-2xl border border-line bg-panel/45 p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Smartphone size={13} aria-hidden="true" />
            {bt("모바일 한 화면 안전영역 미리보기", "MOBILE SAFE-ZONE SIMULATOR")}
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
      </div>

      {/* 스마트폰 1화면 프레임 시뮬레이션 */}
      <div
        aria-hidden="true"
        className="mt-3 grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center"
      >
        <div className="mx-auto flex h-32 w-20 flex-col justify-between rounded-xl border-2 border-accent/45 bg-card p-1.5 shadow-sm">
          {Array.from({ length: analysis.cutsPerScreen }).map((_, index) => (
            <span
              key={index}
              className="relative flex-1 rounded border border-line bg-gradient-to-br from-accent-soft to-panel mb-1 last:mb-0"
            >
              <i className="absolute right-1 top-1 h-2 w-5 rounded-full bg-card" />
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-card p-2.5">
            <span className="block text-[0.68rem] text-fg-3">
              {bt("폰 스크롤 분량", "Mobile screens")}
            </span>
            <strong className="mt-0.5 block font-black text-fg">
              {bt(`약 ${analysis.phoneScreensPerPage}화면`, `~${analysis.phoneScreensPerPage}x`)}
            </strong>
          </div>
          <div className="rounded-xl border border-line bg-card p-2.5">
            <span className="block text-[0.68rem] text-fg-3">
              {bt("한 화면 권장 컷", "Cuts / screen")}
            </span>
            <strong className="mt-0.5 block font-black text-fg">
              {bt(`${analysis.cutsPerScreen}컷 호흡`, `${analysis.cutsPerScreen} panel(s)`)}
            </strong>
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
                : bt("가로 800px+ 권장", "Recommend 800px+")}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
