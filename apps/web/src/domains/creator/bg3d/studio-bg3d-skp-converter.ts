/**
 * .skp(SketchUp) → GLB 변환 파사드.
 *
 * .skp 는 Trimble 의 독점 바이너리 포맷이지만, MIT 라이선스의 OpenSKP(openskp, npm)가 브라우저에서 동작하는
 * 순수 TypeScript 파서를 제공한다(VFF 2021+ / 레거시 MFC 2013–2020). OpenSKP 는 Trimble 과 무관한 비공식
 * 역공학 파서이고 SketchUp 은 Trimble 의 상표다 — 자세한 지원 범위와 한계는 docs/features/skp-import.md.
 *
 * 이 파일은 가져오기 파이프라인이 쓰는 단일 입구이고, 실제 일은 아래 모듈이 나눠 맡는다.
 * - studio-bg3d-skp-worker-client   Worker 실행·취소·시간 상한·진행 단계·메인 스레드 폴백
 * - studio-bg3d-skp.worker / -worker-runtime   Worker 안에서 openskp 를 동적 import 로 불러와 실행
 * - studio-bg3d-skp-conversion-core   사전 검사 → buildScene → 병합·점검 → toGLB → 보고서(변환기 주입 가능)
 * - studio-bg3d-skp-import-report   버전형 변환 보고서 계약(zod 스키마·검증, 메인 스레드와 저장소가 읽는다)
 * - studio-bg3d-skp-report-builder   보고서 생성기(zod 무의존 — Worker 번들에 검증 라이브러리가 들어가지 않게 분리)
 * - studio-bg3d-skp-unit / -glb-scale   단위 판정과 GLB 배율 적용
 *
 * 단계 추출(선화/음영/밑색)은 변환된 GLB 가 기존 3D 가져오기·멀티패스 PSD 파이프라인에 합류하는 것으로
 * 충족한다 — .skp 전용 단계 추출기를 따로 만들지 않는다. 동적 import 자체가 실패하는 경우(청크 로드 실패
 * 등)에만 정직하게 "변환기를 사용할 수 없음"으로 실패하고, 가짜 변환이나 조용한 건너뜀은 하지 않는다.
 */

export {
  StudioBg3dSkpConversionError,
  StudioBg3dSkpConverterUnavailableError,
  StudioBg3dSkpParseError,
  type StudioBg3dSkpFailureCode,
  type StudioBg3dSkpStageProgress,
} from "./studio-bg3d-skp-contract";
export type {
  OpenSkpModuleLike,
  OpenSkpModuleLoader,
  StudioBg3dSkpConversionOutput,
} from "./studio-bg3d-skp-conversion-core";
export {
  convertStudioBg3dSkp,
  type StudioBg3dSkpConvertOptions,
  type StudioBg3dSkpExecutionBackend,
} from "./studio-bg3d-skp-worker-client";
