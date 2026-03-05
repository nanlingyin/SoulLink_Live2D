# SoulLink Vue Frontend

独立前端工程（Vue 3 + Vite），通过 `/api` 与 `/ws` 对接 Python 后端。

## 启动

```bash
npm install
npm run dev
```

默认前端地址：`http://localhost:5173`

## 后端地址

默认代理目标：`http://127.0.0.1:3000`

如果后端地址不同，可在启动前设置环境变量：

```bash
VITE_BACKEND_ORIGIN=http://127.0.0.1:3000 npm run dev
```

## 构建

```bash
npm run build
npm run preview
```

## 说明

- `public/legacy/js` 中保留并复用了原有 Live2D、表情、TTS、ASR 核心脚本。
- `src/services/ws-client.js` 负责 Vue 层 WebSocket 通信。
- 保留背景壁纸能力，默认读取 `/static/background` 下资源。
