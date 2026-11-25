use super::*;

/// 가상 작업실 청취자/카메라 프레임 및 음향 감쇠 환경 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AtelierListenerPose {
    pub position: [f32; 3],
    pub forward: [f32; 3],
    pub up: [f32; 3],
    pub head_shadow_lpf_hz: f32,
    pub air_absorption_per_m: f32,
}

impl Default for AtelierListenerPose {
    fn default() -> Self {
        Self {
            position: [0.0, 1.6, 0.0],
            forward: [0.0, 0.0, -1.0],
            up: [0.0, 1.0, 0.0],
            head_shadow_lpf_hz: 1_200.0,
            air_absorption_per_m: 0.02,
        }
    }
}

/// 가상 작업실 3D 공간 음원 정의.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AtelierAudioSource {
    pub position: [f32; 3],
    pub base_gain: f32,
    pub ref_distance: f32,
    pub max_distance: f32,
    pub occlusion_factor: f32,
}

/// 음원별 Constant-Power HRTF 팬·거리 감쇠·로우패스 차단율 평가 결과.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AtelierAudioEval {
    pub left_gain: f32,
    pub right_gain: f32,
    pub distance_attenuation: f32,
    pub pan: f32,
    pub lowpass_cutoff_hz: f32,
    pub lowpass_damping: f32,
}

/// 물리 광원 종류 (`Point`: 역제곱 점광원, `Directional`: 거리 불변 방향광원).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum AtelierLightKind {
    Point = 0,
    Directional = 1,
}

impl AtelierLightKind {
    #[inline]
    #[must_use]
    pub const fn from_u32(v: u32) -> Option<Self> {
        match v {
            0 => Some(Self::Point),
            1 => Some(Self::Directional),
            _ => None,
        }
    }
}

/// 가상 스튜디오 물리 광원 정의.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AtelierStageLight {
    pub kind: AtelierLightKind,
    /// `Point`: 월드 위치, `Directional`: 표면에서 광원으로 향하는 방향 벡터.
    pub position_or_dir: [f32; 3],
    pub color_rgb: [f32; 3],
    pub intensity: f32,
    pub radius: f32,
}

/// `AtelierCast` 캐릭터/소품 표면 조도·림라이트 수신 샘플.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AtelierCastSample {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub rim_power: f32,
    pub rim_strength: f32,
}

/// 샘플별 물리 확산 조도 및 실루엣 림라이트 평가 결과.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AtelierLightingEval {
    pub irradiance_rgb: [f32; 3],
    pub rim_rgb: [f32; 3],
    pub total_illuminance: f32,
    pub rim_intensity: f32,
}

/// 공간 음향·물리 광원 일괄 평가 통계.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct StageAcousticsLightingStats {
    pub evaluated_sources: usize,
    pub evaluated_samples: usize,
    pub active_lights: usize,
    pub peak_audio_gain: f32,
    pub peak_illuminance: f32,
}

#[inline]
fn rec709_luminance(rgb: [f32; 3]) -> f32 {
    0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/// 4개 음원을 고정 `[f32; 4]` 레인으로 일괄 HRTF·역제곱 감쇠·로우패스 평가한다.
#[inline]
fn eval_audio_4wide(
    src: &[AtelierAudioSource; 4],
    l_pos: [f32; 3],
    l_fwd: [f32; 3],
    l_right: [f32; 3],
    log_lpf_ratio: f32,
    air_abs: f32,
) -> [AtelierAudioEval; 4] {
    let mut out = [AtelierAudioEval::default(); 4];
    let mut dx = [0.0_f32; 4];
    let mut dy = [0.0_f32; 4];
    let mut dz = [0.0_f32; 4];
    let mut dist = [0.0_f32; 4];
    let mut atten = [0.0_f32; 4];
    let mut pan = [0.0_f32; 4];
    let mut damp = [0.0_f32; 4];

    for l in 0..4 {
        dx[l] = src[l].position[0] - l_pos[0];
        dy[l] = src[l].position[1] - l_pos[1];
        dz[l] = src[l].position[2] - l_pos[2];
        let d2 = dx[l] * dx[l] + dy[l] * dy[l] + dz[l] * dz[l];
        dist[l] = d2.sqrt();
        let ref_d = src[l].ref_distance;
        atten[l] = if dist[l] >= src[l].max_distance {
            0.0
        } else {
            let eff = dist[l].max(ref_d);
            (ref_d * ref_d) / (eff * eff)
        };
        let (lat, front) = if dist[l] > VEC_EPS {
            let inv = 1.0 / dist[l];
            let (ux, uy, uz) = (dx[l] * inv, dy[l] * inv, dz[l] * inv);
            (
                (ux * l_right[0] + uy * l_right[1] + uz * l_right[2]).clamp(-1.0, 1.0),
                (ux * l_fwd[0] + uy * l_fwd[1] + uz * l_fwd[2]).clamp(-1.0, 1.0),
            )
        } else {
            (0.0, 1.0)
        };
        pan[l] = lat;
        let rear = (0.5 * (1.0 - front)).clamp(0.0, 1.0);
        let air = (1.0 - (-dist[l] * air_abs).exp()).clamp(0.0, 1.0);
        damp[l] = (0.45 * rear + 0.35 * src[l].occlusion_factor + 0.20 * air).clamp(0.0, 1.0);
    }

    for l in 0..4 {
        let amp = src[l].base_gain * atten[l] * (1.0 - 0.75 * src[l].occlusion_factor);
        let (pan_r, pan_l) = (0.5 * (pan[l] + 1.0) * FRAC_PI_2).sin_cos();
        out[l] = AtelierAudioEval {
            left_gain: amp * pan_l,
            right_gain: amp * pan_r,
            distance_attenuation: atten[l],
            pan: pan[l],
            lowpass_cutoff_hz: OPEN_AIR_LPF_HZ * (damp[l] * log_lpf_ratio).exp(),
            lowpass_damping: damp[l],
        };
    }
    out
}

/// 4개 `AtelierCast` 표면 샘플에 대해 모든 물리 점광원/방향광원의 조도와 림라이트를 4-와이드 누적한다.
#[inline]
fn eval_lighting_4wide(
    samples: &[AtelierCastSample; 4],
    normals: &[[f32; 3]; 4],
    lights: &[AtelierStageLight],
    light_dirs: &[[f32; 3]],
    cam_pos: [f32; 3],
) -> [AtelierLightingEval; 4] {
    let mut vx = [0.0_f32; 4];
    let mut vy = [0.0_f32; 4];
    let mut vz = [0.0_f32; 4];
    let mut fresnel = [0.0_f32; 4];
    for l in 0..4 {
        let view = normalize3([
            cam_pos[0] - samples[l].position[0],
            cam_pos[1] - samples[l].position[1],
            cam_pos[2] - samples[l].position[2],
        ])
        .unwrap_or([0.0, 0.0, 1.0]);
        vx[l] = view[0];
        vy[l] = view[1];
        vz[l] = view[2];
        let ndotv = dot3(normals[l], view).clamp(0.0, 1.0);
        fresnel[l] = (1.0 - ndotv).powf(samples[l].rim_power) * samples[l].rim_strength;
    }

    let mut irr = [[0.0_f32; 3]; 4];
    let mut rim = [[0.0_f32; 3]; 4];
    for (li, light) in lights.iter().enumerate() {
        let dir_cached = light_dirs[li];
        let r2 = light.radius * light.radius;
        for l in 0..4 {
            let (ldir, atten) = match light.kind {
                AtelierLightKind::Point => {
                    let tx = light.position_or_dir[0] - samples[l].position[0];
                    let ty = light.position_or_dir[1] - samples[l].position[1];
                    let tz = light.position_or_dir[2] - samples[l].position[2];
                    let d2 = tx * tx + ty * ty + tz * tz;
                    let a = light.intensity / (d2 + r2);
                    let d = if d2 > 1e-12 {
                        let inv = 1.0 / d2.sqrt();
                        [tx * inv, ty * inv, tz * inv]
                    } else {
                        [0.0, 1.0, 0.0]
                    };
                    (d, a)
                }
                AtelierLightKind::Directional => (dir_cached, light.intensity),
            };
            let n_dot_l_raw = dot3(normals[l], ldir);
            let ndotl = n_dot_l_raw.max(0.0);
            let diff_w = atten * ndotl;
            let v_dot_l = (vx[l] * ldir[0] + vy[l] * ldir[1] + vz[l] * ldir[2]).clamp(-1.0, 1.0);
            let back_term = 0.5 * (1.0 - v_dot_l);
            let wrap = (0.5 * n_dot_l_raw + 0.5).clamp(0.0, 1.0);
            let rim_w = atten * fresnel[l] * (0.35 + 0.65 * back_term) * wrap;
            for c in 0..3 {
                irr[l][c] += light.color_rgb[c] * diff_w;
                rim[l][c] += light.color_rgb[c] * rim_w;
            }
        }
    }

    let mut out = [AtelierLightingEval::default(); 4];
    for l in 0..4 {
        let total_rgb = [
            irr[l][0] + rim[l][0],
            irr[l][1] + rim[l][1],
            irr[l][2] + rim[l][2],
        ];
        out[l] = AtelierLightingEval {
            irradiance_rgb: irr[l],
            rim_rgb: rim[l],
            total_illuminance: rec709_luminance(total_rgb),
            rim_intensity: rec709_luminance(rim[l]),
        };
    }
    out
}

/// `AtelierStage` 실시간 공간 음향 HRTF 감쇠 + 다중 점광원/방향광원 물리 조도·림라이트를 일괄 평가한다.
pub fn evaluate_stage_acoustics_and_lighting(
    listener: &AtelierListenerPose,
    audio_sources: &[AtelierAudioSource],
    lights: &[AtelierStageLight],
    cast_samples: &[AtelierCastSample],
    out_audio: &mut [AtelierAudioEval],
    out_lighting: &mut [AtelierLightingEval],
) -> Result<StageAcousticsLightingStats, DrawingCoreError> {
    if audio_sources.len() > MAX_STAGE_AUDIO_SOURCES {
        return Err(DrawingCoreError::InvalidParameter {
            name: "audio_source_count",
        });
    }
    if lights.len() > MAX_STAGE_LIGHTS {
        return Err(DrawingCoreError::InvalidParameter {
            name: "light_count",
        });
    }
    if cast_samples.len() > MAX_STAGE_CAST_SAMPLES {
        return Err(DrawingCoreError::InvalidParameter {
            name: "cast_sample_count",
        });
    }
    if out_audio.len() != audio_sources.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: audio_sources.len(),
            actual: out_audio.len(),
        });
    }
    if out_lighting.len() != cast_samples.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: cast_samples.len(),
            actual: out_lighting.len(),
        });
    }
    if !bounded_vec3(listener.position)
        || !listener.head_shadow_lpf_hz.is_finite()
        || !(200.0..=OPEN_AIR_LPF_HZ).contains(&listener.head_shadow_lpf_hz)
        || !listener.air_absorption_per_m.is_finite()
        || !(0.0..=1.0).contains(&listener.air_absorption_per_m)
    {
        return Err(DrawingCoreError::InvalidParameter { name: "listener" });
    }
    let l_fwd = normalize3(listener.forward)
        .ok_or(DrawingCoreError::InvalidParameter { name: "listener" })?;
    let l_right =
        normalize3(cross3(l_fwd, listener.up)).ok_or(DrawingCoreError::InvalidParameter {
            name: "listener_up",
        })?;

    for s in audio_sources {
        if !bounded_vec3(s.position)
            || !s.base_gain.is_finite()
            || s.base_gain < 0.0
            || !s.ref_distance.is_finite()
            || s.ref_distance <= 0.0
            || !s.max_distance.is_finite()
            || s.max_distance < s.ref_distance
            || !s.occlusion_factor.is_finite()
            || !(0.0..=1.0).contains(&s.occlusion_factor)
        {
            return Err(DrawingCoreError::InvalidParameter {
                name: "audio_source",
            });
        }
    }
    let mut light_dirs = [[0.0_f32; 3]; MAX_STAGE_LIGHTS];
    for (idx, light) in lights.iter().enumerate() {
        if !bounded_vec3(light.position_or_dir)
            || light.color_rgb.iter().any(|&c| !c.is_finite() || c < 0.0)
            || !light.intensity.is_finite()
            || light.intensity < 0.0
            || !light.radius.is_finite()
            || light.radius < 0.0
        {
            return Err(DrawingCoreError::InvalidParameter { name: "light" });
        }
        match light.kind {
            AtelierLightKind::Point => {
                if light.radius <= 0.0 {
                    return Err(DrawingCoreError::InvalidParameter {
                        name: "light_radius",
                    });
                }
            }
            AtelierLightKind::Directional => {
                light_dirs[idx] = normalize3(light.position_or_dir)
                    .ok_or(DrawingCoreError::InvalidParameter { name: "light_dir" })?;
            }
        }
    }
    for sample in cast_samples {
        if !bounded_vec3(sample.position)
            || normalize3(sample.normal).is_none()
            || !sample.rim_power.is_finite()
            || !(0.5..=16.0).contains(&sample.rim_power)
            || !sample.rim_strength.is_finite()
            || !(0.0..=8.0).contains(&sample.rim_strength)
        {
            return Err(DrawingCoreError::InvalidParameter {
                name: "cast_sample",
            });
        }
    }

    let mut stats = StageAcousticsLightingStats {
        evaluated_sources: audio_sources.len(),
        evaluated_samples: cast_samples.len(),
        active_lights: lights.len(),
        ..StageAcousticsLightingStats::default()
    };

    let log_lpf_ratio = (listener.head_shadow_lpf_hz / OPEN_AIR_LPF_HZ).ln();
    let mut si = 0usize;
    while si + 4 <= audio_sources.len() {
        let batch = [
            audio_sources[si],
            audio_sources[si + 1],
            audio_sources[si + 2],
            audio_sources[si + 3],
        ];
        let res = eval_audio_4wide(
            &batch,
            listener.position,
            l_fwd,
            l_right,
            log_lpf_ratio,
            listener.air_absorption_per_m,
        );
        for l in 0..4 {
            out_audio[si + l] = res[l];
            stats.peak_audio_gain = stats
                .peak_audio_gain
                .max(res[l].left_gain.max(res[l].right_gain));
        }
        si += 4;
    }
    while si < audio_sources.len() {
        let batch = [audio_sources[si]; 4];
        let res = eval_audio_4wide(
            &batch,
            listener.position,
            l_fwd,
            l_right,
            log_lpf_ratio,
            listener.air_absorption_per_m,
        );
        out_audio[si] = res[0];
        stats.peak_audio_gain = stats
            .peak_audio_gain
            .max(res[0].left_gain.max(res[0].right_gain));
        si += 1;
    }

    let mut ci = 0usize;
    while ci + 4 <= cast_samples.len() {
        let batch = [
            cast_samples[ci],
            cast_samples[ci + 1],
            cast_samples[ci + 2],
            cast_samples[ci + 3],
        ];
        let norms = [
            normalize3(batch[0].normal).unwrap_or([0.0, 1.0, 0.0]),
            normalize3(batch[1].normal).unwrap_or([0.0, 1.0, 0.0]),
            normalize3(batch[2].normal).unwrap_or([0.0, 1.0, 0.0]),
            normalize3(batch[3].normal).unwrap_or([0.0, 1.0, 0.0]),
        ];
        let res = eval_lighting_4wide(
            &batch,
            &norms,
            lights,
            &light_dirs[..lights.len()],
            listener.position,
        );
        for l in 0..4 {
            out_lighting[ci + l] = res[l];
            stats.peak_illuminance = stats.peak_illuminance.max(res[l].total_illuminance);
        }
        ci += 4;
    }
    while ci < cast_samples.len() {
        let batch = [cast_samples[ci]; 4];
        let n0 = normalize3(batch[0].normal).unwrap_or([0.0, 1.0, 0.0]);
        let res = eval_lighting_4wide(
            &batch,
            &[n0; 4],
            lights,
            &light_dirs[..lights.len()],
            listener.position,
        );
        out_lighting[ci] = res[0];
        stats.peak_illuminance = stats.peak_illuminance.max(res[0].total_illuminance);
        ci += 1;
    }
    Ok(stats)
}
