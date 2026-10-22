/** 파일 목록에서 첫 이미지(형식 또는 확장자로 판단). 붙여넣기·끌어놓기·파일 선택이 같은 규칙을 쓴다. */
export function firstImageFile(files: FileList | null | undefined): File | null {
  if (!files) return null;
  for (const file of Array.from(files)) {
    if (file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/iu.test(file.name)) return file;
  }
  return null;
}
