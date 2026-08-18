import { DurableObject } from 'cloudflare:workers'

type Env = {
  STACK_RUNNER_ROOMS: DurableObjectNamespace
}

type ClientMessage =
  | { type: 'state'; payload: unknown }
  | { type: 'claimCargo'; requestId: string; cargoId: string; playerId: string }
  | { type: 'deliver'; requestId: string; orderId: number; playerId: string }

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'stack-runner-room' })
    if (!url.pathname.startsWith('/room/')) return new Response('Not found', { status: 404 })
    const roomName = decodeURIComponent(url.pathname.slice('/room/'.length)) || 'main'
    const room = env.STACK_RUNNER_ROOMS.getByName(roomName)
    return room.fetch(request)
  },
}

export class StackRunnerRoom extends DurableObject<Env> {
  async fetch(request: Request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 })
    }
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.send(JSON.stringify({ type: 'ready' }))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(sender: WebSocket, raw: ArrayBuffer | string) {
    let message: ClientMessage
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as ClientMessage
    } catch {
      return
    }

    if (message.type === 'state') {
      this.broadcast(JSON.stringify(message), sender)
      return
    }

    if (message.type === 'claimCargo') {
      const key = `cargo:${message.cargoId}`
      const owner = await this.ctx.storage.get<string>(key)
      const granted = owner === undefined || owner === message.playerId
      if (granted && owner === undefined) await this.ctx.storage.put(key, message.playerId)
      sender.send(JSON.stringify({
        type: 'claimCargoResult',
        requestId: message.requestId,
        cargoId: message.cargoId,
        granted,
        owner: granted ? message.playerId : owner,
      }))
      return
    }

    if (message.type === 'deliver') {
      const key = `delivered:${message.orderId}:${message.playerId}`
      const alreadyDelivered = await this.ctx.storage.get<boolean>(key)
      if (alreadyDelivered) {
        sender.send(JSON.stringify({ type: 'deliveryResult', requestId: message.requestId, accepted: false }))
        return
      }
      const sequence = (await this.ctx.storage.get<number>('deliverySequence') ?? 0) + 1
      await this.ctx.storage.put({ deliverySequence: sequence, [key]: true })
      const result = JSON.stringify({
        type: 'deliveryResult',
        requestId: message.requestId,
        accepted: true,
        sequence,
        orderId: message.orderId,
        playerId: message.playerId,
      })
      sender.send(result)
      this.broadcast(result, sender)
    }
  }

  private broadcast(message: string, except?: WebSocket) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue
      try { socket.send(message) } catch { /* stale sockets are discarded by the runtime */ }
    }
  }
}
