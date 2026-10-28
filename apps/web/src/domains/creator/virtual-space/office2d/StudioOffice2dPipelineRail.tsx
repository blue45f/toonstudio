import { useEffect, useRef } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import { toonHqPipelineRooms, type ToonHqRoom } from "./hq/toon-hq-blueprint";

/**
 * 웹툰 제작 공정 바(화면 위 가운데). 콘티 → 작화 → 채색 → 배경 → 식자 → 검수 → 연재 순서로 방을 잇고,
 * 누르면 그 방으로 걸어가거나(가까우면) 바로 이동한다(멀면). 지금 있는 방은 aria-current로 알리고, 앞선 공정은 완료 톤으로 보인다.
 * 휴대폰 세로 화면에서는 가로로 밀어 넘기는 칩 줄이 되고, 지금 공정 칩이 줄 가운데로 오도록 스크롤한다.
 */
export function StudioOffice2dPipelineRail({ currentRoomId, bridge }: {
  readonly currentRoomId: string | null;
  readonly bridge: StudioVirtualSpaceEngineBridge;
}) {
  const bt = useBilingual("StudioOffice2dPipelineRail");
  const listRef = useRef<HTMLOListElement | null>(null);
  const pipeline = toonHqPipelineRooms();
  const currentStep = pipeline.find((room) => room.id === currentRoomId)?.pipelineStep ?? null;
  const go = (room: ToonHqRoom) => {
    bridge.requestMove(room.spawn);
    bridge.focusWorld();
  };

  // 칩 줄이 넘칠 때만(휴대폰 세로) 지금 공정 칩을 가운데로 가져온다. 문서 스크롤은 건드리지 않도록 목록 안에서만 움직인다.
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth + 1) return;
    const current = list.querySelector<HTMLElement>("[aria-current='location']");
    if (!current) return;
    const target = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof list.scrollTo === "function") list.scrollTo({ left: Math.max(0, target), behavior: reduced ? "auto" : "smooth" });
  }, [currentStep]);

  return (
    <nav className="studio-office2d-pipeline" aria-label={bt("웹툰 제작 공정 바로 가기", "Webtoon production pipeline shortcuts")}>
      <ol ref={listRef} className="studio-office2d-pipeline__steps">
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
