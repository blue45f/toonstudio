# 자체 제작 SKP 카메라 golden과 유지 회귀 — 2026-10-29

상태: **current**. 2026-10-29에 성공한 자체 제작 파일의 SDK 저장·재읽기와, 저장소에 유지하는 파싱·GLB 전달 회귀를 기록한다. [기존 조사 보고서](./sketchup-native-rea-2026-10-29.md) 9절의 `before-dlopen` timeout은 당시의 중단 기록으로 보존하며 수정하지 않았다.

## 1. SDK로 직접 제작하고 재읽은 파일

공식 배포의 원래 framework를 읽기 전용으로 연결하고, 네트워크가 거부된 별도 소유 Python subprocess에서 C API `15.0`을 사용했다. `SUModelCreate`로 빈 모델부터 만들었으며 원본 template를 생성 입력으로 사용하지 않았다.

`SUGeometryInput`으로 삼각형 한 면을 넣고 Scene 카메라 세 개를 만든 뒤, 신규 SKP에 `SUModelSaveToFile`로 저장했다. 원래 모델을 해제하고 같은 신규 파일을 `SUModelCreateFromFile`로 다시 열어 Scene 수와 아래 활성 getter 값을 대조했다. 저장 전과 재읽기 뒤 값이 일치했고, `SUModelRelease=0`, `SUTerminate` 완료, 소유 프로세스 잔존 없음과 DMG 정상 분리를 확인했다. 해당 성공 실행의 자동 재시도는 0회다.

| Scene | SDK 저장·재읽기로 확인한 활성 값 | OpenSKP 1.3.0의 노출 범위 |
| --- | --- | --- |
| `native-vertical-fov35-aspect1_5` | 원근 FOV 35°, `FOVIsHeight=true`, aspect 1.5 | FOV 35°·좌표·투영 종류만 노출; FOV 축·aspect 미노출 |
| `native-horizontal-fov35-aspect1_5` | 원근 FOV 35°, `FOVIsHeight=false`, aspect 1.5 | 위와 동일하여 두 FOV 축 설정을 파서 출력만으로 구별할 수 없음 |
| `native-orthographic-height144` | 평행 투영 높이 144 inch, aspect 1.5 | `parallel=true`, `orthoHeight=144` 노출; aspect 미노출 |

공통 eye는 `[0,0,500]`, target은 `[10,20,30]` inch이며, 입력 up `[0,0,1]`과 SDK가 정규화해 돌려준 실제 up은 [expected JSON](../../apps/web/tests/fixtures/skp/native-camera-golden.expected.json)에 구분해 기록했다. 원근의 비활성 직교 높이와 평행 투영의 비활성 FOV는 SDK getter가 `SU_ERROR_NO_DATA(9)`를 반환하므로 파서의 해당 숫자를 native 정답으로 인증하지 않는다.

이전의 loader timeout 및 첫 신규 저장 시도에서 발생한 serialization 오류 `7`은 별도 실패 실험이다. 이후 사전 확인에서 부재했던 Python runtime cache 경로 하나의 쓰기만 추가 허용한 제어 실험에서 저장·재읽기가 성공했다. 네트워크 거부와 다른 외부 쓰기 제한은 유지했으며, 이 차이만으로 이전 실패의 유일한 내부 원인을 확정하지 않는다.

## 2. 저장소에 유지하는 corpus

[SKP 입력](../../apps/web/tests/fixtures/skp/native-camera-golden.skp)은 임시 출력이 아닌 의도된 장기 회귀 입력이다. [corpus 설명](../../apps/web/tests/fixtures/skp/README.md)과 [provenance·expected JSON](../../apps/web/tests/fixtures/skp/native-camera-golden.expected.json)을 함께 유지한다.

- 5,377 bytes, SHA-256 `dd4fdf607bc04de725b98b8c5c40daf7d37cea4232986870b6f3c5541a8f737e`.
- 직접 만든 삼각형 좌표: `[0,0,0]`, `[100,0,0]`, `[0,100,0]` inch. X/Y 직각변은 각각 100 inch다.
- 직접 만든 도형·Scene 세 개와 SDK 저장·재읽기 provenance를 유지한다. SDK·앱·원본 template 바이너리는 저장소에 포함하지 않았다.
- 테스트는 저장소의 fixture 바이트를 읽으며 SDK 설치나 개인 실험 폴더에 의존하지 않는다. SDK를 테스트 실행 중 다시 호출하지 않는다.

## 3. 실제 파서·변환·GLB 회귀

[유지 테스트](../../apps/web/src/domains/creator/bg3d/studio-bg3d-skp-native-camera-golden.test.ts)는 가짜 파서나 샘플 metadata 대신 위 입력과 실제 OpenSKP를 사용한다. [변환 코어](../../apps/web/src/domains/creator/bg3d/studio-bg3d-skp-conversion-core.ts), [main import](../../apps/web/src/domains/creator/bg3d/studio-bg3d-model-import.ts), `GLTFExporter`, GLB 재로드와 [검증된 sceneSource reader](../../apps/web/src/domains/creator/bg3d/studio-bg3d-skp-scene-provenance.ts)를 연결한다.

2026-10-29에 다음 **4개 회귀가 통과**했다.

1. 저장소 입력의 크기·SHA와 자체 제작·SDK 저장/재읽기 provenance 확인.
2. 실제 `parseSkp`의 원본 도형·eye/target/up·Scene 세 개·활성 FOV/직교 높이 대조. FOV 축·aspect 미노출과 manifest의 `camera-fov-basis-not-exposed` 진단 확인.
3. 실제 변환 코어에서 `inch → metre`, `Z-up → Y-up`의 `x,z,-y` 변환 확인. 삼각형은 `[0,0,0]`, `[2.54,0,0]`, `[0,0,-2.54]` m로 남고 원본 manifest의 좌표와 직교 높이 144 inch는 그대로 유지됨.
4. main import의 최종 GLB를 재로드해 원본 manifest 동일성, `authored-metres` 정책과 알려진 축·단위 변환 권위가 함께 보존됨을 확인.

현 manifest의 `fovBasis: "not-exposed"`는 위 파서 지원 한계를 나타낸다. native에서 읽은 축·aspect 값을 파서가 제공한 것처럼 보충하거나 원근 FOV를 임의로 세로 기준으로 해석하지 않는다. 비활성 투영 값의 일치도 요구하지 않는다. 검증 범위는 파일·기하·카메라 metadata 전달이며 meter-display `UnitsOptions`는 설정하지 않았다.

의존성이 준비된 저장소 루트에서 아래 명령으로 유지 회귀를 실행한다. 입력은 읽기만 하고 변환 결과는 메모리에서 검증한다.

```sh
pnpm exec vitest run apps/web/src/domains/creator/bg3d/studio-bg3d-skp-native-camera-golden.test.ts
```

corpus 추가 시 위 4개 테스트와 범위를 좁힌 strict TypeScript·ESLint·Secretlint·하네스 구조 검사가 통과했다. 이 보고서 변경에는 문서 Secretlint·`pnpm harness:check`·`git diff --check`만 실행했다. 전체 TSC·production build는 실행하지 않았으며, 이 기록 자체로 커밋·배포 완료를 주장하지 않는다.
