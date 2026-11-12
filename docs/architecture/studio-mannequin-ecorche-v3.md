# Studio 3D 데생 인형 v3 — 에코르셰 해부학·프로 키네마틱스 아키텍처

## 1. 목적 및 배경

클립스튜디오 페인트(CLIP STUDIO PAINT)의 기본 3D 데생 인형은 원통·구 중심의 표면 형태와 고정된 쇄골 구조 때문에 다음 작화 병목이 존재한다.

1. 표면 근육 면(대흉근·삼각근·복직근·외복사근·견갑골·광배근·내측광근·비복근)과 명암 경계선(Asaro 평면 전환)이 드러나지 않아 작가가 다시 해부학 도해를 찾아봐야 한다.
2. 팔을 어깨 위로 들어 올리는 액션 포즈에서 쇄골·견갑골이 함께 회전하지 않아 삼각근과 승모근 경계가 찌그러진다.
3. 관절을 구부릴 때 근육 부피 변화 없이 도형이 서로 관통한다.
4. 카메라 왜곡이나 과장된 액션에서 인체가 실제로 서 있을 수 있는지(무게중심 추선과 접지 지지면) 판별하기 어렵다.
5. 2D 핸드 셋업 패드가 기본 주먹 프리셋에 머물러 엄지 대립(맞섬)과 손가락 밀착·벌림 연속 제어가 제한된다.

ToonStudio 3D 데생 인형 v3는 위 다섯 가지 한계를 직접 해결하면서도 클립스튜디오의 `.pep`(56본 포즈 XML) 및 `.3dp`(체형 비율 XML) 자산과 양방향 호환되도록 설계되었다.

## 2. 모듈 구성 및 책임 분리

모든 신규 모듈은 파일 크기 상한(800줄 이하)과 정적 번들 분리 규칙(Three.js 의존성은 3D 패널 청크 내부에만 격리)을 준수한다.

| 모듈 경로 | 계층 | 핵심 역할 |
| --- | --- | --- |
| [studio-mannequin-ecorche-anatomy.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-ecorche-anatomy.ts) | 순수 데이터·수학 | 에코르셰(`ecorche`)·아사로 다면체(`planar`)·클래식(`standard`) 표면 모드, 슈퍼엘립스 다중 단면 로프트 스펙, 표면 근육·골격 랜드마크(비대칭 내·외과 복숭아뼈 포함), 관절 굴곡 기반 능동 근육 팽창(`computeStudioMannequinFlexionBulge`), 2D 핸드 셋업 패드 및 손가락 벌림(`buildSplayedHandDigitPrimitives`) |
| [studio-mannequin-pro-kinematics.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-pro-kinematics.ts) | 순수 키네마틱스 | 관절 잠금(`StudioMannequinJointLockMap`), 2:1 견갑상완 리듬(`applyStudioMannequinScapulohumeralRhythm`), Winter 인체측정학 분절 질량 기반 무게중심(CoM) 분석 및 원클릭 균형 보정(`stabilizeStudioMannequinCenterOfMass`), 루미스 두상·정중선·단축 등고선 폴리라인 생성 |
| [studio-mannequin-csp-bridge.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-csp-bridge.ts) | 포맷 호환 브리지 | `@toonstudio/studio-format-gateway` 기반 클립스튜디오 `.pep`(19 주 관절 + 양손 30 손가락 마디) 및 `.3dp`(체형 비율) 양방향 가져오기·내보내기 |
| [studio-mannequin-pro-overlays.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-pro-overlays.ts) | Three.js 지오메트리 | 유기적 스무스 로프트 및 비공유 법선 아사로 다면체 `BufferGeometry` 생성, 작화 보조선·무게중심 추선 `THREE.Line` 그룹 수명 관리(캔버스 PNG 캡처 시 자동 숨김 및 `dispose` 완전 해제) |
| [studio-mannequin-scene-lighting.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-scene-lighting.ts) | Three.js 조명 | 라이팅 스튜디오 릭 계획의 Three.js 조명 마운트·교체·실측 스냅샷 분리 모듈 |
| [studio-mannequin-scene-figure.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-scene-figure.ts) | Three.js 피규어 | 주인공·2인 구도 상대 인형의 에코르셰 로프트·근육 메시 장착 및 포즈 변경 시 실시간 능동 근육 스케일 반영 |
| [StudioMannequinProSections.tsx](../../apps/web/src/domains/creator/scene-3d/StudioMannequinProSections.tsx) | React UI | 에코르셰 조형 모드·대흉근 볼륨·근육 선명도 슬라이더, 관절 잠금, 견갑상완 리듬 토글, 무게중심 상태 배지·자동 보정, 작화 보조선 토글, 인터랙티브 2D 핸드 셋업 패드, `.pep`/`.3dp` 입출력 UI |
| [build-ecorche-mannequin-v3.py](../../scripts/blender/build-ecorche-mannequin-v3.py) | Blender 5.2 DCC | 전용 격리 씬(`ToonStudio_Ecorche_Scene`)에서 다단 베벨 캡 쿼드 로프트 에코르셰 마스터 메쉬 + 51본 휴머노이드 리깅 생성 및 [toonstudio_ecorche_mannequin_v3.glb](../../apps/web/public/models/mannequin/toonstudio_ecorche_mannequin_v3.glb) 익스포트 |

## 3. 핵심 설계 불변식

1. **신장 불변식 보존**: `buildStudioMannequinEcorchePrimitives`는 `head` 관절에 별도 프리미티브를 추가하지 않으므로 모든 등신(3.0~9.0등신)과 신장(120~200cm)에서 `studioMannequinRestStature(spec) === spec.heightM` 계약이 그대로 유지된다.
2. **온디맨드 렌더링 및 캡처 순수성**: 상시 `requestAnimationFrame` 루프를 두지 않고 상태 변경 시 `invalidate()`로 1프레임만 그리며, `captureDataUrl()` 실행 중에는 루미스 보조선·단축 등고선·무게중심 추선·바닥 그리드·IK 핸들을 모두 숨긴 뒤 복원해 캔버스 삽입 이미지에 보조선이 섞이지 않는다.
3. **기존 영속 스냅샷 및 테스트 호환**: SQLite/OPFS 저장 포맷(`params`, `pose`, `partner`)과 `StudioMannequinSceneHandle`의 필수 메서드 시그니처를 변경하지 않고 v3 제어 메서드를 선택적(`?`) 확장으로 추가해 기존 통합 테스트와 영속 데이터를 깨뜨리지 않는다.
