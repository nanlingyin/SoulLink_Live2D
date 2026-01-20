"""
聊天对话生成器
"""

import time
from typing import List, Optional, Union

import aiohttp

from ..config import LLMConfig, APIConfig
from .base import BaseGenerator


class ChatGenerator(BaseGenerator):
    """聊天对话生成器"""

    def __init__(self, config: Union[LLMConfig, APIConfig]):
        self.config = config
        self.system_prompt = """你是一个可爱、活泼的虚拟助手。请用简洁、友好的方式回复用户。
回复要求：
1. 语言自然、有个性
2. 适当使用语气词和表情
3. 回复不要太长，控制在50字以内
4. 根据对话情绪给出相应的回复风格"""

    async def generate(self, message: str, history: Optional[List[dict]] = None) -> str:
        """生成聊天回复"""
        if not self.config.api_key or self.config.api_key == "your-api-key-here":
            raise ValueError("请先在 config.yaml 中设置 API Key")

        messages = [{"role": "system", "content": self.system_prompt}]

        # 添加历史对话
        if history:
            for h in history[-6:]:  # 只保留最近6条
                messages.append({
                    "role": h.get("role", "user"),
                    "content": h.get("content", "")
                })

        # 添加当前消息（如果不在历史中）
        if not history or history[-1].get("content") != message:
            messages.append({"role": "user", "content": message})

        request_body = {
            "model": self.config.model,
            "messages": messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens
        }

        print(f"💬 [聊天回复] 调用 API ({self.config.model})...")
        start_time = time.time()

        async with aiohttp.ClientSession() as session:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.config.api_key}"
            }

            async with session.post(
                f"{self.config.base_url}/chat/completions",
                headers=headers,
                json=request_body
            ) as response:
                if response.status != 200:
                    error = await response.text()
                    raise Exception(f"聊天 API 请求失败: {response.status} - {error}")

                data = await response.json()
                reply = data["choices"][0]["message"]["content"]

                elapsed_time = (time.time() - start_time) * 1000
                print(f"💬 [聊天回复] 完成 ⏱️ {elapsed_time:.0f}ms | 回复: {reply[:30]}...")

                return reply
