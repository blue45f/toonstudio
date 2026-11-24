import type { Plugin } from "vite";

const AUDIO_CHUNK = "studio-procedural-foley-audio-";

function isFoleyChunk(file: string): boolean {
  return file.split("/").pop()?.startsWith(AUDIO_CHUNK) === true;
}

// 필기음 JS는 기본 import()가 요청한다. 펜 접촉 중 head에 링크를 추가하면 문서의 :has()가 다시 계산된다.
export function studioFoleyPreloads(filename: string, deps: string[]): string[] {
  return isFoleyChunk(filename) ? deps.filter((dep) => !dep.endsWith(".js")) : deps;
}

export function studioFoleyImportHashPlugin(): Plugin {
  return {
    name: "studio-foley-native-import-hash",
    apply: "build",
    // Vite는 청크 URL이 정해진 뒤에 preload 목록을 쓴다. 호출자 URL에도 같은 정책을 반영한다.
    augmentChunkHash(chunk) {
      if (chunk.dynamicImports.some(isFoleyChunk)) return "studio-foley-native-import-v1";
    },
  };
}
