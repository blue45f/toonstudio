/// <reference lib="webworker" />
/** 요청 한 건의 커널·정확 UV/법선 필드 계산만 수행한다. 문서·선택·private plan은 main에 남는다. */
import { hashStudioEditableMesh, validateStudioEditableMeshSerializableAuthority } from "../studio-editable-half-edge-mesh";
import { dissolveStudioHybridDccCoplanarEdges } from "./studio-hybrid-dcc-coplanar-edge-dissolve";
import { studioHybridDccPackedMeshPayloadTransfers, unpackStudioHybridDccGlbExportInput } from "./studio-hybrid-dcc-glb-export-packed-mesh";
import {
  createStudioCoplanarEdgeDissolveWorkerResponse, isStudioCoplanarEdgeDissolveWorkerRequest,
  isStudioCoplanarEdgeDissolveWorkerResponse, type StudioCoplanarEdgeDissolveWorkerResponse,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve-worker-protocol";

let handled = false;
function post(response: StudioCoplanarEdgeDissolveWorkerResponse): void {
  const transfer = response.kind === "result" && response.result.ok
    ? studioHybridDccPackedMeshPayloadTransfers([response.result.payload]) : [];
  self.postMessage(response, { transfer });
}
self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isStudioCoplanarEdgeDissolveWorkerRequest(event.data)) {
    post({ version: 1, kind: "error", requestId: 1, generation: 0,
      requestDigest: `coplanar-edge-request:sha256:${"0".repeat(64)}`, code: "protocol" }); return;
  }
  const request = event.data;
  const error = (code: "protocol" | "compute-failed"): void => post({ version: 1, kind: "error",
    requestId: request.requestId, generation: request.generation, requestDigest: request.requestDigest, code });
  if (handled) { error("protocol"); return; }
  handled = true;
  try {
    const input = unpackStudioHybridDccGlbExportInput(request.payload);
    if (!input || !validateStudioEditableMeshSerializableAuthority(input.mesh).ok || hashStudioEditableMesh(input.mesh) !== input.sourceHash) {
      error("protocol"); return;
    }
    const computed = dissolveStudioHybridDccCoplanarEdges({ mesh: input.mesh, meshHash: input.sourceHash, meshRevision: input.sourceRevision }, request.request);
    const response = createStudioCoplanarEdgeDissolveWorkerResponse(request, computed);
    if (!isStudioCoplanarEdgeDissolveWorkerResponse(response)) { error("protocol"); return; }
    post(response);
  } catch { error("compute-failed"); }
});
