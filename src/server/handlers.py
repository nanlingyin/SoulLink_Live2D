"""
WebSocket message handlers.
"""

import asyncio
import json
import math
import time
import uuid
from dataclasses import asdict
from typing import TYPE_CHECKING, Dict, Set

from aiohttp import WSMsgType, web

if TYPE_CHECKING:
    from .app import SoulLinkServer


class WebSocketHandler:
    """WebSocket handler for chat, expression and TTS-motion streams."""

    MOUTH_PARAM_HINTS = ("mouth", "parammouth")
    MAX_TTS_MOTION_FRAMES = 120

    def __init__(self, server: "SoulLinkServer"):
        self.server = server
        self._tts_motion_tasks: Dict[str, asyncio.Task] = {}
        self._client_sessions: Dict[web.WebSocketResponse, Set[str]] = {}

    async def handle_connection(self, request: web.Request) -> web.WebSocketResponse:
        """Handle a new websocket connection."""
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        self.server.clients.add(ws)
        self._client_sessions.setdefault(ws, set())
        client_ip = request.remote
        print(f"🔆 WebSocket 客户端连接: {client_ip} (当前 {len(self.server.clients)} 个)")

        await self._send_model_list(ws)

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    await self._handle_message(ws, msg.data)
                elif msg.type == WSMsgType.ERROR:
                    print(f"❌ WebSocket 错误: {ws.exception()}")
        finally:
            await self._cancel_client_tts_motion_sessions(ws)
            self.server.clients.discard(ws)
            self._client_sessions.pop(ws, None)
            print(f"🔲 WebSocket 客户端断开: {client_ip} (剩余 {len(self.server.clients)} 个)")

        return ws

    async def _send_model_list(self, ws: web.WebSocketResponse) -> None:
        """Send model list to client."""
        models = [asdict(m) for m in self.server.scanner.models.values()]
        await ws.send_json({"type": "model_list", "models": models, "current": self.server.current_model})

    async def _handle_message(self, ws: web.WebSocketResponse, data: str) -> None:
        """Route websocket message by type."""
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
            elif msg_type == "tts_motion_start":
                await self._handle_tts_motion_start(ws, msg)
            elif msg_type == "tts_motion_stop":
                await self._handle_tts_motion_stop(ws, msg)
            elif msg_type == "ping":
                await ws.send_json({"type": "pong"})
        except json.JSONDecodeError:
            await self._send_ws_error(ws, "无效的 JSON 格式")
        except Exception as e:
            print(f"❌ 处理消息错误: {e}")
            await self._send_ws_error(ws, str(e))

    async def _send_ws_error(self, ws: web.WebSocketResponse, message: str) -> None:
        if ws.closed:
            return
        await ws.send_json({"type": "error", "message": message})

    async def _handle_load_model(self, ws: web.WebSocketResponse, msg: dict) -> None:
        model_name = msg.get("model")
        if model_name in self.server.scanner.models:
            self.server.current_model = model_name
            model = self.server.scanner.models[model_name]
            await self.server.broadcast({"type": "load_model", "model": asdict(model)})
            print(f"📝 加载模型: {model_name}")
            return
        await self._send_ws_error(ws, f"模型不存在: {model_name}")

    async def _handle_update_parameters(self, ws: web.WebSocketResponse, msg: dict) -> None:
        parameters = msg.get("parameters", {})
        self.server.expression_generator.update_parameters(parameters)
        await ws.send_json({"type": "parameters_updated", "count": len(parameters)})

    async def _handle_chat(self, ws: web.WebSocketResponse, msg: dict) -> None:
        text = msg.get("message", "")
        context = msg.get("context", "")
        auto_reset = msg.get("autoReset", True)

        try:
            result = await self.server.expression_generator.generate(text, context)
            await self.server.broadcast(
                {
                    "type": "expression",
                    "expression": result.get("expression", ""),
                    "parameters": result.get("parameters", {}),
                    "duration": result.get("duration", 800),
                    "autoReset": auto_reset,
                }
            )
            print(f"🎁 生成表情: {result.get('expression')}")
        except Exception as e:
            await self._send_ws_error(ws, str(e))

    async def _handle_chat_with_reply(self, ws: web.WebSocketResponse, msg: dict) -> None:
        """Handle full chat request: reply + one-shot expression in parallel."""
        text = msg.get("message", "")
        context = msg.get("context", "")
        history = msg.get("history", [])
        auto_reset = msg.get("autoReset", True)
        prepare_tts_motion = msg.get("prepareTtsMotion", False)  # 是否预生成 TTS 连续动作

        try:
            total_start_time = time.time()
            print(f"\n{'=' * 50}")
            print(f"📠 收到聊天请求: {text[:50]}...")

            chat_task = self.server.chat_generator.generate(text, history)
            expression_task = self.server.expression_generator.generate(text, context)
            results = await asyncio.gather(chat_task, expression_task, return_exceptions=True)

            chat_reply = results[0] if not isinstance(results[0], Exception) else f"聊天生成失败: {results[0]}"
            expression_result = results[1] if not isinstance(results[1], Exception) else {}
            total_elapsed = (time.time() - total_start_time) * 1000

            response = {
                "type": "chat_response",
                "reply": chat_reply,
                "expression": expression_result.get("expression", "") if isinstance(expression_result, dict) else "",
                "parameters": expression_result.get("parameters", {}) if isinstance(expression_result, dict) else {},
                "duration": expression_result.get("duration", 800) if isinstance(expression_result, dict) else 800,
                "autoReset": auto_reset,
            }

            # 如果启用了 TTS 且需要预生成连续动作
            if prepare_tts_motion and self.server.tts_generator and self.server.tts_generator.is_enabled():
                print(f"🎬 预生成 TTS 连续动作...")
                motion_start = time.time()

                # 估算语音时长（简单估算：每个字符约 0.15 秒）
                estimated_duration = len(chat_reply) * 0.15
                total_frames = max(1, min(int(estimated_duration), self.MAX_TTS_MOTION_FRAMES))

                # 批量生成所有动作帧
                motion_frames = await self._generate_tts_motion_frames(
                    speech_text=chat_reply,
                    total_frames=total_frames,
                    context=context
                )

                motion_elapsed = (time.time() - motion_start) * 1000
                print(f"🎬 预生成完成: {len(motion_frames)}/{total_frames} 帧 ⏱️ {motion_elapsed:.0f}ms")

                # 将动作帧添加到响应中
                response["ttsMotionFrames"] = motion_frames
                response["ttsMotionReady"] = True

            await ws.send_json(response)

            print(f"{'=' * 50}")
            print(f"✅ 请求处理完成 | 总耗时: {total_elapsed:.0f}ms")
            if isinstance(expression_result, dict):
                print(f"   🎁 表情: {expression_result.get('expression', '未知')}")
                params = expression_result.get('parameters', {})
                if params:
                    print(f"   📊 表情参数:")
                    for param_id, value in params.items():
                        print(f"      {param_id}: {value}")
            print(f"{'=' * 50}\n")
        except Exception as e:
            print(f"❌ 聊天处理错误: {e}")
            if not ws.closed:
                await ws.send_json({"type": "chat_error", "error": str(e)})

    async def _handle_expression(self, msg: dict) -> None:
        await self.server.broadcast(
            {
                "type": "expression",
                "parameters": msg.get("parameters", {}),
                "duration": msg.get("duration", 800),
                "autoReset": msg.get("autoReset", False),
            }
        )

    async def _handle_reset(self, msg: dict) -> None:
        await self.server.broadcast({"type": "reset", "duration": msg.get("duration", 800)})

    async def _handle_tts_motion_start(self, ws: web.WebSocketResponse, msg: dict) -> None:
        """Start one TTS continuous-motion session."""
        session_id = str(msg.get("sessionId") or uuid.uuid4())
        text = (msg.get("text") or "").strip()
        context = msg.get("context", "")
        requested_duration = msg.get("durationSec", 0)
        frame_interval_sec = 1.0  # fixed: one frame per second

        if not text:
            await self._send_ws_error(ws, "tts_motion_start 缺少 text")
            return

        try:
            duration_sec = float(requested_duration)
        except (TypeError, ValueError):
            duration_sec = 0.0

        total_frames = max(1, math.ceil(duration_sec))
        total_frames = min(total_frames, self.MAX_TTS_MOTION_FRAMES)

        await self._cancel_tts_motion_session(session_id)

        task = asyncio.create_task(
            self._run_tts_motion_session(
                ws=ws,
                session_id=session_id,
                speech_text=text,
                context=context,
                total_frames=total_frames,
                frame_interval_sec=frame_interval_sec,
            )
        )
        self._tts_motion_tasks[session_id] = task
        self._client_sessions.setdefault(ws, set()).add(session_id)

        if not ws.closed:
            await ws.send_json(
                {
                    "type": "tts_motion_start",
                    "sessionId": session_id,
                    "frameCount": total_frames,
                    "frameIntervalSec": frame_interval_sec,
                }
            )
        print(f"🎬 启动 TTS 连续动作: session={session_id} frames={total_frames}")

    async def _handle_tts_motion_stop(self, ws: web.WebSocketResponse, msg: dict) -> None:
        session_id = msg.get("sessionId")
        if not session_id:
            await self._send_ws_error(ws, "tts_motion_stop 缺少 sessionId")
            return
        await self._cancel_tts_motion_session(str(session_id), notify_done=True, ws=ws)

    async def _run_tts_motion_session(
        self,
        ws: web.WebSocketResponse,
        session_id: str,
        speech_text: str,
        context: str,
        total_frames: int,
        frame_interval_sec: float,
    ) -> None:
        frame_duration_ms = int(frame_interval_sec * 1000)
        generator = self.server.expression_generator

        try:
            # 批量并发生成所有帧
            print(f"🎬 [TTS连续动作] 开始批量生成 {total_frames} 帧...")
            generation_start = time.time()

            # 创建所有生成任务
            generation_tasks = []
            for frame_index in range(total_frames):
                task = generator.generate_tts_motion_frame(
                    speech_text=speech_text,
                    frame_index=frame_index,
                    total_frames=total_frames,
                    context=context,
                    frame_duration_ms=frame_duration_ms,
                )
                generation_tasks.append(task)

            # 并发执行所有生成任务
            results = await asyncio.gather(*generation_tasks, return_exceptions=True)
            generation_elapsed = (time.time() - generation_start) * 1000
            print(f"🎬 [TTS连续动作] 批量生成完成 ⏱️ {generation_elapsed:.0f}ms")

            # 按顺序发送所有帧
            successful_frames = 0
            for frame_index, result in enumerate(results):
                if ws.closed:
                    break

                # 处理生成错误
                if isinstance(result, Exception):
                    if not ws.closed:
                        await ws.send_json(
                            {
                                "type": "tts_motion_error",
                                "sessionId": session_id,
                                "frameIndex": frame_index,
                                "message": str(result),
                            }
                        )
                    continue

                # 过滤嘴部参数
                parameters = self._filter_mouth_params(result.get("parameters", {}))
                if not parameters:
                    continue

                # 发送帧数据
                if ws.closed:
                    break
                await ws.send_json(
                    {
                        "type": "tts_motion_frame",
                        "sessionId": session_id,
                        "frameIndex": frame_index,
                        "secondIndex": frame_index,
                        "totalFrames": total_frames,
                        "duration": int(result.get("duration", frame_duration_ms)),
                        "parameters": parameters,
                        "expression": result.get("expression", ""),
                        "autoReset": False,
                    }
                )
                successful_frames += 1

            print(f"🎬 [TTS连续动作] 发送完成: {successful_frames}/{total_frames} 帧")

            if not ws.closed:
                await ws.send_json({"type": "tts_motion_done", "sessionId": session_id})
        except asyncio.CancelledError:
            raise
        finally:
            self._cleanup_tts_motion_session(session_id, ws)

    async def _generate_tts_motion_frames(
        self,
        speech_text: str,
        total_frames: int,
        context: str = "",
    ) -> list:
        """批量生成所有 TTS 连续动作帧"""
        frame_duration_ms = 1000
        generator = self.server.expression_generator

        # 创建所有生成任务
        generation_tasks = []
        for frame_index in range(total_frames):
            task = generator.generate_tts_motion_frame(
                speech_text=speech_text,
                frame_index=frame_index,
                total_frames=total_frames,
                context=context,
                frame_duration_ms=frame_duration_ms,
            )
            generation_tasks.append(task)

        # 并发执行所有生成任务
        results = await asyncio.gather(*generation_tasks, return_exceptions=True)

        # 处理结果，过滤嘴部参数
        motion_frames = []
        for frame_index, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"⚠️ 帧 {frame_index} 生成失败: {result}")
                continue

            parameters = self._filter_mouth_params(result.get("parameters", {}))
            if not parameters:
                continue

            motion_frames.append({
                "frameIndex": frame_index,
                "secondIndex": frame_index,
                "duration": int(result.get("duration", frame_duration_ms)),
                "parameters": parameters,
                "expression": result.get("expression", ""),
            })

        return motion_frames

    def _filter_mouth_params(self, parameters: dict) -> dict:
        if not parameters:
            return {}
        filtered = {}
        for param_id, value in parameters.items():
            pid = (param_id or "").lower()
            if any(hint in pid for hint in self.MOUTH_PARAM_HINTS):
                continue
            filtered[param_id] = value
        return filtered

    async def _cancel_tts_motion_session(
        self,
        session_id: str,
        notify_done: bool = False,
        ws: web.WebSocketResponse = None,
    ) -> None:
        task = self._tts_motion_tasks.get(session_id)
        had_active_task = task is not None and not task.done()
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass

        self._tts_motion_tasks.pop(session_id, None)
        for sessions in self._client_sessions.values():
            sessions.discard(session_id)

        if notify_done and had_active_task and ws and not ws.closed:
            await ws.send_json({"type": "tts_motion_done", "sessionId": session_id, "reason": "stopped"})

    async def _cancel_client_tts_motion_sessions(self, ws: web.WebSocketResponse) -> None:
        session_ids = list(self._client_sessions.get(ws, set()))
        for session_id in session_ids:
            await self._cancel_tts_motion_session(session_id)

    def _cleanup_tts_motion_session(self, session_id: str, ws: web.WebSocketResponse) -> None:
        self._tts_motion_tasks.pop(session_id, None)
        if ws in self._client_sessions:
            self._client_sessions[ws].discard(session_id)
