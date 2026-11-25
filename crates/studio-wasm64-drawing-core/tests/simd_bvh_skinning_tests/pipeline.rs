use super::*;

#[test]
fn end_to_end_vrm_skinning_to_morton_bvh_culling_pipeline() {
    // 스키닝된 VRM 정점 160개를 40개 삼각형 AABB로 투영해 Morton BVH 프러스텀 컬링 검증
    let tri_count = 40usize;
    let v_count = tri_count * 3;
    let bones = [mat4_translation(12.0, -4.0, 0.0), mat4_rot_z(0.35)];
    let px: Vec<f32> = (0..v_count).map(|i| (i % 20) as f32 * 3.0).collect();
    let py: Vec<f32> = (0..v_count).map(|i| (i / 20) as f32 * 4.0).collect();
    let pz = vec![0.0_f32; v_count];
    let (nx, ny, nz) = (vec![0.0; v_count], vec![0.0; v_count], vec![1.0; v_count]);
    let j0: Vec<u16> = (0..v_count).map(|i| (i % 2) as u16).collect();
    let jz = vec![0u16; v_count];
    let (w0, zw) = (vec![1.0_f32; v_count], vec![0.0_f32; v_count]);
    let input = VrmMeshSoaInput {
        pos_x: &px,
        pos_y: &py,
        pos_z: &pz,
        norm_x: &nx,
        norm_y: &ny,
        norm_z: &nz,
        joints: [&j0, &jz, &jz, &jz],
        weights: [&w0, &zw, &zw, &zw],
    };
    let (mut ox, mut oy, mut oz) = (vec![0.0; v_count], vec![0.0; v_count], vec![0.0; v_count]);
    let (mut onx, mut ony, mut onz) = (vec![0.0; v_count], vec![0.0; v_count], vec![0.0; v_count]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox,
        pos_y: &mut oy,
        pos_z: &mut oz,
        norm_x: &mut onx,
        norm_y: &mut ony,
        norm_z: &mut onz,
    };
    skin_vrm_mesh_4bone_soa(&input, &bones, &mut out).expect("e2e skin ok");

    let mut tri_aabbs = Vec::with_capacity(tri_count);
    for t in 0..tri_count {
        let i0 = t * 3;
        let min_x = ox[i0].min(ox[i0 + 1]).min(ox[i0 + 2]);
        let max_x = ox[i0].max(ox[i0 + 1]).max(ox[i0 + 2]);
        let min_y = oy[i0].min(oy[i0 + 1]).min(oy[i0 + 2]);
        let max_y = oy[i0].max(oy[i0 + 1]).max(oy[i0 + 2]);
        tri_aabbs.push(Aabb2D::new(min_x, min_y, max_x, max_y));
    }
    let bvh = build_morton_bvh_2d(&tri_aabbs).expect("e2e bvh ok");
    let view = Aabb2D::new(10.0, 0.0, 45.0, 20.0);
    let mut bvh_hits = query_morton_bvh_aabb(&bvh, view).expect("e2e query ok");
    bvh_hits.sort_unstable();
    let brute: Vec<u32> = tri_aabbs
        .iter()
        .enumerate()
        .filter_map(|(i, b)| b.intersects(&view).then_some(i as u32))
        .collect();
    assert_eq!(bvh_hits, brute);
    assert!(!bvh_hits.is_empty());
}
