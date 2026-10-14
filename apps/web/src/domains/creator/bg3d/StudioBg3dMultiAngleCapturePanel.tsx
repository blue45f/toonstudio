import { Camera, Check, LayoutGrid } from "lucide-react";
import { useId, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_BG3D_CONTROL_BUTTON,
  studioBg3dClassNames as cx,
} from "./studio-bg3d-editor-ui";
import {
  captureStudioBg3dMultiAngleSet,
  insertStudioBg3dMultiAngleCandidate,
  listStudioBg3dMultiAngleCandidates,
  listStudioBg3dMultiAngleSets,
  type StudioBg3dMultiAngleCandidate,
  type StudioBg3dMultiAngleSetId,
} from "./studio-bg3d-multi-angle-capture";

import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

export interface StudioBg3dMultiAngleCapturePanelProps {
  readonly document: StudioBg3dSceneDocument;
  readonly disabled?: boolean;
  /**
   * 일괄 캡처 결과 문서(후보 샷 세트 추가, 카메라·활성 샷은 캡처 전 그대로)를
   * 호스트가 한 번의 커밋으로 반영한다. 부분 캡처 콜백은 받지 않는다.
   */
  readonly onBatchCaptured: (document: StudioBg3dSceneDocument) => void;
  /** 후보 선택 → 삽입: 후보 샷이 적용(활성)된 문서를 호스트가 한 번에 반영한다. */
  readonly onInsertCandidate: (document: StudioBg3dSceneDocument) => void;
}

/** 위에서 본 카메라 위치 다이어그램: 가운데 점이 타깃, 바깥 점이 후보 카메라(방위각 위치). */
function CandidateAngleThumbnail({
  candidate,
  selected,
}: {
  readonly candidate: StudioBg3dMultiAngleCandidate;
  readonly selected: boolean;
}) {
  const azimuth = (candidate.azimuthDeg * Math.PI) / 180;
  const radius = 26;
  const cameraX = 40 + Math.sin(azimuth) * radius;
  const cameraY = 34 + Math.cos(azimuth) * radius;
  return (
    <span
      className="relative block h-16 w-full overflow-hidden rounded-md border border-line/60"
      aria-hidden
    >
      <svg viewBox="0 0 80 68" className="h-full w-full">
        <circle
          cx={40}
          cy={34}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.25}
        />
        <line
          x1={40}
          y1={34}
          x2={cameraX}
          y2={cameraY}
          stroke="currentColor"
          strokeOpacity={0.5}
          strokeDasharray="3 3"
        />
        <circle cx={40} cy={34} r={4} fill="currentColor" fillOpacity={0.85} />
        <circle
          cx={cameraX}
          cy={cameraY}
          r={5}
          fill={selected ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.5}
        />
      </svg>
    </span>
  );
}

export function StudioBg3dMultiAngleCapturePanel({
  document,
  disabled = false,
  onBatchCaptured,
  onInsertCandidate,
}: StudioBg3dMultiAngleCapturePanelProps) {
  const id = useId().replaceAll(":", "");
  const copy = useBilingual("bg3d-multi-angle-capture");
  const sets = listStudioBg3dMultiAngleSets();
  const [setId, setSetId] = useState<StudioBg3dMultiAngleSetId>("basic-4");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const batchSeqRef = useRef(0);

  const candidates = batchId
    ? listStudioBg3dMultiAngleCandidates(document, batchId)
    : [];
  const activeSet = sets.find((set) => set.id === setId) ?? sets[0];

  const capture = () => {
    batchSeqRef.current += 1;
    const nextBatchId = `ma-${setId}-${batchSeqRef.current}`;
    const result = captureStudioBg3dMultiAngleSet(document, setId, nextBatchId);
    if (!result) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setBatchId(nextBatchId);
    onBatchCaptured(result.document);
  };

  const insert = (candidate: StudioBg3dMultiAngleCandidate) => {
    const applied = insertStudioBg3dMultiAngleCandidate(document, candidate.shotId);
    if (applied) onInsertCandidate(applied);
  };

  return (
    <section
      data-testid="bg3d-multi-angle-capture"
      aria-labelledby={`${id}-title`}
      className="mt-4 rounded-lg border border-line bg-card/45 px-3 pb-3 pt-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <LayoutGrid size={13} aria-hidden />
            {copy("임의 각도 일괄 캡처", "Multi-angle batch capture")}
          </h3>
          <p className="mt-0.5 text-[0.625rem] leading-relaxed text-fg-3">
            {copy(
              "지금 포즈·씬을 각도 세트 전체로 한 번에 뽑아 컷 후보로 제시합니다. 후보를 고르면 그 각도가 컷으로 삽입됩니다.",
              "Capture the current pose and scene across a whole angle set at once, then pick a candidate to insert it as a cut.",
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-panel px-2 py-1 text-[0.5625rem] font-semibold text-fg-3">
          {copy("한 번에 캡처", "One-shot batch")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={copy("각도 세트", "Angle set")}>
        {sets.map((set) => (
          <button
            key={set.id}
            type="button"
            aria-pressed={setId === set.id}
            disabled={disabled}
            data-testid={`bg3d-multi-angle-set-${set.id}`}
            onClick={() => setSetId(set.id)}
            className={cx(
              STUDIO_BG3D_CONTROL_BUTTON,
              setId === set.id
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            {copy(set.labelKo, set.labelEn)}
          </button>
        ))}
      </div>
      {activeSet ? (
        <p className="mt-1.5 text-[0.625rem] leading-relaxed text-fg-3">
          {copy(activeSet.descriptionKo, activeSet.descriptionEn)}
        </p>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        data-testid="bg3d-multi-angle-capture-run"
        onClick={capture}
        className={cx(
          STUDIO_BG3D_CONTROL_BUTTON,
          "mt-2 w-full border-accent bg-accent text-on-accent hover:opacity-90",
        )}
      >
        <Camera size={14} aria-hidden />
        {copy(
          `${activeSet?.labelKo ?? ""} 한 번에 캡처`,
          `Capture ${activeSet?.labelEn ?? ""} at once`,
        )}
      </button>
      {failed ? (
        <p role="status" className="mt-1.5 text-[0.625rem] leading-relaxed text-fg-3">
          {copy(
            "캡처하지 못했습니다. 컷 수가 상한(64)에 닿았거나 같은 배치가 이미 있으면 일부를 정리한 뒤 다시 시도하세요.",
            "Capture failed. The 64-cut limit may be reached or this batch may already exist — remove some cuts and try again.",
          )}
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <div
          className="mt-3 grid grid-cols-2 gap-2"
          role="group"
          aria-label={copy("컷 후보", "Cut candidates")}
        >
          {candidates.map((candidate) => {
            const selected = document.activeShotId === candidate.shotId;
            return (
              <button
                key={candidate.shotId}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                data-testid={`bg3d-multi-angle-candidate-${candidate.angleId}`}
                onClick={() => insert(candidate)}
                className={cx(
                  "rounded-lg border p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
                  selected
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <CandidateAngleThumbnail candidate={candidate} selected={selected} />
                <span className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[0.6875rem] font-semibold">
                    {copy(candidate.labelKo, candidate.labelEn)}
                  </span>
                  {selected ? <Check size={13} aria-hidden /> : null}
                </span>
                <span className="mt-0.5 block text-[0.5625rem] tabular-nums text-fg-3">
                  {copy(
                    `방위 ${Math.round(candidate.azimuthDeg)}° · 고도 ${Math.round(candidate.elevationDeg)}°`,
                    `Azimuth ${Math.round(candidate.azimuthDeg)}° · Elevation ${Math.round(candidate.elevationDeg)}°`,
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : batchId ? (
        <p role="status" className="mt-2 text-[0.625rem] leading-relaxed text-fg-3">
          {copy(
            "캡처된 후보가 여기에 그리드로 표시됩니다.",
            "Captured candidates appear here as a grid.",
          )}
        </p>
      ) : null}
    </section>
  );
}
