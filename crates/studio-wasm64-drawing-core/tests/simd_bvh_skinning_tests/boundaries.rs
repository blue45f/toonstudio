use super::*;

#[test]
fn bvh_query_rejects_out_of_range_public_leaf_metadata_without_panicking() {
    let bounds = Aabb2D::new(0.0, 0.0, 1.0, 1.0);
    let mut bvh = build_morton_bvh_2d(&[bounds]).unwrap();
    bvh.nodes[0].left_or_first = u32::MAX;
    assert!(query_morton_bvh_aabb(&bvh, bounds).is_err());
}

#[test]
fn bvh_query_rejects_missing_public_nodes_instead_of_silent_empty_hits() {
    let bounds = Aabb2D::new(0.0, 0.0, 1.0, 1.0);
    let mut bvh = build_morton_bvh_2d(&[bounds]).unwrap();
    bvh.nodes.clear();
    assert!(query_morton_bvh_aabb(&bvh, bounds).is_err());
}

#[test]
fn skinning_rejects_finite_overflow_before_writing_any_output() {
    let positions = [1.0, 1.0, 1.0, 1.0, f32::MAX];
    let zero = [0.0; 5];
    let one = [1.0; 5];
    let joints = [0; 5];
    let input = VrmMeshSoaInput {
        pos_x: &positions,
        pos_y: &zero,
        pos_z: &zero,
        norm_x: &one,
        norm_y: &zero,
        norm_z: &zero,
        joints: [&joints; 4],
        weights: [&one, &zero, &zero, &zero],
    };
    let mut matrix = IDENTITY_MAT4;
    matrix[0] = 2.0;
    let mut px = [17.0; 5];
    let mut py = [18.0; 5];
    let mut pz = [19.0; 5];
    let mut nx = [20.0; 5];
    let mut ny = [21.0; 5];
    let mut nz = [22.0; 5];
    let result = skin_vrm_mesh_4bone_soa(
        &input,
        &[matrix],
        &mut VrmMeshSoaOutput {
            pos_x: &mut px,
            pos_y: &mut py,
            pos_z: &mut pz,
            norm_x: &mut nx,
            norm_y: &mut ny,
            norm_z: &mut nz,
        },
    );
    assert!(result.is_err());
    assert_eq!(
        [px, py, pz, nx, ny, nz],
        [[17.0; 5], [18.0; 5], [19.0; 5], [20.0; 5], [21.0; 5], [22.0; 5]]
    );
}

#[test]
fn bvh_query_rejects_public_back_edges_and_duplicate_children() {
    let bounds = Aabb2D::new(0.0, 0.0, 1.0, 1.0);
    let original = build_morton_bvh_2d(&[bounds; 5]).unwrap();
    for (left, right) in [(0, 1), (1, 1), (1, u32::MAX)] {
        let mut bvh = original.clone();
        bvh.nodes[0].left_or_first = left;
        bvh.nodes[0].right_child = right;
        assert!(query_morton_bvh_aabb(&bvh, bounds).is_err());
    }
}

#[test]
fn bvh_query_rejects_invalid_root_bounds_before_pruning() {
    let bounds = Aabb2D::new(0.0, 0.0, 1.0, 1.0);
    let mut bvh = build_morton_bvh_2d(&[bounds]).unwrap();
    bvh.nodes[0].bounds.min_x = f32::NAN;
    assert!(query_morton_bvh_aabb(&bvh, bounds).is_err());
}
