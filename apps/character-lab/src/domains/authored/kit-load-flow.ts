/**
 * 키트 로드 흐름(순수, fetch 포트 주입): `kit.json` fetch → (선택) SHA-256 대조 → zod 검증 → 키트 id·버전 대조 → 능력 선언 대조 → KitPlan.
 * 브라우저 바인딩은 kit-loader.browser.ts가 맡고, 이 파일은 Node 테스트에서 가짜 포트로 모든 실패 경로를 검증한다.
 *
 * GLB 바이트의 fetch·SHA 검증은 렌더 엔진이 한다(계약 4.2): 이 흐름은 manifest와 계획까지만 책임진다.
 * 모든 실패는 무음 대체 없이 `LabFailure{code, reasonKo}`다. 절차 소스로 자동 전환하지 않는다(계약 6절).
 *
 * 키트 v2(2026-10-23 A-1): `schema`가 `toonstudio.character-kit/2`이면 v2 파서로 읽고 결과에 `version: 2`와 v1 형식 보기(`legacyView`,
 * `kit-v1-projection.ts`)를 함께 싣는다. 그 밖의 schema(v1·모르는 값)는 이전과 같이 v1 파서가 읽어 같은 사유로 거부한다.
 */
import { KIT_ASSET_ROOT, KIT_MANIFEST_FILENAME, KIT_V2_SCHEMA_ID, failVisible, isLabFailure, parseKitManifest, parseKitManifestV2 } from "../../contracts";

import { kitCapabilityDifferences } from "./kit-capability";
import { buildKitPlanDetailed } from "./kit-plan";
import { kitManifestV1View } from "./kit-v1-projection";
import { joinPackageUrl } from "./package-plan";

import type { AnyKitManifest, KitPlanOptions, KitPlanSlots, KitPlanSource } from "./kit-plan";
import type { PackageFetchPort } from "./package-load-flow";
import type { KitManifest, KitManifestV2, KitPlan, LabFailure } from "../../contracts";

/** 제작 패키지 로더와 같은 fetch 포트(`fetchJson`·`fetchBytes`)를 쓴다. 테스트는 가짜 포트를 넣는다. */
export type KitFetchPort = PackageFetchPort;

/** 레시피 `source`(kind: "kit")에서 manifest 로드에 필요한 필드 */
export interface KitManifestRequest {
  readonly kitId: string;
  readonly kitVersion: number;
  /** 있으면 `kit.json` 바이트의 SHA-256과 대조한다(엄격 재현) */
  readonly manifestSha256?: string;
}

export interface KitLoadDeps {
  readonly sha256: (bytes: Uint8Array) => Promise<string>;
  /** 키트 루트 url. 기본은 `KIT_ASSET_ROOT` */
  readonly rootUrl?: string;
  readonly now?: number;
}

interface KitManifestLoadedCommon {
  readonly ok: true;
  readonly manifestUrl: string;
  readonly rootUrl: string;
  /** `manifestSha256`을 요청했을 때만 계산한 실제 해시 */
  readonly observedSha256: string | null;
}

export type KitManifestLoadResult =
  | (KitManifestLoadedCommon & { readonly version: 1; readonly manifest: KitManifest })
  | (KitManifestLoadedCommon & {
      readonly version: 2;
      readonly manifest: KitManifestV2;
      /** v1 형식만 아는 소비자(키트 등록소 `ensure`·`peek`)용 보기 — 층·형태·앵커·UV1·채널은 없다 */
      readonly legacyView: KitManifest;
    })
  | { readonly ok: false; readonly failure: LabFailure };

export type KitPlanLoadResult =
  | { readonly ok: true; readonly plan: KitPlan; readonly manifest: AnyKitManifest; readonly observedSha256: string | null }
  | { readonly ok: false; readonly failure: LabFailure };

export function defaultKitManifestUrl(rootUrl: string = KIT_ASSET_ROOT): string {
  return joinPackageUrl(rootUrl, KIT_MANIFEST_FILENAME);
}

function describeStatus(status: number | null): string {
  return status === null ? "네트워크" : String(status);
}

type ParsedKit = { readonly ok: true; readonly version: 1; readonly manifest: KitManifest } | { readonly ok: true; readonly version: 2; readonly manifest: KitManifestV2 } | { readonly ok: false; readonly failure: LabFailure };

/** v2 schema만 v2 파서로 읽는다. 나머지(v1·모르는 schema)는 v1 파서가 이전과 같은 사유로 판정한다. */
function parseKitJson(json: unknown, now: number | undefined): ParsedKit {
  const schema = typeof json === "object" && json !== null ? (json as { readonly schema?: unknown }).schema : undefined;
  if (schema === KIT_V2_SCHEMA_ID) {
    const v2 = parseKitManifestV2(json, now);
    return v2.ok ? { ok: true, version: 2, manifest: v2.manifest } : v2;
  }
  const v1 = parseKitManifest(json, now);
  return v1.ok ? { ok: true, version: 1, manifest: v1.manifest } : v1;
}

/** `kit.json`을 끝까지 읽고 검증한다. 성공하면 검증된 manifest(두 베이스 능력 선언까지 규칙과 일치)를 돌려준다. */
export async function loadKitManifestFlow(port: KitFetchPort, request: KitManifestRequest, deps: KitLoadDeps): Promise<KitManifestLoadResult> {
  const now = deps.now;
  const rootUrl = deps.rootUrl ?? KIT_ASSET_ROOT;
  const manifestUrl = defaultKitManifestUrl(rootUrl);
  const fail = (code: string, reasonKo: string, detail?: unknown): KitManifestLoadResult => ({ ok: false, failure: failVisible(code, reasonKo, detail, now) });

  let json: unknown;
  let observedSha256: string | null = null;
  if (request.manifestSha256 === undefined) {
    const response = await port.fetchJson(manifestUrl);
    if (!response.ok) {
      return fail("kit-manifest-fetch-failed", `키트 manifest(kit.json)를 불러오지 못했습니다(${describeStatus(response.status)}): ${manifestUrl}`, response.message);
    }
    json = response.json;
  } else {
    const response = await port.fetchBytes(manifestUrl);
    if (!response.ok) {
      return fail("kit-manifest-fetch-failed", `키트 manifest(kit.json)를 불러오지 못했습니다(${describeStatus(response.status)}): ${manifestUrl}`, response.message);
    }
    try {
      observedSha256 = await deps.sha256(response.bytes);
    } catch (error) {
      return { ok: false, failure: isLabFailure(error) ? error : failVisible("kit-manifest-sha-mismatch", "kit.json SHA-256을 계산하지 못해 레시피가 요구한 해시를 확인할 수 없습니다.", error, now) };
    }
    if (observedSha256.toLowerCase() !== request.manifestSha256.toLowerCase()) {
      return fail(
        "kit-manifest-sha-mismatch",
        `kit.json SHA-256이 레시피와 다릅니다(기대 ${request.manifestSha256.slice(0, 12)}…, 실제 ${observedSha256.slice(0, 12)}…).`,
      );
    }
    try {
      json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.bytes)) as unknown;
    } catch (error) {
      return fail("kit-manifest-invalid", "키트 manifest(kit.json)가 올바른 JSON(UTF-8)이 아닙니다.", error);
    }
  }

  const parsed = parseKitJson(json, now);
  if (!parsed.ok) return { ok: false, failure: parsed.failure };
  const manifest = parsed.manifest;

  if (manifest.kitId !== request.kitId) {
    return fail("kit-version-mismatch", `레시피의 키트 id(${request.kitId})가 불러온 키트(${manifest.kitId})와 다릅니다.`);
  }
  if (manifest.kitVersion !== request.kitVersion) {
    return fail("kit-version-mismatch", `레시피의 키트 버전(${request.kitVersion})이 불러온 키트 버전(${manifest.kitVersion})과 다릅니다. 레시피를 고치거나 다른 소스를 고르세요.`);
  }

  const differences = kitCapabilityDifferences(manifest);
  if (differences.size > 0) {
    const summary = [...differences.entries()]
      .slice(0, 2)
      .map(([baseId, items]) => `${baseId}: ${items[0]?.reasonKo ?? "선언 불일치"}${items.length > 1 ? ` 외 ${items.length - 1}건` : ""}`)
      .join(" / ");
    return fail("kit-capabilities-mismatch", `kit.json이 선언한 슬롯 능력이 규칙 판정과 다릅니다 — ${summary}`);
  }
  const common = { ok: true, manifestUrl, rootUrl, observedSha256 } as const;
  return parsed.version === 2 ? { ...common, version: 2, manifest: parsed.manifest, legacyView: kitManifestV1View(parsed.manifest) } : { ...common, version: 1, manifest: parsed.manifest };
}

/** manifest 로드 + 계획 생성을 한 번에(캐시가 필요 없는 호출자·테스트용). 앱 셸은 manifest를 캐시하고 `buildKitPlan`을 따로 쓴다. */
export async function loadKitPlanFlow(
  port: KitFetchPort,
  source: KitPlanSource & { readonly manifestSha256?: string },
  slots: KitPlanSlots,
  deps: KitLoadDeps,
  planOptions: Omit<KitPlanOptions, "rootUrl" | "now"> = {},
): Promise<KitPlanLoadResult> {
  const loaded = await loadKitManifestFlow(port, source, deps);
  if (!loaded.ok) return loaded;
  const built = buildKitPlanDetailed(loaded.manifest, source, slots, { ...planOptions, rootUrl: loaded.rootUrl, now: deps.now });
  if (!built.ok) return built;
  return { ok: true, plan: built.plan, manifest: loaded.manifest, observedSha256: loaded.observedSha256 };
}
