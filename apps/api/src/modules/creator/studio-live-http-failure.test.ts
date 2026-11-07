import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY } from "@toonstudio/contracts/studio-legacy-pigment-archive";
import { mapStudioLiveCrdtFailure } from "./studio-live-ack";
import { isStudioLiveHttpAuthorizationDenied } from "./studio-live-http-failure";
import { StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";

const forbiddenResponse = {
  ok: false,
  code: "forbidden",
  message: "현재 편집 배정이나 권한을 확인할 수 없습니다. 초안을 보존하고 배정을 다시 확인하세요.",
};

describe.each(["sync", "update"] as const)("공용 ACK의 %s HTTP 오류 경계", (operation) => {
  it.each([403, 409])("HTTP %i를 내부 상세 없는 권한 거부로 매핑한다", (status) => {
    const error = new HttpException({ message: "내부 배정 상세", privateField: "내부 정책" }, status);

    expect(isStudioLiveHttpAuthorizationDenied(error)).toBe(true);
    expect(mapStudioLiveCrdtFailure(error, "work-1", operation)).toEqual({
      response: forbiddenResponse,
      diagnostic: null,
    });
  });

  it.each([400, 401, 404, 429, 500, 503])("HTTP %i를 권한 오류로 오분류하거나 상세를 공개하지 않는다", (status) => {
    const error = new HttpException("내부 오류 상세", status);
    const mapped = mapStudioLiveCrdtFailure(error, "work-2", operation);

    expect(isStudioLiveHttpAuthorizationDenied(error)).toBe(false);
    expect(mapped.response).toEqual({
      ok: false,
      code: "internal_error",
      message: "CRDT 데이터를 안전하게 저장하거나 불러오지 못했습니다.",
    });
    expect(mapped.diagnostic).toEqual({
      workId: "work-2", operation, error: "내부 오류 상세", corruption: false,
    });
  });

  it.each([{ getStatus: () => 403 }, { getStatus: () => 409 }, null, new Error("일반 오류")])(
    "HTTP 예외가 아닌 값을 권한 거부로 오분류하지 않는다",
    (error) => {
      expect(isStudioLiveHttpAuthorizationDenied(error)).toBe(false);
      expect(mapStudioLiveCrdtFailure(error, "work-3", operation).response.code).toBe("internal_error");
    }
  );

  it("도메인 권한 거부도 동일한 공개 ACK를 유지한다", () => {
    expect(mapStudioLiveCrdtFailure(new StudioScopedWriteDeniedError("policy"), "work-4", operation))
      .toEqual({ response: forbiddenResponse, diagnostic: null });
  });

  it.each([
    ["studio_bg3d_reader_upgrade_required", STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY],
    ["studio_legacy_pigment_archive_reader_upgrade_required", STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY],
  ])("%s는 HTTP 409 권한 거부보다 reader 복구 경계를 우선한다", (code, capability) => {
    const error = new HttpException({ code, message: "공개하지 않을 내부 상세" }, 409);
    const mapped = mapStudioLiveCrdtFailure(error, "work-5", operation);

    expect(isStudioLiveHttpAuthorizationDenied(error)).toBe(true);
    expect(mapped).toEqual({
      response: {
        ok: false,
        code: "reader_upgrade_required",
        message: "원고의 보존된 편집 정보를 읽을 수 있는 앱으로 업데이트해 주세요.",
        requiredReaderCapabilities: [capability],
      },
      diagnostic: null,
    });
  });
});
