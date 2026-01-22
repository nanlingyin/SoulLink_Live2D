"""
SoulLink_Live2D - 主服务器应用
"""

import asyncio
from typing import Set, Optional
from dataclasses import asdict

from aiohttp import web

from ..config import ConfigManager
from ..models import ModelScanner, Live2DModel
from ..models.watcher import start_watcher
from ..generators import ExpressionGenerator, LocalExpressionGenerator, ChatGenerator, TTSGenerator
from .routes import setup_routes
from .handlers import WebSocketHandler


class SoulLinkServer:
    """SoulLink Live2D 服务器主类"""

    def __init__(self, config: ConfigManager):
        self.config = config
        self.scanner = ModelScanner(config.server.model_dirs)

        # 获取表情生成和聊天的独立配置
        expression_config = config.llm.expression if config.llm.expression else config.llm
        chat_config = config.llm.chat if config.llm.chat else config.llm

        # 根据配置选择表情生成器
        if config.llm.mode == "local":
            local_gen = LocalExpressionGenerator(config.llm)
            if local_gen.is_available():
                self.expression_generator = local_gen
                print("🏠 使用本地模型生成表情")
            else:
                print("⚠️ 本地模型不可用，回退到 API 模式")
                self.expression_generator = ExpressionGenerator(expression_config)
        else:
            self.expression_generator = ExpressionGenerator(expression_config)
            print("🌐 使用远程 API 生成表情")

        self.chat_generator = ChatGenerator(chat_config)

        # 初始化 TTS 生成器
        self.tts_generator = None
        if config.voice.tts and config.voice.tts.enabled:
            self.tts_generator = TTSGenerator(config.voice.tts)
            print("🔊 TTS 语音合成已启用")

        # 初始化本地 ASR（如果配置为 local 模式）
        self.asr = None
        if config.voice.asr and config.voice.asr.enabled and config.voice.asr.mode == "local":
            try:
                from ..asr import WhisperASR
                self.asr = WhisperASR(config.voice.asr)
                if self.asr.is_available():
                    print("🎤 本地 ASR (Whisper) 已启用")
                else:
                    self.asr = None
            except Exception as e:
                print(f"⚠️ 本地 ASR 初始化失败: {e}")

        self.clients: Set[web.WebSocketResponse] = set()
        self.current_model: Optional[str] = None

        # 创建应用
        self.app = web.Application()
        self._setup_app()

    def _setup_app(self) -> None:
        """设置应用"""
        ws_handler = WebSocketHandler(self)
        setup_routes(self.app, self.config, ws_handler)

    async def broadcast(self, message: dict) -> None:
        """广播消息给所有客户端"""
        if not self.clients:
            return

        dead_clients = set()
        for ws in self.clients:
            try:
                await ws.send_json(message)
            except Exception:
                dead_clients.add(ws)

        self.clients -= dead_clients

    async def _on_model_change(self) -> None:
        """模型文件变化回调"""
        await self.broadcast({
            "type": "model_list",
            "models": [asdict(m) for m in self.scanner.models.values()],
            "current": self.current_model
        })

    async def run(self) -> None:
        """启动服务器"""
        # 初始扫描
        self.scanner.scan_all()

        # 启动文件监听
        observer = start_watcher(self.scanner, self._on_model_change)

        # 启动 Web 服务器
        runner = web.AppRunner(self.app)
        await runner.setup()

        site = web.TCPSite(
            runner,
            self.config.server.host,
            self.config.server.port
        )

        await site.start()

        # 确定 LLM 模式显示信息
        if self.config.llm.mode == "local":
            llm_info = "本地模型 (Qwen2.5 + LoRA)"
        else:
            llm_info = f"API ({self.config.llm.model})"

        print(f"""
╔════════════════════════════════════════════════════════════╗
║           SoulLink_Live2D Server 已启动                    ║
╠════════════════════════════════════════════════════════════╣
║  🌐 Web 界面:  http://localhost:{self.config.server.port:<24}║
║  🔌 WebSocket: ws://localhost:{self.config.server.port}/ws{' ' * 21}║
║  📁 模型目录:  {str(self.config.server.model_dirs[0]):<31}║
║  🎭 已发现模型: {len(self.scanner.models):<30}║
║  🤖 表情生成:  {llm_info:<31}║
╚════════════════════════════════════════════════════════════╝

💡 提示:
   - 将 Live2D 模型放入模型目录，服务器会自动发现
   - 在浏览器控制台使用 SoulLink.chat("你好") 测试
   - 按 Ctrl+C 停止服务器
   - 切换模式: 修改 config.yaml 中 llm.mode 为 "local" 或 "api"
        """)

        try:
            while True:
                await asyncio.sleep(3600)
        except asyncio.CancelledError:
            pass
        finally:
            observer.stop()
            observer.join()
            await runner.cleanup()


def create_app(config_path: str = "config.yaml") -> SoulLinkServer:
    """创建服务器实例"""
    config = ConfigManager(config_path)
    return SoulLinkServer(config)
