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
 * - 정리: 공유 룸을 떠날 때 clearRemoteStates로 전파 머신을 초기 상태로 되돌리고
 *   적용 기록을 비운다.
 *
 * 로컬 상태 전이 통지(onObjectStateChange)와 HUD 알림·자기 이모트는 sink로 그대로
 * 통과시킨다. 이 모듈은 Phaser를 모른다 — 런타임 생성은 캔버스가 팩토리로 넘긴다.
 */
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";
import {
  type StudioInteractionFxCallbacks,
  type StudioInteractionFxObjectStateChange,
  type StudioInteractionFxRuntime,
} from "./studio-virtual-space-interaction-fx";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceObjectState } from "./studio-virtual-space-presence-protocol";
import type { StudioWorldBilingualText } from "./studio-virtual-space-world-interaction-kinds";

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
      runtime.clearRemoteObjectStates(now);
      applied.clear();
    },
  };
}
