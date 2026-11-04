/** 구조·CRC 검증 뒤 실제 브라우저 디코더까지 통과해야 묶음을 문서에 반영한다. */
export async function decodeStudioBg3dSixPassPng(bytes: Uint8Array, width: number, height: number): Promise<void> {
  if (typeof globalThis.createImageBitmap !== "function") throw new Error("6패스 PNG 원본을 검증할 브라우저 이미지 디코더가 없습니다.");
  const bitmap = await globalThis.createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: "image/png" }));
  try {
    if (bitmap.width !== width || bitmap.height !== height) throw new Error("6패스 PNG의 실제 픽셀 크기가 manifest와 다릅니다.");
  } finally { bitmap.close(); }
}
