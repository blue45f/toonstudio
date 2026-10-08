import { describe, expect, it } from "vitest";

import { KIT_ASSET_ROOT, KIT_DEFAULT_ID, KIT_DEFAULT_SLOTS, failVisible } from "../../contracts";

import { defaultKitManifestUrl, loadKitManifestFlow, loadKitPlanFlow } from "./kit-load-flow";
import { kitManifestJson } from "./kit-test-fixture";

import type { KitFetchPort } from "./kit-load-flow";
import type { FetchBytesResult, FetchJsonResult } from "./package-load-flow";

const MANIFEST_URL = `${KIT_ASSET_ROOT}/kit.json`;
const REQUEST = { kitId: KIT_DEFAULT_ID, kitVersion: 1 };
const OBSERVED = "b".repeat(64);

interface Calls {
  readonly json: string[];
  readonly bytes: string[];
}

function portOf(json: Record<string, unknown>, bytes: Record<string, Uint8Array> = {}): { readonly port: KitFetchPort; readonly calls: Calls } {
  const calls: Calls = { json: [], bytes: [] };
  const port: KitFetchPort = {
    fetchJson: async (url): Promise<FetchJsonResult> => {
      calls.json.push(url);
      return url in json ? { ok: true, json: json[url] } : { ok: false, status: 404, message: "404 Not Found" };
    },
    fetchBytes: async (url): Promise<FetchBytesResult> => {
      calls.bytes.push(url);
      const found = bytes[url];
      return found ? { ok: true, bytes: found } : { ok: false, status: 404, message: "404 Not Found" };
    },
  };
  return { port, calls };
}

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
const sha256Of = (value: string) => async (): Promise<string> => value;

describe("authored/kit-load-flow — manifest", () => {
  it("기본 경로는 KIT_ASSET_ROOT/kit.json이다", () => {
    expect(defaultKitManifestUrl()).toBe(MANIFEST_URL);
    expect(defaultKitManifestUrl("/custom/kit/")).toBe("/custom/kit/kit.json");
  });

  it("해시 요구가 없으면 fetchJson(no-cache 경로)으로 읽고 검증된 manifest를 돌려준다", async () => {
    const { port, calls } = portOf({ [MANIFEST_URL]: kitManifestJson() });
    const result = await loadKitManifestFlow(port, REQUEST, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.kitId).toBe(KIT_DEFAULT_ID);
    expect(result.manifest.parts).toHaveLength(32);
    expect(result.manifestUrl).toBe(MANIFEST_URL);
    expect(result.rootUrl).toBe(KIT_ASSET_ROOT);
    expect(result.observedSha256).toBeNull();
    expect(calls).toEqual({ json: [MANIFEST_URL], bytes: [] });
  });

  it("레시피가 manifestSha256을 요구하면 바이트로 읽어 해시를 대조한 뒤 파싱한다", async () => {
    const { port, calls } = portOf({}, { [MANIFEST_URL]: encode(kitManifestJson()) });
    const result = await loadKitManifestFlow(port, { ...REQUEST, manifestSha256: OBSERVED.toUpperCase() }, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observedSha256).toBe(OBSERVED);
    expect(calls).toEqual({ json: [], bytes: [MANIFEST_URL] });
  });

  it("해시가 다르면 kit-manifest-sha-mismatch, 해시 계산 실패도 같은 코드로 보인다", async () => {
    const { port } = portOf({}, { [MANIFEST_URL]: encode(kitManifestJson()) });
    const mismatch = await loadKitManifestFlow(port, { ...REQUEST, manifestSha256: "c".repeat(64) }, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(mismatch.ok === false && mismatch.failure.code).toBe("kit-manifest-sha-mismatch");
    expect(mismatch.ok === false && mismatch.failure.reasonKo).toMatch(/kit\.json SHA-256이 레시피와 다릅니다\(기대 cccccccccccc…, 실제 bbbbbbbbbbbb…\)/u);

    const broken = await loadKitManifestFlow(port, { ...REQUEST, manifestSha256: OBSERVED }, {
      sha256: async () => {
        throw new Error("subtle 없음");
      },
      now: 1,
    });
    expect(broken.ok === false && broken.failure.code).toBe("kit-manifest-sha-mismatch");
    expect(broken.ok === false && broken.failure.reasonKo).toMatch(/계산하지 못해/u);
    expect(broken.ok === false && broken.failure.detail).toContain("subtle 없음");

    // 해시 함수가 LabFailure를 던지면 그대로 올린다
    const passthrough = await loadKitManifestFlow(port, { ...REQUEST, manifestSha256: OBSERVED }, {
      sha256: async () => {
        throw failVisible("sha-unavailable", "해시 사용 불가", undefined, 3);
      },
      now: 1,
    });
    expect(passthrough.ok === false && passthrough.failure.code).toBe("sha-unavailable");
  });

  it("404와 네트워크 오류는 kit-manifest-fetch-failed(두 읽기 경로 모두)", async () => {
    const notFound = await loadKitManifestFlow(portOf({}).port, REQUEST, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(notFound.ok === false && notFound.failure.code).toBe("kit-manifest-fetch-failed");
    expect(notFound.ok === false && notFound.failure.reasonKo).toBe(`키트 manifest(kit.json)를 불러오지 못했습니다(404): ${MANIFEST_URL}`);
    expect(notFound.ok === false && notFound.failure.detail).toBe("404 Not Found");

    const offline: KitFetchPort = {
      fetchJson: async () => ({ ok: false, status: null, message: "offline" }),
      fetchBytes: async () => ({ ok: false, status: null, message: "offline" }),
    };
    const viaJson = await loadKitManifestFlow(offline, REQUEST, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(viaJson.ok === false && viaJson.failure.reasonKo).toMatch(/\(네트워크\)/u);
    const viaBytes = await loadKitManifestFlow(offline, { ...REQUEST, manifestSha256: OBSERVED }, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(viaBytes.ok === false && viaBytes.failure.code).toBe("kit-manifest-fetch-failed");
    expect(viaBytes.ok === false && viaBytes.failure.detail).toBe("offline");
  });

  it("형식 오류는 kit-manifest-invalid(스키마 위반·JSON이 아닌 바이트)", async () => {
    const schema = await loadKitManifestFlow(portOf({ [MANIFEST_URL]: { schema: "nope" } }).port, REQUEST, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(schema.ok === false && schema.failure.code).toBe("kit-manifest-invalid");
    expect(schema.ok === false && schema.failure.reasonKo).toMatch(/^키트 manifest 형식이 올바르지 않습니다/u);

    const notJson = await loadKitManifestFlow(portOf({}, { [MANIFEST_URL]: encode("{ 깨진 json") }).port, { ...REQUEST, manifestSha256: OBSERVED }, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(notJson.ok === false && notJson.failure.code).toBe("kit-manifest-invalid");
    expect(notJson.ok === false && notJson.failure.reasonKo).toMatch(/올바른 JSON/u);

    const badBytes = await loadKitManifestFlow(portOf({}, { [MANIFEST_URL]: new Uint8Array([0xff, 0xfe, 0xfd]) }).port, { ...REQUEST, manifestSha256: OBSERVED }, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(badBytes.ok === false && badBytes.failure.code).toBe("kit-manifest-invalid");
  });

  it("레시피의 키트 id·버전이 manifest와 다르면 kit-version-mismatch", async () => {
    const { port } = portOf({ [MANIFEST_URL]: kitManifestJson({ kitVersion: 2 }) });
    const version = await loadKitManifestFlow(port, REQUEST, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(version.ok === false && version.failure.code).toBe("kit-version-mismatch");
    expect(version.ok === false && version.failure.reasonKo).toMatch(/키트 버전\(1\).*\(2\)/u);
    const id = await loadKitManifestFlow(portOf({ [MANIFEST_URL]: kitManifestJson() }).port, { kitId: "other-kit", kitVersion: 1 }, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(id.ok === false && id.failure.code).toBe("kit-version-mismatch");
  });

  it("두 베이스의 능력 선언을 모두 규칙과 대조한다(남성 선언이 틀려도 키트 전체가 실패)", async () => {
    const raw = structuredClone(kitManifestJson()) as { slotCapabilities: { male: Record<string, unknown>; female: Record<string, unknown> } };
    raw.slotCapabilities.male.hair = { status: "available" };
    const result = await loadKitManifestFlow(portOf({ [MANIFEST_URL]: raw }).port, REQUEST, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(result.ok === false && result.failure.code).toBe("kit-capabilities-mismatch");
    expect(result.ok === false && result.failure.reasonKo).toMatch(/^kit\.json이 선언한 슬롯 능력이 규칙 판정과 다릅니다 — male: 헤어\(hair\)/u);

    const both = structuredClone(raw);
    both.slotCapabilities.female.body = { status: "unavailable", reasonKo: "x" };
    const many = await loadKitManifestFlow(portOf({ [MANIFEST_URL]: both }).port, REQUEST, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(many.ok === false && many.failure.reasonKo).toMatch(/female: 체형\(body\).*\/ male: 헤어\(hair\)/u);
  });

  it("rootUrl 옵션이 manifest 위치와 반환값에 반영된다", async () => {
    const { port, calls } = portOf({ "/custom/kit/kit.json": kitManifestJson() });
    const result = await loadKitManifestFlow(port, REQUEST, { sha256: sha256Of(OBSERVED), rootUrl: "/custom/kit/", now: 1 });
    expect(result.ok).toBe(true);
    expect(calls.json).toEqual(["/custom/kit/kit.json"]);
    expect(result.ok && result.rootUrl).toBe("/custom/kit/");
  });
});

describe("authored/kit-load-flow — 계획까지", () => {
  const SOURCE = { kitId: KIT_DEFAULT_ID, kitVersion: 1, baseId: "female" as const };

  it("manifest를 읽어 선택 슬롯의 계획을 만들고 파일 url에 rootUrl을 쓴다", async () => {
    const { port } = portOf({ "/custom/kit/kit.json": kitManifestJson() });
    const result = await loadKitPlanFlow(port, SOURCE, KIT_DEFAULT_SLOTS, { sha256: sha256Of(OBSERVED), rootUrl: "/custom/kit", now: 1 }, { preferredHairLod: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.parts.map((part) => part.id)).toEqual(["base/female", "hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"]);
    expect(result.plan.parts[0]?.url).toBe("/custom/kit/bases/female.glb");
    expect(result.plan.hairLodPolicy.preferredLod).toBe(1);
    expect(result.manifest.kitVersion).toBe(1);
    expect(result.observedSha256).toBeNull();
  });

  it("manifest 단계 실패는 그대로, 계획 단계 실패(없는 파츠)는 kit-part-missing으로 올라온다", async () => {
    const missing = await loadKitPlanFlow(portOf({}).port, SOURCE, KIT_DEFAULT_SLOTS, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(missing.ok === false && missing.failure.code).toBe("kit-manifest-fetch-failed");

    const { port } = portOf({ [MANIFEST_URL]: kitManifestJson() });
    const maleHime = await loadKitPlanFlow(port, { ...SOURCE, baseId: "male" }, { ...KIT_DEFAULT_SLOTS, hair: "hair/hime-cut" }, { sha256: sha256Of(OBSERVED), now: 1 });
    expect(maleHime.ok === false && maleHime.failure.code).toBe("kit-part-missing");
    expect(maleHime.ok === false && maleHime.failure.reasonKo).toContain("남성 핏 미제작");
  });
});
