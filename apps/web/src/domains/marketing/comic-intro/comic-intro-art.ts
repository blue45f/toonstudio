/**
 * 인트로 키비주얼 경로.
 *
 * 호스트(ComicIntroHost)가 컴포넌트 청크를 불러오기 전에 이 경로만 알아야
 * 이미지를 미리 받아 둘 수 있다 — 오버레이가 뜬 뒤에 이미지가 늦게 나타나면
 * 그 자체가 또 하나의 깜빡임이 되기 때문이다. 그래서 컴포넌트와 분리한
 * 모듈에 경로 상수만 둔다.
 */
export const COMIC_INTRO_ART_URL = "/assets/comic-intro/keyvisual.webp";
