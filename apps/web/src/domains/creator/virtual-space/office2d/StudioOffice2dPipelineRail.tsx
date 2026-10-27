import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import { toonHqPipelineRooms, type ToonHqRoom } from "./hq/toon-hq-blueprint";

/**
 * 웹툰 제작 공정 바(화면 위 가운데). 콘티 → 작화 → 채색 → 배경 → 식자 → 검수 → 연재 순서로 방을 잇고,
 * 누르면 그 방으로 걸어가거나(가까우면) 바로 이동한다(멀면). 지금 있는 방은 aria-current로 알리고, 앞선 공정은 완료 톤으로 보인다.
 */
export function StudioOffice2dPipelineRail({ currentRoomId, bridge }: {
  readonly currentRoomId: string | null;
  readonly bridge: StudioVirtualSpaceEngineBridge;
}) {
  const bt = useBilingual("StudioOffice2dPipelineRail");
  const pipeline = toonHqPipelineRooms();
  const currentStep = pipeline.find((room) => room.id === currentRoomId)?.pipelineStep ?? null;
  const go = (room: ToonHqRoom) => {
    bridge.requestMove(room.spawn);
    bridge.focusWorld();
  };

  return (
    <nav className="studio-office2d-pipeline" aria-label={bt("웹툰 제작 공정 바로 가기", "Webtoon production pipeline shortcuts")}>
      <ol className="studio-office2d-pipeline__steps">
        {pipeline.map((room) => {
          const step = room.pipelineStep ?? 0;
          const state = currentStep === null ? "idle" : step < currentStep ? "done" : step === currentStep ? "current" : "next";
          return (
            <li key={room.id} className="studio-office2d-pipeline__item" data-state={state}>
              <button
                type="button"
                className="studio-office2d-pipeline__step"
                aria-current={state === "current" ? "location" : undefined}
                aria-label={bt(`${step + 1}단계 ${room.pipelineKo ?? room.labelKo} · ${room.labelKo}로 이동`, `Step ${step + 1} ${room.pipelineEn ?? room.labelEn} · go to ${room.labelEn}`)}
                title={bt(room.labelKo, room.labelEn)}
                onClick={() => go(room)}
              >
                <span className="studio-office2d-pipeline__index" aria-hidden="true">{step + 1}</span>
                <span className="studio-office2d-pipeline__label" aria-hidden="true">{bt(room.pipelineShortKo ?? room.labelKo, room.pipelineShortEn ?? room.labelEn)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
