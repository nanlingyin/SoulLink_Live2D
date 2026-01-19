#!/usr/bin/env python3
"""
SoulLink_Live2D - AI 驱动的 Live2D 表情控制系统
启动入口脚本

功能：
1. 自动扫描 l2d 目录，发现所有 Live2D 模型
2. 监听文件夹变化，实时通知前端
3. WebSocket 服务，与前端双向通信
4. LLM 调用，生成表情参数（支持本地模型和远程API）
5. 统一配置管理 - 所有配置从 config.yaml 读取

用法：
    python server.py
"""

import asyncio

from src.server import SoulLinkServer
from src.config import ConfigManager


def main():
    """主入口函数"""
    print("🚀 SoulLink Server 启动中...")

    config = ConfigManager("config.yaml")
    server = SoulLinkServer(config)

    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        print("\n👋 服务器已停止")


if __name__ == "__main__":
    main()
