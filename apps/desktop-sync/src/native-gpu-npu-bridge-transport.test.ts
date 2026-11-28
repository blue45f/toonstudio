import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  computeWave65Crc32Ieee,
  decodeWave65Packet,
  DesktopNativeGpuNpuDaemonClient,
  encodeWave65Packet,
  probeHostWithGpuNpuDaemon,
  resolveGpuNpuDaemonBinaryPath,
  startLoopbackGpuNpuBridgeServer,
  WAVE65_IPC_FLAGS,
  WAVE65_IPC_PROTOCOL_VERSION,
} from "./native-gpu-npu-bridge-transport.js";

import type { LoopbackGpuNpuBridgeServerHandle } from "./native-gpu-npu-bridge-transport.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CRATE_MANIFEST_PATH = join(REPO_ROOT, "crates/studio-native-gpu-npu-bridge/Cargo.toml");

let daemonBinaryPath = "";
const activeClients: DesktopNativeGpuNpuDaemonClient[] = [];
const activeServers: LoopbackGpuNpuBridgeServerHandle[] = [];

function resolveCargoEnv(): NodeJS.ProcessEnv {
  const currentPath = process.env.PATH ?? "";
  const cargoBin = join(process.env.HOME ?? "", ".cargo/bin");
  if (cargoBin && !currentPath.includes(cargoBin)) {
    return { ...process.env, PATH: `${cargoBin}:${currentPath}` };
  }
  return { ...process.env };
}

function trackClient(client: DesktopNativeGpuNpuDaemonClient): DesktopNativeGpuNpuDaemonClient {
  activeClients.push(client);
  return client;
}

function trackServer(server: LoopbackGpuNpuBridgeServerHandle): LoopbackGpuNpuBridgeServerHandle {
  activeServers.push(server);
  return server;
}

beforeAll(async () => {
  let resolved = await resolveGpuNpuDaemonBinaryPath({ repoRoot: REPO_ROOT });
  if (!resolved) {
    const build = spawnSync(
      "cargo",
      [
        "build",
        "--manifest-path",
        CRATE_MANIFEST_PATH,
        "--bin",
        "studio-gpu-npu-bridge-daemon",
      ],
      {
        cwd: REPO_ROOT,
        env: resolveCargoEnv(),
        encoding: "utf8",
      },
    );
    if (build.error) {
      throw new Error(`cargo build 실행 실패: ${build.error.message}`);
    }
    if (build.status !== 0) {
      throw new Error(
        `studio-gpu-npu-bridge-daemon 빌드 실패(exit=${String(build.status)}): ${build.stderr}`,
      );
    }
    resolved = await resolveGpuNpuDaemonBinaryPath({ repoRoot: REPO_ROOT });
  }
  if (!resolved) {
    throw new Error("컴파일된 studio-gpu-npu-bridge-daemon 실행 파일을 찾을 수 없습니다.");
  }
  daemonBinaryPath = resolved;
}, 60_000);

afterEach(async () => {
  await Promise.all(activeServers.splice(0).map((srv) => srv.close()));
  await Promise.all(activeClients.splice(0).map((cli) => cli.close()));
});

describe("Wave 71 Desktop Shell ↔ Real Rust GPU/NPU Daemon IPC E2E", () => {
  it("runs --probe-host CLI on the real compiled Rust binary and reports authentic host hardware", async () => {
    const report = await probeHostWithGpuNpuDaemon(daemonBinaryPath);

    expect(report.protocol_version).toBe(WAVE65_IPC_PROTOCOL_VERSION);
    expect(report.host_os).toBe(process.platform);
    expect(report.probe.target_fps).toBe(120);
    expect(report.plan.frame_budget_us).toBe(8_333);
    expect(report.probe.device_name.length).toBeGreaterThan(0);

    if (process.platform === "darwin" && process.arch === "arm64") {
      expect(report.plan.vendor).toBe("apple");
      expect(report.plan.backend).toBe("metal3");
      expect(report.plan.upscaler).toContain("metal_fx");
      expect(report.plan.npu).toBe("apple_neural_engine");
      expect(report.plan.is_native_accelerated).toBe(true);
      expect(report.plan.zero_copy_enabled).toBe(true);
    }
  });

  it("completes real stdio HandshakeRequest with empty payload (auto host probe) and valid IEEE CRC-32", async () => {
    const client = trackClient(
      new DesktopNativeGpuNpuDaemonClient({ binaryPath: daemonBinaryPath }),
    );
    await client.start();
    expect(client.isRunning).toBe(true);

    const response = await client.handshake();
    expect(response.kind).toBe("handshake-response");
    expect(response.version).toBe(WAVE65_IPC_PROTOCOL_VERSION);
    expect(response.sequence).toBe(BigInt(1));
    expect(response.negotiatedSummary.vendor).toBeTruthy();
    expect(response.negotiatedSummary.backend).toBeTruthy();
    expect(response.negotiatedSummary.upscaler).toBeTruthy();
    expect(response.negotiatedSummary.npu).toBeTruthy();
    expect(response.negotiatedSummary.frame_budget_us).toBe("8333");
    expect(client.lastNegotiatedPlan?.vendor).toBe(response.negotiatedSummary.vendor);

    if (process.platform === "darwin" && process.arch === "arm64") {
      expect(response.vendor).toBe("apple");
      expect(response.negotiatedSummary.backend).toBe("metal3");
      expect(response.negotiatedSummary.upscaler).toContain("metal_fx");
      expect(response.negotiatedSummary.npu).toBe("apple_neural_engine");
    }

    // CRC-32 골든 벡터 호환 확인
    expect(computeWave65Crc32Ieee(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("negotiates NVIDIA RTX 5090 Windows DLSS 4 MFG + Reflex 2 + D3D12 Shared Handle across real Node ↔ Rust IPC", async () => {
    const client = trackClient(
      new DesktopNativeGpuNpuDaemonClient({ binaryPath: daemonBinaryPath }),
    );
    await client.start();

    const rtx5090Probe = [
      "os=windows",
      "vendor=nvidia",
      "device_name=NVIDIA GeForce RTX 5090",
      "driver_version=572.42",
      "vram_mb=32768",
      "target_fps=240",
      "allow_multi_frame_gen=true",
      "dlss4=true",
      "dlss35=true",
      "reflex2=true",
      "tensor_fp8_int4=true",
      "nvidia_ofa=true",
    ].join(";");

    const response = await client.handshake(rtx5090Probe);
    expect(response.kind).toBe("handshake-response");
    expect(response.vendor).toBe("nvidia");
    expect(response.frameBudgetUs).toBe(4_166);
    expect(response.negotiatedSummary.vendor).toBe("nvidia");
    expect(response.negotiatedSummary.backend).toBe("directx12");
    expect(response.negotiatedSummary.upscaler).toBe("dlss4_multi_frame_gen");
    expect(response.negotiatedSummary.low_latency).toBe("reflex2_frame_warp");
    expect(response.negotiatedSummary.transport).toBe("d3d12_shared_handle");
    expect(response.negotiatedSummary.host_os).toBe("windows");
    expect(response.negotiatedSummary.adapter).toBe("NVIDIA GeForce RTX 5090");
    expect(response.negotiatedSummary.fallback).toBe("none");
  });

  it("negotiates AMD RDNA4 FSR 4.1 ML + Anti-Lag 2 across real Node ↔ Rust IPC", async () => {
    const client = trackClient(
      new DesktopNativeGpuNpuDaemonClient({ binaryPath: daemonBinaryPath }),
    );
    await client.start();

    const rdna4Probe = [
      "os=windows",
      "vendor=amd",
      "device_name=AMD Radeon RX 9070 XT",
      "driver_version=25.4.1",
      "vram_mb=16384",
      "target_fps=120",
      "amd_fsr=fsr4.1-int8-full",
      "anti_lag2=true",
      "amd_xdna=2",
    ].join(";");

    const response = await client.handshake(rdna4Probe);
    expect(response.kind).toBe("handshake-response");
    expect(response.vendor).toBe("amd");
    expect(response.negotiatedSummary.vendor).toBe("amd");
    expect(response.negotiatedSummary.upscaler).toBe("fsr4_1_ml");
    expect(response.negotiatedSummary.low_latency).toBe("anti_lag_2");
    expect(response.negotiatedSummary.npu).toBe("amd_ryzen_ai_xdna2");
    expect(response.negotiatedSummary.fallback).toBe("none");
  });

  it("evaluates FrameSubmit sequence with real FrameLatencyBudgetGuard dynamic resolution scaling", async () => {
    const client = trackClient(
      new DesktopNativeGpuNpuDaemonClient({ binaryPath: daemonBinaryPath }),
    );
    await client.start();
    await client.handshake();

    const shm = {
      handleId: BigInt(0x10002000),
      byteOffset: 4096,
      byteLength: 4 * 1024 * 1024,
    };

    const normal = await client.submitFrame({
      shm,
      flags: WAVE65_IPC_FLAGS.ZERO_COPY_SHM | WAVE65_IPC_FLAGS.LOW_LATENCY_MARK,
      frameBudgetUs: 8_333,
      actualLatencyUs: 2_100,
      payload: "brush=ink-sdf;cut=1",
    });
    expect(normal.kind).toBe("frame-complete");
    expect(normal.summary.decision).toBe("within_budget");
    expect(normal.summary.scale_pct).toBe("100");
    expect(normal.summary.consecutive_over_budget).toBe("0");
    expect(normal.actualLatencyUs).toBeGreaterThanOrEqual(2_100);

    const over1 = await client.submitFrame({
      shm,
      flags: WAVE65_IPC_FLAGS.ZERO_COPY_SHM,
      frameBudgetUs: 8_333,
      actualLatencyUs: 10_500,
      payload: "brush=impasto;cut=2",
    });
    expect(over1.kind).toBe("frame-complete");
    expect(over1.summary.decision).toBe("downgrade_upscaler_tier");
    expect(Number(over1.summary.scale_pct)).toBeLessThan(100);
    expect(over1.summary.scale_pct).toBe("80");
    expect(over1.summary.consecutive_over_budget).toBe("1");

    const over2 = await client.submitFrame({
      frameBudgetUs: 8_333,
      actualLatencyUs: 11_200,
      payload: "brush=impasto;cut=3",
    });
    expect(over2.kind).toBe("frame-complete");
    expect(over2.summary.decision).toBe("downgrade_upscaler_tier");
    expect(over2.summary.scale_pct).toBe("67");
    expect(over2.summary.consecutive_over_budget).toBe("2");

    const over3 = await client.submitFrame({
      frameBudgetUs: 8_333,
      actualLatencyUs: 13_400,
      payload: "brush=impasto;cut=4",
    });
    expect(over3.kind).toBe("frame-complete");
    expect(over3.summary.decision).toBe("fallback_to_webgpu");
    expect(over3.summary.scale_pct).toBe("50");
    expect(over3.summary.consecutive_over_budget).toBe("3");
    expect((over3.flags & WAVE65_IPC_FLAGS.FALLBACK_WEBGPU) !== 0).toBe(true);

    // 시퀀스 역행 시 데몬이 종료되지 않고 ErrorNotice(7)를 반환하는지 확인
    const regressed = await client.submitFrame({
      sequence: BigInt(2),
      frameBudgetUs: 8_333,
      actualLatencyUs: 1_500,
    });
    expect(regressed.kind).toBe("error-notice");
    expect(regressed.payloadText).toContain("시퀀스");
    expect(client.isRunning).toBe(true);
  });

  it("handles PsoPrewarmHint and Heartbeat round-trips across real Node ↔ Rust IPC", async () => {
    const client = trackClient(
      new DesktopNativeGpuNpuDaemonClient({ binaryPath: daemonBinaryPath }),
    );
    await client.start();
    const hs = await client.handshake();

    const wgslHint = "@compute @workgroup_size(8,8) fn wet_ink_brush() {}";
    const prewarm = await client.prewarmPso(wgslHint);
    expect(prewarm.kind).toBe("frame-complete");
    expect(prewarm.summary.pso_prewarm).toBe("ok");
    expect(Number(prewarm.summary.bytes)).toBe(new TextEncoder().encode(wgslHint).byteLength);

    const hb = await client.heartbeat();
    expect(hb.kind).toBe("heartbeat");
    expect(hb.summary.alive).toBe("true");
    expect(hb.summary.frames).toBe("0");
    expect(hb.summary.prewarms).toBe("1");
    expect(hb.summary.vendor).toBe(hs.negotiatedSummary.vendor);
  });

  it("survives 1-byte CRC-32 corruption without crashing, returns ErrorNotice(7), and continues serving Heartbeat", async () => {
    const client = trackClient(
      new DesktopNativeGpuNpuDaemonClient({ binaryPath: daemonBinaryPath }),
    );
    await client.start();
    await client.handshake();

    const validPacket = encodeWave65Packet({
      version: WAVE65_IPC_PROTOCOL_VERSION,
      kind: "frame-submit",
      vendor: "apple",
      sequence: BigInt(10),
      shm: { handleId: BigInt(0), byteOffset: 0, byteLength: 0 },
      flags: 0,
      frameBudgetUs: 8_333,
      actualLatencyUs: 1_200,
      payload: new TextEncoder().encode("crc-test-payload"),
    });

    // 페이로드 1바이트를 의도적으로 변조해 실제 Rust 데몬의 IEEE CRC-32 검증 경로를 검증
    const corrupted = new Uint8Array(validPacket);
    corrupted[50] = (corrupted[50] ?? 0) ^ 0x01;

    const rawErrorResp = await client.sendRawPacket(corrupted);
    const decodedError = decodeWave65Packet(rawErrorResp);
    expect(decodedError.kind).toBe("error-notice");
    expect(decodedError.summary.error).toBe("true");
    expect(decodedError.payloadText).toContain("CRC-32");
    expect(client.isRunning).toBe(true);

    const recoveryHb = await client.heartbeat();
    expect(recoveryHb.kind).toBe("heartbeat");
    expect(recoveryHb.summary.alive).toBe("true");
    expect(Number(recoveryHb.summary.errors)).toBeGreaterThanOrEqual(1);
  });

  it("enforces bearer auth, strict loopback Origin checks, JSON endpoints, and raw binary /v1/gpu-npu/ipc round-trip", async () => {
    const srv = trackServer(
      await startLoopbackGpuNpuBridgeServer({
        port: 0,
        binaryPath: daemonBinaryPath,
      }),
    );

    expect(srv.host).toBe("127.0.0.1");
    expect(srv.port).toBeGreaterThan(0);

    // 1) 토큰 누락 → 401
    const unauthResp = await fetch(`${srv.baseUrl}/v1/gpu-npu/health`);
    expect(unauthResp.status).toBe(401);

    // 2) 잘못된 토큰 → 401
    const badTokenResp = await fetch(`${srv.baseUrl}/v1/gpu-npu/health`, {
      headers: { Authorization: "Bearer wrong-token-value" },
    });
    expect(badTokenResp.status).toBe(401);

    // 3) 외부 악성 Origin → 유효한 토큰이 있어도 403
    const evilOriginResp = await fetch(`${srv.baseUrl}/v1/gpu-npu/health`, {
      headers: {
        Authorization: `Bearer ${srv.token}`,
        Origin: "https://evil.example",
      },
    });
    expect(evilOriginResp.status).toBe(403);

    // 4) 허용된 localhost Origin + Bearer 토큰 → GET /v1/gpu-npu/health 200
    const healthResp = await fetch(`${srv.baseUrl}/v1/gpu-npu/health`, {
      headers: {
        Authorization: `Bearer ${srv.token}`,
        Origin: "http://localhost:5173",
      },
    });
    expect(healthResp.status).toBe(200);
    expect(healthResp.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const healthJson = (await healthResp.json()) as {
      readonly ok: boolean;
      readonly protocolVersion: number;
      readonly daemonRunning: boolean;
      readonly vendor: string;
      readonly negotiatedPlan: Record<string, string> | null;
      readonly heartbeat: Record<string, string> | null;
    };
    expect(healthJson.ok).toBe(true);
    expect(healthJson.protocolVersion).toBe(WAVE65_IPC_PROTOCOL_VERSION);
    expect(healthJson.daemonRunning).toBe(true);
    expect(healthJson.negotiatedPlan?.vendor).toBeTruthy();
    expect(healthJson.heartbeat?.alive).toBe("true");

    // 5) X-ToonStudio-Bridge-Token 헤더 → GET /v1/gpu-npu/probe 200
    const probeResp = await fetch(`${srv.baseUrl}/v1/gpu-npu/probe`, {
      headers: { "X-ToonStudio-Bridge-Token": srv.token },
    });
    expect(probeResp.status).toBe(200);
    const probeJson = (await probeResp.json()) as {
      readonly ok: boolean;
      readonly vendor: string;
      readonly frameBudgetUs: number;
      readonly negotiatedPlan: Record<string, string>;
    };
    expect(probeJson.ok).toBe(true);
    expect(probeJson.frameBudgetUs).toBe(8_333);
    expect(probeJson.negotiatedPlan.backend).toBeTruthy();

    // 6) Raw binary POST /v1/gpu-npu/ipc (HTTP → Node → Rust daemon → Node → HTTP)
    const rawRequestPacket = encodeWave65Packet({
      version: WAVE65_IPC_PROTOCOL_VERSION,
      kind: "handshake-request",
      vendor: "nvidia",
      sequence: BigInt(42),
      shm: { handleId: BigInt(0), byteOffset: 0, byteLength: 0 },
      flags: 0,
      frameBudgetUs: 4_166,
      actualLatencyUs: 0,
      payload: new TextEncoder().encode(
        "os=windows;vendor=nvidia;device_name=RTX 5090 Loopback;target_fps=240;dlss4=true;reflex2=true;tensor_fp8_int4=true;nvidia_ofa=true",
      ),
    });

    const ipcResp = await fetch(`${srv.baseUrl}/v1/gpu-npu/ipc`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${srv.token}`,
        "Content-Type": "application/octet-stream",
      },
      body: Buffer.from(rawRequestPacket),
    });
    expect(ipcResp.status).toBe(200);
    expect(ipcResp.headers.get("content-type")).toBe("application/octet-stream");

    const rawResponseBytes = new Uint8Array(await ipcResp.arrayBuffer());
    const decodedIpc = decodeWave65Packet(rawResponseBytes);
    expect(decodedIpc.kind).toBe("handshake-response");
    expect(decodedIpc.vendor).toBe("nvidia");
    expect(decodedIpc.sequence).toBe(BigInt(42));
    expect(decodedIpc.summary.upscaler).toBe("dlss4_multi_frame_gen");
    expect(decodedIpc.summary.low_latency).toBe("reflex2_frame_warp");
    expect(decodedIpc.summary.transport).toBe("d3d12_shared_handle");
  });
});
