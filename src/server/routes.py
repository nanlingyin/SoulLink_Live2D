"""
路由定义
"""

from pathlib import Path
from dataclasses import asdict
import yaml
import base64

from aiohttp import web, ClientSession
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

    # 蒙版提取 API 路由（实验性）
    app.router.add_post('/api/extract-mask', create_extract_mask_handler(config))

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
                "extract_mask": "/api/extract-mask",
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


EXTRACT_MASK_PROMPT = (
    "Generate a strict black-and-white occlusion mask aligned pixel-perfect to the input photo. "
    "Task: mark the ENTIRE tabletop plane in front of the camera as WHITE, including empty table "
    "surface texture, table edge, and all objects resting on the table (hotpot, bowls, plates, "
    "chopsticks, cups, food). Also mark any near-camera foreground objects as WHITE. "
    "Mark chairs, walls, floor, and all background regions as BLACK. "
    "Output only one flat mask image, no text, no decoration, no style transfer, no extra objects."
)


def create_extract_mask_handler(config: ConfigManager):
    """创建蒙版提取代理处理器（调用外部 AI API 生成遮挡蒙版）"""
    async def handle_extract_mask(request: web.Request) -> web.Response:
        ig = config.experimental.image_gen
        if not ig or not ig.api_key:
            return web.json_response(
                {"error": "experimental.imageGen not configured"},
                status=400
            )

        try:
            data = await request.json()
            image_b64 = data.get("image", "")
            if not image_b64:
                return web.json_response({"error": "image is required"}, status=400)

            # 构建 API 请求
            api_url = ig.base_url.rstrip("/") + "/chat/completions"
            headers = {
                "Authorization": f"Bearer {ig.api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": ig.model,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": EXTRACT_MASK_PROMPT},
                        {"type": "image_url", "image_url": {"url": image_b64}}
                    ]
                }],
                "modalities": ["text", "image"],
                "temperature": ig.temperature,
            }

            async with ClientSession() as session:
                async with session.post(api_url, json=payload, headers=headers, timeout=180) as resp:
                    if resp.status != 200:
                        err_text = await resp.text()
                        return web.json_response(
                            {"error": f"API error {resp.status}: {err_text[:500]}"},
                            status=502
                        )
                    result = await resp.json()

            # 从响应中提取蒙版图片
            mask_data_url = _extract_image_from_response(result)
            if not mask_data_url:
                return web.json_response(
                    {"error": "No mask image found in API response"},
                    status=502
                )

            return web.json_response({"mask": mask_data_url})

        except Exception as e:
            print(f"extract-mask error: {e}")
            return web.json_response({"error": str(e)}, status=500)

    return handle_extract_mask


def _extract_image_from_response(result: dict) -> str | None:
    """从 AI API 响应中提取图片 data URI，支持多种返回格式"""
    choices = result.get("choices", [])
    if not choices:
        return None

    message = choices[0].get("message", {})
    content = message.get("content")

    # Format 1: content is array
    if isinstance(content, list):
        for part in content:
            if not isinstance(part, dict):
                continue
            # image_url or input_image type
            if part.get("type") in ("image_url", "input_image"):
                src = part.get("image_url")
                if isinstance(src, dict):
                    src = src.get("url", "")
                if isinstance(src, str) and src.startswith("data:image/"):
                    return src
            # output_image or image type with b64_json
            if part.get("type") in ("output_image", "image"):
                b64 = part.get("b64_json", "")
                if b64:
                    return f"data:image/png;base64,{b64}"

    # Format 2: content is string with embedded data URI
    if isinstance(content, str):
        import re
        match = re.search(r'data:image/[^;]+;base64,[A-Za-z0-9+/=]+', content)
        if match:
            return match.group(0)

    return None
