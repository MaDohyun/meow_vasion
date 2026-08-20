import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Deliberately still a single pass over a small offscreen target rather than a
// composer chain. Bloom here is a handful of extra taps on a 640x360 buffer;
// a separate bright-pass plus blur pipeline would cost several full-screen
// passes for a look this palette does not need.
const fragmentShader = `
  uniform sampler2D tDiffuse;
  uniform vec2 texel;
  uniform float speed;
  uniform float impact;
  uniform float bloom;
  uniform float quality;
  varying vec2 vUv;

  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    float m[16];
    m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0;
    m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
    m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0;
    m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
    return m[i] / 16.0;
  }

  // Only pixels above the threshold contribute, so lit windows, neon and beams
  // bleed while the dark city stays crisp.
  vec3 brightPass(vec2 uv) {
    vec3 c = texture2D(tDiffuse, uv).rgb;
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return c * smoothstep(0.66, 1.0, luma);
  }

  vec3 gatherBloom(vec2 uv) {
    vec3 sum = vec3(0.0);
    // Two rings of taps at high quality, one at low.
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853981634;
      vec2 dir = vec2(cos(a), sin(a));
      sum += brightPass(uv + dir * texel * 3.0);
      if (quality > 0.5) sum += brightPass(uv + dir * texel * 7.0);
    }
    return sum / (quality > 0.5 ? 16.0 : 8.0);
  }

  void main() {
    vec2 centered = vUv - 0.5;
    float radius = length(centered);
    float ray = abs(sin(atan(centered.y, centered.x) * 24.0 + radius * 70.0));
    float lines = smoothstep(0.92, 1.0, ray) * smoothstep(0.35, 0.8, radius) * speed;
    vec3 color = texture2D(tDiffuse, vUv).rgb;
    color += gatherBloom(vUv) * bloom;
    float dither = bayer4(gl_FragCoord.xy) - 0.5;
    color = floor(color * 13.0 + dither * 0.16 + 0.5) / 13.0;
    color = pow(color, vec3(0.94));
    color = mix(vec3(0.012, 0.016, 0.032), color, 0.965);
    // Vignette. Stronger than the daytime value: at night it frames the city
    // without eating the screen edges where enemies come from.
    color *= 1.05 - radius * radius * 0.40;
    color += lines * vec3(1.0, 0.9, 0.65) * 0.12;
    color = mix(color, vec3(1.0) - color, impact * 0.45);
    gl_FragColor = vec4(color, 1.0);
  }
`

export type RenderQuality = 'high' | 'low'

export function PostFx({ speed, impact, quality }: { speed: number; impact: number; quality: RenderQuality }) {
  const { gl, scene, camera, size } = useThree()
  const target = useMemo(() => new THREE.WebGLRenderTarget(640, 360, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  }), [])
  const post = useMemo(() => {
    const postScene = new THREE.Scene()
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: target.texture },
        texel: { value: new THREE.Vector2(1 / 640, 1 / 360) },
        speed: { value: 0 },
        impact: { value: 0 },
        bloom: { value: 1 },
        quality: { value: 1 },
      },
      vertexShader,
      fragmentShader,
    })
    postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
    return { postScene, postCamera, material }
  }, [target])

  useEffect(() => () => {
    target.dispose()
    post.material.dispose()
  }, [post.material, target])

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    // Low quality drops the internal buffer as well as the bloom taps, which is
    // where most of the fill-rate saving actually comes from.
    const longEdge = (aspect >= 1 ? 640 : 420) * (quality === 'high' ? 1 : 0.7)
    const width = aspect >= 1 ? longEdge : Math.max(190, Math.round(longEdge * aspect))
    const height = aspect >= 1 ? Math.max(240, Math.round(longEdge / aspect)) : longEdge
    target.setSize(Math.round(width), Math.round(height))
    post.material.uniforms.texel!.value.set(1 / Math.round(width), 1 / Math.round(height))
  }, [post.material, quality, size.height, size.width, target])

  useFrame(() => {
    post.material.uniforms.speed!.value = Math.min(1, Math.max(0, (speed - 14) / 28))
    post.material.uniforms.impact!.value = impact
    post.material.uniforms.quality!.value = quality === 'high' ? 1 : 0
    post.material.uniforms.bloom!.value = quality === 'high' ? 0.9 : 0.62
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    if (import.meta.env.DEV) {
      gl.domElement.dataset.worldRenderMetrics = JSON.stringify({
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      })
    }
    gl.setRenderTarget(null)
    gl.setViewport(0, 0, size.width, size.height)
    gl.render(post.postScene, post.postCamera)
  }, 1)
  return null
}
