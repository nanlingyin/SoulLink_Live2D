"""
路由定义
"""

from pathlib import Path
from dataclasses import asdict
import yaml

from aiohttp import web
import aiohttp_cors

from ..config import ConfigManager


def setup_routes(app: web.Application, config: ConfigManager, ws_handler) -> None:
    """设置所有路由"""

    # API 根路由与健康检查
    app.router.add_get('/', serve_api_root)
    app.router.add_get('/api/health', serve_health)

    # WebSocket
    app.router.add_get('/ws', ws_handler.handle_connection)

    # API 路由
    app.router.add_get('/api/models', create_get_models_handler(ws_handler.server))
    app.router.add_get('/api/config', create_get_config_handler(config))
    app.router.add_get('/api/config/full', create_get_full_config_handler(config))
    app.router.add_post('/api/config/save', create_save_config_handler(config))

    # TTS API 路由
    app.router.add_post('/api/tts', create_tts_handler(ws_handler.server))

    # ASR API 路由（本地模式）
    app.router.add_post('/api/asr', create_asr_handler(ws_handler.server))

    # 静态文件路由
    _setup_static_routes(app, config)

    # 配置 CORS
    _setup_cors(app)


def _setup_static_routes(app: web.Application, config: ConfigManager) -> None:
    """设置静态文件路由"""

    # 为每个模型目录添加静态文件服务
    for model_dir in config.server.model_dirs:
        dir_path = Path(model_dir).resolve()
        dir_name = dir_path.name  # 获取目录名，如 "l2d", "hiyori"
        if dir_path.exists():
            app.router.add_static(f'/{dir_name}', str(dir_path))
            print(f"📂 静态文件路由: /{dir_name} -> {dir_path}")

    # 静态资源目录 (新结构)
    static_path = Path('./static').resolve()
    if static_path.exists():
        app.router.add_static('/static', str(static_path))
        print(f"📂 静态资源路由: /static -> {static_path}")

    # 背景图片目录 (兼容旧结构)
    background_path = Path('./background').resolve()
    if background_path.exists():
        app.router.add_static('/background', str(background_path))
        print(f"🖼️ 背景图片路由: /background -> {background_path}")


def _setup_cors(app: web.Application) -> None:
    """配置 CORS"""
    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*"
        )
    })

    for route in list(app.router.routes()):
        cors.add(route)


async def serve_api_root(request: web.Request) -> web.Response:
    """API 服务根路由。"""
    return web.json_response(
        {
            "service": "SoulLink_Live2D API",
            "status": "ok",
            "frontend": "Use the standalone Vue frontend project (frontend-vue).",
            "endpoints": {
                "health": "/api/health",
                "config": "/api/config",
                "models": "/api/models",
                "tts": "/api/tts",
                "asr": "/api/asr",
                "websocket": "/ws",
            },
        }
    )


async def serve_health(request: web.Request) -> web.Response:
    """健康检查接口。"""
    return web.json_response({"status": "ok"})


def create_get_models_handler(server):
    """创建获取模型列表的处理器"""
    async def get_models(request: web.Request) -> web.Response:
        models = [asdict(m) for m in server.scanner.models.values()]
        return web.json_response({"models": models})
    return get_models


def create_get_config_handler(config: ConfigManager):
    """创建获取配置的处理器（前端安全配置，不含敏感信息）"""
    async def get_config(request: web.Request) -> web.Response:
        return web.json_response(config.get_frontend_config())
    return get_config


def create_get_full_config_handler(config: ConfigManager):
    """创建获取完整配置的处理器（包含敏感信息，用于设置页面）"""
    async def get_full_config(request: web.Request) -> web.Response:
        return web.json_response(config._raw_config)
    return get_full_config


def create_save_config_handler(config: ConfigManager):
    """创建保存配置的处理器"""
    async def save_config(request: web.Request) -> web.Response:
        try:
            new_config = await request.json()

            # 保存到 config.yaml
            config_path = Path(config.config_path)
            with open(config_path, 'w', encoding='utf-8') as f:
                yaml.dump(new_config, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

            # 重新加载配置
            config.load()

            return web.json_response({
                "success": True,
                "message": "配置已保存并重新加载"
            })
        except Exception as e:
            print(f"❌ 保存配置失败: {e}")
            return web.json_response({
                "success": False,
                "error": str(e)
            }, status=500)

    return save_config


def create_tts_handler(server):
    """创建 TTS 请求处理器"""
    async def handle_tts(request: web.Request) -> web.Response:
        if not server.tts_generator or not server.tts_generator.is_enabled():
            return web.Response(status=404, text="TTS is disabled")

        try:
            data = await request.json()
            text = data.get("text", "")
            voice = data.get("voice", None)

            if not text:
                return web.Response(status=400, text="Text is required")

            # 生成音频
            audio_data = await server.tts_generator.generate(text, voice)

            return web.Response(
                body=audio_data,
                content_type="audio/mpeg"
            )
        except Exception as e:
            print(f"❌ TTS 处理失败: {e}")
            return web.Response(status=500, text=str(e))

    return handle_tts


def create_asr_handler(server):
    """创建本地 ASR 请求处理器"""
    async def handle_asr(request: web.Request) -> web.Response:
        if not server.asr or not server.asr.is_available():
            return web.Response(status=404, text="Local ASR is disabled")

        try:
            # 读取上传的音频文件
            reader = await request.multipart()
            field = await reader.next()

            if not field or field.name != 'audio':
                return web.Response(status=400, text="Audio file is required")

            audio_data = await field.read()

            # 执行识别
            text = await server.asr.transcribe(audio_data)

            return web.json_response({"text": text})

        except Exception as e:
            print(f"❌ ASR 处理失败: {e}")
            return web.Response(status=500, text=str(e))

    return handle_asr
