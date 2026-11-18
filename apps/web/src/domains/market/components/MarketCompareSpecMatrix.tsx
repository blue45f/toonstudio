import { ArrowUpRight, FlaskConical, PackageSearch } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { MARKET_COMPARE_MAX_ITEMS } from "../hooks/use-market-compare";

import { MarketNavHeader } from "./MarketNavHeader";
import { MarketSectionArtBanner } from "./MarketSectionArtBanner";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

export function MarketCompareEmptyState() {
  const t = useBilingual("MarketComparePage");

  return (
    <section className="rounded-[16px] border border-line bg-panel p-6 sm:p-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-10">
        <div>
          <div className="inline-flex size-11 items-center justify-center rounded-[10px] border border-line bg-card text-fg-2">
            <PackageSearch className="size-5" aria-hidden="true" />
          </div>
          <h2 className="mt-3.5 text-lg font-semibold text-fg [word-break:keep-all]">
            {t("비교할 에셋을 담아 주세요", "Add assets to compare")}
          </h2>
          <p className="mt-1.5 max-w-md text-sm leading-6 text-fg-2 [word-break:keep-all]">
            {t(
              `탐색 카드의 비교 버튼으로 최대 ${MARKET_COMPARE_MAX_ITEMS}개를 선택해 라이선스·호환 렌더러·패키지 항목을 한눈에 대조할 수 있습니다.`,
              `Use the compare button on browse cards to select up to ${MARKET_COMPARE_MAX_ITEMS} items and compare licenses, engines, and package entries side by side.`,
            )}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link
              href="/market/browse"
              className={buttonClass({
                variant: "solid",
                size: "md",
                className: "min-h-11 min-w-11 gap-1.5 rounded-[9px] font-medium",
              })}
            >
              {t("에셋 탐색", "Explore assets")}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/market/fit-lab"
              className={buttonClass({
                variant: "outline",
                size: "md",
                className: "min-h-11 min-w-11 gap-1.5 rounded-[9px] font-medium",
              })}
            >
              <FlaskConical className="size-4 text-fg-3" aria-hidden="true" />
              {t("제작 조건 먼저 설정", "Set production rules")}
            </Link>
          </div>
        </div>

        <div className="rounded-[12px] border border-line bg-card p-4">
          <p className="text-xs font-medium text-fg-3">
            {t("대조하는 공개 manifest 항목", "Compared public manifest fields")}
          </p>
          <div className="mt-3 space-y-3">
            {[
              {
                labelKo: "내 작업 프로필 적합성",
                labelEn: "Production profile fit",
                descKo: "Studio 버전 · 렌더러 · 상업 이용 · AI 공개 일치 비율",
                descEn: "Studio version, engine, commercial & AI disclosure pass rate",
                width: "86%",
              },
              {
                labelKo: "사용권 · 저작자 표기 조건",
                labelEn: "License & attribution",
                descKo: "CC0 · CC BY · 표준 사용권 및 재배포 제한 대조",
                descEn: "CC0, CC BY, standard license & redistribution rules",
                width: "72%",
              },
              {
                labelKo: "호환 엔진 · 패키지 구성",
                labelEn: "Compatible engines & entries",
                descKo: "Canvas2D · WebGL2 · WebGPU · Three.js 지원 범위",
                descEn: "Canvas2D, WebGL2, WebGPU & Three.js engine support",
                width: "64%",
              },
            ].map((preview, idx) => (
              <div
                key={preview.labelKo}
                className="border-t border-line/70 pt-2.5 first:border-t-0 first:pt-0"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-fg">{t(preview.labelKo, preview.labelEn)}</span>
                  <span className="text-fg-3">{t("실데이터 검증", "Manifest fact")}</span>
                </div>
                <p className="mt-0.5 text-xs text-fg-2 [word-break:keep-all]">
                  {t(preview.descKo, preview.descEn)}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel">
                  <div
                    className="ink-bar-fill h-full rounded-full bg-accent/65"
                    style={{ width: preview.width, "--ink-i": idx } as CSSProperties}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketCompareSpecMatrix({ compareCount }: { readonly compareCount: number }) {
  const t = useBilingual("MarketComparePage");
  const [seatScale, setSeatScale] = useState<"solo-1" | "team-5" | "enterprise-20">("solo-1");
  const [specAxis, setSpecAxis] = useState<
    "lt-6pass-speed" | "vram-footprint" | "rig-blendshape" | "commercial-clause"
  >("lt-6pass-speed");

  return (
    <SiteDisclosure
      title={t("비교 전문 도구 · 마켓 이동", "Advanced comparison tools and market navigation")}
      className="mt-6"
    >
      <MarketNavHeader />
      <section
        data-testid="market-compare-rea-spec-matrix-bar"
        aria-label={t(
          "REA 3D·브러시 멀티시트 라이선스 및 6패스 스펙 비교 매트릭스",
          "REA 3D/brush multi-seat license & 6-pass spec comparison matrix",
        )}
        className="mt-5 rounded-[14px] border border-line bg-card p-4 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="font-semibold text-fg">
            {t(
              "멀티시트 라이선스 · 6-Pass 렌더 스펙 비교 매트릭스",
              "Multi-seat license & 6-Pass render spec comparison matrix",
            )}
          </strong>
          <span
            data-testid="market-compare-rea-seat-badge"
            className="rounded-[6px] border border-accent/35 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent tabular-nums"
          >
            {seatScale === "solo-1"
              ? t(`개인 1인 시트 · 비교 대상 ${compareCount}종`, `Solo 1-Seat · ${compareCount} compared`)
              : seatScale === "team-5"
                ? t(`5인 스튜디오 공동 라이선스 · 비교 대상 ${compareCount}종`, `5-Seat Studio Team · ${compareCount} compared`)
                : t(`20인 프로덕션 무제한 시트 · 비교 대상 ${compareCount}종`, `20-Seat Enterprise · ${compareCount} compared`)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t("기술 스펙 비교 축", "Technical spec comparison axis")}
          >
            {(
              [
                { id: "lt-6pass-speed", ko: "WebGPU 6-Pass 은선 추출 속도", en: "WebGPU 6-Pass LT Speed" },
                { id: "vram-footprint", ko: "폴리곤·텍스처 VRAM 점유율", en: "Polygon & Texture VRAM Footprint" },
                { id: "rig-blendshape", ko: "VRM 52 표정·의상 리깅 호환", en: "VRM 52 BlendShape & Rig Check" },
                { id: "commercial-clause", ko: "상업 연재·2차 저작물 특약", en: "Commercial & Secondary IP Clause" },
              ] as const
            ).map((axis) => (
              <button
                key={axis.id}
                type="button"
                aria-pressed={specAxis === axis.id}
                data-testid={`market-compare-rea-axis-${axis.id}`}
                onClick={() => setSpecAxis(axis.id)}
                className={
                  specAxis === axis.id
                    ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[8px] border border-accent/60 bg-accent-soft px-3 py-2 font-medium text-fg"
                    : "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[8px] border border-line bg-panel px-3 py-2 text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                }
              >
                {t(axis.ko, axis.en)}
              </button>
            ))}
          </div>
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label={t("스튜디오 좌석 규모", "Studio seat scale")}
          >
            {(
              [
                { id: "solo-1", ko: "1인 작가", en: "Solo (1)" },
                { id: "team-5", ko: "5인 어시 팀", en: "Team (5)" },
                { id: "enterprise-20", ko: "20인 스튜디오", en: "Studio (20)" },
              ] as const
            ).map((scale) => (
              <button
                key={scale.id}
                type="button"
                aria-pressed={seatScale === scale.id}
                data-testid={`market-compare-rea-seat-${scale.id}`}
                onClick={() => setSeatScale(scale.id)}
                className={
                  seatScale === scale.id
                    ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[8px] border border-accent bg-accent px-3 py-2 text-xs font-medium text-on-accent"
                    : "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[8px] border border-line bg-panel px-3 py-2 text-xs text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                }
              >
                {t(scale.ko, scale.en)}
              </button>
            ))}
          </div>
        </div>
        <p
          data-testid="market-compare-rea-spec-status"
          className="mt-2.5 rounded-[10px] border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-fg-2 [word-break:keep-all]"
        >
          {specAxis === "lt-6pass-speed"
            ? t(
                "6패스(외곽선·깊이·AO·재질ID·그림자·조명) 추출 시 컷당 병합 속도와 레이어 분리 기준을 대조합니다.",
                "Contrasts 6-pass LT (Line, Depth, AO, Material ID, Shadow, Light) merge speed and layer separation.",
              )
            : specAxis === "vram-footprint"
              ? t(
                  "LOD0~LOD2 기준 태블릿 환경에서 에셋당 권장 VRAM 상한 이내 여부를 대조합니다.",
                  "Verifies each asset stays within the recommended VRAM budget on tablet devices across LOD0–LOD2.",
                )
              : specAxis === "rig-blendshape"
                ? t(
                    "3D 의상·캐릭터 에셋 간 관절 본(Bone) 규격과 52개 표정 모프 타깃 호환성을 나란히 검증합니다.",
                    "Checks humanoid bone hierarchy and 52 facial morph compatibility across 3D character assets.",
                  )
                : t(
                    "개인 작가 1인 라이선스와 어시스턴트 공동작업(5인/20인) 시 추가 시트 필요 여부 및 2차 저작물 사용 범위를 대조합니다.",
                    "Contrasts solo vs 5/20-seat assistant sharing rules and print/animation secondary IP clearance.",
                  )}
        </p>
      </section>

      <MarketSectionArtBanner className="mt-5" />
    </SiteDisclosure>
  );
}
