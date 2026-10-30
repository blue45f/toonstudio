# 자체 웹 UV 아일랜드 정리 계약

상태: **migration**. 2026-10-29의 후속 브랜치에서 현재 오브젝트의 코너 UV를 한 타일에 정리하는
기능을 구현 중이다. 앞선 웹 메시·UV 편집 커밋 `9903b0094`와 별도 브랜치이며 운영 제공 완료 기록은 아니다.
정본·파일·렌더 계약은 [UV 편집 계약](blender-native-uv-contracts.md)을 따른다.

## current — 원본에서 확인한 정적 계약

분석 대상은 Blender 5.2.0 LTS이며 이번 pack 조사는 우선 공식 v5.2.0 코드와 동봉 UI의 REA 관측에 근거한다.
native pack 실행 결과와 배치 순서·밀도가 웹 출력과 같다는 증거는 아직 없다.

- `rotate`를 끄면 회전을 금지하고, 켜면 `rotate_method`를 사용한다. 공개 값 `CARDINAL`은
  90도 단위 회전이다. 기본값 `ANY`와 구분한다.
- `shape_method`의 `AABB`, `CONVEX`, `CONCAVE`는 다른 형상 처리이며 원본 기본은 `CONCAVE`다.
  웹의 사각 경계 기반 정리를 원본 기본 패킹과 같은 출력·밀도라고 설명하지 않는다.
- `margin_method`는 기존 UV 크기에 의존하는 `SCALED`, 기존 단위에 더하는 `ADD`, 최종 출력 비율을
  사용하는 `FRACTION`을 구분한다. 기본 `SCALED`의 수치를 웹의 타일 절대 간격으로 재해석하지 않는다.
- 원본은 선택 범위·핀·이미지 비율·UDIM도 처리한다. 현재 웹 정본에 없는 핀·다중 UV 계약까지 구현했다고
  주장하지 않는다. 원본의 공개 RNA에는 회전·핀 모드 문자열 `NONE`이 없으므로 비활성화는 Boolean을 사용한다.

근거는 [GEO_uv_pack.hh](https://github.com/blender/blender/blob/v5.2.0/source/blender/geometry/GEO_uv_pack.hh#L20),
[옵션 적용](https://github.com/blender/blender/blob/v5.2.0/source/blender/editors/uvedit/uvedit_unwrap_ops.cc#L1684),
[공개 enum](https://github.com/blender/blender/blob/v5.2.0/source/blender/editors/uvedit/uvedit_unwrap_ops.cc#L1737),
[RNA 등록](https://github.com/blender/blender/blob/v5.2.0/source/blender/editors/uvedit/uvedit_unwrap_ops.cc#L1872)이다.
REA의 동봉 `IMAGE_MT_uvs.draw` 관측은 `uv.pack_islands` 메뉴 호출을 확인했으며 알고리즘 실행 관측은 아니다.
parent Evidence는 `ev_c03e6e53dbf2ed704c114d7099c36208e0fbab16faf2f65c94dd4147b30d53e5`,
선택 Evidence는 `ev_b19aa2c8ff52fd8939ec27743a187799781b10390361e23208ae32bc15aaead9`다.

## migration — 웹 정리의 구현 목표

현재 선택 오브젝트의 전체 UV 아일랜드를 대상으로 한다. 각 아일랜드는 기존 공유 변 양끝의 정확한 코너
좌표 연결에서 파생한다. 공통 양수 배율과 이동, 사용자가 허용한 90도 회전만 사용한다.
원본 3D 위치·위상·ID·재질·법선·선택 요소를 바꾸지 않고 UV 코너만 갱신한다.

웹 여백은 0..1 타일 경계와 서로 다른 아일랜드의 사각 경계 사이에 확보할 절대 UV 간격이다.
기본값은 0.02, 90도 회전 허용이며 입력 범위는 유한한 0..0.25다. 0을 요청해도 다른 아일랜드가
반올림 후 연결되지 않도록 최소 `2^-20`의 유효 간격을 확보한다. 요청 여백과 유효 간격을 구분한다.

결정적 shelf 배치는 최적 밀도를 보증하지 않는다. 기존 최대 코너 예산을 지키고 정렬·제한된 수의 배치
후보·행별 검증으로 처리량을 제한한다. 작은 임의 아일랜드 개수 상한에 맞춰 정상 메시를 자르지 않는다.
확정할 Float32 좌표에서 타일 범위·여백·연결 집합을 다시 검사한다. 양의 폭·높이나 유효 fan 삼각형 면적이
반올림 때문에 새로 접히면 성공 처리하지 않는다. 개별 UV 면의 기존 접힘·겹침·교차는 다시 펼치거나
복구하지 않고 같은 상대 형태로 옮긴다. 예를 들어 Solidify의 접힌 rim UV를 포함하더라도 전체 아일랜드의
사각 경계가 유효하면 정리할 수 있어야 한다. 현재 너비·높이가 없는 전체 아일랜드는 오류로 설명하며
UV를 추측해서 새로 만들지 않는다.

정리는 명시적인 **UV 정리 적용**으로 한 번만 확정하고 기존 undo/redo·자동 저장·작업파일·GLB 경계를 쓴다.
선택 변형 미리보기가 남아 있으면 먼저 적용하거나 취소하도록 안내한다. 정리 버튼이 미리보기를 조용히
버리지 않는다. 계정·프로젝트·문서·현재 원본이 바뀐 늦은 결과는 기존 편집 lease에서 폐기한다.

집중 검증은 커널·작업공간·실제 UI wiring을 함께 실행한 3파일 39개가 exit 0으로 통과했다.
4,096개 아일랜드·16,384코너, 내부 우회 경로가 있는 seam의 반올림 합침 거부, Solidify의 접힌 rim을
포함한 정리, 같은 결과의 no-op, 단일 undo/redo·파일·실제 GLB UV 전달을 포함한다.
전체 50만 코너 스트레스·최종 전체 타입·Web 빌드·실제 브라우저 조작은 아직 이 후속 브랜치에서 실행하지 않았다.

## target — 검증과 실행 관측

- 정리 후 모든 코너의 원본 대응·공통 배율·허용 회전·Float32 여백·경계·분리 검증
- 음수 타일·큰 좌표·긴 아일랜드·다중 면 연결·회전 끔·0여백·과한 여백·퇴화·예산·결정성 검증
- 원본·명령 이력 불변, 같은 결과의 no-op, 단일 undo/redo, 작업파일과 실제 GLB UV 왕복 검증
- 실제 UI의 입력·초안 잠금·오류·비동기 lease·키보드 경계와 WebGL 체크무늬·테마 검증
- 전체 하네스·타입·Web 빌드는 다른 채팅과 공유하는 큰 검사 순서가 돌아온 뒤 실행

[native 관측 스크립트](../../tools/blender-research/observe_uv_pack_contracts.py)는 새 background 프로세스에서
네 개의 비대칭 사각 UV 아일랜드만 만든다. `AABB/CARDINAL/FRACTION/ACTIVE_UDIM`을 명시하고,
회전 끔·0.02·0·0.1 여백 사례의 출력 배율·방향·범위·실제 분리 간격을 기록한다.
문법 검사는 통과했으나 아직 실행하지 않았다. 실행 전 상태를 실제 Blender 관측 fixture로 취급하지 않는다.

저장소 루트에서 Blender 5.2가 설치되고 공유 검사 자원을 사용할 수 있을 때 실행한다.
다른 Blender 프로세스나 기존 `.blend`에 연결하지 않는다. 성공은 exit 0과 `FINISHED` 및 관측 불변식으로 판단한다.

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --disable-autoexec --python-exit-code 42 \
  --python tools/blender-research/observe_uv_pack_contracts.py \
  -- --output /tmp/toonstudio-blender-uv-pack-observations.json \
  > /tmp/toonstudio-blender-uv-pack-observations.log 2>&1
```
