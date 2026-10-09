import { LaneUnavailableError } from "../../engine/core/errors";

/**
 * Rapier 2D(compat 빌드) 지연 로더. 외부 물리 패키지 import는 `lanes/physics/**`에서만 허용된다(`boundary.test.ts`).
 *
 * - `@dimforge/rapier2d-compat`(Apache-2.0)는 wasm(약 2.4 MB)을 base64로 JS에 내장한 빌드라 JS gzip이 약 1.29 MB다(`rapier-footprint.ts`가 크기·시간 수치의 단일 출처).
 *   그래서 **동적 import**로만 부르고(정적 import 금지), 레인 `init()` 시점에 처음 불러온다.
 * - 무음 대체 금지(ADR-0018): 불러오기·`init()`·모듈 모양 검사가 실패하면 `LaneUnavailableError`(사유 코드 + 한글 문구)로 드러낸다.
 *   자체 PBD로 몰래 바꾸지 않는다.
 * - 로더는 주입할 수 있다(`RapierImporter`). 실패 경로는 스텁 임포터로 시험한다.
 */

/** Rapier 모듈의 형태(타입만 가져온다 — 런타임 import는 동적 import 한 곳뿐이다). */
export type RapierModule = (typeof import("@dimforge/rapier2d-compat"))["default"];

/** `import()`가 돌려주는 네임스페이스의 최소 모양. */
export interface RapierNamespaceLike {
  readonly default?: unknown;
}

/** 모듈을 불러오는 함수. 기본값은 `@dimforge/rapier2d-compat`의 동적 import다. */
export type RapierImporter = () => Promise<RapierNamespaceLike>;

/** 로드 실패 단계. 영수증·UI가 사유를 구분해 보인다. */
export type RapierLoadStage = "wasm-support" | "import" | "shape" | "init";

export const RAPIER_PACKAGE = "@dimforge/rapier2d-compat";
export const RAPIER_PACKAGE_VERSION = "0.21.0";

/** 기본 임포터: 번들러가 별도 청크로 분리하도록 리터럴 지정자로 동적 import한다. */
export const defaultRapierImporter: RapierImporter = () => import("@dimforge/rapier2d-compat");

let cached: Promise<RapierModule> | null = null;

/** 캐시를 비운다(시험용). */
export function resetRapierLoaderCache(): void {
  cached = null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(code: "wasm-artifact-missing" | "wasm-integrity-mismatch" | "feature-missing", stage: RapierLoadStage, messageKo: string, cause?: unknown): LaneUnavailableError {
  return new LaneUnavailableError(code, messageKo, { laneId: "bristle-rapier", package: RAPIER_PACKAGE, stage, ...(cause === undefined ? {} : { cause: messageOf(cause) }) });
}

function isRapierModule(value: unknown): value is RapierModule {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return typeof m.init === "function" && typeof m.World === "function" && typeof m.RigidBodyDesc === "function" && typeof m.ColliderDesc === "function" && typeof m.JointData === "function";
}

/**
 * Rapier를 불러오고 `RAPIER.init()`까지 끝낸다. 기본 임포터(주입 없음)일 때만 프로세스 안에서 한 번 캐시한다
 * (실패는 캐시하지 않아 다시 시도할 수 있다). 주입한 임포터는 매번 실행한다.
 */
export async function loadRapier(importer?: RapierImporter): Promise<RapierModule> {
  if (typeof WebAssembly !== "object" || WebAssembly === null) {
    throw fail("feature-missing", "wasm-support", "이 환경에는 WebAssembly가 없어 Rapier 물리 엔진을 쓸 수 없다");
  }
  if (importer !== undefined) return loadWith(importer);
  cached ??= loadWith(defaultRapierImporter).catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

async function loadWith(importer: RapierImporter): Promise<RapierModule> {
  let ns: RapierNamespaceLike;
  try {
    ns = await importer();
  } catch (error) {
    throw fail("wasm-artifact-missing", "import", `Rapier 물리 모듈(${RAPIER_PACKAGE})을 불러오지 못했다: ${messageOf(error)}`, error);
  }
  const mod = ns.default;
  if (!isRapierModule(mod)) {
    throw fail("wasm-integrity-mismatch", "shape", `Rapier 물리 모듈의 모양이 예상과 다르다(default 내보내기에 init·World·RigidBodyDesc·ColliderDesc·JointData가 없다). 패키지 버전 ${RAPIER_PACKAGE_VERSION}을 확인하라`);
  }
  try {
    await mod.init();
  } catch (error) {
    throw fail("wasm-artifact-missing", "init", `Rapier wasm 초기화(RAPIER.init)에 실패했다: ${messageOf(error)}`, error);
  }
  return mod;
}
