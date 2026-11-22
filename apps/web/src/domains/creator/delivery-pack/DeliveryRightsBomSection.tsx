/**
 * Rights BOM 상업 라이선스 점검 및 소재 관리 UI 섹션.
 */

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  DELIVERY_BOM_ASSET_CATEGORIES,
  DELIVERY_BOM_CATEGORY_LABELS,
  DELIVERY_BOM_LICENSE_STATUSES,
  type DeliveryBomAssetCategory,
  type DeliveryBomLicenseStatus,
  type DeliveryRightsBomAsset,
  type DeliveryRightsBomAuditReport,
} from "./rights-bom-validator";

const INPUT_CLASS =
  "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-line bg-card px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

const LICENSE_STATUS_LABELS: Readonly<
  Record<DeliveryBomLicenseStatus, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  "commercial-allowed": Object.freeze({ ko: "상업 허용", en: "Commercial allowed" }),
  "commercial-attribution": Object.freeze({ ko: "상업 + 출처 필수", en: "Commercial + attribution" }),
  "non-commercial": Object.freeze({ ko: "비상업 전용 (차단)", en: "Non-commercial (blocked)" }),
  restricted: Object.freeze({ ko: "제한 / 미승인 (차단)", en: "Restricted (blocked)" }),
  unknown: Object.freeze({ ko: "미확인 (차단)", en: "Unknown (blocked)" }),
});

export interface DeliveryRightsBomSectionProps {
  readonly assets: readonly DeliveryRightsBomAsset[];
  readonly customAssetIds: ReadonlySet<string>;
  readonly rightsReport: DeliveryRightsBomAuditReport;
  readonly onAddAsset: (asset: DeliveryRightsBomAsset) => void;
  readonly onRemoveAsset: (assetId: string) => void;
  readonly onUpdateLicenseStatus: (assetId: string, nextStatus: DeliveryBomLicenseStatus) => void;
  readonly onUpdateAttribution: (assetId: string, attributionText: string) => void;
}

export function DeliveryRightsBomSection({
  assets,
  customAssetIds,
  rightsReport,
  onAddAsset,
  onRemoveAsset,
  onUpdateLicenseStatus,
  onUpdateAttribution,
}: DeliveryRightsBomSectionProps) {
  const bt = useBilingual("StudioEpisodeDeliveryPackPanel");
  const [newAssetName, setNewAssetName] = useState<string>("");
  const [newAssetCategory, setNewAssetCategory] = useState<DeliveryBomAssetCategory>("font");
  const [newAssetStatus, setNewAssetStatus] = useState<DeliveryBomLicenseStatus>("commercial-allowed");
  const [newAssetCode, setNewAssetCode] = useState<string>("OFL-1.1");
  const [newAssetCreator, setNewAssetCreator] = useState<string>("");
  const [newAssetAttribution, setNewAssetAttribution] = useState<string>("");
  const [nextSeq, setNextSeq] = useState<number>(1);

  const handleAdd = (): void => {
    const trimmedName = newAssetName.trim();
    if (!trimmedName) return;
    onAddAsset({
      id: `bom-${newAssetCategory}-${nextSeq}`,
      name: trimmedName,
      category: newAssetCategory,
      licenseStatus: newAssetStatus,
      licenseCode: newAssetCode.trim(),
      creatorOrVendor: newAssetCreator.trim() || bt("직접 등록", "Self-declared"),
      requiresAttribution: newAssetStatus === "commercial-attribution",
      attributionText: newAssetAttribution.trim() || null,
    });
    setNextSeq((prev) => prev + 1);
    setNewAssetName("");
    setNewAssetCreator("");
    setNewAssetAttribution("");
  };

  return (
    <div className="mt-4 rounded-2xl border border-line bg-panel/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-fg">
            {bt(
              "Rights BOM 상업 라이선스 검증 (폰트·브러시·3D 배경·효과)",
              "Rights BOM Commercial License Gate",
            )}
          </h3>
          <p className="mt-0.5 text-xs text-fg-3">
            {bt(
              "비상업 전용(non-commercial), 제한(restricted), 미확인(unknown), 출처 표기 누락 소재가 있으면 납품 내보내기가 즉시 차단됩니다.",
              "Export is blocked fail-closed whenever non-commercial, restricted, unknown, or attribution-missing assets exist.",
            )}
          </p>
        </div>
        <span className="rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-fg-2">
          {bt(
            `총 ${rightsReport.totalAssetCount}건 · 통과 ${rightsReport.clearedAssetCount}건 · 차단 ${rightsReport.blockedAssetCount}건`,
            `${rightsReport.totalAssetCount} assets · ${rightsReport.clearedAssetCount} cleared · ${rightsReport.blockedAssetCount} blocked`,
          )}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input
          type="text"
          aria-label={bt("소재명", "Asset name")}
          value={newAssetName}
          onChange={(event) => setNewAssetName(event.target.value)}
          placeholder={bt("소재명 (예: 나눔스퀘어)", "Asset name")}
          className={INPUT_CLASS}
        />
        <select
          aria-label={bt("소재 구분", "Asset category")}
          value={newAssetCategory}
          onChange={(event) => setNewAssetCategory(event.target.value as DeliveryBomAssetCategory)}
          className={INPUT_CLASS}
        >
          {DELIVERY_BOM_ASSET_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {bt(DELIVERY_BOM_CATEGORY_LABELS[category].ko, DELIVERY_BOM_CATEGORY_LABELS[category].en)}
            </option>
          ))}
        </select>
        <select
          aria-label={bt("상업 라이선스 상태", "Commercial license status")}
          value={newAssetStatus}
          onChange={(event) => setNewAssetStatus(event.target.value as DeliveryBomLicenseStatus)}
          className={INPUT_CLASS}
        >
          {DELIVERY_BOM_LICENSE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {bt(LICENSE_STATUS_LABELS[status].ko, LICENSE_STATUS_LABELS[status].en)}
            </option>
          ))}
        </select>
        <input
          type="text"
          aria-label={bt("라이선스 코드", "License code")}
          value={newAssetCode}
          onChange={(event) => setNewAssetCode(event.target.value)}
          placeholder="OFL-1.1 / CC-BY-4.0"
          className={INPUT_CLASS}
        />
        <input
          type="text"
          aria-label={bt("출처 표기 문구", "Attribution text")}
          value={newAssetAttribution}
          onChange={(event) => setNewAssetAttribution(event.target.value)}
          placeholder={bt("출처 문구 (출처 필수 시)", "Attribution credit")}
          className={INPUT_CLASS}
        />
        <button
          type="button"
          data-testid="delivery-bom-add-asset"
          onClick={handleAdd}
          className={buttonClass({
            variant: "outline",
            className: "mt-1 min-h-11 gap-1.5 motion-reduce:transition-none",
          })}
        >
          <Plus size={15} aria-hidden="true" />
          {bt("소재 추가", "Add asset")}
        </button>
      </div>

      {assets.length > 0 ? (
        <ul className="mt-3 space-y-2" aria-label={bt("점검 대상 Rights BOM 목록", "Rights BOM asset list")}>
          {assets.map((asset) => {
            const isCustom = customAssetIds.has(asset.id);
            const assetBlocker = rightsReport.blockers.find((item) => item.assetId === asset.id);
            return (
              <li
                key={asset.id}
                data-testid={`delivery-bom-row-${asset.id}`}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between",
                  assetBlocker ? "border-bad/40 bg-bad/5" : "border-line bg-card",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-line bg-panel px-2 py-0.5 text-xs font-semibold text-fg-2">
                      {bt(
                        DELIVERY_BOM_CATEGORY_LABELS[asset.category].ko,
                        DELIVERY_BOM_CATEGORY_LABELS[asset.category].en,
                      )}
                    </span>
                    <strong className="text-sm font-bold text-fg">{asset.name}</strong>
                    <code className="text-xs text-fg-3">{asset.licenseCode || "—"}</code>
                  </div>
                  {assetBlocker ? (
                    <p className="mt-1 text-xs font-semibold text-bad">{assetBlocker.messageKo}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={bt(`${asset.name} 라이선스 상태`, `${asset.name} license status`)}
                    value={asset.licenseStatus}
                    onChange={(event) =>
                      onUpdateLicenseStatus(asset.id, event.target.value as DeliveryBomLicenseStatus)
                    }
                    className="min-h-11 rounded-xl border border-line bg-panel px-2.5 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {DELIVERY_BOM_LICENSE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {bt(LICENSE_STATUS_LABELS[status].ko, LICENSE_STATUS_LABELS[status].en)}
                      </option>
                    ))}
                  </select>
                  {asset.requiresAttribution || asset.licenseStatus === "commercial-attribution" ? (
                    <input
                      type="text"
                      aria-label={bt(`${asset.name} 출처 표기`, `${asset.name} attribution`)}
                      value={asset.attributionText ?? ""}
                      placeholder={bt("필수 출처 문구 입력", "Enter attribution")}
                      onChange={(event) => onUpdateAttribution(asset.id, event.target.value)}
                      className="min-h-11 rounded-xl border border-line bg-panel px-2.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                  ) : null}
                  {isCustom ? (
                    <button
                      type="button"
                      aria-label={bt(`${asset.name} 제거`, `Remove ${asset.name}`)}
                      onClick={() => onRemoveAsset(asset.id)}
                      className={buttonClass({
                        variant: "quiet",
                        size: "sm",
                        className: "min-h-11 min-w-11 px-2.5 text-fg-3 hover:text-bad",
                      })}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-fg-3">
          {bt(
            "등록된 외부 제3자 소재가 없습니다. 폰트·브러시·3D 배경·효과를 사용했다면 위에서 등록해 증명서에 반영하세요.",
            "No external assets registered yet. Add fonts, brushes, 3D backgrounds, or effects above to include them in the certificate.",
          )}
        </p>
      )}
    </div>
  );
}
