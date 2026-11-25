use super::*;

fn blend1(dst: [u8; 4], src: [u8; 4], mode: TileBlendMode, opacity: u8) -> [u8; 4] {
    let mut d = dst.to_vec();
    composite_tile_dirty_rect(
        &mut d,
        &src,
        1,
        1,
        DirtyRect {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
        },
        mode,
        opacity,
    )
    .expect("ok");
    [d[0], d[1], d[2], d[3]]
}

#[test]
fn blend_normal_opaque_and_half_opacity() {
    assert_eq!(
        blend1(
            [100, 100, 100, 255],
            [200, 50, 0, 255],
            TileBlendMode::Normal,
            255
        ),
        [200, 50, 0, 255]
    );
    let h = blend1(
        [100, 100, 100, 255],
        [200, 50, 0, 255],
        TileBlendMode::Normal,
        128,
    );
    assert!((i16::from(h[0]) - 150).abs() <= 1 && (i16::from(h[1]) - 75).abs() <= 1 && h[3] == 255);
}

#[test]
fn blend_multiply_identity_zero_and_midtone() {
    let b = [200, 160, 80, 255];
    assert_eq!(
        blend1(b, [255, 255, 255, 255], TileBlendMode::Multiply, 255),
        b
    );
    assert_eq!(
        blend1(b, [0, 0, 0, 255], TileBlendMode::Multiply, 255),
        [0, 0, 0, 255]
    );
    let m = blend1(b, [128, 128, 128, 255], TileBlendMode::Multiply, 255);
    assert!((i16::from(m[0]) - 100).abs() <= 1 && (i16::from(m[1]) - 80).abs() <= 1);
}

#[test]
fn blend_screen_identity_white_and_midtone() {
    let b = [100, 150, 50, 255];
    assert_eq!(blend1(b, [0, 0, 0, 255], TileBlendMode::Screen, 255), b);
    assert_eq!(
        blend1(b, [255, 255, 255, 255], TileBlendMode::Screen, 255),
        [255, 255, 255, 255]
    );
    assert!(
        (i16::from(
            blend1(
                [128, 128, 128, 255],
                [128, 128, 128, 255],
                TileBlendMode::Screen,
                255
            )[0]
        ) - 192)
            .abs()
            <= 1
    );
}

#[test]
fn blend_overlay_dark_and_bright_branches() {
    assert!(
        (i16::from(
            blend1(
                [64, 64, 64, 255],
                [128, 128, 128, 255],
                TileBlendMode::Overlay,
                255
            )[0]
        ) - 64)
            .abs()
            <= 1
    );
    assert!(
        blend1(
            [200, 200, 200, 255],
            [200, 200, 200, 255],
            TileBlendMode::Overlay,
            255
        )[0] > 220
    );
}

#[test]
fn blend_soft_light_both_branches_and_midgray_identity() {
    let base = [120, 60, 200, 255];
    assert!(
        (i16::from(blend1(base, [128, 128, 128, 255], TileBlendMode::SoftLight, 255)[0]) - 120)
            .abs()
            <= 2
    );
    let (dark, light) = (
        blend1(base, [30, 30, 30, 255], TileBlendMode::SoftLight, 255),
        blend1(base, [230, 230, 230, 255], TileBlendMode::SoftLight, 255),
    );
    assert!(dark[0] < base[0] && light[0] > base[0] && dark[1] < base[1] && light[1] > base[1]);
}

#[test]
fn blend_hard_light_equals_swapped_overlay() {
    let (a, b) = ([70, 180, 220, 255], [190, 60, 140, 255]);
    assert_eq!(
        blend1(a, b, TileBlendMode::HardLight, 255),
        blend1(b, a, TileBlendMode::Overlay, 255)
    );
}

#[test]
fn blend_color_dodge_zero_white_and_midtone() {
    assert_eq!(
        blend1(
            [0, 0, 0, 255],
            [255, 255, 255, 255],
            TileBlendMode::ColorDodge,
            255
        ),
        [0, 0, 0, 255]
    );
    assert_eq!(
        blend1(
            [100, 100, 100, 255],
            [255, 255, 255, 255],
            TileBlendMode::ColorDodge,
            255
        ),
        [255, 255, 255, 255]
    );
    assert!(
        (i16::from(
            blend1(
                [100, 100, 100, 255],
                [128, 128, 128, 255],
                TileBlendMode::ColorDodge,
                255
            )[0]
        ) - 201)
            .abs()
            <= 2
    );
}

#[test]
fn blend_color_burn_black_white_and_midtone() {
    assert_eq!(
        blend1(
            [255, 255, 255, 255],
            [0, 0, 0, 255],
            TileBlendMode::ColorBurn,
            255
        ),
        [255, 255, 255, 255]
    );
    assert_eq!(
        blend1(
            [128, 128, 128, 255],
            [0, 0, 0, 255],
            TileBlendMode::ColorBurn,
            255
        ),
        [0, 0, 0, 255]
    );
    assert!((120..160).contains(
        &blend1(
            [200, 200, 200, 255],
            [128, 128, 128, 255],
            TileBlendMode::ColorBurn,
            255
        )[0]
    ));
}

#[test]
fn blend_darken_and_lighten_pick_channel_extrema() {
    let (a, b) = ([40, 200, 120, 255], [180, 90, 120, 255]);
    assert_eq!(blend1(a, b, TileBlendMode::Darken, 255), [40, 90, 120, 255]);
    assert_eq!(
        blend1(a, b, TileBlendMode::Lighten, 255),
        [180, 200, 120, 255]
    );
}

#[test]
fn blend_linear_burn_and_add_saturate_cleanly() {
    assert_eq!(
        blend1(
            [100, 200, 50, 255],
            [100, 200, 50, 255],
            TileBlendMode::LinearBurn,
            255
        ),
        [0, 145, 0, 255]
    );
    assert_eq!(
        blend1(
            [200, 100, 50, 255],
            [100, 100, 50, 255],
            TileBlendMode::Add,
            255
        ),
        [255, 200, 100, 255]
    );
}

#[test]
fn dirty_rect_invariant_leaves_outside_pixels_bit_identical_on_256x256_tile() {
    let len = COMPOSITOR_TILE_RGBA_BYTES as usize;
    let (mut dst, mut src) = (vec![0u8; len], vec![0u8; len]);
    for i in 0..(len / 4) {
        dst[i * 4..i * 4 + 4].copy_from_slice(&[
            (i % 251) as u8,
            ((i * 3) % 251) as u8,
            ((i * 7) % 251) as u8,
            255,
        ]);
        src[i * 4..i * 4 + 4].copy_from_slice(&[240, 120, 30, 200]);
    }
    let snap = dst.clone();
    let rect = DirtyRect {
        x: 40,
        y: 80,
        width: 35,
        height: 22,
    };
    assert_eq!(
        composite_tile_dirty_rect(&mut dst, &src, 256, 256, rect, TileBlendMode::Multiply, 210)
            .expect("ok"),
        770
    );
    let mut inside_changed = 0usize;
    for y in 0..256usize {
        for x in 0..256usize {
            let o = (y * 256 + x) * 4;
            if (40..75).contains(&x) && (80..102).contains(&y) {
                inside_changed += usize::from(dst[o..o + 4] != snap[o..o + 4]);
            } else {
                assert_eq!(&dst[o..o + 4], &snap[o..o + 4]);
            }
        }
    }
    assert!(inside_changed > 700);
}

#[test]
fn dirty_rect_clamps_overflowing_and_oob_rects_safely() {
    let (mut dst, src) = (vec![80u8; 8 * 8 * 4], vec![200u8; 8 * 8 * 4]);
    let snap = dst.clone();
    assert_eq!(
        composite_tile_dirty_rect(
            &mut dst,
            &src,
            8,
            8,
            DirtyRect {
                x: 8,
                y: 0,
                width: 4,
                height: 4
            },
            TileBlendMode::Normal,
            255
        )
        .expect("ok"),
        0
    );
    assert_eq!(
        composite_tile_dirty_rect(
            &mut dst,
            &src,
            8,
            8,
            DirtyRect {
                x: 0,
                y: 0,
                width: 0,
                height: 4
            },
            TileBlendMode::Normal,
            255
        )
        .expect("ok"),
        0
    );
    assert_eq!(dst, snap);
    assert_eq!(
        composite_tile_dirty_rect(
            &mut dst,
            &src,
            8,
            8,
            DirtyRect {
                x: 6,
                y: 6,
                width: u32::MAX,
                height: u32::MAX
            },
            TileBlendMode::Normal,
            255
        )
        .expect("ok"),
        4
    );
    assert_eq!(&dst[0..4], &[80, 80, 80, 80]);
}

#[test]
fn opacity_zero_and_transparent_channels_work_correctly() {
    let orig = [44, 88, 132, 255];
    assert_eq!(blend1(orig, [255, 0, 0, 255], TileBlendMode::Add, 0), orig);
    assert_eq!(
        blend1(orig, [255, 0, 0, 0], TileBlendMode::Multiply, 255),
        orig
    );
    let over_empty = blend1(
        [0, 0, 0, 0],
        [220, 110, 55, 255],
        TileBlendMode::Multiply,
        128,
    );
    assert_eq!(&over_empty[0..3], &[220, 110, 55]);
    assert!((i16::from(over_empty[3]) - 128).abs() <= 1);
}

#[test]
fn composite_rejects_bad_buffers_and_validates_mode_codes() {
    let rect = DirtyRect {
        x: 0,
        y: 0,
        width: 2,
        height: 2,
    };
    assert!(composite_tile_dirty_rect(
        &mut [0u8; 16],
        &[0u8; 12],
        2,
        2,
        rect,
        TileBlendMode::Normal,
        255
    )
    .is_err());
    assert!(
        composite_tile_dirty_rect(&mut [], &[], 0, 2, rect, TileBlendMode::Normal, 255).is_err()
    );
    assert_eq!(
        (
            TileBlendMode::from_u32(11),
            TileBlendMode::from_u32(12),
            TileBlendMode::ALL.len()
        ),
        (Some(TileBlendMode::Add), None, 12)
    );
}

#[test]
fn arena_plan_compares_wasm32_4gib_cap_vs_wasm64_16gib_plus_and_opfs_watermarks() {
    let budget_24gib: u64 = 24 * 1024 * 1024 * 1024;
    let (p32, p64) =
        SparseTileArenaPlan::compare_wasm32_vs_wasm64(16_384, 16_384, 16, budget_24gib)
            .expect("ok");
    assert_eq!(
        (p32.effective_budget_bytes, p32.max_resident_tiles),
        (WASM32_ADDRESS_LIMIT_BYTES, 16_384)
    );
    assert!(p32.requires_opfs_spill && p32.exceeds_wasm32_4gib);
    assert_eq!(
        (p64.effective_budget_bytes, p64.max_resident_tiles),
        (budget_24gib, 98_304)
    );
    assert!(!p64.requires_opfs_spill && p64.exceeds_wasm32_4gib);
    assert!(
        p32.should_spill_to_opfs(p32.opfs_spill_high_watermark_tiles)
            && !p32.should_spill_to_opfs(p32.opfs_spill_low_watermark_tiles)
    );
    assert!(
        p32.tiles_to_evict_on_spill(p32.opfs_spill_high_watermark_tiles) > 3000
            && p32.tiles_to_evict_on_spill(100) == 0
    );
}

#[test]
fn arena_plan_u64_tile_offsets_cross_4gib_and_guard_u64_overflow() {
    let cfg = SparseTileArenaConfig {
        mode: AddressSpaceMode::Wasm64,
        canvas_width: 16_384,
        canvas_height: 16_384,
        layer_count: 16,
        tile_dim: 256,
        bytes_per_pixel: 4,
        budget_bytes: WASM64_DEFAULT_BUDGET_BYTES,
        opfs_spill_high_watermark_pct: 85,
        opfs_spill_low_watermark_pct: 65,
        base_offset_bytes: 0,
    };
    let plan = SparseTileArenaPlan::compute(&cfg).expect("ok");
    let off_5gib = plan.tile_byte_offset(5, 0, 0).expect("5gib");
    assert_eq!(off_5gib, 5 * 1024 * 1024 * 1024);
    assert!(off_5gib > u64::from(u32::MAX) && plan.tile_byte_offset(16, 0, 0).is_err());
    let near_max = SparseTileArenaPlan::compute(&SparseTileArenaConfig {
        base_offset_bytes: u64::MAX - 1024,
        ..cfg
    })
    .expect("ok");
    assert_eq!(
        near_max.tile_byte_offset(0, 1, 0),
        Err(DrawingCoreError::VirtualAddressSpaceExhausted)
    );
}

#[test]
fn arena_plan_rejects_invalid_watermarks_dimensions_and_tiny_budget() {
    let base = SparseTileArenaConfig {
        mode: AddressSpaceMode::Wasm64,
        canvas_width: 1024,
        canvas_height: 1024,
        layer_count: 2,
        tile_dim: 256,
        bytes_per_pixel: 4,
        budget_bytes: 1024 * 1024,
        opfs_spill_high_watermark_pct: 80,
        opfs_spill_low_watermark_pct: 60,
        base_offset_bytes: 0,
    };
    assert!(SparseTileArenaPlan::compute(&SparseTileArenaConfig {
        canvas_width: 0,
        ..base
    })
    .is_err());
    assert!(SparseTileArenaPlan::compute(&SparseTileArenaConfig {
        layer_count: 0,
        ..base
    })
    .is_err());
    assert!(SparseTileArenaPlan::compute(&SparseTileArenaConfig {
        opfs_spill_low_watermark_pct: 80,
        ..base
    })
    .is_err());
    assert!(SparseTileArenaPlan::compute(&SparseTileArenaConfig {
        budget_bytes: 1024,
        ..base
    })
    .is_err());
}
