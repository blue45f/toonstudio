import { describe, expect, it } from "vitest";
import { StudioScopedAssetContextSchema } from "./studio-scoped-write-input";
import { scopedFixture } from "./studio-scoped-write.test-fixture";
import { StudioLiveCrdtUpdateSchema, StudioLiveCrdtBinaryUpdateSchema, StudioLiveOpSubmitSchema, STUDIO_CRDT_PROTOCOL_VERSION } from "./studio-live.protocol";
import { encodeStudioCrdtBinaryEnvelope } from "@toonstudio/contracts/studio-crdt-binary-envelope";

describe("제한 편집의 외부 입력 봉투", () => {
  it("기존 업로드 입력은 유지하고 JSON과 multipart의 명시 context를 같은 값으로 읽는다", () => {
    const context = scopedFixture().context;
    expect(StudioScopedAssetContextSchema.parse(undefined)).toBeUndefined();
    expect(StudioScopedAssetContextSchema.parse(context)).toEqual(context);
    expect(StudioScopedAssetContextSchema.parse(JSON.stringify(context))).toEqual(context);
    expect(StudioScopedAssetContextSchema.safeParse("{broken").success).toBe(false);
  });
  it("generic edit 주장이나 알 수 없는 context 속성을 받아들이지 않는다", () => {
    expect(StudioScopedAssetContextSchema.safeParse({ ...scopedFixture().context, edit: true }).success).toBe(false);
    expect(StudioScopedAssetContextSchema.safeParse({ ...scopedFixture().context, grantIds: [] }).success).toBe(false);
  });
  it("JSON CRDT의 sibling context를 보존하고 없던 전체 편집자 봉투도 받는다", () => {
    const body = { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work", updateId: "00000000-0000-4000-8000-000000000001", clientSequence: 1, update: "AAA=" };
    expect(StudioLiveCrdtUpdateSchema.parse(body)).toEqual(body);
    expect(StudioLiveCrdtUpdateSchema.parse({ ...body, writeContext: scopedFixture().context }).writeContext).toEqual(scopedFixture().context);
  });
  it("binary inner bytes를 바꾸지 않고 outer sibling context를 보존한다", () => {
    const bytes = Uint8Array.of(0, 0), writeContext = scopedFixture().context;
    const result = StudioLiveCrdtBinaryUpdateSchema.parse({ protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, wireVersion: 1,
      workId: "work", updateId: "00000000-0000-4000-8000-000000000001", clientSequence: 1,
      update: encodeStudioCrdtBinaryEnvelope("update", bytes), writeContext });
    expect(result.update).toEqual(bytes); expect(result.writeContext).toEqual(writeContext);
  });
  it("별도 stroke op는 명령 본문을 바꾸지 않고 submit 봉투에만 context를 받는다", () => {
    const body = { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work", writeContext: scopedFixture().context,
      op: { opId: "device:1", actorId: "device", lamport: 1, baseSeq: 0, body: { kind: "remove", strokeId: "own" } } };
    const parsed = StudioLiveOpSubmitSchema.parse(body);
    expect(parsed.writeContext).toEqual(body.writeContext); expect(parsed.op).toEqual(body.op);
  });
});
