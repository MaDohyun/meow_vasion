import { Canvas } from '@react-three/fiber'
import { GameProvider } from './GameContext'
import { DroneScene } from './render/DroneScene'
import { Hud } from './ui/Hud'
import './styles.css'

export default function App() {
  return (
    <GameProvider>
      <main className="game-shell">
        <Canvas
          tabIndex={0}
          aria-label="BEAM BANDIT game view"
          shadows
          dpr={1}
          camera={{ fov: 65, near: 0.1, far: 280, position: [0, 8, 12] }}
          gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = 'srgb'
            gl.shadowMap.type = 1
          }}
        >
          <DroneScene />
        </Canvas>
        <Hud />
      </main>
    </GameProvider>
  )
}
