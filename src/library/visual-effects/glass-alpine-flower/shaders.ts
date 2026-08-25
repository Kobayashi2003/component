export const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_base;
uniform sampler2D u_normal;
uniform sampler2D u_specular;
uniform vec2 u_resolution;
uniform vec2 u_bluePos;
uniform vec2 u_purplePos;
uniform float u_blueIntensity;
uniform float u_blueRadius;
uniform float u_purpleIntensity;
uniform float u_purpleRadius;
uniform float u_normalStrength;
uniform float u_specularStrength;
uniform float u_fresnelStrength;
uniform float u_shininess;
uniform float u_transmission;
uniform float u_exposure;
uniform int u_renderMode;
in vec2 v_uv;
out vec4 outColor;

struct LightResult {
  float diffuse;
  float specular;
  float fresnel;
  float scatter;
};

LightResult evaluateLight(vec2 lightPos, float radius, float intensity, vec3 N, float specMask) {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 delta = (lightPos - v_uv) * vec2(aspect, 1.0);
  float planarDistance = length(delta);
  float attenuation = pow(clamp(1.0 - planarDistance / max(radius, 0.001), 0.0, 1.0), 2.0);
  vec3 L = normalize(vec3(delta, 0.42));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);

  float ndotl = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), u_shininess) * specMask;
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  float scatter = pow(1.0 - abs(dot(N, L)), 1.7) * (0.25 + specMask * 0.75);

  LightResult result;
  result.diffuse = ndotl * attenuation * intensity;
  result.specular = spec * attenuation * intensity;
  result.fresnel = fresnel * attenuation * intensity;
  result.scatter = scatter * attenuation * intensity;
  return result;
}

void main() {
  vec4 base = texture(u_base, v_uv);
  if (base.a < 0.012) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 normalSample = texture(u_normal, v_uv).rgb * 2.0 - 1.0;
  normalSample.y *= -1.0;
  normalSample.xy *= mix(0.35, 1.9, u_normalStrength);
  vec3 N = normalize(normalSample);
  float specMask = texture(u_specular, v_uv).r;

  if (u_renderMode == 1) {
    outColor = vec4(base.rgb * base.a, 1.0);
    return;
  }
  if (u_renderMode == 2) {
    outColor = vec4(N * 0.5 + 0.5, 1.0);
    return;
  }

  LightResult blue = evaluateLight(u_bluePos, u_blueRadius, u_blueIntensity, N, specMask);
  LightResult purple = evaluateLight(u_purplePos, u_purpleRadius, u_purpleIntensity, N, specMask);

  const vec3 BLUE = vec3(0.12, 0.54, 1.0);
  const vec3 CYAN = vec3(0.84, 0.97, 1.0);
  const vec3 PURPLE = vec3(0.72, 0.20, 1.0);
  const vec3 MAGENTA = vec3(1.0, 0.72, 1.0);

  float baseValue = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
  float detail = pow(baseValue, 1.08);
  float alphaMask = smoothstep(0.01, 0.12, base.a);
  float detailResponse = 0.35 + detail * 0.75;

  vec3 blueLight = BLUE * blue.diffuse * (0.24 + detail * 0.10);
  blueLight += CYAN * blue.specular * (1.55 + u_specularStrength * 2.45);
  blueLight += CYAN * blue.fresnel * (0.42 + u_fresnelStrength * 1.28);
  blueLight += BLUE * blue.scatter * u_transmission * (0.95 + detail * 0.20);

  vec3 purpleLight = PURPLE * purple.diffuse * (0.24 + detail * 0.10);
  purpleLight += MAGENTA * purple.specular * (1.48 + u_specularStrength * 2.38);
  purpleLight += MAGENTA * purple.fresnel * (0.40 + u_fresnelStrength * 1.22);
  purpleLight += PURPLE * purple.scatter * u_transmission * (0.92 + detail * 0.18);

  vec3 lightingOnly = (blueLight + purpleLight) * detailResponse;
  float whiteSpark = clamp((blue.specular + purple.specular) * (0.08 + specMask * 0.16), 0.0, 1.0) * 0.10;
  vec3 sparkleColor = vec3(1.0) * whiteSpark;

  if (u_renderMode == 3) {
    outColor = vec4(1.0 - exp(-(lightingOnly + sparkleColor) * u_exposure), 1.0);
    return;
  }

  vec3 neutralBody = vec3(0.0015 + detail * 0.018);
  vec3 internalColor = mix(CYAN, MAGENTA, smoothstep(0.16, 0.84, v_uv.x))
    * pow(clamp(specMask, 0.0, 1.0), 1.06)
    * (blue.scatter + purple.scatter)
    * u_transmission
    * 0.72;
  vec3 rimColor = mix(CYAN, MAGENTA, smoothstep(0.12, 0.88, v_uv.x))
    * (blue.fresnel + purple.fresnel)
    * (0.10 + u_fresnelStrength * 0.22);
  vec3 litCore = mix(BLUE, PURPLE, clamp(purple.diffuse / max(blue.diffuse + purple.diffuse, 0.0001), 0.0, 1.0))
    * (blue.diffuse + purple.diffuse)
    * detail
    * 0.08;

  vec3 finalColor = neutralBody + litCore + lightingOnly + internalColor + rimColor + sparkleColor;
  finalColor *= 0.96 + specMask * 0.14;
  finalColor = 1.0 - exp(-finalColor * u_exposure);
  finalColor *= alphaMask;

  outColor = vec4(finalColor, 1.0);
}`
