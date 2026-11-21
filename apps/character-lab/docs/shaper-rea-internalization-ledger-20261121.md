# Studio HORANG 3D SHAPER REA 전수 감사 및 클린룸 내재화 원장 (2026-11-21)

- **작성일**: 2026-11-21
- **분석 도구 및 정책**: `reverse-engineer-anything` (`rea@6.9.0`, `REA_ANALYSIS_PROVIDER=ghidra`, Hopper 미사용) 정적 메타데이터·관리 어셈블리 요약 조사
- **클린룸 준수**: 상용 3D 메쉬·텍스처·바이너리 코드·라이선스 로직은 단 한 줄도 복사하거나 우회하지 않았으며, 관측된 정적 사실(Evidence ID)·추론·미확인(`unknowns`)을 엄격히 분리해 순수 TypeScript/Three.js/Babylon.js로 수학·셰이더·슬롯·UI 워크플로만 구현했다.

---

## 1. 관측된 정적 사실 (Observed Static Facts)

| 대상 아티팩트 | Evidence ID (`rea@6.9.0`) | SHA-256 | 관측 요약 |
| --- | --- | --- | --- |
| `Shaper.app/Contents/Info.plist` | `ev_142709478b35100deb2a53ad8942431b0d990317742dd83b1422d92080612c65` | `e40939eb9b6d2c42d755255de240c7ccc620beb985feffc665a4e7238916d88b` | Bundle ID `com.StudioHORANG.SHAPER`, v1.05 (Build 9), Unity 6000.0.45f1 Mono 런타임 |
| `Assembly-CSharp.dll` (Summary) | `ev_a419d84482d9f87f24dacddc045ed0b0eecc32714ee11541b70874dd9b42bb45` | `cfb9e2ad3aee04fe6a7beaf7e27d9ec69abc1bfd54e5adfd0fbfd4144e3c189d` | 263 TypeDefs · 2,049 Fields · 1,770 MethodDefs · 29 AssemblyRefs (`Magick.NET-Q8-AnyCPU`, `TriLibCore`, `Unity.UniWindowController`, `ICSharpCode.SharpZipLib`) |
| `Assembly-CSharp.dll` (Members & `#US`) | `ev_68d6c88e9ee01240e6de3da949a20d0edc468051dcbf7275ff51acbb90b015e2` | `cfb9e2ad3aee04fe6a7beaf7e27d9ec69abc1bfd54e5adfd0fbfd4144e3c189d` | 핵심 SHAPER 타입 139개 및 `#US` 문자열 리터럴 1,225개 디코드 완료 (`MaterialData`, `BodyData`, `HeadPart`, `HairData`, `HairBaseData`, `EyeballData`, `BoneManager`, `UIObjects`, `UIManager`, `UIItemSlot`, `CustomData`) |
| `Assembly-CSharp-firstpass.dll` (Summary) | `ev_6e9a4242789065b56d3a47b76d74743bbce583dba70fe28b549b88f47e5e9c91` | `727a6709d24a4b6e430f8e84625a8ba29dd9a8c10295a478f3f467dd364f0f2f` | 325 TypeDefs · 2,283 Fields · 2,153 MethodDefs (`RootMotion.FinalIK` 95타입 · `RootMotion` 38타입) |
| `Assembly-CSharp-firstpass.dll` (Members) | `ev_a6553fa8d60dca1eda08ba608c86ededfc7a5d0b91ea044001e885451f73521d` | `727a6709d24a4b6e430f8e84625a8ba29dd9a8c10295a478f3f467dd364f0f2f` | `FullBodyBipedIK`, `AimIK`, `LookAtIK`, `FBBIKHeadEffector`, `LimbIK`, `DynamicBone` 구성 확인 |

---

## 2. SHAPER 핵심 기능 대조 원장 (Parity Ledger)

| 영역 | SHAPER 관측 심볼 (Evidence 기반) | ToonStudio 현재 구현 (`2026-11-21` 갱신) | 상태 |
| --- | --- | --- | --- |
| **3차 MatCap 음영 & 셰이더 토글** | `MaterialData::ApplyShadeLine`, `SetValuesFromUI`, `ToggleShader` (`Space`), `_ShadeColor`, `_RLightColor`, `_Outline_W=1.5`, `_Outline_H=0.3`, `simpleDisableInlineMatCapShader` (`hID*1`) | `character-shaper-gen3d-bridge.ts`, `character-shaper-mtoon-uniforms.ts`, `CharacterShaperSkinSection.tsx`, `StudioCharacterShaper.tsx` (`Space` 툰↔모델링 토글, `shadePos/shadeWidth/rLightPos/rLightWidth/outlineScale`, 음영·림·외곽선 색조 피커, 4종 원클릭 웹툰 프리셋) | 동등 이상 (완료) |
| **카메라 초점거리 & 조명** | `UIObjects.fovSlider`, `HeadPart.camFov`, `UIManager.SetFrontLight` | `CharacterShaperCameraControls.tsx` + `character-shaper-custom-quality.ts` (`24mm/35mm/50mm/85mm/135mm` 초점거리 ↔ 35mm 센서 수직 FOV 실시간 반영, 정면광 고정 토글 및 원본 위치 복원) | 동등 이상 (완료) |
| **안구 시선 & 4모드 하이라이트** | `EyeballData`, `EyeballHighlightType` (`fix=0, cam=1, light=2, world=3`), `eyeFixCamOn/Off` (`F10`), `eyeHighlightX/Y/A` | `CharacterShaperCameraControls.tsx` (4모드 시선 + 3×3 그리드 + `F10`), `CharacterShaperInspector.tsx` (`irises` 4모드 하이라이트 추적·밝기 조절), `apps/character-lab/src/render/babylon/character-engine-toon.ts` | 동등 이상 (완료) |
| **두상·얼굴·체형 정밀 모핑** | `HeadPart`, `BodyData::GetBodyHeight`, 5~8등신 비율, `bodyBoneSymmetry` | `CharacterShaperInspector.tsx` (얼굴 5축 + 시맨틱 9축 + 3D 두상 9스타일 34부위 믹서 + 2D 체형 매트릭스 21슬라이더), `CharacterShaperPoseSection.tsx` (신장 `cm`·등신비 실측 표시) | 동등 이상 (완료) |
| **모듈러 헤어 & 물리** | `HairData::SetVerticesPosFromControlPoints`, `CreateHairBaseMesh`, `PhysicsStart`, `HairBaseData` 4구역 UV | `apps/character-lab/src/domains/outfit/hair-builder.ts` (스플라인 튜브·다이아몬드 샤프니스·준정적 충돌 + 고분할 아치 카드/번들), `CharacterShaperHairInspector.tsx` (3분할 파츠·색고정·SpringBone `hitRadius >= 0.015` 관통 방지) | 동등 이상 (완료) |
| **포즈·손가락·표정·바인드 포즈** | `BoneManager::SetBindPose`, `ResetPose`, `MirrorPose` (`Alt+Click`), `RootMotion.FinalIK` | `CharacterShaperPoseSection.tsx` (전신/팔/다리 반전, A-포즈/T-포즈 원클릭 바인드 포즈, 0–100% 모션 스크러버, 2인/3인 상호작용 씬), `CharacterShaperInspector.tsx` (손가락 개별 굽힘 + 전체 표정 믹서·초기화) | 동등 (IK 세부 기즈모는 `vrm/` 영역과 연계) |
| **초보자 빠른 시작 & OKLCH 모션 UX** | `UIItemSlot` 수정자 클릭 (`Ctrl+클릭` 색 유지 / `Alt+클릭` 포즈 반전) | `CharacterShaperGenreStarters.tsx` (6종 웹툰 장르 1클릭 시작 카드), `CharacterShaperSlotRail.tsx` + `studio-character-shaper-workspace.css` (OKLCH 스펙트럼 활성 강조·마이크로 모션·`prefers-reduced-motion`·`forced-colors`·44px 터치 타깃) | 초격차 (완료) |
| **출력·호환성** | `Magick.NET` PSD 분리 (`밑색`/`음영`/`주선`), `TriLibCore` 외부 메쉬 임포트 | `character-shaper-psd-hair.ts`, `character-shaper-semantic-psd.ts`, `CharacterShaperOutputDock.tsx` (멀티패스 PNG/레이어 분리 PSD/턴어라운드/GLB 내보내기) | 동등 (완료) |

---

## 3. 사용자 최우선 버그(`#236`) — 커스텀 요소 적용 시 3D 품질 급락 근본 원인 및 수정

1. **절차형 헤어·의상·액세서리 저분할 각진 형상 & 플라스틱 광택 이질감 (`apps/character-lab/`)**:
   - `domains/outfit/geometry.ts`, `hair-builder.ts`: `CAP_RINGS`(6→12), `CAP_SEGMENTS`(24→36), `BUNDLE_SIDES`(6→12), 매듭 구(4×8→8×16) 상향 및 3열 아치형 리본 스트립(`appendContouredCardStrip`) 도입.
   - `domains/outfit/garments.ts`: 상자형 신발 밑창(`appendBox`)을 24분할 초타원 베벨 밑창(`appendContouredSole`)으로 교체, `sneakers` 재질을 `plastic`→`cloth-cotton`으로 정상화, 안경·모자 챙(3D 두께+곡면)·헤드폰(3단 베벨 쿠션)·초커·리본·귀걸이·후드·칼라·스커트 분할 수 및 두상 밀착 오프셋 정밀 보정.
   - `render/material-presets.ts` & `render/babylon/materials/material-factory.ts`: `plastic`의 과광택 클리어코트(`0.6/0.1`)를 새틴 웹툰 마감(`0.48`, `0.22/0.28`)으로 조정하고, 이미 PBR 텍스처를 가진 로드 GLB 소품에는 플라스틱 클리어코트를 강제 덧씌우지 않도록 수정.
2. **멀티 재질 소품 툰 텍스처 파괴 & 듀오 상대역 전체 플라스틱화 (`apps/character-lab/src/render/babylon/`)**:
   - `character-rig.ts`, `character-engine-toon.ts`, `character-engine.ts`: `RigPart.meshToons` 맵과 `resolveMeshToonMaterial`을 추가해 멀티 재질 GLB 소품이 툰 모드에서도 서브메시별 고유 알베도 텍스처·색상을 유지하고 해제 시 누수 없이 정리되도록 수정.
   - `hand-prop-attachment.ts`: `attachDuoPartnerToRig`의 일괄 `"accessory"` 하드코딩을 `inferDuoPartnerPartRole` 역할 추론(`hair`/`skin`/`head`/`eyeball`/`iris`/`top`/`bottom`/`shoes`)으로 교체해 피부 SSS·헤어 이방성·따뜻한 피부 음영 틴트가 정상 적용되도록 수정.
3. **커스텀 장착 후 MToon/비-MToon 재질 동기화 누락 & 이중 헤어·이중 의상 Z-fighting (`apps/web/src/domains/creator/character-shaper/`)**:
   - `character-shaper-custom-quality.ts` & `StudioCharacterShaper.tsx`: `avatarForgeState`·`wardrobeState`·`vrmPropItems`·`costumeState` 변경 시(및 비동기 마운트 직후 RAF) `applyShaperMtoonUniformsToVrm` + `syncCustomAttachmentQuality`를 재실행해 비-MToon 커스텀 파츠의 거칠기·금속도·`envMapIntensity`·`flatShading`·`SRGBColorSpace`·그림자를 본체와 일치시킴.
   - `useCharacterShaperBinding.ts`, `CharacterShaperHairInspector.tsx`, `CharacterShaperGarmentSection.tsx`: 원본 헤어→절차형 헤어 전환 시 `replaceOriginal: true` 자동 보정(`resolveHairCommitPatch`), 절차형 워드로브 장착 시 충돌하는 원본 VRM 의상 슬롯 자동 숨김 및 해제 시 복원(`computeOriginalCostumeHiddenKeysForWardrobe`), SpringBone `hitRadius >= 0.015` 하한 보장.

---

## 4. 추론(Inferences) 및 미확인 항목(Unknowns)

- **추론(Inferences)**:
  - `UIObjects.fovSlider`와 `HeadPart.camFov`의 수직 시야각 범위는 일반 35mm 카메라 초점거리(24–135mm) 대응으로 클린룸 설계했으며, SHAPER 내부 슬라이더 비선형 매핑 커브 자체는 재현하지 않았다.
  - `MaterialData.ToggleShader`의 모델링 셰이더 모드는 MToon의 `shadingToonyFactor=0.25`, 외곽선 비활성으로 입체 음영 검수 경험을 클린룸 등가 구현했다.
- **미확인 항목(Unknowns)**:
  - 상용 앱 내부 Unity AssetBundle(`.assets`)에 포함된 비공개 셰이더 HLSL 소스 원문 및 상용 메쉬/텍스처 리소스는 클린룸 정책에 따라 추출·참조하지 않았다.
  - 본 작업은 headless Node/jsdom 및 Babylon `NullEngine` + Vitest 단위/통합 테스트 기준으로 검증되었으며, 실제 WebGPU/WebGL2 GPU 픽셀 렌더 시각 검증은 별도 브라우저 실기기 프로브가 필요하다.
