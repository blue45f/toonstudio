/**
 * 충돌 반응 판정 (locomotion-feel의 `bounceVelocity` 캔버스 배선용 상태 판정기).
 *
 * Arcade 몸체의 blocked 플래그는 "지금 벽에 닿아 있다"만 알려 줄 뿐, 부딪힌 순간과
 * 법선·충격 속도는 알려 주지 않는다. 이 판정기는 프레임마다 (적용 속도, 접촉 방향)을
 * 받아 접촉이 시작된 프레임(onset)에만 `bounceVelocity` 반발을 한 번 돌려준다.
 *
 * - 접촉이 유지되는 동안에는 다시 발동하지 않는다 (벽에 비비는 중 매 프레임 튀지 않음).
 * - 접촉이 풀린 뒤 다시 부딪히면 새 반발이 가능하다. 단, 짧은 쿨다운으로 코너에서
 *   두 축이 번갈아 닿을 때 반발이 겹치지 않게 한다.
 * - 코너(두 축 동시 접촉)에서는 벽으로 파고드는 성분이 큰 축의 법선을 쓴다.
 * - reduced-motion·효과 레벨 low에서는 반발을 내지 않는다 (그냥 멈추는 기존 동작).
 *
 * 순수 로직 모듈. Phaser에 의존하지 않고, 프레임당 객체를 새로 만들지 않는다
 * (반환 벡터만 onset 프레임에 한 번 할당한다).
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { bounceVelocity } from "./studio-virtual-space-locomotion-feel";

/** 반발이 발동하는 최소 충격 속도(px/s, 법선 성분 기준). 천천히 기대는 접촉은 튀지 않는다. */
export const STUDIO_COLLISION_BOUNCE_MIN_IMPACT_PX_S = 90;
/** 반발 속도의 상한 (최고 속도의 비율). 과장된 튕김을 막는 천장이다. */
export const STUDIO_COLLISION_BOUNCE_MAX_SPEED_RATIO = 0.4;
/** 반발 재발동 쿨다운(ms). 코너 접촉에서 축이 번갈아 켜질 때 반발이 겹치지 않게 한다. */
export const STUDIO_COLLISION_BOUNCE_COOLDOWN_MS = 240;

/** Arcade 몸체의 축별 접촉 상태. left=true면 왼쪽에 벽이 있어 그쪽 이동이 막힌 상태다. */
export interface StudioCollisionContact {
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
}

export interface StudioCollisionResponseInput {
  /** 직전 프레임에 몸체에 적용한 속도(px/s). 충격 판정의 기준이다. */
  readonly velocity: StudioVirtualSpacePoint;
  /** 이번 프레임의 접촉 상태. */
  readonly contact: StudioCollisionContact;
  /** 현재 최고 속도(px/s). 반발 상한 계산에 쓴다. */
  readonly maxSpeed: number;
  readonly reducedMotion: boolean;
  /** 효과 레벨 low 등 연출 억제 상태면 true를 넘겨 반발을 끈다. */
  readonly effectsSuppressed: boolean;
}

const NO_CONTACT: StudioCollisionContact = Object.freeze({ left: false, right: false, up: false, down: false });

/** Arcade 몸체의 blocked(막힘)와 touching(닿음)을 판정기의 접촉 입력으로 합친다. */
export function studioCollisionContact(
  blocked: StudioCollisionContact,
  touching: StudioCollisionContact,
): StudioCollisionContact {
  return {
    left: blocked.left || touching.left,
    right: blocked.right || touching.right,
    up: blocked.up || touching.up,
    down: blocked.down || touching.down,
  };
}

export class StudioCollisionResponder {
  private previous: StudioCollisionContact = NO_CONTACT;
  private lastBounceAt = -Infinity;
  private readonly normal = { x: 0, y: 0 };

  /** 순간이동·포털 도착 뒤에는 이전 접촉을 버린다 (도착 직후 엉뚱한 반발 방지). */
  reset(): void {
    this.previous = NO_CONTACT;
    this.lastBounceAt = -Infinity;
  }

  /**
   * 이번 프레임에 적용할 반발 속도를 돌려준다. 반발이 없으면 null.
   * 반환 벡터는 호출 측이 그 프레임의 속도로 채택하는 1회성 값이다 —
   * 이후 감속은 기존 이저(easer)가 반발 속도에서 이어받아 자연히 수렴한다.
   */
  sample(input: StudioCollisionResponseInput, now: number): StudioVirtualSpacePoint | null {
    const contact = input.contact;
    const previous = this.previous;
    this.previous = contact;
    if (input.reducedMotion || input.effectsSuppressed) return null;
    if (!Number.isFinite(now) || now - this.lastBounceAt < STUDIO_COLLISION_BOUNCE_COOLDOWN_MS) return null;

    // onset 축마다 벽으로 파고드는 속도 성분을 잰다. 법선은 벽에서 멀어지는 방향이다.
    // left 접촉 = 왼쪽 벽 → 법선 +x, 파고드는 성분 = -velocity.x.
    let impact = 0;
    let normalX = 0;
    let normalY = 0;
    if (contact.left && !previous.left && -input.velocity.x > impact) {
      impact = -input.velocity.x; normalX = 1; normalY = 0;
    }
    if (contact.right && !previous.right && input.velocity.x > impact) {
      impact = input.velocity.x; normalX = -1; normalY = 0;
    }
    if (contact.up && !previous.up && -input.velocity.y > impact) {
      impact = -input.velocity.y; normalX = 0; normalY = 1;
    }
    if (contact.down && !previous.down && input.velocity.y > impact) {
      impact = input.velocity.y; normalX = 0; normalY = -1;
    }
    if (impact < STUDIO_COLLISION_BOUNCE_MIN_IMPACT_PX_S) return null;

    this.normal.x = normalX;
    this.normal.y = normalY;
    const bounced = bounceVelocity(input.velocity, this.normal);
    const speed = Math.hypot(bounced.x, bounced.y);
    const maxSpeed = Number.isFinite(input.maxSpeed) ? Math.max(0, input.maxSpeed) : 0;
    const cap = maxSpeed * STUDIO_COLLISION_BOUNCE_MAX_SPEED_RATIO;
    this.lastBounceAt = now;
    if (speed <= 0.001) return null;
    if (cap > 0 && speed > cap) {
      const ratio = cap / speed;
      return Object.freeze({ x: bounced.x * ratio, y: bounced.y * ratio });
    }
    return bounced;
  }
}
