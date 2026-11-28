import { useLayoutEffect, useState } from "react";
import * as THREE from "three";

import { createStudioHybridDccUvCheckerTexture } from "./studio-hybrid-dcc-uv-checker-texture";

export function StudioHybridDccUvCheckerMaterial() {
  const [texture, setTexture] = useState<THREE.DataTexture | null>(null);
  useLayoutEffect(() => {
    const created = createStudioHybridDccUvCheckerTexture();
    setTexture(created);
    return () => created.dispose();
  }, []);
  // 첫 셰이더 컴파일부터 UV 샘플러가 포함되도록 텍스처가 준비된 뒤 재질을 붙인다.
  if (!texture) return null;
  return <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />;
}
