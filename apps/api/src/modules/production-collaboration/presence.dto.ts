import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const identity = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const displayName = z.string().trim().min(1).max(80);
const isoTime = z.string().datetime({ offset: true });
const unit = z.number().min(0).max(1);

const pagePresenceEntry = z.object({
  pageId: identity,
  actorId: identity,
  displayName,
  mode: z.enum(["editing", "viewing"]),
  heartbeatAt: isoTime,
}).strict();

const liveView = z.object({
  actorId: identity,
  displayName,
  pageId: identity,
  cursor: z.object({ x: unit, y: unit }).strict().nullable(),
  scrollX: unit,
  scrollY: unit,
  zoom: z.number().min(0.1).max(8),
  updatedAt: isoTime,
  interactedAt: isoTime,
}).strict();

/**
 * 세션은 웹 모델이 정본이다. 서버는 운반에 필요한 최소 구조만 검증하고
 * 나머지 필드는 그대로 통과시킨다(모델이 확장돼도 전송 계층이 막지 않게).
 */
const reviewSession = z.object({
  id: identity,
  scopeId: identity,
  hostActorId: identity,
  state: z.enum(["live", "ended"]),
  startedAt: isoTime,
  endedAt: isoTime.nullable(),
  participants: z.array(z.unknown()).max(200),
  decisions: z.array(z.unknown()).max(500),
}).passthrough();

export const PresenceParamsSchema = z.object({ projectId: identity }).strict();

/**
 * 하트비트 동기화 본문. 클라이언트는 자기 프레즌스 항목(탭 간 합류분 포함 최대
 * 64개)·내 라이브 뷰·로컬 세션을 보내고, 서버는 범위 전체 스냅샷으로 답한다.
 */
export const PresenceSyncSchema = z.object({
  episodeId: identity,
  pageId: identity,
  presence: z.array(pagePresenceEntry).max(64),
  liveView: liveView.nullable(),
  session: reviewSession.nullable(),
  leaving: z.boolean(),
}).strict();

export class PresenceParamsDto extends createZodDto(PresenceParamsSchema) {}
export class PresenceSyncDto extends createZodDto(PresenceSyncSchema) {}
export type PresenceSyncBody = z.infer<typeof PresenceSyncSchema>;
