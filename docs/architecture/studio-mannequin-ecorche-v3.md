# Studio 3D 데생 인형 v4 — 에코르셰 싱글스킨·51본 스키닝·사면도·동세 연출 아키텍처

## 1. 목적 및 배경

클립스튜디오 페인트(CLIP STUDIO PAINT)의 기본 3D 데생 인형은 원통·구 중심의 표면 형태와 고정된 쇄골 구조, EX 등급에만 제한된 사면도 등 다음 작화 병목이 존재한다.

1. 표면 근육 면(대흉근·삼각근·복직근·외복사근·견갑골·광배근·내측광근·비복근)과 명암 경계선(Asaro 평면 전환)이 드러나지 않아 작가가 별도의 해부학 도해를 다시 찾아봐야 한다.
2. 팔을 어깨 위로 들어 올리는 액션 포즈에서 쇄골·견갑골이 함께 회전하지 않아 삼각근과 승모근 경계가 찌그러진다.
3. 코어 도형과 외피 메시가 겹치면 외곽선 2중 겹침과 Z-파이팅이 발생해 선화 추출 품질이 저하된다.
4. 전신 비율과 공간 배치를 동시에 점검하기 위한 4분할 사면도(All Sides View)와 만화적 원근 과장 화각(15°~85°), 3D 동세선(Line of Action)·콘트라포스토·카메라 시선 응시 도구가 분리되어 있다.

ToonStudio 3D 데생 인형 v4는 위 병목을 모두 해결하면서도 클립스튜디오의 `.pep`(56본 포즈 XML) 및 `.3dp`(체형 비율 XML) 자산과 양방향 호환되도록 설계되었다.

## 2. 모듈 구성 및 책임 분리

모든 신규·확장 모듈은 파일 크기 상한(신규 파일 800줄 이하, 기존 파일 베이스라인 이하)과 정적 번들 분리 규칙(Three.js 의존성은 3D 패널 청크 내부에만 격리)을 준수한다.

| 모듈 경로 | 계층 | 핵심 역할 |
| --- | --- | --- |
| [studio-mannequin-ecorche-anatomy.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-ecorche-anatomy.ts) | 순수 데이터·수학 | 에코르셰(`ecorche`)·아사로 다면체(`planar`, 8각 두상 마스크 + 골반 배신 포함)·클래식(`standard`) 표면 모드, 레거시 중복 코어 도형 선별 스킵(`shouldSkipLegacyCoreBodyPrimitive`), 관절 굴곡 기반 능동 근육 팽창, 2D 핸드 셋업 패드 및 손가락 벌림 |
| [studio-mannequin-pro-kinematics.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-pro-kinematics.ts) | 순수 키네마틱스 | 관절 잠금(`StudioMannequinJointLockMap`), 2:1 견갑상완 리듬, Winter 19분절 질량 기반 무게중심(CoM) 분석 및 원클릭 균형 보정, 루미스 두상·정중선·단축 등고선 폴리라인 생성 |
| [studio-mannequin-gesture-dynamics.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-gesture-dynamics.ts) | 순수 동세·연출 | 정수리→척추→골반→지지발 3D Catmull-Rom 동세선(`analyzeStudioMannequinGesture`), 어깨·골반 반대 기울기 정량 측정 및 좌·우 콘트라포스토 생성(`buildStudioMannequinContrappostoPose`), 가슴(15%)·목(35%)·머리(50%) 시선 응시(`applyStudioMannequinGazeTarget`), 들숨·날숨 흉곽 확장(`applyStudioMannequinBreathingParams`) |
| [studio-mannequin-csp-bridge.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-csp-bridge.ts) | 포맷 호환 브리지 | `@toonstudio/studio-format-gateway` 기반 클립스튜디오 `.pep`(19 주 관절 + 양손 30 손가락 마디) 및 `.3dp`(체형 비율) 양방향 가져오기·내보내기 |
| [studio-mannequin-quad-view.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-quad-view.ts) | Three.js 뷰포트 | 단일 WebGL 캔버스 온디맨드 2×2 4분할 사면도(주 투시 + 정면·측면·탑뷰 직교) 시저 렌더링 및 만화 원근 화각 프리셋(망원 18° · 표준 35° · 광각 58° · 초광각 78°) |
| [studio-mannequin-pro-overlays.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-pro-overlays.ts) | Three.js 오버레이 | 스무스 에코르셰 및 비공유 법선 아사로 다면체 `BufferGeometry`, 3D 동세선·루미스 보조선·단축 등고선·무게중심 추선 `THREE.Line` 수명 관리(캡처 시 자동 숨김) |
| [studio-mannequin-scene-lighting.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-scene-lighting.ts) | Three.js 조명 | 라이팅 스튜디오 릭 계획의 Three.js 조명 마운트·교체·실측 스냅샷 분리 모듈 |
| [studio-mannequin-scene-figure.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-scene-figure.ts) | Three.js 피규어 | 주인공·2인 구도 상대 인형의 싱글스킨 에코르셰 로프트·근육 메시 장착 및 포즈 변경 시 실시간 능동 근육 스케일 반영 |
| [StudioMannequinProSections.tsx](../../apps/web/src/domains/creator/scene-3d/StudioMannequinProSections.tsx) | React UI | 6종 웹툰 캐릭터 원형 프리셋(23파라미터 통합), 에코르셰·호흡 확장 슬라이더, 관절 잠금, 견갑상완 리듬, 동세·콘트라포스토·카메라 시선 응시, 2D 핸드 셋업 패드, `.pep`/`.3dp` 입출력 UI |
| [StudioMannequinCameraSection.tsx](../../apps/web/src/domains/creator/scene-3d/StudioMannequinCameraSection.tsx) | React UI | 원근/직교 투영, 4분할 사면도 토글, 만화 원근 화각(FOV 15°~85°) 슬라이더 및 렌즈 프리셋, 카메라 앵글, 캡처 배율, 실시간 웹캠 모션 트래킹 제어 |
| [build-ecorche-mannequin-v3.py](../../scripts/blender/build-ecorche-mannequin-v3.py) | Blender 5.2 DCC | 전용 격리 씬(`ToonStudio_Ecorche_Scene`)에서 다단 베벨 캡 쿼드 로프트 에코르셰 마스터 메쉬 + 51본 세그먼트 가우시안 버텍스 웨이트 스키닝(`ARMATURE` 모디파이어 + glTF `skins`) 생성 및 [toonstudio_ecorche_mannequin_v3.glb](../../apps/web/public/models/mannequin/toonstudio_ecorche_mannequin_v3.glb) 익스포트 |

## 3. 핵심 설계 불변식

1. **신장 불변식 및 싱글스킨 무결성**: `shouldSkipLegacyCoreBodyPrimitive`는 Three.js 메시 인스턴스화 단계에서만 중복 코어 `body` 도형을 생략하고 `spec.primitives` 원본 배열은 변형하지 않으므로, 모든 등신(3.0~9.0등신)·신장(120~200cm)·웹툰 원형 6종에서 `studioMannequinRestStature(spec) === spec.heightM` 계약이 유지되며 외곽선 2중 겹침과 Z-파이팅이 제거된다.
2. **온디맨드 렌더링 및 캡처 순수성**: 4분할 사면도와 동세선 오버레이 모두 상시 루프 없이 `invalidate()` 시에만 1프레임 렌더링되며, `captureDataUrl()` 실행 중에는 3D 동세선·루미스 보조선·단축 등고선·무게중심 추선·바닥 그리드·IK 핸들을 모두 숨긴 뒤 복원한다.
3. **기존 영속 스냅샷 및 테스트 호환**: 호흡 확장(`breathPhase`), 사면도(`quadView`), 화각(`cameraFovDeg`)은 비파괴 뷰·스펙 파생 상태로 운용되어 초기 `STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS` 영속 스냅샷 계약과 `StudioMannequinSceneHandle` 선택적(`?`) 메서드 호환성을 100% 유지한다.
