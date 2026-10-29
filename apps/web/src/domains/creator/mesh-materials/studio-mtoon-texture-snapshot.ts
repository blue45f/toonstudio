/** 캡처의 sampling state만 소유하고 원본 TextureSource의 시계·image 수명을 건드리지 않는다. */
import { Texture, TextureSource } from "three";

/**
 * image/data payload는 읽기 전용으로 빌린다. 원본 Texture/Source는 복제·dispose 대상이 아니다.
 * Texture.copy의 needsUpdate가 공유 Source.version을 올리지 않도록 source 읽기만 독립 객체로 바꾼다.
 */
export function cloneStudioMToonTextureSnapshot(source: Texture): Texture {
  const ownedSource = new TextureSource(source.source.data);
  ownedSource.dataReady = source.source.dataReady;
  const shadow = new Proxy(source, { get(target, property) {
    return property === "source" ? ownedSource : Reflect.get(target, property, target);
  } });
  const snapshot = Texture.prototype.clone.call(shadow);
  if (snapshot === source || snapshot.source !== ownedSource) {
    if (snapshot !== source) snapshot.dispose();
    throw new Error("텍스처의 독립 sampling snapshot을 만들지 못했습니다.");
  }
  try {
    // auto matrix의 다음 draw 값을 복제본에서만 계산한다. 수동 matrix는 원문 그대로 보존한다.
    if (snapshot.matrixAutoUpdate) snapshot.updateMatrix();
    snapshot.matrixAutoUpdate = false;
    return snapshot;
  } catch (error) { snapshot.dispose(); throw error; }
}

/** SDK UniformsUtils.clone에 전달할 읽기 전용 facade다. 생성한 Texture 수거만 호출자가 소유한다. */
export function shieldStudioMToonTextureSnapshotClone(
  source: Texture,
  onClone?: (snapshot: Texture) => void,
): Texture {
  return new Proxy(source, { get(target, property) {
    if (property !== "clone") return Reflect.get(target, property, target);
    return () => {
      const snapshot = cloneStudioMToonTextureSnapshot(source);
      try { onClone?.(snapshot); return snapshot; }
      catch (error) { snapshot.dispose(); throw error; }
    };
  } });
}
