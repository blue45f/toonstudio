/**
 * 젖은 종이 베이크의 지연 로드 경계(Canvas 경로).
 *
 * 무거운 솔버(LBM·3층 물·안료 수송·종이 생성·강모 지도), 프로그램 표와 Beer–Lambert 합성은 이 모듈 뒤에만 있다.
 * `studio-wet-paper-host.ts`는 이 파일을 동적 `import()`로만 불러, 해당 레인으로 그린 획이 처음 정착할 때까지
 * Studio 진입 청크에 솔버 코드가 실리지 않는다. SVG 내보내기(이미 지연 청크)는 솔버를 정적으로 import 한다.
 */

export {
  advanceWetPaperSolve,
  createWetPaperSolve,
  finishWetPaperSolve,
} from "./studio-wet-paper-solver";
export {
  advanceStudioWetPaperRasterJob,
  createStudioWetPaperRasterJob,
} from "./studio-wet-paper-composite";
export { normalizeStudioWetPaperBakeSettings } from "./studio-wet-paper-programs";
