# ToonStudio V11 상부 배경 소품

- 상태: current
- 제작일: 2026-11-13
- 제작자: ToonStudio
- 라이선스: **CC0 1.0** — 기존 ToonStudio 오리지널 절차형 GLB 팩과 같은 조건
- 라이선스 원문: <https://creativecommons.org/publicdomain/zero/1.0/>

아래 6개 GLB는 `scripts/blender/generate_kitbash_v11_upper_sets.py`와 Blender 5.2.0 LTS의
기본 도형·자체 Principled BSDF 재질로 제작했다. 외부 모델·텍스처·브랜드 로고·실물 제품 도면을
가져오지 않았다. 제3자 구매 에셋의 재배포 권한을 이 라이선스로 대체하지 않는다.

| 파일 | 내용 |
| --- | --- |
| `ceiling-hvac-cassette-duct.glb` | 천장 카세트 공조기·흡입구·노출 덕트 |
| `ceiling-track-spotlight-rig.glb` | 레일·스팟 조명 3기·렌즈 |
| `window-venetian-blind-pelmet.glb` | 명목 폭 2400mm 창호용 커튼박스·24개 슬랫·사다리 테이프·하단 레일, 전체 높이 1500mm |
| `alley-projecting-sign-wires.glb` | 벽 브래킷·돌출 간판 함체·인입 전선 |
| `classroom-ceiling-speaker-projector.glb` | 천장 조명·프로젝터·방송 스피커 장착부·함체·그릴·원형 드라이버 |
| `hanok-rafter-choma-lantern.glb` | 도리·서까래 3개·사각 초롱등 |

`thumbnails/*.png` 미리보기 6개도 위 GLB의 자체 재질 네이티브 렌더이며 같은 CC0 1.0 조건이다.
단위는 미터, glTF 상방은 `Y`다. 원점은 바닥이 아닌 상부 장착 기준이며 형상은 주로 음의 `Y`로
내려온다. 간판의 형상 상단은 장착 원점보다 15mm 아래에 있다. 창호 명목 폭은 2400mm이고
커튼박스 외곽 폭은 2440mm다. 바이트·SHA-256·제작 도구는 [provenance.json](provenance.json)에 기록한다.

선택한 에셋만 재생성하는 명령은 다음과 같다. 다른 4개 GLB는 다시 내보내지 않는다.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python scripts/blender/generate_kitbash_v11_upper_sets.py -- \
  --asset window-venetian-blind-pelmet --asset classroom-ceiling-speaker-projector --render-thumbnails
```
