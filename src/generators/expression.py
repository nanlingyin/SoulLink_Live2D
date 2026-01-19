"""
LLM 表情生成器 (API 模式)
"""

import re
import time
import json
from typing import Dict

import aiohttp

from ..config import LLMConfig
from .base import BaseGenerator


class ExpressionGenerator(BaseGenerator):
    """通过远程 API 生成表情参数"""

    def __init__(self, config: LLMConfig):
        self.config = config
        self.available_parameters: Dict[str, dict] = {}

    def update_parameters(self, parameters: Dict[str, dict]) -> None:
        """更新可用参数列表"""
        self.available_parameters = parameters
        print(f"🎭 参数已更新: {len(parameters)} 个参数")

    def _generate_system_prompt(self) -> str:
        """生成系统提示词"""
        if not self.available_parameters:
            return "模型参数尚未加载，请稍后再试。"

        param_descriptions = "\n".join([
            f"  - {pid}: {info.get('name', pid)}, 范围[{info.get('min', -30)}, {info.get('max', 30)}]"
            for pid, info in self.available_parameters.items()
        ])

        return f"""你是一个 Live2D 虚拟形象的表情控制器。根据场景、对话或情感描述，生成表情参数。

当前模型可用参数：
{param_descriptions}

返回JSON格式：
{{
  "expression": "表情描述",
  "parameters": {{
    "参数ID": 数值,
    ...
  }},
  "duration": 过渡时间毫秒数
}}

要求：
1. 参数值要足够大，让表情变化明显可见
2. 充分组合多个参数来表达丰富表情
3. 眼睛、眉毛、嘴巴的配合对表情很重要
4. 只返回JSON，不要其他文字"""

    async def generate(self, input_text: str, context: str = "") -> dict:
        """调用 LLM 生成表情参数"""
        if not self.config.api_key or self.config.api_key == "your-api-key-here":
            raise ValueError("请先在 config.yaml 中设置 API Key")

        if not self.available_parameters:
            raise ValueError("模型参数尚未加载")

        user_message = f"场景背景：{context}\n\n当前输入：{input_text}" if context else input_text

        request_body = {
            "model": self.config.model,
            "messages": [
                {"role": "system", "content": self._generate_system_prompt()},
                {"role": "user", "content": user_message}
            ],
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens
        }

        print(f"🎭 [表情生成] 调用 API ({self.config.model})...")
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
                    raise Exception(f"API 请求失败: {response.status} - {error}")

                data = await response.json()
                content = data["choices"][0]["message"]["content"]

                elapsed_time = (time.time() - start_time) * 1000
                print(f"🎭 [表情生成] 完成 ⏱️ {elapsed_time:.0f}ms")

                # 提取 JSON
                json_match = re.search(r'\{[\s\S]*\}', content)
                if not json_match:
                    raise ValueError("无法解析 LLM 返回的 JSON")

                result = json.loads(json_match.group())

                # 验证参数范围
                validated_params = {}
                for param_id, value in result.get("parameters", {}).items():
                    if param_id in self.available_parameters:
                        info = self.available_parameters[param_id]
                        validated_params[param_id] = max(
                            info.get("min", -30),
                            min(info.get("max", 30), value)
                        )

                result["parameters"] = validated_params
                return result
