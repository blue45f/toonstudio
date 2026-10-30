import { useEffect, useState } from "react";
import * as THREE from "three";

import { createStudioHybridDccUvCheckerTexture } from "./studio-hybrid-dcc-uv-checker-texture";

export function StudioHybridDccUvCheckerMaterial() {
  const [texture, setTexture] = useState<THREE.DataTexture | null>(null);
  useEffect(() => {
    const created = createStudioHybridDccUvCheckerTexture();
    setTexture(created);
    return () => created.dispose();
  }, []);
  return <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />;
}
