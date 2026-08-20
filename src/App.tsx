import { Preload, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { GameProvider } from './GameContext'
import { DroneScene } from './render/DroneScene'
import { Hud } from './ui/Hud'
import './styles.css'

type LoadingStage = { label: string; progress: number }

function ScenePreloader({
  onStage,
  onReady,
}: {
  onStage: (stage: LoadingStage) => void
  onReady: () => void
}) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    let cancelled = false
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const prepare = async () => {
      onStage({ label: 'ASSEMBLING CELL POOLS', progress: 32 })
      await nextFrame()
      await nextFrame()
      if (cancelled) return
      onStage({ label: 'COMPILING CITY SHADERS', progress: 58 })
      await gl.compileAsync(scene, camera)
      if (cancelled) return
      onStage({ label: 'WARMING BEAM PHYSICS', progress: 82 })
      await nextFrame()
      await nextFrame()
      onStage({ label: 'CALIBRATING FLIGHT CAMERA', progress: 96 })
      await nextFrame()
      if (cancelled) return
      onStage({ label: 'RAID READY', progress: 100 })
      onReady()
    }
    void prepare()
    return () => { cancelled = true }
  }, [camera, gl, onReady, onStage, scene])
  return null
}

function LoadingScreen({ stage }: { stage: LoadingStage }) {
  const { active, progress: assetProgress } = useProgress()
  const progress = active ? Math.min(stage.progress, Math.max(6, assetProgress * 0.3)) : stage.progress
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-grid" />
      <div className="loading-ufo" aria-hidden="true"><i /><i /><i /></div>
      <span className="loading-kicker">UFO 어택 서바이벌 · PRE-FLIGHT CHECK</span>
      <h1>LOADING<br /><b>THE GRID</b></h1>
      <div className="loading-progress" aria-label={`${Math.round(progress)} percent loaded`}>
        <i style={{ width: `${progress}%` }} />
      </div>
      <div className="loading-status"><span>{stage.label}</span><b>{Math.round(progress)}%</b></div>
      <div className="loading-checks">
        <span data-ready={progress >= 32}>WORLD CELLS</span>
        <span data-ready={progress >= 58}>CITY SHADERS</span>
        <span data-ready={progress >= 82}>TRACTOR ARRAY</span>
        <span data-ready={progress >= 96}>FLIGHT CAMERA</span>
      </div>
    </div>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [stage, setStage] = useState<LoadingStage>({ label: 'FETCHING GAME ASSETS', progress: 8 })
  const updateStage = useCallback((next: LoadingStage) => setStage(next), [])
  const finishLoading = useCallback(() => setReady(true), [])
  return (
    <GameProvider>
      <main className="game-shell">
        <Canvas
          tabIndex={0}
          aria-label="UFO 어택 서바이벌 game view"
          dpr={1}
          camera={{ fov: 65, near: 0.1, far: 700, position: [0, 6.5, 62] }}
          gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = 'srgb'
            // Scene lighting sums well above 1.0. Without tone mapping the
            // default NoToneMapping clips it flat and the pastel palette washes
            // out to white. ACES rolls the highlights off instead.
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.05
          }}
        >
          <Suspense fallback={null}>
            <DroneScene />
            <Preload all />
            <ScenePreloader onStage={updateStage} onReady={finishLoading} />
          </Suspense>
        </Canvas>
        {ready ? <Hud /> : <LoadingScreen stage={stage} />}
      </main>
    </GameProvider>
  )
}
