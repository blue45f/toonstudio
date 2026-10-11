import { describe, expect, it } from "vitest";

import {
  isStudioLiveProjectGuestSessionId,
  isStudioRealtimeProjectGuestActorId,
  studioRealtimeProjectGuestActorId,
} from "./studio-live-project-guest";

describe("studio-live-project-guest", () => {
  it("accepts only the 16 character guest session id format", () => {
    expect(isStudioLiveProjectGuestSessionId("Ab3dEf6hJkLmNpQr")).toBe(true);
    expect(isStudioLiveProjectGuestSessionId("abc-def_12345678")).toBe(true);
    expect(isStudioLiveProjectGuestSessionId("short")).toBe(false);
    expect(isStudioLiveProjectGuestSessionId("Ab3dEf6hJkLmNpQrX")).toBe(false);
    expect(isStudioLiveProjectGuestSessionId("한글세션아이디열여섯자")).toBe(false);
    expect(isStudioLiveProjectGuestSessionId("has space in it!")).toBe(false);
    expect(isStudioLiveProjectGuestSessionId(null)).toBe(false);
    expect(isStudioLiveProjectGuestSessionId(1234567890123456)).toBe(false);
  });

  it("derives the room actor id from the guest session id", () => {
    expect(studioRealtimeProjectGuestActorId("Ab3dEf6hJkLmNpQr")).toBe(
      "guest:Ab3dEf6hJkLmNpQr",
    );
    expect(
      isStudioRealtimeProjectGuestActorId("guest:Ab3dEf6hJkLmNpQr"),
    ).toBe(true);
  });

  it("does not mistake jam guest actors or account ids for project guests", () => {
    // 잼 게스트는 guest:<uuid> 형식이라 세션 ID 형식이 다르다.
    expect(
      isStudioRealtimeProjectGuestActorId(
        "guest:00000000-0000-4000-8000-000000000001",
      ),
    ).toBe(false);
    expect(isStudioRealtimeProjectGuestActorId("artist-1")).toBe(false);
    expect(isStudioRealtimeProjectGuestActorId("guest:short")).toBe(false);
    expect(isStudioRealtimeProjectGuestActorId(null)).toBe(false);
  });
});
