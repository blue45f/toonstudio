use super::hiz::AtelierHiZPyramid;
use super::*;

/// 클립 공간 깊이 규약 (`NegOneToOne`: `z ∈ [-w, w]`, `ZeroToOne`: `z ∈ [0, w]`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum StageDepthRange {
    NegOneToOne = 0,
    ZeroToOne = 1,
}

impl StageDepthRange {
    #[inline]
    #[must_use]
    pub const fn from_u32(v: u32) -> Option<Self> {
        match v {
            0 => Some(Self::NegOneToOne),
            1 => Some(Self::ZeroToOne),
            _ => None,
        }
    }
}

/// `AtelierStage` 3D 씬 오브젝트 경계 상자(AABB) 및 차폐물 여부 정의.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StageObjectAabb {
    pub min: [f32; 3],
    pub max: [f32; 3],
    pub is_occluder: bool,
}

impl StageObjectAabb {
    #[inline]
    #[must_use]
    pub const fn new(min: [f32; 3], max: [f32; 3], is_occluder: bool) -> Self {
        Self {
            min,
            max,
            is_occluder,
        }
    }

    #[inline]
    fn is_valid(&self) -> bool {
        bounded_vec3(self.min)
            && bounded_vec3(self.max)
            && self.min[0] <= self.max[0]
            && self.min[1] <= self.max[1]
            && self.min[2] <= self.max[2]
    }
}

/// 프러스텀 + Hi-Z 컬링 및 LOD 0..3 거리 경계 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StageCullingConfig {
    /// 열 우선(column-major) 4×4 `Projection * View` 행렬.
    pub view_proj: [f32; 16],
    /// 카메라 월드 위치(미터). LOD 거리 및 차폐물 전면 판정에 사용한다.
    pub camera_pos: [f32; 3],
    /// LOD 0→1, 1→2, 2→3 전환 거리 임계치(미터, 엄격 증가).
    pub lod_distances: [f32; 3],
    /// 클립 공간 Z 깊이 범위 규약.
    pub depth_range: StageDepthRange,
    /// Hi-Z에 래스터화할 최대 대형 근접 차폐물 수 (`1..=MAX_STAGE_OCCLUDERS`).
    pub max_occluders: usize,
}

impl StageCullingConfig {
    #[inline]
    #[must_use]
    pub const fn new(view_proj: [f32; 16], camera_pos: [f32; 3]) -> Self {
        Self {
            view_proj,
            camera_pos,
            lod_distances: [10.0, 25.0, 60.0],
            depth_range: StageDepthRange::NegOneToOne,
            max_occluders: MAX_STAGE_OCCLUDERS,
        }
    }
}

/// 프러스텀·Hi-Z 컬링 실행 통계(제로 할당 경로 공용).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct StageCullingStats {
    pub visible_count: usize,
    pub frustum_culled_count: usize,
    pub occlusion_culled_count: usize,
    pub occluders_rasterized: usize,
    pub lod_counts: [usize; 4],
}

/// 프러스텀·Hi-Z 컬링 전체 결과 (`visible_indices` 및 `visible_lods` 포함).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StageCullingResult {
    pub visible_indices: Vec<u32>,
    pub visible_lods: Vec<u8>,
    pub frustum_culled_count: usize,
    pub occlusion_culled_count: usize,
    pub occluders_rasterized: usize,
    pub lod_counts: [usize; 4],
}

/// 오른손 좌표계 원근 카메라 `Projection * View` 열 우선 4×4 행렬을 생성한다.
#[allow(clippy::too_many_arguments)]
pub fn build_stage_view_proj_rh(
    eye: [f32; 3],
    target: [f32; 3],
    up: [f32; 3],
    fov_y_rad: f32,
    aspect: f32,
    near: f32,
    far: f32,
    depth_range: StageDepthRange,
) -> Result<[f32; 16], DrawingCoreError> {
    if !bounded_vec3(eye) || !bounded_vec3(target) || !bounded_vec3(up) {
        return Err(DrawingCoreError::InvalidParameter { name: "camera" });
    }
    if !fov_y_rad.is_finite()
        || !(0.05..=3.05).contains(&fov_y_rad)
        || !aspect.is_finite()
        || !(0.1..=10.0).contains(&aspect)
        || !near.is_finite()
        || !far.is_finite()
        || near <= 1e-4
        || far <= near
    {
        return Err(DrawingCoreError::InvalidParameter { name: "projection" });
    }
    let fwd = normalize3([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]])
        .ok_or(DrawingCoreError::InvalidParameter { name: "camera" })?;
    let right = normalize3(cross3(fwd, up))
        .ok_or(DrawingCoreError::InvalidParameter { name: "camera_up" })?;
    let true_up = cross3(right, fwd);
    let f = 1.0 / (0.5 * fov_y_rad).tan();
    let inv_nf = 1.0 / (near - far);
    let (p22, p32) = match depth_range {
        StageDepthRange::NegOneToOne => ((far + near) * inv_nf, (2.0 * far * near) * inv_nf),
        StageDepthRange::ZeroToOne => (far * inv_nf, (far * near) * inv_nf),
    };
    let v = [
        right[0],
        true_up[0],
        -fwd[0],
        0.0,
        right[1],
        true_up[1],
        -fwd[1],
        0.0,
        right[2],
        true_up[2],
        -fwd[2],
        0.0,
        -dot3(right, eye),
        -dot3(true_up, eye),
        dot3(fwd, eye),
        1.0,
    ];
    let p = [
        f / aspect,
        0.0,
        0.0,
        0.0,
        0.0,
        f,
        0.0,
        0.0,
        0.0,
        0.0,
        p22,
        -1.0,
        0.0,
        0.0,
        p32,
        0.0,
    ];
    let mut out = [0.0_f32; 16];
    for col in 0..4 {
        for row in 0..4 {
            out[col * 4 + row] = p[row] * v[col * 4]
                + p[4 + row] * v[col * 4 + 1]
                + p[8 + row] * v[col * 4 + 2]
                + p[12 + row] * v[col * 4 + 3];
        }
    }
    Ok(out)
}

fn extract_frustum_planes(
    m: &[f32; 16],
    depth_range: StageDepthRange,
) -> Result<[[f32; 4]; 6], DrawingCoreError> {
    if m.iter().any(|v| !v.is_finite()) {
        return Err(DrawingCoreError::InvalidParameter { name: "view_proj" });
    }
    let r0 = [m[0], m[4], m[8], m[12]];
    let r1 = [m[1], m[5], m[9], m[13]];
    let r2 = [m[2], m[6], m[10], m[14]];
    let r3 = [m[3], m[7], m[11], m[15]];
    let add = |a: [f32; 4], b: [f32; 4]| [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
    let sub = |a: [f32; 4], b: [f32; 4]| [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
    let raw = [
        add(r3, r0),
        sub(r3, r0),
        add(r3, r1),
        sub(r3, r1),
        match depth_range {
            StageDepthRange::NegOneToOne => add(r3, r2),
            StageDepthRange::ZeroToOne => r2,
        },
        sub(r3, r2),
    ];
    let mut planes = [[0.0_f32; 4]; 6];
    for i in 0..6 {
        let len_sq = raw[i][0] * raw[i][0] + raw[i][1] * raw[i][1] + raw[i][2] * raw[i][2];
        if !len_sq.is_finite() || len_sq <= 1e-12 {
            return Err(DrawingCoreError::InvalidParameter { name: "view_proj" });
        }
        let inv = 1.0 / len_sq.sqrt();
        planes[i] = [
            raw[i][0] * inv,
            raw[i][1] * inv,
            raw[i][2] * inv,
            raw[i][3] * inv,
        ];
    }
    Ok(planes)
}

/// 4개 AABB를 고정 `[f32; 4]` 레인으로 동시 6평면 프러스텀 p-정점 판정한다(false-negative 0건).
#[inline]
fn test_aabb4_frustum(
    min_x: [f32; 4],
    min_y: [f32; 4],
    min_z: [f32; 4],
    max_x: [f32; 4],
    max_y: [f32; 4],
    max_z: [f32; 4],
    planes: &[[f32; 4]; 6],
) -> [bool; 4] {
    let mut inside = [true; 4];
    for p in planes {
        let (a, b, c, d) = (p[0], p[1], p[2], p[3]);
        for l in 0..4 {
            let px = if a >= 0.0 { max_x[l] } else { min_x[l] };
            let py = if b >= 0.0 { max_y[l] } else { min_y[l] };
            let pz = if c >= 0.0 { max_z[l] } else { min_z[l] };
            inside[l] &= a * px + b * py + c * pz + d >= -FRUSTUM_EPS;
        }
    }
    inside
}

#[inline]
fn select_aabb_lod(aabb: &StageObjectAabb, cam_pos: [f32; 3], lod_sq: [f32; 3]) -> u8 {
    let cx = cam_pos[0].clamp(aabb.min[0], aabb.max[0]);
    let cy = cam_pos[1].clamp(aabb.min[1], aabb.max[1]);
    let cz = cam_pos[2].clamp(aabb.min[2], aabb.max[2]);
    let dx = cam_pos[0] - cx;
    let dy = cam_pos[1] - cy;
    let dz = cam_pos[2] - cz;
    let dist_sq = dx * dx + dy * dy + dz * dz;
    if dist_sq <= lod_sq[0] {
        0
    } else if dist_sq <= lod_sq[1] {
        1
    } else if dist_sq <= lod_sq[2] {
        2
    } else {
        3
    }
}

/// 제로 할당 슬라이스 출력용 6평면 프러스텀 + 64×36 Hi-Z 차폐 컬링 커널.
pub fn cull_scene_frustum_and_hiz_into(
    objects: &[StageObjectAabb],
    config: &StageCullingConfig,
    out_visible_indices: &mut [u32],
    out_visible_lods: &mut [u8],
) -> Result<StageCullingStats, DrawingCoreError> {
    let n = objects.len();
    if n > MAX_STAGE_OBJECTS {
        return Err(DrawingCoreError::InvalidParameter {
            name: "object_count",
        });
    }
    if out_visible_indices.len() < n {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: n,
            actual: out_visible_indices.len(),
        });
    }
    if out_visible_lods.len() < n {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: n,
            actual: out_visible_lods.len(),
        });
    }
    if !bounded_vec3(config.camera_pos) {
        return Err(DrawingCoreError::InvalidParameter { name: "camera_pos" });
    }
    let ld = config.lod_distances;
    if !ld[0].is_finite()
        || !ld[1].is_finite()
        || !ld[2].is_finite()
        || ld[0] <= 0.0
        || ld[1] <= ld[0]
        || ld[2] <= ld[1]
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "lod_distances",
        });
    }
    if config.max_occluders == 0 || config.max_occluders > MAX_STAGE_OCCLUDERS {
        return Err(DrawingCoreError::InvalidParameter {
            name: "max_occluders",
        });
    }
    let planes = extract_frustum_planes(&config.view_proj, config.depth_range)?;
    for obj in objects {
        if !obj.is_valid() {
            return Err(DrawingCoreError::InvalidParameter {
                name: "object_aabb",
            });
        }
    }

    let mut stats = StageCullingStats::default();
    if n == 0 {
        return Ok(stats);
    }

    let mut frustum_pass_count = 0usize;
    let mut top_occluders = [(0usize, 0.0_f32); MAX_STAGE_OCCLUDERS];
    let mut top_count = 0usize;
    let max_occ = config.max_occluders;

    let mut record_pass = |idx: usize| {
        out_visible_indices[frustum_pass_count] = idx as u32;
        frustum_pass_count += 1;
        let obj = &objects[idx];
        if obj.is_occluder {
            let sx = obj.max[0] - obj.min[0];
            let sy = obj.max[1] - obj.min[1];
            let sz = obj.max[2] - obj.min[2];
            let area_est = sx * sy + sy * sz + sz * sx;
            let cx = config.camera_pos[0].clamp(obj.min[0], obj.max[0]);
            let cy = config.camera_pos[1].clamp(obj.min[1], obj.max[1]);
            let cz = config.camera_pos[2].clamp(obj.min[2], obj.max[2]);
            let dist = ((config.camera_pos[0] - cx).powi(2)
                + (config.camera_pos[1] - cy).powi(2)
                + (config.camera_pos[2] - cz).powi(2))
            .sqrt()
            .max(0.25);
            let score = area_est / (dist * dist);
            if top_count < max_occ {
                top_occluders[top_count] = (idx, score);
                top_count += 1;
            } else {
                let mut min_slot = 0usize;
                for k in 1..max_occ {
                    if top_occluders[k].1 < top_occluders[min_slot].1 {
                        min_slot = k;
                    }
                }
                if score > top_occluders[min_slot].1 {
                    top_occluders[min_slot] = (idx, score);
                }
            }
        }
    };

    let mut i = 0usize;
    while i + 4 <= n {
        let a = [
            &objects[i],
            &objects[i + 1],
            &objects[i + 2],
            &objects[i + 3],
        ];
        let mask = test_aabb4_frustum(
            [a[0].min[0], a[1].min[0], a[2].min[0], a[3].min[0]],
            [a[0].min[1], a[1].min[1], a[2].min[1], a[3].min[1]],
            [a[0].min[2], a[1].min[2], a[2].min[2], a[3].min[2]],
            [a[0].max[0], a[1].max[0], a[2].max[0], a[3].max[0]],
            [a[0].max[1], a[1].max[1], a[2].max[1], a[3].max[1]],
            [a[0].max[2], a[1].max[2], a[2].max[2], a[3].max[2]],
            &planes,
        );
        for (lane, &kept) in mask.iter().enumerate() {
            if kept {
                record_pass(i + lane);
            } else {
                stats.frustum_culled_count += 1;
            }
        }
        i += 4;
    }
    while i < n {
        let obj = &objects[i];
        let mask = test_aabb4_frustum(
            [obj.min[0]; 4],
            [obj.min[1]; 4],
            [obj.min[2]; 4],
            [obj.max[0]; 4],
            [obj.max[1]; 4],
            [obj.max[2]; 4],
            &planes,
        );
        if mask[0] {
            record_pass(i);
        } else {
            stats.frustum_culled_count += 1;
        }
        i += 1;
    }

    let mut hiz = AtelierHiZPyramid::new_clear();
    if top_count > 0 {
        for &(occ_idx, _) in &top_occluders[..top_count] {
            if hiz.rasterize_occluder_aabb(
                &objects[occ_idx],
                &config.view_proj,
                config.camera_pos,
                config.depth_range,
            ) {
                stats.occluders_rasterized += 1;
            }
        }
        if stats.occluders_rasterized > 0 {
            hiz.build_mip_pyramid();
        }
    }

    let lod_sq = [ld[0] * ld[0], ld[1] * ld[1], ld[2] * ld[2]];
    let mut write_pos = 0usize;
    for read_pos in 0..frustum_pass_count {
        let obj_idx = out_visible_indices[read_pos] as usize;
        let obj = &objects[obj_idx];
        if stats.occluders_rasterized > 0
            && hiz.is_aabb_occluded(obj, &config.view_proj, config.depth_range)
        {
            stats.occlusion_culled_count += 1;
            continue;
        }
        let lod = select_aabb_lod(obj, config.camera_pos, lod_sq);
        out_visible_indices[write_pos] = obj_idx as u32;
        out_visible_lods[write_pos] = lod;
        stats.lod_counts[lod as usize] += 1;
        write_pos += 1;
    }
    stats.visible_count = write_pos;
    Ok(stats)
}

/// 6평면 프러스텀 + 64×36 Hi-Z 차폐 컬링 및 LOD 0..3 선택 결과를 반환하는 고수준 진입점.
pub fn cull_scene_frustum_and_hiz(
    objects: &[StageObjectAabb],
    config: &StageCullingConfig,
) -> Result<StageCullingResult, DrawingCoreError> {
    let mut visible_indices = vec![0u32; objects.len()];
    let mut visible_lods = vec![0u8; objects.len()];
    let stats =
        cull_scene_frustum_and_hiz_into(objects, config, &mut visible_indices, &mut visible_lods)?;
    visible_indices.truncate(stats.visible_count);
    visible_lods.truncate(stats.visible_count);
    Ok(StageCullingResult {
        visible_indices,
        visible_lods,
        frustum_culled_count: stats.frustum_culled_count,
        occlusion_culled_count: stats.occlusion_culled_count,
        occluders_rasterized: stats.occluders_rasterized,
        lod_counts: stats.lod_counts,
    })
}
