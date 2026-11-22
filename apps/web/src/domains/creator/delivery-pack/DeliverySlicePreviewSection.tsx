/**
 * 말풍선·얼굴 보호 구간 설정 및 자동 슬라이스 미리보기 테이블 섹션.
 */

import { Plus } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { EpisodeSlicePlan } from "./safe-slice-planner";

export interface EditableProtectedZone {
  readonly id: string;
  readonly kind: "speech-bubble" | "character-face";
  readonly topY: number;
  readonly bottomY: number;
}

export interface DeliverySlicePreviewSectionProps {
  readonly protectedZones: readonly EditableProtectedZone[];
  readonly totalSliceCount: number;
  readonly totalAdjustedCutCount: number;
  readonly primaryEpisode: EpisodeSlicePlan | null;
  readonly onAddProtectedZone: (zone: EditableProtectedZone) => void;
}

const INPUT_CLASS =
  "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-line bg-card px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

function formatMbLabel(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function DeliverySlicePreviewSection({
  protectedZones,
  totalSliceCount,
  totalAdjustedCutCount,
  primaryEpisode,
  onAddProtectedZone,
}: DeliverySlicePreviewSectionProps) {
  const bt = useBilingual("StudioEpisodeDeliveryPackPanel");
  const [newZoneKind, setNewZoneKind] = useState<"speech-bubble" | "character-face">("speech-bubble");
  const [newZoneTopY, setNewZoneTopY] = useState<string>("1560");
  const [newZoneBottomY, setNewZoneBottomY] = useState<string>("1680");

  const handleAdd = (): void => {
    const topY = parsePositiveInt(newZoneTopY, 1560);
    const bottomY = Math.max(topY + 40, parsePositiveInt(newZoneBottomY, topY + 120));
    onAddProtectedZone({
      id: `${newZoneKind}-${protectedZones.length + 1}`,
      kind: newZoneKind,
      topY,
      bottomY,
    });
  };

  return (
    <details className="mt-4 rounded-2xl border border-line bg-panel/35 p-4">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-bold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span>
          {bt(
            `말풍선·얼굴 안전 절단 보호 구간 (${protectedZones.length}곳) 및 분할 미리보기`,
            `Protected zones (${protectedZones.length}) & slice preview`,
          )}
        </span>
        <span className="text-xs font-semibold text-fg-3">
          {bt(
            `${totalSliceCount}조각 · 안전 보정 ${totalAdjustedCutCount}곳`,
            `${totalSliceCount} slices · ${totalAdjustedCutCount} adjusted`,
          )}
        </span>
      </summary>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <select
          aria-label={bt("보호 구간 유형", "Protected zone kind")}
          value={newZoneKind}
          onChange={(event) =>
            setNewZoneKind(event.target.value as "speech-bubble" | "character-face")
          }
          className={INPUT_CLASS}
        >
          <option value="speech-bubble">{bt("말풍선 보호", "Speech bubble")}</option>
          <option value="character-face">{bt("캐릭터 얼굴 보호", "Character face")}</option>
        </select>
        <input
          type="number"
          min={0}
          aria-label={bt("보호 시작 Y (px)", "Zone top Y (px)")}
          value={newZoneTopY}
          onChange={(event) => setNewZoneTopY(event.target.value)}
          className={INPUT_CLASS}
        />
        <input
          type="number"
          min={1}
          aria-label={bt("보호 끝 Y (px)", "Zone bottom Y (px)")}
          value={newZoneBottomY}
          onChange={(event) => setNewZoneBottomY(event.target.value)}
          className={INPUT_CLASS}
        />
        <button
          type="button"
          data-testid="delivery-add-protected-zone"
          onClick={handleAdd}
          className={buttonClass({
            variant: "outline",
            className: "mt-1 min-h-11 gap-1.5 motion-reduce:transition-none",
          })}
        >
          <Plus size={15} aria-hidden="true" />
          {bt("보호 구간 추가", "Add zone")}
        </button>
      </div>

      {primaryEpisode ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-fg-3">
                <th className="py-2 pr-3 font-semibold">{bt("파일명", "File name")}</th>
                <th className="py-2 pr-3 font-semibold">{bt("규격", "Dimensions")}</th>
                <th className="py-2 pr-3 font-semibold">{bt("구간(Y)", "Y Range")}</th>
                <th className="py-2 pr-3 font-semibold">{bt("예상 용량", "Est. size")}</th>
                <th className="py-2 font-semibold">{bt("절단 판정", "Cut status")}</th>
              </tr>
            </thead>
            <tbody>
              {primaryEpisode.slices.slice(0, 12).map((slice) => (
                <tr key={slice.fileName} className="border-b border-line/60 text-fg-2">
                  <td className="py-2 pr-3 font-mono font-semibold text-fg">{slice.fileName}</td>
                  <td className="py-2 pr-3">{`${slice.widthPx} × ${slice.heightPx}px`}</td>
                  <td className="py-2 pr-3">{`${slice.yStartPx}–${slice.yEndPx}px`}</td>
                  <td className="py-2 pr-3">{formatMbLabel(slice.estimatedBytes)}</td>
                  <td className="py-2">
                    {slice.adjusted
                      ? bt("안전 여백 이동 (보호 구간 회피)", "Shifted around protected zone")
                      : slice.cutReason === "forced-max-height"
                        ? bt("최대 높이 제약으로 분할됨", "Forced by max slice height")
                        : bt("정상 분할", "Standard cut")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </details>
  );
}
