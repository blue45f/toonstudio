/**
 * 이미지 업로드 게시 화면의 페이지 모델이다. 한 작품에 올릴 수 있는 최대 장수,
 * 화면이 다루는 페이지 레코드 형태, 페이지마다 붙이는 임시 식별자 생성을 한곳에 둔다.
 */
export const MAX_PAGES = 40;

export type UploadPage = {
  id: string;
  src: string;
  width: number;
  height: number;
  name: string;
};

export function uid() {
  return `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
