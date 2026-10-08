import { motion } from "motion/react";

import { CountUp } from "./fortune-fx";
import { ELEMENT_COLORS, type FortuneResult, type SajuData } from "./fortune-page-data";
import { cn } from "@/shared/lib/utils";

/**
 * 사주 전용 결과 디스플레이 — 사주 원판(四柱八字) 격자, 음양오행 강약 비율, 세운(올해/내년) 카드.
 * FortunePage가 파일 크기 래칫 천장을 넘어 이 표시 블록을 그대로 이 파일로 추출했다
 * (2026-10-09, 동작 변경 없음). 문구 번역(tx)은 FortunePage가 만든 함수를 그대로 받는다.
 */
export function FortuneSajuResult({
  saju,
  yearLuck,
  tx,
}: {
  saju: SajuData;
  yearLuck: FortuneResult["yearLuck"];
  tx: (source: string) => string;
}) {
  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

      {/* 사주 8자 격자 표 */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-fg-3 uppercase tracking-wider">사주 원판 (四柱八字)</h4>
        {saju.birthTimeKnown === false && <p className="text-xs text-fg-3">출생시간 미상 · 시주를 제외한 6글자 분석입니다.</p>}
        {saju.calculationNotes && <details className="text-xs text-fg-3"><summary>{tx("계산 기준과 한계")}</summary>{saju.calculationNotes.map((note) => <p key={note}>{note}</p>)}</details>}
        <div className="grid grid-cols-4 gap-2 text-center">
          {/* 열 헤더: 시, 일, 월, 년 */}
          {["시주", "일주", "월주", "년주"].map((h, i) => (
            <div key={i} className="text-xs font-bold text-fg-3 border-b border-line pb-1">
              {h}
            </div>
          ))}

          {/* 천간행 */}
          {[
            saju.hourPillar,
            saju.dayPillar,
            saju.monthPillar,
            saju.yearPillar
          ].map((p, i) => {
            const col = ELEMENT_COLORS[p.elementKan] ?? { bg: "bg-panel", text: "text-fg-3", dot: "bg-panel" };
            return (
              <div key={i} className={cn("rounded-lg p-2 flex flex-col items-center justify-center border border-line/40", col.bg)}>
                <span className={cn("text-2xl font-bold font-display", col.text)}>{p.kan || "—"}</span>
                <span className="text-xs text-fg-3 mt-0.5">{p.kanKorean} ({p.elementKan})</span>
              </div>
            );
          })}

          {/* 지지행 */}
          {[
            saju.hourPillar,
            saju.dayPillar,
            saju.monthPillar,
            saju.yearPillar
          ].map((p, i) => {
            const col = ELEMENT_COLORS[p.elementJi] ?? { bg: "bg-panel", text: "text-fg-3", dot: "bg-panel" };
            return (
              <div key={i} className={cn("rounded-lg p-2 flex flex-col items-center justify-center border border-line/40", col.bg)}>
                <span className={cn("text-2xl font-bold font-display", col.text)}>{p.ji || "—"}</span>
                <span className="text-xs text-fg-3 mt-0.5">{p.jiKorean} ({p.elementJi})</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 오행 비율 스펙트럼 바 */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold text-fg-3 uppercase tracking-wider">음양오행 강약 비율</h4>
        <div className="space-y-2.5">
          {([
            { key: "wood", label: "목 (Wood)", ratio: saju.elementsRatio.wood, col: ELEMENT_COLORS["목"] },
            { key: "fire", label: "화 (Fire)", ratio: saju.elementsRatio.fire, col: ELEMENT_COLORS["화"] },
            { key: "earth", label: "토 (Earth)", ratio: saju.elementsRatio.earth, col: ELEMENT_COLORS["토"] },
            { key: "metal", label: "금 (Metal)", ratio: saju.elementsRatio.metal, col: ELEMENT_COLORS["금"] },
            { key: "water", label: "수 (Water)", ratio: saju.elementsRatio.water, col: ELEMENT_COLORS["수"] },
          ]).map((el) => (
            <div key={el.key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-fg-2">{el.label}</span>
                <span className={cn("font-bold font-display", el.col.text)}>{el.ratio}%</span>
              </div>
              {/* 오행 게이지 바 */}
              <div className="h-2 w-full rounded-full bg-card overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", el.col.dot)}
                  style={{ width: `${el.ratio}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* 세운(歲運) — 올해/내년의 운세 (웹툰 컷 연출) */}
    {yearLuck && (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[yearLuck.thisYear, yearLuck.nextYear].map((y, i) => (
          <motion.div
            key={y.year}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: i === 1 ? 0.92 : 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.12, ease: "easeOut" }}
            className="relative overflow-hidden rounded-2xl p-4"
            style={{ border: "2px solid var(--char-accent)", background: "var(--char-accent-soft)" }}
          >
            {/* 스크린톤(하프톤) */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{ backgroundImage: "radial-gradient(oklch(1 0 0 / 0.06) 1px, transparent 1.4px)", backgroundSize: "7px 7px" }}
            />
            {/* 干支 도장 워터마크 */}
            <span aria-hidden className="pointer-events-none absolute -right-1 -top-2 select-none font-display text-5xl font-black opacity-10" style={{ color: "var(--char-accent)" }}>
              {y.kanji}
            </span>
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--char-accent)", color: "var(--color-on-accent)" }}>
                  {i === 0 ? "올해의 운세 · 세운" : "내년 미리보기"}
                </span>
                <span className="text-xs text-fg-3">{y.year} {y.kanji}年</span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <CountUp value={y.score} className="font-display text-2xl font-extrabold" style={{ color: "var(--char-accent)" }} />
                <span className="text-sm font-bold text-fg-2">{y.themeName}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-fg-3">{y.themeFocus}</p>
            </div>
          </motion.div>
        ))}
      </div>
    )}
    </div>
  );
}
