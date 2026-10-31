/// <reference lib="webworker" />
/** 요청 한 건만 처리하는 계산 전용 Worker. 원본 lease/문서/history는 이 realm에 전달하지 않는다. */
import { hashStudioEditableMesh, validateStudioEditableMeshSerializableAuthority } from "../studio-editable-half-edge-mesh";
import { unpackStudioHybridDccGlbExportInput, studioHybridDccPackedMeshPayloadTransfers } from "./studio-hybrid-dcc-glb-export-packed-mesh";
import { splitStudioEditableFaceBoundaryChordWithUv } from "./studio-hybrid-dcc-boundary-chord-uv";
import {
  createStudioBoundaryChordWorkerResponse, isStudioBoundaryChordWorkerRequest, isStudioBoundaryChordWorkerResponse,
  type StudioBoundaryChordWorkerResponse,
} from "./studio-hybrid-dcc-boundary-chord-worker-protocol";

let handled = false;
function post(response: StudioBoundaryChordWorkerResponse): void {
  const transfers = response.kind === "result" && response.result.ok
    ? studioHybridDccPackedMeshPayloadTransfers([response.result.payload]) : [];
  self.postMessage(response, { transfer: transfers });
}
self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isStudioBoundaryChordWorkerRequest(event.data)) {
    post({ version: 1, kind: "error", requestId: 1, generation: 1, code: "protocol" }); return;
  }
  const request = event.data;
  if (handled) { post({ version: 1, kind: "error", requestId: request.requestId, generation: request.generation, code: "protocol" }); return; }
  handled = true;
  try {
    const source = unpackStudioHybridDccGlbExportInput(request.payload);
    if (!source || !validateStudioEditableMeshSerializableAuthority(source.mesh).ok || hashStudioEditableMesh(source.mesh) !== source.sourceHash) {
      post({ version: 1, kind: "error", requestId: request.requestId, generation: request.generation, code: "protocol" }); return;
    }
    const computed = splitStudioEditableFaceBoundaryChordWithUv({ mesh: source.mesh, meshHash: source.sourceHash, meshRevision: source.sourceRevision }, request.request);
    const response = createStudioBoundaryChordWorkerResponse(request, computed);
    if (!isStudioBoundaryChordWorkerResponse(response)) {
      post({ version: 1, kind: "error", requestId: request.requestId, generation: request.generation, code: "protocol" }); return;
    }
    post(response);
  } catch {
    post({ version: 1, kind: "error", requestId: request.requestId, generation: request.generation, code: "compute-failed" });
  }
});
