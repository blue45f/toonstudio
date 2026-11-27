//! 멀티 벤더 네이티브 GPU/NPU 기능 매트릭스 및 결정론적 세션 협상 엔진.
//!
//! 지원 대상 벤더:
//! - Apple: Metal 3 + MetalFX Spatial/Temporal + Apple Neural Engine(CoreML ANE) + Unified Memory Zero-Copy
//! - NVIDIA: DLSS 3.5 / DLSS 4(Transformer SR + Multi Frame Gen) + Reflex 2 Frame Warp + Tensor Core FP8/INT4 + OFA
//! - AMD: FSR 1/2/3/4(4.1 INT8 Full/Lite) + Radeon Anti-Lag 2 + Ryzen AI XDNA/XDNA 2 NPU
//! - Intel: XeSS 1/2(XMX/DP4a + FG) + XeLL Low Latency + Intel AI Boost NPU
//! - Arm: Arm ASR + Arm NSS + Arm Ethos-U / KleidiAI SME2
//! - Qualcomm: Snapdragon GSR 2 + Hexagon NPU(QNN/HTP)

use crate::ipc_protocol::{
    crc32_ieee, FLAG_FALLBACK_WEBGPU, FLAG_LOW_LATENCY_MARK, FLAG_MULTI_FRAME_GEN,
    FLAG_NPU_ASSISTED, FLAG_ZERO_COPY_SHM,
};
use crate::BridgeError;

/// 호스트 운영체제 또는 브라우저 샌드박스 실행 환경.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HostOs {
    MacOs,
    Windows,
    Linux,
    Android,
    Ios,
    BrowserSandbox,
}

impl HostOs {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::MacOs => "macos",
            Self::Windows => "windows",
            Self::Linux => "linux",
            Self::Android => "android",
            Self::Ios => "ios",
            Self::BrowserSandbox => "browser-sandbox",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "macos" | "darwin" | "osx" => Some(Self::MacOs),
            "windows" | "win32" | "win64" => Some(Self::Windows),
            "linux" => Some(Self::Linux),
            "android" => Some(Self::Android),
            "ios" | "ipados" => Some(Self::Ios),
            "browser" | "browser-sandbox" | "web" => Some(Self::BrowserSandbox),
            _ => None,
        }
    }
}

/// GPU/NPU 실리콘 벤더 식별자 (바이너리 IPC 와이어 ID와 1:1 매핑).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum GpuVendor {
    WebGpuFallback = 0,
    Apple = 1,
    Nvidia = 2,
    Amd = 3,
    Intel = 4,
    Arm = 5,
    Qualcomm = 6,
}

impl GpuVendor {
    pub const fn to_wire_id(self) -> u8 {
        self as u8
    }

    pub const fn from_wire_id(id: u8) -> Option<Self> {
        match id {
            0 => Some(Self::WebGpuFallback),
            1 => Some(Self::Apple),
            2 => Some(Self::Nvidia),
            3 => Some(Self::Amd),
            4 => Some(Self::Intel),
            5 => Some(Self::Arm),
            6 => Some(Self::Qualcomm),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::WebGpuFallback => "webgpu-fallback",
            Self::Apple => "apple",
            Self::Nvidia => "nvidia",
            Self::Amd => "amd",
            Self::Intel => "intel",
            Self::Arm => "arm",
            Self::Qualcomm => "qualcomm",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "webgpu" | "webgpu-fallback" | "fallback" => Some(Self::WebGpuFallback),
            "apple" => Some(Self::Apple),
            "nvidia" => Some(Self::Nvidia),
            "amd" | "radeon" => Some(Self::Amd),
            "intel" | "arc" => Some(Self::Intel),
            "arm" | "mali" | "immortalis" => Some(Self::Arm),
            "qualcomm" | "snapdragon" | "adreno" => Some(Self::Qualcomm),
            _ => None,
        }
    }
}

/// AMD FSR 지원 단계 (FSR 1/2/3/4.1 INT8 Lite/Full).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AmdFsrCapability {
    None,
    Fsr1,
    Fsr2,
    Fsr3,
    Fsr41Int8Lite,
    Fsr41Int8Full,
}

impl AmdFsrCapability {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Fsr1 => "fsr1",
            Self::Fsr2 => "fsr2",
            Self::Fsr3 => "fsr3",
            Self::Fsr41Int8Lite => "fsr4.1-int8-lite",
            Self::Fsr41Int8Full => "fsr4.1-int8-full",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "none" | "0" => Some(Self::None),
            "fsr1" | "1" => Some(Self::Fsr1),
            "fsr2" | "2" => Some(Self::Fsr2),
            "fsr3" | "3" => Some(Self::Fsr3),
            "fsr4-lite" | "fsr4.1-lite" | "fsr4.1-int8-lite" | "4-lite" => {
                Some(Self::Fsr41Int8Lite)
            }
            "fsr4" | "fsr4-full" | "fsr4.1-full" | "fsr4.1-int8-full" | "4" => {
                Some(Self::Fsr41Int8Full)
            }
            _ => None,
        }
    }
}

/// Intel XeSS 지원 단계 (XeSS 1 / XeSS 2 DP4a / XeSS 2 XMX + FG).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum IntelXessCapability {
    None,
    Xess1,
    Xess2Dp4a,
    Xess2XmxFrameGen,
}

impl IntelXessCapability {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Xess1 => "xess1",
            Self::Xess2Dp4a => "xess2-dp4a",
            Self::Xess2XmxFrameGen => "xess2-xmx-fg",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "none" | "0" => Some(Self::None),
            "xess1" | "1" => Some(Self::Xess1),
            "xess2-dp4a" | "dp4a" => Some(Self::Xess2Dp4a),
            "xess2" | "xess2-xmx" | "xess2-xmx-fg" | "xmx" => Some(Self::Xess2XmxFrameGen),
            _ => None,
        }
    }
}

/// 선택된 네이티브/웹 그래픽 백엔드.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GraphicsBackend {
    Metal3,
    DirectX12,
    Vulkan13,
    WebGpuWgsl,
}

/// 선택된 업스케일러 및 프레임 생성 경로.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum UpscalerKind {
    MetalFxTemporal,
    MetalFxSpatial,
    Dlss4TransformerMultiFrameGen,
    Dlss4TransformerSr,
    Dlss35RayReconstruction,
    Fsr41Int8Full,
    Fsr41Int8Lite,
    Fsr3FrameGen,
    Fsr2Temporal,
    Fsr1Spatial,
    Xess2XmxFrameGen,
    Xess2XmxSr,
    Xess2Dp4a,
    Xess1,
    ArmNss,
    ArmAsr,
    SnapdragonGsr2,
    WebGpuWgslBicubicCas,
}

impl UpscalerKind {
    pub const fn uses_multi_frame_gen(self) -> bool {
        matches!(
            self,
            Self::Dlss4TransformerMultiFrameGen | Self::Fsr3FrameGen | Self::Xess2XmxFrameGen
        )
    }

    pub const fn estimated_speedup_x100(self) -> u16 {
        match self {
            Self::Dlss4TransformerMultiFrameGen => 360,
            Self::Dlss4TransformerSr => 240,
            Self::Dlss35RayReconstruction => 210,
            Self::Fsr41Int8Full => 235,
            Self::Fsr41Int8Lite => 205,
            Self::Fsr3FrameGen => 250,
            Self::Fsr2Temporal => 185,
            Self::Fsr1Spatial => 145,
            Self::MetalFxTemporal => 220,
            Self::MetalFxSpatial => 160,
            Self::Xess2XmxFrameGen => 260,
            Self::Xess2XmxSr => 205,
            Self::Xess2Dp4a => 175,
            Self::Xess1 => 155,
            Self::ArmNss => 200,
            Self::ArmAsr => 165,
            Self::SnapdragonGsr2 => 180,
            Self::WebGpuWgslBicubicCas => 115,
        }
    }
}

/// 선택된 저지연 입력-표시 동기화 경로.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LowLatencyKind {
    AppleMetalDirectPresent,
    NvidiaReflex2FrameWarp,
    AmdRadeonAntiLag2,
    IntelXeLl,
    ArmFramePacing,
    QualcommFramePacing,
    WebGpuQueuePacing,
}

impl LowLatencyKind {
    pub const fn is_native_hardware_sync(self) -> bool {
        !matches!(self, Self::WebGpuQueuePacing)
    }
}

/// 선택된 신경망 추론 가속기(NPU / Tensor / SME2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NpuBackend {
    AppleCoreMlAne,
    NvidiaTensorCoreFp8Int4Ofa,
    NvidiaTensorCoreFp8Int4,
    AmdRyzenAiXdna2,
    AmdRyzenAiXdna1,
    IntelAiBoostNpu,
    ArmKleidiAiSme2,
    ArmEthosU,
    QualcommHexagonQnnHtp,
    WebGpuComputeShaderFallback,
}

impl NpuBackend {
    pub const fn is_native_npu(self) -> bool {
        !matches!(self, Self::WebGpuComputeShaderFallback)
    }
}

/// 호스트-브릿지 간 텍스처·텐서 메모리 공유 방식.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ZeroCopyTransport {
    AppleUnifiedMemoryIoSurface,
    WindowsDxgiSharedHandle,
    LinuxDmaBufFd,
    AndroidHardwareBuffer,
    BrowserArrayBufferCopy,
}

impl ZeroCopyTransport {
    pub const fn is_zero_copy(self) -> bool {
        !matches!(self, Self::BrowserArrayBufferCopy)
    }
}

/// 호스트 OS 및 하드웨어 프로브 서술자.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostHardwareProbe {
    pub os: HostOs,
    pub vendor: GpuVendor,
    pub device_name: String,
    pub driver_version: String,
    pub vram_mb: u32,
    pub unified_memory: bool,
    pub target_fps: u32,
    pub allow_multi_frame_gen: bool,
    // Apple
    pub supports_metal3: bool,
    pub supports_metalfx_temporal: bool,
    pub supports_metalfx_spatial: bool,
    pub supports_apple_ane: bool,
    // NVIDIA
    pub supports_dlss4_transformer: bool,
    pub supports_dlss35: bool,
    pub supports_reflex2_frame_warp: bool,
    pub supports_tensor_fp8_int4: bool,
    pub supports_nvidia_ofa: bool,
    // AMD
    pub amd_fsr: AmdFsrCapability,
    pub supports_anti_lag2: bool,
    pub amd_xdna_generation: u8,
    // Intel
    pub intel_xess: IntelXessCapability,
    pub supports_xell: bool,
    pub supports_intel_ai_boost: bool,
    // Arm
    pub supports_arm_asr: bool,
    pub supports_arm_nss: bool,
    pub supports_arm_ethos_u: bool,
    pub supports_arm_kleidiai_sme2: bool,
    // Qualcomm
    pub supports_snapdragon_gsr2: bool,
    pub supports_hexagon_qnn_htp: bool,
}

impl Default for HostHardwareProbe {
    fn default() -> Self {
        Self {
            os: HostOs::BrowserSandbox,
            vendor: GpuVendor::WebGpuFallback,
            device_name: String::from("Generic WebGPU Adapter"),
            driver_version: String::from("0.0.0"),
            vram_mb: 2048,
            unified_memory: false,
            target_fps: 120,
            allow_multi_frame_gen: true,
            supports_metal3: false,
            supports_metalfx_temporal: false,
            supports_metalfx_spatial: false,
            supports_apple_ane: false,
            supports_dlss4_transformer: false,
            supports_dlss35: false,
            supports_reflex2_frame_warp: false,
            supports_tensor_fp8_int4: false,
            supports_nvidia_ofa: false,
            amd_fsr: AmdFsrCapability::None,
            supports_anti_lag2: false,
            amd_xdna_generation: 0,
            intel_xess: IntelXessCapability::None,
            supports_xell: false,
            supports_intel_ai_boost: false,
            supports_arm_asr: false,
            supports_arm_nss: false,
            supports_arm_ethos_u: false,
            supports_arm_kleidiai_sme2: false,
            supports_snapdragon_gsr2: false,
            supports_hexagon_qnn_htp: false,
        }
    }
}

/// 결정론적으로 협상된 네이티브 GPU/NPU 브릿지 세션 계획.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeBridgeSessionPlan {
    pub vendor: GpuVendor,
    pub os: HostOs,
    pub graphics_backend: GraphicsBackend,
    pub upscaler: UpscalerKind,
    pub low_latency: LowLatencyKind,
    pub npu_backend: NpuBackend,
    pub transport: ZeroCopyTransport,
    pub is_native_accelerated: bool,
    pub zero_copy_enabled: bool,
    pub frame_budget_us: u32,
    pub recommended_flags: u32,
    pub estimated_speedup_x100: u16,
    pub fallback_reason: Option<String>,
    pub session_fingerprint: u32,
}

/// 지원 벤더 6종 타깃 매트릭스 정적 요약 항목.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VendorMatrixEntry {
    pub vendor: GpuVendor,
    pub primary_api: &'static str,
    pub upscalers: &'static str,
    pub low_latency: &'static str,
    pub npu_stack: &'static str,
    pub zero_copy_mechanism: &'static str,
}

/// 지원 타깃 6대 벤더 기능 매트릭스.
pub const VENDOR_CAPABILITY_MATRIX: [VendorMatrixEntry; 6] = [
    VendorMatrixEntry {
        vendor: GpuVendor::Apple,
        primary_api: "Metal 3",
        upscalers: "MetalFX Spatial / Temporal",
        low_latency: "Metal Direct Present",
        npu_stack: "Apple Neural Engine (CoreML ANE)",
        zero_copy_mechanism: "Unified Memory Zero-Copy (IOSurface)",
    },
    VendorMatrixEntry {
        vendor: GpuVendor::Nvidia,
        primary_api: "DirectX 12 / Vulkan 1.3",
        upscalers: "DLSS 3.5 / DLSS 4 (Transformer SR + Multi Frame Gen)",
        low_latency: "Reflex 2 Frame Warp",
        npu_stack: "Tensor Core FP8/INT4 + OFA",
        zero_copy_mechanism: "DXGI Shared Handle / DMA-BUF",
    },
    VendorMatrixEntry {
        vendor: GpuVendor::Amd,
        primary_api: "DirectX 12 / Vulkan 1.3",
        upscalers: "FSR 1 / 2 / 3 / 4.1 (INT8 Full / Lite)",
        low_latency: "Radeon Anti-Lag 2",
        npu_stack: "Ryzen AI XDNA / XDNA 2 NPU",
        zero_copy_mechanism: "DXGI Shared Handle / DMA-BUF",
    },
    VendorMatrixEntry {
        vendor: GpuVendor::Intel,
        primary_api: "DirectX 12 / Vulkan 1.3",
        upscalers: "XeSS 1 / 2 (XMX / DP4a + FG)",
        low_latency: "XeLL Low Latency",
        npu_stack: "Intel AI Boost NPU",
        zero_copy_mechanism: "DXGI Shared Handle / DMA-BUF",
    },
    VendorMatrixEntry {
        vendor: GpuVendor::Arm,
        primary_api: "Vulkan 1.3 / DirectX 12",
        upscalers: "Arm ASR / Arm NSS",
        low_latency: "Arm Frame Pacing",
        npu_stack: "Arm Ethos-U / KleidiAI SME2",
        zero_copy_mechanism: "AHardwareBuffer / DMA-BUF",
    },
    VendorMatrixEntry {
        vendor: GpuVendor::Qualcomm,
        primary_api: "Vulkan 1.3 / DirectX 12",
        upscalers: "Snapdragon GSR 2",
        low_latency: "Qualcomm Frame Pacing",
        npu_stack: "Hexagon NPU (QNN / HTP)",
        zero_copy_mechanism: "AHardwareBuffer / DXGI Shared Handle",
    },
];

fn parse_bool_field(key: &str, value: &str) -> Result<bool, BridgeError> {
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Ok(true),
        "false" | "0" | "no" => Ok(false),
        _ => Err(BridgeError::InvalidProbeDescriptor {
            field: key.to_string(),
            reason: format!("불리언 값이 아닙니다: {value}"),
        }),
    }
}

/// `key=value` 줄바꿈 또는 세미콜론 구분 텍스트에서 호스트 하드웨어 프로브 서술자를 파싱한다.
pub fn parse_host_probe_descriptor(raw: &str) -> Result<HostHardwareProbe, BridgeError> {
    let mut probe = HostHardwareProbe::default();
    let mut saw_any = false;

    for segment in raw.split(['\n', ';']) {
        let trimmed = segment.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((k, v)) = trimmed.split_once('=') else {
            return Err(BridgeError::InvalidProbeDescriptor {
                field: trimmed.to_string(),
                reason: String::from("key=value 형식이 아닙니다"),
            });
        };
        let key = k.trim();
        let val = v.trim();
        saw_any = true;
        match key {
            "os" => {
                probe.os =
                    HostOs::parse(val).ok_or_else(|| BridgeError::InvalidProbeDescriptor {
                        field: String::from("os"),
                        reason: format!("지원하지 않는 OS: {val}"),
                    })?;
            }
            "vendor" => {
                probe.vendor =
                    GpuVendor::parse(val).ok_or_else(|| BridgeError::InvalidProbeDescriptor {
                        field: String::from("vendor"),
                        reason: format!("지원하지 않는 벤더: {val}"),
                    })?;
            }
            "device_name" => probe.device_name = val.to_string(),
            "driver_version" => probe.driver_version = val.to_string(),
            "vram_mb" => {
                probe.vram_mb =
                    val.parse::<u32>()
                        .map_err(|_| BridgeError::InvalidProbeDescriptor {
                            field: String::from("vram_mb"),
                            reason: format!("u32 정수가 아닙니다: {val}"),
                        })?;
            }
            "target_fps" => {
                probe.target_fps =
                    val.parse::<u32>()
                        .map_err(|_| BridgeError::InvalidProbeDescriptor {
                            field: String::from("target_fps"),
                            reason: format!("u32 정수가 아닙니다: {val}"),
                        })?;
            }
            "unified_memory" => probe.unified_memory = parse_bool_field(key, val)?,
            "allow_multi_frame_gen" => probe.allow_multi_frame_gen = parse_bool_field(key, val)?,
            "metal3" => probe.supports_metal3 = parse_bool_field(key, val)?,
            "metalfx_temporal" => probe.supports_metalfx_temporal = parse_bool_field(key, val)?,
            "metalfx_spatial" => probe.supports_metalfx_spatial = parse_bool_field(key, val)?,
            "apple_ane" => probe.supports_apple_ane = parse_bool_field(key, val)?,
            "dlss4" => probe.supports_dlss4_transformer = parse_bool_field(key, val)?,
            "dlss35" => probe.supports_dlss35 = parse_bool_field(key, val)?,
            "reflex2" => probe.supports_reflex2_frame_warp = parse_bool_field(key, val)?,
            "tensor_fp8_int4" => probe.supports_tensor_fp8_int4 = parse_bool_field(key, val)?,
            "nvidia_ofa" => probe.supports_nvidia_ofa = parse_bool_field(key, val)?,
            "amd_fsr" => {
                probe.amd_fsr = AmdFsrCapability::parse(val).ok_or_else(|| {
                    BridgeError::InvalidProbeDescriptor {
                        field: String::from("amd_fsr"),
                        reason: format!("알 수 없는 FSR 단계: {val}"),
                    }
                })?;
            }
            "anti_lag2" => probe.supports_anti_lag2 = parse_bool_field(key, val)?,
            "amd_xdna" => {
                probe.amd_xdna_generation =
                    val.parse::<u8>()
                        .map_err(|_| BridgeError::InvalidProbeDescriptor {
                            field: String::from("amd_xdna"),
                            reason: format!("u8 세대 숫자가 아닙니다: {val}"),
                        })?;
            }
            "intel_xess" => {
                probe.intel_xess = IntelXessCapability::parse(val).ok_or_else(|| {
                    BridgeError::InvalidProbeDescriptor {
                        field: String::from("intel_xess"),
                        reason: format!("알 수 없는 XeSS 단계: {val}"),
                    }
                })?;
            }
            "xell" => probe.supports_xell = parse_bool_field(key, val)?,
            "intel_ai_boost" => probe.supports_intel_ai_boost = parse_bool_field(key, val)?,
            "arm_asr" => probe.supports_arm_asr = parse_bool_field(key, val)?,
            "arm_nss" => probe.supports_arm_nss = parse_bool_field(key, val)?,
            "arm_ethos_u" => probe.supports_arm_ethos_u = parse_bool_field(key, val)?,
            "arm_kleidiai_sme2" => probe.supports_arm_kleidiai_sme2 = parse_bool_field(key, val)?,
            "snapdragon_gsr2" => probe.supports_snapdragon_gsr2 = parse_bool_field(key, val)?,
            "hexagon_qnn_htp" => probe.supports_hexagon_qnn_htp = parse_bool_field(key, val)?,
            other => {
                return Err(BridgeError::InvalidProbeDescriptor {
                    field: other.to_string(),
                    reason: String::from("허용되지 않은 프로브 키입니다"),
                });
            }
        }
    }

    if !saw_any {
        return Err(BridgeError::InvalidProbeDescriptor {
            field: String::from("descriptor"),
            reason: String::from("빈 프로브 서술자입니다"),
        });
    }

    Ok(probe)
}

/// 호스트 하드웨어 프로브 서술자를 표준 `key=value` 문자열로 직렬화한다.
pub fn format_host_probe_descriptor(probe: &HostHardwareProbe) -> String {
    format!(
        "os={};vendor={};device_name={};driver_version={};vram_mb={};unified_memory={};target_fps={};allow_multi_frame_gen={};metal3={};metalfx_temporal={};metalfx_spatial={};apple_ane={};dlss4={};dlss35={};reflex2={};tensor_fp8_int4={};nvidia_ofa={};amd_fsr={};anti_lag2={};amd_xdna={};intel_xess={};xell={};intel_ai_boost={};arm_asr={};arm_nss={};arm_ethos_u={};arm_kleidiai_sme2={};snapdragon_gsr2={};hexagon_qnn_htp={}",
        probe.os.as_str(),
        probe.vendor.as_str(),
        probe.device_name,
        probe.driver_version,
        probe.vram_mb,
        probe.unified_memory,
        probe.target_fps,
        probe.allow_multi_frame_gen,
        probe.supports_metal3,
        probe.supports_metalfx_temporal,
        probe.supports_metalfx_spatial,
        probe.supports_apple_ane,
        probe.supports_dlss4_transformer,
        probe.supports_dlss35,
        probe.supports_reflex2_frame_warp,
        probe.supports_tensor_fp8_int4,
        probe.supports_nvidia_ofa,
        probe.amd_fsr.as_str(),
        probe.supports_anti_lag2,
        probe.amd_xdna_generation,
        probe.intel_xess.as_str(),
        probe.supports_xell,
        probe.supports_intel_ai_boost,
        probe.supports_arm_asr,
        probe.supports_arm_nss,
        probe.supports_arm_ethos_u,
        probe.supports_arm_kleidiai_sme2,
        probe.supports_snapdragon_gsr2,
        probe.supports_hexagon_qnn_htp,
    )
}

fn default_native_transport(os: HostOs, unified_memory: bool) -> ZeroCopyTransport {
    match os {
        HostOs::MacOs | HostOs::Ios => {
            if unified_memory {
                ZeroCopyTransport::AppleUnifiedMemoryIoSurface
            } else {
                ZeroCopyTransport::BrowserArrayBufferCopy
            }
        }
        HostOs::Windows => ZeroCopyTransport::WindowsDxgiSharedHandle,
        HostOs::Linux => ZeroCopyTransport::LinuxDmaBufFd,
        HostOs::Android => ZeroCopyTransport::AndroidHardwareBuffer,
        HostOs::BrowserSandbox => ZeroCopyTransport::BrowserArrayBufferCopy,
    }
}

fn default_native_graphics_backend(os: HostOs) -> GraphicsBackend {
    match os {
        HostOs::MacOs | HostOs::Ios => GraphicsBackend::Metal3,
        HostOs::Windows => GraphicsBackend::DirectX12,
        HostOs::Linux | HostOs::Android => GraphicsBackend::Vulkan13,
        HostOs::BrowserSandbox => GraphicsBackend::WebGpuWgsl,
    }
}

struct SessionFingerprintInput {
    vendor: GpuVendor,
    os: HostOs,
    backend: GraphicsBackend,
    upscaler: UpscalerKind,
    low_latency: LowLatencyKind,
    npu: NpuBackend,
    transport: ZeroCopyTransport,
    frame_budget_us: u32,
}

fn compute_session_fingerprint(input: &SessionFingerprintInput) -> u32 {
    let canonical = format!(
        "{}|{}|{:?}|{:?}|{:?}|{:?}|{:?}|{}",
        input.vendor.as_str(),
        input.os.as_str(),
        input.backend,
        input.upscaler,
        input.low_latency,
        input.npu,
        input.transport,
        input.frame_budget_us
    );
    crc32_ieee(canonical.as_bytes())
}

/// 호스트 OS·하드웨어 프로브 서술자를 바탕으로 최적 네이티브 업스케일러·저지연·NPU 조합을 결정론적으로 협상한다.
pub fn negotiate_native_bridge_session(
    probe: &HostHardwareProbe,
) -> Result<NativeBridgeSessionPlan, BridgeError> {
    if !(15..=480).contains(&probe.target_fps) {
        return Err(BridgeError::InvalidTargetFps {
            fps: probe.target_fps,
        });
    }

    let frame_budget_us = 1_000_000u32 / probe.target_fps;

    // 브라우저 샌드박스에서는 네이티브 핸들이 격리되므로 즉시 WebGPU WGSL 안전 경로로 폴백한다.
    if probe.os == HostOs::BrowserSandbox || probe.vendor == GpuVendor::WebGpuFallback {
        let reason = if probe.os == HostOs::BrowserSandbox {
            String::from("browser-sandbox-webgpu-fallback")
        } else {
            String::from("vendor-unspecified-webgpu-fallback")
        };
        let upscaler = UpscalerKind::WebGpuWgslBicubicCas;
        let low_latency = LowLatencyKind::WebGpuQueuePacing;
        let npu_backend = NpuBackend::WebGpuComputeShaderFallback;
        let transport = ZeroCopyTransport::BrowserArrayBufferCopy;
        let graphics_backend = GraphicsBackend::WebGpuWgsl;
        let fingerprint = compute_session_fingerprint(&SessionFingerprintInput {
            vendor: GpuVendor::WebGpuFallback,
            os: probe.os,
            backend: graphics_backend,
            upscaler,
            low_latency,
            npu: npu_backend,
            transport,
            frame_budget_us,
        });
        return Ok(NativeBridgeSessionPlan {
            vendor: GpuVendor::WebGpuFallback,
            os: probe.os,
            graphics_backend,
            upscaler,
            low_latency,
            npu_backend,
            transport,
            is_native_accelerated: false,
            zero_copy_enabled: false,
            frame_budget_us,
            recommended_flags: FLAG_FALLBACK_WEBGPU,
            estimated_speedup_x100: upscaler.estimated_speedup_x100(),
            fallback_reason: Some(reason),
            session_fingerprint: fingerprint,
        });
    }

    let (graphics_backend, upscaler, low_latency, npu_backend, transport, fallback_reason) =
        match probe.vendor {
            GpuVendor::Apple => {
                let backend =
                    if probe.supports_metal3 && matches!(probe.os, HostOs::MacOs | HostOs::Ios) {
                        GraphicsBackend::Metal3
                    } else {
                        GraphicsBackend::WebGpuWgsl
                    };
                let up = if backend == GraphicsBackend::Metal3 {
                    if probe.supports_metalfx_temporal {
                        UpscalerKind::MetalFxTemporal
                    } else if probe.supports_metalfx_spatial {
                        UpscalerKind::MetalFxSpatial
                    } else {
                        UpscalerKind::WebGpuWgslBicubicCas
                    }
                } else {
                    UpscalerKind::WebGpuWgslBicubicCas
                };
                let latency = if backend == GraphicsBackend::Metal3 {
                    LowLatencyKind::AppleMetalDirectPresent
                } else {
                    LowLatencyKind::WebGpuQueuePacing
                };
                let npu = if probe.supports_apple_ane {
                    NpuBackend::AppleCoreMlAne
                } else {
                    NpuBackend::WebGpuComputeShaderFallback
                };
                let tr = if backend == GraphicsBackend::Metal3 {
                    default_native_transport(probe.os, probe.unified_memory)
                } else {
                    ZeroCopyTransport::BrowserArrayBufferCopy
                };
                let reason = if backend != GraphicsBackend::Metal3 {
                    Some(String::from("apple-metal3-unavailable-webgpu-fallback"))
                } else {
                    None
                };
                (backend, up, latency, npu, tr, reason)
            }
            GpuVendor::Nvidia => {
                let backend = default_native_graphics_backend(probe.os);
                let up = if probe.supports_dlss4_transformer {
                    if probe.allow_multi_frame_gen {
                        UpscalerKind::Dlss4TransformerMultiFrameGen
                    } else {
                        UpscalerKind::Dlss4TransformerSr
                    }
                } else if probe.supports_dlss35 {
                    UpscalerKind::Dlss35RayReconstruction
                } else {
                    UpscalerKind::WebGpuWgslBicubicCas
                };
                let latency = if probe.supports_reflex2_frame_warp {
                    LowLatencyKind::NvidiaReflex2FrameWarp
                } else {
                    LowLatencyKind::WebGpuQueuePacing
                };
                let npu = if probe.supports_tensor_fp8_int4 && probe.supports_nvidia_ofa {
                    NpuBackend::NvidiaTensorCoreFp8Int4Ofa
                } else if probe.supports_tensor_fp8_int4 {
                    NpuBackend::NvidiaTensorCoreFp8Int4
                } else {
                    NpuBackend::WebGpuComputeShaderFallback
                };
                let tr = default_native_transport(probe.os, probe.unified_memory);
                (backend, up, latency, npu, tr, None)
            }
            GpuVendor::Amd => {
                let backend = default_native_graphics_backend(probe.os);
                let up = match probe.amd_fsr {
                    AmdFsrCapability::Fsr41Int8Full => UpscalerKind::Fsr41Int8Full,
                    AmdFsrCapability::Fsr41Int8Lite => UpscalerKind::Fsr41Int8Lite,
                    AmdFsrCapability::Fsr3 => {
                        if probe.allow_multi_frame_gen {
                            UpscalerKind::Fsr3FrameGen
                        } else {
                            UpscalerKind::Fsr2Temporal
                        }
                    }
                    AmdFsrCapability::Fsr2 => UpscalerKind::Fsr2Temporal,
                    AmdFsrCapability::Fsr1 => UpscalerKind::Fsr1Spatial,
                    AmdFsrCapability::None => UpscalerKind::WebGpuWgslBicubicCas,
                };
                let latency = if probe.supports_anti_lag2 {
                    LowLatencyKind::AmdRadeonAntiLag2
                } else {
                    LowLatencyKind::WebGpuQueuePacing
                };
                let npu = if probe.amd_xdna_generation >= 2 {
                    NpuBackend::AmdRyzenAiXdna2
                } else if probe.amd_xdna_generation == 1 {
                    NpuBackend::AmdRyzenAiXdna1
                } else {
                    NpuBackend::WebGpuComputeShaderFallback
                };
                let tr = default_native_transport(probe.os, probe.unified_memory);
                (backend, up, latency, npu, tr, None)
            }
            GpuVendor::Intel => {
                let backend = default_native_graphics_backend(probe.os);
                let up = match probe.intel_xess {
                    IntelXessCapability::Xess2XmxFrameGen => {
                        if probe.allow_multi_frame_gen {
                            UpscalerKind::Xess2XmxFrameGen
                        } else {
                            UpscalerKind::Xess2XmxSr
                        }
                    }
                    IntelXessCapability::Xess2Dp4a => UpscalerKind::Xess2Dp4a,
                    IntelXessCapability::Xess1 => UpscalerKind::Xess1,
                    IntelXessCapability::None => UpscalerKind::WebGpuWgslBicubicCas,
                };
                let latency = if probe.supports_xell {
                    LowLatencyKind::IntelXeLl
                } else {
                    LowLatencyKind::WebGpuQueuePacing
                };
                let npu = if probe.supports_intel_ai_boost {
                    NpuBackend::IntelAiBoostNpu
                } else {
                    NpuBackend::WebGpuComputeShaderFallback
                };
                let tr = default_native_transport(probe.os, probe.unified_memory);
                (backend, up, latency, npu, tr, None)
            }
            GpuVendor::Arm => {
                let backend = default_native_graphics_backend(probe.os);
                let up = if probe.supports_arm_nss {
                    UpscalerKind::ArmNss
                } else if probe.supports_arm_asr {
                    UpscalerKind::ArmAsr
                } else {
                    UpscalerKind::WebGpuWgslBicubicCas
                };
                let latency = LowLatencyKind::ArmFramePacing;
                let npu = if probe.supports_arm_kleidiai_sme2 {
                    NpuBackend::ArmKleidiAiSme2
                } else if probe.supports_arm_ethos_u {
                    NpuBackend::ArmEthosU
                } else {
                    NpuBackend::WebGpuComputeShaderFallback
                };
                let tr = default_native_transport(probe.os, probe.unified_memory);
                (backend, up, latency, npu, tr, None)
            }
            GpuVendor::Qualcomm => {
                let backend = default_native_graphics_backend(probe.os);
                let up = if probe.supports_snapdragon_gsr2 {
                    UpscalerKind::SnapdragonGsr2
                } else {
                    UpscalerKind::WebGpuWgslBicubicCas
                };
                let latency = LowLatencyKind::QualcommFramePacing;
                let npu = if probe.supports_hexagon_qnn_htp {
                    NpuBackend::QualcommHexagonQnnHtp
                } else {
                    NpuBackend::WebGpuComputeShaderFallback
                };
                let tr = default_native_transport(probe.os, probe.unified_memory);
                (backend, up, latency, npu, tr, None)
            }
            GpuVendor::WebGpuFallback => unreachable!(),
        };

    let is_native_accelerated = graphics_backend != GraphicsBackend::WebGpuWgsl
        && (upscaler != UpscalerKind::WebGpuWgslBicubicCas || npu_backend.is_native_npu());
    let zero_copy_enabled = is_native_accelerated && transport.is_zero_copy();

    let mut flags = 0u32;
    if zero_copy_enabled {
        flags |= FLAG_ZERO_COPY_SHM;
    }
    if low_latency.is_native_hardware_sync() {
        flags |= FLAG_LOW_LATENCY_MARK;
    }
    if npu_backend.is_native_npu() {
        flags |= FLAG_NPU_ASSISTED;
    }
    if upscaler.uses_multi_frame_gen() {
        flags |= FLAG_MULTI_FRAME_GEN;
    }
    if !is_native_accelerated {
        flags |= FLAG_FALLBACK_WEBGPU;
    }

    let fingerprint = compute_session_fingerprint(&SessionFingerprintInput {
        vendor: probe.vendor,
        os: probe.os,
        backend: graphics_backend,
        upscaler,
        low_latency,
        npu: npu_backend,
        transport,
        frame_budget_us,
    });

    Ok(NativeBridgeSessionPlan {
        vendor: probe.vendor,
        os: probe.os,
        graphics_backend,
        upscaler,
        low_latency,
        npu_backend,
        transport,
        is_native_accelerated,
        zero_copy_enabled,
        frame_budget_us,
        recommended_flags: flags,
        estimated_speedup_x100: upscaler.estimated_speedup_x100(),
        fallback_reason,
        session_fingerprint: fingerprint,
    })
}
