# SketchUp 3D & Blender 5.2 전 기능 REA 역공학 분석 및 ToonStudio 사이트 완전 통합 보고서 (2026-10-27)

- **작성일**: `2026-10-27`
- **분석 도구**: `REA (reverse-engineer-anything)` (`inspect_python_pyc`, `inspect_analysis_view`, `open_bundle_resources`, `inspect_plist`, `analyze_javascript_application`, `inspect_rust_binary`)
- **네이티브 분석 엔진 정책**: `AGENTS.md §6` 준수 (`provider_id: "ghidra"` 전용, `hopper` 미사용)
- **증거 원장 JSON**: [`docs/evidence/sketchup-blender-5.2-rea-evidence-2026-10-27.json`](evidence/sketchup-blender-5.2-rea-evidence-2026-10-27.json)

---

## 1. 개요 및 목적

본 문서는 `SketchUp 3D`(`openskp@1.3.0` 바이너리 코덱 + `CADCraft.app` CAD/BIM 브리지)와 `Blender 5.2.0`(`arm64` 앱 번들 및 CPython 3.13 바이트코드 `.pyc` magic `3571`)의 모든 핵심 도메인(직접 모델링, 지형 Sandbox, Solid Tools 6종 불리언/솔리드 인스펙터, Match Photo 2소실점 투시 캘리브레이터, 파라메트릭 건축 컴포넌트, Blender 6대 카테고리 모디파이어 스택, Edit/Sculpt 30+ 오퍼레이터, Grease Pencil v3 3D 작화 레이어·마스크·어니언 스킨, Freestyle 9종 엣지 세트, Compositor 17종 노드 그래프, RigidBody/Cloth/Mantaflow 물리 시뮬레이션, 어안 K0~K4·Shift X/Y·보케 조리개 시네마틱 카메라)을 REA로 정밀 역공학하고, ToonStudio 웹 스튜디오(`apps/web/src/domains/creator/bg3d`)에 **실시간 3D 장면 배치(`BgPrimitive[]`)·카메라(`StudioBg3dCameraSettings`)·선화 미리보기(`lineArtPreview`)까지 End-to-End로 통합**한 결과를 기록한다.

---

## 2. REA 인식론적 증거 분리 (Epistemic Discipline)

### 2.1 관찰된 사실 (Observed Facts)

#### A. Blender 5.2.0 앱 번들 및 CPython 3.13 바이트코드 (`.pyc` Magic `3571`, Layout `py311`)
1. **앱 번들 메타데이터** (`ev_90ad53d5730faf55b2b1b09b0f2363cb11e49bca01da7e2c67a6ef5fb8f0dfa9`):
   - 경로: `/Applications/Blender.app`
   - `CFBundleIdentifier`: `"org.blenderfoundation.blender"`, `CFBundleShortVersionString`: `"5.2.0"`, 빌드 스탬프: `"5.2.0 2026-07-14"`, `LSMinimumSystemVersion`: `"11.2"`, 실행 바이너리: `Contents/MacOS/Blender` (`arm64` Mach-O).
2. **모디파이어 스택 (`properties_data_modifier.cpython-313.pyc`)**
   - SHA-256: `0fd9cb36ecf24cb4760d531544b47f9ff5382cf89ffa216cab6928c2bad0787b` (`16,828`B, 772 objects, 25 code objects)
   - Evidence: `ev_0f2ffe615bf5d8bdfc4c7e62247ce684d623951460eef8b15384f1a9166cf346`, `ev_cb900858bf94d3423d3d446ea2c9fdbefea56b671511c881533cd7e472596d72`
   - 6대 메뉴 카테고리 확인: `OBJECT_MT_modifier_add_edit`, `OBJECT_MT_modifier_add_generate`, `OBJECT_MT_modifier_add_deform`, `OBJECT_MT_modifier_add_normals`, `OBJECT_MT_modifier_add_physics`, `OBJECT_MT_modifier_add_color`.
   - Blender 5.2 Geometry Nodes 에셋 기반 모디파이어 경로 확인:
     - `nodes/geometry_nodes_essentials.blend/NodeTree/Array` (`MOD_ARRAY`)
     - `nodes/geometry_nodes_essentials.blend/NodeTree/Curve to Tube` (`MOD_CURVE_TO_TUBE`)
     - `nodes/geometry_nodes_essentials.blend/NodeTree/Scatter on Surface` (`MOD_SCATTER_ON_SURFACE`)
     - `nodes/geometry_nodes_essentials.blend/NodeTree/Set Hair Curve Profile`
   - 모디파이어 식별자 상수 확인: `ARRAY`, `BEVEL`, `BOOLEAN`, `BUILD`, `DECIMATE`, `EDGE_SPLIT`, `NODES`, `MASK`, `MIRROR`, `MULTIRES`, `REMESH`, `SCREW`, `SKIN`, `SOLIDIFY`, `SUBSURF`, `TRIANGULATE`, `VOLUME_TO_MESH`, `WELD`, `WIREFRAME`, `LINEART`, `ARMATURE`, `CAST`, `CURVE`, `DISPLACE`, `HOOK`, `LAPLACIANDEFORM`, `LATTICE`, `MESH_DEFORM`, `SHRINKWRAP`, `SIMPLE_DEFORM`, `SMOOTH`, `CORRECTIVE_SMOOTH`, `LAPLACIANSMOOTH`, `SURFACE_DEFORM`, `WARP`, `WAVE`, `NORMAL_EDIT`, `WEIGHTED_NORMAL`, `GREASE_PENCIL_NOISE`, `GREASE_PENCIL_THICKNESS`, `GREASE_PENCIL_TINT`, `GREASE_PENCIL_TIME`, `GREASE_PENCIL_BUILD`, `GREASE_PENCIL_ENVELOPE`, `GREASE_PENCIL_OUTLINE`.
3. **Grease Pencil v3 (`properties_data_grease_pencil.cpython-313.pyc`)**
   - SHA-256: `b577a014cdabc83ecf450c7409f3638870f7f90cb60bd73bb1b58f006ae262d8` (`26,427`B, 1,521 objects, 53 code objects)
   - Evidence: `ev_b6e4c388edcf8ff8d869fefd94ae7bfee267fc0414836fede2a794e08706b88d`, `ev_80bac2b54a1053523bb3e7c991491b05c870b444ff28691aa5beef147b4fe1d7`
   - 레이어 트리 및 마스크 구조 확인: `template_grease_pencil_layer_tree`, `GREASE_PENCIL_UL_masks`, `DATA_PT_grease_pencil_layer_masks` (`use_mask_layer`, `invert`, `hide`), `DATA_PT_grease_pencil_layer_transform` (`translation`, `rotation`, `scale`), `DATA_PT_grease_pencil_layer_adjustments` (`tint_color`, `tint_factor`, `radius_offset`), `DATA_PT_grease_pencil_layer_relations` (`parent`, `parent_type`, `parent_bone`, `pass_index`, `viewlayer_render`, `use_viewlayer_masks`), `DATA_PT_grease_pencil_onion_skinning`.
4. **Compositor 노드 그래프 (`node_add_menu_compositor.cpython-313.pyc`)**
   - SHA-256: `967911c81c517097930f9ab957be42b0eaf117c02f324424a6c7e81e97a39fe3` (`31,451`B, 1,153 objects, 45 code objects)
   - Evidence: `ev_d828c36826c040dc8a011adcb25be251dfec9ff7e3a4b8848cd2bbba8c64cc32`, `ev_917b00ec40f80e6c3e22c69418a7939ff1dafc34554d3e0b7c1ab2a3152a33d2`
   - 17종 컴포지터 메뉴 및 주요 노드 확인: `CompositorNodeGlare`, `CompositorNodeColorBalance`, `CompositorNodeTonemap`, `CompositorNodeLensdist`, `CompositorNodeBilateralblur`, `CompositorNodeBokehBlur`, `CompositorNodeVecBlur`, `CompositorNodeDenoise`, `CompositorNodeCryptomatteV2`, `CompositorNodeInpaint`, `CompositorNodeMaskToSDF`, `CompositorNodeConvolve`, `CompositorNodeCornerPin`, `CompositorNodeZcombine`, `ShaderNodeTexGabor`.
5. **Geometry Nodes 5.2 (`node_add_menu_geometry.cpython-313.pyc`)**
   - SHA-256: `cbc6adc15a66a2879fe6b1100390bd61fe477848b934cf10225a538dc2bf321f` (`69,893`B, 2,603 objects, 115 code objects)
   - Evidence: `ev_0cf6e7b41209ad3bc6d2111003363029ec28d24bae35312e96b34e0ac1315446`, `ev_b47ff7556569d644942f3339867f67ce76b3830ef7d364b731e704079e42e2d0`
   - GPv3 지오메트리 노드 메뉴(`NODE_MT_gn_grease_pencil_*`), 시뮬레이션(`NODE_MT_gn_simulation_base`), 볼륨(`NODE_MT_gn_volume_*`), 기즈모(`NODE_MT_gn_input_gizmo_base`), 번들/클로저(`NODE_MT_category_utilities_bundle_base`, `NODE_MT_category_utilities_closure_base`) 확인.
6. **물리 시뮬레이션 3종 (`rigidbody`, `cloth`, `fluid`)**
   - `properties_physics_rigidbody.cpython-313.pyc`: SHA-256 `9bccd497d1c673aa87250e8995f69cfd4cbdbff5109ff9d8373aed387dbc3d74` (`ev_cc2e225d21fab2e3cd2d3686fd1a3d79ffd67c10c2b711178787fea715eacf6e`, `ev_b93286c1a3378a4a00a489dc7ed76b70fd6d3ddb06e4eaf737046704c5be2d5a`) — `ACTIVE`/`PASSIVE`, `COMPOUND`, `CONVEX_HULL`, `MESH`, `mass`, `friction`, `restitution`, `collision_margin`, `linear_damping`, `angular_damping`, `use_deactivation`.
   - `properties_physics_cloth.cpython-313.pyc`: SHA-256 `e136491a3b7114d6951acee6ed0944ed74963db51bcb580882609fbe0ac5022b` (`ev_23c8a2dbaa7d34f1e063eb4ef7e6eb7f705352dd6b5dcb0e62f49ff10e77774b`, `ev_af2e348f64c3e1389185eb09cf34b1176711961223e5481d2c0bb29f7a64f759`) — `ANGULAR`/`LINEAR` bending model, `tension_stiffness`, `compression_stiffness`, `shear_stiffness`, `bending_stiffness`, `use_internal_springs`, `use_pressure`, `uniform_pressure_force`, `use_sewing_springs`, `sewing_force_max`, `shrink_min`, `use_self_collision`.
   - `properties_physics_fluid.cpython-313.pyc`: SHA-256 `ad58e1aabb51953fb9e190daca3b1a1000d85c5af53f4407babf14a1f7d76f98` (`ev_b6506e5c7c16d68dab09562f65585b524ee39ae5f0d3cb651589372dae8f3c33`, `ev_77428e46f21053261269407c15bf2bcc7c1244ad4e786a13326e733126530b26`) — Mantaflow `DOMAIN`/`FLOW`/`EFFECTOR`, `GAS` (`SMOKE`, `FIRE`, `BOTH`, `use_dissolve_smoke`, `use_noise`) 및 `LIQUID` (`FLIP`/`APIC`, `use_mesh`, `use_spray_particles`, `use_foam_particles`, `use_bubble_particles`).
7. **시네마틱 카메라 & Freestyle (`properties_data_camera.cpython-313.pyc`, `properties_freestyle.cpython-313.pyc`)**
   - 카메라 SHA-256 `f2e1aaae37300d2d74070e11d8dcc8f56520ac5b4516811ddbce1348b23539b1` (`ev_284de35111b49df22ebb61b21ff2e1bc43fcbd6c23ca56f3b1f7db773b2b7065`, `ev_01f1f75ba4a1623013306c9de8ad5439ba5a20b915ddee703a9c1375055b30fe`) — `PERSP`, `ORTHO`, `PANO` (`FISHEYE_EQUIDISTANT`, `FISHEYE_EQUISOLID`, `FISHEYE_LENS_POLYNOMIAL` K0..K4, `CENTRAL_CYLINDRICAL`), `shift_x`, `shift_y`, `aperture_fstop`, `aperture_blades`, `aperture_rotation`, `aperture_ratio`, `passepartout_alpha`.
   - Freestyle SHA-256 `30905824a464724a11ab23f1e9bb2918593bbea44d8a0c73d0c22daaa1315dbe` (`ev_463f657bbba506b7446e5595494fad1fd73f1c83afb18673689fdbe072c556ba`, `ev_dd7007bb240454f2b27f21acc98c103531b773a7fe2b657afcfdacb7298ce931`) — 9대 엣지 타입(`edge_type_silhouette`, `edge_type_crease`, `edge_type_border`, `edge_type_edge_mark`, `edge_type_contour`, `edge_type_external_contour`, `edge_type_material_boundary`, `edge_type_suggestive_contour`, `edge_type_ridge_valley`) 및 `qi_start`/`qi_end` Quantitative Invisibility 범위.
8. **3D 뷰포트 인터랙티브 툴바 (`space_toolsystem_toolbar.cpython-313.pyc`)**
   - SHA-256 `dae4e2d044401f4a7bf61f4dc2e6d319366bcd8b798e76e7046a854983596aca` (`149,324`B, 8,123 objects, 367 code objects, `ev_0dd893e260f5cc624e30c9ea9ba9f12fe9cebf62b10d6a8cfee4e2427c85709a`) — `_defs_edit_mesh` 22개 오퍼레이터(`extrude_manifold`, `inset`, `bevel`, `loopcut_slide`, `knife`, `bisect`, `spin`, `shrink_fatten`, `push_pull`, `vertex_smooth`, `tosphere` 등), `_defs_sculpt` (`dyntopo_density`, `mesh_filter`, `cloth_filter`, `color_filter`, `trim_box`, `trim_lasso`, `face_set_edit`), `_defs_grease_pencil_draw` (`line`, `polyline`, `arc`, `curve`, `box`, `circle`, `interpolate`).

#### B. SketchUp (`openskp@1.3.0`) & CADCraft (`CADCraft.app`)
1. **`openskp@1.3.0` 정적 AST·데이터 플로 분석**:
   - `dist/index.js` SHA-256: `3b4a418e320920083aefa7551a924954b336e5addd0182971c7c66aeab575c2d` (`1,047,986`B, 149,279 AST nodes, 3,975 call-flow relations, 21,826 data-flow relations)
   - Evidence: `ev_b88f7ae56f33742180be344237723c2be5ebb28e00293f4833b89ce396b69aa1`, `ev_6c6ed2d503e8bfb3d83a900b458fa8c31ad172d02b5832c0b79c0ec52bd9a26c`, `ev_f4c8394c957dae47aa47bde95c82e75626c2b38acce39e15c39d28f569e5381b`
   - 확인된 함수·클래스: `readSkp`, `writeSkp`, `SkpToThreeConverter`, `SkpWriter`, `skpToGlb`, `skpToObj`, `skpToStl`, `skpToPly`, `skpToDxf`, `skpToIfc`, `skpToFragments`, `dxfToSkp`, `ifcToSkp`, `objToSkp`, `stlToSkp`, `plyToSkp`, `glbToSkp`, `fragmentsToSkp`, `extractEdgesFromD307`, `parseCDbPage`, `parseCComponentDefinition`, `parseCSectionPlane`, `parseCDimensionLinear`, `parseCText`, `parseCConstructionLine`, `parseCConstructionPoint`, `computeUvTransform`.
2. **`CADCraft.app` 번들 및 Rust Mach-O 슬라이스**:
   - `Info.plist` Evidence: `ev_6a4e2a301510118a8d8410f4dfbe9340842121656aa2e90c49fbc773785c72e9` (`ai.storyteller.cadcraft` v0.13.0)
   - Binary SHA-256: `424012382761ea6dd1d10a8c3d88945d0a26774b1079b956f8e825a60ece1276` (`arm64` slice offset `81526784`, size `76986416`, Evidence `ev_ae3622a085454764e608b8ade5cc50afbaaa2b8ec606ec32e7be284c9e7da6a8`).

---

### 2.2 추론 (Inferences)
- Blender 5.2의 `shift_x`, `shift_y` 2점 투시 렌즈 시프트와 SketchUp의 2점 투시(Two-Point Perspective) 및 Match Photo 투시 보정은 모두 ToonStudio의 `StudioBg3dCameraSettings.lensShift` 및 `up` 벡터로 손실 없이 대응된다.
- SketchUp의 `D307` 모서리 플래그(`softened: 0x08`, `smooth: 0x10`, `hidden: 0x01`)와 Blender의 `Freestyle` 9대 엣지 선택기(`crease_angle`, `silhouette`, `border`, `material_boundary`)는 웹툰 배경의 외곽선/주름선 분리 파이프라인에서 동일한 수학적 위상(Crease Angle + Silhouette + QI)을 공유한다.

### 2.3 미확인 및 한계 (Unknowns & Limitations)
- 브라우저 메인 스레드 및 WebGL2/WebGPU 예산(문서 최대 320KiB, 노드 최대 512개)을 보호하기 위해, Mantaflow 3D 격자 유체나 수만 폴리곤의 CSG/Remesh는 무거운 네이티브 C++ 커널을 직접 WASM으로 상주시키지 않고, **결정론적 경량 해석 엔진 + `BgPrimitive[]` 실시간 장면 합성기**로 통합했다.

---

## 3. ToonStudio 통합 아키텍처 매핑

| 도메인 | 신규/확장 모듈 | 주요 통합 기능 |
| --- | --- | --- |
| **SketchUp 3D 전 기능 엔진** | `apps/web/src/domains/creator/bg3d/studio-bg3d-sketchup-full-engine.ts` | Sandbox 지형(`From Contours`, `From Scratch`, `Smoove`, `Stamp`, `Drape`), Solid Tools 6종 불리언(`Outer Shell`, `Union`, `Subtract`, `Trim`, `Intersect`, `Split`) & Manifold Solid Inspector, Match Photo 2소실점 투시 카메라 캘리브레이터, 파라메트릭 건축 컴포넌트 생성기(`BgPrimitive[]`), 8종 CAD/BIM/LayOut SVG 통합 번들 |
| **SketchUp 3D 확장 UI** | `apps/web/src/domains/creator/bg3d/StudioBg3dSketchUpFullSections.tsx` | 섹션 6~9 아코디언 및 **현재 3D 장면에 즉시 배치 / 카메라 적용** 액션 |
| **Blender 5.2 전 기능 엔진** | `apps/web/src/domains/creator/bg3d/studio-bg3d-blender-full-engine.ts` | 6대 카테고리 모디파이어 스택 & GN 에셋(`MOD_ARRAY`, `MOD_CURVE_TO_TUBE`, `MOD_SCATTER_ON_SURFACE`), Edit Mesh 22종 & Sculpt 다이나토포·필터, Grease Pencil v3 레이어 트리·마스크·어니언 스킨 & Freestyle 9종 엣지 세트, Compositor 17종 노드 파이프라인, 물리 시뮬레이션(RigidBody·Cloth·Mantaflow Fluid), 어안 K0~K4·Shift X/Y·보케 조리개 카메라 & `BgPrimitive[]` 장면 생성기 |
| **Blender 5.2 확장 UI** | `apps/web/src/domains/creator/bg3d/StudioBg3dBlenderFullSections.tsx` | 섹션 6~10 제어 패널 및 **현재 3D 장면에 즉시 배치 / 카메라·선화 동기화** 액션 |
| **워크벤치 허브 실시간 연동** | `apps/web/src/domains/creator/bg3d/StudioBg3dAdvancedWorkbenchHub.tsx` | `useStudioBg3dProSuiteRuntime()` 브리지를 통해 SketchUp 3D 및 Blender 5.2의 카메라·렌즈 시프트·선화 미리보기·프리미티브 세트를 실제 3D 뷰포트에 즉시 반영 |
