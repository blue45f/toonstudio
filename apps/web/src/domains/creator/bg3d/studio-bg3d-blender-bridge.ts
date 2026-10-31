import { calculateStudioCrc32 } from "../studio-crc32";
import {
  createStudioProductionJob,
  STUDIO_PRODUCTION_JOB_LIMITS,
  studioProductionJobSchema,
  type StudioProductionJob,
} from "../toolchain/studio-production-jobs";
import { studioProductionTool } from "../toolchain/studio-production-toolchain";
import type { StudioToonBridgeClient } from "../toolchain/studio-toonbridge-client";

export type BlenderBridgeOperation = "export-glb" | "render-scene" | "line-art";

/** Blender 바이너리 버전과 별개로 현재 프레임 어댑터를 포함하는 실행기 서비스 revision이다. */
export const STUDIO_BLENDER_SERVICE_REVISION = "0.2.0";

export function isStudioBlenderServiceRevision(value: unknown): value is typeof STUDIO_BLENDER_SERVICE_REVISION {
  return value === STUDIO_BLENDER_SERVICE_REVISION;
}

type BlenderBridgeClient = Pick<StudioToonBridgeClient,
  "settings" | "status" | "createJob" | "uploadInput" | "startJob" | "getJob" | "cancelJob" | "downloadOutput"
>;

interface BlenderJobRequest {
  readonly client: BlenderBridgeClient;
  readonly projectId: string | null;
  readonly file: File;
  readonly operation: BlenderBridgeOperation;
  readonly signal: AbortSignal;
  readonly isCurrent?: () => boolean;
  readonly onProgress?: (job: StudioProductionJob) => void;
}

export function isStudioBlenderLoopbackUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return ["http:", "https:"].includes(url.protocol)
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  } catch {
    return false;
  }
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, 1_000);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function assertGlb(bytes: ArrayBuffer): void {
  const fail = () => new Error("Blender 결과의 GLB 헤더·JSON·청크 구조를 확인하지 못했습니다.");
  if (bytes.byteLength < 24) throw fail();
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== bytes.byteLength || bytes.byteLength % 4 !== 0) throw fail();
  let offset = 12;
  let chunks = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw fail();
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (length % 4 !== 0 || length > bytes.byteLength - offset - 8
      || (chunks === 0 ? type !== 0x4e4f534a || length === 0 : type !== 0x004e4942 || chunks !== 1)) throw fail();
    if (chunks === 0) {
      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes, offset + 8, length)));
      } catch {
        throw fail();
      }
      if (typeof json !== "object" || json === null || !("asset" in json)
        || typeof json.asset !== "object" || json.asset === null
        || !("version" in json.asset) || json.asset.version !== "2.0") throw fail();
    }
    chunks += 1;
    offset += length + 8;
  }
  if (chunks === 0) throw fail();
}

function assertPng(bytes: ArrayBuffer): void {
  const fail = () => new Error("Blender 결과의 PNG 헤더·CRC·청크 구조를 확인하지 못했습니다.");
  const data = new Uint8Array(bytes);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (data.length < 57 || !signature.every((value, index) => data[index] === value)) throw fail();
  const view = new DataView(bytes);
  let offset = 8;
  let hasData = false;
  let dataEnded = false;
  let dataBytes = 0;
  let hasPalette = false;
  let colorType = -1;
  while (offset < data.length) {
    if (offset + 12 > data.length) throw fail();
    const length = view.getUint32(offset);
    if (length > 0x7fffffff || length > data.length - offset - 12) throw fail();
    const kind = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/u.test(kind)
      || calculateStudioCrc32(data.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(offset + 8 + length)) throw fail();
    if (offset === 8 && kind !== "IHDR") throw fail();
    if (kind === "IHDR") {
      if (offset !== 8 || length !== 13) throw fail();
      const width = view.getUint32(offset + 8);
      const height = view.getUint32(offset + 12);
      const depth = data[offset + 16];
      colorType = data[offset + 17] ?? -1;
      const depths: Readonly<Record<number, readonly number[]>> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff
        || depth === undefined || !depths[colorType]?.includes(depth)
        || data[offset + 18] !== 0 || data[offset + 19] !== 0
        || ![0, 1].includes(data[offset + 20] ?? -1)) throw fail();
    } else if (kind === "PLTE") {
      if (hasPalette || hasData || colorType === 0 || colorType === 4
        || length === 0 || length > 768 || length % 3 !== 0) throw fail();
      hasPalette = true;
    } else if (kind === "IDAT") {
      if (dataEnded || (colorType === 3 && !hasPalette)) throw fail();
      hasData = true;
      dataBytes += length;
    } else if (kind === "IEND") {
      if (length !== 0 || !hasData || dataBytes === 0 || offset + 12 !== data.length) throw fail();
      return;
    } else {
      // Blender 정지 결과만 받으며 알려지지 않은 필수 청크와 애니메이션은 전달하지 않는다.
      if (kind[0] === kind[0]?.toUpperCase() || ["acTL", "fcTL", "fdAT"].includes(kind)) throw fail();
    }
    if (hasData && kind !== "IDAT") dataEnded = true;
    offset += length + 12;
  }
  throw fail();
}

/** 한 번의 명시적 실행에 작업 하나만 만들며 검증된 결과만 현재 가져오기에 돌려준다. */
export async function runStudioBlenderJob({
  client, projectId, file, operation, signal, isCurrent, onProgress,
}: BlenderJobRequest): Promise<File> {
  const assertCurrent = () => {
    signal.throwIfAborted();
    if (isCurrent && !isCurrent()) throw new DOMException("Blender 가져오기 대상이 변경되었습니다.", "AbortError");
  };
  assertCurrent();
  if (!isStudioBlenderLoopbackUrl(client.settings.baseUrl)) throw new Error("이 컴퓨터의 로컬 ToonBridge 실행기에 연결해 주세요.");
  if (projectId !== null && (typeof projectId !== "string" || !projectId.trim() || projectId.trim().length > 160)) {
    throw new Error("Blender 가져오기 프로젝트를 확인하지 못했습니다.");
  }
  if (!/\.blend$/iu.test(file.name) || file.size === 0) throw new Error("내용이 있는 Blender .blend 파일을 선택해 주세요.");
  if (file.size > STUDIO_PRODUCTION_JOB_LIMITS.fileBytes) throw new Error("Blender 파일이 로컬 실행기의 파일당 2 GiB 한도를 넘었습니다.");
  const tool = studioProductionTool("blender");
  if (!tool) throw new Error("Blender 제작 도구 계약을 확인하지 못했습니다.");
  const updateMessage = `로컬 ToonBridge를 ${STUDIO_BLENDER_SERVICE_REVISION}으로 업데이트하고 다시 연결해 주세요.`;
  // 화면에 저장된 probe와 별도로 매 실행 직전에 서비스 revision을 새로 확인한다.
  let revision: unknown;
  try {
    revision = (await client.status(signal)).serviceVersion;
  } catch (cause) {
    assertCurrent();
    throw new Error(`로컬 실행기 버전을 확인하지 못했습니다. ${updateMessage}`, { cause });
  }
  assertCurrent();
  if (!isStudioBlenderServiceRevision(revision)) throw new Error(updateMessage);
  const sourceBytes = await file.arrayBuffer();
  assertCurrent();
  const sourceDigest = await sha256(sourceBytes);
  assertCurrent();
  // 실행기의 파일명 정규화에 영향받지 않는 입력 슬롯을 쓰고 반환 파일명에만 원본명을 보존한다.
  const input = { id: "blend_source", name: "source.blend", mime: "application/x-blender", bytes: file.size, sha256: sourceDigest, uploaded: false };
  const local = createStudioProductionJob({ projectId, profile: "open", toolId: "blender", operationId: operation, inputs: [input] });
  const mime = operation === "export-glb" ? "model/gltf-binary" : "image/png";
  let bound: StudioProductionJob | null = null;
  let terminal = false;
  let createAttempted = false;

  const validate = (raw: StudioProductionJob, stage: "create" | "uploaded" | "active" | "cancel"): StudioProductionJob => {
    const job = studioProductionJobSchema.parse(raw);
    const uploaded = job.inputs[0];
    if (job.projectId !== local.projectId || job.profile !== local.profile || job.toolId !== local.toolId
      || job.operationId !== local.operationId || Object.keys(job.options).length !== 0
      || (bound && (job.id !== bound.id || job.remoteId !== bound.remoteId || job.createdAt !== bound.createdAt))) {
      throw new Error("로컬 실행기가 다른 Blender 작업 또는 프로젝트를 반환했습니다.");
    }
    if (job.inputs.length !== 1 || !uploaded || uploaded.id !== input.id || uploaded.name !== input.name
      || uploaded.mime !== input.mime || uploaded.bytes !== input.bytes || uploaded.sha256 !== sourceDigest
      || (stage === "create" && uploaded.uploaded) || (["uploaded", "active"].includes(stage) && !uploaded.uploaded)) {
      throw new Error("Blender 작업의 입력 파일·크기·SHA-256이 원본과 다릅니다.");
    }
    if ((stage === "create" && job.status !== "preparing") || (stage === "uploaded" && job.status !== "queued")
      || (stage === "active" && !["queued", "running", "completed", "failed", "cancelled"].includes(job.status))) {
      throw new Error("Blender 작업의 실행 상태가 요청 단계와 다릅니다.");
    }
    if (job.status === "completed") {
      const result = job.outputs[0];
      const receipt = job.receipt;
      if (!uploaded.uploaded || job.outputs.length !== 1 || !result || result.id !== "result"
        || result.mime !== mime || result.bytes === 0 || !receipt || job.failure !== null
        || receipt.toolId !== tool.id || receipt.operationId !== operation || receipt.license !== tool.license
        || receipt.source !== tool.source || receipt.inputDigests.length !== 1 || receipt.inputDigests[0] !== sourceDigest
        || receipt.outputDigests.length !== 1 || receipt.outputDigests[0] !== result.sha256
        || Date.parse(receipt.startedAt) < Date.parse(job.createdAt)
        || Date.parse(receipt.finishedAt) < Date.parse(receipt.startedAt)
        || Date.parse(receipt.finishedAt) > Date.parse(job.updatedAt)) {
        throw new Error("Blender 결과 또는 입력·출력 실행 영수증을 확인하지 못했습니다.");
      }
    } else if (job.outputs.length !== 0 || job.receipt !== null
      || (job.status === "failed" ? job.failure === null : job.failure !== null)) {
      throw new Error("Blender 작업의 결과·실패 상태가 일치하지 않습니다.");
    }
    return job;
  };
  const accept = (raw: StudioProductionJob, stage: "create" | "uploaded" | "active") => {
    const job = validate(raw, stage);
    // ToonBridge v2가 발급한 첫 작업 ID에 결합하며 후속 응답으로 대상을 바꾸지 않는다.
    bound ??= job;
    terminal = ["completed", "failed", "cancelled"].includes(job.status);
    assertCurrent();
    onProgress?.(job);
    assertCurrent();
    return job;
  };
  const remoteId = () => {
    if (!bound) throw new Error("Blender 실행기의 작업 ID를 확인하지 못했습니다.");
    return bound.remoteId ?? bound.id;
  };
  try {
    assertCurrent();
    createAttempted = true;
    let job = accept(await client.createJob(local, signal), "create");
    job = accept(await client.uploadInput(remoteId(), input, file, signal), "uploaded");
    job = accept(await client.startJob(remoteId(), signal), "active");
    while (!terminal) {
      assertCurrent();
      await waitForPoll(signal);
      assertCurrent();
      job = accept(await client.getJob(remoteId(), signal), "active");
    }
    if (job.status === "cancelled") throw new DOMException("Blender 작업이 취소되었습니다.", "AbortError");
    if (job.status !== "completed") throw new Error(job.failure?.message ?? "Blender 작업이 실패했습니다. 원본과 실행기를 확인해 주세요.");
    const result = job.outputs[0];
    if (!result) throw new Error("Blender 결과 파일이 없습니다.");
    assertCurrent();
    const blob = await client.downloadOutput(remoteId(), result.id, signal);
    assertCurrent();
    if (blob.type !== mime || blob.size !== result.bytes) throw new Error("Blender 결과의 다운로드 MIME·크기가 영수증과 다릅니다.");
    const bytes = await blob.arrayBuffer();
    assertCurrent();
    const digest = await sha256(bytes);
    assertCurrent();
    if (digest !== result.sha256) throw new Error("Blender 결과의 SHA-256 검증에 실패했습니다.");
    if (operation === "export-glb") assertGlb(bytes);
    else assertPng(bytes);
    assertCurrent();
    const stem = file.name.replace(/\.blend$/iu, "");
    const suffix = operation === "export-glb" ? ".glb" : operation === "line-art" ? "-line-art.png" : "-render.png";
    return new File([bytes], `${stem}${suffix}`, { type: mime });
  } catch (cause) {
    if (createAttempted && !bound) {
      throw new Error("Blender 작업 생성 응답을 확인하지 못해 생성·중단 여부가 불명확합니다. 제작 작업 큐에서 확인한 뒤 다시 실행해 주세요.", { cause });
    }
    if (bound && !terminal) {
      try {
        // 원래 화면이 닫혀도 이미 생성된 작업 하나의 정리만 별도 제한 시간 안에 시도한다.
        const stopped = validate(await client.cancelJob(remoteId(), AbortSignal.timeout(5_000)), "cancel");
        if (!["completed", "failed", "cancelled"].includes(stopped.status)) throw new Error("Blender 작업이 아직 실행 중입니다.", { cause });
      } catch {
        throw new Error("Blender 작업 응답과 중단 여부를 확인하지 못했습니다. 제작 작업 큐에서 상태를 확인한 뒤 다시 실행해 주세요.", { cause });
      }
    }
    throw cause;
  }
}
