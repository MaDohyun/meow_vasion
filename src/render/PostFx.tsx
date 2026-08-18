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

const fragmentShader = `
  uniform sampler2D tDiffuse;
  uniform float speed;
  uniform float impact;
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

  void main() {
    vec2 centered = vUv - 0.5;
    float radius = length(centered);
    float ray = abs(sin(atan(centered.y, centered.x) * 24.0 + radius * 70.0));
    float lines = smoothstep(0.92, 1.0, ray) * smoothstep(0.35, 0.8, radius) * speed;
    vec3 color = texture2D(tDiffuse, vUv).rgb;
    float dither = bayer4(gl_FragCoord.xy) - 0.5;
    color = floor(color * 13.0 + dither * 0.16 + 0.5) / 13.0;
    color = pow(color, vec3(0.94));
    color = mix(vec3(0.025, 0.035, 0.055), color, 0.965);
    color *= 1.04 - radius * 0.10;
    color += lines * vec3(1.0, 0.9, 0.65) * 0.12;
    color = mix(color, vec3(1.0) - color, impact * 0.45);
    gl_FragColor = vec4(color, 1.0);
  }
`

export function PostFx({ speed, impact }: { speed: number; impact: number }) {
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
        speed: { value: 0 },
        impact: { value: 0 },
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
    const longEdge = aspect >= 1 ? 640 : 420
    if (aspect >= 1) target.setSize(longEdge, Math.max(240, Math.round(longEdge / aspect)))
    else target.setSize(Math.max(190, Math.round(longEdge * aspect)), longEdge)
  }, [size.height, size.width, target])

  useFrame(() => {
    post.material.uniforms.speed!.value = Math.min(1, Math.max(0, (speed - 8) / 14))
    post.material.uniforms.impact!.value = impact
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    gl.setViewport(0, 0, size.width, size.height)
    gl.render(post.postScene, post.postCamera)
  }, 1)
  return null
}
