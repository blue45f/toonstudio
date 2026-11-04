import * as THREE from "three";

/** 직렬화·메시 복제 없이 순차 캡처 사이의 작화 상태 변경을 거부한다. */
export function createStudioBg3dThreeSixPassSceneGuard(scene: THREE.Scene, renderer: THREE.WebGLRenderer): () => void {
  const read = (): unknown[] => {
    const values: unknown[] = [renderer.toneMapping, renderer.toneMappingExposure, renderer.outputColorSpace,
      renderer.localClippingEnabled, renderer.shadowMap?.enabled, renderer.shadowMap?.type];
    const textures = new Set<THREE.Texture>();
    const materials = new Set<THREE.Material>();
    const append = (value: unknown) => {
      if (value instanceof THREE.Plane) { append(value.normal); values.push(value.constant); return; }
      if (value instanceof THREE.Color) { values.push(value.r, value.g, value.b); return; }
      if (value instanceof THREE.Euler) { values.push(value.x, value.y, value.z, value.order); return; }
      if (value instanceof THREE.Matrix3 || value instanceof THREE.Matrix4) { values.push(...value.elements); return; }
      if (value instanceof THREE.Vector4 || value instanceof THREE.Quaternion) { values.push(value.x, value.y, value.z, value.w); return; }
      if (value instanceof THREE.Vector3) { values.push(value.x, value.y, value.z); return; }
      if (value instanceof THREE.Vector2) { values.push(value.x, value.y); return; }
      if (Array.isArray(value)) { values.push(value.length); value.forEach(append); return; }
      values.push(value);
      if (value instanceof THREE.Texture) textures.add(value);
    };
    const record = (source: object, ignored: ReadonlySet<string> = new Set()) => {
      for (const [key, value] of Object.entries(source)) {
        if (ignored.has(key) || key === "userData") continue;
        values.push(key); append(value);
      }
    };
    const transform = (object: THREE.Object3D) => {
      values.push(object, object.parent, object.visible, object.layers.mask, object.matrixAutoUpdate, object.matrixWorldAutoUpdate,
        object.castShadow, object.receiveShadow, object.frustumCulled, object.renderOrder);
      append(object.position); append(object.quaternion); append(object.scale);
      if (!object.matrixAutoUpdate) append(object.matrix);
      if (!object.matrixWorldAutoUpdate) append(object.matrixWorld);
    };
    append(scene.background); append(scene.backgroundRotation); append(scene.environment); append(scene.environmentRotation);
    values.push(scene.backgroundBlurriness, scene.backgroundIntensity, scene.environmentIntensity, scene.overrideMaterial);
    if (scene.fog) { values.push(scene.fog); record(scene.fog); } else values.push(null);
    scene.traverseVisible((object) => {
      transform(object);
      if (object instanceof THREE.Mesh) {
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        values.push(entries.length, ...entries); entries.forEach((material) => materials.add(material));
        append(object.morphTargetInfluences);
        const geometry: THREE.BufferGeometry = object.geometry;
        values.push(geometry, geometry.index, geometry.index?.version, geometry.drawRange.start, geometry.drawRange.count);
        for (const group of geometry.groups) values.push(group.start, group.count, group.materialIndex);
        const attributeState = (name: string, attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
          values.push(name, attribute, attribute.itemSize, attribute.count, attribute.normalized,
            attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute.version);
        };
        for (const [name, attribute] of Object.entries(geometry.attributes)) attributeState(name, attribute);
        for (const name of ["position", "normal", "color"] as const) {
          geometry.morphAttributes[name]?.forEach((attribute, index) => attributeState(`${name}:${index}`, attribute));
        }
        values.push(geometry.morphTargetsRelative);
        if (object instanceof THREE.InstancedMesh) values.push(object.count, object.instanceMatrix, object.instanceMatrix.version,
          object.instanceColor, object.instanceColor?.version, object.morphTexture, object.morphTexture?.version);
        if (object instanceof THREE.SkinnedMesh) {
          values.push(object.skeleton); append(object.bindMatrix); append(object.bindMatrixInverse);
          for (const bone of object.skeleton.bones) transform(bone);
        }
      }
      if (object instanceof THREE.Light) {
        // shadow 행렬·map·needsUpdate와 렌더러가 유도하는 camera 값은 작화 입력에서 제외한다.
        const ignored = new Set(["matrix", "matrixWorld", "modelViewMatrix", "normalMatrix", "matrixWorldNeedsUpdate", "shadow"]);
        record(object, ignored);
        if ("target" in object && object.target instanceof THREE.Object3D) transform(object.target);
        if ("shadow" in object && object.shadow instanceof THREE.LightShadow) {
          const shadow = object.shadow;
          values.push(shadow.bias, shadow.normalBias, shadow.radius, shadow.blurSamples, shadow.intensity,
            shadow.autoUpdate, shadow.camera.near);
          if (object instanceof THREE.DirectionalLight) {
            const camera = shadow.camera;
            if (camera instanceof THREE.OrthographicCamera) values.push(camera.far, camera.left, camera.right, camera.top, camera.bottom, camera.zoom);
          }
        }
      }
    });
    for (const material of materials) {
      values.push(material);
      record(material, new Set(["_listeners", "uniformsNeedUpdate"]));
    }
    for (const texture of textures) {
      values.push(texture, texture.version, texture.source, texture.source.version);
      record(texture, new Set(["_listeners", "source", "image", "pmremVersion", ...(texture.matrixAutoUpdate ? ["matrix"] : [])]));
    }
    return values;
  };
  const initial = read();
  return () => {
    const current = read();
    if (current.length !== initial.length || current.some((value, index) => !Object.is(value, initial[index]))) {
      throw new Error("6패스 LT 캡처 중 장면이 변경되었습니다. 애니메이션·턴테이블을 멈춘 뒤 다시 실행해 주세요.");
    }
  };
}
