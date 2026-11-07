import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { submitStudioLiveOp } from "./studio-live-gateway-handlers-op";
import { STUDIO_CRDT_PROTOCOL_VERSION, StudioLiveOpSubmitSchema } from "./studio-live.protocol";

import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type { StudioLiveOpSubmitOutcome } from "./studio-live-op";
import type { StudioLiveSocket } from "./studio-live.protocol";

// 실제 제출 핸들러를 실행하되 저장소와 소켓만 대역으로 둔다. DB 통합 검증은 아니다.
describe("op 제출의 HTTP 권한 오류 ACK", () => {
  it.each([
    ["권한 회수", new ForbiddenException("내부 배정 상세")],
    ["정책 버전 충돌", new ConflictException({ message: "내부 정책 상세", policyVersion: 42 })],
  ])("%s는 공용 mapper를 거쳐 forbidden으로 응답하고 전파하지 않는다", async (_label, error) => {
    const participant = { userId: "user-1", clientInstanceId: "client-1", capabilities: { edit: true } };
    const submit = vi.fn().mockRejectedValue(error);
    const getRoom = vi.fn().mockResolvedValue({ submit });
    const ack = vi.fn();
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    const client = { to } as unknown as StudioLiveSocket;
    const host = {
      currentJoinedCrdtParticipant: vi.fn().mockReturnValue(participant),
      crdtQuotaLimiter: { consumeUpdate: vi.fn().mockReturnValue(true) },
      runWithAuthorizedParticipant: vi.fn().mockResolvedValue({ value: participant }),
      runStudioLiveOpSerialized: vi.fn(async (_key: string, operation: () => Promise<StudioLiveOpSubmitOutcome>) => operation()),
      studioLiveOpRooms: { getRoom },
    } as unknown as StudioLiveGatewayHost;
    const input = StudioLiveOpSubmitSchema.parse({
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-1",
      op: { opId: "client-1:1", actorId: "client-1", lamport: 1, baseSeq: 0, body: { kind: "remove", strokeId: "stroke-1" } },
    });

    const response = await submitStudioLiveOp.call(host, client, input, ack);

    expect(getRoom).toHaveBeenCalledExactlyOnceWith("work-1");
    expect(submit).toHaveBeenCalledExactlyOnceWith(input.op, "user-1", undefined);
    expect(response).toEqual({
      ok: false,
      code: "forbidden",
      message: "현재 편집 배정이나 권한을 확인할 수 없습니다. 초안을 보존하고 배정을 다시 확인하세요.",
    });
    expect(ack).toHaveBeenCalledExactlyOnceWith(response);
    expect(ack.mock.calls[0]?.[0]).toBe(response);
    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
