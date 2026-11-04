import { Layers, Map as MapIcon, Pin, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { spaceKoParticle } from "../hud/space-korean";
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import { toonHqPipelineRooms, type ToonHqRoom } from "./hq/toon-hq-blueprint";

/**
 * 웹툰 제작 공정 바(화면 위 가운데). 콘티 → 작화 → 채색 → 배경 → 식자 → 검수 → 연재 순서로 방을 잇고,
 * 누르면 그 방으로 걸어가거나(가까우면) 바로 이동한다(멀면). 지금 있는 방은 aria-current로 알리고, 앞선 공정은 완료 톤으로 보인다.
 * 우측에는 현재 구역의 라이브 워크스테이션 협업창(레드라인·컷 칸반·3D 턴테이블/SFX), 내 지정석(SoWork SetMyWorkSpotModal),
 * 평면도(Schematic) 토글, 공간음(Gather LeakyDesks / WA Ducking) 토글을 둔다.
 * 휴대폰 세로 화면에서는 가로로 밀어 넘기는 칩 줄이 되고, 지금 공정 칩이 줄 가운데로 오도록 스크롤한다.
 */
export function StudioOffice2dPipelineRail({
  currentRoomId,
  bridge,
  schematicMode = false,
  soundMuted = false,
  onToggleSchematic,
  onOpenWorkstation,
  onMyDeskAction,
  onToggleSound,
}: {
  readonly currentRoomId: string | null;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly schematicMode?: boolean;
  readonly soundMuted?: boolean;
  readonly onToggleSchematic?: () => void;
  readonly onOpenWorkstation?: () => void;
  readonly onMyDeskAction?: () => void;
  readonly onToggleSound?: () => void;
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
    <nav className="studio-office2d-pipeline" aria-label={bt("웹툰 제작 공정 바로 가기", "Webtoon production pipeline shortcuts")} data-space-interactive="true">
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
                aria-label={bt(`${step + 1}단계 ${room.pipelineKo ?? room.labelKo} · ${spaceKoParticle(room.labelKo, "으로")} 이동`, `Step ${step + 1} ${room.pipelineEn ?? room.labelEn} · go to ${room.labelEn}`)}
                title={bt(room.labelKo, room.labelEn)}
                onClick={() => go(room)}
              >
                <span className="studio-office2d-pipeline__index" aria-hidden="true">{step + 1}</span>
                <span className="studio-office2d-pipeline__label" aria-hidden="true">{bt(room.pipelineShortKo ?? room.labelKo, room.pipelineShortEn ?? room.labelEn)}</span>
              </button>
            </li>
          );
        })}
        {onOpenWorkstation ? (
          <li className="studio-office2d-pipeline__item studio-office2d-pipeline__item--tool">
            <button
              type="button"
              data-testid="office2d-open-workstation-modal-btn"
              className="studio-office2d-pipeline__step studio-office2d-pipeline__step--action"
              aria-label={bt("현재 구역 워크스테이션 라이브 협업창 열기", "Open live workstation collaboration studio")}
              title={bt("워크스테이션 라이브 협업창 (레드라인 · 컷 칸반 · 3D 턴테이블/SFX)", "Workstation Live Studio (Redline · Cut Kanban · 3D Turntable/SFX)")}
              onClick={onOpenWorkstation}
            >
              <Layers size={14} aria-hidden="true" />
              <span className="studio-office2d-pipeline__label">{bt("협업창", "Studio")}</span>
            </button>
          </li>
        ) : null}
        {onMyDeskAction ? (
          <li className="studio-office2d-pipeline__item studio-office2d-pipeline__item--tool">
            <button
              type="button"
              data-testid="office2d-my-desk-btn"
              className="studio-office2d-pipeline__step studio-office2d-pipeline__step--desk"
              aria-keyshortcuts="H"
              aria-label={bt("내 지정석으로 이동, 다른 좌석에 앉아 있으면 그 좌석을 지정석으로 저장 (H)", "Go to my desk, or save the current seat as my desk while seated (H)")}
              title={bt("내 자리로 이동 · 앉은 좌석을 내 자리로 저장 (단축키 H)", "Go to my desk · save current seat as my desk (H)")}
              onClick={onMyDeskAction}
            >
              <Pin size={14} aria-hidden="true" />
              <span className="studio-office2d-pipeline__label">{bt("내 자리", "My Desk")}</span>
            </button>
          </li>
        ) : null}
        {onToggleSchematic ? (
          <li className="studio-office2d-pipeline__item studio-office2d-pipeline__item--tool">
            <button
              type="button"
              data-testid="office2d-toggle-schematic-btn"
              className="studio-office2d-pipeline__step studio-office2d-pipeline__step--schematic"
              aria-pressed={schematicMode}
              aria-label={bt("스튜디오 평면도 오버뷰 전환", "Toggle studio schematic overview")}
              title={bt("스튜디오 전체 평면도 보기 · 방이나 좌석을 클릭하여 이동", "Toggle schematic overview · click any room or seat to move there")}
              onClick={onToggleSchematic}
            >
              <MapIcon size={14} aria-hidden="true" />
              <span className="studio-office2d-pipeline__label">{bt("평면도", "Plan")}</span>
            </button>
          </li>
        ) : null}
        {onToggleSound ? (
          <li className="studio-office2d-pipeline__item studio-office2d-pipeline__item--tool">
            <button
              type="button"
              data-testid="office2d-toggle-sound-btn"
              className="studio-office2d-pipeline__step studio-office2d-pipeline__step--sound"
              aria-pressed={!soundMuted}
              aria-label={bt(soundMuted ? "스튜디오 공간 음향 켜기" : "스튜디오 공간 음향 끄기", soundMuted ? "Unmute studio spatial audio" : "Mute studio spatial audio")}
              title={bt("방 이동과 이모트·지정석 동작의 효과음 켜기/끄기", "Toggle sound cues for room changes, emotes and desk actions")}
              onClick={onToggleSound}
            >
              {soundMuted ? <VolumeX size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
              <span className="studio-office2d-pipeline__label">{bt(soundMuted ? "음소거" : "공간음", soundMuted ? "Muted" : "Audio")}</span>
            </button>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
