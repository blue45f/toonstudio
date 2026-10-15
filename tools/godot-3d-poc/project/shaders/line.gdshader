shader_type canvas_item;
// 선화 패스(2D 후처리): 깊이 불연속 + 법선 불연속 + 실루엣(알파)에서 선을 만든다.
// 입력은 pass_depth / pass_normal 로 캡처한 RGBA8 이미지다. 선 색은 ink, 알파는 선 마스크다.
uniform sampler2D depth_tex : filter_nearest;
uniform sampler2D normal_tex : filter_nearest;
uniform vec2 inv_size = vec2(0.001, 0.001);
uniform float thickness : hint_range(0.5, 6.0) = 1.0;
uniform float depth_range = 199.95;
uniform float depth_rel_threshold : hint_range(0.001, 0.2) = 0.02;
uniform float normal_threshold : hint_range(0.05, 1.5) = 0.45;
uniform vec3 ink : source_color = vec3(0.0);

// pass_common.gdshaderinc 의 코딩을 푼다(바이트 - 64 = 자릿수 / 191 단계).
float decode_depth(vec4 c) {
	vec3 b = floor(c.rgb * 255.0 + 0.5) - vec3(64.0);
	return ((b.r * 192.0 + b.g) * 192.0 + b.b) / 7077887.0 * depth_range;
}

vec3 decode_normal(vec4 c) {
	vec3 u = (floor(c.rgb * 255.0 + 0.5) - vec3(64.0)) / 191.0;
	return normalize(u * 2.0 - 1.0);
}

void fragment() {
	vec2 o = inv_size * thickness;
	vec4 d0 = texture(depth_tex, UV);
	float a0 = d0.a;
	float edge = 0.0;
	if (a0 > 0.5) {
		float z0 = decode_depth(d0);
		vec3 n0 = decode_normal(texture(normal_tex, UV));
		vec2 offs[4] = vec2[4](vec2(o.x, 0.0), vec2(-o.x, 0.0), vec2(0.0, o.y), vec2(0.0, -o.y));
		for (int i = 0; i < 4; i++) {
			vec4 dn = texture(depth_tex, UV + offs[i]);
			if (dn.a < 0.5) {
				edge = 1.0; // 실루엣: 이웃이 비어 있다
			} else {
				float zn = decode_depth(dn);
				if (zn - z0 > depth_rel_threshold * max(z0, 0.1)) {
					edge = 1.0; // 깊이 불연속: 가까운 쪽에만 선을 둔다
				}
				vec3 nn = decode_normal(texture(normal_tex, UV + offs[i]));
				if (1.0 - dot(n0, nn) > normal_threshold) {
					edge = 1.0; // 법선 불연속(접힘)
				}
			}
		}
	}
	COLOR = vec4(ink, edge * a0);
}
