use super::*;

#[test]
fn acoustics_inverse_square_attenuation_and_max_distance_cutoff() {
    let listener = AtelierListenerPose {
        position: [0.0, 0.0, 0.0],
        forward: [0.0, 0.0, -1.0],
        up: [0.0, 1.0, 0.0],
        head_shadow_lpf_hz: 1_200.0,
        air_absorption_per_m: 0.0,
    };
    let sources = [
        AtelierAudioSource {
            position: [0.0, 0.0, -0.5],
            base_gain: 1.0,
            ref_distance: 1.0,
            max_distance: 20.0,
            occlusion_factor: 0.0,
        },
        AtelierAudioSource {
            position: [0.0, 0.0, -2.0],
            base_gain: 1.0,
            ref_distance: 1.0,
            max_distance: 20.0,
            occlusion_factor: 0.0,
        },
        AtelierAudioSource {
            position: [0.0, 0.0, -4.0],
            base_gain: 1.0,
            ref_distance: 1.0,
            max_distance: 20.0,
            occlusion_factor: 0.0,
        },
        AtelierAudioSource {
            position: [0.0, 0.0, -25.0],
            base_gain: 1.0,
            ref_distance: 1.0,
            max_distance: 20.0,
            occlusion_factor: 0.0,
        },
    ];
    let mut out_a = [AtelierAudioEval::default(); 4];
    evaluate_stage_acoustics_and_lighting(&listener, &sources, &[], &[], &mut out_a, &mut [])
        .expect("eval");
    assert!((out_a[0].distance_attenuation - 1.0).abs() < 1e-6);
    assert!((out_a[1].distance_attenuation - 0.25).abs() < 1e-6);
    assert!((out_a[2].distance_attenuation - 0.0625).abs() < 1e-6);
    assert_eq!(out_a[3].distance_attenuation, 0.0);
    assert_eq!(out_a[3].left_gain, 0.0);
    assert_eq!(out_a[3].right_gain, 0.0);
}

#[test]
fn acoustics_constant_power_hrtf_pan_preserves_energy_across_360_azimuth() {
    let listener = AtelierListenerPose::default();
    let mut sources = Vec::new();
    for step in 0..16 {
        let ang = (step as f32 / 16.0) * 2.0 * PI;
        let (s, c) = ang.sin_cos();
        sources.push(AtelierAudioSource {
            position: [
                listener.position[0] + 2.0 * s,
                listener.position[1],
                listener.position[2] - 2.0 * c,
            ],
            base_gain: 0.8,
            ref_distance: 1.0,
            max_distance: 50.0,
            occlusion_factor: 0.0,
        });
    }
    let mut out = vec![AtelierAudioEval::default(); sources.len()];
    evaluate_stage_acoustics_and_lighting(&listener, &sources, &[], &[], &mut out, &mut [])
        .expect("eval");
    let expected_amp = 0.8 * 0.25;
    for a in &out {
        let power = (a.left_gain * a.left_gain + a.right_gain * a.right_gain).sqrt();
        assert!((power - expected_amp).abs() < 1e-5);
    }
    assert!(out[4].right_gain > out[4].left_gain && (out[4].pan - 1.0).abs() < 1e-5);
    assert!(out[12].left_gain > out[12].right_gain && (out[12].pan + 1.0).abs() < 1e-5);
    assert!((out[0].left_gain - out[0].right_gain).abs() < 1e-5);
}

#[test]
fn acoustics_rear_pinna_shadow_occlusion_and_air_absorption_lower_lpf_monotonically() {
    let listener = AtelierListenerPose::default();
    let base = AtelierAudioSource {
        position: [0.0, 1.6, -2.0],
        base_gain: 1.0,
        ref_distance: 1.0,
        max_distance: 100.0,
        occlusion_factor: 0.0,
    };
    let sources = [
        base,
        AtelierAudioSource {
            position: [2.0, 1.6, 0.0],
            ..base
        },
        AtelierAudioSource {
            position: [0.0, 1.6, 2.0],
            ..base
        },
        AtelierAudioSource {
            position: [0.0, 1.6, 2.0],
            occlusion_factor: 1.0,
            ..base
        },
        AtelierAudioSource {
            position: [0.0, 1.6, -30.0],
            ..base
        },
    ];
    let mut out = [AtelierAudioEval::default(); 5];
    evaluate_stage_acoustics_and_lighting(&listener, &sources, &[], &[], &mut out, &mut [])
        .expect("eval");
    assert!(out[0].lowpass_cutoff_hz > out[1].lowpass_cutoff_hz);
    assert!(out[1].lowpass_cutoff_hz > out[2].lowpass_cutoff_hz);
    assert!(out[2].lowpass_cutoff_hz > out[3].lowpass_cutoff_hz);
    assert!(out[0].lowpass_cutoff_hz > out[4].lowpass_cutoff_hz);
    assert!(out[3].left_gain < out[2].left_gain);
}

#[test]
fn lighting_point_inverse_square_and_directional_distance_invariance() {
    let listener = AtelierListenerPose::default();
    let pt_light = AtelierStageLight {
        kind: AtelierLightKind::Point,
        position_or_dir: [0.0, 3.0, 0.0],
        color_rgb: [1.0, 1.0, 1.0],
        intensity: 10.0,
        radius: 0.5,
    };
    let dir_light = AtelierStageLight {
        kind: AtelierLightKind::Directional,
        position_or_dir: [0.0, 1.0, 0.0],
        color_rgb: [0.5, 0.7, 1.0],
        intensity: 2.0,
        radius: 0.0,
    };
    let samples = [
        AtelierCastSample {
            position: [0.0, 2.0, 0.0],
            normal: [0.0, 1.0, 0.0],
            rim_power: 3.0,
            rim_strength: 0.0,
        },
        AtelierCastSample {
            position: [0.0, 0.0, 0.0],
            normal: [0.0, 1.0, 0.0],
            rim_power: 3.0,
            rim_strength: 0.0,
        },
    ];
    let mut out_pt = [AtelierLightingEval::default(); 2];
    let mut out_dir = [AtelierLightingEval::default(); 2];
    evaluate_stage_acoustics_and_lighting(
        &listener,
        &[],
        &[pt_light],
        &samples,
        &mut [],
        &mut out_pt,
    )
    .expect("pt");
    evaluate_stage_acoustics_and_lighting(
        &listener,
        &[],
        &[dir_light],
        &samples,
        &mut [],
        &mut out_dir,
    )
    .expect("dir");
    assert!((out_pt[0].irradiance_rgb[0] - 8.0).abs() < 1e-5);
    assert!((out_pt[1].irradiance_rgb[0] - (10.0 / 9.25)).abs() < 1e-5);
    assert_eq!(out_dir[0].irradiance_rgb, out_dir[1].irradiance_rgb);
    assert!((out_dir[0].irradiance_rgb[0] - 1.0).abs() < 1e-5);
}

#[test]
fn lighting_cast_rim_peaks_on_backlit_silhouette_and_vanishes_head_on() {
    let listener = AtelierListenerPose {
        position: [0.0, 1.5, 4.0],
        forward: [0.0, 0.0, -1.0],
        up: [0.0, 1.0, 0.0],
        ..Default::default()
    };
    let backlight = AtelierStageLight {
        kind: AtelierLightKind::Directional,
        position_or_dir: [0.2, 0.0, -1.0],
        color_rgb: [1.0, 0.9, 0.8],
        intensity: 2.0,
        radius: 0.0,
    };
    let frontlight = AtelierStageLight {
        kind: AtelierLightKind::Directional,
        position_or_dir: [0.2, 0.0, 1.0],
        color_rgb: [1.0, 0.9, 0.8],
        intensity: 2.0,
        radius: 0.0,
    };
    let samples = [
        AtelierCastSample {
            position: [0.0, 1.5, 0.0],
            normal: [0.0, 0.0, 1.0],
            rim_power: 3.0,
            rim_strength: 1.0,
        },
        AtelierCastSample {
            position: [0.0, 1.5, 0.0],
            normal: [1.0, 0.0, 0.0],
            rim_power: 3.0,
            rim_strength: 1.0,
        },
    ];
    let mut out_back = [AtelierLightingEval::default(); 2];
    let mut out_front = [AtelierLightingEval::default(); 2];
    evaluate_stage_acoustics_and_lighting(
        &listener,
        &[],
        &[backlight],
        &samples,
        &mut [],
        &mut out_back,
    )
    .expect("back");
    evaluate_stage_acoustics_and_lighting(
        &listener,
        &[],
        &[frontlight],
        &samples,
        &mut [],
        &mut out_front,
    )
    .expect("front");
    assert!(out_back[0].rim_intensity < 1e-6);
    assert!(out_back[1].rim_intensity > 0.5);
    assert!(out_back[1].rim_intensity > out_front[1].rim_intensity * 2.0);
}

#[test]
fn acoustics_and_lighting_4wide_batch_matches_scalar_tail_bit_exact() {
    let listener = AtelierListenerPose::default();
    let lights = [
        AtelierStageLight {
            kind: AtelierLightKind::Point,
            position_or_dir: [2.0, 3.0, -2.0],
            color_rgb: [1.0, 0.8, 0.6],
            intensity: 12.0,
            radius: 0.4,
        },
        AtelierStageLight {
            kind: AtelierLightKind::Directional,
            position_or_dir: [-1.0, 2.0, 1.0],
            color_rgb: [0.4, 0.6, 1.0],
            intensity: 1.2,
            radius: 0.0,
        },
    ];
    let sources: Vec<_> = (0..7)
        .map(|i| AtelierAudioSource {
            position: [-3.0 + i as f32, 1.6, -2.0 - 0.5 * i as f32],
            base_gain: 0.5 + 0.1 * i as f32,
            ref_distance: 1.0,
            max_distance: 40.0,
            occlusion_factor: (i as f32) * 0.12,
        })
        .collect();
    let samples: Vec<_> = (0..7)
        .map(|i| AtelierCastSample {
            position: [-2.0 + 0.7 * i as f32, 1.2, -3.0],
            normal: [(i as f32 - 3.0) * 0.25, 0.5, 0.8],
            rim_power: 2.5,
            rim_strength: 0.9,
        })
        .collect();
    let mut batch_a = vec![AtelierAudioEval::default(); 7];
    let mut batch_l = vec![AtelierLightingEval::default(); 7];
    evaluate_stage_acoustics_and_lighting(
        &listener,
        &sources,
        &lights,
        &samples,
        &mut batch_a,
        &mut batch_l,
    )
    .expect("batch");
    for i in 0..7 {
        let mut sa = [AtelierAudioEval::default(); 1];
        let mut sl = [AtelierLightingEval::default(); 1];
        evaluate_stage_acoustics_and_lighting(
            &listener,
            &sources[i..=i],
            &lights,
            &samples[i..=i],
            &mut sa,
            &mut sl,
        )
        .expect("single");
        assert_eq!(batch_a[i], sa[0]);
        assert_eq!(batch_l[i], sl[0]);
    }
}

#[test]
fn acoustics_and_lighting_rejects_degenerate_inputs_without_partial_write() {
    let bad_listener = AtelierListenerPose {
        forward: [0.0, 1.0, 0.0],
        up: [0.0, 1.0, 0.0],
        ..Default::default()
    };
    let src = [AtelierAudioSource {
        position: [0.0, 1.6, -2.0],
        base_gain: 1.0,
        ref_distance: 1.0,
        max_distance: 10.0,
        occlusion_factor: 0.0,
    }];
    let sentinel = AtelierAudioEval {
        left_gain: 7.0,
        ..Default::default()
    };
    let mut out_a = [sentinel];
    assert!(evaluate_stage_acoustics_and_lighting(
        &bad_listener,
        &src,
        &[],
        &[],
        &mut out_a,
        &mut []
    )
    .is_err());
    assert_eq!(out_a[0], sentinel);
    assert!(evaluate_stage_acoustics_and_lighting(
        &AtelierListenerPose::default(),
        &src,
        &[],
        &[],
        &mut [],
        &mut []
    )
    .is_err());
}
