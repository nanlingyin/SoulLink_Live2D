"""
TTS 语音合成生成器
使用 OpenAI 兼容格式的 TTS API
"""

import time
from typing import Optional

import aiohttp

from ..config import TTSConfig


class TTSGenerator:
    """TTS 语音合成生成器"""

    def __init__(self, config: TTSConfig):
        self.config = config

    def is_enabled(self) -> bool:
        """检查 TTS 是否启用"""
        return self.config.enabled and bool(self.config.api_key)

    async def generate(self, text: str, voice: Optional[str] = None) -> bytes:
        """
        调用 TTS API 生成语音

        Args:
            text: 要合成的文字
            voice: 声音选择（可选，默认使用配置中的 voice）

        Returns:
            音频数据（MP3 格式）
        """
        if not self.config.api_key:
            raise ValueError("请在 config.yaml 中设置 TTS API Key")

        selected_voice = voice or self.config.voice

        request_body = {
            "model": self.config.model,
            "input": text,
            "voice": selected_voice,
            "speed": self.config.speed
        }

        print(f"🔊 [TTS] 调用 API (voice={selected_voice})...")
        start_time = time.time()

        async with aiohttp.ClientSession() as session:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.config.api_key}"
            }

            async with session.post(
                f"{self.config.base_url}/audio/speech",
                headers=headers,
                json=request_body
            ) as response:
                if response.status != 200:
                    error = await response.text()
                    raise Exception(f"TTS API 请求失败: {response.status} - {error}")

                audio_data = await response.read()

                elapsed_time = (time.time() - start_time) * 1000
                print(f"🔊 [TTS] 完成 ⏱️ {elapsed_time:.0f}ms | 音频大小: {len(audio_data)} bytes")

                return audio_data

    async def generate_stream(self, text: str, voice: Optional[str] = None):
        """
        流式生成语音（返回异步生成器）

        Args:
            text: 要合成的文字
            voice: 声音选择

        Yields:
            音频数据块
        """
        if not self.config.api_key:
            raise ValueError("请在 config.yaml 中设置 TTS API Key")

        selected_voice = voice or self.config.voice

        request_body = {
            "model": self.config.model,
            "input": text,
            "voice": selected_voice,
            "speed": self.config.speed,
            "response_format": "mp3"
        }

        print(f"🔊 [TTS] 流式调用 API (voice={selected_voice})...")

        async with aiohttp.ClientSession() as session:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.config.api_key}"
            }

            async with session.post(
                f"{self.config.base_url}/audio/speech",
                headers=headers,
                json=request_body
            ) as response:
                if response.status != 200:
                    error = await response.text()
                    raise Exception(f"TTS API 请求失败: {response.status} - {error}")

                async for chunk in response.content.iter_chunked(1024):
                    yield chunk
