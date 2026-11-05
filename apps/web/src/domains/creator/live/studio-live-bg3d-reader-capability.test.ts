import { describe, expect, it } from "vitest";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY as CAP } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { studioCrdtRemoteReaderRequest, studioLiveRequiredReaderFailure } from "./studio-live-bg3d-reader-capability";
import { createStudioCrdtBinarySyncRequest, createStudioCrdtBinaryUpdateRequest, parseStudioCrdtBinaryUpdateAck, parseStudioCrdtBinaryRemoteUpdate } from "./studio-crdt-binary-wire";
import { STUDIO_CRDT_PROTOCOL_VERSION } from "./studio-crdt-protocol";
import { parseFailure, parseJoinAck } from "./studio-live-socket-wire";
import { isNonRecoverable } from "./studio-live-socket-connect-error";
import { createStudioCrdtServerAckError } from "./studio-crdt-operation-error";
import { encodeStudioCrdtBinaryEnvelope } from "@/shared/lib/studio-crdt-binary-envelope";

const updateId = "00000000-0000-4000-8000-000000000001";
const READERS = [CAP, "legacy-pigment-preservation.v1"];
describe("원격 공동편집의 6패스 reader 광고", () => {
  it("이 기기의 origin 권위를 원격 서버 요청으로 보내지 않는다", () => {
    const request = { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-1", requestId: "request-1", stateVector: "AA==",
      requiredReaderCapabilities: [CAP], artifactScope: "origin" as const };
    const wire = studioCrdtRemoteReaderRequest(request);
    expect(wire).toMatchObject({ readerCapabilities: READERS }); expect(wire).not.toHaveProperty("artifactScope");
    expect(wire).not.toHaveProperty("requiredReaderCapabilities"); expect(request.artifactScope).toBe("origin");
    expect(createStudioCrdtBinarySyncRequest(wire)).toMatchObject({ readerCapabilities: READERS });
    expect(createStudioCrdtBinaryUpdateRequest(studioCrdtRemoteReaderRequest({ protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-1", updateId, clientSequence: 1, update: "AA==", readerCapabilities: [] }))).toMatchObject({ readerCapabilities: READERS });
  });
  it("JSON 변환을 거친 binary ACK와 원격 업데이트에도 요구 계약을 남긴다", () => {
    const common = { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, wireVersion: 1, workId: "work-1", updateId, serverSequence: "1", requiredReaderCapabilities: [CAP] };
    expect(parseStudioCrdtBinaryUpdateAck({ ...common, duplicate: false }, { expectedWorkId: "work-1" })).toMatchObject({ requiredReaderCapabilities: [CAP] });
    expect(parseStudioCrdtBinaryRemoteUpdate({ ...common, update: encodeStudioCrdtBinaryEnvelope("update", Uint8Array.of(0)) }, { expectedWorkId: "work-1" })).toMatchObject({ requiredReaderCapabilities: [CAP] });
  });
  it("더 새로운 알 수 없는 reader 요구는 반복 연결 대신 영구 중단한다", () => {
    const value = { requiredReaderCapabilities: ["future-reader.v2"] };
    expect(studioLiveRequiredReaderFailure(value)).toMatchObject({ code: "reader_upgrade_required" });
    expect(parseJoinAck({ ok: true, data: value })).toMatchObject({ code: "reader_upgrade_required" });
    expect(isNonRecoverable("reader_upgrade_required")).toBe(true);
    expect(createStudioCrdtServerAckError("reader_upgrade_required", "새 버전 필요").disposition).toBe("permanent");
  });
  it("정상 reader 요구와 upgrade 오류는 보존하고 손상 메타는 거부한다", () => {
    expect(studioLiveRequiredReaderFailure({ requiredReaderCapabilities: [CAP] })).toBeNull();
    expect(parseFailure({ ok: false, code: "reader_upgrade_required", message: "새 버전 필요", requiredReaderCapabilities: [CAP] })).toMatchObject({ requiredReaderCapabilities: [CAP] });
    expect(parseFailure({ ok: false, code: "reader_upgrade_required", message: "새 버전 필요", requiredReaderCapabilities: ["data:secret"] })).toBeNull();
  });
});
