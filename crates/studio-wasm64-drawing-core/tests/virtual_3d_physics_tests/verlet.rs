use super::*;

#[test]
fn verlet_pinned_root_invariance_under_gravity_wind_and_collisions() {
    let (mut px, mut py, mut pz) = ([0.25; 5], [1.8, 1.6, 1.4, 1.2, 1.0], [-0.1; 5]);
    let (mut ox, mut oy, mut oz) = (px, py, pz);
    let (im, rl) = ([0.0, 1.0, 1.0, 1.0, 1.0], [0.0, 0.2, 0.2, 0.2, 0.2]);
    let colliders = [SphereCollider::new(0.25, 1.75, -0.10, 0.15)];
    let cfg = VerletSpringConfig {
        wind_xyz: [6.0, 1.5, -4.0],
        iterations: 6,
        ..Default::default()
    };
    for _ in 0..120 {
        let mut c = VerletSpringChainsSoa {
            pos_x: &mut px,
            pos_y: &mut py,
            pos_z: &mut pz,
            prev_x: &mut ox,
            prev_y: &mut oy,
            prev_z: &mut oz,
            inv_mass: &im,
            rest_len: &rl,
        };
        let st = step_verlet_spring_chains_soa(&mut c, &colliders, &cfg).expect("step ok");
        assert_eq!(st.active_constraints, 4);
        assert_eq!((px[0], py[0], pz[0]), (0.25, 1.80, -0.10));
        assert_eq!((ox[0], oy[0], oz[0]), (0.25, 1.80, -0.10));
    }
    assert!(px[4] > 0.30 && pz[4] < -0.12);
}

#[test]
fn verlet_distance_constraints_converge_across_pbd_iterations() {
    let run = |iterations: u32| -> f32 {
        // 5링크 체인을 정지 길이의 1.5배로 늘린 뒤 단일 스텝 PBD 반복 수렴 잔차 비교
        let mut px: Vec<f32> = (0..6).map(|i| i as f32 * 0.30).collect();
        let (mut py, mut pz) = (vec![2.0_f32; 6], vec![0.0_f32; 6]);
        let (mut ox, mut oy, mut oz) = (px.clone(), py.clone(), pz.clone());
        let (im, rl) = (
            [0.0, 1.0, 1.0, 1.0, 1.0, 1.0],
            [0.0, 0.2, 0.2, 0.2, 0.2, 0.2],
        );
        let cfg = VerletSpringConfig {
            stiffness: 1.0,
            damping: 0.0,
            gravity_y: 0.0,
            iterations,
            ..Default::default()
        };
        let mut c = VerletSpringChainsSoa {
            pos_x: &mut px,
            pos_y: &mut py,
            pos_z: &mut pz,
            prev_x: &mut ox,
            prev_y: &mut oy,
            prev_z: &mut oz,
            inv_mass: &im,
            rest_len: &rl,
        };
        step_verlet_spring_chains_soa(&mut c, &[], &cfg)
            .expect("pbd ok")
            .max_constraint_error
    };
    let (e1, e4, e8) = (run(1), run(4), run(8));
    assert!(e4 < e1, "4회({e4}) < 1회({e1})");
    assert!(e8 < e4, "8회({e8}) < 4회({e4})");
    assert!(e8 < 0.05, "8회 수렴 오차 과다: {e8}");
}

#[test]
fn verlet_energy_decays_monotonically_without_explosion() {
    let (mut px, mut py, mut pz) = ([0.0, 0.5], [2.0, 2.0], [0.0, 0.0]);
    let (mut ox, mut oy, mut oz) = ([0.0, 0.5], [2.0, 2.06], [0.0, 0.0]);
    let (im, rl) = ([0.0, 1.0], [0.0, 0.5]);
    let cfg = VerletSpringConfig {
        stiffness: 1.0,
        damping: 0.06,
        gravity_y: 0.0,
        iterations: 4,
        ..Default::default()
    };
    let (mut prev_ke, mut first_ke, mut last_ke) = (f32::INFINITY, 0.0_f32, 0.0_f32);
    for step in 0..120 {
        let mut c = VerletSpringChainsSoa {
            pos_x: &mut px,
            pos_y: &mut py,
            pos_z: &mut pz,
            prev_x: &mut ox,
            prev_y: &mut oy,
            prev_z: &mut oz,
            inv_mass: &im,
            rest_len: &rl,
        };
        let st = step_verlet_spring_chains_soa(&mut c, &[], &cfg).expect("energy ok");
        assert!(st.total_kinetic_energy.is_finite());
        if step == 0 {
            first_ke = st.total_kinetic_energy;
            assert!(first_ke > 0.1);
        } else {
            assert!(
                st.total_kinetic_energy <= prev_ke + 1e-5,
                "step={step}: {} > {}",
                st.total_kinetic_energy,
                prev_ke
            );
        }
        prev_ke = st.total_kinetic_energy;
        last_ke = st.total_kinetic_energy;
    }
    assert!(last_ke < first_ke * 0.01);
}

#[test]
fn verlet_multi_chain_hair_independence_and_4wide_simd_tails() {
    for count in [1usize, 3, 4, 5, 13, 21] {
        let mut px: Vec<f32> = (0..count).map(|i| (i / 3) as f32 * 2.0).collect();
        let mut py: Vec<f32> = (0..count).map(|i| 3.0 - (i % 3) as f32 * 0.25).collect();
        let mut pz = vec![0.0_f32; count];
        let (mut ox, mut oy, mut oz) = (px.clone(), py.clone(), pz.clone());
        let im: Vec<f32> = (0..count)
            .map(|i| if i % 3 == 0 { 0.0 } else { 1.0 })
            .collect();
        let rl: Vec<f32> = (0..count)
            .map(|i| if i % 3 == 0 { 0.0 } else { 0.25 })
            .collect();
        let cfg = VerletSpringConfig {
            wind_xyz: [2.0, 0.0, 0.5],
            iterations: 5,
            ..Default::default()
        };
        for _ in 0..20 {
            let mut c = VerletSpringChainsSoa {
                pos_x: &mut px,
                pos_y: &mut py,
                pos_z: &mut pz,
                prev_x: &mut ox,
                prev_y: &mut oy,
                prev_z: &mut oz,
                inv_mass: &im,
                rest_len: &rl,
            };
            step_verlet_spring_chains_soa(&mut c, &[], &cfg).expect("multi ok");
        }
        for i in 0..count {
            assert!(px[i].is_finite() && py[i].is_finite() && pz[i].is_finite());
            if i % 3 == 0 {
                assert_eq!((px[i], py[i]), ((i / 3) as f32 * 2.0, 3.0));
            } else {
                assert!(
                    (dist3([px[i], py[i], pz[i]], [px[i - 1], py[i - 1], pz[i - 1]]) - 0.25).abs()
                        < 1e-2
                );
            }
        }
    }
}

#[test]
fn verlet_sphere_collider_pushes_hair_outside_head_and_shoulders() {
    let (mut px, mut py, mut pz) = (
        [0.0, 0.02, 0.03, 0.04, 0.05],
        [1.80, 1.55, 1.30, 1.05, 0.80],
        [0.0; 5],
    );
    let (mut ox, mut oy, mut oz) = (px, py, pz);
    let (im, rl) = ([0.0, 1.0, 1.0, 1.0, 1.0], [0.0, 0.25, 0.25, 0.25, 0.25]);
    let cols = [
        SphereCollider::new(0.0, 1.50, 0.0, 0.14),
        SphereCollider::new(0.18, 1.15, 0.0, 0.12),
        SphereCollider::new(-0.18, 1.15, 0.0, 0.12),
    ];
    let cfg = VerletSpringConfig {
        particle_radius: 0.02,
        iterations: 6,
        damping: 0.08,
        ..Default::default()
    };
    let mut hits = 0usize;
    for _ in 0..40 {
        let mut c = VerletSpringChainsSoa {
            pos_x: &mut px,
            pos_y: &mut py,
            pos_z: &mut pz,
            prev_x: &mut ox,
            prev_y: &mut oy,
            prev_z: &mut oz,
            inv_mass: &im,
            rest_len: &rl,
        };
        hits += step_verlet_spring_chains_soa(&mut c, &cols, &cfg)
            .expect("col ok")
            .sphere_collisions;
    }
    assert!(hits > 0);
    for i in 1..5 {
        for col in &cols {
            let d = dist3(
                [px[i], py[i], pz[i]],
                [col.center_x, col.center_y, col.center_z],
            );
            assert!(
                d >= col.radius + cfg.particle_radius - 1e-3,
                "입자 {i} 침투 d={d}"
            );
        }
    }
}

#[test]
fn verlet_floor_plane_prevents_penetration_and_bounces_with_restitution() {
    let run_drop = |restitution: f32| -> (f32, f32, usize) {
        let (mut px, mut py, mut pz, mut ox, mut oy, mut oz) =
            ([0.0], [0.40], [0.0], [0.0], [0.40], [0.0]);
        let cfg = VerletSpringConfig {
            damping: 0.0,
            floor_restitution: restitution,
            particle_radius: 0.02,
            iterations: 2,
            ..Default::default()
        };
        let (mut min_y, mut peak, mut bounced, mut hits) = (f32::INFINITY, 0.0_f32, false, 0usize);
        for _ in 0..60 {
            let mut c = VerletSpringChainsSoa {
                pos_x: &mut px,
                pos_y: &mut py,
                pos_z: &mut pz,
                prev_x: &mut ox,
                prev_y: &mut oy,
                prev_z: &mut oz,
                inv_mass: &[1.0],
                rest_len: &[0.0],
            };
            let st = step_verlet_spring_chains_soa(&mut c, &[], &cfg).expect("drop ok");
            min_y = min_y.min(py[0]);
            if st.floor_collisions > 0 {
                hits += st.floor_collisions;
                bounced = true;
            }
            if bounced {
                peak = peak.max(py[0]);
            }
        }
        (min_y, peak, hits)
    };
    let (min_b, peak_b, hits_b) = run_drop(0.75);
    let (min_d, peak_d, hits_d) = run_drop(0.0);
    assert!(min_b >= 0.02 - 1e-6 && min_d >= 0.02 - 1e-6);
    assert!(hits_b > 0 && hits_d > 0);
    assert!(peak_b > 0.15, "반발 상승 부족: {peak_b}");
    assert!((peak_d - 0.02).abs() < 1e-4, "무반발 정지 실패: {peak_d}");
}

#[test]
fn verlet_wind_deflects_cloth_chain_in_3d_direction() {
    let (mut px, mut py, mut pz) = ([0.0; 5], [2.0, 1.8, 1.6, 1.4, 1.2], [0.0; 5]);
    let (mut ox, mut oy, mut oz) = (px, py, pz);
    let (im, rl) = ([0.0, 1.0, 1.0, 1.0, 1.0], [0.0, 0.2, 0.2, 0.2, 0.2]);
    let cfg = VerletSpringConfig {
        stiffness: 1.0,
        wind_xyz: [8.0, 0.0, -4.0],
        damping: 0.08,
        iterations: 8,
        ..Default::default()
    };
    for _ in 0..90 {
        let mut c = VerletSpringChainsSoa {
            pos_x: &mut px,
            pos_y: &mut py,
            pos_z: &mut pz,
            prev_x: &mut ox,
            prev_y: &mut oy,
            prev_z: &mut oz,
            inv_mass: &im,
            rest_len: &rl,
        };
        step_verlet_spring_chains_soa(&mut c, &[], &cfg).expect("wind ok");
    }
    assert!(px[4] > 0.35 && pz[4] < -0.15 && (px[4] / -pz[4] - 2.0).abs() < 0.25);
    for i in 1..5 {
        assert!(
            (dist3([px[i], py[i], pz[i]], [px[i - 1], py[i - 1], pz[i - 1]]) - 0.2).abs() < 2e-3
        );
    }
}

#[test]
fn verlet_sanitizes_nan_inf_inputs_and_coincident_particles_safely() {
    let (mut px, mut py, mut pz) = (
        [0.0, f32::NAN, 0.0, 0.0],
        [1.5, 1.5, f32::INFINITY, 1.5],
        [0.0, 0.0, 0.0, f32::NEG_INFINITY],
    );
    let (mut ox, mut oy, mut oz) = ([0.0, f32::NAN, 0.0, 0.0], [1.5; 4], [0.0; 4]);
    let (im, rl) = ([0.0, 1.0, f32::NAN, 1.0], [0.0, 0.25, 0.25, 0.25]);
    let bad_cols = [
        SphereCollider::new(f32::NAN, 0.0, 0.0, 0.5),
        SphereCollider::new(0.0, 0.0, 0.0, -1.0),
    ];
    let mut c = VerletSpringChainsSoa {
        pos_x: &mut px,
        pos_y: &mut py,
        pos_z: &mut pz,
        prev_x: &mut ox,
        prev_y: &mut oy,
        prev_z: &mut oz,
        inv_mass: &im,
        rest_len: &rl,
    };
    let st = step_verlet_spring_chains_soa(&mut c, &bad_cols, &VerletSpringConfig::default())
        .expect("nan ok");
    assert_eq!(st.sanitized_particles, 3);
    assert!(st.total_kinetic_energy.is_finite());
    for i in 0..4 {
        assert!(px[i].is_finite() && py[i].is_finite() && pz[i].is_finite());
        assert!(ox[i].is_finite() && oy[i].is_finite() && oz[i].is_finite());
    }
}

#[test]
fn verlet_rejects_mismatched_slices_and_invalid_config() {
    let (mut px, mut py_bad, mut py, mut pz) = ([0.0; 2], [0.0; 1], [0.0; 2], [0.0; 2]);
    let (mut ox, mut oy, mut oz) = ([0.0; 2], [0.0; 2], [0.0; 2]);
    let (im, rl) = ([0.0, 1.0], [0.0, 0.2]);
    let mut c_bad = VerletSpringChainsSoa {
        pos_x: &mut px,
        pos_y: &mut py_bad,
        pos_z: &mut pz,
        prev_x: &mut ox,
        prev_y: &mut oy,
        prev_z: &mut oz,
        inv_mass: &im,
        rest_len: &rl,
    };
    assert_eq!(
        step_verlet_spring_chains_soa(&mut c_bad, &[], &VerletSpringConfig::default()),
        Err(DrawingCoreError::BufferLengthMismatch {
            expected: 2,
            actual: 1
        })
    );
    let mut c = VerletSpringChainsSoa {
        pos_x: &mut px,
        pos_y: &mut py,
        pos_z: &mut pz,
        prev_x: &mut ox,
        prev_y: &mut oy,
        prev_z: &mut oz,
        inv_mass: &im,
        rest_len: &rl,
    };
    for (cfg, name) in [
        (
            VerletSpringConfig {
                iterations: 0,
                ..Default::default()
            },
            "iterations",
        ),
        (
            VerletSpringConfig {
                iterations: 9,
                ..Default::default()
            },
            "iterations",
        ),
        (
            VerletSpringConfig {
                dt: 0.0,
                ..Default::default()
            },
            "dt",
        ),
        (
            VerletSpringConfig {
                stiffness: 1.5,
                ..Default::default()
            },
            "stiffness",
        ),
        (
            VerletSpringConfig {
                damping: -0.1,
                ..Default::default()
            },
            "damping",
        ),
    ] {
        assert_eq!(
            step_verlet_spring_chains_soa(&mut c, &[], &cfg),
            Err(DrawingCoreError::InvalidParameter { name })
        );
    }
}

// ============================================================================
// 2. 15관절 3D 손가락 FABRIK IK 솔버 테스트 (8건)
// ============================================================================
