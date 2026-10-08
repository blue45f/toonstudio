/**
 * 브라우저 전용: `fetch`로 kit.json을 읽고 `crypto.subtle` SHA-256으로 검증한다(kit-load-flow의 얇은 바인딩).
 * GLB 바이트는 여기서 받지 않는다 — 렌더 엔진이 계획의 url·sha256·bytes로 직접 받아 검증한다(계약 4.2).
 * 테스트는 이 파일을 import하지 않고 kit-load-flow를 가짜 포트로 검증한다.
 */
import { sha256Hex } from "../../shared/hash";

import { loadKitManifestFlow, loadKitPlanFlow } from "./kit-load-flow";
import { createFetchPackagePort } from "./package-load-flow";

import type { KitManifestLoadResult, KitManifestRequest, KitPlanLoadResult } from "./kit-load-flow";
import type { KitPlanOptions, KitPlanSlots, KitPlanSource } from "./kit-plan";

export interface BrowserKitLoadOptions {
  readonly rootUrl?: string;
}

export function loadKitManifest(request: KitManifestRequest, options: BrowserKitLoadOptions = {}): Promise<KitManifestLoadResult> {
  return loadKitManifestFlow(createFetchPackagePort(globalThis.fetch.bind(globalThis)), request, { sha256: sha256Hex, rootUrl: options.rootUrl, now: Date.now() });
}

export function loadKitPlan(
  source: KitPlanSource & { readonly manifestSha256?: string },
  slots: KitPlanSlots,
  options: BrowserKitLoadOptions & Omit<KitPlanOptions, "rootUrl" | "now"> = {},
): Promise<KitPlanLoadResult> {
  const { rootUrl, ...planOptions } = options;
  return loadKitPlanFlow(createFetchPackagePort(globalThis.fetch.bind(globalThis)), source, slots, { sha256: sha256Hex, rootUrl, now: Date.now() }, planOptions);
}
