import { Inject, Injectable } from "@nestjs/common";

import { ProductionCollaborationRepository } from "./production-collaboration.repository";
import type { PresenceSyncBody } from "./presence.dto";
import {
  PresenceStore,
  type PresenceScopeSnapshot,
  type ServerLiveViewState,
  type ServerPagePresenceEntry,
  type ServerReviewSession,
} from "./presence.store";

/**
 * 프레즌스 동기화 서비스.
 * - 접근 게이트: 프로젝트를 볼 수 있는 사람만 그 프로젝트의 프레즌스에 닿는다.
 *   판정은 기존 프로젝트 조회(getProject)의 view 검사를 그대로 재사용하고,
 *   라이브 뷰 하트비트(5초)까지 DB를 두드리지 않게 60초만 캐시한다.
 * - 상태 본체는 인메모리 PresenceStore다(휘발성 정보라 DB에 쓰지 않는다).
 */
@Injectable()
export class PresenceService {
  private readonly store = new PresenceStore();
  private readonly accessCache = new Map<string, number>();
  private static readonly ACCESS_CACHE_MS = 60_000;

  constructor(
    @Inject(ProductionCollaborationRepository)
    private readonly projects: ProductionCollaborationRepository,
  ) {}

  async sync(actorUserId: string, projectId: string, body: PresenceSyncBody): Promise<PresenceScopeSnapshot> {
    await this.requireView(actorUserId, projectId);
    return this.store.sync(projectId, body.episodeId, body.pageId, actorUserId, {
      presence: body.presence as readonly ServerPagePresenceEntry[],
      liveView: body.liveView as ServerLiveViewState | null,
      session: body.session as ServerReviewSession | null,
      leaving: body.leaving,
    }, new Date());
  }

  async snapshot(actorUserId: string, projectId: string, episodeId: string, pageId: string): Promise<PresenceScopeSnapshot> {
    await this.requireView(actorUserId, projectId);
    return this.store.snapshot(projectId, episodeId, pageId, new Date());
  }

  private async requireView(actorUserId: string, projectId: string): Promise<void> {
    const key = `${actorUserId}::${projectId}`;
    const cachedUntil = this.accessCache.get(key) ?? 0;
    if (Date.now() < cachedUntil) return;
    // getProject는 view 권한이 없으면 ProductionProjectForbiddenError를 던진다.
    await this.projects.getProject(actorUserId, projectId);
    this.accessCache.set(key, Date.now() + PresenceService.ACCESS_CACHE_MS);
  }
}
