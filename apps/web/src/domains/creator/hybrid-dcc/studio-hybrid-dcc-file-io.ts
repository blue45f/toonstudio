import { STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES } from "./studio-hybrid-dcc-workfile";

/** 파일 내용은 URL·스토리지에 쓰지 않고, 취소 가능한 브라우저 읽기로만 전달한다. */
export function readStudioHybridDccWorkfile(file: File, signal: AbortSignal): Promise<Uint8Array> {
  if (!/\.toon3d$/iu.test(file.name)) return Promise.reject(new Error(".toon3d 작업파일을 선택하세요."));
  if (file.size <= 0 || file.size > STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES) return Promise.reject(new Error("작업파일이 비어 있거나 편집기의 파일 크기 한도를 넘었습니다."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      reader.onload = null; reader.onerror = null; reader.onabort = null;
    };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const abort = () => { reader.abort(); fail(new DOMException("파일 읽기를 취소했습니다.", "AbortError")); };
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer) || result.byteLength !== file.size) {
        fail(new Error("작업파일 전체를 읽지 못했습니다. 다시 파일을 선택하세요."));
        return;
      }
      cleanup(); resolve(new Uint8Array(result));
    };
    reader.onerror = () => fail(new Error("작업파일을 읽지 못했습니다. 파일 접근 권한을 확인하세요."));
    reader.onabort = () => fail(new DOMException("파일 읽기를 취소했습니다.", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    try { reader.readAsArrayBuffer(file); }
    catch { fail(new Error("작업파일 읽기를 시작하지 못했습니다.")); }
  });
}

/** 사용자 파일명과 문서 ID는 다운로드 경로로 실행하지 않고 안전한 파일 이름으로만 쓴다. */
export function studioHybridDccDownloadName(documentId: string, extension: "toon3d" | "obj"): string {
  const name = documentId.replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 80) || "workspace";
  return `toonstudio-${name}.${extension}`;
}

export function downloadStudioHybridDccFile(value: Uint8Array | string, mime: string, filename: string): void {
  const blob = new Blob([typeof value === "string" ? value : Uint8Array.from(value)], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    // 브라우저가 다운로드 탐색을 소비할 시간을 준 뒤 임시 URL을 해제한다.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
