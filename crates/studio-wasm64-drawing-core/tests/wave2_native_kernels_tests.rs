//! Wave-2 순수 Rust 네이티브 커널 통합·경계·NaN/Inf·C-ABI FFI 테스트 스위트.
//!
//! - `psd_psb_codec_kernel`: PackBits RLE 왕복·오버런 차단, PSD(v1)/PSB(v2, >4 GiB 64비트) 다중 레이어 코덱
//! - `bvh3d_sah_raycast_kernel`: 32B 캐시 정렬 SAH BVH, Slab+Möller-Trumbore 레이캐스트, 구체 겹침 Voronoi 쿼리
//! - `humanoid_body_ik_kernel`: 2-Bone 폴 벡터/소프트 과신전/바닥 접지 IK, 감쇠 다관절 척추 CCD IK
//! - `wasm_ffi::wave2_native_kernels`: 6종 C-ABI FFI 진입점 정상·오류·별칭·정렬 경계 검증

#[cfg(feature = "pro-raster-tools")]
mod psd_psb_codec_tests {
    use studio_wasm64_drawing_core::wasm_ffi::{
        FFI_ERR_BUFFER_LENGTH, FFI_ERR_NULL_OR_ALIAS,
    };
    use studio_wasm64_drawing_core::{
        decode_packbits_rle, decode_packbits_rle_into, decode_psd_layer_channel_8bit,
        encode_packbits_rle, encode_packbits_rle_into, packbits_max_encoded_len,
        parse_psd_header_streaming, parse_psd_psb_layers_metadata, wasm_packbits_rle_decode,
        wasm_packbits_rle_encode, write_psd_psb_header_and_channels, DrawingCoreError,
        PsdColorMode, PsdCompression, PsdDocumentWriteSpec, PsdFormatVersion,
        PsdLayerChannelInput, PsdLayerWriteSpec, PSD_CHANNEL_ALPHA, PSD_CHANNEL_BLUE,
        PSD_CHANNEL_GREEN, PSD_CHANNEL_RED,
    };

    #[test]
    fn packbits_rle_zero_diff_roundtrip_across_patterns() {
        let mut samples: Vec<Vec<u8>> = vec![
            vec![],
            vec![42],
            vec![7, 7],
            vec![7, 7, 7],
            vec![0xAB; 128],
            vec![0xCD; 300],
            (0..=255u8).collect(),
            vec![1, 2, 2, 2, 3, 4, 4, 5, 5, 5, 6, 7, 7, 8],
        ];
        // 128바이트 경계 전후 혼합 패턴 및 결정적 PRNG 스캔라인
        let mut mixed = (0u8..127).collect::<Vec<_>>();
        mixed.extend_from_slice(&[99, 99, 100, 100, 100, 101]);
        samples.push(mixed);

        let mut seed = 0x1234_5678u32;
        for len in [127usize, 128, 129, 256, 513, 1024] {
            let mut row = Vec::with_capacity(len);
            for i in 0..len {
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                if (i / 17) % 3 == 0 {
                    row.push((i / 17) as u8);
                } else {
                    row.push((seed >> 24) as u8);
                }
            }
            samples.push(row);
        }

        for input in samples {
            let encoded = encode_packbits_rle(&input);
            let max_len = packbits_max_encoded_len(input.len()).expect("max len");
            assert!(
                encoded.len() <= max_len,
                "인코딩 길이 {} > 상한 {} (원본 {}B)",
                encoded.len(),
                max_len,
                input.len()
            );
            let decoded = decode_packbits_rle(&encoded, input.len()).expect("roundtrip decode");
            assert_eq!(decoded, input, "PackBits RLE 0-diff 왕복 불일치");
        }

        // 단색 4096바이트 스캔라인 고압축 확인 (32개 128-반복 런 = 64바이트)
        let solid = vec![255u8; 4096];
        let encoded_solid = encode_packbits_rle(&solid);
        assert_eq!(encoded_solid.len(), 64);
        assert_eq!(decode_packbits_rle(&encoded_solid, 4096).unwrap(), solid);
    }

    #[test]
    fn packbits_rle_handles_noop_and_blocks_overrun_and_truncation() {
        // 0x80(-128) no-op 제어 바이트는 페이로드 소비 없이 무시해야 한다.
        let stream = [0x80u8, 0x01, b'A', b'B', 0x80, 0xFE, b'Z', 0x80];
        let decoded = decode_packbits_rle(&stream, 5).expect("noop skip");
        assert_eq!(decoded, b"ABZZZ");

        // 출력 버퍼 오버런 차단 (리터럴 및 반복 런 모두)
        let mut tiny = [0u8; 3];
        assert!(matches!(
            decode_packbits_rle_into(&stream, &mut tiny),
            Err(DrawingCoreError::BufferLengthMismatch { .. })
        ));
        let literal_overrun = [0x04u8, 1, 2, 3, 4, 5];
        assert!(matches!(
            decode_packbits_rle_into(&literal_overrun, &mut tiny),
            Err(DrawingCoreError::BufferLengthMismatch { .. })
        ));

        // 잘린 입력 스트림 차단
        let truncated_lit = [0x05u8, 1, 2];
        assert!(matches!(
            decode_packbits_rle_into(&truncated_lit, &mut [0u8; 16]),
            Err(DrawingCoreError::TruncatedInput { .. })
        ));
        let truncated_run = [0xFEu8]; // 반복 값 누락
        assert!(matches!(
            decode_packbits_rle_into(&truncated_run, &mut [0u8; 16]),
            Err(DrawingCoreError::TruncatedInput { .. })
        ));

        // 인코더 출력 버퍼 부족 차단
        assert!(matches!(
            encode_packbits_rle_into(&[1, 2, 3, 4, 5], &mut [0u8; 2]),
            Err(DrawingCoreError::BufferLengthMismatch { .. })
        ));
    }

    #[test]
    fn psd_v1_and_psb_v2_multilayer_roundtrip_raw_and_rle() {
        let w = 16u32;
        let h = 12u32;
        let bg_r: Vec<u8> = (0..(w * h)).map(|i| (i % 251) as u8).collect();
        let bg_g = vec![200u8; (w * h) as usize];
        let bg_b = vec![40u8; (w * h) as usize];
        let bg_a = vec![255u8; (w * h) as usize];

        // 부분 영역 레이어 (8×6)
        let fg_r: Vec<u8> = (0..48).map(|i| ((i * 11) % 256) as u8).collect();
        let fg_g = vec![90u8; 48];
        let fg_b = vec![180u8; 48];
        let fg_a: Vec<u8> = (0..48).map(|i| if i % 2 == 0 { 255 } else { 128 }).collect();

        let bg_channels = [
            PsdLayerChannelInput {
                channel_id: PSD_CHANNEL_ALPHA,
                data: &bg_a,
            },
            PsdLayerChannelInput {
                channel_id: PSD_CHANNEL_RED,
                data: &bg_r,
            },
            PsdLayerChannelInput {
                channel_id: PSD_CHANNEL_GREEN,
                data: &bg_g,
            },
            PsdLayerChannelInput {
                channel_id: PSD_CHANNEL_BLUE,
                data: &bg_b,
            },
        ];
        let fg_channels = [
            PsdLayerChannelInput {
                channel_id: PSD_CHANNEL_ALPHA,
                data: &fg_a,
            },
            PsdLayerChannelInput {
                channel_id: PSD_CHANNEL_RED,
                data: &fg_r,
            },
            PsdLayerChannelInput {
                channel_id: PSD_CHANNEL_GREEN,
                data: &fg_g,
            },
            PsdLayerChannelInput {
                channel_id: PSD_CHANNEL_BLUE,
                data: &fg_b,
            },
        ];

        let layers = [
            PsdLayerWriteSpec {
                name: "Background",
                top: 0,
                left: 0,
                bottom: h as i32,
                right: w as i32,
                blend_mode: *b"norm",
                opacity: 255,
                clipping: 0,
                visible: true,
                transparency_protected: true,
                channels: &bg_channels,
            },
            PsdLayerWriteSpec {
                name: "배경_선화_레이어",
                top: 2,
                left: 4,
                bottom: 8,
                right: 12,
                blend_mode: *b"mul ",
                opacity: 180,
                clipping: 1,
                visible: false,
                transparency_protected: false,
                channels: &fg_channels,
            },
        ];
        let composite = [
            bg_r.as_slice(),
            bg_g.as_slice(),
            bg_b.as_slice(),
            bg_a.as_slice(),
        ];

        for version in [PsdFormatVersion::PsdV1, PsdFormatVersion::PsbV2] {
            for compression in [PsdCompression::Raw, PsdCompression::RlePackBits] {
                let spec = PsdDocumentWriteSpec {
                    version,
                    width: w,
                    height: h,
                    channels: 4,
                    depth_bits: 8,
                    color_mode: PsdColorMode::Rgb,
                    compression,
                    layers: &layers,
                    composite_channels: &composite,
                };
                let bytes = write_psd_psb_header_and_channels(&spec).expect("write psd/psb");

                // 기존 스트리밍 헤더 파서 호환성 검증
                let hdr = parse_psd_header_streaming(&bytes).expect("parse header");
                assert_eq!(hdr.version, version.as_u16());
                assert_eq!(hdr.is_psb, version.is_psb());
                assert_eq!(hdr.width, w);
                assert_eq!(hdr.height, h);

                // 신규 다중 레이어 메타데이터 파서 + 0-diff 채널 픽셀 복원 검증
                let parsed = parse_psd_psb_layers_metadata(&bytes).expect("parse layers");
                assert_eq!(parsed.layers.len(), 2);
                assert_eq!(parsed.layers[0].name, "Background");
                assert!(parsed.layers[0].visible);
                assert!(parsed.layers[0].transparency_protected);
                assert_eq!(parsed.layers[0].blend_mode, *b"norm");

                assert_eq!(parsed.layers[1].name, "배경_선화_레이어");
                assert!(!parsed.layers[1].visible);
                assert_eq!(parsed.layers[1].clipping, 1);
                assert_eq!(parsed.layers[1].opacity, 180);
                assert_eq!(parsed.layers[1].blend_mode, *b"mul ");
                assert_eq!(parsed.layers[1].width(), 8);
                assert_eq!(parsed.layers[1].height(), 6);

                let dec_bg_r =
                    decode_psd_layer_channel_8bit(&bytes, version.is_psb(), &parsed.layers[0], 1)
                        .expect("decode bg R");
                assert_eq!(dec_bg_r, bg_r);
                let dec_fg_a =
                    decode_psd_layer_channel_8bit(&bytes, version.is_psb(), &parsed.layers[1], 0)
                        .expect("decode fg A");
                assert_eq!(dec_fg_a, fg_a);
                let dec_fg_r =
                    decode_psd_layer_channel_8bit(&bytes, version.is_psb(), &parsed.layers[1], 1)
                        .expect("decode fg R");
                assert_eq!(dec_fg_r, fg_r);
            }
        }
    }

    #[test]
    fn psb_v2_parses_over_4gib_64bit_section_and_channel_offsets_without_alloc() {
        // >4 GiB PSB(v2) 프리픽스(헤더 + 1개 레이어 레코드만 포함, 채널 픽셀 5.5 GiB는 스트림 후속)
        let mut buf = Vec::new();
        buf.extend_from_slice(b"8BPS");
        buf.extend_from_slice(&2u16.to_be_bytes()); // PSB v2
        buf.extend_from_slice(&[0u8; 6]);
        buf.extend_from_slice(&4u16.to_be_bytes()); // 4 channels
        buf.extend_from_slice(&40_000u32.to_be_bytes()); // height
        buf.extend_from_slice(&50_000u32.to_be_bytes()); // width
        buf.extend_from_slice(&8u16.to_be_bytes());
        buf.extend_from_slice(&3u16.to_be_bytes()); // RGB
        buf.extend_from_slice(&0u32.to_be_bytes()); // Color mode len
        buf.extend_from_slice(&0u32.to_be_bytes()); // Image resources len

        let lm_len: u64 = 6_000_000_000; // > 4 GiB!
        let li_len: u64 = 5_999_999_900;
        let ch0_len: u64 = 5_000_000_000; // > 4 GiB!
        let ch1_len: u64 = 500_000_000;

        buf.extend_from_slice(&lm_len.to_be_bytes());
        buf.extend_from_slice(&li_len.to_be_bytes());
        buf.extend_from_slice(&(-1i16).to_be_bytes()); // 1 layer + merged alpha flag

        // Layer Record
        buf.extend_from_slice(&0i32.to_be_bytes());
        buf.extend_from_slice(&0i32.to_be_bytes());
        buf.extend_from_slice(&40_000i32.to_be_bytes());
        buf.extend_from_slice(&50_000i32.to_be_bytes());
        buf.extend_from_slice(&2u16.to_be_bytes()); // 2 channels
        buf.extend_from_slice(&0i16.to_be_bytes());
        buf.extend_from_slice(&ch0_len.to_be_bytes());
        buf.extend_from_slice(&1i16.to_be_bytes());
        buf.extend_from_slice(&ch1_len.to_be_bytes());
        buf.extend_from_slice(b"8BIMnorm");
        buf.extend_from_slice(&[255, 0, 0, 0]);
        // Extra data: mask(4) + blend(4) + pascal("Mega" -> [4,'M','e','g','a',0,0,0] = 8) = 16 bytes
        buf.extend_from_slice(&16u32.to_be_bytes());
        buf.extend_from_slice(&0u32.to_be_bytes());
        buf.extend_from_slice(&0u32.to_be_bytes());
        buf.extend_from_slice(&[4, b'M', b'e', b'g', b'a', 0, 0, 0]);

        let parsed = parse_psd_psb_layers_metadata(&buf).expect("parse >4GiB PSB prefix");
        assert!(parsed.header.is_psb);
        assert!(parsed.header.requires_memory64);
        assert!(parsed.has_merged_alpha);
        assert_eq!(parsed.header.layer_and_mask_length, lm_len);
        assert_eq!(parsed.layer_info_length, li_len);
        assert_eq!(parsed.layers.len(), 1);
        assert_eq!(parsed.layers[0].name, "Mega");
        assert_eq!(parsed.layers[0].channels[0].data_length, ch0_len);
        assert_eq!(parsed.layers[0].channels[1].data_length, ch1_len);
        assert_eq!(
            parsed.layers[0].channels[1].data_offset,
            parsed.layers[0].channels[0].data_offset + ch0_len
        );
        assert_eq!(parsed.layers[0].channels[0].compression, None);
    }

    #[test]
    fn psd_psb_rejects_malformed_inputs() {
        let bad_dim_spec = PsdDocumentWriteSpec {
            version: PsdFormatVersion::PsdV1,
            width: 30_001, // PSD v1 상한 초과
            height: 16,
            channels: 3,
            depth_bits: 8,
            color_mode: PsdColorMode::Rgb,
            compression: PsdCompression::Raw,
            layers: &[],
            composite_channels: &[],
        };
        assert!(matches!(
            write_psd_psb_header_and_channels(&bad_dim_spec),
            Err(DrawingCoreError::InvalidDimensions { .. })
        ));

        let bad_layer_bounds = PsdLayerWriteSpec {
            name: "Bad",
            top: 20,
            left: 0,
            bottom: 10, // bottom < top
            right: 10,
            blend_mode: *b"norm",
            opacity: 255,
            clipping: 0,
            visible: true,
            transparency_protected: false,
            channels: &[PsdLayerChannelInput {
                channel_id: 0,
                data: &[],
            }],
        };
        let bad_layer_spec = PsdDocumentWriteSpec {
            version: PsdFormatVersion::PsbV2,
            width: 32,
            height: 32,
            channels: 3,
            depth_bits: 8,
            color_mode: PsdColorMode::Rgb,
            compression: PsdCompression::Raw,
            layers: &[bad_layer_bounds],
            composite_channels: &[],
        };
        assert!(matches!(
            write_psd_psb_header_and_channels(&bad_layer_spec),
            Err(DrawingCoreError::InvalidParameter {
                name: "layer_bounds"
            })
        ));
        assert!(matches!(
            parse_psd_psb_layers_metadata(b"NOT_PSD_DATA_00000000000000000000"),
            Err(DrawingCoreError::InvalidPsdSignature)
        ));
    }

    #[test]
    fn packbits_ffi_sizing_roundtrip_and_error_guards() {
        let mut src = Vec::with_capacity(512);
        src.extend_from_slice(&[0x77; 140]);
        for i in 0..200u8 {
            src.push(i);
        }
        src.extend_from_slice(&[0xEE; 172]);

        // 2-pass 크기 질의 (dst == null, cap == 0)
        let max_cap = unsafe {
            wasm_packbits_rle_encode(src.as_ptr(), src.len() as u32, std::ptr::null_mut(), 0)
        };
        assert!(max_cap >= src.len() as i32);

        let mut enc = vec![0u8; max_cap as usize];
        let enc_len = unsafe {
            wasm_packbits_rle_encode(
                src.as_ptr(),
                src.len() as u32,
                enc.as_mut_ptr(),
                enc.len() as u32,
            )
        };
        assert!(enc_len > 0 && (enc_len as usize) < src.len());

        let mut dec = vec![0u8; src.len()];
        let dec_len = unsafe {
            wasm_packbits_rle_decode(
                enc.as_ptr(),
                enc_len as u32,
                dec.as_mut_ptr(),
                dec.len() as u32,
            )
        };
        assert_eq!(dec_len as usize, src.len());
        assert_eq!(dec, src);

        // 버퍼 오버런 차단
        let mut small = [0u8; 4];
        let overrun = unsafe {
            wasm_packbits_rle_decode(
                enc.as_ptr(),
                enc_len as u32,
                small.as_mut_ptr(),
                small.len() as u32,
            )
        };
        assert_eq!(overrun, FFI_ERR_BUFFER_LENGTH);

        // null / 중첩 포인터 차단
        let mut overlap = vec![1u8; 32];
        assert_eq!(
            unsafe {
                wasm_packbits_rle_encode(
                    overlap.as_ptr(),
                    16,
                    overlap.as_mut_ptr().add(4),
                    24,
                )
            },
            FFI_ERR_NULL_OR_ALIAS
        );
        assert_eq!(
            unsafe { wasm_packbits_rle_decode(std::ptr::null(), 8, small.as_mut_ptr(), 4) },
            FFI_ERR_NULL_OR_ALIAS
        );
    }

    #[test]
    fn psd_v1_and_psb_v2_empty_layers_and_16bit_roundtrip() {
        let plane16 = vec![0x12u8; 8 * 4 * 2];
        let comp = [plane16.as_slice(), plane16.as_slice(), plane16.as_slice()];
        for version in [PsdFormatVersion::PsdV1, PsdFormatVersion::PsbV2] {
            let spec = PsdDocumentWriteSpec {
                version,
                width: 8,
                height: 4,
                channels: 3,
                depth_bits: 16,
                color_mode: PsdColorMode::Rgb,
                compression: PsdCompression::RlePackBits,
                layers: &[],
                composite_channels: &comp,
            };
            let bytes = write_psd_psb_header_and_channels(&spec).expect("write flat 16-bit");
            let parsed = parse_psd_psb_layers_metadata(&bytes).expect("parse flat 16-bit");
            assert_eq!(parsed.header.depth_bits, 16);
            assert!(parsed.layers.is_empty());
        }
    }
}

#[cfg(feature = "extended-3d")]
mod bvh3d_and_humanoid_ik_tests {
    use std::f32::consts::FRAC_PI_2;
    use std::mem;

    use studio_wasm64_drawing_core::wasm_ffi::{
        FFI_ERR_INVALID_PARAMETER, FFI_ERR_NULL_OR_ALIAS,
    };
    use studio_wasm64_drawing_core::{
        build_sah_bvh_3d, clamp_foot_contact_floor_3d, closest_point_on_triangle_3d,
        query_sphere_sah_bvh_3d, raycast_sah_bvh_3d, solve_ccd_chain_3d, solve_two_bone_ik_3d,
        wasm_raycast_mesh_sah_bvh_3d, wasm_solve_ccd_spine_ik_3d, wasm_solve_two_bone_ik_3d,
        CcdChainConfig, DrawingCoreError, Ray3D, SahBvhConfig, SahBvhNode3D, TwoBoneIkConfig,
        CCD_SPINE_IK_FFI_PARAM_LEN, SAH_BVH_HIT_FFI_LEN, SAH_BVH_RAY_FFI_LEN,
        TWO_BONE_IK_FFI_OUT_LEN, TWO_BONE_IK_FFI_PARAM_LEN,
    };

    fn build_heightfield_grid(nx: u32, nz: u32) -> (Vec<f32>, Vec<u32>) {
        let mut positions = Vec::with_capacity(((nx + 1) * (nz + 1) * 3) as usize);
        for iz in 0..=nz {
            for ix in 0..=nx {
                let x = (ix as f32) * 0.25 - (nx as f32) * 0.125;
                let z = (iz as f32) * 0.25 - (nz as f32) * 0.125;
                let y = (x * 1.3).sin() * (z * 1.1).cos() * 0.35;
                positions.extend_from_slice(&[x, y, z]);
            }
        }
        let stride = nx + 1;
        let mut indices = Vec::with_capacity((nx * nz * 6) as usize);
        for iz in 0..nz {
            for ix in 0..nx {
                let a = iz * stride + ix;
                let b = a + 1;
                let c = a + stride;
                let d = c + 1;
                // +Y 법선 방향 CCW 와인딩
                indices.extend_from_slice(&[a, c, b, b, c, d]);
            }
        }
        (positions, indices)
    }

    fn v3_sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
        [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
    }

    fn v3_dot(a: [f32; 3], b: [f32; 3]) -> f32 {
        a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    }

    fn v3_cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
        [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ]
    }

    fn v3_len(a: [f32; 3]) -> f32 {
        v3_dot(a, a).sqrt()
    }

    fn brute_force_raycast(
        positions: &[f32],
        indices: &[u32],
        ray: &Ray3D,
        backface_cull: bool,
    ) -> Option<(u32, f32)> {
        let dl = v3_len(ray.direction);
        let dir = [
            ray.direction[0] / dl,
            ray.direction[1] / dl,
            ray.direction[2] / dl,
        ];
        let mut best: Option<(u32, f32)> = None;
        for (ti, tri) in indices.as_chunks::<3>().0.iter().enumerate() {
            let p = |idx: u32| {
                let b = (idx as usize) * 3;
                [positions[b], positions[b + 1], positions[b + 2]]
            };
            let (v0, v1, v2) = (p(tri[0]), p(tri[1]), p(tri[2]));
            let e1 = v3_sub(v1, v0);
            let e2 = v3_sub(v2, v0);
            let pvec = v3_cross(dir, e2);
            let det = v3_dot(e1, pvec);
            if backface_cull {
                if det <= 1e-7 {
                    continue;
                }
            } else if det.abs() <= 1e-7 {
                continue;
            }
            let inv = 1.0 / det;
            let tvec = v3_sub(ray.origin, v0);
            let u = v3_dot(tvec, pvec) * inv;
            if !(0.0..=1.0).contains(&u) {
                continue;
            }
            let qvec = v3_cross(tvec, e1);
            let v = v3_dot(dir, qvec) * inv;
            if v < 0.0 || u + v > 1.0 {
                continue;
            }
            let t = v3_dot(e2, qvec) * inv;
            let cur_best = best.map_or(ray.t_max, |(_, bt)| bt);
            if t >= ray.t_min && t <= cur_best {
                best = Some((ti as u32, t));
            }
        }
        best
    }

    #[test]
    fn sah_bvh_32byte_cache_aligned_and_matches_bruteforce_raycast() {
        assert_eq!(mem::size_of::<SahBvhNode3D>(), 32);
        assert_eq!(mem::align_of::<SahBvhNode3D>(), 32);

        let (positions, indices) = build_heightfield_grid(20, 20); // 800 삼각형
        let bvh = build_sah_bvh_3d(&positions, &indices, &SahBvhConfig::default())
            .expect("build sah bvh");
        assert_eq!(bvh.tri_count, 800);
        assert!(bvh.leaf_count >= 100);
        assert!(bvh.max_depth <= 20);

        let mut total_tested = 0u64;
        let mut hit_count = 0usize;
        for iz in 0..8 {
            for ix in 0..8 {
                // 비격자 내부 광선(유일 삼각형 적중) + 격자 경계 광선(수밀 엣지 무누락) 혼합
                let jitter = if (ix + iz) % 4 == 0 { 0.0 } else { 0.037 };
                let ox = -2.0 + jitter + (ix as f32) * 0.57;
                let oz = -2.0 + jitter * 0.7 + (iz as f32) * 0.57;
                // 축 평행 수직 광선(dx=0, dz=0)과 경사 광선 혼합 검증
                let dir = if (ix + iz) % 2 == 0 {
                    [0.0, -1.0, 0.0]
                } else {
                    [0.18, -1.0, -0.14]
                };
                let ray = Ray3D {
                    origin: [ox, 4.0, oz],
                    direction: dir,
                    t_min: 0.001,
                    t_max: 50.0,
                };
                let got = raycast_sah_bvh_3d(&bvh, &positions, &indices, &ray, true)
                    .expect("bvh raycast");
                let expected = brute_force_raycast(&positions, &indices, &ray, true);
                match (got, expected) {
                    (Some(h), Some((et, ed))) => {
                        hit_count += 1;
                        total_tested += u64::from(h.triangles_tested);
                        assert!(
                            (h.distance - ed).abs() < 1e-4,
                            "거리 불일치: bvh={} vs brute={} (tri {} vs {})",
                            h.distance,
                            ed,
                            h.triangle_index,
                            et
                        );
                        if jitter > 0.0 {
                            assert_eq!(h.triangle_index, et);
                        }
                        assert!(h.normal[1] > 0.0);
                    }
                    (None, None) => {}
                    (a, b) => panic!("적중 여부 불일치: bvh={a:?} vs brute={b:?}"),
                }
            }
        }
        assert!(hit_count >= 50);
        // 평균 삼각형 테스트 수가 전체 800개 대비 크게 프루닝되어야 함
        let avg_tested = (total_tested as f64) / (hit_count as f64);
        assert!(
            avg_tested < 40.0,
            "SAH BVH 프루닝 효율 부족: avg_tested={avg_tested:.1} / 800"
        );
    }

    #[test]
    fn sah_bvh_backface_cull_and_coincident_degenerate_mesh() {
        let positions = [0.0f32, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0];
        let indices = [0u32, 1, 2]; // +Y 법선
        let bvh = build_sah_bvh_3d(&positions, &indices, &SahBvhConfig::default()).unwrap();

        // 아래에서 위로 쏘는 광선(뒷면 적중)
        let upward_ray = Ray3D {
            origin: [0.25, -2.0, 0.25],
            direction: [0.0, 1.0, 0.0],
            t_min: 0.01,
            t_max: 10.0,
        };
        assert!(
            raycast_sah_bvh_3d(&bvh, &positions, &indices, &upward_ray, true)
                .unwrap()
                .is_none()
        );
        let two_sided = raycast_sah_bvh_3d(&bvh, &positions, &indices, &upward_ray, false)
            .unwrap()
            .expect("double-sided hit");
        assert!((two_sided.distance - 2.0).abs() < 1e-5);

        // 128개 완전 중첩 퇴화 삼각형(중심 분산 0)에서도 비재귀 빌드가 안정 종료
        let mut degen_indices = Vec::with_capacity(128 * 3);
        for _ in 0..128 {
            degen_indices.extend_from_slice(&[0, 1, 2]);
        }
        let degen_bvh =
            build_sah_bvh_3d(&positions, &degen_indices, &SahBvhConfig::default()).unwrap();
        assert_eq!(degen_bvh.tri_count, 128);
        assert!(degen_bvh.max_depth <= 10);
    }

    #[test]
    fn sah_bvh_sphere_overlap_and_voronoi_closest_point_accuracy() {
        let a = [0.0, 0.0, 0.0];
        let b = [2.0, 0.0, 0.0];
        let c = [0.0, 0.0, 2.0];

        // 7개 Voronoi 영역 검증
        assert_eq!(closest_point_on_triangle_3d([-1.0, 0.0, -1.0], a, b, c), a);
        assert_eq!(closest_point_on_triangle_3d([3.0, 0.0, -1.0], a, b, c), b);
        assert_eq!(closest_point_on_triangle_3d([-1.0, 0.0, 3.0], a, b, c), c);
        assert_eq!(
            closest_point_on_triangle_3d([1.0, 0.0, -2.0], a, b, c),
            [1.0, 0.0, 0.0]
        );
        assert_eq!(
            closest_point_on_triangle_3d([-2.0, 0.0, 1.0], a, b, c),
            [0.0, 0.0, 1.0]
        );
        let bc_mid = closest_point_on_triangle_3d([2.0, 0.0, 2.0], a, b, c);
        assert!((bc_mid[0] - 1.0).abs() < 1e-5 && (bc_mid[2] - 1.0).abs() < 1e-5);
        assert_eq!(
            closest_point_on_triangle_3d([0.5, 3.0, 0.5], a, b, c),
            [0.5, 0.0, 0.5]
        );

        let (positions, indices) = build_heightfield_grid(12, 12);
        let bvh = build_sah_bvh_3d(&positions, &indices, &SahBvhConfig::default()).unwrap();
        let center = [0.3, 0.2, -0.4];
        let radius = 0.65;
        let res = query_sphere_sah_bvh_3d(&bvh, &positions, &indices, center, radius).unwrap();
        assert!(!res.hits.is_empty());

        // 전수 조사와 정확 일치 검증
        let mut expected_tris = Vec::new();
        for (ti, tri) in indices.as_chunks::<3>().0.iter().enumerate() {
            let p = |idx: u32| {
                let off = (idx as usize) * 3;
                [positions[off], positions[off + 1], positions[off + 2]]
            };
            let cp = closest_point_on_triangle_3d(center, p(tri[0]), p(tri[1]), p(tri[2]));
            let d = v3_len(v3_sub(cp, center));
            if d <= radius {
                expected_tris.push((ti as u32, d));
            }
        }
        expected_tris.sort_by(|x, y| x.1.total_cmp(&y.1).then_with(|| x.0.cmp(&y.0)));
        assert_eq!(res.hits.len(), expected_tris.len());
        assert_eq!(res.closest.unwrap().triangle_index, expected_tris[0].0);
        assert!((res.closest.unwrap().distance - expected_tris[0].1).abs() < 1e-5);

        // 멀리 떨어진 구체는 빈 결과 + 즉시 루트 프루닝
        let far = query_sphere_sah_bvh_3d(&bvh, &positions, &indices, [100.0, 100.0, 100.0], 0.5)
            .unwrap();
        assert!(far.hits.is_empty());
        assert!(far.closest.is_none());
        assert_eq!(far.triangles_tested, 0);
    }

    #[test]
    fn sah_bvh_rejects_nan_inf_and_invalid_buffers() {
        assert!(matches!(
            build_sah_bvh_3d(&[f32::NAN, 0.0, 0.0], &[0, 0, 0], &SahBvhConfig::default()),
            Err(DrawingCoreError::InvalidParameter {
                name: "positions_xyz"
            })
        ));
        assert!(matches!(
            build_sah_bvh_3d(
                &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                &[0, 1, 9],
                &SahBvhConfig::default()
            ),
            Err(DrawingCoreError::InvalidParameter { name: "indices" })
        ));
        let pos = [0.0f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let idx = [0u32, 1, 2];
        let bvh = build_sah_bvh_3d(&pos, &idx, &SahBvhConfig::default()).unwrap();
        let bad_ray = Ray3D {
            origin: [0.0, 0.0, 0.0],
            direction: [0.0, 0.0, 0.0],
            t_min: 0.0,
            t_max: 10.0,
        };
        assert!(matches!(
            raycast_sah_bvh_3d(&bvh, &pos, &idx, &bad_ray, false),
            Err(DrawingCoreError::InvalidParameter {
                name: "ray_direction"
            })
        ));
        assert!(matches!(
            query_sphere_sah_bvh_3d(&bvh, &pos, &idx, [0.0, f32::INFINITY, 0.0], 1.0),
            Err(DrawingCoreError::InvalidParameter { name: "center" })
        ));
        assert!(matches!(
            query_sphere_sah_bvh_3d(&bvh, &pos, &idx, [0.0, 0.0, 0.0], -0.1),
            Err(DrawingCoreError::InvalidParameter { name: "radius" })
        ));
    }

    #[test]
    fn two_bone_ik_exact_reach_pole_control_soft_clamp_and_floor_contact() {
        let cfg = TwoBoneIkConfig {
            upper_length: 0.45,
            lower_length: 0.45,
            soft_extension_ratio: 0.98,
            min_bend_angle_rad: 0.03,
            floor_y: Some(0.0),
            foot_sole_offset: 0.08,
        };
        let hip = [0.0, 0.90, 0.0];
        let foot_target = [0.0, 0.26, 0.0]; // 거리 0.64m (충분히 도달 가능)

        let knee_fwd = solve_two_bone_ik_3d(hip, [0.0, 0.5, 1.0], foot_target, &cfg).unwrap();
        let knee_back = solve_two_bone_ik_3d(hip, [0.0, 0.5, -1.0], foot_target, &cfg).unwrap();

        assert!(!knee_fwd.floor_clamped);
        assert!(!knee_fwd.soft_clamped);
        assert!(knee_fwd.target_error < 1e-5);
        assert!((v3_len(v3_sub(knee_fwd.mid, hip)) - 0.45).abs() < 1e-5);
        assert!((v3_len(v3_sub(knee_fwd.end, knee_fwd.mid)) - 0.45).abs() < 1e-5);
        assert!(knee_fwd.mid[2] > 0.25);
        assert!(knee_back.mid[2] < -0.25);

        // 소프트 과신전 클램프: 목표 거리를 0.90m~1.50m로 늘려도 단조 증가하며 완전 신전(0.90m) 미만 유지
        let mut prev_dist = 0.0f32;
        for step in 0..8 {
            let reach_req = 0.89 + (step as f32) * 0.08;
            let res = solve_two_bone_ik_3d(
                [0.0, 2.0, 0.0],
                [0.0, 2.0, 1.0],
                [reach_req, 2.0, 0.0],
                &cfg,
            )
            .unwrap();
            let actual_d = v3_len(v3_sub(res.end, res.root));
            assert!(res.soft_clamped);
            assert!(actual_d >= prev_dist - 1e-6);
            assert!(actual_d < 0.90);
            assert!(res.bend_angle_rad >= cfg.min_bend_angle_rad - 1e-3);
            prev_dist = actual_d;
        }

        // 바닥 평면 발 접지 클램프(지하 y = -0.40 요청 → y = 0.08로 접지)
        let underground =
            solve_two_bone_ik_3d(hip, [0.0, 0.5, 1.0], [0.05, -0.40, 0.1], &cfg).unwrap();
        assert!(underground.floor_clamped);
        assert!((underground.clamped_target[1] - 0.08).abs() < 1e-5);
        assert!(underground.end[1] >= 0.08 - 1e-5);

        // 공선 폴 벡터 퇴화 안전성(NaN 금지)
        let colinear = solve_two_bone_ik_3d(hip, foot_target, foot_target, &cfg).unwrap();
        assert!(colinear.mid.iter().all(|v| v.is_finite()));
        assert!((v3_len(v3_sub(colinear.mid, hip)) - 0.45).abs() < 1e-5);
    }

    #[test]
    fn ccd_spine_chain_converges_preserves_lengths_and_floor_clearance() {
        // 6관절 휴머노이드 척추(골반 → 허리 → 흉추하 → 흉추상 → 목 → 머리, 총 길이 0.70m)
        let mut spine = [
            [0.0, 0.90, 0.0],
            [0.0, 1.05, 0.0],
            [0.0, 1.20, 0.0],
            [0.0, 1.35, 0.0],
            [0.0, 1.47, 0.0],
            [0.0, 1.60, 0.0],
        ];
        // 도달 가능 척추 굽힘 목표(루트로부터 약 0.61m ≈ 87% 신전)
        let target = [0.30, 1.38, 0.22];
        let cfg = CcdChainConfig {
            max_iterations: 48,
            tolerance: 1e-3,
            max_step_angle_rad: 0.35,
            damping: 0.75,
            max_joint_bend_rad: 0.65,
            floor_y: Some(0.0),
            floor_clearance: 0.05,
        };
        let res = solve_ccd_chain_3d(&mut spine, target, &cfg).unwrap();
        assert!(res.converged, "척추 CCD 미수렴: err={}", res.target_error);
        assert!(res.target_error <= 1e-3);
        assert!(res.max_bone_length_error < 1e-4);
        assert_eq!(spine[0], [0.0, 0.90, 0.0]); // 루트 고정

        // 원뿔 한계(max_joint_bend_rad) 준수 확인
        for i in 1..(spine.len() - 1) {
            let p_dir = v3_sub(spine[i], spine[i - 1]);
            let c_dir = v3_sub(spine[i + 1], spine[i]);
            let cos_b = (v3_dot(p_dir, c_dir) / (v3_len(p_dir) * v3_len(c_dir))).clamp(-1.0, 1.0);
            assert!(
                cos_b.acos() <= cfg.max_joint_bend_rad + 1e-3,
                "관절 {i} 원뿔 한계 초과: {} rad",
                cos_b.acos()
            );
        }

        // 도달 불가 원거리 목표도 NaN 없이 뼈 길이를 유지하며 안정 수렴
        let mut far_spine = [
            [0.0, 0.90, 0.0],
            [0.0, 1.05, 0.0],
            [0.0, 1.20, 0.0],
            [0.0, 1.35, 0.0],
        ];
        let far_res = solve_ccd_chain_3d(&mut far_spine, [1.5, 1.8, 0.8], &cfg).unwrap();
        assert!(!far_res.converged);
        assert!(far_res.max_bone_length_error < 1e-4);
        assert!(far_spine.iter().all(|p| p.iter().all(|v| v.is_finite())));

        // 바닥 평면 침투 방지 검증(낮은 목표 y = -0.50 요청 시 바닥 0.25m 이상 유지)
        let mut low_chain = [
            [0.0, 0.50, 0.0],
            [0.0, 0.70, 0.0],
            [0.0, 0.90, 0.0],
            [0.0, 1.10, 0.0],
        ];
        let low_cfg = CcdChainConfig {
            max_iterations: 32,
            tolerance: 1e-3,
            max_step_angle_rad: 0.5,
            damping: 0.85,
            max_joint_bend_rad: FRAC_PI_2,
            floor_y: Some(0.20),
            floor_clearance: 0.05,
        };
        let low_res = solve_ccd_chain_3d(&mut low_chain, [0.40, -0.50, 0.0], &low_cfg).unwrap();
        assert!(low_res.max_bone_length_error < 1e-4);
        for j in &low_chain[1..] {
            assert!(j[1] >= 0.25 - 1e-4, "관절이 바닥 아래로 침투: y={}", j[1]);
        }
    }

    #[test]
    fn humanoid_ik_rejects_nan_inf_and_bad_config() {
        assert!(matches!(
            clamp_foot_contact_floor_3d([0.0, f32::NAN, 0.0], 0.0, 0.05),
            Err(DrawingCoreError::InvalidParameter { name: "foot_pos" })
        ));
        assert!(matches!(
            clamp_foot_contact_floor_3d([0.0, 0.0, 0.0], 0.0, -0.01),
            Err(DrawingCoreError::InvalidParameter {
                name: "sole_offset"
            })
        ));
        let bad_two = TwoBoneIkConfig {
            soft_extension_ratio: 1.2,
            ..TwoBoneIkConfig::default()
        };
        assert!(matches!(
            solve_two_bone_ik_3d([0.0; 3], [0.0, 0.0, 1.0], [0.5, 0.0, 0.0], &bad_two),
            Err(DrawingCoreError::InvalidParameter {
                name: "soft_extension_ratio"
            })
        ));
        assert!(matches!(
            solve_two_bone_ik_3d(
                [0.0, f32::INFINITY, 0.0],
                [0.0, 0.0, 1.0],
                [0.5, 0.0, 0.0],
                &TwoBoneIkConfig::default()
            ),
            Err(DrawingCoreError::InvalidParameter { name: "root" })
        ));

        let mut single_joint = [[0.0, 0.0, 0.0]];
        assert!(matches!(
            solve_ccd_chain_3d(&mut single_joint, [1.0, 0.0, 0.0], &CcdChainConfig::default()),
            Err(DrawingCoreError::InvalidParameter { name: "joints" })
        ));
        let mut zero_bone = [[0.0, 1.0, 0.0], [0.0, 1.0, 0.0]];
        assert!(matches!(
            solve_ccd_chain_3d(&mut zero_bone, [1.0, 1.0, 0.0], &CcdChainConfig::default()),
            Err(DrawingCoreError::InvalidParameter {
                name: "bone_length"
            })
        ));
    }

    #[test]
    fn wave2_3d_ffi_roundtrip_and_boundary_guards() {
        // 1) SAH BVH Raycast FFI
        let (positions, indices) = build_heightfield_grid(6, 6);
        let ray_hit: [f32; SAH_BVH_RAY_FFI_LEN] = [0.0, 3.0, 0.0, 0.0, -1.0, 0.0, 0.01, 20.0];
        let mut out_hit = [0.0f32; SAH_BVH_HIT_FFI_LEN];
        let rc = unsafe {
            wasm_raycast_mesh_sah_bvh_3d(
                positions.as_ptr(),
                (positions.len() / 3) as u32,
                indices.as_ptr(),
                (indices.len() / 3) as u32,
                ray_hit.as_ptr(),
                1,
                out_hit.as_mut_ptr(),
            )
        };
        assert_eq!(rc, 1);
        assert!(out_hit[1] > 2.5 && out_hit[1] < 3.5);
        assert!(out_hit[8] > 0.5); // +Y normal

        let ray_miss: [f32; SAH_BVH_RAY_FFI_LEN] = [50.0, 3.0, 50.0, 0.0, -1.0, 0.0, 0.01, 20.0];
        assert_eq!(
            unsafe {
                wasm_raycast_mesh_sah_bvh_3d(
                    positions.as_ptr(),
                    (positions.len() / 3) as u32,
                    indices.as_ptr(),
                    (indices.len() / 3) as u32,
                    ray_miss.as_ptr(),
                    0,
                    out_hit.as_mut_ptr(),
                )
            },
            0
        );
        assert_eq!(
            unsafe {
                wasm_raycast_mesh_sah_bvh_3d(
                    positions.as_ptr(),
                    (positions.len() / 3) as u32,
                    indices.as_ptr(),
                    (indices.len() / 3) as u32,
                    ray_hit.as_ptr(),
                    2, // invalid backface_cull
                    out_hit.as_mut_ptr(),
                )
            },
            FFI_ERR_INVALID_PARAMETER
        );
        assert_eq!(
            unsafe {
                wasm_raycast_mesh_sah_bvh_3d(
                    positions.as_ptr(),
                    (positions.len() / 3) as u32,
                    indices.as_ptr(),
                    (indices.len() / 3) as u32,
                    std::ptr::null(),
                    0,
                    out_hit.as_mut_ptr(),
                )
            },
            FFI_ERR_NULL_OR_ALIAS
        );

        // 2) Two-Bone IK FFI (바닥 접지 + 소프트 클램프 동시 검증)
        let two_params: [f32; TWO_BONE_IK_FFI_PARAM_LEN] = [
            0.0, 0.9, 0.0, // root
            0.0, 0.5, 1.0, // pole
            0.0, -0.3, 0.0, // target (지하)
            0.45, 0.45, // upper, lower
            0.98, 0.02, // soft_extension_ratio, min_bend_angle_rad
            0.0, 0.05, // floor_y, foot_sole_offset
        ];
        let mut two_out = [0.0f32; TWO_BONE_IK_FFI_OUT_LEN];
        let status = unsafe { wasm_solve_two_bone_ik_3d(two_params.as_ptr(), 1, two_out.as_mut_ptr()) };
        assert_eq!(status, 1); // bit0 = floor_clamped
        assert!((two_out[4] - 0.05).abs() < 1e-4); // end.y == 0.05
        assert_eq!(
            unsafe { wasm_solve_two_bone_ik_3d(two_params.as_ptr(), 2, two_out.as_mut_ptr()) },
            FFI_ERR_INVALID_PARAMETER
        );

        // 3) CCD Spine IK FFI
        let mut spine_flat: [f32; 12] = [
            0.0, 0.9, 0.0,
            0.0, 1.1, 0.0,
            0.0, 1.3, 0.0,
            0.0, 1.5, 0.0,
        ];
        let spine_target = [0.22f32, 1.42, 0.15];
        let ccd_params: [f32; CCD_SPINE_IK_FFI_PARAM_LEN] = [1e-3, 0.4, 0.8, 0.7, 0.0, 0.05];
        let iters = unsafe {
            wasm_solve_ccd_spine_ik_3d(
                spine_flat.as_mut_ptr(),
                4,
                spine_target.as_ptr(),
                32,
                1,
                ccd_params.as_ptr(),
            )
        };
        assert!(iters > 0 && iters <= 32);
        let eff_err = v3_len(v3_sub(
            [spine_flat[9], spine_flat[10], spine_flat[11]],
            spine_target,
        ));
        assert!(eff_err < 1e-2);

        // NaN 목표 및 잘못된 관절 수 차단
        let nan_target = [f32::NAN, 1.0, 0.0];
        assert_eq!(
            unsafe {
                wasm_solve_ccd_spine_ik_3d(
                    spine_flat.as_mut_ptr(),
                    4,
                    nan_target.as_ptr(),
                    16,
                    0,
                    std::ptr::null(),
                )
            },
            FFI_ERR_INVALID_PARAMETER
        );
        assert_eq!(
            unsafe {
                wasm_solve_ccd_spine_ik_3d(
                    spine_flat.as_mut_ptr(),
                    1,
                    spine_target.as_ptr(),
                    16,
                    0,
                    std::ptr::null(),
                )
            },
            FFI_ERR_INVALID_PARAMETER
        );

        // 비정렬·중첩 포인터 경계 차단
        let unaligned_f32 = (two_params.as_ptr().cast::<u8>().wrapping_add(1)).cast::<f32>();
        assert_eq!(
            unsafe { wasm_solve_two_bone_ik_3d(unaligned_f32, 0, two_out.as_mut_ptr()) },
            FFI_ERR_NULL_OR_ALIAS
        );
        let mut aliased = [0.0f32; 20];
        assert_eq!(
            unsafe { wasm_solve_two_bone_ik_3d(aliased.as_ptr(), 0, aliased.as_mut_ptr().add(4)) },
            FFI_ERR_NULL_OR_ALIAS
        );
        assert_eq!(
            unsafe {
                wasm_solve_ccd_spine_ik_3d(
                    spine_flat.as_mut_ptr(),
                    4,
                    spine_flat.as_ptr().add(3),
                    8,
                    0,
                    std::ptr::null(),
                )
            },
            FFI_ERR_NULL_OR_ALIAS
        );
    }

    #[test]
    fn sah_bvh_empty_mesh_and_t_range_clipping() {
        let empty = build_sah_bvh_3d(&[], &[], &SahBvhConfig::default()).unwrap();
        assert!(empty.nodes.is_empty());
        let ray = Ray3D {
            origin: [0.0, 2.0, 0.0],
            direction: [0.0, -1.0, 0.0],
            t_min: 0.0,
            t_max: 10.0,
        };
        assert!(raycast_sah_bvh_3d(&empty, &[], &[], &ray, false).unwrap().is_none());
        let sq = query_sphere_sah_bvh_3d(&empty, &[], &[], [0.0; 3], 1.0).unwrap();
        assert!(sq.hits.is_empty());

        let pos = [0.0f32, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0];
        let idx = [0u32, 1, 2];
        let bvh = build_sah_bvh_3d(&pos, &idx, &SahBvhConfig::default()).unwrap();
        let short_ray = Ray3D {
            origin: [0.25, 2.0, 0.25],
            direction: [0.0, -1.0, 0.0],
            t_min: 0.01,
            t_max: 1.5, // 삼각형(거리 2.0) 이전에서 절단
        };
        assert!(raycast_sah_bvh_3d(&bvh, &pos, &idx, &short_ray, false).unwrap().is_none());
    }

    #[test]
    fn two_bone_ik_asymmetric_limb_and_min_reach_clamp() {
        let cfg = TwoBoneIkConfig {
            upper_length: 0.50,
            lower_length: 0.30,
            soft_extension_ratio: 0.99,
            min_bend_angle_rad: 0.02,
            floor_y: None,
            foot_sole_offset: 0.0,
        };
        // |l1 - l2| = 0.20보다 가까운 0.05m 목표 → min_reach(0.20m)로 안전 클램프
        let res = solve_two_bone_ik_3d([0.0; 3], [0.0, 0.0, 1.0], [0.05, 0.0, 0.0], &cfg).unwrap();
        assert!(res.soft_clamped);
        assert!((v3_len(v3_sub(res.mid, res.root)) - 0.50).abs() < 1e-5);
        assert!((v3_len(v3_sub(res.end, res.mid)) - 0.30).abs() < 1e-5);
        assert!((v3_len(v3_sub(res.end, res.root)) - 0.20).abs() < 1e-4);
    }
}

#[cfg(all(feature = "pro-raster-tools", feature = "extended-3d"))]
#[test]
fn wave2_capabilities_preserves_existing_extended_capabilities_mask() {
    use studio_wasm64_drawing_core::{
        wasm_extended_capabilities, wasm_wave2_capabilities, WASM_EXTENDED_CAPABILITIES,
        WASM_WAVE2_CAPABILITIES,
    };
    // 기존 확장 스위트 마스크(0x7FFFF) 무변경 호환성 + Wave-2 비트마스크(0x1F) 검증
    assert_eq!(wasm_extended_capabilities(), 0x7_FFFF);
    assert_eq!(WASM_EXTENDED_CAPABILITIES, 0x7_FFFF);
    assert_eq!(wasm_wave2_capabilities(), 0x1F);
    assert_eq!(WASM_WAVE2_CAPABILITIES, 0x1F);
}
