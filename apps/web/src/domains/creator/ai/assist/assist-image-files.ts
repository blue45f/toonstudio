const SUPPORTED_TYPE = /^image\/(?:png|jpeg|webp)$/u;
const SUPPORTED_NAME = /\.(?:png|jpe?g|webp)$/iu;

function isSupportedImage(file: File): boolean {
  return SUPPORTED_TYPE.test(file.type) || (file.type === "" && SUPPORTED_NAME.test(file.name));
}

function isAnyImage(file: File): boolean {
  return file.type.startsWith("image/") || SUPPORTED_NAME.test(file.name);
}

/**
 * 파일 목록에서 보낼 이미지 하나. 붙여넣기·끌어놓기·파일 선택이 같은 규칙을 쓴다.
 * 지원하는 형식(PNG·JPEG·WebP)이 하나라도 있으면 그중 첫 번째를 고른다 — GIF·HEIC가 앞에 끼어 있어도 뒤의 쓸 수 있는 파일을 놓치지 않는다.
 * 지원하는 형식이 없고 다른 이미지만 있으면 그 첫 파일을 돌려줘서, 호출 쪽이 "지원하지 않는 형식이에요"를 알릴 수 있게 한다.
 */
export function firstImageFile(files: FileList | null | undefined): File | null {
  if (!files) return null;
  const list = Array.from(files);
  return list.find(isSupportedImage) ?? list.find(isAnyImage) ?? null;
}

/**
 * 끌어다 놓은 파일 중 보낼 하나. 이미지가 없으면 첫 파일을 그대로 돌려줘서, 호출 쪽이 이미지 불러오기를 거치며
 * "지원하지 않는 형식이에요"를 알릴 수 있게 한다(조용히 무시하면 사용자는 왜 아무 일도 없는지 알 수 없다).
 */
export function pickDroppedFile(files: FileList | null | undefined): File | null {
  if (!files || files.length === 0) return null;
  return firstImageFile(files) ?? files[0] ?? null;
}
