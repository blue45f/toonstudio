# Blender UV 분석과 자체 웹 UV 편집 계약

상태: **migration**. 2026-10-29의 구현 브랜치에서 코너 UV 권위·웹 편집·체크무늬 표시·GLB/Worker 전달을 연결하고 있다.
작은 단위 검증과 실제 Blender 실행 관측을 WebGL 브라우저 검증·전체 하네스 통과와 구분한다.
운영 제공 완료 기록은 아니다. 기본 방향과 바이너리 버전은 [웹 모델링 계약](blender-native-modifier-contracts.md)을 따른다.
전체 아일랜드를 한 타일에 배치하는 후속 구현은 [웹 UV 정리 계약](blender-native-uv-pack-contracts.md)을 따른다.

## current — 확인한 원본 계약

분석 대상은 앞선 모디파이어 관측과 같은 Blender 5.2.0 LTS `fbe6228777e7`, Darwin arm64다.
바이너리 SHA-256은 `60ba7a9b6743f7acf101274361fa76409e382ae07cd2007ce07dea30f6b129f2`다.
이번 UV 조사에서는 새 전체 바이너리 auto-analysis나 native 함수 디컴파일을 수행하지 않았다.

- UV는 공유 3D 정점 하나가 아니라 면의 **코너 loop**에 결합한다. 원본 변환 준비 코드가 선택된 loop마다
  변환 데이터를 만든다. 별도 코너를 각각 센 평균 pivot은 아래 실행 관측과도 일치했다.
  이미지 aspect 보정이 있는 원본과 달리 현재 웹 체크무늬는 정사각형 기준이다.
  [공식 transform_convert_mesh_uv.cc](https://raw.githubusercontent.com/blender/blender/v5.2.0/source/blender/editors/transform/transform_convert_mesh_uv.cc)
- 원본의 공유 변 UV 비교와 select-linked의 연결 지도는 구분한다. `BM_loop_uv_share_edge_check`는
  공유 변 양 끝의 좌표를 정확히 비교한다. `UvVertMap` 계열에는 `STD_UV_CONNECT_LIMIT=0.0001f`가 있다.
  한 경로의 정확 비교를 Blender의 모든 아일랜드 선택·pack 동작으로 일반화하지 않는다.
  [공식 bmesh_query_uv.cc](https://raw.githubusercontent.com/blender/blender/v5.2.0/source/blender/bmesh/intern/bmesh_query_uv.cc),
  [공식 BKE_mesh_mapping.hh](https://raw.githubusercontent.com/blender/blender/v5.2.0/source/blender/blenkernel/BKE_mesh_mapping.hh)
- 배포 동봉 glTF exporter의 `primitive_extract.py` 1428–1440행은 UV를 Float32 코너 배열로 읽고
  `V`를 `1−V`로 바꾼다. 예를 들어 `(0.1,0.2)`는 glTF에서 약 `(0.1,0.8)`,
  `(-0.25,1.5)`는 `(-0.25,-0.5)`다. 타일 밖 좌표를 0..1로 자르지 않는다.
  REA 패키지 항목 조회 Evidence는 `ev_724b0f6ec9c8f5d8874e0917b4516b6dac9e75286727f8b9b119abfb1501f8ca`,
  선택 뷰는 `ev_3f01c6a9c2ae00b70e280b28c4a45525f4c2f7cb9164f5574889c87561004d95`다.
  동봉 소스 경로는 `/Applications/Blender.app/Contents/Resources/5.2/scripts/addons_core/io_scene_gltf2/blender/exp/primitive_extract.py`다.
- Solidify의 앞 shell은 코너를 복사하고 뒤 shell은 winding에 맞춰 코너 순서를 반전한다.
  rim은 경계의 두 코너를 `[k2,k1,k1,k2]`로 복제한다. 따라서 기본 rim UV가 접힌 형태라는
  정적 근거가 있으며 별도의 UV 폭을 추측해서 만들지 않는다.
  [공식 MOD_solidify_extrude.cc](https://raw.githubusercontent.com/blender/blender/v5.2.0/source/blender/modifiers/intern/MOD_solidify_extrude.cc)

## migration — 정본 데이터와 편집

`mesh.uvLayer`는 revision 1, topology hash, halfedge origin(`prev.vertex`)별 `{halfEdgeId,u,v}`를 가진다.
코너는 ID 순으로 정확히 한 번 포함하고 좌표는 유한 Float32다. 음수·다른 타일·0배율은 유효하다.
아일랜드 membership은 원본 데이터로 저장하지 않고 현재 공유 변의 UV 연결에서 파생한다.
웹 편집기의 기본 연결은 양 끝 정확 비교이며 커널은 제한된 tolerance 옵션도 제공한다.

- UV 없는 기존 메시 해시와 직렬화에는 새 바이트·키를 넣지 않는다.
- UV가 있으면 exact mesh hash에 포함한다. UV를 결합하지 않는 과거 8자리 해시로 UV 스냅샷을 받지 않는다.
- topology hash는 위치·crease·재질을 제외한다. 위치 편집과 UV 편집은 원본 위상·ID를 유지한다.
- UV 펼치기와 변환은 기존 geometry 명령으로 한 번만 확정한다. 복사본 미리보기는 원본·undo 이력을 바꾸지 않는다.
- 현재 문서·자산·버전·UV hash에 결합한 선택만 받는다. 계정·프로젝트·선택·작업 모드 변경은 오래된 결과를 폐기한다.
- Box는 면 법선에 따라 여섯 패치를 배치하는 웹의 기본 투영이다. Blender의 cube projection·pack 전체 알고리즘과
  같은 출력이라고 주장하지 않는다. 평면 XY/XZ/YZ 투영도 제공한다.

재질 작업 모드의 SVG는 아일랜드·개별 코너를 선택하고 끌어 이동할 수 있다. 숫자로 이동·도 회전·크기를
지정하고 적용·취소·undo/redo한다. 코너가 겹치거나 0배율로 접혀도 키보드 목록으로 개별 선택할 수 있다.
체크무늬는 표시 전용이며 이미지 텍스처를 작업파일에 저장하거나 텍스처 페인트를 완성했다는 뜻은 아니다.

## migration — 화면·파일 출력

뷰포트는 원본 fan의 삼각형 순서로 코너 UV를 전달한다. UV seam에서 표시 정점을 분리하되 smooth 법선은
분리 전 이웃 면으로 계산한다. UV 편집 모드에서는 수정자 캐시에 원본 UV를 잘못 붙이지 않고 원본 cage를 표시한다.

GLB는 원본 면·정점 대응에 따라 UV를 출력 정점으로 옮기고 `TEXCOORD_0`을 쓴다. V 방향을 바꾸며 UV seam과
UV가 있는 3D collinear 코너도 유지한다. Worker의 기존 SoA section은 그대로 두고 선택적 Float32 UV 스트림을
추가했으며 offset·길이·전체 CRC·provenance CRC·복원 topology/좌표 검증을 모두 거친다.

현재 단위 검증에서 직접 출력과 transferable payload 복원 뒤 출력의 GLB 바이트가 같고,
UV 없는 flat cube·smooth cube·비평면 quad는 이전 커밋 `06ed3b4`의 GLB 바이트와 완전히 같다.
수정자와 Region Extrude의 UV 전파는 아래 지원 범위별 회귀로 검증했다.
원본 코너를 평가 메시 길이에 맞춰 붙이는 방식은 사용하지 않는다.

## current — 실제 Blender 관측과 작은 회귀

새 factory-startup background 프로세스에서 관측 스크립트가 exit 0으로 완료됐다.
[관측 fixture](../../tests/corpus/blender-uv/uv-transform-5.2.json)는 source 예상과 실제 `observed`를 구분해 보존한다.
중복 loop가 있는 6개 UV의 평균은 `(1,2/3)`이며, 원본의 180도 회전과 0배율 결과를 웹의 모든 코너와
`1e-6` 허용 오차로 대조한다. 0배율은 모든 코너가 `(1,0.6666667)`로 모였다.
실제 native GLB에도 `(0.1,0.8)`·`(-0.25,-0.5)`가 출력되어 비대칭 V 변환과 범위 밖 좌표 보존을 확인했다.

지원되는 Array·Mirror·SimpleDeform·Solidify는 원본 triangle/corner provenance로 UV를 전파한다.
정확한 전파가 없는 enabled 수정자는 UV를 버리고 성공하지 않으며 명시적 오류를 낸다.
Region Extrude는 발급된 receipt의 face remap·boundary 순서로 기존 면·cap·side를 결합하고,
Weld는 위상이 그대로면 UV를 보존한다. Inset·Bevel·Loop Cut·Subdivision과 삼각화 기반 Sculpt·Cloth 등
다른 위상 편집의 UV 전달은 남은 범위다.
UV 원본을 UV 없는 결과로 교체하는 일반 메시 commit과 수정자 적용은 중앙 geometry authority에서 거부한다.
지원 전 편집은 오류를 표시하고 원본·저널·undo를 보존하며 UV를 조용히 지우고 성공하지 않는다.

## current — 실제 웹 실행 증거

2026-10-29의 Chromium WebGL 실행에서 실제 메시의 UV BufferAttribute(36코너)와
64×64 DataTexture를 확인했다. UV 이동 미리보기는 UV 버퍼와 체크무늬 픽셀을 바꾸고
3D 위치 배열을 유지했다. 선택 영역 67,500픽셀 중 16,571픽셀이 달라졌다.
취소 후 복원, 적용, undo/redo는 React 렌더가 반영된 뒤의 실제 버퍼로 비교했다.

실제 파일 버튼으로 27,560바이트 `.toon3d`를 내려받고 새로고침 후 같은 UV 버퍼를 복원했다.
이 파일을 브라우저 API로 decode하여 실제 module Worker로 출력한 GLB는 3,656바이트이며,
`TEXCOORD_0`은 Float32 VEC2 24정점을 포함했다. 이 관측은 별도 API 실행 증거이고
제품의 GLB 내보내기 버튼을 클릭했다는 증거로 대신 쓰지 않는다.
WebGL 실행 증거는 물리 GPU 사용 여부를 보증하지 않는다.

## target — 남은 검증과 범위

- [관측 스크립트](../../tools/blender-research/observe_uv_contracts.py)는 평균 pivot·0배율·비대칭 GLB UV를 검사한다.
  모든 UV operator·아일랜드 선택·이미지 aspect까지 실행 검증한 것은 아니다.
- 전체 하네스·타입 검사·Web 빌드의 최종 결과와 경계값·테마 검증은 별도로 기록한다.
- 일반 UV seam 저작·핀·비정사각 이미지 aspect·다중 UV 레이어·Blender 전체 unwrap/pack은 후속 범위다.
- 이미지 재질·텍스처 페인트와 범용 shader graph 저작은 별도 렌더·저장 계약이 필요하다.

저장소 루트의 개발 환경에서 공유 검사 자원을 사용할 수 있을 때 아래 명령으로 관측을 재현한다.
기존 `.blend`를 읽거나 사용자 Blender 프로세스에 연결하지 않으며 임시 디렉터리에 자체 GLB만 만들었다 지운다.
성공은 프로세스 exit 0과 `observed`의 실제 operator/export 결과로 판단한다.

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --disable-autoexec --python-exit-code 42 \
  --python tools/blender-research/observe_uv_contracts.py \
  -- --output /tmp/toonstudio-blender-uv-observations.json \
  > /tmp/toonstudio-blender-uv-observations.log 2>&1
```
