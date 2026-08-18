import type { Vec3 } from '../core/drone'

export type PeerDrone = {
  id: string
  position: Vec3
  heading: number
  cargoCount: number
  updatedAt: number
}

type RoomMessage =
  | { type: 'state'; payload: PeerDrone }
  | { type: 'ready' }
  | { type: 'claimCargoResult'; requestId: string; granted: boolean }
  | { type: 'deliveryResult'; requestId: string; accepted: boolean; sequence?: number }

export class RoomBridge {
  readonly id = crypto.randomUUID()
  private readonly peers = new Map<string, PeerDrone>()
  private readonly channel: BroadcastChannel | null
  private socket: WebSocket | null = null
  private pendingClaims = new Map<string, (granted: boolean) => void>()
  private pendingDeliveries = new Map<string, (sequence: number) => void>()

  constructor() {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('stack-runner-room') : null
    this.channel?.addEventListener('message', (event: MessageEvent<RoomMessage>) => this.consume(event.data))
    const roomUrl = import.meta.env.VITE_ROOM_URL
    if (roomUrl) {
      try {
        this.socket = new WebSocket(roomUrl)
        this.socket.addEventListener('message', (event) => {
          try { this.consume(JSON.parse(String(event.data)) as RoomMessage) } catch { /* NPC fallback */ }
        })
        this.socket.addEventListener('error', () => { this.socket = null })
      } catch {
        this.socket = null
      }
    }
  }

  private consume(message: RoomMessage) {
    if (message?.type === 'claimCargoResult') {
      this.pendingClaims.get(message.requestId)?.(message.granted)
      this.pendingClaims.delete(message.requestId)
      return
    }
    if (message?.type === 'deliveryResult') {
      this.pendingDeliveries.get(message.requestId)?.(message.accepted ? message.sequence ?? 0 : -1)
      this.pendingDeliveries.delete(message.requestId)
      return
    }
    if (message?.type !== 'state' || message.payload.id === this.id) return
    this.peers.set(message.payload.id, { ...message.payload, updatedAt: performance.now() })
  }

  publish(position: Vec3, heading: number, cargoCount: number) {
    const message: RoomMessage = {
      type: 'state',
      payload: { id: this.id, position: { ...position }, heading, cargoCount, updatedAt: performance.now() },
    }
    try { this.channel?.postMessage(message) } catch { /* closed during page teardown */ }
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
  }

  list() {
    const now = performance.now()
    for (const [id, peer] of this.peers) if (now - peer.updatedAt > 2500) this.peers.delete(id)
    return [...this.peers.values()].slice(0, 4)
  }

  claimCargo(cargoId: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.resolve(true)
    const requestId = crypto.randomUUID()
    return new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        this.pendingClaims.delete(requestId)
        resolve(true)
      }, 900)
      this.pendingClaims.set(requestId, (granted) => {
        window.clearTimeout(timer)
        resolve(granted)
      })
      this.socket?.send(JSON.stringify({ type: 'claimCargo', requestId, cargoId, playerId: this.id }))
    })
  }

  confirmDelivery(orderId: number) {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.resolve(0)
    const requestId = crypto.randomUUID()
    return new Promise<number>((resolve) => {
      const timer = window.setTimeout(() => {
        this.pendingDeliveries.delete(requestId)
        resolve(0)
      }, 900)
      this.pendingDeliveries.set(requestId, (sequence) => {
        window.clearTimeout(timer)
        resolve(sequence)
      })
      this.socket?.send(JSON.stringify({ type: 'deliver', requestId, orderId, playerId: this.id }))
    })
  }

  close() {
    this.channel?.close()
    this.socket?.close()
  }
}
