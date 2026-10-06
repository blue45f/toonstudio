/**
 * 상호작용 fx 런타임의 라이브 배선 브리지 (VS 120 웨이브 3 잔여).
 *
 * fx 런타임(StudioInteractionFxRuntime)은 완성돼 있었지만 프로덕션 어디에서도
 * 인스턴스화되지 않았다. 이 모듈은 캔버스가 fx와 주고받는 배선 계약을 한곳에 모은다:
 *
 * - 대사 주입: fx의 npcSay 콜백은 "point 근처 NPC 한 명"에게 말하게 하는 계약인데
 *   디렉터 잡담·인사 채널에는 외부 대사 주입점이 없었다. 여기서 반경 안 가장 가까운
 *   NPC를 골라 대사를 보관하고, 캔버스 NPC 렌더 루프가 인사·잡담보다 먼저 꺼내 쓴다.
 *   근처에 NPC가 없으면 아무것도 하지 않는다(fx 계약 그대로).
 * - 전파 적용: 프레즌스 스냅샷의 objectStates를 fx에 넣되, 같은 상태(같은
 *   stateChangedAt)는 다시 적용하지 않는다. 적용 자체는 fx의 applyRemoteObjectState가
 *   부수효과 없이 수행한다 — 원격 머신은 대사·알림·재전파를 만들지 않는다.
 * - 배치 고정물: 빌드 패널이 만든 배치 가구 목록을 fx 고정물 층에 동기화하고
 *   (syncPlacedFixtures), 가장 가까운 배치 가구를 상호작용 프롬프트 후보와
 *   활성 대상으로 제공한다. 프롬프트 라벨은 fx가 아는 현재 상태로 동사를 고른다
 *   ("켜기 · 플로어 램프"). 배치 목록의 소유는 패널·페이지 쪽이고, 이 브리지는
 *   마지막으로 동기화된 목록만 프롬프트·활성 판정에 쓴다.
 * - 정리: 공유 룸을 떠날 때 clearRemoteStates로 전파 머신을 초기 상태로 되돌리고
 *   적용 기록을 비운다. 피어가 나가는 경우도 같은 정리다 — pruneRemoteStates가
 *   상태를 보낸 세션이 현재 접속 집합에 없으면 자동으로 clearRemoteStates를 부른다.
 *   프레즌스 컨트롤러는 나간 피어의 오브젝트 상태를 스냅샷에 남기므로, 정리가
 *   없으면 상대가 나간 뒤에도 켜진 조명·추출 중인 커피가 화면에 남는다.
 *
 * 로컬 상태 전이 통지(onObjectStateChange)와 HUD 알림·자기 이모트는 sink로 그대로
 * 통과시킨다. 이 모듈은 Phaser를 모른다 — 런타임 생성은 캔버스가 팩토리로 넘긴다.
 */
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";
import {
  interactableInitialState,
  interactableStateActionText,
} from "./studio-virtual-space-interactable-objects";
import {
  type StudioInteractionFxCallbacks,
  type StudioInteractionFxObjectStateChange,
  type StudioInteractionFxRuntime,
} from "./studio-virtual-space-interaction-fx";
import type { StudioBuildPlacedFixture } from "./studio-virtual-space-build-mode-vitality";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceObjectState } from "./studio-virtual-space-presence-protocol";
import type { StudioWorldBilingualText } from "./studio-virtual-space-world-interaction-kinds";
import type { StudioWorldPromptCandidate } from "./studio-virtual-space-world-prompt";

/** 배치 가구의 프롬프트·활성 반경(px). 매니페스트 상호작용 반경(50~82)과 같은 결이다. */
export const STUDIO_PLACED_FIXTURE_PROMPT_RADIUS = 64;

/** npcSay가 대사를 붙일 수 있는 NPC 후보. 캔버스가 호출 때마다 최신 발밑 좌표를 읽어 넘긴다. */
export interface StudioInteractionFxLiveNpcCandidate {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
}

export interface StudioInteractionFxLiveSinks {
  /** 대사 만료 판정에 쓰는 캔버스 프레임 시계. */
  readonly now: () => number;
  /** HUD 알림(캔버스의 onSpaceUiEvent로 나간다). */
  readonly notify: (event: StudioSpaceUiEvent) => void;
  /** 내 머리 위 이모트(이 브라우저에서만 재생). */
  readonly selfEmote: (emote: StudioSpaceEmoteId) => void;
  /** 로컬 오브젝트 상태 전이 통지. 배선 측은 프레즌스 컨트롤러의 sendObjectState로 넘긴다. */
  readonly onObjectStateChange?: (change: StudioInteractionFxObjectStateChange) => void;
  /** 현재 월드의 NPC 후보들. npcSay가 불릴 때만 순회한다(쿨다운이 있어 드물다). */
  readonly npcCandidates: () => Iterable<StudioInteractionFxLiveNpcCandidate>;
}

export interface StudioInteractionFxLiveWiring {
  readonly runtime: StudioInteractionFxRuntime;
  /** 프레즌스 스냅샷의 전파 상태를 fx에 적용한다. 이미 적용한 상태는 건너뛴다. */
  syncObjectStates(states: readonly StudioVirtualSpaceObjectState[]): void;
  /**
   * fx가 주입한 NPC 대사가 지금 보여 줄 문장이면 돌려준다(인사·잡담보다 우선).
   * 만료된 대사는 이 호출에서 정리하고 null을 돌려준다.
   */
  npcLineFor(npcId: string, now: number): StudioWorldBilingualText | null;
  /** 전파로 적용한 머신 상태를 전부 초기 상태로 되돌리고 적용 기록을 비운다. */
  clearRemoteStates(now: number): void;
  /**
   * 현재 접속 중인 피어 세션 집합을 받아, 상태를 보낸 세션이 그 안에 없으면
   * (퇴장·연결 끊김) 그 원격 상태를 정리한다. 남은 피어의 상태는 건드리지 않는다.
   * 캔버스가 스냅샷 동기화 직후 매번 부른다.
   */
  pruneRemoteStates(presentSessionIds: ReadonlySet<string>, now: number): void;
  /**
   * 빌드 패널이 만든 배치 가구 목록을 fx 고정물 층에 맞춘다. 목록에서 사라진
   * 가구는 해제되고, 남은 가구의 상태는 유지된다(런타임 sync가 멱등하다).
   */
  syncPlacedFixtures(placed: readonly StudioBuildPlacedFixture[]): void;
  /**
   * 지점에서 프롬프트 반경 안에 있는 가장 가까운 배치 가구의 프롬프트 후보.
   * 라벨 동사는 fx의 현재 상태 기준이다. 없으면 null이다.
   */
  placedPromptCandidate(point: StudioVirtualSpacePoint): StudioWorldPromptCandidate | null;
  /**
   * 지점에서 가장 가까운 배치 가구를 토글한다(전이·전파·알림은 fx 경로 그대로).
   * 반경 안에 배치 가구가 없으면 false다.
   */
  activatePlacedFixtureNear(point: StudioVirtualSpacePoint, time: number): boolean;
}

interface InjectedLine {
  readonly text: StudioWorldBilingualText;
  readonly until: number;
}

export function createStudioInteractionFxLiveWiring(
  createRuntime: (callbacks: StudioInteractionFxCallbacks) => StudioInteractionFxRuntime,
  sinks: StudioInteractionFxLiveSinks,
): StudioInteractionFxLiveWiring {
  const lines = new Map<string, InjectedLine>();
  const applied = new Map<string, number>();
  /** 전파 상태를 보낸 세션들. pruneRemoteStates가 퇴장 판정에 쓴다. */
  const stateSenders = new Set<string>();
  /** 마지막으로 동기화된 배치 가구 목록. 프롬프트·활성 판정이 쓴다. */
  let placedFixtures: readonly StudioBuildPlacedFixture[] = [];

  const nearestPlacedFixture = (point: StudioVirtualSpacePoint): StudioBuildPlacedFixture | null => {
    let best: StudioBuildPlacedFixture | null = null;
    let bestGap = STUDIO_PLACED_FIXTURE_PROMPT_RADIUS;
    for (const fixture of placedFixtures) {
      const gap = Math.hypot(fixture.point.x - point.x, fixture.point.y - point.y);
      if (gap > bestGap) continue;
      bestGap = gap;
      best = fixture;
    }
    return best;
  };

  const clearRemote = (now: number): void => {
    runtime.clearRemoteObjectStates(now);
    applied.clear();
  };

  const runtime = createRuntime({
    npcSay: (point, radius, ko, en, durationMs) => {
      let bestId: string | null = null;
      let bestGap = radius;
      for (const candidate of sinks.npcCandidates()) {
        const gap = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
        if (gap > bestGap) continue;
        bestGap = gap;
        bestId = candidate.id;
      }
      if (bestId === null) return;
      lines.set(bestId, { text: Object.freeze({ ko, en }), until: sinks.now() + durationMs });
    },
    selfEmote: (emote) => sinks.selfEmote(emote),
    notify: (event) => sinks.notify(event),
    ...(sinks.onObjectStateChange
      ? { onObjectStateChange: (change: StudioInteractionFxObjectStateChange) => sinks.onObjectStateChange?.(change) }
      : {}),
  });

  return {
    runtime,
    syncObjectStates(states) {
      for (const state of states) {
        stateSenders.add(state.senderSessionId);
        if (applied.get(state.objectId) === state.stateChangedAt) continue;
        applied.set(state.objectId, state.stateChangedAt);
        runtime.applyRemoteObjectState(state.objectId, state.stateKey, state.stateChangedAt);
      }
    },
    npcLineFor(npcId, now) {
      const line = lines.get(npcId);
      if (!line) return null;
      if (now >= line.until) {
        lines.delete(npcId);
        return null;
      }
      return line.text;
    },
    clearRemoteStates(now) {
      clearRemote(now);
    },
    pruneRemoteStates(presentSessionIds, now) {
      let departed = false;
      for (const sender of stateSenders) {
        if (presentSessionIds.has(sender)) continue;
        departed = true;
        stateSenders.delete(sender);
      }
      // 동시접속 2명 기준이라 상태를 보내는 상대는 한 명뿐이다 — 그 세션이 없으면
      // 적용된 원격 상태 전부가 그 피어의 것이라 통째로 되돌리는 것이 맞다.
      if (departed) clearRemote(now);
    },
    syncPlacedFixtures(placed) {
      placedFixtures = placed;
      runtime.syncPlacedFixtures(placed);
    },
    placedPromptCandidate(point) {
      const fixture = nearestPlacedFixture(point);
      if (!fixture) return null;
      const stateKey = runtime.objectStateKey(fixture.objectId) ?? interactableInitialState(fixture.kind);
      const action = interactableStateActionText(fixture.kind, stateKey);
      return Object.freeze({
        id: fixture.objectId,
        kind: "interaction",
        point: fixture.point,
        radius: STUDIO_PLACED_FIXTURE_PROMPT_RADIUS,
        labelKo: `${action.ko} · ${fixture.labelKo}`,
        labelEn: `${action.en} · ${fixture.labelEn}`,
      });
    },
    activatePlacedFixtureNear(point, time) {
      const fixture = nearestPlacedFixture(point);
      if (!fixture) return false;
      return runtime.activatePlacedFixture(fixture.objectId, time);
    },
  };
}
