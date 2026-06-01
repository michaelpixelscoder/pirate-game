import * as THREE from "three";

export type WaterUniforms = {
  uTime: { value: number };
  uWaterLevel: { value: number };
  uDeepColor: { value: THREE.Color };
  uShallowColor: { value: THREE.Color };
  uFoamColor: { value: THREE.Color };
  uSkyTop: { value: THREE.Color };
  uSkyHorizon: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSunStrength: { value: number };
};

export function createWaterMaterial(waterLevel: number) {
  const uniforms: WaterUniforms = {
    uTime: { value: 0 },
    uWaterLevel: { value: waterLevel },
    uDeepColor: { value: new THREE.Color(0x092755) },
    uShallowColor: { value: new THREE.Color(0x31a4c8) },
    uFoamColor: { value: new THREE.Color(0xe9fbff) },
    uSkyTop: { value: new THREE.Color(0x6c8cd5) },
    uSkyHorizon: { value: new THREE.Color(0xf3c0cb) },
    uSunDir: { value: new THREE.Vector3(-0.22, 0.88, 0.42).normalize() },
    uSunColor: { value: new THREE.Color(0xfff6e0) },
    uSunStrength: { value: 1.25 }
  };

  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vWave;
      varying vec2 vSurfaceUv;
      uniform float uTime;
      uniform float uWaterLevel;

      float waveField(vec2 p) {
        float a = sin(p.x * 0.064 + uTime * 0.95) * 0.12;
        float b = cos(p.y * 0.052 - uTime * 0.74) * 0.10;
        float c = sin((p.x + p.y) * 0.041 + uTime * 0.37) * 0.06;
        float d = sin(length(p) * 0.046 - uTime * 0.55) * 0.05;
        float e = sin((p.x * 0.19 - p.y * 0.17) + uTime * 1.75) * 0.024;
        float f = cos((p.x * 0.31 + p.y * 0.28) - uTime * 2.35) * 0.014;
        return a + b + c + d + e + f;
      }

      void main() {
        vec3 p = position;
        vec4 world = modelMatrix * vec4(p, 1.0);
        float wave = waveField(world.xz);
        world.y += wave;
        vWave = wave;
        vWorldPos = world.xyz;
        vSurfaceUv = world.xz * 0.035;
        vec3 dx = vec3(1.0, waveField(world.xz + vec2(0.24, 0.0)) - wave, 0.0);
        vec3 dz = vec3(0.0, waveField(world.xz + vec2(0.0, 0.24)) - wave, 1.0);
        vWorldNormal = normalize(cross(dz, dx));
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vWave;
      varying vec2 vSurfaceUv;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uSunStrength;
      uniform float uTime;

      float causticBand(vec2 p, float t) {
        float c1 = sin(p.x * 6.0 + t * 1.8) * cos(p.y * 5.2 - t * 1.25);
        float c2 = sin((p.x + p.y) * 10.4 + t * 2.4);
        float c3 = cos(length(p * 2.9) * 3.4 - t * 1.7);
        return (c1 * 0.45 + c2 * 0.35 + c3 * 0.20) * 0.5 + 0.5;
      }

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec2 flowUv = vSurfaceUv + vec2(uTime * 0.03, -uTime * 0.02);
        float microX = sin(flowUv.x * 36.0 + flowUv.y * 12.0 + uTime * 4.6) * 0.06;
        float microZ = cos(flowUv.y * 34.0 - flowUv.x * 11.0 - uTime * 4.1) * 0.06;
        normal = normalize(normal + vec3(microX, 0.0, microZ));

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.25);
        float heightMix = smoothstep(-0.35, 0.50, vWave);
        vec3 waterColor = mix(uDeepColor, uShallowColor, heightMix);

        float smallCausticsA = smoothstep(0.62, 0.90, causticBand(flowUv * 1.55, uTime));
        float smallCausticsB = smoothstep(0.70, 0.95, causticBand((flowUv + vec2(1.73, -0.91)) * 2.35, uTime * 1.22));
        float interleavedCaustics = (smallCausticsA * 0.55 + smallCausticsB * 0.45);

        float crest = smoothstep(0.08, 0.26, abs(vWave) + (1.0 - normal.y) * 0.7);
        float foam = crest * 0.26;

        vec3 reflectionDir = reflect(-viewDir, normal);
        float skyMix = clamp(reflectionDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 skyReflection = mix(uSkyHorizon, uSkyTop, pow(skyMix, 0.78));
        float sunSpec = pow(max(dot(reflectionDir, normalize(uSunDir)), 0.0), 96.0) * uSunStrength;
        vec3 reflection = skyReflection + uSunColor * sunSpec;

        vec3 color = waterColor;
        color = mix(color, uFoamColor, foam);
        color += uFoamColor * interleavedCaustics * 0.13;
        color = mix(color, reflection, 0.18 + fresnel * 0.64);

        float alpha = 0.72 + fresnel * 0.17;
        gl_FragColor = vec4(color, alpha);
      }
    `
  }) as THREE.ShaderMaterial & { uniforms: WaterUniforms };
}
