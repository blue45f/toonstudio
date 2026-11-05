# 모델 배포 검사기 독립 재검토 — 2026-11-05

상태: current. 앞선 P2·P3 지적을 **해결됨**으로 확인했다.

- `lstat(root)`가 직접 입력한 루트의 심볼릭 링크를 거부한다. 링크 CLI 재현은 exit0에서 exit2로 바뀌었다.
- 비디렉터리 루트도 명시적으로 거부하며 CLI exit2다.
- 정책 목록의 중복 SHA-256을 거부해 `[block, review]` 중복으로 차단을 해제할 수 없다.
- 회귀 assertion이 저장소 테스트에 추가됐다. `node --test scripts/check-restricted-model-distribution.test.mjs`: 2개 통과·실패0.
- 별도 합성 fixture의 CLI·정책 사례9개 전부 통과했다. 정상 파일0, block1, review-only0,
  root link·하위 link·파일 루트·없는 경로·잘못된 flag는2, 중복 정책은 거부한다.
- 실제 모델 가중치를 읽거나 복사하지 않았다. 테스트용 기대 hash·크기 대체는 독립 Node process의 메모리에서만 수행했다.
- 이번 재검토 중 아래 두 파일의 해시가 전후 동일했다. 저장소·Git ref·기존 모델에 대한 변경은 하지 않았다.

| 최종 파일 | SHA-256 |
| --- | --- |
| `scripts/check-restricted-model-distribution.mjs` | `d6b55ceac944619eb53e09bb54e385ce6e0e39da04fccf381a5d1265116d386f` |
| `scripts/check-restricted-model-distribution.test.mjs` | `5187134e455b75310ec8acbda16d04fc38bb5009194401efa90002df6391be18` |

초기 검토의 코드 읽기와 후속 hash 수집 사이에 부모가 수정을 시작했다. 따라서 이전 보고서의 source hash를
수정 전 코드의 식별자로 사용하면 안 된다. 위에서 내용을 다시 읽고 테스트와 함께 전후 hash를 대조한 최종
확인 기록이 지적의 현재 상태를 판정하는 근거다.

사례별 실행 결과와 최종 source hash:
`/tmp/toonstudio-model-checker-fix-confirmation-2026-11-05.json`.
그 JSON의 SHA-256: `ffd77fc962026c905cca612795c2d95c577c907908eb6d4c3513186a28e63288`.

추가 차단 사유는 발견하지 못했다. 알려진 원본 바이트의 정적 detector라는 범위, 압축·변환된 모델과
전체 상용 권리를 보증하지 않는다는 한계는 그대로 적용된다. UI·전체 앱 검사·빌드·배포는 이번 재검토 범위 밖이다.
