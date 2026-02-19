"""
LLM expression generator (API mode).
"""

import json
import re
import time
from typing import Dict, Union

import aiohttp

from ..config import APIConfig, LLMConfig
from .base import BaseGenerator


class ExpressionGenerator(BaseGenerator):
    """Generate Live2D expression parameters via remote LLM APIs."""

    MOUTH_PARAM_HINTS = ("parammouth", "mouth")
    JOINT_PARAM_HINTS = (
        "anglex",
        "angley",
        "anglez",
        "bodyangle",
        "body",
        "head",
        "neck",
        "shoulder",
        "arm",
        "hand",
        "wrist",
        "elbow",
        "forearm",
        "spine",
        "torso",
        "hip",
        "leg",
        "knee",
        "foot",
    )

    def __init__(
        self,
        config: Union[LLMConfig, APIConfig],
        eye_open_binary: bool = False,
        joint_motion_boost: float = 1.25,
    ):
        self.config = config
        self.available_parameters: Dict[str, dict] = {}
        self.eye_open_binary = eye_open_binary
        self.joint_motion_boost = max(1.0, float(joint_motion_boost))

    def set_runtime_options(
        self,
        eye_open_binary: bool = None,
        joint_motion_boost: float = None,
    ) -> None:
        """Allow server to update runtime tuning options from config."""
        if eye_open_binary is not None:
            self.eye_open_binary = bool(eye_open_binary)
        if joint_motion_boost is not None:
            self.joint_motion_boost = max(1.0, float(joint_motion_boost))

    def update_parameters(self, parameters: Dict[str, dict]) -> None:
        self.available_parameters = parameters
        print(f"🎭 参数已更新: {len(parameters)} 个参数")

    @staticmethod
    def _extract_json(content: str) -> dict:
        json_match = re.search(r"\{[\s\S]*\}", content)
        if not json_match:
            raise ValueError("无法解析 LLM 返回的 JSON")
        return json.loads(json_match.group())

    @classmethod
    def _is_mouth_param(cls, param_id: str) -> bool:
        pid = (param_id or "").lower()
        return any(hint in pid for hint in cls.MOUTH_PARAM_HINTS)

    @staticmethod
    def _is_eye_open_param(param_id: str) -> bool:
        pid = (param_id or "").lower().replace("_", "")
        return "eye" in pid and "open" in pid

    @classmethod
    def _is_joint_motion_param(cls, param_id: str) -> bool:
        pid = (param_id or "").lower()
        if cls._is_mouth_param(param_id):
            return False
        if cls._is_eye_open_param(param_id):
            return False
        return any(hint in pid for hint in cls.JOINT_PARAM_HINTS)

    def _apply_eye_open_binary(self, value: float, min_v: float, max_v: float) -> float:
        if not self.eye_open_binary:
            return value
        mid = (min_v + max_v) / 2.0
        return max_v if value >= mid else min_v

    def _apply_joint_boost(self, param_id: str, value: float, default_v: float) -> float:
        if not self._is_joint_motion_param(param_id):
            return value
        return default_v + (value - default_v) * self.joint_motion_boost

    def _clamp_parameters(
        self,
        parameters: Dict[str, float],
        exclude_mouth: bool = False,
    ) -> Dict[str, float]:
        validated = {}
        for param_id, value in (parameters or {}).items():
            if param_id not in self.available_parameters:
                continue
            if exclude_mouth and self._is_mouth_param(param_id):
                continue

            info = self.available_parameters[param_id]
            try:
                min_v = float(info.get("min", -30))
            except (TypeError, ValueError):
                min_v = -30.0
            try:
                max_v = float(info.get("max", 30))
            except (TypeError, ValueError):
                max_v = 30.0
            if min_v > max_v:
                min_v, max_v = max_v, min_v
            try:
                default_v = float(info.get("default", 0))
            except (TypeError, ValueError):
                default_v = 0.0
            try:
                num = float(value)
            except (TypeError, ValueError):
                continue

            num = self._apply_joint_boost(param_id, num, default_v)
            if self._is_eye_open_param(param_id):
                num = self._apply_eye_open_binary(num, min_v, max_v)

            validated[param_id] = max(min_v, min(max_v, num))
        return validated

    def _build_parameter_descriptions(self, exclude_mouth: bool = False) -> str:
        rows = []
        for pid, info in self.available_parameters.items():
            if exclude_mouth and self._is_mouth_param(pid):
                continue
            rows.append(
                f"  - {pid}: {info.get('name', pid)}, 范围[{info.get('min', -30)}, {info.get('max', 30)}]"
            )
        return "\n".join(rows)

    def _has_joint_params(self) -> bool:
        return any(self._is_joint_motion_param(pid) for pid in self.available_parameters.keys())

    def _generate_system_prompt(self) -> str:
        if not self.available_parameters:
            return "模型参数尚未加载，请稍后再试。"

        param_descriptions = self._build_parameter_descriptions()
        eye_rule = (
            "眼睛开闭类参数必须只输出最大值或最小值。"
            if self.eye_open_binary
            else "眼睛开闭类参数可以输出区间内连续值。"
        )
        joint_rule = (
            "头部/身体/手臂等关节参数可适度放大变化，让动作更明显。"
            if self._has_joint_params()
            else "优先输出与当前模型相关的参数。"
        )
        return f"""你是一个 Live2D 虚拟形象的表情控制器。根据场景、对话或情感描述，生成表情参数。

当前模型可用参数：
{param_descriptions}

返回 JSON 格式：
{{
  "expression": "表情描述",
  "parameters": {{
    "参数ID": 数值
  }},
  "duration": 过渡时间毫秒数
}}

要求：
1. 参数组合要自然且可感知
2. 眼睛、眉毛、嘴巴、头部角度可组合表达
3. {eye_rule}
4. {joint_rule}
5. 只返回 JSON，不要附加解释
"""

    def _generate_tts_motion_prompt(self, frame_duration_ms: int) -> str:
        if not self.available_parameters:
            return "模型参数尚未加载，请稍后再试。"

        param_descriptions = self._build_parameter_descriptions(exclude_mouth=True)
        eye_rule = (
            "眼睛开闭类参数必须只输出最大值或最小值。"
            if self.eye_open_binary
            else "眼睛开闭类参数可以输出区间内连续值。"
        )
        return f"""你是一个 Live2D 连续动作控制器。
你正在为语音播报阶段生成逐秒关键帧，只负责非嘴部动作。

当前模型可用参数（已排除嘴部参数）：
{param_descriptions}

返回 JSON 格式：
{{
  "expression": "动作描述",
  "parameters": {{
    "参数ID": 数值
  }},
  "duration": {frame_duration_ms}
}}

要求：
1. 只生成非嘴部参数，禁止输出任何 Mouth 相关参数
2. 动作要明显，尤其是头部/身体/手部/其它关节参数（如模型支持）
3. {eye_rule}
4. 输出必须是 JSON，不要额外解释
"""

    async def _call_llm(self, request_body: dict) -> dict:
        if not self.config.api_key or self.config.api_key == "your-api-key-here":
            raise ValueError("请先在 config.yaml 中设置 API Key")

        start_time = time.time()
        async with aiohttp.ClientSession() as session:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.config.api_key}",
            }
            async with session.post(
                f"{self.config.base_url}/chat/completions",
                headers=headers,
                json=request_body,
            ) as response:
                if response.status != 200:
                    error = await response.text()
                    raise Exception(f"API 请求失败: {response.status} - {error}")

                data = await response.json()
                content = data["choices"][0]["message"]["content"]
                elapsed = (time.time() - start_time) * 1000
                print(f"🎭 [表情生成] 完成 ⏱️ {elapsed:.0f}ms")
                return self._extract_json(content)

    async def generate(self, input_text: str, context: str = "") -> dict:
        if not self.available_parameters:
            raise ValueError("模型参数尚未加载")

        user_message = (
            f"场景背景：{context}\n\n当前输入：{input_text}" if context else input_text
        )
        request_body = {
            "model": self.config.model,
            "messages": [
                {"role": "system", "content": self._generate_system_prompt()},
                {"role": "user", "content": user_message},
            ],
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
        }

        print(f"🎭 [表情生成] 调用 API ({self.config.model})...")
        result = await self._call_llm(request_body)
        result["parameters"] = self._clamp_parameters(result.get("parameters", {}))
        return result

    async def generate_tts_motion_frame(
        self,
        speech_text: str,
        frame_index: int,
        total_frames: int,
        context: str = "",
        frame_duration_ms: int = 1000,
    ) -> dict:
        if not self.available_parameters:
            raise ValueError("模型参数尚未加载")

        user_message = (
            f"语音内容：{speech_text}\n"
            f"当前秒帧：{frame_index + 1}/{total_frames}\n"
            "请生成这一秒的连续动作关键帧。"
        )
        if context:
            user_message = f"场景背景：{context}\n\n{user_message}"

        request_body = {
            "model": self.config.model,
            "messages": [
                {
                    "role": "system",
                    "content": self._generate_tts_motion_prompt(frame_duration_ms),
                },
                {"role": "user", "content": user_message},
            ],
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
        }

        print(
            f"🎬 [TTS连续动作] 调用 API ({self.config.model}) "
            f"frame={frame_index + 1}/{total_frames}"
        )
        result = await self._call_llm(request_body)
        result["parameters"] = self._clamp_parameters(
            result.get("parameters", {}),
            exclude_mouth=True,
        )
        result["duration"] = frame_duration_ms
        return result
