/**
 * .skp(SketchUp) → GLB 변환 파사드.
 *
 * .skp는 Trimble의 독점 바이너리 포맷이지만, MIT 라이선스의 OpenSKP(openskp, npm)가
 * 브라우저에서 동작하는 순수 TypeScript 파서를 제공한다(VFF 2021+ / 레거시 MFC 2013–2020).
 *
 * 활성화 상태 (2026-10-06): openskp 1.3.0이 정식 의존성으로 선언됐고, 아래 로더는 실제
 * 동적 import로 번들의 lazy chunk에 포함된다. 패키지가 없던 시절의 @vite-ignore 우회는
 * 제거됐다. 동적 import 자체가 실패하는 경우(청크 로드 실패 등)에만 정직하게 "변환기를
 * 사용할 수 없음"으로 실패하고, 가짜 변환이나 조용한 스킵을 하지 않는다.
 *
 * 브라우저 변환 경로(공식 TS 문서 기준): `toGLB(buildScene(arrayBuffer))`.
 * 단계 추출(선화/음영/밑색)은 변환된 GLB가 기존 3D 가져오기·멀티패스 PSD 파이프라인에
 * 합류하는 것으로 충족한다 — .skp 전용 단계 추출기를 따로 만들지 않는다.
 *
 * 알려진 한계(상위에서 사용자에게 그대로 안내한다): 프로젝트가 젊고, 레거시 실파일
 * 일부는 파싱에 실패할 수 있다. 실패 시 대안은 SketchUp에서 DAE·GLB로 내보내 가져오기.
 */

export class StudioBg3dSkpConverterUnavailableError extends Error {
  readonly code = "skp-converter-unavailable" as const;

  constructor(message = "openskp 패키지를 불러오지 못해 .skp 변환을 사용할 수 없습니다.") {
    super(message);
    this.name = "StudioBg3dSkpConverterUnavailableError";
  }
}

export class StudioBg3dSkpParseError extends Error {
  readonly code = "skp-parse-failed" as const;

  constructor(message = ".skp 파일 구조를 해석하지 못했습니다.") {
    super(message);
    this.name = "StudioBg3dSkpParseError";
  }
}

/** OpenSKP 모듈의 최소 구조 계약 — 설치본의 실제 export와 대조해 런타임에 검증한다. */
export interface OpenSkpModuleLike {
  readonly buildScene: (source: ArrayBuffer) => unknown;
  readonly toGLB: (scene: unknown) => Uint8Array | ArrayBuffer;
}

export type OpenSkpModuleLoader = () => Promise<OpenSkpModuleLike>;

function isOpenSkpModuleLike(value: unknown): value is OpenSkpModuleLike {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { buildScene?: unknown; toGLB?: unknown };
  return typeof candidate.buildScene === "function" && typeof candidate.toGLB === "function";
}

async function loadOpenSkpModuleDefault(): Promise<OpenSkpModuleLike> {
  let loaded: unknown;
  try {
    loaded = await import("openskp");
  } catch {
    throw new StudioBg3dSkpConverterUnavailableError();
  }
  if (!isOpenSkpModuleLike(loaded)) {
    throw new StudioBg3dSkpConverterUnavailableError(
      "openskp 패키지의 변환 API(buildScene/toGLB)를 확인하지 못했습니다.",
    );
  }
  return loaded;
}

let cachedModulePromise: Promise<OpenSkpModuleLike> | null = null;

function loadOpenSkpModule(): Promise<OpenSkpModuleLike> {
  cachedModulePromise ??= loadOpenSkpModuleDefault().catch((error: unknown) => {
    cachedModulePromise = null;
    throw error;
  });
  return cachedModulePromise;
}

/** 테스트 전용: 모듈 로더 캐시를 비운다. */
export function resetStudioBg3dSkpModuleCacheForTests(): void {
  cachedModulePromise = null;
}

function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function glbMagicOk(bytes: Uint8Array): boolean {
  // GLB magic "glTF" (0x46546C67, little-endian).
  return (
    bytes.byteLength >= 4
    && bytes[0] === 0x67
    && bytes[1] === 0x6c
    && bytes[2] === 0x54
    && bytes[3] === 0x46
  );
}

/**
 * .skp 바이트를 자체 포함 GLB 바이트로 변환한다.
 * 변환기가 없으면 StudioBg3dSkpConverterUnavailableError, 파서가 파일을 거부하면
 * StudioBg3dSkpParseError로 실패한다. 빈 결과나 GLB가 아닌 결과도 파싱 실패로 취급한다.
 */
export async function convertStudioBg3dSkpToGlb(
  bytes: ArrayBuffer | Uint8Array,
  loadModule: OpenSkpModuleLoader = loadOpenSkpModule,
): Promise<Uint8Array> {
  const module = await loadModule();
  let glb: Uint8Array | ArrayBuffer;
  try {
    const scene = module.buildScene(toArrayBuffer(bytes));
    glb = module.toGLB(scene);
  } catch (error) {
    if (error instanceof StudioBg3dSkpConverterUnavailableError) throw error;
    throw new StudioBg3dSkpParseError(
      error instanceof Error ? `.skp 파일 구조를 해석하지 못했습니다: ${error.message}` : undefined,
    );
  }
  const out = glb instanceof Uint8Array ? glb : new Uint8Array(glb);
  if (out.byteLength === 0 || !glbMagicOk(out)) {
    throw new StudioBg3dSkpParseError(".skp 변환 결과가 올바른 GLB가 아닙니다.");
  }
  return out;
}
