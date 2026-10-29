/** WebGL MToon의 대상별 compiler 보정은 생성·clone·copy에서 같은 재질 인스턴스를 읽는다. */
import { MToonMaterial } from "@pixiv/three-vrm";

import { hasStudioMToonRuntimeFactors } from "./studio-mtoon-runtime-factors";
import { readStudioMToonRuntimeIdentity, registerStudioMToonRuntimeMaterial } from "./studio-mtoon-runtime-identity";
import { studioMToonWebGlCopySource } from "./studio-mtoon-webgl-copy";

const LINEARSTEP_SOURCE = "float linearstep( float a, float b, float t ) {\n  return clamp( ( t - a ) / ( b - a ), 0.0, 1.0 );\n}";
const LINEARSTEP_GUARDED = "float linearstep( float a, float b, float t ) {\n  if ( a == b ) { return step( a, t ); }\n  return clamp( ( t - a ) / ( b - a ), 0.0, 1.0 );\n}";
const SCREEN_WIDTH_SOURCE = "      outlineOffset *= vViewPosition.z / projectionMatrix[ 1 ].y;";
const SCREEN_WIDTH_GUARDED = "      outlineOffset *= ( projectionMatrix[ 3 ][ 3 ] == 0.0 ? vViewPosition.z : 1.0 ) / projectionMatrix[ 1 ].y;";
const SHADER_PATCH_REVISION = "toonstudio-mtoon-equal-boundary/1;orthographic-width/1";
const sdkUpdate = MToonMaterial.prototype.update, sdkRender = MToonMaterial.prototype.onBeforeRender, sdkCopy = MToonMaterial.prototype.copy;

/** SDK의 정확한 함수 하나만 보정한다. 이미 패치되었거나 SDK 원문이 달라졌으면 조용히 다른 shader를 쓰지 않는다. */
export function patchStudioMToonEqualBoundary(fragmentShader: string): string {
  if (fragmentShader.includes(LINEARSTEP_GUARDED) || fragmentShader.split(LINEARSTEP_SOURCE).length !== 2) {
    throw new Error("MToon 경계 함수 원문이 일치하지 않거나 중복되어 shader를 안전하게 구성할 수 없습니다.");
  }
  return fragmentShader.replace(LINEARSTEP_SOURCE, LINEARSTEP_GUARDED);
}

/** 원근의 양수 view depth 보정은 유지하고, 직교에서는 clip w=1에 맞춰 깊이 항을 제외한다. */
export function patchStudioMToonProjectionWidth(vertexShader: string): string {
  if (vertexShader.includes(SCREEN_WIDTH_GUARDED) || vertexShader.split(SCREEN_WIDTH_SOURCE).length !== 2) {
    throw new Error("MToon 화면폭 문장 원문이 일치하지 않거나 중복되어 shader를 안전하게 구성할 수 없습니다.");
  }
  return vertexShader.replace(SCREEN_WIDTH_SOURCE, SCREEN_WIDTH_GUARDED);
}

function installStudioMToonWebGlGuards(material: MToonMaterial): void {
  // toony=1이면 linearstep(-1+toony,1-toony,t)의 양 끝이 0으로 같아진다. 저장된 toony는 그대로 둔다.
  patchStudioMToonEqualBoundary(material.fragmentShader);
  patchStudioMToonProjectionWidth(material.vertexShader);
  const compile = material.onBeforeCompile; const cacheKey = material.customProgramCacheKey;
  const guardedCompile: MToonMaterial["onBeforeCompile"] = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = patchStudioMToonEqualBoundary(shader.fragmentShader);
    shader.vertexShader = patchStudioMToonProjectionWidth(shader.vertexShader);
  };
  const guardedCacheKey = () => `${SHADER_PATCH_REVISION}:${cacheKey.call(material)}`;
  material.onBeforeCompile = guardedCompile;
  material.customProgramCacheKey = guardedCacheKey;
  const vertexShader = material.vertexShader, fragmentShader = material.fragmentShader;
  registerStudioMToonRuntimeMaterial(material, {
    backend: "webgl", revision: SHADER_PATCH_REVISION,
    validate: () => material.onBeforeCompile === guardedCompile && material.customProgramCacheKey === guardedCacheKey
      && material.vertexShader === vertexShader && material.fragmentShader === fragmentShader
      && material.update === sdkUpdate && material.onBeforeRender === sdkRender && material.copy === ownedCopy
      && MToonMaterial.prototype.update === sdkUpdate && MToonMaterial.prototype.onBeforeRender === sdkRender
      && MToonMaterial.prototype.copy === sdkCopy && hasStudioMToonRuntimeFactors(material),
  });
}

/** SDK clone은 this.constructor를 호출하므로 원본 callback closure를 복사하지 않아도 보정을 보존한다. */
export class StudioMToonMaterial extends MToonMaterial {
  constructor(parameters: ConstructorParameters<typeof MToonMaterial>[0] = {}) {
    super(parameters);
    try { installStudioMToonWebGlGuards(this); }
    catch (error) { this.dispose(); throw error; }
  }
  override copy(source: MToonMaterial): this {
    if (source instanceof StudioMToonMaterial && !readStudioMToonRuntimeIdentity(source)) throw new Error("변조된 WebGL MToon 재질을 복제할 수 없습니다.");
    super.copy(studioMToonWebGlCopySource(source));
    this.flatShading = source.flatShading;
    return this;
  }
}
const ownedCopy = StudioMToonMaterial.prototype.copy;
