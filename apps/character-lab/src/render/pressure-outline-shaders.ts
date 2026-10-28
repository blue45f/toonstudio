/**
 * 화면 축 기준 역방향 hull. 공유 정점·morph·스키닝을 먼저 적용한 뒤 뷰 법선을 가로·세로로 다르게 확장한다.
 * Babylon include와 기존 캐릭터 정점 계약을 사용하며 경쟁 제품 셰이더 코드는 사용하지 않는다.
 */
export const PRESSURE_OUTLINE_SHADER = "clPressureOutline";

export const PRESSURE_OUTLINE_VERTEX_GLSL = `precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
#include<bonesDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
uniform mat4 view;
uniform mat4 projection;
uniform vec3 outlineSize;
uniform mat4 diffuseMatrix;
varying vec2 vUV;
void main(void) {
  vec3 positionUpdated = position;
  vec3 normalUpdated = normal;
  vec2 uvUpdated = uv;
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
  vec4 worldPos = finalWorld * vec4(positionUpdated, 1.0);
  mat3 normalMatrix = mat3(cross(finalWorld[1].xyz, finalWorld[2].xyz), cross(finalWorld[2].xyz, finalWorld[0].xyz), cross(finalWorld[0].xyz, finalWorld[1].xyz));
  float orientation = sign(dot(finalWorld[0].xyz, cross(finalWorld[1].xyz, finalWorld[2].xyz)));
  vec3 transformedNormal = normalMatrix * normalUpdated * orientation;
  vec3 normalW = transformedNormal / max(length(transformedNormal), 0.000001);
  vec3 normalV = normalize(mat3(view) * normalW);
  vec4 positionV = view * worldPos;
  positionV.xyz += normalV * outlineSize;
  gl_Position = projection * positionV;
  vUV = (diffuseMatrix * vec4(uvUpdated, 1.0, 0.0)).xy;
}`;

export const PRESSURE_OUTLINE_VERTEX_WGSL = `#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
#include<bonesDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
uniform outlineSize: vec3f;
uniform diffuseMatrix: mat4x4f;
varying vUV: vec2f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  var positionUpdated = vertexInputs.position;
  var normalUpdated = vertexInputs.normal;
  var uvUpdated = vertexInputs.uv;
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
  let worldPos = finalWorld * vec4f(positionUpdated, 1.0);
  let normalMatrix = mat3x3f(cross(finalWorld[1].xyz, finalWorld[2].xyz), cross(finalWorld[2].xyz, finalWorld[0].xyz), cross(finalWorld[0].xyz, finalWorld[1].xyz));
  let orientation = sign(dot(finalWorld[0].xyz, cross(finalWorld[1].xyz, finalWorld[2].xyz)));
  let transformedNormal = normalMatrix * normalUpdated * orientation;
  let normalW = transformedNormal / max(length(transformedNormal), 0.000001);
  let normalV = normalize(mat3x3f(scene.view[0].xyz, scene.view[1].xyz, scene.view[2].xyz) * normalW);
  var positionV = scene.view * worldPos;
  positionV = vec4f(positionV.xyz + normalV * uniforms.outlineSize, positionV.w);
  vertexOutputs.position = scene.projection * positionV;
  vertexOutputs.vUV = (uniforms.diffuseMatrix * vec4f(uvUpdated, 1.0, 0.0)).xy;
}`;

export const PRESSURE_OUTLINE_FRAGMENT_GLSL = `precision highp float;
varying vec2 vUV;
uniform vec4 outlineColor;
uniform vec2 alphaSettings;
uniform sampler2D albedoSampler;
void main(void) {
  float texAlpha = texture2D(albedoSampler, vUV).a;
  if (alphaSettings.x > 0.0 && texAlpha < alphaSettings.x) discard;
  gl_FragColor = vec4(outlineColor.rgb, outlineColor.a * mix(1.0, texAlpha, alphaSettings.y));
}`;

export const PRESSURE_OUTLINE_FRAGMENT_WGSL = `varying vUV: vec2f;
uniform outlineColor: vec4f;
uniform alphaSettings: vec2f;
var albedoSampler: texture_2d<f32>;
var albedoSamplerSampler: sampler;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let texAlpha = textureSample(albedoSampler, albedoSamplerSampler, fragmentInputs.vUV).a;
  if (uniforms.alphaSettings.x > 0.0 && texAlpha < uniforms.alphaSettings.x) { discard; }
  fragmentOutputs.color = vec4f(uniforms.outlineColor.rgb, uniforms.outlineColor.a * mix(1.0, texAlpha, uniforms.alphaSettings.y));
}`;
