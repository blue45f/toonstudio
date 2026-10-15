/**
 * 번들 크기 비교용 최소 진입점: Three 를 GLB 로드 + 툰 렌더에 필요한 심볼만 가져와 트리셰이킹된 크기를 잰다.
 * (full 번들은 Meshopt/Draco/KTX2 로더 JS 까지 포함해 확장 호환 시험에 쓴다.)
 */
import {
  AmbientLight,
  BackSide,
  Box3,
  DataTexture,
  DirectionalLight,
  Mesh,
  MeshToonMaterial,
  NearestFilter,
  PerspectiveCamera,
  RedFormat,
  Scene,
  SkinnedMesh,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const used = [AmbientLight, BackSide, Box3, DataTexture, DirectionalLight, Mesh, MeshToonMaterial, NearestFilter, PerspectiveCamera, RedFormat, Scene, SkinnedMesh, Vector2, Vector3, WebGLRenderer, GLTFLoader];
