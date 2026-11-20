import { describe, expect, it } from "vitest";

import { createDiskSource, DEFAULT_KIT_ROOT, verifyKit } from "../verify-character-kit.mjs";

const disk = createDiskSource(DEFAULT_KIT_ROOT);
const companionPath = "kit-portrait.json";
const portraitBasePath = "bases/female-portrait.glb";
const portraitIrisPath = "parts/female/irises/portrait-gradient.glb";

function sourceWith(overrides = new Map()) {
  const names = new Set([...disk.list(), ...overrides.keys()]);
  return {
    label: "등록 판 무결성 회귀",
    read: (file) => overrides.has(file) ? overrides.get(file) : disk.read(file),
    list: () => [...names].filter((file) => !overrides.has(file) || overrides.get(file) !== null).sort(),
  };
}

function companionWith(change) {
  const bytes = disk.read(companionPath);
  if (bytes === null) throw new Error("출하 인물 키트 명세가 없습니다.");
  const manifest = JSON.parse(new TextDecoder().decode(bytes));
  change(manifest);
  return new Map([[companionPath, new TextEncoder().encode(JSON.stringify(manifest))]]);
}

const inspect = (overrides) => verifyKit({ source: sourceWith(overrides), only: ["V2"] });

describe("같은 디렉터리의 등록 키트 판 검증", () => {
  it("출하된 두 판을 함께 읽고 미등록 파일 없이 통과한다", async () => {
    const result = await inspect();
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.checks.V2.status).toBe("pass");
  });

  it.each([portraitBasePath, portraitIrisPath])("%s 바이트 변조를 두 번째 판의 SHA로 검출한다", async (file) => {
    const original = disk.read(file);
    if (original === null || original.length === 0) throw new Error(`출하 파일이 비었습니다: ${file}`);
    const corrupted = original.slice();
    corrupted[0] ^= 1;
    const result = await inspect(new Map([[file, corrupted]]));
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "V2", where: file, message: expect.stringContaining("kit-sha-mismatch") }),
    ]));
  });

  it("두 번째 판의 크기 불일치와 누락도 실패한다", async () => {
    const result = await inspect(new Map([[portraitBasePath, new Uint8Array(1)], [portraitIrisPath, null]]));
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ where: portraitBasePath, message: expect.stringContaining("kit-bytes-mismatch") }),
      expect.objectContaining({ where: portraitIrisPath, message: expect.stringContaining("kit-file-fetch-failed") }),
    ]));
  });

  it.each([
    ["JSON 구문", () => new Map([[companionPath, new TextEncoder().encode("{")]])],
    ["스키마", () => companionWith((manifest) => { delete manifest.skeleton; })],
    ["키트 ID", () => companionWith((manifest) => { manifest.kitId = "unregistered-kit"; })],
    ["판 번호", () => companionWith((manifest) => { manifest.kitVersion = 3; })],
  ])("동반 명세의 %s 오류가 있으면 파일명만 보고 허용하지 않는다", async (_name, overrides) => {
    const result = await inspect(overrides());
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "V2", where: companionPath, message: expect.stringContaining("동반 키트 명세") }),
    ]));
  });

  it("동반 명세가 없으면 인물 파일도 미등록 상태로 거부한다", async () => {
    const result = await inspect(new Map([[companionPath, null]]));
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ where: portraitBasePath, message: expect.stringContaining("모르는 파일") }),
      expect.objectContaining({ where: portraitIrisPath, message: expect.stringContaining("모르는 파일") }),
    ]));
  });

  it("명세가 참조하는 출처 안내 파일이 없으면 실패한다", async () => {
    const overrides = companionWith((manifest) => { manifest.provenance.noticeFile = "PORTRAIT-NOTICE.md"; });
    const result = await inspect(overrides);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ where: "PORTRAIT-NOTICE.md", message: expect.stringContaining("파일이 없습니다") }),
    ]));
  });

  it("등록되지 않은 추가 명세·파일과 대소문자 충돌을 계속 차단한다", async () => {
    const bytes = new TextEncoder().encode("미등록 파일");
    const result = await inspect(new Map([["kit-other.json", bytes], ["extra.glb", bytes], [portraitBasePath.toUpperCase(), bytes]]));
    expect(result.ok).toBe(false);
    for (const file of ["kit-other.json", "extra.glb"]) {
      expect(result.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ where: file, message: expect.stringContaining("모르는 파일") }),
      ]));
    }
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("대소문자만 다른 중복 경로") }),
    ]));
  });
});
