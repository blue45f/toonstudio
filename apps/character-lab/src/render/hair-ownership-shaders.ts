/** 색이 아닌 실제 가시 기하의 헤어 coverage를 기록한다. 정점 경로는 기존 캐릭터 셰이더를 그대로 사용한다. */
export const HAIR_OWNERSHIP_SHADER = "clHairOwnership";
export const HAIR_OWNERSHIP_FRAGMENT_GLSL = `precision highp float;
varying vec2 vUV;
uniform vec3 ownershipColor;
uniform mat4 ownershipUVMatrix;
uniform vec4 alphaParams;
uniform sampler2D albedoSampler;
void main(void) {
  vec2 uv = (ownershipUVMatrix * vec4(vUV, 1.0, 0.0)).xy;
  if (alphaParams.x > 0.0 && texture2D(albedoSampler, uv).a < alphaParams.x) discard;
  gl_FragColor = vec4(ownershipColor, 1.0);
}`;
export const HAIR_OWNERSHIP_FRAGMENT_WGSL = `varying vUV: vec2f;
uniform ownershipColor: vec3f;
uniform ownershipUVMatrix: mat4x4f;
uniform alphaParams: vec4f;
var albedoSampler: texture_2d<f32>;
var albedoSamplerSampler: sampler;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uv = (uniforms.ownershipUVMatrix * vec4f(fragmentInputs.vUV, 1.0, 0.0)).xy;
  if (uniforms.alphaParams.x > 0.0 && textureSample(albedoSampler, albedoSamplerSampler, uv).a < uniforms.alphaParams.x) { discard; }
  fragmentOutputs.color = vec4f(uniforms.ownershipColor, 1.0);
}`;
