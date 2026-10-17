# Libmypaint 현황 감사

이 문서는 MyPaint 브러시 엔진(libmypaint v1.6.1, ISC)을 brush-lab에 비교 레인으로 내재화한 현황을 문서화한다.
libmypaint는 ISC 라이선스(상용 이용 가능, `ok`)이므로 저장소에 그대로 두되, 외부 엔진 비교 레인으로만 유지한다(license-policy.md 4.5절).

## 감사 대상

- `apps/brush-lab/src/lanes/libmypaint-lane.ts`: libmypaint v1.6.1 브러시 엔진을 Sumi와 같은 픽스처·같은 입력으로 나란히 보는 비교 레인. 핀된 wasm을 사용하며, Sumi 프로그램 → `.myb` v3 설정 매핑은 `mypaint-settings-map.ts`가 담당한다.
- `apps/brush-lab/src/lanes/mypaint-settings-map.ts`: Sumi 프로그램 → libmypaint `.myb` v3 설정 문서 매핑. 지름·경도·흐름·간격·압력 동역학·색 등을 엔진 설정 이름으로 옮기며, 엔진에 대응 모델이 없는 매체(습식·임파스토·smudge)는 근사하지 않고 `LaneUnavailableError("not-implemented")`로 거부한다.
- `apps/brush-lab/src/lanes/hokusai-lane.ts`: Hokusai 0.3.0 자연 매체 래스터 비교 레인(동일 구조).

## 감사 결과

| 항목 | 내용 | 상태 |
| --- | --- | --- |
| libmypaint-lane.ts | 외부 엔진 비교 레인, 기존 코드 재사용 | 구현 완료(이미 존재) |
| mypaint-settings-map.ts | Sumi 프로그램 → `.myb` v3 설정 문서 매핑 | 구현 완료(이미 존재) |
| hokusai-lane.ts | Hokusai 0.3.0 비교 레인 | 구현 완료(이미 존재) |

## 라이선스 및 내재화 방침

- libmypaint v1.6.1은 ISC 라이선스(상용 이용 가능)이므로 저장소에 그대로 두되, 외부 엔진 비교 레인으로만 유지한다. 내부 소스에 복사·내재화하지 않는다(라이선스 정책 4.5절).
- Sumi 자체 브러시에 libmypaint 코드를 내재화하지 않는다. 필요한 개념(지름·경도·흐름·간격·압력 동역학·색)은 `mypaint-settings-map.ts`의 프로그램→설정 매핑으로만 재구현하며, 원본 코드는 복사하지 않는다.
- libmypaint 레인은 사용자 선택 비교 레인으로 유지되며, 기본 경로·인증 판정에는 포함되지 않는다(레지스트리 `comparison` 종류).

## 테스트

자동 테스트 없음(문서 검토만 수행). 레인 자체 테스트는 해당 레인 테스트 파일에서 개별 수행한다.

## 커밋

`docs(studio): Libmypaint 내재화 현황 감사 문서 추가`
