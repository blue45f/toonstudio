/// <reference lib="webworker" />
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";
import { packWorkfileWorkspace, unpackWorkfileWorkspace, type WorkfileRequest, type WorkfileResponse } from "./studio-hybrid-dcc-workfile-transport";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.addEventListener("message", ({ data }: MessageEvent<WorkfileRequest>) => {
  try {
    if (data.kind === "encode") {
      const bytes = encodeStudioHybridDccWorkfile(unpackWorkfileWorkspace(data.workspace));
      scope.postMessage({ kind: "encoded", bytes } satisfies WorkfileResponse, [bytes.buffer]);
    } else {
      const workspace = decodeStudioHybridDccWorkfile(data.bytes, { documentId: data.documentId });
      scope.postMessage({ kind: "decoded", workspace: packWorkfileWorkspace(workspace) } satisfies WorkfileResponse);
    }
  } catch (error) {
    scope.postMessage({ kind: "error", message: error instanceof Error ? error.message : "작업파일을 처리하지 못했습니다." } satisfies WorkfileResponse);
  }
});
