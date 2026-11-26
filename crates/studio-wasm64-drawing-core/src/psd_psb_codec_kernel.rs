//! 스트리밍 PackBits RLE 코덱 및 다중 레이어 PSD(v1) · PSB(v2, 64비트 길이) 라이터·파서.
//!
//! - 크레이트 전역 `#![deny(unsafe_code)]` 및 외부 크레이트 0개(`std` 전용) 계약으로 동작한다.
//! - PackBits RLE 인코더/디코더는 버퍼 경계 초과·잘린 입력을 모두 `DrawingCoreError`로 차단한다.
//! - PSB(v2)는 4 GiB 초과 대용량 문서를 위해 섹션·레이어 정보·채널 길이를 64비트(`u64`)로 처리한다.

use crate::vector_psd_tile_kernel::{parse_psd_header_streaming, PsdColorMode, PsdHeaderInfo};
use crate::DrawingCoreError;

/// PSD/PSB 기본 채널 ID 상수.
pub const PSD_CHANNEL_RED: i16 = 0;
pub const PSD_CHANNEL_GREEN: i16 = 1;
pub const PSD_CHANNEL_BLUE: i16 = 2;
pub const PSD_CHANNEL_ALPHA: i16 = -1;
pub const PSD_CHANNEL_USER_MASK: i16 = -2;

/// PSD(v1) 최대 캔버스 한 변 해상도(px).
pub const PSD_V1_MAX_DIM: u32 = 30_000;
/// PSB(v2) 최대 캔버스 한 변 해상도(px).
pub const PSB_V2_MAX_DIM: u32 = 300_000;

const MAX_PACKBITS_RUN: usize = 128;
const MAX_PSD_LAYERS_PER_DOC: usize = 16_384;
const MAX_CHANNELS_PER_LAYER: usize = 56;

/// PSD/PSB 파일 포맷 버전.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum PsdFormatVersion {
    /// 표준 Photoshop 문서(32비트 섹션 길이, 최대 30,000 px).
    PsdV1 = 1,
    /// 대용량 Photoshop 문서(64비트 섹션 길이, 최대 300,000 px, >4 GiB 지원).
    PsbV2 = 2,
}

impl PsdFormatVersion {
    #[inline]
    #[must_use]
    pub const fn as_u16(self) -> u16 {
        self as u16
    }

    #[inline]
    #[must_use]
    pub const fn is_psb(self) -> bool {
        matches!(self, Self::PsbV2)
    }
}

/// PSD/PSB 채널 이미지 압축 방식.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum PsdCompression {
    /// 비압축 원시 스캔라인.
    Raw = 0,
    /// Apple/Adobe PackBits RLE 압축.
    RlePackBits = 1,
}

impl PsdCompression {
    #[inline]
    #[must_use]
    pub const fn as_u16(self) -> u16 {
        self as u16
    }
}

/// 단일 레이어 채널 입력(8비트 평면 행 우선 데이터).
#[derive(Debug, Clone, Copy)]
pub struct PsdLayerChannelInput<'a> {
    pub channel_id: i16,
    pub data: &'a [u8],
}

/// 다중 레이어 PSD/PSB 기록용 레이어 명세.
#[derive(Debug, Clone, Copy)]
pub struct PsdLayerWriteSpec<'a> {
    pub name: &'a str,
    pub top: i32,
    pub left: i32,
    pub bottom: i32,
    pub right: i32,
    pub blend_mode: [u8; 4],
    pub opacity: u8,
    pub clipping: u8,
    pub visible: bool,
    pub transparency_protected: bool,
    pub channels: &'a [PsdLayerChannelInput<'a>],
}

/// 다중 레이어 PSD/PSB 문서 기록 명세.
#[derive(Debug, Clone, Copy)]
pub struct PsdDocumentWriteSpec<'a> {
    pub version: PsdFormatVersion,
    pub width: u32,
    pub height: u32,
    pub channels: u16,
    pub depth_bits: u16,
    pub color_mode: PsdColorMode,
    pub compression: PsdCompression,
    pub layers: &'a [PsdLayerWriteSpec<'a>],
    /// 병합 이미지(Image Data 섹션) 평면 채널 배열. 비어 있으면 0으로 채운 최소 병합 이미지를 기록한다.
    pub composite_channels: &'a [&'a [u8]],
}

/// 스트리밍 파싱된 단일 채널 메타데이터(64비트 오프셋·길이).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PsdChannelMetadata {
    pub channel_id: i16,
    pub data_length: u64,
    pub data_offset: u64,
    /// 채널 데이터가 현재 입력 버퍼 안에 존재하면 2바이트 압축 코드를 기록한다.
    pub compression: Option<u16>,
}

/// 스트리밍 파싱된 단일 레이어 레코드 메타데이터.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PsdLayerMetadata {
    pub name: String,
    pub top: i32,
    pub left: i32,
    pub bottom: i32,
    pub right: i32,
    pub blend_mode: [u8; 4],
    pub opacity: u8,
    pub clipping: u8,
    pub flags: u8,
    pub visible: bool,
    pub transparency_protected: bool,
    pub channels: Vec<PsdChannelMetadata>,
}

impl PsdLayerMetadata {
    /// 레이어 바운딩 박스 가로 폭(px). 빈 레이어는 0.
    #[must_use]
    pub fn width(&self) -> u32 {
        self.right.saturating_sub(self.left).max(0) as u32
    }

    /// 레이어 바운딩 박스 세로 높이(px). 빈 레이어는 0.
    #[must_use]
    pub fn height(&self) -> u32 {
        self.bottom.saturating_sub(self.top).max(0) as u32
    }
}

/// 스트리밍 파싱된 PSD/PSB 전체 헤더 및 다중 레이어 메타데이터.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PsdDocumentLayersMetadata {
    pub header: PsdHeaderInfo,
    /// 음수 레이어 카운트 규칙(첫 번째 알파 채널이 병합 결과의 투명도를 포함함).
    pub has_merged_alpha: bool,
    pub layer_info_offset: u64,
    pub layer_info_length: u64,
    pub layers: Vec<PsdLayerMetadata>,
}

// ---------------------------------------------------------------------------
// 1. PackBits RLE 스트리밍 인코더 & 디코더 (버퍼 오버런 차단)
// ---------------------------------------------------------------------------

/// `input_len`바이트를 PackBits RLE로 인코딩할 때 필요한 최악의 출력 버퍼 길이를 계산한다.
pub fn packbits_max_encoded_len(input_len: usize) -> Result<usize, DrawingCoreError> {
    if input_len == 0 {
        return Ok(0);
    }
    let header_overhead = input_len.div_ceil(MAX_PACKBITS_RUN);
    input_len
        .checked_add(header_overhead)
        .ok_or(DrawingCoreError::InvalidParameter { name: "input_len" })
}

#[inline]
fn count_identical_run(input: &[u8], start: usize) -> usize {
    let first = input[start];
    let limit = (input.len() - start).min(MAX_PACKBITS_RUN);
    let mut len = 1usize;
    while len < limit && input[start + len] == first {
        len += 1;
    }
    len
}

/// 입력 바이트 슬라이스를 Apple/Adobe PackBits RLE 규격으로 `out` 버퍼에 직접 인코딩한다.
///
/// 출력 버퍼가 부족하면 부분 쓰기 중 패닉 없이 `DrawingCoreError::BufferLengthMismatch`를 반환한다.
pub fn encode_packbits_rle_into(input: &[u8], out: &mut [u8]) -> Result<usize, DrawingCoreError> {
    let n = input.len();
    if n == 0 {
        return Ok(0);
    }
    let mut i = 0usize;
    let mut out_pos = 0usize;

    while i < n {
        let run = count_identical_run(input, i);
        // 3바이트 이상 반복은 항상 압축 이득이 있고, 2바이트 반복은 뒤에 또 반복이 오거나 입력 끝일 때만 분리한다.
        let emit_repeat = run >= 3
            || (run == 2 && (i + 2 == n || count_identical_run(input, i + 2) >= 3));

        if emit_repeat {
            let need = out_pos
                .checked_add(2)
                .ok_or(DrawingCoreError::BufferLengthMismatch {
                    expected: usize::MAX,
                    actual: out.len(),
                })?;
            if need > out.len() {
                return Err(DrawingCoreError::BufferLengthMismatch {
                    expected: need,
                    actual: out.len(),
                });
            }
            let header = (1i16 - run as i16) as i8 as u8;
            out[out_pos] = header;
            out[out_pos + 1] = input[i];
            out_pos = need;
            i += run;
            continue;
        }

        // 리터럴 구간 수집(최대 128바이트, 3바이트 이상 반복이 나오면 즉시 중단)
        let lit_start = i;
        let mut lit_len = 0usize;
        while i < n && lit_len < MAX_PACKBITS_RUN {
            let next_run = count_identical_run(input, i);
            if next_run >= 3 {
                break;
            }
            // 리터럴에 남은 여유가 1바이트인데 2바이트 반복이 나오면 그대로 1바이트만 담거나 분리
            let step = if next_run == 2 && lit_len + 2 <= MAX_PACKBITS_RUN {
                2
            } else {
                1
            };
            i += step;
            lit_len += step;
        }

        let need = out_pos
            .checked_add(1 + lit_len)
            .ok_or(DrawingCoreError::BufferLengthMismatch {
                expected: usize::MAX,
                actual: out.len(),
            })?;
        if need > out.len() {
            return Err(DrawingCoreError::BufferLengthMismatch {
                expected: need,
                actual: out.len(),
            });
        }
        out[out_pos] = (lit_len - 1) as u8;
        out[out_pos + 1..need].copy_from_slice(&input[lit_start..lit_start + lit_len]);
        out_pos = need;
    }

    Ok(out_pos)
}

/// 입력 바이트 슬라이스를 PackBits RLE로 무손실 인코딩해 새 `Vec<u8>`로 반환한다.
#[must_use]
pub fn encode_packbits_rle(input: &[u8]) -> Vec<u8> {
    if input.is_empty() {
        return Vec::new();
    }
    let cap = packbits_max_encoded_len(input.len()).unwrap_or(input.len());
    let mut out = vec![0u8; cap];
    let written = encode_packbits_rle_into(input, &mut out).unwrap_or(0);
    out.truncate(written);
    out
}

/// PackBits RLE 스트림을 `out` 버퍼로 디코딩한다(버퍼 오버런 및 잘린 입력 안전 차단).
///
/// 정상 디코딩 시 실제 출력된 바이트 수를 반환한다.
pub fn decode_packbits_rle_into(encoded: &[u8], out: &mut [u8]) -> Result<usize, DrawingCoreError> {
    let mut src = 0usize;
    let mut dst = 0usize;

    while src < encoded.len() {
        let header = encoded[src] as i8;
        src += 1;

        if header == -128 {
            // Adobe/Apple PackBits 규격: -128(0x80)은 no-op
            continue;
        }

        if header >= 0 {
            let count = (header as usize) + 1;
            let src_end = src
                .checked_add(count)
                .ok_or(DrawingCoreError::TruncatedInput {
                    expected_min: usize::MAX,
                    actual: encoded.len(),
                })?;
            if src_end > encoded.len() {
                return Err(DrawingCoreError::TruncatedInput {
                    expected_min: src_end,
                    actual: encoded.len(),
                });
            }
            let dst_end = dst
                .checked_add(count)
                .ok_or(DrawingCoreError::BufferLengthMismatch {
                    expected: usize::MAX,
                    actual: out.len(),
                })?;
            if dst_end > out.len() {
                return Err(DrawingCoreError::BufferLengthMismatch {
                    expected: dst_end,
                    actual: out.len(),
                });
            }
            out[dst..dst_end].copy_from_slice(&encoded[src..src_end]);
            src = src_end;
            dst = dst_end;
        } else {
            let count = (-(i16::from(header)) as usize) + 1;
            if src >= encoded.len() {
                return Err(DrawingCoreError::TruncatedInput {
                    expected_min: src + 1,
                    actual: encoded.len(),
                });
            }
            let val = encoded[src];
            src += 1;
            let dst_end = dst
                .checked_add(count)
                .ok_or(DrawingCoreError::BufferLengthMismatch {
                    expected: usize::MAX,
                    actual: out.len(),
                })?;
            if dst_end > out.len() {
                return Err(DrawingCoreError::BufferLengthMismatch {
                    expected: dst_end,
                    actual: out.len(),
                });
            }
            out[dst..dst_end].fill(val);
            dst = dst_end;
        }
    }

    Ok(dst)
}

/// PackBits RLE 스트림을 `expected_len`바이트 출력으로 정확히 디코딩한다.
pub fn decode_packbits_rle(
    encoded: &[u8],
    expected_len: usize,
) -> Result<Vec<u8>, DrawingCoreError> {
    let mut out = vec![0u8; expected_len];
    let decoded = decode_packbits_rle_into(encoded, &mut out)?;
    if decoded != expected_len {
        return Err(DrawingCoreError::TruncatedInput {
            expected_min: expected_len,
            actual: decoded,
        });
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// 2. 스트리밍 다중 레이어 PSD(v1) / PSB(v2) 라이터 & 메타데이터 파서
// ---------------------------------------------------------------------------

#[inline]
fn color_mode_to_u16(mode: PsdColorMode) -> u16 {
    match mode {
        PsdColorMode::Bitmap => 0,
        PsdColorMode::Grayscale => 1,
        PsdColorMode::Indexed => 2,
        PsdColorMode::Rgb => 3,
        PsdColorMode::Cmyk => 4,
        PsdColorMode::Multichannel => 7,
        PsdColorMode::Duotone => 8,
        PsdColorMode::Lab => 9,
        PsdColorMode::Unknown(code) => code,
    }
}

#[inline]
fn push_be_u16(buf: &mut Vec<u8>, v: u16) {
    buf.extend_from_slice(&v.to_be_bytes());
}

#[inline]
fn push_be_i16(buf: &mut Vec<u8>, v: i16) {
    buf.extend_from_slice(&v.to_be_bytes());
}

#[inline]
fn push_be_u32(buf: &mut Vec<u8>, v: u32) {
    buf.extend_from_slice(&v.to_be_bytes());
}

#[inline]
fn push_be_i32(buf: &mut Vec<u8>, v: i32) {
    buf.extend_from_slice(&v.to_be_bytes());
}

#[inline]
fn push_be_u64(buf: &mut Vec<u8>, v: u64) {
    buf.extend_from_slice(&v.to_be_bytes());
}

fn push_section_len(buf: &mut Vec<u8>, is_psb: bool, len: u64) -> Result<(), DrawingCoreError> {
    if is_psb {
        push_be_u64(buf, len);
        Ok(())
    } else {
        let len32 = u32::try_from(len).map_err(|_| DrawingCoreError::InvalidParameter {
            name: "psd_v1_section_length",
        })?;
        push_be_u32(buf, len32);
        Ok(())
    }
}

fn read_be_u16(bytes: &[u8], offset: usize) -> Result<u16, DrawingCoreError> {
    let s = bytes
        .get(offset..offset + 2)
        .ok_or(DrawingCoreError::TruncatedInput {
            expected_min: offset + 2,
            actual: bytes.len(),
        })?;
    Ok(u16::from_be_bytes([s[0], s[1]]))
}

fn read_be_i16(bytes: &[u8], offset: usize) -> Result<i16, DrawingCoreError> {
    let s = bytes
        .get(offset..offset + 2)
        .ok_or(DrawingCoreError::TruncatedInput {
            expected_min: offset + 2,
            actual: bytes.len(),
        })?;
    Ok(i16::from_be_bytes([s[0], s[1]]))
}

fn read_be_u32(bytes: &[u8], offset: usize) -> Result<u32, DrawingCoreError> {
    let s = bytes
        .get(offset..offset + 4)
        .ok_or(DrawingCoreError::TruncatedInput {
            expected_min: offset + 4,
            actual: bytes.len(),
        })?;
    Ok(u32::from_be_bytes([s[0], s[1], s[2], s[3]]))
}

fn read_be_i32(bytes: &[u8], offset: usize) -> Result<i32, DrawingCoreError> {
    let s = bytes
        .get(offset..offset + 4)
        .ok_or(DrawingCoreError::TruncatedInput {
            expected_min: offset + 4,
            actual: bytes.len(),
        })?;
    Ok(i32::from_be_bytes([s[0], s[1], s[2], s[3]]))
}

fn read_be_u64(bytes: &[u8], offset: usize) -> Result<u64, DrawingCoreError> {
    let s = bytes
        .get(offset..offset + 8)
        .ok_or(DrawingCoreError::TruncatedInput {
            expected_min: offset + 8,
            actual: bytes.len(),
        })?;
    Ok(u64::from_be_bytes([
        s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7],
    ]))
}

fn read_section_len(bytes: &[u8], offset: usize, is_psb: bool) -> Result<(u64, usize), DrawingCoreError> {
    if is_psb {
        Ok((read_be_u64(bytes, offset)?, 8))
    } else {
        Ok((u64::from(read_be_u32(bytes, offset)?), 4))
    }
}

fn encode_channel_payload(
    raw: &[u8],
    width: usize,
    height: usize,
    bytes_per_sample: usize,
    is_psb: bool,
    compression: PsdCompression,
) -> Result<Vec<u8>, DrawingCoreError> {
    let row_bytes = width
        .checked_mul(bytes_per_sample)
        .ok_or(DrawingCoreError::InvalidDimensions {
            width: width as u32,
            height: height as u32,
        })?;
    let expected = row_bytes
        .checked_mul(height)
        .ok_or(DrawingCoreError::InvalidDimensions {
            width: width as u32,
            height: height as u32,
        })?;
    if raw.len() != expected {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected,
            actual: raw.len(),
        });
    }

    let mut payload = Vec::new();
    push_be_u16(&mut payload, compression.as_u16());

    match compression {
        PsdCompression::Raw => {
            payload.extend_from_slice(raw);
        }
        PsdCompression::RlePackBits => {
            let mut row_counts = Vec::with_capacity(height);
            let mut rle_rows = Vec::new();
            for row in 0..height {
                let start = row * row_bytes;
                let encoded = encode_packbits_rle(&raw[start..start + row_bytes]);
                row_counts.push(encoded.len());
                rle_rows.extend_from_slice(&encoded);
            }
            for &rc in &row_counts {
                if is_psb {
                    let rc32 = u32::try_from(rc).map_err(|_| DrawingCoreError::InvalidParameter {
                        name: "psb_row_byte_count",
                    })?;
                    push_be_u32(&mut payload, rc32);
                } else {
                    let rc16 = u16::try_from(rc).map_err(|_| DrawingCoreError::InvalidParameter {
                        name: "psd_row_byte_count",
                    })?;
                    push_be_u16(&mut payload, rc16);
                }
            }
            payload.extend_from_slice(&rle_rows);
        }
    }

    Ok(payload)
}

fn encode_layer_pascal_name_padded4(name: &str) -> Vec<u8> {
    let ascii_bytes: Vec<u8> = name
        .bytes()
        .map(|b| if b.is_ascii() { b } else { b'?' })
        .take(255)
        .collect();
    let len = ascii_bytes.len();
    let total = (1 + len + 3) & !3;
    let mut out = Vec::with_capacity(total);
    out.push(len as u8);
    out.extend_from_slice(&ascii_bytes);
    out.resize(total, 0);
    out
}

fn encode_luni_block(name: &str) -> Vec<u8> {
    let utf16: Vec<u16> = name.encode_utf16().collect();
    // 유니코드 문자열 길이(u32 문자 수) + UTF-16BE 코드 유닛 + 4바이트 패딩
    let raw_data_len = 4 + utf16.len() * 2;
    let padded_len = (raw_data_len + 3) & !3;
    let mut block = Vec::with_capacity(12 + padded_len);
    block.extend_from_slice(b"8BIM");
    block.extend_from_slice(b"luni");
    push_be_u32(&mut block, padded_len as u32);
    push_be_u32(&mut block, utf16.len() as u32);
    for unit in utf16 {
        push_be_u16(&mut block, unit);
    }
    block.resize(12 + padded_len, 0);
    block
}

/// 다중 레이어 Adobe PSD(v1) 또는 대용량 PSB(v2, 64비트 길이) 바이너리를 스트리밍 직렬화한다.
///
/// 생성된 바이트는 `parse_psd_header_streaming` 및 `parse_psd_psb_layers_metadata`로 무손실 왕복 검증된다.
pub fn write_psd_psb_header_and_channels(
    spec: &PsdDocumentWriteSpec<'_>,
) -> Result<Vec<u8>, DrawingCoreError> {
    let is_psb = spec.version.is_psb();
    let max_dim = if is_psb { PSB_V2_MAX_DIM } else { PSD_V1_MAX_DIM };
    if spec.width == 0 || spec.height == 0 || spec.width > max_dim || spec.height > max_dim {
        return Err(DrawingCoreError::InvalidDimensions {
            width: spec.width,
            height: spec.height,
        });
    }
    if spec.channels == 0 || usize::from(spec.channels) > MAX_CHANNELS_PER_LAYER {
        return Err(DrawingCoreError::InvalidParameter { name: "channels" });
    }
    if !matches!(spec.depth_bits, 8 | 16 | 32) {
        return Err(DrawingCoreError::InvalidParameter { name: "depth_bits" });
    }
    if spec.layers.len() > MAX_PSD_LAYERS_PER_DOC {
        return Err(DrawingCoreError::InvalidParameter { name: "layers" });
    }
    let bytes_per_sample = usize::from(spec.depth_bits / 8);

    // 1) File Header (26 bytes)
    let mut out = Vec::with_capacity(256);
    out.extend_from_slice(b"8BPS");
    push_be_u16(&mut out, spec.version.as_u16());
    out.extend_from_slice(&[0u8; 6]);
    push_be_u16(&mut out, spec.channels);
    push_be_u32(&mut out, spec.height);
    push_be_u32(&mut out, spec.width);
    push_be_u16(&mut out, spec.depth_bits);
    push_be_u16(&mut out, color_mode_to_u16(spec.color_mode));

    // 2) Color Mode Data Section (len = 0)
    push_be_u32(&mut out, 0);

    // 3) Image Resources Section (len = 0)
    push_be_u32(&mut out, 0);

    // 4) Layer and Mask Information Section
    if spec.layers.is_empty() {
        push_section_len(&mut out, is_psb, 0)?;
    } else {
        let mut layer_info = Vec::new();
        let layer_count_i16 =
            i16::try_from(spec.layers.len()).map_err(|_| DrawingCoreError::InvalidParameter {
                name: "layers",
            })?;
        push_be_i16(&mut layer_info, layer_count_i16);

        let mut encoded_channel_blobs: Vec<Vec<u8>> = Vec::new();

        for layer in spec.layers {
            if layer.bottom < layer.top || layer.right < layer.left {
                return Err(DrawingCoreError::InvalidParameter {
                    name: "layer_bounds",
                });
            }
            if layer.channels.is_empty() || layer.channels.len() > MAX_CHANNELS_PER_LAYER {
                return Err(DrawingCoreError::InvalidParameter {
                    name: "layer_channels",
                });
            }
            let lw = (layer.right - layer.left) as usize;
            let lh = (layer.bottom - layer.top) as usize;

            let mut layer_blobs = Vec::with_capacity(layer.channels.len());
            for ch in layer.channels {
                let blob = encode_channel_payload(
                    ch.data,
                    lw,
                    lh,
                    bytes_per_sample,
                    is_psb,
                    spec.compression,
                )?;
                layer_blobs.push((ch.channel_id, blob));
            }

            // Layer Record
            push_be_i32(&mut layer_info, layer.top);
            push_be_i32(&mut layer_info, layer.left);
            push_be_i32(&mut layer_info, layer.bottom);
            push_be_i32(&mut layer_info, layer.right);
            push_be_u16(&mut layer_info, layer_blobs.len() as u16);

            for (ch_id, blob) in &layer_blobs {
                push_be_i16(&mut layer_info, *ch_id);
                push_section_len(&mut layer_info, is_psb, blob.len() as u64)?;
            }

            layer_info.extend_from_slice(b"8BIM");
            layer_info.extend_from_slice(&layer.blend_mode);
            layer_info.push(layer.opacity);
            layer_info.push(layer.clipping);
            let mut flags = 0u8;
            if layer.transparency_protected {
                flags |= 0x01;
            }
            if !layer.visible {
                flags |= 0x02;
            }
            layer_info.push(flags);
            layer_info.push(0); // filler

            // Extra data: mask(4B=0) + blending ranges(4B=0) + Pascal name(4B pad) + optional luni
            let pascal_name = encode_layer_pascal_name_padded4(layer.name);
            let needs_luni = !layer.name.is_ascii() || layer.name.len() > 255;
            let luni = if needs_luni {
                encode_luni_block(layer.name)
            } else {
                Vec::new()
            };
            let extra_len = 4 + 4 + pascal_name.len() + luni.len();
            push_be_u32(&mut layer_info, extra_len as u32);
            push_be_u32(&mut layer_info, 0); // layer mask data length
            push_be_u32(&mut layer_info, 0); // layer blending ranges length
            layer_info.extend_from_slice(&pascal_name);
            layer_info.extend_from_slice(&luni);

            for (_, blob) in layer_blobs {
                encoded_channel_blobs.push(blob);
            }
        }

        for blob in encoded_channel_blobs {
            layer_info.extend_from_slice(&blob);
        }

        // Layer info section은 2바이트(PSB 4바이트) 정렬 패딩
        let align_mask = if is_psb { 3usize } else { 1usize };
        while (layer_info.len() & align_mask) != 0 {
            layer_info.push(0);
        }

        let len_prefix = if is_psb { 8u64 } else { 4u64 };
        // Layer and Mask Info = [layer_info_len] + [layer_info] + [global_mask_len: 4B = 0]
        let lm_total_len = len_prefix
            .checked_add(layer_info.len() as u64)
            .and_then(|v| v.checked_add(4))
            .ok_or(DrawingCoreError::InvalidParameter {
                name: "layer_and_mask_length",
            })?;
        push_section_len(&mut out, is_psb, lm_total_len)?;
        push_section_len(&mut out, is_psb, layer_info.len() as u64)?;
        out.extend_from_slice(&layer_info);
        push_be_u32(&mut out, 0); // Global layer mask info length = 0
    }

    // 5) Image Data Section (Merged Composite)
    let cw = spec.width as usize;
    let ch = spec.height as usize;
    let row_bytes = cw
        .checked_mul(bytes_per_sample)
        .ok_or(DrawingCoreError::InvalidDimensions {
            width: spec.width,
            height: spec.height,
        })?;
    let plane_bytes = row_bytes
        .checked_mul(ch)
        .ok_or(DrawingCoreError::InvalidDimensions {
            width: spec.width,
            height: spec.height,
        })?;

    if !spec.composite_channels.is_empty()
        && spec.composite_channels.len() != usize::from(spec.channels)
    {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: usize::from(spec.channels),
            actual: spec.composite_channels.len(),
        });
    }

    let zero_plane = if spec.composite_channels.is_empty() {
        vec![0u8; plane_bytes]
    } else {
        Vec::new()
    };

    push_be_u16(&mut out, spec.compression.as_u16());
    match spec.compression {
        PsdCompression::Raw => {
            for c in 0..usize::from(spec.channels) {
                let plane = if spec.composite_channels.is_empty() {
                    zero_plane.as_slice()
                } else {
                    let p = spec.composite_channels[c];
                    if p.len() != plane_bytes {
                        return Err(DrawingCoreError::BufferLengthMismatch {
                            expected: plane_bytes,
                            actual: p.len(),
                        });
                    }
                    p
                };
                out.extend_from_slice(plane);
            }
        }
        PsdCompression::RlePackBits => {
            let total_rows = usize::from(spec.channels)
                .checked_mul(ch)
                .ok_or(DrawingCoreError::InvalidDimensions {
                    width: spec.width,
                    height: spec.height,
                })?;
            let mut row_counts = Vec::with_capacity(total_rows);
            let mut rle_data = Vec::new();
            for c in 0..usize::from(spec.channels) {
                let plane = if spec.composite_channels.is_empty() {
                    zero_plane.as_slice()
                } else {
                    let p = spec.composite_channels[c];
                    if p.len() != plane_bytes {
                        return Err(DrawingCoreError::BufferLengthMismatch {
                            expected: plane_bytes,
                            actual: p.len(),
                        });
                    }
                    p
                };
                for row in 0..ch {
                    let start = row * row_bytes;
                    let enc = encode_packbits_rle(&plane[start..start + row_bytes]);
                    row_counts.push(enc.len());
                    rle_data.extend_from_slice(&enc);
                }
            }
            for &rc in &row_counts {
                if is_psb {
                    let rc32 = u32::try_from(rc).map_err(|_| DrawingCoreError::InvalidParameter {
                        name: "psb_row_byte_count",
                    })?;
                    push_be_u32(&mut out, rc32);
                } else {
                    let rc16 = u16::try_from(rc).map_err(|_| DrawingCoreError::InvalidParameter {
                        name: "psd_row_byte_count",
                    })?;
                    push_be_u16(&mut out, rc16);
                }
            }
            out.extend_from_slice(&rle_data);
        }
    }

    Ok(out)
}

fn try_extract_luni_name(extra_tail: &[u8], is_psb: bool) -> Option<String> {
    let mut pos = 0usize;
    while pos + 12 <= extra_tail.len() {
        let sig = &extra_tail[pos..pos + 4];
        if sig != b"8BIM" && sig != b"8B64" {
            break;
        }
        let key = &extra_tail[pos + 4..pos + 8];
        let is_64_key = is_psb
            && matches!(
                key,
                b"LMsk"
                    | b"Lr16"
                    | b"Lr32"
                    | b"Layr"
                    | b"Mt16"
                    | b"Mt32"
                    | b"Mtrn"
                    | b"Alph"
                    | b"FMsk"
                    | b"lnk2"
                    | b"FEid"
                    | b"FXid"
                    | b"PxSD"
            );
        let (data_len, len_size) = if is_64_key {
            if pos + 16 > extra_tail.len() {
                break;
            }
            let len = u64::from_be_bytes(extra_tail[pos + 8..pos + 16].try_into().ok()?);
            (usize::try_from(len).ok()?, 8usize)
        } else {
            let len = u32::from_be_bytes(extra_tail[pos + 8..pos + 12].try_into().ok()?);
            (len as usize, 4usize)
        };
        let data_start = pos + 8 + len_size;
        let data_end = data_start.checked_add(data_len)?;
        if data_end > extra_tail.len() {
            break;
        }
        if key == b"luni" && data_len >= 4 {
            let char_count =
                u32::from_be_bytes(extra_tail[data_start..data_start + 4].try_into().ok()?)
                    as usize;
            let utf16_bytes_end = data_start.checked_add(4)?.checked_add(char_count.checked_mul(2)?)?;
            if utf16_bytes_end <= data_end {
                let mut units = Vec::with_capacity(char_count);
                for &chunk in extra_tail[data_start + 4..utf16_bytes_end].as_chunks::<2>().0 {
                    units.push(u16::from_be_bytes(chunk));
                }
                return Some(String::from_utf16_lossy(&units));
            }
        }
        // 추가 블록은 2바이트(일부 4바이트) 정렬될 수 있으므로 짝수 정렬 보정
        let padded = if data_len & 1 == 1 {
            data_len + 1
        } else {
            data_len
        };
        pos = data_start.checked_add(padded)?;
    }
    None
}

/// PSD(v1) 및 대용량 PSB(v2) 바이너리에서 헤더와 다중 레이어 메타데이터·64비트 채널 오프셋을 스트리밍 파싱한다.
///
/// >4 GiB PSB의 선두 헤더+레이어 레코드 프리픽스만 전달되어도 64비트 오프셋 산술로 메타데이터를 안전 추출한다.
pub fn parse_psd_psb_layers_metadata(
    bytes: &[u8],
) -> Result<PsdDocumentLayersMetadata, DrawingCoreError> {
    let header = parse_psd_header_streaming(bytes)?;
    let is_psb = header.is_psb;
    let lm_len_field = if is_psb { 8u64 } else { 4u64 };
    let layer_info_offset = header
        .layer_and_mask_offset
        .checked_add(lm_len_field)
        .ok_or(DrawingCoreError::InvalidParameter {
            name: "layer_info_offset",
        })?;

    if header.layer_and_mask_length == 0 {
        return Ok(PsdDocumentLayersMetadata {
            header,
            has_merged_alpha: false,
            layer_info_offset,
            layer_info_length: 0,
            layers: Vec::new(),
        });
    }

    let li_off = usize::try_from(layer_info_offset).map_err(|_| {
        DrawingCoreError::TruncatedInput {
            expected_min: usize::MAX,
            actual: bytes.len(),
        }
    })?;
    let (layer_info_length, li_len_size) = read_section_len(bytes, li_off, is_psb)?;
    if layer_info_length == 0 {
        return Ok(PsdDocumentLayersMetadata {
            header,
            has_merged_alpha: false,
            layer_info_offset,
            layer_info_length: 0,
            layers: Vec::new(),
        });
    }

    let mut cursor = li_off + li_len_size;
    let raw_count = read_be_i16(bytes, cursor)?;
    cursor += 2;
    let has_merged_alpha = raw_count < 0;
    let layer_count = usize::from(raw_count.unsigned_abs());
    if layer_count > MAX_PSD_LAYERS_PER_DOC {
        return Err(DrawingCoreError::InvalidParameter { name: "layer_count" });
    }

    let mut layers = Vec::with_capacity(layer_count);
    for _ in 0..layer_count {
        let top = read_be_i32(bytes, cursor)?;
        let left = read_be_i32(bytes, cursor + 4)?;
        let bottom = read_be_i32(bytes, cursor + 8)?;
        let right = read_be_i32(bytes, cursor + 12)?;
        if bottom < top || right < left {
            return Err(DrawingCoreError::InvalidParameter {
                name: "layer_bounds",
            });
        }
        let ch_count = usize::from(read_be_u16(bytes, cursor + 16)?);
        cursor += 18;
        if ch_count > MAX_CHANNELS_PER_LAYER {
            return Err(DrawingCoreError::InvalidParameter {
                name: "layer_channels",
            });
        }

        let mut channels = Vec::with_capacity(ch_count);
        for _ in 0..ch_count {
            let channel_id = read_be_i16(bytes, cursor)?;
            cursor += 2;
            let (data_length, sz) = read_section_len(bytes, cursor, is_psb)?;
            cursor += sz;
            channels.push(PsdChannelMetadata {
                channel_id,
                data_length,
                data_offset: 0,
                compression: None,
            });
        }

        let sig = bytes
            .get(cursor..cursor + 4)
            .ok_or(DrawingCoreError::TruncatedInput {
                expected_min: cursor + 4,
                actual: bytes.len(),
            })?;
        if sig != b"8BIM" {
            return Err(DrawingCoreError::InvalidParameter {
                name: "blend_signature",
            });
        }
        let bm = bytes
            .get(cursor + 4..cursor + 8)
            .ok_or(DrawingCoreError::TruncatedInput {
                expected_min: cursor + 8,
                actual: bytes.len(),
            })?;
        let blend_mode = [bm[0], bm[1], bm[2], bm[3]];
        let meta_tail = bytes
            .get(cursor + 8..cursor + 12)
            .ok_or(DrawingCoreError::TruncatedInput {
                expected_min: cursor + 12,
                actual: bytes.len(),
            })?;
        let opacity = meta_tail[0];
        let clipping = meta_tail[1];
        let flags = meta_tail[2];
        cursor += 12;

        let extra_len = read_be_u32(bytes, cursor)? as usize;
        cursor += 4;
        let extra_end = cursor
            .checked_add(extra_len)
            .ok_or(DrawingCoreError::TruncatedInput {
                expected_min: usize::MAX,
                actual: bytes.len(),
            })?;
        if extra_end > bytes.len() {
            return Err(DrawingCoreError::TruncatedInput {
                expected_min: extra_end,
                actual: bytes.len(),
            });
        }

        // Extra Data: Layer mask + Layer blending ranges + Pascal name + optional Additional Info
        let mask_len = read_be_u32(bytes, cursor)? as usize;
        let mut extra_cur = cursor
            .checked_add(4)
            .and_then(|v| v.checked_add(mask_len))
            .ok_or(DrawingCoreError::InvalidParameter { name: "mask_len" })?;
        if extra_cur + 4 > extra_end {
            return Err(DrawingCoreError::TruncatedInput {
                expected_min: extra_cur + 4,
                actual: extra_end,
            });
        }
        let blend_ranges_len = read_be_u32(bytes, extra_cur)? as usize;
        extra_cur = extra_cur
            .checked_add(4)
            .and_then(|v| v.checked_add(blend_ranges_len))
            .ok_or(DrawingCoreError::InvalidParameter {
                name: "blend_ranges_len",
            })?;
        if extra_cur >= extra_end {
            return Err(DrawingCoreError::TruncatedInput {
                expected_min: extra_cur + 1,
                actual: extra_end,
            });
        }

        let name_len = usize::from(bytes[extra_cur]);
        let name_end = extra_cur
            .checked_add(1 + name_len)
            .ok_or(DrawingCoreError::TruncatedInput {
                expected_min: usize::MAX,
                actual: extra_end,
            })?;
        if name_end > extra_end {
            return Err(DrawingCoreError::TruncatedInput {
                expected_min: name_end,
                actual: extra_end,
            });
        }
        let pascal_name = String::from_utf8_lossy(&bytes[extra_cur + 1..name_end]).into_owned();
        let padded_pascal_len = (1 + name_len + 3) & !3;
        let tail_start = (extra_cur + padded_pascal_len).min(extra_end);
        let name = try_extract_luni_name(&bytes[tail_start..extra_end], is_psb)
            .unwrap_or(pascal_name);

        cursor = extra_end;
        layers.push(PsdLayerMetadata {
            name,
            top,
            left,
            bottom,
            right,
            blend_mode,
            opacity,
            clipping,
            flags,
            visible: (flags & 0x02) == 0,
            transparency_protected: (flags & 0x01) != 0,
            channels,
        });
    }

    // 모든 레이어 레코드 바로 뒤에서 시작하는 64비트 채널 데이터 오프셋 계산
    let mut channel_offset_u64 = cursor as u64;
    let total_bytes_u64 = bytes.len() as u64;
    for layer in &mut layers {
        for ch in &mut layer.channels {
            ch.data_offset = channel_offset_u64;
            if ch.data_length >= 2 && channel_offset_u64.saturating_add(2) <= total_bytes_u64 {
                if let Ok(off) = usize::try_from(channel_offset_u64) {
                    ch.compression = read_be_u16(bytes, off).ok();
                }
            }
            channel_offset_u64 = channel_offset_u64
                .checked_add(ch.data_length)
                .ok_or(DrawingCoreError::InvalidParameter {
                    name: "channel_data_offset",
                })?;
        }
    }

    Ok(PsdDocumentLayersMetadata {
        header,
        has_merged_alpha,
        layer_info_offset,
        layer_info_length,
        layers,
    })
}

/// 파싱된 레이어의 단일 8비트 채널(Raw 또는 PackBits RLE) 픽셀 데이터를 무손실 복원한다.
pub fn decode_psd_layer_channel_8bit(
    bytes: &[u8],
    is_psb: bool,
    layer: &PsdLayerMetadata,
    channel_index: usize,
) -> Result<Vec<u8>, DrawingCoreError> {
    let ch = layer
        .channels
        .get(channel_index)
        .ok_or(DrawingCoreError::InvalidParameter {
            name: "channel_index",
        })?;
    let w = layer.width() as usize;
    let h = layer.height() as usize;
    let expected = w
        .checked_mul(h)
        .ok_or(DrawingCoreError::InvalidDimensions {
            width: layer.width(),
            height: layer.height(),
        })?;

    let start = usize::try_from(ch.data_offset).map_err(|_| DrawingCoreError::TruncatedInput {
        expected_min: usize::MAX,
        actual: bytes.len(),
    })?;
    let len = usize::try_from(ch.data_length).map_err(|_| DrawingCoreError::TruncatedInput {
        expected_min: usize::MAX,
        actual: bytes.len(),
    })?;
    let end = start
        .checked_add(len)
        .ok_or(DrawingCoreError::TruncatedInput {
            expected_min: usize::MAX,
            actual: bytes.len(),
        })?;
    if end > bytes.len() || len < 2 {
        return Err(DrawingCoreError::TruncatedInput {
            expected_min: end.max(start + 2),
            actual: bytes.len(),
        });
    }

    let compression = read_be_u16(bytes, start)?;
    let payload = &bytes[start + 2..end];
    match compression {
        0 => {
            if payload.len() < expected {
                return Err(DrawingCoreError::TruncatedInput {
                    expected_min: expected,
                    actual: payload.len(),
                });
            }
            Ok(payload[..expected].to_vec())
        }
        1 => {
            let count_entry_bytes = if is_psb { 4usize } else { 2usize };
            let table_bytes = h.checked_mul(count_entry_bytes).ok_or(
                DrawingCoreError::InvalidDimensions {
                    width: layer.width(),
                    height: layer.height(),
                },
            )?;
            if payload.len() < table_bytes {
                return Err(DrawingCoreError::TruncatedInput {
                    expected_min: table_bytes,
                    actual: payload.len(),
                });
            }
            let mut out = vec![0u8; expected];
            let mut rle_pos = table_bytes;
            for row in 0..h {
                let row_rle_len = if is_psb {
                    read_be_u32(payload, row * 4)? as usize
                } else {
                    usize::from(read_be_u16(payload, row * 2)?)
                };
                let rle_end =
                    rle_pos
                        .checked_add(row_rle_len)
                        .ok_or(DrawingCoreError::TruncatedInput {
                            expected_min: usize::MAX,
                            actual: payload.len(),
                        })?;
                if rle_end > payload.len() {
                    return Err(DrawingCoreError::TruncatedInput {
                        expected_min: rle_end,
                        actual: payload.len(),
                    });
                }
                let decoded = decode_packbits_rle_into(
                    &payload[rle_pos..rle_end],
                    &mut out[row * w..(row + 1) * w],
                )?;
                if decoded != w {
                    return Err(DrawingCoreError::TruncatedInput {
                        expected_min: w,
                        actual: decoded,
                    });
                }
                rle_pos = rle_end;
            }
            Ok(out)
        }
        _ => Err(DrawingCoreError::InvalidParameter {
            name: "compression",
        }),
    }
}
