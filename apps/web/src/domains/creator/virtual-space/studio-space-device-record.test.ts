// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { accessStudioSpaceRecord } from "./studio-space-device-record";
import { createSpaceDeviceRecordFixture } from "./studio-space-device-record.test-fixture";

const db = createSpaceDeviceRecordFixture();
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => db }));

beforeEach(() => {
  db.records.clear();
  vi.clearAllMocks();
  localStorage.clear();
});

it("같은 항목을 동시에 갱신할 때 직전 쓰기 결과로 다음 변경을 계산한다", async () => {
  localStorage.setItem("votes", "1");
  const increment = () => accessStudioSpaceRecord("votes", previous => ({ value: String(Number(previous) + 1) }));
  await expect(Promise.all([increment(), increment()])).resolves.toEqual(["2", "3"]);
  await expect(accessStudioSpaceRecord("votes")).resolves.toBe("3");
  expect(localStorage.getItem("votes")).toBe("1");
});

it("권한 확인 뒤 읽기가 지연되는 동안 계정이 바뀌면 예약한 수정·이관이 적용되지 않는다", async () => {
  let account = "member-a";
  const release = Promise.withResolvers<string | null>();
  db.kvGet.mockReturnValueOnce(release.promise);
  localStorage.setItem("scoped-install", "old");
  const write = accessStudioSpaceRecord("scoped-install", () => ({ value: "new" }), () => account === "member-a");
  await vi.waitFor(() => expect(db.kvGet).toHaveBeenCalledTimes(1));
  account = "member-b";
  release.resolve(null);
  await expect(write).resolves.toBe("old");
  expect(db.kvSet).not.toHaveBeenCalled();
});
