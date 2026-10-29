# deepmerge 결과 객체 프로토타입 오염 방지

상태: **current — 저장소 보안 백포트**, 2026-10-28.

`deepmerge@4.3.1`의 npm 배포본을 기준으로, 결과 객체에 쓰는 세 곳에서
`Object.defineProperty`로 enumerable·writable·configurable 자체 데이터 속성을 만든다.
기존 `destination[key] = value`는 `__proto__`라는 자체 키나 null-prototype 입력을 병합할 때
새 결과 객체의 상속 프로토타입을 바꿀 수 있다. 자체 데이터 속성 쓰기는 값을 보존하면서
이 암묵적 setter 호출을 막는다. 입력 검사·배열·clone·customMerge 정책은 변경하지 않는다.

- 대상: [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
- 원본: npm `deepmerge@4.3.1`, [공식 저장소](https://github.com/TehShrike/deepmerge).
- 변경은 CJS·UMD 배포 파일의 같은 세 쓰기와 작은 자체 속성 helper뿐이다.
- `index.d.ts`와 MIT `license.txt`는 원본 바이트 그대로 보존한다.
- `UPSTREAM.json`에 원본과 백포트 파일의 SHA-256을 기록한다.
- 업스트림 원문 주석·API 문서는 라이선스와 출처 보존을 위해 영어를 유지한다.

2026-10-28 공식 advisory에는 수정 버전이 없고 npm의 `deepmerge@4.3.2`도 존재하지 않는다.
제안 PR #274는 병합되지 않았으므로 이 변경을 공식 수정판으로 표시하지 않는다.

`pnpm-workspace.yaml`은 취약 범위만 `file:patches/deepmerge`로 연결한다. 저장소의 기존
`patches/braces`와 같은 방식이다. 이 로컬 패키지는 npm 감사의 레지스트리 대상에서 빠지므로,
감사 녹색 자체를 수정 증거로 쓰지 않는다. 실제 Nest → nestjs-zod 소비 경로의 설치본 동일성,
공개 PoC, CJS·UMD, 옵션·배열·심볼·null-prototype 입력과 정상 입력의 차등 회귀가 수정 근거다.
감사 제외 설정은 추가하지 않는다. 새 upstream advisory와 릴리스는 자동 감사가 대신 보장하지 않는다.

공식 수정판이 배포되고 같은 회귀를 통과하면 override·이 폴더를 제거하고 레지스트리 패키지로
되돌린다. upstream MIT 저작권 고지는 `license.txt`를 따른다.
