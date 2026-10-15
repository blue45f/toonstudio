shader_type spatial;
// 깊이 패스: 뷰 공간 선형 깊이를 [near, far] 로 정규화해 192진 3자리(약 22.8비트)로 RGB 에 나눠 담는다(R=상위, B=하위).
render_mode unshaded, cull_back, depth_draw_opaque;
#include "res://shaders/pass_common.gdshaderinc"

uniform float depth_near = 0.05;
uniform float depth_far = 200.0;
varying float v_view_depth;

void vertex() {
	v_view_depth = -(MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).z;
}

void fragment() {
	float d = clamp((v_view_depth - depth_near) / (depth_far - depth_near), 0.0, 1.0);
	float v = floor(d * 7077887.0 + 0.5); // 192^3 - 1
	float r = floor(v / 36864.0);
	float rem = v - r * 36864.0;
	float g = floor(rem / 192.0);
	float b = rem - g * 192.0;
	ALBEDO = vec3(encode_digit(r), encode_digit(g), encode_digit(b));
}
