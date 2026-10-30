import { STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES } from "./studio-hybrid-dcc-native-import-contracts";

/** 크기를 먼저 확인하고 FileReader를 취소한다. 사용자 파일은 URL이나 저장소로 보내지 않는다. */
export function readStudioNativeImportFile(file: File, signal: AbortSignal): Promise<Uint8Array> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES) return Promise.reject(new Error("모델 파일이 비어 있거나 128 MiB 한도를 넘었습니다."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => { signal.removeEventListener("abort", abort); reader.onload = null; reader.onerror = null; reader.onabort = null; };
    const fail = (cause: Error) => { cleanup(); reject(cause); };
    const abort = () => { cleanup(); reader.abort(); reject(new DOMException("모델 가져오기를 취소했습니다.", "AbortError")); };
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer) || result.byteLength !== file.size) { fail(new Error("모델 파일 전체를 읽지 못했습니다. 다시 선택하세요.")); return; }
      cleanup(); resolve(new Uint8Array(result));
    };
    reader.onerror = () => fail(new Error("모델 파일을 읽지 못했습니다. 파일 접근 권한을 확인하세요."));
    reader.onabort = () => fail(new DOMException("모델 가져오기를 취소했습니다.", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    try { reader.readAsArrayBuffer(file); } catch { fail(new Error("모델 파일 읽기를 시작하지 못했습니다.")); }
  });
}
