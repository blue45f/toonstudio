/** Three 공개 ShaderChunk.packing의 packDepthToRGBA와 같은 window-depth RGBA8 식이다. */
import { Fn, float, vec4 } from "three/tsl";

type ScalarNode = ReturnType<typeof float>;

/** 음수·초과 깊이는 0..1로 제한하고 far=1은 배경 clear와 같은 흰색으로 표현한다. */
export const studioThreeNodePackDepthToRgba = Fn(([value]: readonly [ScalarNode]) => {
  const depth = value.clamp(0, 1), scaled = depth.mul(16_777_216);
  const alpha = scaled.fract(), afterAlpha = scaled.floor(), blue = afterAlpha.div(256);
  const afterBlue = blue.floor(), green = afterBlue.div(256);
  const packed = vec4(green.floor().div(255), green.fract().mul(256 / 255), blue.fract().mul(256 / 255), alpha);
  return depth.greaterThanEqual(1).select(vec4(1), packed);
}).setLayout({ name: "studioThreePackDepthToRgba", type: "vec4", inputs: [{ name: "value", type: "float" }] });
