use super::*;

// ============================================================================
// 2. Morton Z-Order Curve & 2D 고속 BVH 테스트
// ============================================================================

#[test]
fn morton_2d_is_strictly_monotonic_along_axes_and_bijective_on_grid() {
    for y in 0..64u16 {
        let mut prev = encode_morton_2d_u32(0, y);
        for x in 1..64u16 {
            let cur = encode_morton_2d_u32(x, y);
            assert!(cur > prev, "X축 단조성 위반: ({x},{y})");
            prev = cur;
        }
    }
    for x in 0..64u16 {
        let mut prev = encode_morton_2d_u32(x, 0);
        for y in 1..64u16 {
            let cur = encode_morton_2d_u32(x, y);
            assert!(cur > prev, "Y축 단조성 위반: ({x},{y})");
            prev = cur;
        }
    }
    // 64x64 그리드 내 충돌 0건 (전단사 검증)
    let mut seen = Vec::with_capacity(64 * 64);
    for y in 0..64u16 {
        for x in 0..64u16 {
            seen.push(encode_morton_2d_u32(x, y));
        }
    }
    seen.sort_unstable();
    seen.dedup();
    assert_eq!(seen.len(), 64 * 64);
}

#[test]
fn morton_3d_is_strictly_monotonic_along_xyz_and_clamps_overflow() {
    for x in 0..16u16 {
        for y in 0..16u16 {
            let mut prev = encode_morton_3d_u32(x, y, 0);
            for z in 1..16u16 {
                let cur = encode_morton_3d_u32(x, y, z);
                assert!(cur > prev);
                prev = cur;
            }
        }
    }
    assert_eq!(encode_morton_3d_u32(1, 0, 0), 0b001);
    assert_eq!(encode_morton_3d_u32(0, 1, 0), 0b010);
    assert_eq!(encode_morton_3d_u32(0, 0, 1), 0b100);
    assert_eq!(encode_morton_3d_u32(1023, 1023, 1023), 0x3FFF_FFFF);
    assert_eq!(
        encode_morton_3d_u32(5000, 1023, 777),
        encode_morton_3d_u32(1023, 1023, 777)
    );
}

#[test]
fn morton_2d_preserves_quadrant_spatial_locality() {
    // 같은 4분면(좌하단) 내 근접 셀은 대각선 반대 4분면 셀보다 Morton 거리 차이가 훨씬 작아야 함
    let a = encode_morton_2d_u32(10, 12);
    let near = encode_morton_2d_u32(11, 13);
    let far = encode_morton_2d_u32(60_000, 60_000);
    assert!(a.abs_diff(near) < a.abs_diff(far) / 1_000_000);
}

#[test]
fn morton_bvh_2000_aabbs_matches_brute_force_100_percent() {
    let mut rng = 0x2026_52A0_CAFE_BABEu64;
    let mut aabbs = Vec::with_capacity(2000);
    for _ in 0..2000 {
        let cx = lcg_next(&mut rng) * 4000.0 - 2000.0;
        let cy = lcg_next(&mut rng) * 4000.0 - 2000.0;
        let hw = 2.0 + lcg_next(&mut rng) * 45.0;
        let hh = 2.0 + lcg_next(&mut rng) * 45.0;
        aabbs.push(Aabb2D::new(cx - hw, cy - hh, cx + hw, cy + hh));
    }

    let bvh = build_morton_bvh_2d(&aabbs).expect("build 2000 ok");
    assert_eq!(bvh.primitive_count(), 2000);
    assert!(bvh.morton_codes.windows(2).all(|w| w[0] <= w[1]));

    let queries = [
        Aabb2D::new(-5000.0, -5000.0, -4500.0, -4500.0), // 완전 미스
        Aabb2D::new(-3000.0, -3000.0, 3000.0, 3000.0),   // 전체 히트
        Aabb2D::new(-100.0, -100.0, 100.0, 100.0),       // 중앙 소형 뷰포트
        Aabb2D::new(500.0, -1800.0, 520.0, 1800.0),      // 세로 슬라이스
        Aabb2D::new(-1900.0, 400.0, 1900.0, 415.0),      // 가로 슬라이스
        Aabb2D::new(1234.0, -777.0, 1234.0, -777.0),     // 단일 점 쿼리
        Aabb2D::new(-1500.0, 800.0, -200.0, 1600.0),     // 2사분면
        Aabb2D::new(250.0, 250.0, 1100.0, 950.0),        // 1사분면
    ];

    for q in queries {
        let mut bvh_hits = query_morton_bvh_aabb(&bvh, q).expect("query ok");
        bvh_hits.sort_unstable();
        let mut brute_hits: Vec<u32> = aabbs
            .iter()
            .enumerate()
            .filter_map(|(i, b)| b.intersects(&q).then_some(i as u32))
            .collect();
        brute_hits.sort_unstable();
        assert_eq!(bvh_hits, brute_hits, "쿼리 {q:?} BVH vs 브루트포스 불일치");
    }
}

#[test]
fn morton_bvh_handles_coincident_degenerate_aabbs_and_boundary_touches() {
    // 64개 AABB가 완전히 같은 중심 좌표를 가져도 무한 재귀 없이 정확히 구축·쿼리됨
    let coincident = vec![Aabb2D::new(10.0, 20.0, 15.0, 25.0); 64];
    let bvh = build_morton_bvh_2d(&coincident).expect("coincident ok");
    let mut hits =
        query_morton_bvh_aabb(&bvh, Aabb2D::new(15.0, 25.0, 30.0, 40.0)).expect("touch ok");
    hits.sort_unstable();
    assert_eq!(hits, (0..64u32).collect::<Vec<_>>());

    let miss = query_morton_bvh_aabb(&bvh, Aabb2D::new(15.01, 20.0, 30.0, 40.0)).expect("miss ok");
    assert!(miss.is_empty());
}

#[test]
fn morton_bvh_handles_empty_single_and_rejects_nan_or_inverted_aabbs() {
    let empty_bvh = build_morton_bvh_2d(&[]).expect("empty ok");
    assert!(empty_bvh.is_empty());
    assert!(
        query_morton_bvh_aabb(&empty_bvh, Aabb2D::new(0.0, 0.0, 1.0, 1.0))
            .expect("empty query ok")
            .is_empty()
    );

    let single = build_morton_bvh_2d(&[Aabb2D::new(-1.0, -1.0, 1.0, 1.0)]).expect("single ok");
    assert_eq!(
        query_morton_bvh_aabb(&single, Aabb2D::new(0.0, 0.0, 2.0, 2.0)).expect("hit"),
        vec![0]
    );

    // NaN / Inf / 역전된 AABB 거부 검증
    assert_eq!(
        build_morton_bvh_2d(&[Aabb2D::new(f32::NAN, 0.0, 1.0, 1.0)]),
        Err(DrawingCoreError::InvalidParameter { name: "aabbs" })
    );
    assert_eq!(
        build_morton_bvh_2d(&[Aabb2D::new(5.0, 0.0, 1.0, 1.0)]),
        Err(DrawingCoreError::InvalidParameter { name: "aabbs" })
    );
    assert_eq!(
        query_morton_bvh_aabb(&single, Aabb2D::new(0.0, f32::INFINITY, 1.0, 2.0)),
        Err(DrawingCoreError::InvalidParameter { name: "query" })
    );
    assert_eq!(
        query_morton_bvh_aabb(&single, Aabb2D::new(2.0, 0.0, 1.0, 2.0)),
        Err(DrawingCoreError::InvalidParameter { name: "query" })
    );
}
