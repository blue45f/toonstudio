/**
 * ToonOffice 2D 상주 동료(앰비언트 NPC): 빈 작업실을 채우는 착석 작업자.
 *
 * 혼자 들어온 본사가 텅 비어 보이던 문제(벤치마크 B7)를 풀기 위해, 공정 방(콘티·작화·채색·배경·식자·연재)의 책상 좌석 일부에
 * 그 직군 캐릭터가 앉아 작업 루프를 돈다. 실제 사람을 흉내 내지 않도록 이름표는 항상 "NPC · 직함"이고, 실제 팀원이 늘어날수록
 * 상주 동료를 줄인다(팀원 1명당 1명, 최소 0명). 내가(또는 팀원이) 그 자리에 가까이 오거나 앉으면 자리를 비켜 사라졌다가,
 * 자리가 12초 동안 비면 돌아온다.
 *
 * 렌더 전용 배우라 HUD의 근처 NPC 목록·대화와는 무관하다. 자리를 막는 물리 몸체는 런타임이 붙이고 뗀다.
 * 계획(어떤 자리에 누가 앉는지)은 장면과 시드만으로 정해지는 순수 함수다.
 */
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { createOffice2dActor, type Office2dActor } from "./office2d-actors";
import type { Office2dScene, Office2dSeatVisual } from "./office2d-scene";
import { office2dHashIndex, type Office2dCharacterKey } from "./office2d-sprite-catalog";

export interface Office2dCoworkerPlan {
  readonly id: string;
  readonly seat: Office2dSeatVisual;
  readonly roomId: string;
  readonly character: Office2dCharacterKey;
  readonly titleKo: string;
  readonly titleEn: string;
  /** 낮을수록 먼저 자리를 내준다(팀원이 늘 때 줄이는 순서). */
  readonly priority: number;
}

/**
 * 공정 방별 상주 직군과 직함. 한 방에 여럿이 앉으면 캐릭터를 돌려 써서 같은 얼굴이 줄지어 앉지 않게 한다
 * (작화 오픈 데스크의 대화형 NPC가 작화 캐릭터이므로 어시스턴트는 다른 캐릭터로 채운다).
 */
const ROOM_STAFF: Readonly<Record<string, { readonly characters: readonly Office2dCharacterKey[]; readonly ko: string; readonly en: string; readonly seats: number }>> = Object.freeze({
  "hq-story-room": { characters: ["writer"], ko: "콘티 작가", en: "Storyboard writer", seats: 1 },
  "hq-ink-bay": { characters: ["bgartist", "editor", "writer"], ko: "선화 어시스턴트", en: "Inking assistant", seats: 3 },
  "hq-color-lab": { characters: ["colorist"], ko: "채색 어시스턴트", en: "Color assistant", seats: 1 },
  "hq-bg3d-lab": { characters: ["modeler"], ko: "3D 배경 작가", en: "3D background artist", seats: 1 },
  "hq-lettering-desk": { characters: ["letterer"], ko: "식자 담당", en: "Letterer", seats: 1 },
  "hq-publish-desk": { characters: ["pd"], ko: "연재 매니저", en: "Publishing manager", seats: 1 },
});

export const OFFICE2D_COWORKER_MAX = Object.values(ROOM_STAFF).reduce((sum, staff) => sum + staff.seats, 0);

function roomIdAt(scene: Office2dScene, point: StudioVirtualSpacePoint): string | null {
  const room = scene.rooms.find((candidate) => point.x >= candidate.rect.x && point.x < candidate.rect.x + candidate.rect.width
    && point.y >= candidate.rect.y && point.y < candidate.rect.y + candidate.rect.height);
  return room?.id ?? null;
}

/** 본사 장면에서 상주 동료 자리를 고른다. 책상을 보고 앉는(의자가 있는, 위쪽을 보는) 자리만 쓴다. */
export function planOffice2dCoworkers(scene: Office2dScene, seed = 0): readonly Office2dCoworkerPlan[] {
  if (scene.kind !== "toon-hq") return [];
  const byRoom = new Map<string, Office2dSeatVisual[]>();
  for (const seat of scene.seats) {
    if (seat.facing !== "up" || seat.chair === null) continue;
    const roomId = roomIdAt(scene, seat.anchor);
    if (!roomId || !ROOM_STAFF[roomId]) continue;
    const list = byRoom.get(roomId) ?? [];
    list.push(seat);
    byRoom.set(roomId, list);
  }
  const plans: Office2dCoworkerPlan[] = [];
  for (const [roomId, seats] of byRoom) {
    const staff = ROOM_STAFF[roomId];
    if (!staff) continue;
    // 좌석을 시드 해시로 섞어 같은 방에서도 매번 같은 자리(결정적)에, 문 앞 한 줄에 몰리지 않게 앉힌다.
    const ordered = [...seats].sort((left, right) => office2dHashIndex(`${seed}:${left.id}`, 104_729) - office2dHashIndex(`${seed}:${right.id}`, 104_729));
    ordered.slice(0, staff.seats).forEach((seat, index) => {
      plans.push(Object.freeze({
        id: `coworker:${seat.id}`,
        seat,
        roomId,
        character: staff.characters[index % staff.characters.length] ?? "artist",
        titleKo: staff.ko,
        titleEn: staff.en,
        priority: index === 0 ? 2 : 1,
      }));
    });
  }
  return Object.freeze(plans.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id)));
}

/** 팀원 수에 따라 보이게 할 상주 동료 수. 팀원 1명당 1명씩 줄인다. */
export function office2dCoworkerBudget(total: number, peerCount: number): number {
  return Math.max(0, Math.min(total, total - Math.max(0, Math.floor(peerCount))));
}

export interface Office2dCoworkerPresence {
  /** 0~1. 렌더 투명도. */
  alpha: number;
  /** 자리를 비운 시각(ms). null이면 앉아 있다. */
  vacatedAt: number | null;
}

const YIELD_RADIUS = 46;
const RETURN_CLEAR_RADIUS = 120;
const RETURN_DELAY_MS = 12_000;
const FADE_PER_SECOND = 3.2;

/**
 * 자리 양보 상태를 한 프레임 진행한다. 반환값은 이 동료가 지금 앉아 있어야 하는지(물리 몸체로 자리를 막을지)다.
 * - visible=false(예산 밖)이거나 누군가 자리 가까이 오거나 그 자리에 앉아 있으면 비킨다.
 * - 비운 지 12초가 지나고 반경 120px 안에 아무도 없으면 돌아온다.
 */
export function stepOffice2dCoworkerPresence(
  presence: Office2dCoworkerPresence,
  input: { readonly seat: Office2dSeatVisual; readonly visible: boolean; readonly occupants: readonly StudioVirtualSpacePoint[]; readonly seatTaken: boolean; readonly now: number; readonly deltaSeconds: number },
): boolean {
  const near = (radius: number) => input.occupants.some((point) => Math.hypot(point.x - input.seat.anchor.x, point.y - input.seat.anchor.y) <= radius);
  const mustLeave = !input.visible || input.seatTaken || near(YIELD_RADIUS);
  if (mustLeave) {
    if (presence.vacatedAt === null) presence.vacatedAt = input.now;
  } else if (presence.vacatedAt !== null && input.now - presence.vacatedAt >= RETURN_DELAY_MS && !near(RETURN_CLEAR_RADIUS)) {
    presence.vacatedAt = null;
  }
  const seated = presence.vacatedAt === null;
  const step = Math.max(0, input.deltaSeconds) * FADE_PER_SECOND;
  presence.alpha = seated ? Math.min(1, presence.alpha + step) : Math.max(0, presence.alpha - step);
  return seated;
}

interface Office2dCoworker {
  readonly plan: Office2dCoworkerPlan;
  readonly actor: Office2dActor;
  readonly presence: Office2dCoworkerPresence;
  blocking: boolean;
}

export interface Office2dCoworkerBlocker {
  /** 앉아 있는 동안 자리를 막는 몸체를 붙인다. */
  block(id: string, point: StudioVirtualSpacePoint): void;
  unblock(id: string): void;
}

export interface Office2dCoworkerFrameInput {
  readonly peerCount: number;
  readonly language: "ko" | "en";
  /** 나·팀원 발 위치. */
  readonly occupants: readonly StudioVirtualSpacePoint[];
  /** 나·팀원이 앉아 있는 좌석 id. */
  readonly takenSeatIds: ReadonlySet<string>;
  /** 좌석 임대(presence)로 점유된 좌석 앵커. */
  readonly seatedAnchors: readonly StudioVirtualSpacePoint[];
}

const SEAT_MATCH_RADIUS = 12;

/** 상주 동료 무리: 계획한 자리마다 배우를 하나씩 두고 프레임마다 자리 양보·예산을 반영한다. */
export class Office2dCoworkerCrowd {
  private readonly members: Office2dCoworker[] = [];

  constructor(scene: Office2dScene | null, now: number, private readonly blocker: Office2dCoworkerBlocker) {
    if (!scene) return;
    for (const plan of planOffice2dCoworkers(scene)) {
      const actor = createOffice2dActor({ id: plan.id, kind: "ambient", character: plan.character, accent: "#a78bfa", name: `NPC · ${plan.titleKo}`,
        x: plan.seat.anchor.x, y: plan.seat.anchor.y, facing: plan.seat.facing, now });
      actor.seat = plan.seat;
      actor.alpha = 0;
      this.members.push({ plan, actor, presence: { alpha: 0, vacatedAt: null }, blocking: false });
    }
  }

  get size(): number {
    return this.members.length;
  }

  update(deltaSeconds: number, now: number, input: Office2dCoworkerFrameInput): void {
    const budget = office2dCoworkerBudget(Math.min(OFFICE2D_COWORKER_MAX, this.members.length), input.peerCount);
    this.members.forEach((member, index) => {
      const seat = member.plan.seat;
      const seatTaken = input.takenSeatIds.has(seat.id)
        || input.seatedAnchors.some((anchor) => Math.hypot(anchor.x - seat.anchor.x, anchor.y - seat.anchor.y) < SEAT_MATCH_RADIUS);
      const sitting = stepOffice2dCoworkerPresence(member.presence, { seat, visible: index < budget, occupants: input.occupants, seatTaken, now, deltaSeconds });
      member.actor.alpha = member.presence.alpha;
      member.actor.name = input.language === "en" ? `NPC · ${member.plan.titleEn}` : `NPC · ${member.plan.titleKo}`;
      const blocking = sitting && member.presence.alpha > 0.5;
      if (blocking === member.blocking) return;
      member.blocking = blocking;
      if (blocking) this.blocker.block(member.actor.id, seat.anchor);
      else this.blocker.unblock(member.actor.id);
    });
  }

  /** 목표 좌석 근처의 상주 동료가 즉시 물리 차단을 풀고 자리를 양보하게 한다. */
  vacateNear(point: StudioVirtualSpacePoint, now: number): void {
    for (const member of this.members) {
      if (Math.hypot(point.x - member.plan.seat.anchor.x, point.y - member.plan.seat.anchor.y) > YIELD_RADIUS) continue;
      if (member.presence.vacatedAt === null) member.presence.vacatedAt = now;
      if (member.blocking) {
        member.blocking = false;
        this.blocker.unblock(member.actor.id);
      }
    }
  }

  /** 지금 조금이라도 보이는 상주 동료 배우(렌더용). */
  visibleActors(): readonly Office2dActor[] {
    return this.members.filter((member) => member.presence.alpha > 0.01).map((member) => member.actor);
  }
}
