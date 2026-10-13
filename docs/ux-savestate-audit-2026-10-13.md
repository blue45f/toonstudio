# 에디터 저장 상태 상시 표시 — 감사 (2026-10-13)

# 에디터 저장 상태 상시 표시 — 감사 & 구현 초안 (병렬 작업 3번, 2026-10-13)

## 1. 감사 결과: "없다"가 아니라 "만들었지만 연결이 안 됐다"

벤치마크 과제("저장 상태를 상시 문구로")에 대해 레포를 감사한 결과, 필요한 부품이 **전부 존재**한다. 문제는 조립이 안 돼 있다는 것이다. PRODUCT.md의 경고("라우트나 메뉴가 존재한다는 사실만으로 기능 완료를 주장하지 않는다")와 정확히 같은 패턴이다.

| 부품 | 파일 | 상태 |
| --- | --- | --- |
| 복구 저널 + 상태 계산 (순수 로직) | `apps/web/src/domains/creator/studio-operation-recovery-coordinator.ts` (197줄) | 완성. `resolveSaveSyncStatus(journal, isOnline, isOpfsActive)` → `{ localDurable, pendingOperationsCount, lastSavedAt, lastCheckpointAt, cloudSyncStatus: synced\|pending\|offline, summaryText }` |
| 저장 상태 필 + 상세 다이얼로그 UI | `apps/web/src/domains/creator/StudioSaveSyncStatusCenter.tsx` (216줄) | 완성. 라벨: "저장됨" / "{n}개 변경 보존 중" / "오프라인 · 이 기기에 보관 중" / "저장 확인 필요". 상세에 이 기기/서버/복구 3단 설명, 복구 지점 만들기, 진단 복사까지 있음 |
| 위 둘의 테스트 | `StudioSaveSyncStatusCenter.test.tsx`, `studio-operation-recovery-coordinator.test.ts` | 존재 |
| **저널 생산자** (상태를 만드는 코드) | — | **없음.** `StudioOperationJournalState`를 참조하는 파일이 코디네이터와 컴포넌트뿐. `createEmptyOperationJournal`/`appendCanvasOperation`/`createJournalCheckpoint`를 앱 코드가 호출하지 않음 |
| **컴포넌트 렌더링** | — | **없음.** `StudioSaveSyncStatusCenter`를 import하는 곳이 테스트뿐. 에디터 셸 어디에도 마운트되지 않음 |

부가 발견:
- 기존 컴포넌트 카피는 **한국어 전용**이다. PRODUCT.md의 "한국어 소스 + 영어 번들" 원칙과 어긋난다 (신규 바는 이중언어 패턴 적용).
- 기존 필에는 "저장됨"에 **시각이 없다**. Canva 표준("All changes saved")보다 한 단계 더 나가려면 마지막 저장 시각 병기가 좋다.
- 에디터의 명시 저장 정책은 별도 축이다: `save-first/studio-editor-save-policy.ts`가 명시 저장 동작(server-pipeline / choose-destination / save-local-file)을 결정한다. 상시 표시는 이 정책과 충돌하지 않게 "자동 보존 상태"만 보여야 한다.

## 2. 구현 초안 (이 폴더)

| 파일 | 내용 | 의도된 배치 위치 |
| --- | --- | --- |
| `StudioSaveStatusBar.tsx` | 메뉴바 상시 한 줄 표시. 상태: 저장됨(+시각) / 저장 중… / 오프라인·이 기기에 저장됨 / 저장 확인 필요(+다시 시도 버튼) | `apps/web/src/domains/creator/StudioSaveStatusBar.tsx` (코디네이터와 같은 폴더) |
| `useStudioSaveSyncStatus.ts` | 저널 소유 훅 초안. recordOperation/recordCheckpoint 콜백 + 온라인 추적 + `resolveSaveSyncStatus` 메모 | `apps/web/src/domains/creator/useStudioSaveSyncStatus.ts` |
| `StudioSaveSyncStatusCenter.tsx`, `studio-operation-recovery-coordinator.ts`, 테스트, `studio-editor-save-policy.ts`, `StudioDocumentChromeSlot.tsx` | 감사 근거로 받아둔 원본 사본 (수정 아님) | — |

### 상태별 카피 (한·영)

| 상태 | 조건 | KO | EN |
| --- | --- | --- | --- |
| saved | pending=0, online, durable | 저장됨 · 오후 3:12 | Saved · 3:12 PM |
| saving | pending>0, online | 저장 중… | Saving… |
| offline | cloudSyncStatus=offline | 오프라인 · 이 기기에 저장됨 | Offline · Saved on this device |
| failed | localDurable=false | 저장 확인 필요 [+ 다시 시도] | Couldn't confirm save [+ Retry] |

### 접근성 설계

- 상태는 **아이콘 모양 + 문구**로 전달 (색만으로 구분 금지 — 기존 센터의 text-danger/warning/success 톤은 보조로만 유지).
- 시각 표시는 `aria-hidden`, 별도 `role="status"`(polite) 라이브 영역이 **전이만** 알린다: saving→saved ("모든 변경이 저장됐습니다"), *→failed (경고 문구). 저장 중 반복 알림 없음.
- 다시 시도 버튼은 기존 컴포넌트들과 같은 44px 수준의 coarse 포인터 타깃 규칙(`pointer-coarse:min-h-11`)을 따른다.
- 저장 중 아이콘 회전은 전역 `prefers-reduced-motion` 규칙을 따라야 한다 (통합 시 확인 항목).

## 3. 연결 지점 (파일 수준)

1. **마운트**: 에디터 메뉴바의 문서 제목 옆. 메뉴바에는 이미 포털 슬롯이 있다 — `apps/web/src/domains/creator/studio-shell/StudioDocumentChromeSlot.tsx`가 `#studio-document-chrome-slot`을 만들고 `StudioChromePortal`을 제공한다. 바와 기존 센터(상세)를 나란히 이 슬롯에 넣는 것이 최소 침습이다.
2. **상태 생산**: `useStudioSaveSyncStatus`를 에디터 문서 런타임(문서 단위 셸)이 소유하고,
   - mutation 확정 지점(스트로크/레이어/텍스트 등 command 실행 완료)에서 `recordOperation(...)`,
   - 자동저장·체크포인트가 실제 기록된 지점에서 `recordCheckpoint(...)`,
   - `isOpfsActive`는 SQLite/OPFS 저장소 런타임의 활성 판정을 연결한다.
   이 호출 지점들이 이 작업의 실제 본체다. 훅만 넣고 호출하지 않으면 지금과 같은 "죽은 기능"이 된다.
3. **상세**: 바 옆에 기존 `StudioSaveSyncStatusCenter`를 같은 journal로 렌더링하면 상세 다이얼로그(복구 지점 만들기 = onForceCheckpoint, 진단 복사)가 그대로 산다. 바의 "다시 시도"는 센터의 onForceCheckpoint와 같은 콜백을 쓰면 된다.

## 4. 리스크

- **저널 이중화**: 실제 에디터에는 이미 SQLite/OPFS 기반 문서 저장·복구 런타임이 있다(제품 문서 기준). 이 훅의 인메모리 저널을 그 런타임과 별도로 굴리면 상태가 실제와 어긋날 수 있다. 통합 시에는 런타임이 이미 들고 있는 메타데이터(마지막 저장 시각, 보류 op 수, 체크포인트 시각)를 `StudioSaveSyncStatus` 형태로 어댑트하는 편이 안전하며, 이 훅은 그 어댑터의 자리 표시자다.
- **pending 의미**: `resolveSaveSyncStatus`의 pending은 "체크포인트 이후 op 수"이지 "저장 실패"가 아니다. 카피가 이를 "저장 중"으로만 표현하는 현 초안의 해석이 실제 체크포인트 주기와 맞는지 확인 필요 (체크포인트가 잦으면 상시 "저장 중"으로 보일 수 있다 — 그 경우 라벨을 "보존 중" 계열로 조정).
- **성능**: recordOperation이 mutation마다 setState를 유발한다. 스트로크 단위 호출은 과하므로, 호출은 command 확정 단위로 묶고 필요하면 배치/스로틀을 런타임 쪽에서 적용할 것.
- **i18n**: 신규 바는 `i18n-bilingual-copy` 패턴을 썼으나, 기존 센터는 한국어 전용이다. 통합 시 센터 카피도 같은 방식으로 뽑아내야 원칙과 맞는다.
