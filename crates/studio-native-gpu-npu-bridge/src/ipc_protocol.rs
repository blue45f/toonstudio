//! 바이너리 IPC 프레임 패킷 직렬화/역직렬화, IEEE CRC-32 무결성 검증 및 프레임 지연 예산 가드.
//!
//! 와이어 레이아웃 (리틀 엔디언, 총 `52 + payload_len` 바이트):
//! - `[0..4]`   magic (`b"TSNB"`)
//! - `[4..6]`   version (`u16`, 현재 `1`)
//! - `[6..7]`   packet kind (`u8`)
//! - `[7..8]`   vendor wire id (`u8`)
//! - `[8..16]`  sequence (`u64`, `>= 1`)
//! - `[16..24]` shm_handle_id (`u64`)
//! - `[24..28]` flags (`u32`)
//! - `[28..32]` shm_byte_offset (`u32`)
//! - `[32..36]` shm_byte_length (`u32`)
//! - `[36..40]` frame_budget_us (`u32`)
//! - `[40..44]` actual_latency_us (`u32`)
//! - `[44..48]` payload_len (`u32`, `<= 65536`)
//! - `[48..48+N]` payload (`[u8; N]`)
//! - `[48+N..52+N]` crc32 (`u32`, IEEE 802.3 `0xEDB88320`, `[0..48+N]` 전체 대상)

use crate::vendors::GpuVendor;
use crate::BridgeError;

/// 바이너리 IPC 패킷 매직 바이트 (`"TSNB"`).
pub const IPC_MAGIC: [u8; 4] = *b"TSNB";
/// 현재 IPC 와이어 프로토콜 버전.
pub const IPC_PROTOCOL_VERSION: u16 = 1;
/// 고정 헤더 크기(바이트).
pub const IPC_HEADER_BYTES: usize = 48;
/// CRC-32 트레일러 크기(바이트).
pub const IPC_TRAILER_BYTES: usize = 4;
/// 최소 패킷 크기(바이트, 페이로드 0바이트 기준).
pub const IPC_MIN_PACKET_BYTES: usize = IPC_HEADER_BYTES + IPC_TRAILER_BYTES;
/// 제어·메타데이터 페이로드 최대 크기(64 KiB).
pub const IPC_MAX_PAYLOAD_BYTES: usize = 65_536;

/// 패킷 플래그 비트 정의.
pub const FLAG_ZERO_COPY_SHM: u32 = 1 << 0;
pub const FLAG_LOW_LATENCY_MARK: u32 = 1 << 1;
pub const FLAG_NPU_ASSISTED: u32 = 1 << 2;
pub const FLAG_MULTI_FRAME_GEN: u32 = 1 << 3;
pub const FLAG_FALLBACK_WEBGPU: u32 = 1 << 4;

/// 컴파일 타임 IEEE 802.3 CRC-32 룩업 테이블 생성 (`0xEDB8_8320`).
const fn build_crc32_table() -> [u32; 256] {
    let mut table = [0u32; 256];
    let mut idx = 0usize;
    while idx < 256 {
        let mut crc = idx as u32;
        let mut bit = 0;
        while bit < 8 {
            if (crc & 1) != 0 {
                crc = (crc >> 1) ^ 0xEDB8_8320;
            } else {
                crc >>= 1;
            }
            bit += 1;
        }
        table[idx] = crc;
        idx += 1;
    }
    table
}

const CRC32_TABLE: [u32; 256] = build_crc32_table();

/// IEEE 802.3 CRC-32 체크섬을 계산한다 (TypeScript `computeCrc32Ieee`와 바이트-정확히 일치).
pub fn crc32_ieee(bytes: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in bytes {
        let lookup = ((crc ^ (byte as u32)) & 0xFF) as usize;
        crc = (crc >> 8) ^ CRC32_TABLE[lookup];
    }
    !crc
}

/// IPC 패킷 종류.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum IpcPacketKind {
    HandshakeRequest = 1,
    HandshakeResponse = 2,
    FrameSubmit = 3,
    FrameComplete = 4,
    PsoPrewarmHint = 5,
    Heartbeat = 6,
    ErrorNotice = 7,
}

impl IpcPacketKind {
    pub const fn to_wire_id(self) -> u8 {
        self as u8
    }

    pub const fn from_wire_id(id: u8) -> Option<Self> {
        match id {
            1 => Some(Self::HandshakeRequest),
            2 => Some(Self::HandshakeResponse),
            3 => Some(Self::FrameSubmit),
            4 => Some(Self::FrameComplete),
            5 => Some(Self::PsoPrewarmHint),
            6 => Some(Self::Heartbeat),
            7 => Some(Self::ErrorNotice),
            _ => None,
        }
    }
}

/// Zero-Copy 공유 메모리 핸들 메타데이터 (IOSurface / DXGI NT / DMA-BUF / AHardwareBuffer).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SharedMemoryHandleMeta {
    pub handle_id: u64,
    pub byte_offset: u32,
    pub byte_length: u32,
}

impl SharedMemoryHandleMeta {
    /// Zero-Copy 플래그가 켜진 경우 핸들 ID·크기·오프셋 오버플로 불변식을 검증한다.
    pub fn validate(&self, require_zero_copy: bool) -> Result<(), BridgeError> {
        if require_zero_copy && (self.handle_id == 0 || self.byte_length == 0) {
            return Err(BridgeError::InvalidSharedMemoryHandle {
                handle_id: self.handle_id,
                byte_length: self.byte_length,
            });
        }
        if self.byte_offset.checked_add(self.byte_length).is_none() {
            return Err(BridgeError::SharedMemoryRangeOverflow {
                byte_offset: self.byte_offset,
                byte_length: self.byte_length,
            });
        }
        Ok(())
    }
}

/// 바이너리 IPC 프레임 패킷.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IpcFramePacket {
    pub version: u16,
    pub kind: IpcPacketKind,
    pub vendor: GpuVendor,
    pub sequence: u64,
    pub shm: SharedMemoryHandleMeta,
    pub flags: u32,
    pub frame_budget_us: u32,
    pub actual_latency_us: u32,
    pub payload: Vec<u8>,
}

/// IPC 프레임 패킷을 리틀 엔디언 바이너리 프레임으로 직렬화한다.
pub fn encode_ipc_packet(packet: &IpcFramePacket) -> Result<Vec<u8>, BridgeError> {
    if packet.version != IPC_PROTOCOL_VERSION {
        return Err(BridgeError::UnsupportedProtocolVersion {
            expected: IPC_PROTOCOL_VERSION,
            actual: packet.version,
        });
    }
    if packet.sequence == 0 {
        return Err(BridgeError::InvalidSequenceNumber {
            sequence: packet.sequence,
        });
    }
    if packet.payload.len() > IPC_MAX_PAYLOAD_BYTES {
        return Err(BridgeError::PayloadTooLarge {
            max_bytes: IPC_MAX_PAYLOAD_BYTES,
            actual_bytes: packet.payload.len(),
        });
    }
    packet
        .shm
        .validate((packet.flags & FLAG_ZERO_COPY_SHM) != 0)?;

    let total_len = IPC_HEADER_BYTES + packet.payload.len() + IPC_TRAILER_BYTES;
    let mut out = Vec::with_capacity(total_len);

    out.extend_from_slice(&IPC_MAGIC);
    out.extend_from_slice(&packet.version.to_le_bytes());
    out.push(packet.kind.to_wire_id());
    out.push(packet.vendor.to_wire_id());
    out.extend_from_slice(&packet.sequence.to_le_bytes());
    out.extend_from_slice(&packet.shm.handle_id.to_le_bytes());
    out.extend_from_slice(&packet.flags.to_le_bytes());
    out.extend_from_slice(&packet.shm.byte_offset.to_le_bytes());
    out.extend_from_slice(&packet.shm.byte_length.to_le_bytes());
    out.extend_from_slice(&packet.frame_budget_us.to_le_bytes());
    out.extend_from_slice(&packet.actual_latency_us.to_le_bytes());
    out.extend_from_slice(&(packet.payload.len() as u32).to_le_bytes());
    out.extend_from_slice(&packet.payload);

    let crc = crc32_ieee(&out);
    out.extend_from_slice(&crc.to_le_bytes());
    Ok(out)
}

/// 바이너리 바이트 슬라이스에서 IPC 프레임 패킷을 검증·역직렬화한다.
pub fn decode_ipc_packet(bytes: &[u8]) -> Result<IpcFramePacket, BridgeError> {
    if bytes.len() < IPC_MIN_PACKET_BYTES {
        return Err(BridgeError::PacketTruncated {
            min_bytes: IPC_MIN_PACKET_BYTES,
            actual_bytes: bytes.len(),
        });
    }
    if bytes[0..4] != IPC_MAGIC {
        return Err(BridgeError::InvalidMagic);
    }

    let version = u16::from_le_bytes([bytes[4], bytes[5]]);
    if version != IPC_PROTOCOL_VERSION {
        return Err(BridgeError::UnsupportedProtocolVersion {
            expected: IPC_PROTOCOL_VERSION,
            actual: version,
        });
    }

    let kind = IpcPacketKind::from_wire_id(bytes[6])
        .ok_or(BridgeError::UnknownPacketKind { wire_id: bytes[6] })?;
    let vendor = GpuVendor::from_wire_id(bytes[7])
        .ok_or(BridgeError::UnknownVendorId { wire_id: bytes[7] })?;

    let sequence = u64::from_le_bytes([
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
    ]);
    if sequence == 0 {
        return Err(BridgeError::InvalidSequenceNumber { sequence });
    }

    let handle_id = u64::from_le_bytes([
        bytes[16], bytes[17], bytes[18], bytes[19], bytes[20], bytes[21], bytes[22], bytes[23],
    ]);
    let flags = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]);
    let byte_offset = u32::from_le_bytes([bytes[28], bytes[29], bytes[30], bytes[31]]);
    let byte_length = u32::from_le_bytes([bytes[32], bytes[33], bytes[34], bytes[35]]);
    let frame_budget_us = u32::from_le_bytes([bytes[36], bytes[37], bytes[38], bytes[39]]);
    let actual_latency_us = u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]);
    let payload_len = u32::from_le_bytes([bytes[44], bytes[45], bytes[46], bytes[47]]) as usize;

    if payload_len > IPC_MAX_PAYLOAD_BYTES {
        return Err(BridgeError::PayloadTooLarge {
            max_bytes: IPC_MAX_PAYLOAD_BYTES,
            actual_bytes: payload_len,
        });
    }

    let expected_len = IPC_HEADER_BYTES + payload_len + IPC_TRAILER_BYTES;
    if bytes.len() != expected_len {
        return Err(BridgeError::PacketLengthMismatch {
            expected_bytes: expected_len,
            actual_bytes: bytes.len(),
        });
    }

    let body_end = IPC_HEADER_BYTES + payload_len;
    let expected_crc = u32::from_le_bytes([
        bytes[body_end],
        bytes[body_end + 1],
        bytes[body_end + 2],
        bytes[body_end + 3],
    ]);
    let computed_crc = crc32_ieee(&bytes[..body_end]);
    if computed_crc != expected_crc {
        return Err(BridgeError::CrcMismatch {
            expected: expected_crc,
            computed: computed_crc,
        });
    }

    let shm = SharedMemoryHandleMeta {
        handle_id,
        byte_offset,
        byte_length,
    };
    shm.validate((flags & FLAG_ZERO_COPY_SHM) != 0)?;

    Ok(IpcFramePacket {
        version,
        kind,
        vendor,
        sequence,
        shm,
        flags,
        frame_budget_us,
        actual_latency_us,
        payload: bytes[IPC_HEADER_BYTES..body_end].to_vec(),
    })
}

/// 프레임 지연 예산 가드의 판정 결과.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameBudgetDecision {
    WithinBudget,
    NearBudgetWarning,
    DowngradeUpscalerTier,
    FallbackToWebGpu,
}

/// 단조 시퀀스 검증과 연속 지연 초과 시 안전 폴백을 결정하는 프레임 지연 예산 가드.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrameLatencyBudgetGuard {
    last_sequence: u64,
    consecutive_overruns: u32,
    overrun_fallback_threshold: u32,
    total_frames: u64,
    total_overruns: u64,
}

impl FrameLatencyBudgetGuard {
    /// 연속 초과 임계치(최소 1, 기본 3)로 가드를 초기화한다.
    pub fn new(overrun_fallback_threshold: u32) -> Self {
        Self {
            last_sequence: 0,
            consecutive_overruns: 0,
            overrun_fallback_threshold: overrun_fallback_threshold.max(1),
            total_frames: 0,
            total_overruns: 0,
        }
    }

    /// 수신된 완료 패킷의 시퀀스 단조성과 지연 예산을 평가한다.
    pub fn evaluate_frame(
        &mut self,
        sequence: u64,
        frame_budget_us: u32,
        actual_latency_us: u32,
    ) -> Result<FrameBudgetDecision, BridgeError> {
        if sequence == 0 || sequence <= self.last_sequence {
            return Err(BridgeError::SequenceRegression {
                last_sequence: self.last_sequence,
                received_sequence: sequence,
            });
        }
        if frame_budget_us == 0 {
            return Err(BridgeError::InvalidFrameBudget { frame_budget_us });
        }

        self.last_sequence = sequence;
        self.total_frames = self.total_frames.saturating_add(1);

        if actual_latency_us > frame_budget_us {
            self.consecutive_overruns = self.consecutive_overruns.saturating_add(1);
            self.total_overruns = self.total_overruns.saturating_add(1);
            if self.consecutive_overruns >= self.overrun_fallback_threshold {
                return Ok(FrameBudgetDecision::FallbackToWebGpu);
            }
            return Ok(FrameBudgetDecision::DowngradeUpscalerTier);
        }

        self.consecutive_overruns = 0;
        // 예산의 85%를 넘으면 사전 경고를 발생시킨다.
        if (actual_latency_us as u64) * 100 >= (frame_budget_us as u64) * 85 {
            Ok(FrameBudgetDecision::NearBudgetWarning)
        } else {
            Ok(FrameBudgetDecision::WithinBudget)
        }
    }

    pub const fn last_sequence(&self) -> u64 {
        self.last_sequence
    }

    pub const fn consecutive_overruns(&self) -> u32 {
        self.consecutive_overruns
    }

    pub const fn total_frames(&self) -> u64 {
        self.total_frames
    }

    pub const fn total_overruns(&self) -> u64 {
        self.total_overruns
    }
}
