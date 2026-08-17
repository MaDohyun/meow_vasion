# STACK RUNNER

OpenAI Game Builders Seoul 2026 Track 1 출품용 드론 배달 게임입니다.

드론 위에 화물을 높이 쌓을수록 보수가 늘지만 가속과 선회가 둔해지고, 급조작이나 충돌로 상단 화물이 떨어집니다. 떨어진 화물은 8초 안에 회수할 수 있습니다.

## 실행

```bash
pnpm install
pnpm dev
```

## 조작

- `W/S`: 전진/감속 및 후진
- `A/D`: 좌우 선회
- `Space/Shift`: 상승/하강
- `E`: 화물 픽업/배달
- `Q`: 장착한 특수 부품 사용

모바일에서는 왼쪽 가상 스틱과 오른쪽 상승/상호작용 버튼을 사용합니다. 목표 지점에서는 자동 상호작용도 지원합니다.

## 테스트

```bash
pnpm test
pnpm build
pnpm smoke
```

## 선택 멀티플레이 서버

`worker/index.ts`는 Cloudflare Durable Object 기반 WebSocket 룸입니다. 화물 선점과 배달 완료 순서만 서버가 권위적으로 판정합니다. 서버가 없거나 연결이 끊기면 게임은 별도 오류 없이 NPC 모드로 계속 동작합니다.

```bash
npx wrangler deploy
VITE_ROOM_URL=wss://<worker-domain>/room/main pnpm build
```
