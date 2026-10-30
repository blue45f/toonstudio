import * as THREE from "three";

/** 외부 이미지 요청 없이 UV의 방향·반복·왜곡을 검사하는 화면 전용 텍스처다. */
export function createStudioHybridDccUvCheckerTexture(): THREE.DataTexture {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const dark = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      const grid = x % 8 === 0 || y % 8 === 0;
      pixels[offset] = grid ? 24 : dark ? 48 + x * 2 : 224;
      pixels[offset + 1] = grid ? 24 : dark ? 60 + y * 2 : 224;
      pixels[offset + 2] = grid ? 24 : dark ? 152 : 224;
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = "ToonStudio UV checker";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
