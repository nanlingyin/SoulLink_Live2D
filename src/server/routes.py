"""
路由定义
"""

from pathlib import Path
from dataclasses import asdict

from aiohttp import web
import aiohttp_cors

from ..config import ConfigManager


def setup_routes(app: web.Application, config: ConfigManager, ws_handler) -> None:
    """设置所有路由"""

    # 根路由 - 提供 index.html
    app.router.add_get('/', serve_index)

    # WebSocket
    app.router.add_get('/ws', ws_handler.handle_connection)

    # API 路由
    app.router.add_get('/api/models', create_get_models_handler(ws_handler.server))
    app.router.add_get('/api/config', create_get_config_handler(config))

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

    # 前端文件 (新结构)
    frontend_path = Path('./frontend').resolve()
    if frontend_path.exists():
        app.router.add_static('/js', str(frontend_path / 'js'))
        app.router.add_static('/css', str(frontend_path / 'css'))
        print(f"📂 前端路由: /js, /css -> {frontend_path}")
    else:
        # 兼容旧结构
        js_path = Path('./js').resolve()
        if js_path.exists():
            app.router.add_static('/js', str(js_path))
            print(f"📂 静态文件路由: /js -> {js_path}")

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


async def serve_index(request: web.Request) -> web.Response:
    """提供 index.html 首页"""
    # 优先使用新结构
    frontend_index = Path('./frontend/index.html')
    if frontend_index.exists():
        return web.FileResponse(str(frontend_index))
    # 兼容旧结构
    return web.FileResponse('./index.html')


def create_get_models_handler(server):
    """创建获取模型列表的处理器"""
    async def get_models(request: web.Request) -> web.Response:
        models = [asdict(m) for m in server.scanner.models.values()]
        return web.json_response({"models": models})
    return get_models


def create_get_config_handler(config: ConfigManager):
    """创建获取配置的处理器"""
    async def get_config(request: web.Request) -> web.Response:
        return web.json_response(config.get_frontend_config())
    return get_config
