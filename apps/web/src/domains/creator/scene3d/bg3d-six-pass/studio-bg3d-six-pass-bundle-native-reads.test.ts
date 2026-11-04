import { expect, it } from "vitest";
import { createStudioOpfsAssetStore } from "../../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../../studio-opfs-filesystem";

it("미리 열린 두 native-interface 권위가 다른 탭의 추가 본문을 즉시 읽고 기존 기본 캐시는 유지한다", async () => {
  // 메모리 FS를 native 구조적 이음매로 사용한다. 실제 OPFS 두 탭 검증과 구분한다.
  const fs = { ...createStudioOpfsMemoryFileSystem(), kind: "opfs" as const };
  const writer = createStudioOpfsAssetStore({ fs });
  const reader = createStudioOpfsAssetStore({ fs, freshReads: true });
  const existingDefault = createStudioOpfsAssetStore({ fs });
  expect(await reader.list()).toEqual([]); expect(await existingDefault.list()).toEqual([]);
  const bytes = new TextEncoder().encode("다른 탭에서 봉인한 실제 본문 바이트");
  const stored = await writer.put(bytes, { mime: "application/json" });
  expect(await reader.get(stored.ref.hash, { verify: true })).toEqual(bytes);
  expect(await reader.stat(stored.ref.hash)).toMatchObject({ hash: stored.ref.hash, bytes: bytes.length });
  expect(await reader.has(stored.ref.hash)).toBe(true); expect(await reader.list()).toHaveLength(1);
  expect(await existingDefault.get(stored.ref.hash)).toBeNull(); expect(await existingDefault.list()).toEqual([]);
  const next = await writer.put(new TextEncoder().encode("뒤늦게 추가한 revision"), { mime: "application/json" });
  expect(await reader.has(next.ref.hash)).toBe(true); expect(await reader.list()).toHaveLength(2);
  await reader.setOwnerRefs("retained-revision", [stored.ref.hash, next.ref.hash]);
  expect(await writer.ownerRefs("retained-revision")).toEqual([stored.ref.hash, next.ref.hash].sort());
});
