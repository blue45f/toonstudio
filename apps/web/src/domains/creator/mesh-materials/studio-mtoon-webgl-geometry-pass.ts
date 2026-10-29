/** MToon의 본체 coverage를 그대로 사용하는 일회성 WebGL 기하 패스다. beauty 승인과 분리한다. */
import { MToonMaterial } from "@pixiv/three-vrm";
import { NoBlending, ShaderChunk, ShaderLib, type Material } from "three";

import { readStudioMToonRuntimeIdentity } from "./studio-mtoon-runtime-identity";
import { studioMToonWebGlCopySource } from "./studio-mtoon-webgl-copy";
import { patchStudioMToonEqualBoundary, patchStudioMToonProjectionWidth } from "./studio-mtoon-webgl-runtime";

export type StudioMToonWebGlGeometryPassKind = "normal" | "depth";
export interface StudioMToonGeometryShader {
  readonly vertexShader: string;
  readonly fragmentShader: string;
}

const NORMAL_BLOCK = "  #ifdef DEBUG_NORMAL\n    gl_FragColor = vec4( 0.5 + 0.5 * normal, 1.0 );\n    return;\n  #endif";
const PRECISION_DECLARATION = "varying vec2 vHighPrecisionZW;";
const PRECISION_ASSIGNMENT = "vHighPrecisionZW = gl_Position.zw;";
const CLIPPING_VERTEX = "#include <clipping_planes_vertex>";
const PASS_REVISION = "toonstudio-mtoon-webgl-geometry/1";

function requireOnce(source: string, token: string): void {
  if (source.split(token).length !== 2) {
    throw new Error("MToon 기하 패스 shader 원문이 일치하지 않거나 중복되었습니다.");
  }
}

/** 설치된 Three 공개 ShaderLib의 깊이 좌표식과 packing 호출을 사용한다. near/far를 새로 해석하지 않는다. */
function readThreeDepthOutput(): string {
  const { vertexShader, fragmentShader } = ShaderLib.depth;
  requireOnce(vertexShader, PRECISION_DECLARATION);
  requireOnce(vertexShader, PRECISION_ASSIGNMENT);
  const coordinateBlocks = fragmentShader.match(/#ifdef USE_REVERSED_DEPTH_BUFFER[\s\S]*?#endif/gu);
  const packing = "gl_FragColor = packDepthToRGBA( fragCoordZ );";
  if (coordinateBlocks?.length !== 1) {
    throw new Error("Three 깊이 좌표식 원문을 안전하게 확인할 수 없습니다.");
  }
  requireOnce(fragmentShader, packing);
  requireOnce(ShaderChunk.packing, "vec4 packDepthToRGBA( const in float v ) {");
  return `${coordinateBlocks[0]}\n    ${packing}\n    return;`;
}

/** SDK의 정확한 debugNormal 블록 하나만 깊이 출력으로 바꾼다. 재적용·불일치는 명시적으로 거부한다. */
export function patchStudioMToonGeometryDepthShader(shader: StudioMToonGeometryShader): StudioMToonGeometryShader {
  const { vertexShader, fragmentShader } = shader;
  if (vertexShader.includes("vHighPrecisionZW") || fragmentShader.includes("vHighPrecisionZW")) {
    throw new Error("MToon 깊이 패스가 이미 적용되었거나 정밀도 varying 이름이 충돌합니다.");
  }
  requireOnce(vertexShader, "void main() {");
  requireOnce(vertexShader, CLIPPING_VERTEX);
  requireOnce(fragmentShader, NORMAL_BLOCK);
  requireOnce(fragmentShader, "#include <packing>");
  const depthOutput = readThreeDepthOutput();
  return {
    vertexShader: vertexShader.replace("void main() {", `${PRECISION_DECLARATION}\n\nvoid main() {`)
      .replace(CLIPPING_VERTEX, `${CLIPPING_VERTEX}\n  ${PRECISION_ASSIGNMENT}`),
    fragmentShader: fragmentShader.replace(NORMAL_BLOCK, `  #ifdef DEBUG_NORMAL\n    ${depthOutput}\n  #endif`)
      .replace("void main() {", `${PRECISION_DECLARATION}\n\nvoid main() {`),
  };
}

/**
 * 원본 geometry·텍스처·UV 시계는 바꾸지 않는다. 반환 재질은 호출자가 dispose하는 고정 시각의 내부 snapshot이다.
 * outline 슬롯은 호출자가 제외한다. reverse depth는 Three의 raw packing과 같으며 후속 정규화 계약은 캡처가 소유한다.
 */
export function createStudioMToonWebGlGeometryPass(
  source: Material,
  kind: StudioMToonWebGlGeometryPassKind,
): MToonMaterial {
  if (kind !== "normal" && kind !== "depth") throw new Error("지원하지 않는 MToon 기하 패스입니다.");
  if (!(source instanceof MToonMaterial) || readStudioMToonRuntimeIdentity(source)?.backend !== "webgl" || source.isOutline) {
    throw new Error("승인된 WebGL MToon 본체만 기하 패스로 복제할 수 있습니다.");
  }
  // SDK copy는 uniform/색/clip plane을 독립 복제하면서 이미지 Texture 참조와 UV 시각을 보존한다.
  const pass = new MToonMaterial();
  // compiler 실패와 캡처 소유자의 finally가 같은 임시 인스턴스를 정리해도 dispose event는 한 번만 보낸다.
  const dispose = pass.dispose;
  let disposed = false;
  pass.dispose = () => {
    if (disposed) return;
    disposed = true;
    dispose.call(pass);
  };
  try {
    pass.copy(studioMToonWebGlCopySource(source));
    // ShaderMaterial의 SDK copy는 flatShading을 별도로 전달하지 않는다.
    pass.flatShading = source.flatShading;
    pass.isOutline = false;
    pass.debugMode = "normal";
    pass.normalMap = null;
    // 기하 normal은 normalMap 이전의 view-space 표면 법선이다. 나머지 명암용 map은 coverage와 무관하다.
    pass.emissiveMap = null; pass.shadeMultiplyTexture = null; pass.shadingShiftTexture = null;
    pass.matcapTexture = null; pass.rimMultiplyTexture = null; pass.outlineWidthMultiplyTexture = null;
    pass.blending = NoBlending; pass.transparent = false; pass.depthWrite = true;
    pass.toneMapped = false; pass.fog = false;
    // copy가 보존한 live uniform이 캡처 순간 beauty의 권위다. update(0)도 stale 속성으로 덮어쓰므로 호출하지 않는다.
    requireOnce(pass.fragmentShader, NORMAL_BLOCK);
    // 생성 시에도 SDK 변경을 검사해 shader 컴파일 이전 실패에서 임시 재질을 정리한다.
    const checked = {
      vertexShader: patchStudioMToonProjectionWidth(pass.vertexShader),
      fragmentShader: patchStudioMToonEqualBoundary(pass.fragmentShader),
    };
    if (kind === "depth") patchStudioMToonGeometryDepthShader(checked);
    const compile = pass.onBeforeCompile, cacheKey = pass.customProgramCacheKey;
    pass.onBeforeCompile = (shader, renderer) => {
      try {
        compile.call(pass, shader, renderer);
        requireOnce(shader.fragmentShader, NORMAL_BLOCK);
        const guarded = {
          vertexShader: patchStudioMToonProjectionWidth(shader.vertexShader),
          fragmentShader: patchStudioMToonEqualBoundary(shader.fragmentShader),
        };
        const result = kind === "depth" ? patchStudioMToonGeometryDepthShader(guarded) : guarded;
        shader.vertexShader = result.vertexShader; shader.fragmentShader = result.fragmentShader;
      } catch (error) {
        pass.dispose();
        throw error;
      }
    };
    pass.customProgramCacheKey = () => `${PASS_REVISION}:${kind}:${cacheKey.call(pass)}`;
    // 일반 beauty registry에는 등록하지 않는다. capture의 한 번의 draw 외에 update()로 시계를 진행하지 않는다.
    return pass;
  } catch (error) {
    pass.dispose();
    throw error;
  }
}
