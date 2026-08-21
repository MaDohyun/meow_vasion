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

// A single, soft comfort pass. It deliberately avoids motion blur, chromatic
// aberration, speed lines and hard flashes: all four make a fast 3D game more
// tiring to track even when the underlying camera is stable.
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
    return c * smoothstep(0.84, 1.08, luma);
  }

  vec3 gatherBloom(vec2 uv) {
    vec3 sum = vec3(0.0);
    // Two rings of taps at high quality, one at low.
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853981634;
      vec2 dir = vec2(cos(a), sin(a));
      sum += brightPass(uv + dir * texel * 2.2);
      if (quality > 0.5) sum += brightPass(uv + dir * texel * 4.8);
    }
    return sum / (quality > 0.5 ? 16.0 : 8.0);
  }

  void main() {
    vec2 centered = vUv - 0.5;
    float radius = length(centered);
    vec3 color = texture2D(tDiffuse, vUv).rgb;
    color += gatherBloom(vUv) * bloom;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luma), color, 0.84);
    color = pow(max(color, 0.0), vec3(0.84));
    color = mix(vec3(0.19, 0.18, 0.2), color, 0.96);
    color *= 1.02 - radius * radius * 0.07;
    // A warm, very short luminance lift is readable without the disorienting
    // full-frame colour inversion the old impact feedback used.
    color = mix(color, vec3(1.0, 0.93, 0.86), impact * 0.08);
    gl_FragColor = vec4(color, 1.0);
  }
`

export type RenderQuality = 'high' | 'low'

export function PostFx({ speed, impact, quality }: { speed: number; impact: number; quality: RenderQuality }) {
  const { gl, scene, camera, size } = useThree()
  const target = useMemo(() => new THREE.WebGLRenderTarget(640, 360, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
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
    post.material.uniforms.speed!.value = 0
    post.material.uniforms.impact!.value = impact
    post.material.uniforms.quality!.value = quality === 'high' ? 1 : 0
    post.material.uniforms.bloom!.value = quality === 'high' ? 0.3 : 0.1
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
