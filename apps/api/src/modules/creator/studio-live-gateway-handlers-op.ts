/**
 * op 채널 병행 게이트웨이 핸들러 — HOST_INSERTION_SPEC 2절의 서버 계약 지점.
 *
 * 기존 CRDT 핸들러(studio-live-gateway-handlers-crdt.ts)와 같은 규율을 따른다:
 *  - 같은 소켓·같은 인증(joined participant + 강제 ACL 재검사)·같은 ACK 봉투.
 *  - 쿼터는 StudioLiveCrdtQuotaLimiter 체계를 재사용한다 (submit=update 예산,
 *    sync=sync 예산).
 *  - 영속이 linearization 지점이다: ACK는 저장 뒤에만 나가고, 브로드캐스트는
 *    ACK 뒤에만 나간다 — 커밋된 op가 "실패한 것처럼" 보이는 일이 없다.
 *  - actorId 위조를 막는다: op.actorId는 참가 시 서버가 아는 clientInstanceId와
 *    같아야 하고, opId 접두도 actorId와 같아야 한다(스키마 refine과 이중 방어).
 *
 * FIFO(계약 요구 2): 제출은 호스트의 발신자별 체인(runStudioLiveOpSerialized)으로
 * 줄 세우고, 방(StudioLiveOpRoom)이 카운터 단조성을 강제한다. Socket.IO 단일
 * 소켓 순서 보장 위에 서버 측 강제를 겹쳐, 재연결·다중 노드에서도 발신자
 * 단위 순서가 seq 순서와 어긋나지 않는다.
 */

import {
  replyStudioLiveAck as reply,
  studioLiveFailure as failure,
} from "./studio-live-ack";
import { studioLiveRoom } from "./studio-live-gateway-constants";
import {
  STUDIO_OP_MAX_BYTES,
  studioLiveOpByteLength,
} from "./studio-live-op";
import {
  STUDIO_LIVE_OP_BROADCAST_EVENT,
  StudioLiveOpSubmitSchema,
  StudioLiveOpSyncSchema,
} from "./studio-live.protocol";

import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type {
  StudioLiveAck,
  StudioLiveAckCallback,
  StudioLiveOpBroadcast,
  StudioLiveOpSubmitAck,
  StudioLiveOpSubmitInput,
  StudioLiveOpSyncInput,
  StudioLiveOpSyncResult,
  StudioLiveSocket,
} from "./studio-live.protocol";

export async function submitStudioLiveOp(
  this: StudioLiveGatewayHost,
  client: StudioLiveSocket,
  body: StudioLiveOpSubmitInput,
  ack?: StudioLiveAckCallback<StudioLiveOpSubmitAck>
) {
  const parsed = StudioLiveOpSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return reply(ack, failure("invalid_payload", "스트로크 연산 정보가 올바르지 않습니다."));
  }
  if (studioLiveOpByteLength(parsed.data.op) > STUDIO_OP_MAX_BYTES) {
    return reply(ack, failure("invalid_payload", "스트로크 연산이 허용 크기를 초과했습니다."));
  }
  const quotaParticipant = this.currentJoinedCrdtParticipant(client, parsed.data.workId);
  if (!quotaParticipant) {
    return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
  }
  if (parsed.data.op.actorId !== quotaParticipant.clientInstanceId) {
    return reply(ack, failure("invalid_payload", "스트로크 연산의 작성자 정보가 참가 정보와 다릅니다."));
  }
  if (
    !this.crdtQuotaLimiter.consumeUpdate(
      { userId: quotaParticipant.userId, workId: parsed.data.workId },
      studioLiveOpByteLength(parsed.data.op)
    )
  ) {
    return reply(ack, failure("rate_limited", "스트로크 연산 전송이 너무 빠릅니다."));
  }
  const authorizedBefore = await this.runWithAuthorizedParticipant(
    client,
    parsed.data.workId,
    true,
    true,
    (participant) => participant
  );
  if (!authorizedBefore || authorizedBefore.value !== quotaParticipant) {
    return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
  }
  if (!authorizedBefore.value.capabilities.edit) {
    return reply(ack, failure("forbidden", "이 작품을 편집할 권한이 없습니다."));
  }

  const senderKey = `${parsed.data.workId}\u0000${parsed.data.op.actorId}`;
  const outcome = await this.runStudioLiveOpSerialized(senderKey, async () => {
    const room = await this.studioLiveOpRooms.getRoom(parsed.data.workId);
    return room.submit(parsed.data.op, authorizedBefore.value.userId);
  });
  if (outcome.status === "fifo_rejected") {
    // 순서가 어긋난 제출은 영속하지 않는다. 클라이언트는 sync로 따라잡은 뒤
    // pending을 순서대로 다시 제출해야 한다 (웹 코어 재접속 규약).
    return reply(
      ack,
      failure("invalid_payload", "스트로크 연산 순서가 어긋났습니다. 동기화 후 순서대로 다시 보내 주세요.")
    );
  }
  if (outcome.status === "log_limit") {
    return reply(
      ack,
      failure("temporarily_unavailable", "스트로크 연산 기록이 가득 찼습니다. 잠시 후 다시 시도해 주세요.")
    );
  }

  const data: StudioLiveOpSubmitAck = {
    workId: parsed.data.workId,
    opId: outcome.result.op.opId,
    seq: outcome.result.op.seq,
    duplicate: !outcome.result.inserted || outcome.status === "duplicate",
  };
  const response: StudioLiveAck<StudioLiveOpSubmitAck> = { ok: true, data };
  // CRDT update와 같은 순서: 발신자는 영속 성공을 먼저 알고, 그 다음에 방이 본다.
  reply(ack, response);
  if (outcome.status === "accepted" && outcome.result.inserted) {
    const broadcast: StudioLiveOpBroadcast = {
      workId: parsed.data.workId,
      op: outcome.result.op,
    };
    try {
      client
        .to(studioLiveRoom(parsed.data.workId))
        .emit(STUDIO_LIVE_OP_BROADCAST_EVENT, broadcast);
    } catch (error) {
      this.logger.error(
        {
          workId: parsed.data.workId,
          opId: outcome.result.op.opId,
          error: error instanceof Error ? error.message : "unknown",
        },
        "studio op persisted but peer broadcast failed"
      );
    }
  }
  return response;
}

export async function syncStudioLiveOps(
  this: StudioLiveGatewayHost,
  client: StudioLiveSocket,
  body: StudioLiveOpSyncInput,
  ack?: StudioLiveAckCallback<StudioLiveOpSyncResult>
) {
  const parsed = StudioLiveOpSyncSchema.safeParse(body);
  if (!parsed.success) {
    return reply(ack, failure("invalid_payload", "스트로크 연산 동기화 요청이 올바르지 않습니다."));
  }
  const quotaParticipant = this.currentJoinedCrdtParticipant(client, parsed.data.workId);
  if (!quotaParticipant) {
    return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
  }
  if (
    !this.crdtQuotaLimiter.consumeSync({
      userId: quotaParticipant.userId,
      workId: parsed.data.workId,
    })
  ) {
    return reply(ack, failure("rate_limited", "스트로크 연산 동기화 요청이 너무 많습니다."));
  }
  const authorizedBefore = await this.runWithAuthorizedParticipant(
    client,
    parsed.data.workId,
    false,
    true,
    (participant) => participant
  );
  if (!authorizedBefore || authorizedBefore.value !== quotaParticipant) {
    return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
  }

  const room = await this.studioLiveOpRooms.getRoom(parsed.data.workId);
  const plan = room.syncFor(parsed.data.fromSeq);
  const authorizedAfter = await this.runWithAuthorizedParticipant(
    client,
    parsed.data.workId,
    false,
    true,
    (participant) => participant
  );
  if (!authorizedAfter || authorizedAfter.value !== authorizedBefore.value) {
    return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
  }
  const data: StudioLiveOpSyncResult = {
    workId: parsed.data.workId,
    fromSeq: parsed.data.fromSeq,
    lastSeq: room.lastSeq,
    ...(plan.snapshot ? { snapshot: plan.snapshot } : {}),
    ops: plan.ops,
  };
  return reply(ack, { ok: true, data });
}
