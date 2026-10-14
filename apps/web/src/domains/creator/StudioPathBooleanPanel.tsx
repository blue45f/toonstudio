/**
 * Studio Path Boolean Panel
 * 도형 결합(벡터 패스 불리언) 컨트롤 — 선택한 도형 2개를 합치기/빼기/교차/제외로
 * 하나의 벡터 패스(freehand DrawEl)로 결합한다. 실제 지오메트리 연산은 전용 Worker의
 * CanvasKit PathOps가 담당한다. 이 Worker가 실패하면 원본을 보존한 채 사용 불가로
 * 종료하며 다른 boolean provider를 자동 실행하지 않는다. 문서 권위·단일 Undo 커밋은
 * StudioPage가 유지한다.
 *
 * 완전히 controlled — 내부 비즈니스 상태 없음(StudioExtendedBlendPanel 과 동일 관례).
 * 무장(armed) 도구가 아니라 캔버스 제스처를 바꾸지 않는다 — disarm 연동 불필요.
 *
 * 빠른 결합(다각형) 섹션(선택) — 호스트가 넘길 때만 렌더되는 명시 선택 경로다.
 * 기본 버튼들은 언제나 위 CanvasKit Worker 경로만 호출하고, 이 섹션의 버튼을
 * 사용자가 직접 눌렀을 때만 동기 다각형 엔진(studio-pathfinder-boolean-adapter)이
 * 실행된다. Worker 실패 시 이 섹션으로 자동 폴백하는 일은 없다.
 */
import { Combine, Expand, Loader2, Zap } from "lucide-react";

import { PANEL_CHIP_CLASS, PANEL_LABEL_ROW, PANEL_RANGE_CLASS } from "./studio-panel-ui";
import { STUDIO_PATH_BOOLEAN_OPS, type StudioPathBooleanOp } from "./studio-path-boolean";
import {
  STUDIO_PATHFINDER_JOIN_STYLES,
  STUDIO_PATHFINDER_OFFSET_MAX,
  STUDIO_PATHFINDER_OFFSET_MIN,
  STUDIO_PATHFINDER_OFFSET_STEP,
  clampStudioPathfinderOffsetRadius,
  studioPathfinderOffsetUnavailableReason,
  type StudioPathfinderOffsetRequest,
} from "./studio-pathfinder-offset-panel-model";
import type { StudioPathfinderJoinStyle } from "./studio-pathfinder-vector-engine";

import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * 윤곽 오프셋 섹션(선택) — 호스트가 넘길 때만 렌더된다.
 * 넘기지 않으면 기존 도형 결합 패널과 픽셀·동작이 동일하다(기존 테스트 무변경 통과).
 * 실제 오프셋 계산·커밋은 호스트가 파사드(runStudioPathfinderOffset)로 수행한다.
 */
export type StudioPathBooleanOffsetSectionProps = {
  /** 현재 오프셋 거리(px) — controlled. */
  radius: number;
  /** 현재 코너 조인 방식 — controlled. */
  join: StudioPathfinderJoinStyle;
  busy?: boolean;
  /** 호스트 게이트 사유(선택 도형 없음 등) — 있으면 적용을 잠그고 보여준다. */
  unavailableReason?: string | null;
  onRadiusChange: (radius: number) => void;
  onJoinChange: (join: StudioPathfinderJoinStyle) => void;
  /** 적용 1회 — 호스트가 선택 도형에 오프셋을 실행·커밋한다. */
  onApply: (request: StudioPathfinderOffsetRequest) => void;
};

/**
 * 빠른 결합(다각형) 섹션(선택) — 호스트가 넘길 때만 렌더된다.
 * 넘기지 않으면 기존 도형 결합 패널과 픽셀·동작이 동일하다(기존 테스트 무변경 통과).
 * 이 섹션의 버튼은 기본 결합과 별개 콜백(onApply)으로만 나가며, 호스트는 이를
 * 동기 다각형 엔진 전용 명령(applyPathBooleanCombineSync)에 연결한다.
 */
export type StudioPathBooleanFastCombineSectionProps = {
  /** 빠른 결합 진행 중 — 이 섹션 버튼만 잠근다(기본 결합 busy 와 독립 표기 가능). */
  busy?: boolean;
  /** 호스트 게이트 사유 — 있으면 이 섹션 버튼을 잠그고 보여준다. */
  unavailableReason?: string | null;
  /** 연산 1개 적용 — 동기 다각형 결합·커밋은 StudioPage 가 수행. */
  onApply: (op: StudioPathBooleanOp) => void;
};

export type StudioPathBooleanPanelProps = {
  /** 결합 연산 진행 중 — 모든 버튼을 잠근다(확장 블렌드 병합과 동일 관례). */
  busy?: boolean;
  /**
   * 적용 불가 사유 — 있으면 버튼을 잠그고 사유를 보여준다
   * (면이 있는 그리기 도형 정확히 2개를 함께 선택해야 한다).
   */
  unavailableReason?: string | null;
  /** 연산 1개 적용 — 실제 결합·커밋은 StudioPage 가 수행. */
  onApply: (op: StudioPathBooleanOp) => void;
  /** 윤곽 오프셋 섹션 — 없으면 렌더하지 않는다. */
  offsetSection?: StudioPathBooleanOffsetSectionProps | null;
  /** 빠른 결합(다각형) 섹션 — 없으면 렌더하지 않는다. */
  fastCombineSection?: StudioPathBooleanFastCombineSectionProps | null;
};

export function StudioPathBooleanPanel({
  busy = false,
  unavailableReason = null,
  onApply,
  offsetSection = null,
  fastCombineSection = null,
}: StudioPathBooleanPanelProps): ReactElement {
  const applyDisabled = busy || Boolean(unavailableReason);
  const statusText = busy
    ? "Skia 고품질 경로로 도형을 결합하는 중..."
    : unavailableReason
      ?? "선택한 도형 2개를 곡선 품질을 유지해 하나의 벡터 패스로 결합합니다(⌘Z로 한 번에 되돌리기). 빼기는 아래 도형에서 위 도형을 오려냅니다. 그라데이션·패턴 채우기는 결과에서 단색 채우기로 바뀝니다.";

  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          <Combine size={12} aria-hidden />
          도형 결합
        </p>
        {busy && <Loader2 size={13} className="animate-spin text-accent" aria-hidden />}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {STUDIO_PATH_BOOLEAN_OPS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onApply(entry.id)}
            disabled={applyDisabled}
            title={unavailableReason ?? entry.tip}
            className={cn(
              PANEL_CHIP_CLASS,
              "flex items-center justify-center gap-1",
              !applyDisabled && "border-accent/60 bg-accent-soft/40 text-fg"
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <p className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
        {statusText}
      </p>

      {fastCombineSection && (
        <StudioPathBooleanFastCombineSection section={fastCombineSection} panelBusy={busy} />
      )}

      {offsetSection && (
        <StudioPathBooleanOffsetSection section={offsetSection} panelBusy={busy} />
      )}
    </div>
  );
}

function StudioPathBooleanFastCombineSection({
  section,
  panelBusy,
}: {
  section: StudioPathBooleanFastCombineSectionProps;
  panelBusy: boolean;
}): ReactElement {
  const applyDisabled = panelBusy || Boolean(section.busy) || Boolean(section.unavailableReason);
  const fastStatus = section.busy
    ? "빠른 결합으로 도형을 결합하는 중..."
    : section.unavailableReason
      ?? "곡선을 다각형으로 근사해 즉시 결합합니다. 구멍·분리 영역도 결과에 그대로 남습니다. 기본 결합이 실패해도 이 경로가 자동으로 실행되지는 않습니다.";

  return (
    <div className="space-y-2 border-t border-line pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          <Zap size={12} aria-hidden />
          빠른 결합 (다각형)
        </p>
        {section.busy && <Loader2 size={13} className="animate-spin text-accent" aria-hidden />}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {STUDIO_PATH_BOOLEAN_OPS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => section.onApply(entry.id)}
            disabled={applyDisabled}
            title={section.unavailableReason ?? `${entry.tip} (다각형 근사·즉시 실행)`}
            aria-label={`빠른 결합으로 ${entry.label}`}
            className={cn(
              PANEL_CHIP_CLASS,
              "flex items-center justify-center gap-1",
              !applyDisabled && "border-accent/60 bg-accent-soft/40 text-fg"
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <p className="text-[0.72rem] leading-relaxed text-fg-3">{fastStatus}</p>
    </div>
  );
}

function StudioPathBooleanOffsetSection({
  section,
  panelBusy,
}: {
  section: StudioPathBooleanOffsetSectionProps;
  panelBusy: boolean;
}): ReactElement {
  const request: StudioPathfinderOffsetRequest = { radius: section.radius, join: section.join };
  const requestReason = studioPathfinderOffsetUnavailableReason(request);
  const reason = section.unavailableReason ?? requestReason;
  const applyDisabled = panelBusy || Boolean(section.busy) || Boolean(reason);
  const offsetStatus = section.busy
    ? "윤곽 오프셋을 적용하는 중..."
    : reason
      ?? "선택한 도형 1개의 윤곽을 지정한 거리만큼 바깥(+) 또는 안(−)으로 오프셋한 새 경로를 만듭니다(⌘Z로 한 번에 되돌리기).";

  return (
    <div className="space-y-2 border-t border-line pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          <Expand size={12} aria-hidden />
          윤곽 오프셋
        </p>
        {section.busy && <Loader2 size={13} className="animate-spin text-accent" aria-hidden />}
      </div>

      <label className={PANEL_LABEL_ROW}>
        <span>거리</span>
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={STUDIO_PATHFINDER_OFFSET_MIN}
            max={STUDIO_PATHFINDER_OFFSET_MAX}
            step={STUDIO_PATHFINDER_OFFSET_STEP}
            value={section.radius}
            disabled={panelBusy || section.busy}
            onChange={(event) =>
              section.onRadiusChange(clampStudioPathfinderOffsetRadius(Number(event.target.value)))
            }
            className={PANEL_RANGE_CLASS}
            aria-label="오프셋 거리"
          />
          <input
            type="number"
            min={STUDIO_PATHFINDER_OFFSET_MIN}
            max={STUDIO_PATHFINDER_OFFSET_MAX}
            step={STUDIO_PATHFINDER_OFFSET_STEP}
            value={section.radius}
            disabled={panelBusy || section.busy}
            onChange={(event) =>
              section.onRadiusChange(clampStudioPathfinderOffsetRadius(Number(event.target.value)))
            }
            className="w-16 rounded-md border border-line bg-card px-1.5 py-0.5 text-right text-[0.72rem] tabular-nums text-fg"
            aria-label="오프셋 거리 숫자 입력"
          />
        </span>
      </label>

      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="코너 잇기 방식">
        {STUDIO_PATHFINDER_JOIN_STYLES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => section.onJoinChange(entry.id)}
            disabled={panelBusy || section.busy}
            title={entry.tip}
            aria-pressed={section.join === entry.id}
            className={cn(
              PANEL_CHIP_CLASS,
              "flex items-center justify-center gap-1",
              section.join === entry.id && "border-accent/60 bg-accent-soft/40 text-fg"
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => section.onApply(request)}
        disabled={applyDisabled}
        className={cn(
          PANEL_CHIP_CLASS,
          "flex w-full items-center justify-center gap-1",
          !applyDisabled && "border-accent/60 bg-accent-soft/40 text-fg"
        )}
      >
        오프셋 적용
      </button>

      <p className="text-[0.72rem] leading-relaxed text-fg-3">{offsetStatus}</p>
    </div>
  );
}
