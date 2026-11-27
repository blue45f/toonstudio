//! ToonStudio 데스크톱 네이티브 GPU/NPU 브릿지 크레이트 (`studio-native-gpu-npu-bridge`).
//!
//! - 외부 `crates.io` 의존성 0개의 순수 안전 Rust(`#![deny(unsafe_code)]`)로 구현한다.
//! - 6대 벤더(Apple·NVIDIA·AMD·Intel·Arm·Qualcomm) 하드웨어 프로브 서술자를 결정론적으로 협상하고,
//!   브라우저 샌드박스에서는 자동으로 안전한 WebGPU WGSL 경로로 폴백한다.
//! - TypeScript 호스트(`wasm64-wave65-native-gpu-npu-bridge`)와 바이트-정확히 호환되는
//!   바이너리 IPC 프레임 패킷(IEEE CRC-32, Zero-Copy 공유 메모리 메타데이터, 프레임 지연 예산 가드)을 제공한다.

#![deny(unsafe_code)]

use std::error::Error;
use std::fmt;

pub mod ipc_protocol;
pub mod vendors;

pub use ipc_protocol::{
    crc32_ieee, decode_ipc_packet, encode_ipc_packet, FrameBudgetDecision, FrameLatencyBudgetGuard,
    IpcFramePacket, IpcPacketKind, SharedMemoryHandleMeta, FLAG_FALLBACK_WEBGPU,
    FLAG_LOW_LATENCY_MARK, FLAG_MULTI_FRAME_GEN, FLAG_NPU_ASSISTED, FLAG_ZERO_COPY_SHM,
    IPC_HEADER_BYTES, IPC_MAGIC, IPC_MAX_PAYLOAD_BYTES, IPC_MIN_PACKET_BYTES, IPC_PROTOCOL_VERSION,
    IPC_TRAILER_BYTES,
};
pub use vendors::{
    format_host_probe_descriptor, negotiate_native_bridge_session, parse_host_probe_descriptor,
    AmdFsrCapability, GpuVendor, GraphicsBackend, HostHardwareProbe, HostOs, IntelXessCapability,
    LowLatencyKind, NativeBridgeSessionPlan, NpuBackend, UpscalerKind, VendorMatrixEntry,
    ZeroCopyTransport, VENDOR_CAPABILITY_MATRIX,
};

/// 네이티브 GPU/NPU 브릿지의 panic 없는 오류 모델.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BridgeError {
    InvalidProbeDescriptor {
        field: String,
        reason: String,
    },
    InvalidTargetFps {
        fps: u32,
    },
    PacketTruncated {
        min_bytes: usize,
        actual_bytes: usize,
    },
    InvalidMagic,
    UnsupportedProtocolVersion {
        expected: u16,
        actual: u16,
    },
    UnknownPacketKind {
        wire_id: u8,
    },
    UnknownVendorId {
        wire_id: u8,
    },
    InvalidSequenceNumber {
        sequence: u64,
    },
    PayloadTooLarge {
        max_bytes: usize,
        actual_bytes: usize,
    },
    PacketLengthMismatch {
        expected_bytes: usize,
        actual_bytes: usize,
    },
    CrcMismatch {
        expected: u32,
        computed: u32,
    },
    InvalidSharedMemoryHandle {
        handle_id: u64,
        byte_length: u32,
    },
    SharedMemoryRangeOverflow {
        byte_offset: u32,
        byte_length: u32,
    },
    SequenceRegression {
        last_sequence: u64,
        received_sequence: u64,
    },
    InvalidFrameBudget {
        frame_budget_us: u32,
    },
}

impl fmt::Display for BridgeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidProbeDescriptor { field, reason } => {
                write!(f, "하드웨어 프로브 서술자 오류({field}): {reason}")
            }
            Self::InvalidTargetFps { fps } => {
                write!(f, "허용 범위(15..=480) 밖의 목표 FPS: {fps}")
            }
            Self::PacketTruncated {
                min_bytes,
                actual_bytes,
            } => {
                write!(
                    f,
                    "IPC 패킷 길이가 최소 크기({min_bytes}B)보다 짧습니다: {actual_bytes}B"
                )
            }
            Self::InvalidMagic => write!(f, "IPC 패킷 매직 바이트(TSNB)가 일치하지 않습니다"),
            Self::UnsupportedProtocolVersion { expected, actual } => {
                write!(
                    f,
                    "지원하지 않는 IPC 프로토콜 버전(기대: {expected}, 실제: {actual})"
                )
            }
            Self::UnknownPacketKind { wire_id } => {
                write!(f, "알 수 없는 IPC 패킷 종류 ID: {wire_id}")
            }
            Self::UnknownVendorId { wire_id } => {
                write!(f, "알 수 없는 벤더 와이어 ID: {wire_id}")
            }
            Self::InvalidSequenceNumber { sequence } => {
                write!(f, "유효하지 않은 시퀀스 번호(>= 1 필요): {sequence}")
            }
            Self::PayloadTooLarge {
                max_bytes,
                actual_bytes,
            } => {
                write!(
                    f,
                    "IPC 페이로드가 최대 크기({max_bytes}B)를 초과했습니다: {actual_bytes}B"
                )
            }
            Self::PacketLengthMismatch {
                expected_bytes,
                actual_bytes,
            } => {
                write!(
                    f,
                    "IPC 패킷 총 길이 불일치(기대: {expected_bytes}B, 실제: {actual_bytes}B)"
                )
            }
            Self::CrcMismatch { expected, computed } => {
                write!(
                    f,
                    "IPC 패킷 CRC-32 무결성 오류(헤더: 0x{expected:08x}, 계산: 0x{computed:08x})"
                )
            }
            Self::InvalidSharedMemoryHandle {
                handle_id,
                byte_length,
            } => {
                write!(
                    f,
                    "Zero-Copy 공유 메모리 핸들이 유효하지 않습니다(handle={handle_id}, len={byte_length})"
                )
            }
            Self::SharedMemoryRangeOverflow {
                byte_offset,
                byte_length,
            } => {
                write!(
                    f,
                    "공유 메모리 오프셋({byte_offset}) + 길이({byte_length})가 u32 범위를 초과했습니다"
                )
            }
            Self::SequenceRegression {
                last_sequence,
                received_sequence,
            } => {
                write!(
                    f,
                    "시퀀스 단조성 위반(이전: {last_sequence}, 수신: {received_sequence})"
                )
            }
            Self::InvalidFrameBudget { frame_budget_us } => {
                write!(f, "프레임 지연 예산은 0보다 커야 합니다: {frame_budget_us}")
            }
        }
    }
}

impl Error for BridgeError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apple_silicon_negotiates_metal3_metalfx_temporal_ane_and_uma_zero_copy() {
        let probe = HostHardwareProbe {
            os: HostOs::MacOs,
            vendor: GpuVendor::Apple,
            device_name: String::from("Apple M4 Max"),
            driver_version: String::from("macOS-15.4"),
            vram_mb: 65536,
            unified_memory: true,
            target_fps: 120,
            supports_metal3: true,
            supports_metalfx_temporal: true,
            supports_metalfx_spatial: true,
            supports_apple_ane: true,
            ..HostHardwareProbe::default()
        };

        let plan = negotiate_native_bridge_session(&probe).expect("Apple 세션 협상 성공");
        assert_eq!(plan.graphics_backend, GraphicsBackend::Metal3);
        assert_eq!(plan.upscaler, UpscalerKind::MetalFxTemporal);
        assert_eq!(plan.low_latency, LowLatencyKind::AppleMetalDirectPresent);
        assert_eq!(plan.npu_backend, NpuBackend::AppleCoreMlAne);
        assert_eq!(
            plan.transport,
            ZeroCopyTransport::AppleUnifiedMemoryIoSurface
        );
        assert!(plan.is_native_accelerated);
        assert!(plan.zero_copy_enabled);
        assert_eq!(plan.frame_budget_us, 8_333);
        assert_ne!(plan.recommended_flags & FLAG_ZERO_COPY_SHM, 0);
        assert_ne!(plan.recommended_flags & FLAG_NPU_ASSISTED, 0);
        assert_eq!(plan.recommended_flags & FLAG_FALLBACK_WEBGPU, 0);
    }

    #[test]
    fn apple_falls_back_to_metalfx_spatial_when_temporal_unavailable() {
        let probe = HostHardwareProbe {
            os: HostOs::Ios,
            vendor: GpuVendor::Apple,
            device_name: String::from("Apple A18 Pro"),
            unified_memory: true,
            supports_metal3: true,
            supports_metalfx_temporal: false,
            supports_metalfx_spatial: true,
            supports_apple_ane: true,
            ..HostHardwareProbe::default()
        };

        let plan = negotiate_native_bridge_session(&probe).expect("Apple Spatial 협상 성공");
        assert_eq!(plan.upscaler, UpscalerKind::MetalFxSpatial);
        assert_eq!(plan.npu_backend, NpuBackend::AppleCoreMlAne);
        assert!(plan.zero_copy_enabled);
    }

    #[test]
    fn nvidia_negotiates_dlss4_mfg_reflex2_tensor_fp8_int4_and_ofa() {
        let probe = HostHardwareProbe {
            os: HostOs::Windows,
            vendor: GpuVendor::Nvidia,
            device_name: String::from("NVIDIA GeForce RTX 5090"),
            driver_version: String::from("572.42"),
            vram_mb: 32768,
            target_fps: 240,
            allow_multi_frame_gen: true,
            supports_dlss4_transformer: true,
            supports_dlss35: true,
            supports_reflex2_frame_warp: true,
            supports_tensor_fp8_int4: true,
            supports_nvidia_ofa: true,
            ..HostHardwareProbe::default()
        };

        let plan = negotiate_native_bridge_session(&probe).expect("NVIDIA DLSS4 협상 성공");
        assert_eq!(plan.graphics_backend, GraphicsBackend::DirectX12);
        assert_eq!(plan.upscaler, UpscalerKind::Dlss4TransformerMultiFrameGen);
        assert_eq!(plan.low_latency, LowLatencyKind::NvidiaReflex2FrameWarp);
        assert_eq!(plan.npu_backend, NpuBackend::NvidiaTensorCoreFp8Int4Ofa);
        assert_eq!(plan.transport, ZeroCopyTransport::WindowsDxgiSharedHandle);
        assert_eq!(plan.frame_budget_us, 4_166);
        assert_ne!(plan.recommended_flags & FLAG_MULTI_FRAME_GEN, 0);
        assert_ne!(plan.recommended_flags & FLAG_LOW_LATENCY_MARK, 0);
    }

    #[test]
    fn nvidia_negotiates_dlss35_and_linux_dmabuf_when_dlss4_absent() {
        let probe = HostHardwareProbe {
            os: HostOs::Linux,
            vendor: GpuVendor::Nvidia,
            device_name: String::from("NVIDIA GeForce RTX 4080"),
            supports_dlss4_transformer: false,
            supports_dlss35: true,
            supports_reflex2_frame_warp: true,
            supports_tensor_fp8_int4: true,
            supports_nvidia_ofa: false,
            ..HostHardwareProbe::default()
        };

        let plan = negotiate_native_bridge_session(&probe).expect("NVIDIA DLSS3.5 협상 성공");
        assert_eq!(plan.graphics_backend, GraphicsBackend::Vulkan13);
        assert_eq!(plan.upscaler, UpscalerKind::Dlss35RayReconstruction);
        assert_eq!(plan.npu_backend, NpuBackend::NvidiaTensorCoreFp8Int4);
        assert_eq!(plan.transport, ZeroCopyTransport::LinuxDmaBufFd);
    }

    #[test]
    fn amd_negotiates_fsr41_int8_full_antilag2_and_ryzen_ai_xdna2() {
        let probe = HostHardwareProbe {
            os: HostOs::Windows,
            vendor: GpuVendor::Amd,
            device_name: String::from("AMD Radeon RX 9070 XT + Ryzen AI 9 HX 370"),
            amd_fsr: AmdFsrCapability::Fsr41Int8Full,
            supports_anti_lag2: true,
            amd_xdna_generation: 2,
            ..HostHardwareProbe::default()
        };

        let plan = negotiate_native_bridge_session(&probe).expect("AMD FSR 4.1 Full 협상 성공");
        assert_eq!(plan.upscaler, UpscalerKind::Fsr41Int8Full);
        assert_eq!(plan.low_latency, LowLatencyKind::AmdRadeonAntiLag2);
        assert_eq!(plan.npu_backend, NpuBackend::AmdRyzenAiXdna2);
        assert!(plan.zero_copy_enabled);
    }

    #[test]
    fn amd_supports_fsr_tier_cascade_and_xdna1() {
        let tiers = [
            (AmdFsrCapability::Fsr41Int8Lite, UpscalerKind::Fsr41Int8Lite),
            (AmdFsrCapability::Fsr3, UpscalerKind::Fsr3FrameGen),
            (AmdFsrCapability::Fsr2, UpscalerKind::Fsr2Temporal),
            (AmdFsrCapability::Fsr1, UpscalerKind::Fsr1Spatial),
        ];
        for (cap, expected_up) in tiers {
            let probe = HostHardwareProbe {
                os: HostOs::Linux,
                vendor: GpuVendor::Amd,
                amd_fsr: cap,
                amd_xdna_generation: 1,
                ..HostHardwareProbe::default()
            };
            let plan = negotiate_native_bridge_session(&probe).expect("AMD FSR 티어 협상");
            assert_eq!(plan.upscaler, expected_up);
            assert_eq!(plan.npu_backend, NpuBackend::AmdRyzenAiXdna1);
        }
    }

    #[test]
    fn intel_negotiates_xess2_xmx_fg_xell_and_ai_boost_npu() {
        let probe = HostHardwareProbe {
            os: HostOs::Windows,
            vendor: GpuVendor::Intel,
            device_name: String::from("Intel Arc B580 + Core Ultra 200V"),
            intel_xess: IntelXessCapability::Xess2XmxFrameGen,
            supports_xell: true,
            supports_intel_ai_boost: true,
            ..HostHardwareProbe::default()
        };

        let plan = negotiate_native_bridge_session(&probe).expect("Intel XeSS2 협상 성공");
        assert_eq!(plan.upscaler, UpscalerKind::Xess2XmxFrameGen);
        assert_eq!(plan.low_latency, LowLatencyKind::IntelXeLl);
        assert_eq!(plan.npu_backend, NpuBackend::IntelAiBoostNpu);
        assert_ne!(plan.recommended_flags & FLAG_MULTI_FRAME_GEN, 0);

        let dp4a_probe = HostHardwareProbe {
            intel_xess: IntelXessCapability::Xess2Dp4a,
            ..probe
        };
        let dp4a_plan = negotiate_native_bridge_session(&dp4a_probe).expect("Intel DP4a 협상");
        assert_eq!(dp4a_plan.upscaler, UpscalerKind::Xess2Dp4a);
    }

    #[test]
    fn arm_negotiates_nss_asr_kleidiai_sme2_and_ethos_u() {
        let probe_nss = HostHardwareProbe {
            os: HostOs::Android,
            vendor: GpuVendor::Arm,
            device_name: String::from("Arm Immortalis-G925"),
            supports_arm_nss: true,
            supports_arm_asr: true,
            supports_arm_kleidiai_sme2: true,
            supports_arm_ethos_u: true,
            ..HostHardwareProbe::default()
        };
        let plan_nss = negotiate_native_bridge_session(&probe_nss).expect("Arm NSS 협상 성공");
        assert_eq!(plan_nss.graphics_backend, GraphicsBackend::Vulkan13);
        assert_eq!(plan_nss.upscaler, UpscalerKind::ArmNss);
        assert_eq!(plan_nss.npu_backend, NpuBackend::ArmKleidiAiSme2);
        assert_eq!(plan_nss.transport, ZeroCopyTransport::AndroidHardwareBuffer);

        let probe_asr = HostHardwareProbe {
            supports_arm_nss: false,
            supports_arm_kleidiai_sme2: false,
            ..probe_nss
        };
        let plan_asr = negotiate_native_bridge_session(&probe_asr).expect("Arm ASR 협상 성공");
        assert_eq!(plan_asr.upscaler, UpscalerKind::ArmAsr);
        assert_eq!(plan_asr.npu_backend, NpuBackend::ArmEthosU);
    }

    #[test]
    fn qualcomm_negotiates_snapdragon_gsr2_and_hexagon_qnn_htp() {
        let probe = HostHardwareProbe {
            os: HostOs::Android,
            vendor: GpuVendor::Qualcomm,
            device_name: String::from("Qualcomm Snapdragon 8 Elite"),
            supports_snapdragon_gsr2: true,
            supports_hexagon_qnn_htp: true,
            ..HostHardwareProbe::default()
        };

        let plan = negotiate_native_bridge_session(&probe).expect("Qualcomm 협상 성공");
        assert_eq!(plan.upscaler, UpscalerKind::SnapdragonGsr2);
        assert_eq!(plan.low_latency, LowLatencyKind::QualcommFramePacing);
        assert_eq!(plan.npu_backend, NpuBackend::QualcommHexagonQnnHtp);
        assert!(plan.zero_copy_enabled);
    }

    #[test]
    fn browser_sandbox_forces_safe_webgpu_wgsl_fallback() {
        let probe = HostHardwareProbe {
            os: HostOs::BrowserSandbox,
            vendor: GpuVendor::Nvidia,
            supports_dlss4_transformer: true,
            supports_reflex2_frame_warp: true,
            supports_tensor_fp8_int4: true,
            ..HostHardwareProbe::default()
        };

        let plan = negotiate_native_bridge_session(&probe).expect("브라우저 폴백 성공");
        assert_eq!(plan.vendor, GpuVendor::WebGpuFallback);
        assert_eq!(plan.graphics_backend, GraphicsBackend::WebGpuWgsl);
        assert_eq!(plan.upscaler, UpscalerKind::WebGpuWgslBicubicCas);
        assert_eq!(plan.npu_backend, NpuBackend::WebGpuComputeShaderFallback);
        assert!(!plan.is_native_accelerated);
        assert!(!plan.zero_copy_enabled);
        assert_ne!(plan.recommended_flags & FLAG_FALLBACK_WEBGPU, 0);
        assert_eq!(
            plan.fallback_reason.as_deref(),
            Some("browser-sandbox-webgpu-fallback")
        );
    }

    #[test]
    fn host_probe_descriptor_round_trip_and_invalid_key_rejection() {
        let original = HostHardwareProbe {
            os: HostOs::MacOs,
            vendor: GpuVendor::Apple,
            device_name: String::from("Apple M4 Pro"),
            driver_version: String::from("15.4"),
            vram_mb: 36864,
            unified_memory: true,
            target_fps: 120,
            supports_metal3: true,
            supports_metalfx_temporal: true,
            supports_apple_ane: true,
            ..HostHardwareProbe::default()
        };

        let serialized = format_host_probe_descriptor(&original);
        let parsed = parse_host_probe_descriptor(&serialized).expect("서술자 왕복 파싱");
        assert_eq!(parsed, original);

        let err = parse_host_probe_descriptor("os=macos;unknown_flag=true")
            .expect_err("허용되지 않은 키 거부");
        assert!(matches!(err, BridgeError::InvalidProbeDescriptor { .. }));
    }

    #[test]
    fn crc32_ieee_matches_standard_golden_vector() {
        assert_eq!(crc32_ieee(b"123456789"), 0xCBF4_3926);
        assert_eq!(crc32_ieee(b""), 0x0000_0000);
    }

    #[test]
    fn ipc_packet_binary_round_trip_and_cross_language_golden_bytes() {
        let packet = IpcFramePacket {
            version: IPC_PROTOCOL_VERSION,
            kind: IpcPacketKind::FrameSubmit,
            vendor: GpuVendor::Apple,
            sequence: 0x0000_0001_0000_002A,
            shm: SharedMemoryHandleMeta {
                handle_id: 0x0000_0002_CAFE_BABE,
                byte_offset: 4096,
                byte_length: 16_777_216,
            },
            flags: FLAG_ZERO_COPY_SHM | FLAG_LOW_LATENCY_MARK | FLAG_NPU_ASSISTED,
            frame_budget_us: 8_333,
            actual_latency_us: 1_920,
            payload: b"brush=ink-sdf".to_vec(),
        };

        let encoded = encode_ipc_packet(&packet).expect("패킷 직렬화 성공");
        assert_eq!(encoded.len(), IPC_MIN_PACKET_BYTES + packet.payload.len());
        assert_eq!(&encoded[0..4], b"TSNB");

        let decoded = decode_ipc_packet(&encoded).expect("패킷 역직렬화 성공");
        assert_eq!(decoded, packet);

        // TypeScript 테스트와 공유하는 고정 골든 벡터(헤더+페이로드+CRC32 검증)
        let golden_packet = IpcFramePacket {
            version: 1,
            kind: IpcPacketKind::FrameSubmit,
            vendor: GpuVendor::Nvidia,
            sequence: 7,
            shm: SharedMemoryHandleMeta {
                handle_id: 0x1122_3344_5566_7788,
                byte_offset: 256,
                byte_length: 65_536,
            },
            flags: FLAG_ZERO_COPY_SHM | FLAG_MULTI_FRAME_GEN,
            frame_budget_us: 8_333,
            actual_latency_us: 2_400,
            payload: b"W65".to_vec(),
        };
        let golden_bytes = encode_ipc_packet(&golden_packet).expect("골든 패킷 인코딩");
        assert_eq!(golden_bytes.len(), 55);
        let trailer_crc = u32::from_le_bytes([
            golden_bytes[51],
            golden_bytes[52],
            golden_bytes[53],
            golden_bytes[54],
        ]);
        assert_eq!(trailer_crc, crc32_ieee(&golden_bytes[..51]));
    }

    #[test]
    fn ipc_packet_detects_single_byte_corruption_anywhere() {
        let packet = IpcFramePacket {
            version: IPC_PROTOCOL_VERSION,
            kind: IpcPacketKind::FrameComplete,
            vendor: GpuVendor::Amd,
            sequence: 12,
            shm: SharedMemoryHandleMeta {
                handle_id: 99,
                byte_offset: 0,
                byte_length: 4096,
            },
            flags: FLAG_ZERO_COPY_SHM,
            frame_budget_us: 8_333,
            actual_latency_us: 3_100,
            payload: b"frame-ok".to_vec(),
        };
        let encoded = encode_ipc_packet(&packet).expect("정상 인코딩");

        // 페이로드 1바이트 변조 → CRC 불일치 검출
        let mut corrupted_payload = encoded.clone();
        corrupted_payload[IPC_HEADER_BYTES + 2] ^= 0x01;
        assert!(matches!(
            decode_ipc_packet(&corrupted_payload),
            Err(BridgeError::CrcMismatch { .. })
        ));

        // 헤더 지연 값 1바이트 변조 → CRC 불일치 검출
        let mut corrupted_header = encoded.clone();
        corrupted_header[40] ^= 0x80;
        assert!(matches!(
            decode_ipc_packet(&corrupted_header),
            Err(BridgeError::CrcMismatch { .. })
        ));

        // CRC 트레일러 1바이트 변조 → CRC 불일치 검출
        let mut corrupted_crc = encoded;
        let last_idx = corrupted_crc.len() - 1;
        corrupted_crc[last_idx] ^= 0x40;
        assert!(matches!(
            decode_ipc_packet(&corrupted_crc),
            Err(BridgeError::CrcMismatch { .. })
        ));
    }

    #[test]
    fn ipc_rejects_invalid_version_magic_and_zero_copy_invariants() {
        let bad_shm = IpcFramePacket {
            version: IPC_PROTOCOL_VERSION,
            kind: IpcPacketKind::FrameSubmit,
            vendor: GpuVendor::Intel,
            sequence: 1,
            shm: SharedMemoryHandleMeta {
                handle_id: 0,
                byte_offset: 0,
                byte_length: 1024,
            },
            flags: FLAG_ZERO_COPY_SHM,
            frame_budget_us: 8_333,
            actual_latency_us: 0,
            payload: Vec::new(),
        };
        assert!(matches!(
            encode_ipc_packet(&bad_shm),
            Err(BridgeError::InvalidSharedMemoryHandle { .. })
        ));

        let mut bad_magic = encode_ipc_packet(&IpcFramePacket {
            flags: 0,
            ..bad_shm
        })
        .expect("일반 패킷 인코딩");
        bad_magic[0] = b'X';
        assert_eq!(
            decode_ipc_packet(&bad_magic),
            Err(BridgeError::InvalidMagic)
        );

        let mut bad_ver = encode_ipc_packet(&IpcFramePacket {
            version: IPC_PROTOCOL_VERSION,
            kind: IpcPacketKind::Heartbeat,
            vendor: GpuVendor::Apple,
            sequence: 2,
            shm: SharedMemoryHandleMeta::default(),
            flags: 0,
            frame_budget_us: 8_333,
            actual_latency_us: 100,
            payload: Vec::new(),
        })
        .expect("하트비트 인코딩");
        bad_ver[4] = 99;
        assert!(matches!(
            decode_ipc_packet(&bad_ver),
            Err(BridgeError::UnsupportedProtocolVersion {
                expected: 1,
                actual: 99
            })
        ));
    }

    #[test]
    fn frame_latency_budget_guard_enforces_monotonicity_and_fallback_after_three_overruns() {
        let mut guard = FrameLatencyBudgetGuard::new(3);
        assert_eq!(
            guard.evaluate_frame(1, 8_333, 4_000).expect("정상 프레임"),
            FrameBudgetDecision::WithinBudget
        );
        assert_eq!(
            guard.evaluate_frame(2, 8_333, 7_500).expect("근접 경고"),
            FrameBudgetDecision::NearBudgetWarning
        );
        // 시퀀스 역행 거부
        assert!(matches!(
            guard.evaluate_frame(2, 8_333, 3_000),
            Err(BridgeError::SequenceRegression {
                last_sequence: 2,
                received_sequence: 2
            })
        ));
        // 3회 연속 예산 초과 시 WebGPU 안전 폴백 판정
        assert_eq!(
            guard.evaluate_frame(3, 8_333, 9_200).expect("1회 초과"),
            FrameBudgetDecision::DowngradeUpscalerTier
        );
        assert_eq!(
            guard.evaluate_frame(4, 8_333, 10_400).expect("2회 초과"),
            FrameBudgetDecision::DowngradeUpscalerTier
        );
        assert_eq!(
            guard.evaluate_frame(5, 8_333, 11_100).expect("3회 초과"),
            FrameBudgetDecision::FallbackToWebGpu
        );
        assert_eq!(guard.consecutive_overruns(), 3);
        assert_eq!(guard.total_frames(), 5);
        assert_eq!(guard.total_overruns(), 3);
    }

    #[test]
    fn vendor_capability_matrix_covers_all_six_silicon_vendors_deterministically() {
        assert_eq!(VENDOR_CAPABILITY_MATRIX.len(), 6);
        let vendors: Vec<GpuVendor> = VENDOR_CAPABILITY_MATRIX.iter().map(|e| e.vendor).collect();
        assert_eq!(
            vendors,
            vec![
                GpuVendor::Apple,
                GpuVendor::Nvidia,
                GpuVendor::Amd,
                GpuVendor::Intel,
                GpuVendor::Arm,
                GpuVendor::Qualcomm,
            ]
        );
    }
}
