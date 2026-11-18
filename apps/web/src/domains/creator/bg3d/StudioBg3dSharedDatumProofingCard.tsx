import { Compass, Eye, Layers } from "lucide-react";

import {
  CROSS_GENRE_DATUM_PROFILES,
  SHARED_ARCHITECTURAL_DATUM_SPEC,
  type CrossGenreDatumGenreId,
  type DarkroomProofingState,
  type GenreCutDensityRejectionRoiResult,
} from "./studio-bg3d-shared-datum-proofing";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export interface StudioBg3dSharedDatumProofingCardProps {
  readonly disabled?: boolean;
  readonly selectedDatumGenreId: CrossGenreDatumGenreId;
  readonly rejectionRoiReport: GenreCutDensityRejectionRoiResult;
  readonly darkroomProofingState: DarkroomProofingState;
  readonly onSelectDatumGenreId: (genreId: CrossGenreDatumGenreId) => void;
  readonly onToggleDarkroomProofing: (enabled: boolean) => void;
}

export function StudioBg3dSharedDatumProofingCard({
  disabled = false,
  selectedDatumGenreId,
  rejectionRoiReport,
  darkroomProofingState,
  onSelectDatumGenreId,
  onToggleDarkroomProofing,
}: StudioBg3dSharedDatumProofingCardProps) {
  return (
    <div
      data-testid="bg3d-blender-shared-datum-panel"
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <Compass size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>
            공통 건축 기준선(Datum) 5대 장르 브리지 V19 · 암실 컬러 검수 · 마감 반려율 ROI
          </span>
        </span>

        <button
          type="button"
          disabled={disabled}
          aria-pressed={darkroomProofingState.enabled}
          data-testid="bg3d-blender-darkroom-proofing-toggle"
          onClick={() => onToggleDarkroomProofing(!darkroomProofingState.enabled)}
          className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1 font-mono text-xs font-medium tabular-nums ${
            darkroomProofingState.enabled
              ? "border-accent bg-[#141415] text-[#f2f2f3]"
              : "border-line bg-panel text-fg-2 hover:bg-raised"
          } ${MOTION_PRESS}`}
        >
          <Eye size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
          <span>
            {darkroomProofingState.enabled ? "암실 검수 ON (ΔE 0.0)" : "무채색 암실 검수 모드"}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-2.5 py-2 lg:col-span-5">
          <img
            src={rejectionRoiReport.profile.previewUrl}
            alt={rejectionRoiReport.profile.labelKo}
            loading="lazy"
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full bg-[#4cc38a]" aria-hidden />
              <span className="truncate font-medium text-fg">
                {rejectionRoiReport.profile.labelKo} ({rejectionRoiReport.profile.assetVersionTag})
              </span>
            </div>
            <span className="mt-0.5 block font-mono text-xs tabular-nums text-fg-3">
              개구부 {SHARED_ARCHITECTURAL_DATUM_SPEC.portalClearanceM.toFixed(2)}m · 난간{" "}
              {SHARED_ARCHITECTURAL_DATUM_SPEC.safetyRailingHeightM.toFixed(2)}m · 콘솔{" "}
              {SHARED_ARCHITECTURAL_DATUM_SPEC.deskConsoleHeightM.toFixed(2)}m · 단차{" "}
              {SHARED_ARCHITECTURAL_DATUM_SPEC.stairRiserHeightM.toFixed(2)}m
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 lg:col-span-7 lg:justify-end">
          {CROSS_GENRE_DATUM_PROFILES.map((genre) => {
            const active = genre.id === selectedDatumGenreId;
            return (
              <button
                key={genre.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-datum-genre-${genre.id}`}
                onClick={() => onSelectDatumGenreId(genre.id)}
                className={`min-h-9 rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } ${MOTION_PRESS}`}
              >
                {genre.labelKo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel/60 px-3 py-2 font-mono text-xs tabular-nums">
        <span
          data-testid="bg3d-blender-rejection-roi-readout"
          className="inline-flex items-center gap-2 text-fg"
        >
          <Layers size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span>{rejectionRoiReport.summaryKo}</span>
        </span>
        <span data-testid="bg3d-blender-darkroom-status" className="text-fg-3">
          {darkroomProofingState.summaryKo} · 카메라 눈높이 오차{" "}
          {rejectionRoiReport.cameraTransferDriftMeters.toFixed(2)}m
        </span>
      </div>
    </div>
  );
}
