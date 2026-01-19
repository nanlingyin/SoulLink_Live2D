"""
WebSocket 消息处理器
"""

import json
import time
import asyncio
from typing import TYPE_CHECKING, Set
from dataclasses import asdict

from aiohttp import web, WSMsgType

if TYPE_CHECKING:
    from .app import SoulLinkServer


class WebSocketHandler:
    """WebSocket 消息处理器"""

    def __init__(self, server: 'SoulLinkServer'):
        self.server = server

    async def handle_connection(self, request: web.Request) -> web.WebSocketResponse:
        """处理 WebSocket 连接"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        self.server.clients.add(ws)
        client_ip = request.remote
        print(f"🔗 WebSocket 客户端连接: {client_ip} (当前 {len(self.server.clients)} 个)")

        # 发送模型列表
        await self._send_model_list(ws)

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    await self._handle_message(ws, msg.data)
                elif msg.type == WSMsgType.ERROR:
                    print(f"❌ WebSocket 错误: {ws.exception()}")
        finally:
            self.server.clients.discard(ws)
            print(f"🔌 WebSocket 客户端断开: {client_ip} (剩余 {len(self.server.clients)} 个)")

        return ws

    async def _send_model_list(self, ws: web.WebSocketResponse) -> None:
        """发送模型列表给客户端"""
        models = [asdict(m) for m in self.server.scanner.models.values()]
        await ws.send_json({
            "type": "model_list",
            "models": models,
            "current": self.server.current_model
        })

    async def _handle_message(self, ws: web.WebSocketResponse, data: str) -> None:
        """处理客户端消息"""
        try:
            msg = json.loads(data)
            msg_type = msg.get("type")

            if msg_type == "load_model":
                await self._handle_load_model(ws, msg)
            elif msg_type == "update_parameters":
                await self._handle_update_parameters(ws, msg)
            elif msg_type == "chat":
                await self._handle_chat(ws, msg)
            elif msg_type == "chat_with_reply":
                await self._handle_chat_with_reply(ws, msg)
            elif msg_type == "expression":
                await self._handle_expression(msg)
            elif msg_type == "reset":
                await self._handle_reset(msg)
            elif msg_type == "ping":
                await ws.send_json({"type": "pong"})

        except json.JSONDecodeError:
            await ws.send_json({
                "type": "error",
                "message": "无效的 JSON 格式"
            })
        except Exception as e:
            print(f"❌ 处理消息错误: {e}")
            await ws.send_json({
                "type": "error",
                "message": str(e)
            })

    async def _handle_load_model(self, ws: web.WebSocketResponse, msg: dict) -> None:
        """处理加载模型请求"""
        model_name = msg.get("model")
        if model_name in self.server.scanner.models:
            self.server.current_model = model_name
            model = self.server.scanner.models[model_name]
            await self.server.broadcast({
                "type": "load_model",
                "model": asdict(model)
            })
            print(f"📦 加载模型: {model_name}")
        else:
            await ws.send_json({
                "type": "error",
                "message": f"模型不存在: {model_name}"
            })

    async def _handle_update_parameters(self, ws: web.WebSocketResponse, msg: dict) -> None:
        """处理更新参数请求"""
        parameters = msg.get("parameters", {})
        self.server.expression_generator.update_parameters(parameters)
        await ws.send_json({
            "type": "parameters_updated",
            "count": len(parameters)
        })

    async def _handle_chat(self, ws: web.WebSocketResponse, msg: dict) -> None:
        """处理聊天消息，触发 LLM 生成表情"""
        text = msg.get("message", "")
        context = msg.get("context", "")
        auto_reset = msg.get("autoReset", True)

        try:
            result = await self.server.expression_generator.generate(text, context)

            # 广播表情指令给所有客户端
            await self.server.broadcast({
                "type": "expression",
                "expression": result.get("expression", ""),
                "parameters": result.get("parameters", {}),
                "duration": result.get("duration", 800),
                "autoReset": auto_reset
            })

            print(f"🎭 生成表情: {result.get('expression')}")

        except Exception as e:
            await ws.send_json({
                "type": "error",
                "message": str(e)
            })

    async def _handle_chat_with_reply(self, ws: web.WebSocketResponse, msg: dict) -> None:
        """处理完整聊天：并发生成对话回复和表情"""
        text = msg.get("message", "")
        context = msg.get("context", "")
        history = msg.get("history", [])
        auto_reset = msg.get("autoReset", True)

        try:
            total_start_time = time.time()
            print(f"\n{'='*50}")
            print(f"📨 收到聊天请求: {text[:50]}...")

            # 并发调用聊天和表情生成
            chat_task = self.server.chat_generator.generate(text, history)
            expression_task = self.server.expression_generator.generate(text, context)

            # 等待两个任务完成
            results = await asyncio.gather(
                chat_task,
                expression_task,
                return_exceptions=True
            )

            chat_reply = results[0] if not isinstance(results[0], Exception) else f"聊天生成失败: {results[0]}"
            expression_result = results[1] if not isinstance(results[1], Exception) else {}

            total_elapsed = (time.time() - total_start_time) * 1000

            # 构建响应
            response = {
                "type": "chat_response",
                "reply": chat_reply,
                "expression": expression_result.get("expression", "") if isinstance(expression_result, dict) else "",
                "parameters": expression_result.get("parameters", {}) if isinstance(expression_result, dict) else {},
                "duration": expression_result.get("duration", 800) if isinstance(expression_result, dict) else 800,
                "autoReset": auto_reset
            }

            # 发送给请求的客户端
            await ws.send_json(response)

            # 打印统计信息
            print(f"{'='*50}")
            print(f"✅ 请求处理完成 | 总耗时: {total_elapsed:.0f}ms")
            if isinstance(expression_result, dict):
                print(f"   🎭 表情: {expression_result.get('expression', '未知')}")
            print(f"{'='*50}\n")

        except Exception as e:
            print(f"❌ 聊天处理错误: {e}")
            await ws.send_json({
                "type": "chat_error",
                "error": str(e)
            })

    async def _handle_expression(self, msg: dict) -> None:
        """处理直接设置表情参数"""
        await self.server.broadcast({
            "type": "expression",
            "parameters": msg.get("parameters", {}),
            "duration": msg.get("duration", 800),
            "autoReset": msg.get("autoReset", False)
        })

    async def _handle_reset(self, msg: dict) -> None:
        """处理重置表情"""
        await self.server.broadcast({
            "type": "reset",
            "duration": msg.get("duration", 800)
        })
