import { ArrowUpRight, PackageSearch } from "lucide-react";
import { useState } from "react";

import { MarketNavHeader } from "./MarketNavHeader";
import { MarketSectionArtBanner } from "./MarketSectionArtBanner";
import { MARKET_COMPARE_MAX_ITEMS } from "../hooks/use-market-compare";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

export function MarketCompareEmptyState() {
  const t = useBilingual("MarketComparePage");
  return (
    <section className="mt-10 rounded-2xl border border-dashed border-line bg-panel/50 p-10 text-center sm:p-14">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-raised text-fg-3">
        <PackageSearch className="size-6" aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-sm font-bold text-fg">{t("비교할 에셋을 담아 주세요", "Add assets to compare")}</h2>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-fg-3">
        {t(`탐색 카드의 비교 버튼으로 최대 ${MARKET_COMPARE_MAX_ITEMS}개를 선택할 수 있습니다.`, `Use the compare button on browse cards to select up to ${MARKET_COMPARE_MAX_ITEMS} items.`)}
      </p>
      <Link
        href="/market/browse"
        className={buttonClass({
          variant: "solid",
          size: "md",
          className: "mt-4 min-h-11 min-w-11 gap-1.5",
        })}
      >
        {t("에셋 탐색", "Explore assets")}
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

export function MarketCompareSpecMatrix({ compareCount }: { compareCount: number }) {
  const t = useBilingual("MarketComparePage");
  const [seatScale, setSeatScale] = useState<"solo-1" | "team-5" | "enterprise-20">("solo-1");
  const [specAxis, setSpecAxis] = useState<"lt-6pass-speed" | "vram-footprint" | "rig-blendshape" | "commercial-clause">("lt-6pass-speed");
  return (
    <SiteDisclosure title={t("비교 전문 도구 · 마켓 이동", "Advanced comparison tools and market navigation")} className="mt-5">
      <MarketNavHeader />
    <section
      data-testid="market-compare-rea-spec-matrix-bar"
      aria-label={t("REA 3D·브러시 멀티시트 라이선스 및 6패스 스펙 비교 매트릭스", "REA 3D/brush multi-seat license & 6-pass spec comparison matrix")}
      className="mt-5 rounded-2xl border border-line bg-card/90 p-3.5 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="font-extrabold text-accent">
          {t("ACON3D · FAB · QUIXEL · BOOTH · FONTWORKS 멀티시트 라이선스 & 6-Pass 스펙 비교 매트릭스", "ACON3D · FAB · QUIXEL · BOOTH · FONTWORKS Multi-Seat License & 6-Pass Spec Matrix")}
        </strong>
        <span data-testid="market-compare-rea-seat-badge" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
          {seatScale === "solo-1"
            ? t(`개인 1인 시트 · 비교 대상 ${compareCount}종`, `Solo 1-Seat · ${compareCount} compared`)
            : seatScale === "team-5"
              ? t(`5인 스튜디오 공동 라이선스 · 비교 대상 ${compareCount}종`, `5-Seat Studio Team · ${compareCount} compared`)
              : t(`20인 프로덕션 무제한 시트 · 비교 대상 ${compareCount}종`, `20-Seat Enterprise · ${compareCount} compared`)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("기술 스펙 비교 축", "Technical spec comparison axis")}>
          {([
            { id: "lt-6pass-speed", ko: "WebGPU 6-Pass 은선 추출 속도", en: "WebGPU 6-Pass LT Speed" },
            { id: "vram-footprint", ko: "폴리곤·텍스처 VRAM 점유율", en: "Polygon & Texture VRAM Footprint" },
            { id: "rig-blendshape", ko: "VRM 52 표정·의상 리깅 호환", en: "VRM 52 BlendShape & Rig Check" },
            { id: "commercial-clause", ko: "상업 연재·2차 저작물 특약", en: "Commercial & Secondary IP Clause" },
          ] as const).map((axis) => (
            <button
              key={axis.id}
              type="button"
              aria-pressed={specAxis === axis.id}
              data-testid={`market-compare-rea-axis-${axis.id}`}
              onClick={() => setSpecAxis(axis.id)}
              className={specAxis === axis.id ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-accent bg-accent/15 px-3 py-2 font-bold text-accent" : "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-panel px-3 py-2 text-fg-2"}
            >
              {t(axis.ko, axis.en)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("스튜디오 좌석 규모", "Studio seat scale")}>
          {([
            { id: "solo-1", ko: "1인 작가", en: "Solo (1)" },
            { id: "team-5", ko: "5인 어시 팀", en: "Team (5)" },
            { id: "enterprise-20", ko: "20인 스튜디오", en: "Studio (20)" },
          ] as const).map((scale) => (
            <button
              key={scale.id}
              type="button"
              aria-pressed={seatScale === scale.id}
              data-testid={`market-compare-rea-seat-${scale.id}`}
              onClick={() => setSeatScale(scale.id)}
              className={seatScale === scale.id ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-accent bg-accent px-3 py-2 text-[11px] font-bold text-on-accent" : "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line bg-panel px-3 py-2 text-[11px] text-fg-3"}
            >
              {t(scale.ko, scale.en)}
            </button>
          ))}
        </div>
      </div>
      <p data-testid="market-compare-rea-spec-status" className="mt-2 rounded-xl border border-line bg-panel/70 px-3 py-2 text-[11px] leading-relaxed text-fg-2">
        {specAxis === "lt-6pass-speed"
          ? t("ACON3D ABLE·Snaptoon 기준 6패스(외곽선·깊이·AO·재질ID·그림자·조명) 추출 시 평균 0.38s/컷 이내로 Studio 캔버스에 즉시 병합됩니다.", "Merges 6-pass LT (Line, Depth, AO, Material ID, Shadow, Light) into Studio Canvas in under 0.38s/cut.")
          : specAxis === "vram-footprint"
            ? t("Quixel Megascans·Fab LOD0~LOD2 기준 태블릿(iPad Pro M2 8GB) 환경에서 에셋당 권장 VRAM 상한 1.1GB 이내 여부를 대조합니다.", "Verifies each asset stays within the 1.1GB VRAM budget on iPad Pro M2 8GB across LOD0–LOD2.")
            : specAxis === "rig-blendshape"
              ? t("VRoid·BOOTH·CLO 3D 의상/캐릭터 에셋 간 관절 본(Bone) 규격과 52개 ARKit 표정 모프 타깃 호환성을 나란히 검증합니다.", "Checks humanoid bone hierarchy and 52 ARKit facial morph compatibility across VRoid/BOOTH/CLO 3D assets.")
              : t("개인 작가 1인 라이선스와 어시스턴트 공동작업(5인/20인) 시 추가 시트 구매 필요 여부 및 단행본·영상화 2차 사용 범위를 대조합니다.", "Contrasts solo vs 5/20-seat assistant sharing rules and print/animation secondary IP clearance.")}
      </p>
    </section>

      <MarketSectionArtBanner />
    </SiteDisclosure>
  );
}
