//! 고속 타일 XOR 델타 인코딩·복원 및 FNV-1a 32비트 체크섬 커널.
//!
//! 256×256(256 KiB) 또는 512×512(1 MiB) 캔버스 타일의 비동기 증분 히스토리 스냅샷과
//! 무결성 검증 핫패스를 외부 의존성 없는 순수 안전 Rust로 제공한다.

use crate::DrawingCoreError;

const FNV1A_OFFSET_BASIS_32: u32 = 0x811c_9dc5;
const FNV1A_PRIME_32: u32 = 16_777_619;

/// 이전 타일과 다음 타일 바이트열의 XOR 델타를 `out_delta`에 기록하고 변경된 바이트 수를 반환한다.
pub fn xor_tile_delta_bytes(
    prev: &[u8],
    next: &[u8],
    out_delta: &mut [u8],
) -> Result<usize, DrawingCoreError> {
    if prev.len() != next.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: prev.len(),
            actual: next.len(),
        });
    }
    if out_delta.len() != prev.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: prev.len(),
            actual: out_delta.len(),
        });
    }

    let mut changed = 0usize;
    let (prev_chunks, prev_rem) = prev.as_chunks::<8>();
    let (next_chunks, next_rem) = next.as_chunks::<8>();
    let (out_chunks, out_rem) = out_delta.as_chunks_mut::<8>();
    for ((&p, &n), out) in prev_chunks
        .iter()
        .zip(next_chunks.iter())
        .zip(out_chunks.iter_mut())
    {
        let diff_u64 = u64::from_ne_bytes(p) ^ u64::from_ne_bytes(n);
        *out = diff_u64.to_ne_bytes();
        if diff_u64 != 0 {
            for &b in out.iter() {
                changed += usize::from(b != 0);
            }
        }
    }
    for ((&p, &n), out) in prev_rem.iter().zip(next_rem.iter()).zip(out_rem.iter_mut()) {
        let diff = p ^ n;
        *out = diff;
        changed += usize::from(diff != 0);
    }
    Ok(changed)
}

/// XOR 델타를 기존 타일 버퍼에 제자리 적용해 이전/다음 상태를 무손실 복원한다.
pub fn apply_xor_tile_delta_in_place(
    base: &mut [u8],
    delta: &[u8],
) -> Result<usize, DrawingCoreError> {
    if base.len() != delta.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: base.len(),
            actual: delta.len(),
        });
    }
    let mut changed = 0usize;
    for (slot, &d) in base.iter_mut().zip(delta.iter()) {
        *slot ^= d;
        changed += usize::from(d != 0);
    }
    Ok(changed)
}

/// 32비트 FNV-1a 체크섬을 계산한다 (`wasm64-drawing-binary.ts`와 비트 단위 동일).
#[must_use]
pub fn fnv1a_checksum_32(bytes: &[u8]) -> u32 {
    let mut hash = FNV1A_OFFSET_BASIS_32;
    for &b in bytes {
        hash ^= u32::from(b);
        hash = hash.wrapping_mul(FNV1A_PRIME_32);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xor_tile_delta_roundtrips_losslessly_and_counts_changed_bytes() {
        let prev = vec![10u8, 20, 30, 255, 40, 50, 60, 255];
        let next = vec![10u8, 25, 30, 255, 44, 50, 99, 255];
        let mut delta = vec![0u8; prev.len()];

        let changed = xor_tile_delta_bytes(&prev, &next, &mut delta).expect("xor delta ok");
        assert_eq!(changed, 3);
        assert_eq!(delta[0], 0);
        assert_eq!(delta[1], 20 ^ 25);

        let mut restored = prev.clone();
        let applied = apply_xor_tile_delta_in_place(&mut restored, &delta).expect("apply ok");
        assert_eq!(applied, 3);
        assert_eq!(restored, next);

        // 한 번 더 적용하면 원본으로 무손실 복귀
        let reverted = apply_xor_tile_delta_in_place(&mut restored, &delta).expect("revert ok");
        assert_eq!(reverted, 3);
        assert_eq!(restored, prev);
    }

    #[test]
    fn xor_tile_delta_rejects_mismatched_lengths() {
        let mut out = [0u8; 4];
        assert_eq!(
            xor_tile_delta_bytes(&[1, 2, 3, 4], &[1, 2, 3], &mut out),
            Err(DrawingCoreError::BufferLengthMismatch {
                expected: 4,
                actual: 3
            })
        );
        let mut short_out = [0u8; 2];
        assert_eq!(
            xor_tile_delta_bytes(&[1, 2, 3, 4], &[1, 2, 3, 4], &mut short_out),
            Err(DrawingCoreError::BufferLengthMismatch {
                expected: 4,
                actual: 2
            })
        );
    }

    #[test]
    fn fnv1a_checksum_matches_standard_vectors() {
        assert_eq!(fnv1a_checksum_32(b""), 0x811c_9dc5);
        assert_eq!(fnv1a_checksum_32(b"foobar"), 0xbf9c_f968);
    }
}
