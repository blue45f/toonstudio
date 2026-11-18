import { packWorkfileWorkspace, unpackWorkfileWorkspace, type WorkfileRequest, type WorkfileResponse } from "./studio-hybrid-dcc-workfile-transport";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

function requestWorkfile(request: WorkfileRequest, signal: AbortSignal): Promise<WorkfileResponse> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./studio-hybrid-dcc-workfile.worker.ts", import.meta.url), { type: "module", name: "studio-hybrid-dcc-workfile" });
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const fail = (cause: unknown) => { cleanup(); reject(cause); };
    const abort = () => fail(new DOMException("작업파일 처리를 취소했습니다.", "AbortError"));
    const timer = setTimeout(() => fail(new Error("작업파일 처리 시간이 초과되었습니다.")), 120_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<WorkfileResponse>) => {
      cleanup();
      if (data.kind === "error") reject(new Error(data.message)); else resolve(data);
    };
    worker.onmessageerror = worker.onerror = () => fail(new Error("작업파일 처리기를 실행하지 못했습니다. 다시 시도해 주세요."));
    try {
      // 읽기 버퍼는 새로 읽은 파일의 독점 사본이다. 열린 편집기의 메시 버퍼는 이전하지 않는다.
      worker.postMessage(request, request.kind === "decode" ? [request.bytes.buffer] : []);
    } catch (cause) { fail(cause); }
  });
}

export async function encodeWorkfileInWorker(workspace: StudioHybridDccWorkspace, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  const response = await requestWorkfile({ kind: "encode", workspace: packWorkfileWorkspace(workspace) }, signal);
  if (response.kind !== "encoded") throw new Error("작업파일 저장 응답이 올바르지 않습니다.");
  return response.bytes;
}

export async function decodeWorkfileInWorker(bytes: Uint8Array<ArrayBuffer>, documentId: string, signal: AbortSignal): Promise<StudioHybridDccWorkspace> {
  const response = await requestWorkfile({ kind: "decode", bytes, documentId }, signal);
  if (response.kind !== "decoded") throw new Error("작업파일 열기 응답이 올바르지 않습니다.");
  return unpackWorkfileWorkspace(response.workspace);
}
