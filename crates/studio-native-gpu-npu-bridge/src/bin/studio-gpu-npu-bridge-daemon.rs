//! ToonStudio Wave 71 네이티브 GPU/NPU 브릿지 데몬 바이너리 (`studio-gpu-npu-bridge-daemon`).
//!
//! - 외부 크레이트 의존성 0개, `#![deny(unsafe_code)]`, panic 없는 `Result` 기반 처리.
//! - `--probe-host`: 실제 호스트 OS/CPU/메모리 프로브 + 협상된 세션 계획을 JSON으로 출력 후 종료.
//! - 기본 실행 모드: stdin/stdout 길이 접두(`u32 LE`) 프레임으로 Wave 65 `TSNB` 바이너리 패킷을 처리한다.

#![deny(unsafe_code)]

use std::env;
use std::fs;
use std::io::{self, Read, Write};
use std::process::{Command, ExitCode};
use std::time::Instant;

use studio_native_gpu_npu_bridge::{
    decode_ipc_packet, encode_ipc_packet, format_host_probe_descriptor,
    negotiate_native_bridge_session, parse_host_probe_descriptor, BridgeError, FrameBudgetDecision,
    FrameLatencyBudgetGuard, GpuVendor, GraphicsBackend, HostHardwareProbe, HostOs, IpcFramePacket,
    IpcPacketKind, LowLatencyKind, NativeBridgeSessionPlan, NpuBackend, SharedMemoryHandleMeta,
    UpscalerKind, ZeroCopyTransport, FLAG_FALLBACK_WEBGPU, FLAG_ZERO_COPY_SHM, IPC_HEADER_BYTES,
    IPC_MAX_PAYLOAD_BYTES, IPC_PROTOCOL_VERSION, IPC_TRAILER_BYTES,
};

const MAX_FRAMED_PACKET_BYTES: usize = IPC_HEADER_BYTES + IPC_MAX_PAYLOAD_BYTES + IPC_TRAILER_BYTES;
const DEFAULT_OVERRUN_FALLBACK_THRESHOLD: u32 = 3;

fn run_command_trimmed(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn host_platform_label() -> &'static str {
    match env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}

fn backend_wire_name(backend: GraphicsBackend) -> &'static str {
    use GraphicsBackend::*;
    match backend {
        Metal3 => "metal3",
        DirectX12 => "directx12",
        Vulkan13 => "vulkan13",
        WebGpuWgsl => "webgpu_wgsl",
    }
}

fn upscaler_wire_name(upscaler: UpscalerKind) -> &'static str {
    use UpscalerKind::*;
    match upscaler {
        MetalFxTemporal => "metal_fx_temporal",
        MetalFxSpatial => "metal_fx_spatial",
        Dlss4TransformerMultiFrameGen => "dlss4_multi_frame_gen",
        Dlss4TransformerSr => "dlss4_transformer_sr",
        Dlss35RayReconstruction => "dlss3_5_ray_reconstruction",
        Fsr41Int8Full => "fsr4_1_ml",
        Fsr41Int8Lite => "fsr4_1_ml_lite",
        Fsr3FrameGen => "fsr3_frame_gen",
        Fsr2Temporal => "fsr2_temporal",
        Fsr1Spatial => "fsr1_spatial",
        Xess2XmxFrameGen => "xess2_xmx_frame_gen",
        Xess2XmxSr => "xess2_xmx_sr",
        Xess2Dp4a => "xess2_dp4a",
        Xess1 => "xess1",
        ArmNss => "arm_nss",
        ArmAsr => "arm_asr",
        SnapdragonGsr2 => "snapdragon_gsr2",
        WebGpuWgslBicubicCas => "webgpu_wgsl_bicubic_cas",
    }
}

fn low_latency_wire_name(low_latency: LowLatencyKind) -> &'static str {
    use LowLatencyKind::*;
    match low_latency {
        AppleMetalDirectPresent => "apple_metal_direct_present",
        NvidiaReflex2FrameWarp => "reflex2_frame_warp",
        AmdRadeonAntiLag2 => "anti_lag_2",
        IntelXeLl => "intel_xell",
        ArmFramePacing => "arm_frame_pacing",
        QualcommFramePacing => "qualcomm_frame_pacing",
        WebGpuQueuePacing => "webgpu_queue_pacing",
    }
}

fn npu_wire_name(npu: NpuBackend) -> &'static str {
    use NpuBackend::*;
    match npu {
        AppleCoreMlAne => "apple_neural_engine",
        NvidiaTensorCoreFp8Int4Ofa => "nvidia_tensor_fp8_int4_ofa",
        NvidiaTensorCoreFp8Int4 => "nvidia_tensor_fp8_int4",
        AmdRyzenAiXdna2 => "amd_ryzen_ai_xdna2",
        AmdRyzenAiXdna1 => "amd_ryzen_ai_xdna1",
        IntelAiBoostNpu => "intel_ai_boost_npu",
        ArmKleidiAiSme2 => "arm_kleidiai_sme2",
        ArmEthosU => "arm_ethos_u",
        QualcommHexagonQnnHtp => "qualcomm_hexagon_qnn_htp",
        WebGpuComputeShaderFallback => "webgpu_compute_fallback",
    }
}

fn transport_wire_name(transport: ZeroCopyTransport) -> &'static str {
    use ZeroCopyTransport::*;
    match transport {
        AppleUnifiedMemoryIoSurface => "apple_uma_iosurface",
        WindowsDxgiSharedHandle => "d3d12_shared_handle",
        LinuxDmaBufFd => "linux_dmabuf_fd",
        AndroidHardwareBuffer => "android_hardware_buffer",
        BrowserArrayBufferCopy => "browser_arraybuffer_copy",
    }
}

fn decision_wire_name(decision: FrameBudgetDecision) -> &'static str {
    use FrameBudgetDecision::*;
    match decision {
        WithinBudget => "within_budget",
        NearBudgetWarning => "near_budget_warning",
        DowngradeUpscalerTier => "downgrade_upscaler_tier",
        FallbackToWebGpu => "fallback_to_webgpu",
    }
}

fn sanitize_kv_value(raw: &str) -> String {
    raw.chars()
        .map(|ch| if matches!(ch, ';' | '=' | '\n' | '\r') { ' ' } else { ch })
        .collect::<String>()
        .trim()
        .to_string()
}

fn escape_json_str(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len() + 4);
    for ch in raw.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            other => out.push(other),
        }
    }
    out
}

fn probe_linux_mem_mb() -> u32 {
    fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|info| {
            info.lines().find_map(|line| {
                line.strip_prefix("MemTotal:")?.split_whitespace().next()?.parse::<u64>().ok()
            })
        })
        .map(|kb| u32::try_from(kb / 1024).unwrap_or(u32::MAX))
        .unwrap_or(4_096)
}

fn probe_linux_drm_vendor() -> Option<GpuVendor> {
    for entry in fs::read_dir("/sys/class/drm").ok()?.flatten() {
        let s = entry.file_name().to_string_lossy().into_owned();
        if !s.starts_with("card") || s.contains('-') {
            continue;
        }
        if let Ok(raw) = fs::read_to_string(entry.path().join("device/vendor")) {
            match raw.trim().to_ascii_lowercase().as_str() {
                "0x10de" => return Some(GpuVendor::Nvidia),
                "0x1002" => return Some(GpuVendor::Amd),
                "0x8086" => return Some(GpuVendor::Intel),
                _ => {}
            }
        }
    }
    None
}

fn base_probe(os: HostOs, vendor: GpuVendor, device_name: String, driver_version: String, vram_mb: u32) -> HostHardwareProbe {
    HostHardwareProbe { os, vendor, device_name, driver_version, vram_mb, target_fps: 120, ..HostHardwareProbe::default() }
}

/// 실제 실행 중인 호스트 OS·CPU·메모리를 안전하게 프로브해 `HostHardwareProbe`를 구성한다.
fn detect_real_host_probe() -> HostHardwareProbe {
    let (os_const, arch) = (env::consts::OS, env::consts::ARCH);
    match os_const {
        "macos" => {
            let brand = run_command_trimmed("sysctl", &["-n", "machdep.cpu.brand_string"])
                .unwrap_or_else(|| if arch == "aarch64" { String::from("Apple Silicon") } else { format!("macOS {arch} CPU") });
            let mem_mb = run_command_trimmed("sysctl", &["-n", "hw.memsize"])
                .and_then(|s| s.parse::<u64>().ok())
                .map(|bytes| u32::try_from(bytes / (1024 * 1024)).unwrap_or(u32::MAX))
                .unwrap_or(16_384);
            let driver = run_command_trimmed("sw_vers", &["-productVersion"])
                .map(|v| format!("macOS-{v}"))
                .unwrap_or_else(|| String::from("macOS-unknown"));
            let apple = arch == "aarch64" || brand.contains("Apple");
            let mut probe = base_probe(HostOs::MacOs, if apple { GpuVendor::Apple } else { GpuVendor::WebGpuFallback }, brand, driver, mem_mb);
            probe.unified_memory = apple;
            probe.allow_multi_frame_gen = apple;
            probe.supports_metal3 = apple;
            probe.supports_metalfx_temporal = apple;
            probe.supports_metalfx_spatial = apple;
            probe.supports_apple_ane = apple;
            probe
        }
        "linux" => {
            let driver = run_command_trimmed("uname", &["-r"]).map(|v| format!("Linux-{v}")).unwrap_or_else(|| String::from("Linux-unknown"));
            let vendor = probe_linux_drm_vendor().unwrap_or(GpuVendor::WebGpuFallback);
            let name = match vendor {
                GpuVendor::Nvidia => format!("Linux {arch} NVIDIA DRM Adapter"),
                GpuVendor::Amd => format!("Linux {arch} AMD DRM Adapter"),
                GpuVendor::Intel => format!("Linux {arch} Intel DRM Adapter"),
                _ => format!("Linux {arch} Fallback Adapter"),
            };
            base_probe(HostOs::Linux, vendor, name, driver, probe_linux_mem_mb())
        }
        "windows" => base_probe(HostOs::Windows, GpuVendor::WebGpuFallback, format!("Windows {arch} Adapter"), String::from("Windows-unknown"), 8_192),
        _ => base_probe(HostOs::BrowserSandbox, GpuVendor::WebGpuFallback, format!("{os_const} {arch} Fallback Adapter"), String::from("0.0.0"), 2_048),
    }
}

fn format_plan_summary(probe: &HostHardwareProbe, plan: &NativeBridgeSessionPlan) -> String {
    let fallback = plan
        .fallback_reason
        .as_deref()
        .map(sanitize_kv_value)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| String::from("none"));
    format!(
        "vendor={};backend={};upscaler={};npu={};low_latency={};transport={};target_fps={};frame_budget_us={};host_os={};adapter={};fallback={};native={};zero_copy={};fingerprint={}",
        plan.vendor.as_str(), backend_wire_name(plan.graphics_backend), upscaler_wire_name(plan.upscaler),
        npu_wire_name(plan.npu_backend), low_latency_wire_name(plan.low_latency), transport_wire_name(plan.transport),
        probe.target_fps, plan.frame_budget_us, plan.os.as_str(), sanitize_kv_value(&probe.device_name),
        fallback, plan.is_native_accelerated, plan.zero_copy_enabled, plan.session_fingerprint,
    )
}

fn format_probe_host_json(probe: &HostHardwareProbe, plan: &NativeBridgeSessionPlan) -> String {
    let fallback_json = plan
        .fallback_reason
        .as_deref()
        .map(|r| format!("\"{}\"", escape_json_str(r)))
        .unwrap_or_else(|| String::from("null"));
    let descriptor = format_host_probe_descriptor(probe);
    format!(
        concat!(
            "{{\"protocol_version\":{},\"host_os\":\"{}\",\"rust_os\":\"{}\",\"host_arch\":\"{}\",",
            "\"probe\":{{\"os\":\"{}\",\"vendor\":\"{}\",\"device_name\":\"{}\",\"driver_version\":\"{}\",",
            "\"vram_mb\":{},\"unified_memory\":{},\"target_fps\":{},\"descriptor\":\"{}\"}},",
            "\"plan\":{{\"vendor\":\"{}\",\"os\":\"{}\",\"backend\":\"{}\",\"upscaler\":\"{}\",",
            "\"low_latency\":\"{}\",\"npu\":\"{}\",\"transport\":\"{}\",",
            "\"is_native_accelerated\":{},\"zero_copy_enabled\":{},\"target_fps\":{},",
            "\"frame_budget_us\":{},\"recommended_flags\":{},\"estimated_speedup_x100\":{},",
            "\"session_fingerprint\":{},\"fallback_reason\":{}}}}}"
        ),
        IPC_PROTOCOL_VERSION, escape_json_str(host_platform_label()), escape_json_str(env::consts::OS),
        escape_json_str(env::consts::ARCH), escape_json_str(probe.os.as_str()), escape_json_str(probe.vendor.as_str()),
        escape_json_str(&probe.device_name), escape_json_str(&probe.driver_version), probe.vram_mb,
        probe.unified_memory, probe.target_fps, escape_json_str(&descriptor), escape_json_str(plan.vendor.as_str()),
        escape_json_str(plan.os.as_str()), escape_json_str(backend_wire_name(plan.graphics_backend)),
        escape_json_str(upscaler_wire_name(plan.upscaler)), escape_json_str(low_latency_wire_name(plan.low_latency)),
        escape_json_str(npu_wire_name(plan.npu_backend)), escape_json_str(transport_wire_name(plan.transport)),
        plan.is_native_accelerated, plan.zero_copy_enabled, probe.target_fps, plan.frame_budget_us,
        plan.recommended_flags, plan.estimated_speedup_x100, plan.session_fingerprint, fallback_json,
    )
}

struct DaemonSessionState {
    host_probe: HostHardwareProbe,
    active_plan: NativeBridgeSessionPlan,
    budget_guard: FrameLatencyBudgetGuard,
    dynamic_scale_pct: u32,
    prewarm_count: u64,
    error_count: u64,
    fallback_seq: u64,
}

impl DaemonSessionState {
    fn new(host_probe: HostHardwareProbe) -> Result<Self, BridgeError> {
        let active_plan = negotiate_native_bridge_session(&host_probe)?;
        Ok(Self {
            host_probe,
            active_plan,
            budget_guard: FrameLatencyBudgetGuard::new(DEFAULT_OVERRUN_FALLBACK_THRESHOLD),
            dynamic_scale_pct: 100,
            prewarm_count: 0,
            error_count: 0,
            fallback_seq: 1,
        })
    }

    fn next_safe_sequence(&mut self, hint: Option<u64>) -> u64 {
        let candidate = hint.filter(|&seq| seq > 0).unwrap_or(self.fallback_seq);
        self.fallback_seq = self.fallback_seq.max(candidate).saturating_add(1).max(1);
        candidate
    }

    fn extract_sequence_hint(raw: &[u8]) -> Option<u64> {
        let slice: [u8; 8] = raw.get(8..16)?.try_into().ok()?;
        let seq = u64::from_le_bytes(slice);
        (seq > 0).then_some(seq)
    }

    fn reply_packet(&self, kind: IpcPacketKind, seq: u64, latency_us: u32, payload: Vec<u8>) -> IpcFramePacket {
        IpcFramePacket {
            version: IPC_PROTOCOL_VERSION,
            kind,
            vendor: self.active_plan.vendor,
            sequence: seq,
            shm: SharedMemoryHandleMeta::default(),
            flags: self.active_plan.recommended_flags & !FLAG_ZERO_COPY_SHM,
            frame_budget_us: self.active_plan.frame_budget_us,
            actual_latency_us: latency_us,
            payload,
        }
    }

    fn build_error_packet(&mut self, seq_hint: Option<u64>, message: &str) -> IpcFramePacket {
        self.error_count = self.error_count.saturating_add(1);
        let safe_seq = self.next_safe_sequence(seq_hint);
        let mut payload = format!("error=true;detail={}", sanitize_kv_value(message)).into_bytes();
        payload.truncate(IPC_MAX_PAYLOAD_BYTES);
        let mut pkt = self.reply_packet(IpcPacketKind::ErrorNotice, safe_seq, 0, payload);
        pkt.flags = FLAG_FALLBACK_WEBGPU;
        pkt
    }

    fn update_dynamic_scale(&mut self, decision: FrameBudgetDecision) -> u32 {
        self.dynamic_scale_pct = match decision {
            FrameBudgetDecision::WithinBudget => self.dynamic_scale_pct.saturating_add(10).min(100),
            FrameBudgetDecision::NearBudgetWarning => self.dynamic_scale_pct.min(90),
            FrameBudgetDecision::DowngradeUpscalerTier => match self.budget_guard.consecutive_overruns() {
                1 => 80,
                2 => 67,
                _ => 50,
            },
            FrameBudgetDecision::FallbackToWebGpu => 50,
        };
        self.dynamic_scale_pct
    }

    fn handle_decoded_packet(&mut self, packet: IpcFramePacket, started: Instant) -> Result<IpcFramePacket, BridgeError> {
        let elapsed_us = || u32::try_from(started.elapsed().as_micros().max(1)).unwrap_or(u32::MAX);
        match packet.kind {
            IpcPacketKind::HandshakeRequest => {
                let probe = if packet.payload.is_empty() {
                    self.host_probe.clone()
                } else {
                    let text = std::str::from_utf8(&packet.payload).map_err(|_| BridgeError::InvalidProbeDescriptor {
                        field: String::from("payload"),
                        reason: String::from("유효한 UTF-8 프로브 서술자가 아닙니다"),
                    })?;
                    if text.trim().is_empty() { self.host_probe.clone() } else { parse_host_probe_descriptor(text)? }
                };
                let plan = negotiate_native_bridge_session(&probe)?;
                let summary = format_plan_summary(&probe, &plan);
                self.active_plan = plan;
                self.budget_guard = FrameLatencyBudgetGuard::new(DEFAULT_OVERRUN_FALLBACK_THRESHOLD);
                self.dynamic_scale_pct = 100;
                Ok(self.reply_packet(IpcPacketKind::HandshakeResponse, packet.sequence, elapsed_us(), summary.into_bytes()))
            }
            IpcPacketKind::FrameSubmit => {
                packet.shm.validate((packet.flags & FLAG_ZERO_COPY_SHM) != 0)?;
                let budget_us = if packet.frame_budget_us > 0 { packet.frame_budget_us } else { self.active_plan.frame_budget_us };
                let measured_us = elapsed_us();
                let latency_us = packet.actual_latency_us.max(measured_us);
                let decision = self.budget_guard.evaluate_frame(packet.sequence, budget_us, latency_us)?;
                let scale_pct = self.update_dynamic_scale(decision);
                let mut flags = packet.flags;
                if packet.shm.handle_id == 0 || packet.shm.byte_length == 0 {
                    flags &= !FLAG_ZERO_COPY_SHM;
                }
                if decision == FrameBudgetDecision::FallbackToWebGpu {
                    flags |= FLAG_FALLBACK_WEBGPU;
                }
                let payload = format!(
                    "decision={};scale_pct={};consecutive_over_budget={};vendor={};total_frames={};measured_daemon_us={}",
                    decision_wire_name(decision), scale_pct, self.budget_guard.consecutive_overruns(),
                    self.active_plan.vendor.as_str(), self.budget_guard.total_frames(), measured_us,
                );
                Ok(IpcFramePacket {
                    version: IPC_PROTOCOL_VERSION,
                    kind: IpcPacketKind::FrameComplete,
                    vendor: self.active_plan.vendor,
                    sequence: packet.sequence,
                    shm: packet.shm,
                    flags,
                    frame_budget_us: budget_us,
                    actual_latency_us: latency_us,
                    payload: payload.into_bytes(),
                })
            }
            IpcPacketKind::PsoPrewarmHint => {
                self.prewarm_count = self.prewarm_count.saturating_add(1);
                let payload = format!(
                    "pso_prewarm=ok;bytes={};prewarm_count={};vendor={}",
                    packet.payload.len(), self.prewarm_count, self.active_plan.vendor.as_str(),
                );
                Ok(self.reply_packet(IpcPacketKind::FrameComplete, packet.sequence, elapsed_us(), payload.into_bytes()))
            }
            IpcPacketKind::Heartbeat => {
                let payload = format!(
                    "alive=true;frames={};overruns={};prewarms={};errors={};vendor={};scale_pct={}",
                    self.budget_guard.total_frames(), self.budget_guard.total_overruns(),
                    self.prewarm_count, self.error_count, self.active_plan.vendor.as_str(), self.dynamic_scale_pct,
                );
                Ok(self.reply_packet(IpcPacketKind::Heartbeat, packet.sequence, elapsed_us(), payload.into_bytes()))
            }
            other => Ok(self.build_error_packet(Some(packet.sequence), &format!("지원하지 않는 요청 패킷 종류: {other:?}"))),
        }
    }

    fn process_raw_frame(&mut self, raw: &[u8]) -> Vec<u8> {
        let started = Instant::now();
        let seq_hint = Self::extract_sequence_hint(raw);
        let response = match decode_ipc_packet(raw) {
            Ok(pkt) => self.handle_decoded_packet(pkt, started).unwrap_or_else(|e| self.build_error_packet(seq_hint, &e.to_string())),
            Err(err) => self.build_error_packet(seq_hint, &err.to_string()),
        };
        encode_ipc_packet(&response).unwrap_or_else(|_| {
            let mut fallback = self.build_error_packet(None, "internal-encode-fallback");
            fallback.vendor = GpuVendor::WebGpuFallback;
            encode_ipc_packet(&fallback).unwrap_or_default()
        })
    }
}

fn read_exact_or_eof<R: Read>(reader: &mut R, buf: &mut [u8]) -> io::Result<bool> {
    let mut offset = 0usize;
    while offset < buf.len() {
        match reader.read(&mut buf[offset..]) {
            Ok(0) => return Ok(false),
            Ok(n) => offset += n,
            Err(err) if err.kind() == io::ErrorKind::Interrupted => continue,
            Err(err) => return Err(err),
        }
    }
    Ok(true)
}

fn write_framed_packet<W: Write>(writer: &mut W, packet: &[u8]) -> io::Result<()> {
    let len = u32::try_from(packet.len()).map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "응답 길이 u32 초과"))?;
    writer.write_all(&len.to_le_bytes())?;
    writer.write_all(packet)?;
    writer.flush()
}

fn run_stdio_daemon_loop<R: Read, W: Write>(reader: &mut R, writer: &mut W, state: &mut DaemonSessionState) -> io::Result<()> {
    let mut len_buf = [0u8; 4];
    while read_exact_or_eof(reader, &mut len_buf)? {
        let frame_len = u32::from_le_bytes(len_buf) as usize;
        if frame_len == 0 {
            if let Ok(enc) = encode_ipc_packet(&state.build_error_packet(None, "빈 IPC 프레임(0B)은 처리할 수 없습니다")) {
                write_framed_packet(writer, &enc)?;
            }
            continue;
        }
        if frame_len > MAX_FRAMED_PACKET_BYTES {
            let msg = format!("프레임 길이({frame_len}B)가 허용 상한({MAX_FRAMED_PACKET_BYTES}B) 초과");
            if let Ok(enc) = encode_ipc_packet(&state.build_error_packet(None, &msg)) {
                write_framed_packet(writer, &enc)?;
            }
            break;
        }
        let mut raw_frame = vec![0u8; frame_len];
        if !read_exact_or_eof(reader, &mut raw_frame)? {
            break;
        }
        let response = state.process_raw_frame(&raw_frame);
        write_framed_packet(writer, &response)?;
    }
    Ok(())
}

fn run_cli() -> Result<(), String> {
    let host_probe = detect_real_host_probe();
    if env::args().skip(1).any(|arg| arg == "--probe-host") {
        let plan = negotiate_native_bridge_session(&host_probe).map_err(|e| format!("호스트 세션 협상 실패: {e}"))?;
        let mut stdout = io::stdout().lock();
        writeln!(stdout, "{}", format_probe_host_json(&host_probe, &plan)).map_err(|e| format!("stdout 출력 실패: {e}"))?;
        return stdout.flush().map_err(|e| format!("stdout flush 실패: {e}"));
    }
    let mut state = DaemonSessionState::new(host_probe).map_err(|e| format!("데몬 세션 초기화 실패: {e}"))?;
    let (mut stdin, mut stdout) = (io::stdin().lock(), io::stdout().lock());
    run_stdio_daemon_loop(&mut stdin, &mut stdout, &mut state).map_err(|e| format!("stdio IPC 루프 오류: {e}"))
}

fn main() -> ExitCode {
    match run_cli() {
        Ok(()) => ExitCode::SUCCESS,
        Err(msg) => {
            let _ = writeln!(io::stderr(), "{msg}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn make_packet(kind: IpcPacketKind, seq: u64, budget: u32, actual: u32, payload: &[u8]) -> Vec<u8> {
        encode_ipc_packet(&IpcFramePacket {
            version: IPC_PROTOCOL_VERSION, kind, vendor: GpuVendor::WebGpuFallback, sequence: seq,
            shm: SharedMemoryHandleMeta::default(), flags: 0, frame_budget_us: budget,
            actual_latency_us: actual, payload: payload.to_vec(),
        })
        .expect("테스트 패킷 인코딩")
    }

    #[test]
    fn probe_host_json_is_valid_and_escapes_special_characters() {
        let mut probe = base_probe(HostOs::MacOs, GpuVendor::Apple, String::from("Apple \"M4\" Max\\Lab"), String::from("macOS-15.4"), 65_536);
        probe.unified_memory = true;
        probe.supports_metal3 = true;
        probe.supports_metalfx_temporal = true;
        probe.supports_apple_ane = true;
        let plan = negotiate_native_bridge_session(&probe).expect("협상 성공");
        let json = format_probe_host_json(&probe, &plan);
        assert!(json.contains("\"backend\":\"metal3\"") && json.contains("\"upscaler\":\"metal_fx_temporal\""));
        assert!(json.contains("\"npu\":\"apple_neural_engine\"") && json.contains("Apple \\\"M4\\\" Max\\\\Lab"));
    }

    #[test]
    fn stdio_loop_handles_handshake_frames_crc_corruption_and_recovery() {
        let mut state = DaemonSessionState::new(detect_real_host_probe()).expect("세션 초기화");
        let mut bad = make_packet(IpcPacketKind::Heartbeat, 4, 8_333, 0, b"ping");
        bad[10] ^= 0xFF;
        let pkts = [
            make_packet(IpcPacketKind::HandshakeRequest, 1, 8_333, 0, b""),
            make_packet(IpcPacketKind::FrameSubmit, 2, 8_333, 2_000, b"cut=1"),
            make_packet(IpcPacketKind::FrameSubmit, 3, 8_333, 12_500, b"cut=2"),
            bad,
            make_packet(IpcPacketKind::Heartbeat, 5, 8_333, 0, b""),
        ];
        let mut wire_in = Vec::new();
        for pkt in &pkts {
            wire_in.extend_from_slice(&(pkt.len() as u32).to_le_bytes());
            wire_in.extend_from_slice(pkt);
        }
        let mut wire_out = Vec::new();
        run_stdio_daemon_loop(&mut Cursor::new(wire_in), &mut wire_out, &mut state).expect("루프");
        let (mut cursor, mut resps, mut len_buf) = (Cursor::new(wire_out), Vec::new(), [0u8; 4]);
        while read_exact_or_eof(&mut cursor, &mut len_buf).expect("길이") {
            let mut body = vec![0u8; u32::from_le_bytes(len_buf) as usize];
            cursor.read_exact(&mut body).expect("본문");
            resps.push(decode_ipc_packet(&body).expect("디코딩"));
        }
        assert_eq!(resps.len(), 5);
        assert_eq!(resps[0].kind, IpcPacketKind::HandshakeResponse);
        assert!(String::from_utf8_lossy(&resps[1].payload).contains("decision=within_budget"));
        assert!(String::from_utf8_lossy(&resps[2].payload).contains("scale_pct=80"));
        assert_eq!(resps[3].kind, IpcPacketKind::ErrorNotice);
        assert!(String::from_utf8_lossy(&resps[3].payload).contains("CRC-32"));
        assert_eq!(resps[4].kind, IpcPacketKind::Heartbeat);
        assert!(String::from_utf8_lossy(&resps[4].payload).contains("alive=true;frames=2"));
    }
}
