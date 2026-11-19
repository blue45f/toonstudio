import { AlertTriangle, CheckCircle2, FileText, Package, QrCode } from "lucide-react";
import { useMemo, useState } from "react";

import {
  GOODS_SKU_CATALOG,
  MULTI_FORMAT_DISTRIBUTION_SPECS,
  compileSourceTextToPilot3Cut,
  evaluateOfflineQrGoodsKit,
  type GoodsSkuId,
  type MultiFormatTargetId,
} from "./studio-multiformat-ip-kit";

export interface StudioMultiFormatIpKitPanelProps {
  readonly workTitle: string;
  readonly rightsBomCleared: boolean;
}

export function StudioMultiFormatIpKitPanel({
  workTitle,
  rightsBomCleared,
}: StudioMultiFormatIpKitPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState<MultiFormatTargetId>("shortform-9x16");
  const [sourceText, setSourceText] = useState(
    "오래된 골목 끝 작은 찻집에 비가 내린다. 문이 열리며 낯선 손님이 낡은 지도를 꺼낸다. 지도 위에는 사라진 마을의 이름이 적혀 있다.",
  );
  const [skuId, setSkuId] = useState<GoodsSkuId>("emotion-checkin-kit");
  const [quantity, setQuantity] = useState(200);
  const [unitPriceKrw, setUnitPriceKrw] = useState(16_000);
  const [includeQrStampCard, setIncludeQrStampCard] = useState(true);

  const activeFormat =
    MULTI_FORMAT_DISTRIBUTION_SPECS.find((item) => item.id === selectedFormat) ??
    MULTI_FORMAT_DISTRIBUTION_SPECS[0];
  const pilotPlan = useMemo(
    () => compileSourceTextToPilot3Cut(workTitle, sourceText),
    [workTitle, sourceText],
  );
  const goodsReport = useMemo(
    () =>
      evaluateOfflineQrGoodsKit({
        skuId,
        quantity,
        unitPriceKrw,
        includeQrStampCard,
        rightsBomCleared,
      }),
    [skuId, quantity, unitPriceKrw, includeQrStampCard, rightsBomCleared],
  );

  return (
    <div
      className="flex flex-col gap-6 border-t border-line pt-4 text-xs text-fg break-keep"
      role="tabpanel"
      aria-label="멀티포맷 및 오프라인 QR 키트"
    >
      {/* 1. 멀티포맷 원클릭 배포 규격 선택 */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <FileText className="size-4 text-accent" aria-hidden="true" />
            멀티포맷 배포 규격 ({MULTI_FORMAT_DISTRIBUTION_SPECS.length}종)
          </h4>
          <span className="font-mono text-[11px] tabular-nums text-fg-2">
            {activeFormat.resolutionLabel} · {activeFormat.colorSpace}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MULTI_FORMAT_DISTRIBUTION_SPECS.map((spec) => {
            const selected = spec.id === activeFormat.id;
            return (
              <button
                key={spec.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedFormat(spec.id)}
                className={`flex min-h-11 flex-col gap-1 rounded-xl p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  selected
                    ? "bg-accent-soft text-accent ring-1 ring-accent"
                    : "bg-card text-fg hover:bg-raised"
                }`}
              >
                <span className="font-semibold">{spec.labelKo}</span>
                <span className="font-mono text-[11px] tabular-nums text-fg-2">
                  {spec.resolutionLabel} · 권장 {spec.recommendedCuts}컷
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-2">
          {activeFormat.deliverablesKo.map((item) => (
            <span key={item} className="rounded-lg bg-card px-2.5 py-1">
              {item}
            </span>
          ))}
          {activeFormat.bleedMm > 0 ? (
            <span className="rounded-lg bg-accent-soft px-2.5 py-1 font-semibold tabular-nums text-accent">
              도련선 {activeFormat.bleedMm}mm 자동 포함
            </span>
          ) : null}
        </div>
      </div>

      {/* 2. 원천 텍스트 → 파일럿 3컷 시드 변환 & 45자 호흡 점검 */}
      <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-fg">원천 스토리 → 파일럿 3컷 시드</h4>
          <label className="flex flex-col gap-1.5 text-fg-2">
            <span>설화·웹소설·경험 원문 (문장 단위로 3컷 분할)</span>
            <textarea
              rows={4}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              className="rounded-xl border border-line bg-card p-3 text-xs leading-5 text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium">
            {pilotPlan.pacingPass ? (
              <>
                <CheckCircle2 className="size-3.5 text-good" aria-hidden="true" />
                <span className="text-good">모든 컷 말풍선 45자 호흡 기준 통과</span>
              </>
            ) : (
              <>
                <AlertTriangle className="size-3.5 text-warn" aria-hidden="true" />
                <span className="text-warn">45자를 초과한 컷 대사를 줄여 모바일 가독성을 확보하세요</span>
              </>
            )}
          </p>
        </div>

        <ol className="divide-y divide-line/60 rounded-xl bg-card px-3.5">
          {pilotPlan.cuts.map((cut) => (
            <li key={cut.index} className="flex flex-col gap-1 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-fg">
                  {cut.roleLabelKo} · {cut.cameraShotKo}
                </strong>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    cut.overBalloonLimit ? "text-warn" : "text-fg-3"
                  }`}
                >
                  {cut.charCount}/45자
                </span>
              </div>
              <p className="text-fg-2">{cut.dialogueLineKo}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* 3. 오프라인 QR 체험 & 굿즈 BOM 수익 시뮬레이터 */}
      <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Package className="size-4 text-accent" aria-hidden="true" />
            오프라인 QR 체험 · 굿즈 BOM 빌더
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 flex flex-col gap-1 text-fg-2">
              <span>굿즈 품목</span>
              <select
                value={skuId}
                onChange={(e) => setSkuId(e.target.value as GoodsSkuId)}
                className="min-h-11 rounded-xl border border-line bg-card px-3 text-xs text-fg"
              >
                {GOODS_SKU_CATALOG.map((sku) => (
                  <option key={sku.id} value={sku.id}>
                    {sku.labelKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-fg-2">
              <span>제작 수량(개)</span>
              <input
                type="number"
                min={10}
                max={10_000}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="min-h-11 rounded-xl border border-line bg-card px-3 tabular-nums text-fg"
              />
            </label>
            <label className="flex flex-col gap-1 text-fg-2">
              <span>판매가(원)</span>
              <input
                type="number"
                min={1000}
                step={1000}
                value={unitPriceKrw}
                onChange={(e) => setUnitPriceKrw(Math.max(0, Number(e.target.value) || 0))}
                className="min-h-11 rounded-xl border border-line bg-card px-3 tabular-nums text-fg"
              />
            </label>
          </div>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-fg-2">
            <input
              type="checkbox"
              checked={includeQrStampCard}
              onChange={(e) => setIncludeQrStampCard(e.target.checked)}
            />
            <QrCode className="size-3.5 text-accent" aria-hidden="true" />
            <span>오프라인 QR 4컷 스탬프 카드 동봉 (+350원/개)</span>
          </label>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-xl bg-card p-4">
          <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2">
            <span className="font-semibold text-fg">{goodsReport.skuLabelKo}</span>
            <span
              className={`font-semibold tabular-nums ${
                goodsReport.printReady ? "text-good" : "text-warn"
              }`}
            >
              {goodsReport.printReady ? `마진 ${goodsReport.marginPercent}%` : "출고 보류"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <dt className="text-fg-3">예상 제작 단가</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-fg">
                {goodsReport.unitCostKrw.toLocaleString("ko-KR")}원
              </dd>
            </div>
            <div>
              <dt className="text-fg-3">예상 순수익</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-good">
                {(goodsReport.netProfitKrw / 10_000).toLocaleString("ko-KR")}만원
              </dd>
            </div>
          </dl>
          <p className="text-[11px] text-fg-2">인쇄 규격: {goodsReport.bleedSpecKo}</p>
          <p className="text-[11px] text-fg-2">{goodsReport.qrFlowSummaryKo}</p>
          {goodsReport.blockersKo.length > 0 ? (
            <ul className="space-y-1 text-[11px] font-medium text-warn">
              {goodsReport.blockersKo.map((blocker) => (
                <li key={blocker}>· {blocker}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
