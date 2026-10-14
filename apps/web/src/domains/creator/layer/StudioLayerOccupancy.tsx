/**
 * 레이어 패널 점유 표시: 행 배지 + 내 레이어 충돌 경고.
 *
 * 상태는 이 컴포넌트들이 갖지 않는다. 점유 항목은 (b) 전송 계층(서버 채널
 * 또는 같은 브라우저 BroadcastChannel)이 `studio-layer-occupancy` 모델로
 * 합쳐 호스트가 보관하고, 여기서는 점유자 한 명分の 도출값만 받아 그린다.
 *
 * - 행 배지: 남이 만지는 중인 레이어에만 잠금 아이콘 + 이름을 단다. 내가
 *   만지는 중이면 잠금이 아닌 펜 배지로 구분한다 — 레이어 자체의 잠금
 *   (layer.locked, 사용자가 거는 잠금)과 남의 점유를 혼동하면 안 되기
 *   때문이다. 점유 배지는 채워진 경고색 칩이라 기존 잠금 토글 아이콘과
 *   모양·색이 모두 다르다.
 * - 충돌 경고: 내가 작업 중인 레이어와 겹칠 때만 패널 위에 한 번 뜬다.
 *   남의 레이어 점유 전부를 경고로 올리면 소음이 되므로, 경고는 모델의
 *   deriveMyLayerConflicts 결과(내 작업 맥락과 겹친 것만)를 받는다.
 */

import { LockKeyhole, PenLine, TriangleAlert } from "lucide-react";

import {
  layerOccupancyRowState,
  type LayerConflictWarning,
  type LayerOccupancyEntry,
} from "./studio-layer-occupancy";

import { cn } from "@/shared/lib/utils";

export interface StudioLayerOccupancyBadgeProps {
  /** 이 레이어의 점유자(모델 derive 결과). 없으면 아무것도 그리지 않는다. */
  readonly holder: LayerOccupancyEntry | null;
  /** 로그인 사용자와 연결된 참여 배정 ID. */
  readonly selfActorId: string | null;
  readonly className?: string;
}

export function StudioLayerOccupancyBadge({
  holder,
  selfActorId,
  className,
}: StudioLayerOccupancyBadgeProps) {
  const state = layerOccupancyRowState(holder, selfActorId);
  if (state === "free" || !holder) return null;

  if (state === "mine") {
    return (
      <span
        data-layer-occupancy="mine"
        className={cn(
          "inline-flex min-h-5 shrink-0 items-center gap-1 rounded-full border border-line bg-panel px-1.5 py-0.5 text-[10px] font-semibold text-fg-2",
          className,
        )}
        title="내가 이 레이어를 편집 중입니다"
      >
        <PenLine className="size-3" aria-hidden="true" />
        편집 중
      </span>
    );
  }

  return (
    <span
      data-layer-occupancy="other"
      className={cn(
        "inline-flex min-h-5 shrink-0 items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-fg",
        className,
      )}
      title={`${holder.displayName}님이 이 레이어를 편집 중입니다. 동시에 고치면 한쪽 작업이 덮일 수 있어요.`}
    >
      <LockKeyhole className="size-3 shrink-0 text-warn" aria-hidden="true" />
      <span className="max-w-20 truncate">{holder.displayName}</span>
      <span className="sr-only">님이 이 레이어를 편집 중입니다</span>
    </span>
  );
}

export interface StudioLayerConflictNoticeProps {
  /** deriveMyLayerConflicts 결과. 비어 있으면 아무것도 그리지 않는다. */
  readonly warnings: readonly LayerConflictWarning[];
  /** layerId → 사람이 읽는 레이어 이름. 없거나 모르는 ID는 "레이어"로만 말한다. */
  readonly layerNames?: Readonly<Record<string, string>>;
  readonly className?: string;
}

function conflictText(
  warning: LayerConflictWarning,
  layerNames: Readonly<Record<string, string>> | undefined,
): string {
  const name = layerNames?.[warning.layerId];
  const layerLabel = name ? `'${name}' 레이어` : "내 레이어";
  return warning.kind === "my-layer-taken"
    ? `${warning.other.displayName}님이 지금 ${layerLabel}를 편집 중입니다. 같은 레이어를 동시에 고치면 한쪽 작업이 덮일 수 있어요.`
    : `${warning.other.displayName}님이 내가 편집 중인 ${layerLabel}를 만지기 시작했습니다. 잠시 이 레이어 작업을 멈추고 서로 확인해 주세요.`;
}

export function StudioLayerConflictNotice({
  warnings,
  layerNames,
  className,
}: StudioLayerConflictNoticeProps) {
  if (warnings.length === 0) return null;
  return (
    <div
      data-layer-conflict="true"
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-xl border border-warn/35 bg-warn/10 px-3 py-2",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
      <div className="min-w-0 text-[11px] font-medium leading-5 text-fg">
        {warnings.length === 1 ? (
          <p>{conflictText(warnings[0]!, layerNames)}</p>
        ) : (
          <ul className="list-none space-y-0.5">
            {warnings.map((warning) => (
              <li key={`${warning.layerId}::${warning.kind}::${warning.other.actorId}`}>
                {conflictText(warning, layerNames)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
