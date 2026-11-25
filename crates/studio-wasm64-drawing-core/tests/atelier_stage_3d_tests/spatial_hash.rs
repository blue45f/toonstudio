use super::*;

#[test]
fn spatial_hash_3d_deterministic_across_signed_coordinates() {
    let grid = SpatialHashGrid3D::new(DEFAULT_SPATIAL_CELL_SIZE, 256).expect("grid");
    assert_eq!(grid.cell_coords([0.0, 0.0, 0.0]), [0, 0, 0]);
    assert_eq!(grid.cell_coords([-0.01, -0.26, 0.25]), [-1, -2, 1]);
    let h1 = hash_cell_3d(-7, 13, -42);
    let h2 = hash_cell_3d(-7, 13, -42);
    let h3 = hash_cell_3d(-7, 13, -41);
    assert_eq!(h1, h2);
    assert_ne!(h1, h3);
}

#[test]
fn spatial_hash_query_radius_100_percent_set_equivalence_vs_bruteforce() {
    let mut grid = SpatialHashGrid3D::new(0.25, 2048).expect("grid");
    let mut rng = 0x1234_5678_9ABC_DEF0_u64;
    let mut pts = Vec::with_capacity(1_000);
    for id in 0..1_000u32 {
        let p = [
            -4.0 + lcg_f32(&mut rng) * 8.0,
            -4.0 + lcg_f32(&mut rng) * 8.0,
            -4.0 + lcg_f32(&mut rng) * 8.0,
        ];
        pts.push((id, p));
        grid.insert(id, p).expect("insert");
    }
    let mut out = Vec::new();
    for _ in 0..50 {
        let q = [
            -4.0 + lcg_f32(&mut rng) * 8.0,
            -4.0 + lcg_f32(&mut rng) * 8.0,
            -4.0 + lcg_f32(&mut rng) * 8.0,
        ];
        let r = 0.05 + lcg_f32(&mut rng) * 1.4;
        grid.query_radius(q, r, &mut out).expect("query");
        let grid_set: BTreeSet<u32> = out.iter().copied().collect();
        assert_eq!(grid_set.len(), out.len(), "중복 ID 금지");
        let brute_set: BTreeSet<u32> = pts
            .iter()
            .filter(|(_, p)| {
                let d2 = (p[0] - q[0]).powi(2) + (p[1] - q[1]).powi(2) + (p[2] - q[2]).powi(2);
                d2 <= r * r
            })
            .map(|(id, _)| *id)
            .collect();
        assert_eq!(grid_set, brute_set);
    }
}

#[test]
fn spatial_hash_query_radius_exact_under_heavy_bucket_collisions() {
    let mut grid = SpatialHashGrid3D::new(0.25, 64).expect("grid");
    let mut rng = 0xDEAD_BEEF_60B2_u64;
    let mut pts = Vec::with_capacity(800);
    for id in 0..800u32 {
        let p = [
            -2.5 + lcg_f32(&mut rng) * 5.0,
            -2.5 + lcg_f32(&mut rng) * 5.0,
            -2.5 + lcg_f32(&mut rng) * 5.0,
        ];
        pts.push((id, p));
        grid.insert(id, p).expect("insert");
    }
    let mut out = Vec::new();
    for _ in 0..30 {
        let q = [
            -2.0 + lcg_f32(&mut rng) * 4.0,
            -2.0 + lcg_f32(&mut rng) * 4.0,
            -2.0 + lcg_f32(&mut rng) * 4.0,
        ];
        let r = 0.45;
        grid.query_radius(q, r, &mut out).expect("query");
        let got: BTreeSet<u32> = out.iter().copied().collect();
        assert_eq!(got.len(), out.len());
        let expected: BTreeSet<u32> = pts
            .iter()
            .filter(|(_, p)| dist3(*p, q) <= r)
            .map(|(id, _)| *id)
            .collect();
        assert_eq!(got, expected);
    }
}

#[test]
fn spatial_hash_mixed_radii_oversized_props_and_huge_query_match_bruteforce() {
    let mut grid = SpatialHashGrid3D::new(0.25, 256).expect("grid");
    let mut rng = 0x7777_8888_u64;
    let mut spheres = Vec::new();
    for id in 0..300u32 {
        let p = [
            -5.0 + lcg_f32(&mut rng) * 10.0,
            -5.0 + lcg_f32(&mut rng) * 10.0,
            -5.0 + lcg_f32(&mut rng) * 10.0,
        ];
        let r = if id % 25 == 0 {
            1.8
        } else {
            lcg_f32(&mut rng) * 0.4
        };
        spheres.push((id, p, r));
        grid.insert_sphere(id, p, r).expect("insert sphere");
    }
    let mut out = Vec::new();
    for query_r in [0.0, 0.35, 1.5, 25.0] {
        let q = [0.7, -1.2, 0.4];
        grid.query_radius(q, query_r, &mut out).expect("query");
        let got: BTreeSet<u32> = out.iter().copied().collect();
        assert_eq!(got.len(), out.len());
        let expected: BTreeSet<u32> = spheres
            .iter()
            .filter(|(_, p, er)| {
                let lim = query_r + er;
                (p[0] - q[0]).powi(2) + (p[1] - q[1]).powi(2) + (p[2] - q[2]).powi(2) <= lim * lim
            })
            .map(|(id, _, _)| *id)
            .collect();
        assert_eq!(got, expected);
    }
}

#[test]
fn spatial_hash_resolve_sphere_overlaps_separates_dynamic_avatars_symmetrically() {
    let mut bodies = [
        AtelierSphereBody::new(0, [0.0, 0.0, 0.0], 0.5, 1.0),
        AtelierSphereBody::new(1, [0.6, 0.0, 0.0], 0.5, 1.0),
    ];
    let stats = resolve_sphere_overlaps(&mut bodies, 0.25, 4, 1.0).expect("resolve");
    assert!(stats.resolved_pairs >= 1);
    assert!((stats.max_initial_penetration - 0.4).abs() < 1e-4);
    assert!(stats.max_residual_penetration <= 1e-4);
    assert!((bodies[0].pos[0] + 0.2).abs() < 1e-4);
    assert!((bodies[1].pos[0] - 0.8).abs() < 1e-4);
}

#[test]
fn spatial_hash_resolve_sphere_overlaps_respects_static_props_and_coincident_centers() {
    let mut bodies = [
        AtelierSphereBody::new(0, [0.0, 0.0, 0.0], 0.5, 0.0),
        AtelierSphereBody::new(1, [0.3, 0.0, 0.0], 0.5, 1.0),
        AtelierSphereBody::new(2, [3.0, 0.0, 0.0], 0.4, 1.0),
        AtelierSphereBody::new(3, [3.0, 0.0, 0.0], 0.4, 1.0),
    ];
    let stats = resolve_sphere_overlaps(&mut bodies, 0.25, 4, 1.0).expect("resolve");
    assert_eq!(bodies[0].pos, [0.0, 0.0, 0.0], "정적 소품은 불변");
    assert!((bodies[1].pos[0] - 1.0).abs() < 1e-4);
    assert!(dist3(bodies[2].pos, bodies[3].pos) >= 0.799);
    assert!(stats.max_residual_penetration <= 1e-4);
    assert!(bodies.iter().all(|b| b.pos.iter().all(|v| v.is_finite())));
}

#[test]
fn spatial_hash_resolve_dense_3d_crowd_converges_cleanly() {
    let mut rng = 0xAC1D_60B3_u64;
    let mut bodies = Vec::with_capacity(48);
    for i in 0..48u32 {
        bodies.push(AtelierSphereBody::new(
            i,
            [
                -0.6 + lcg_f32(&mut rng) * 1.2,
                -0.6 + lcg_f32(&mut rng) * 1.2,
                -0.6 + lcg_f32(&mut rng) * 1.2,
            ],
            0.22,
            1.0,
        ));
    }
    let stats = resolve_sphere_overlaps(&mut bodies, 0.25, 24, 0.9).expect("crowd");
    assert!(stats.max_initial_penetration > 0.1);
    assert!(stats.max_residual_penetration < 0.015);
    assert!(stats.max_residual_penetration < stats.max_initial_penetration * 0.1);
}

#[test]
fn spatial_hash_rejects_invalid_cell_size_nan_and_negative_radius() {
    assert!(SpatialHashGrid3D::new(0.0, 64).is_err());
    assert!(SpatialHashGrid3D::new(f32::NAN, 64).is_err());
    let mut grid = SpatialHashGrid3D::new(0.25, 64).expect("grid");
    assert!(grid.insert(0, [f32::INFINITY, 0.0, 0.0]).is_err());
    assert!(grid.insert_sphere(0, [0.0, 0.0, 0.0], -0.1).is_err());
    let mut out = Vec::new();
    assert!(grid.query_radius([0.0, 0.0, 0.0], -1.0, &mut out).is_err());
    let mut bad = [AtelierSphereBody::new(0, [0.0; 3], 0.5, -1.0)];
    assert!(resolve_sphere_overlaps(&mut bad, 0.25, 4, 0.8).is_err());
    assert!(resolve_sphere_overlaps(&mut [], 0.25, 0, 0.8).is_err());
}
