import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { HealthLossKind } from '../core/health'

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
//
// This pass used to also carry a depth-texture edge outline and a
// camera-projected light-shaft effect. Both were reverted: the light shaft
// projected a fixed-world-bearing point that regularly landed behind the
// camera, and the depth texture attachment had to be kept in lockstep with
// the render target by hand on every resize. Both kept reproducing as
// screen corruption ("static") on hardware this sandbox's software renderer
// doesn't share, across two rounds of targeted fixes - simple bloom/vignette
// carries no such risk, so that is what stays.
const fragmentShader = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tSplashLight;
  uniform sampler2D tSplashGuided;
  uniform sampler2D tSplashExplosive;
  uniform sampler2D tSplashImpact;
  uniform vec2 texel;
  uniform float speed;
  uniform float impact;
  uniform float bloom;
  uniform float quality;
  uniform float splashKind;
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

  vec4 splashTexture(vec2 uv) {
    if (splashKind < 0.5) return texture2D(tSplashLight, uv);
    if (splashKind < 1.5) return texture2D(tSplashGuided, uv);
    if (splashKind < 2.5) return texture2D(tSplashExplosive, uv);
    return texture2D(tSplashImpact, uv);
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
    vec4 splash = splashTexture(vUv * 1.18 + vec2(0.05, -0.03));
    vec3 splashColor = splashKind < 0.5 ? vec3(1.0, 0.85, 0.42)
      : splashKind < 1.5 ? vec3(1.0, 0.34, 0.2)
      : splashKind < 2.5 ? vec3(1.0, 0.15, 0.06)
      : vec3(0.95, 0.7, 0.38);
    color += splashColor * splash.a * impact * 0.34;
    gl_FragColor = vec4(color, 1.0);
  }
`

export type RenderQuality = 'high' | 'low'

function splashTexture(kind: 'light' | 'guided' | 'explosive' | 'impact') {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')!
  context.clearRect(0, 0, 128, 128)
  context.globalCompositeOperation = 'lighter'
  if (kind === 'light') {
    context.fillStyle = 'rgba(255,255,255,.62)'
    context.beginPath(); context.arc(64, 64, 42, 0, Math.PI * 2); context.fill()
    context.fillStyle = 'rgba(255,255,255,.38)'
    for (let i = 0; i < 7; i += 1) { context.fillRect(18 + i * 14, 34 + (i % 2) * 20, 4, 42) }
  } else if (kind === 'guided') {
    context.strokeStyle = 'rgba(255,255,255,.78)'; context.lineWidth = 7
    for (let i = 0; i < 5; i += 1) { context.beginPath(); context.moveTo(20 + i * 18, 112); context.lineTo(56 + i * 8, 16); context.stroke() }
  } else if (kind === 'explosive') {
    context.fillStyle = 'rgba(255,255,255,.72)'
    for (let i = 0; i < 12; i += 1) {
      const angle = i / 12 * Math.PI * 2
      const length = 22 + (i % 3) * 12
      context.save(); context.translate(64, 64); context.rotate(angle); context.fillRect(-3, -length, 6, length); context.restore()
    }
    context.beginPath(); context.arc(64, 64, 18, 0, Math.PI * 2); context.fill()
  } else {
    context.strokeStyle = 'rgba(255,255,255,.68)'; context.lineWidth = 5
    context.beginPath(); context.arc(64, 64, 34, 0, Math.PI * 2); context.stroke()
    context.beginPath(); context.arc(64, 64, 18, 0, Math.PI * 2); context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

function splashIndex(kind: HealthLossKind) {
  return kind === 'rifle' || kind === 'shell' ? 0 : kind === 'missile' || kind === 'rocket' || kind === 'boss-beam' ? 1 : kind === 'explosive' ? 2 : 3
}

export function PostFx({ speed, impact, impactKind, quality }: { speed: number; impact: number; impactKind: HealthLossKind; quality: RenderQuality }) {
  const { gl, scene, camera, size } = useThree()
  const splashTextures = useMemo(() => ({
    light: splashTexture('light'),
    guided: splashTexture('guided'),
    explosive: splashTexture('explosive'),
    impact: splashTexture('impact'),
  }), [])
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
        tSplashLight: { value: splashTextures.light },
        tSplashGuided: { value: splashTextures.guided },
        tSplashExplosive: { value: splashTextures.explosive },
        tSplashImpact: { value: splashTextures.impact },
        texel: { value: new THREE.Vector2(1 / 640, 1 / 360) },
        speed: { value: 0 },
        impact: { value: 0 },
        bloom: { value: 1 },
        quality: { value: 1 },
        splashKind: { value: 3 },
      },
      vertexShader,
      fragmentShader,
    })
    postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
    return { postScene, postCamera, material }
  }, [splashTextures, target])

  useEffect(() => () => {
    target.dispose()
    post.material.dispose()
    splashTextures.light.dispose()
    splashTextures.guided.dispose()
    splashTextures.explosive.dispose()
    splashTextures.impact.dispose()
  }, [post.material, splashTextures, target])

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    // Low quality drops the internal buffer as well as the bloom taps, which is
    // where most of the fill-rate saving actually comes from.
    const longEdge = (aspect >= 1 ? 512 : 360) * (quality === 'high' ? 1 : 0.7)
    const width = aspect >= 1 ? longEdge : Math.max(190, Math.round(longEdge * aspect))
    const height = aspect >= 1 ? Math.max(240, Math.round(longEdge / aspect)) : longEdge
    target.setSize(Math.round(width), Math.round(height))
    post.material.uniforms.texel!.value.set(1 / Math.round(width), 1 / Math.round(height))
  }, [post.material, quality, size.height, size.width, target])

  useFrame(() => {
    post.material.uniforms.speed!.value = 0
    post.material.uniforms.impact!.value = impact
    post.material.uniforms.quality!.value = quality === 'high' ? 1 : 0
    post.material.uniforms.bloom!.value = quality === 'high' ? 0.42 : 0.15
    post.material.uniforms.splashKind!.value = splashIndex(impactKind)
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
