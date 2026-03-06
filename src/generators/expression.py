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
        tts_motion_keep_lip_sync: bool = True,
    ):
        self.config = config
        self.available_parameters: Dict[str, dict] = {}
        self.eye_open_binary = eye_open_binary
        self.joint_motion_boost = max(1.0, float(joint_motion_boost))
        self.tts_motion_keep_lip_sync = tts_motion_keep_lip_sync
        self.custom_prompt: str = ""  # 模型专属 prompt

    def set_runtime_options(
        self,
        eye_open_binary: bool = None,
        joint_motion_boost: float = None,
        tts_motion_keep_lip_sync: bool = None,
    ) -> None:
        """Allow server to update runtime tuning options from config."""
        if eye_open_binary is not None:
            self.eye_open_binary = bool(eye_open_binary)
        if joint_motion_boost is not None:
            self.joint_motion_boost = max(1.0, float(joint_motion_boost))
        if tts_motion_keep_lip_sync is not None:
            self.tts_motion_keep_lip_sync = bool(tts_motion_keep_lip_sync)

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
        base_prompt = f"""你是一个 Live2D 虚拟形象的表情控制器。根据场景、对话或情感描述，生成表情参数。

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
5. 只返回 JSON，不要附加解释"""

        # 如果有模型专属 prompt，附加到末尾
        if self.custom_prompt:
            base_prompt += f"\n\n【模型专属规则】\n{self.custom_prompt}"

        return base_prompt

    def _generate_motion_plan_prompt(self) -> str:
        """生成动作规划器的提示词"""
        if not self.available_parameters:
            return "模型参数尚未加载，请稍后再试。"

        # 构建参数能力描述，让 LLM 了解模型能做什么动作
        param_capabilities = []
        for pid, info in self.available_parameters.items():
            name = info.get('name', pid)
            param_capabilities.append(f"  - {name} ({pid})")

        capabilities_text = "\n".join(param_capabilities)

        base_prompt = f"""你是一个 Live2D 动作规划器。你需要为语音播报阶段规划整体的动作序列。

当前模型支持的动作能力：
{capabilities_text}

你的任务是根据语音内容、总帧数和模型的动作能力，规划每一帧应该执行的动作。

返回 JSON 格式：
{{
  "frames": [
    {{
      "frameIndex": 0,
      "action": "微笑并轻轻侧头看向右边"
    }},
    {{
      "frameIndex": 1,
      "action": "挥手同时身体前倾眼睛眨动"
    }},
    {{
      "frameIndex": 2,
      "action": "比心并歪头卖萌脸颊泛红"
    }}
  ]
}}

要求：
1. action 描述要充分利用模型的动作能力，包含多个维度的动作组合（10-20个字）：
   - 根据上述参数列表，自由组合各种动作（角度、眼睛、眉毛、嘴巴、脸颊、身体等）
   - 不要局限于固定的动作模式，要根据模型实际支持的参数来设计动作
   - 每一帧都要有明显的变化，充分展现模型的表现力
2. 动作描述要具体且可执行，例如：
   - "微笑并轻轻点头眼睛半闭" - 明确指出微笑、点头、眼睛状态
   - "害羞地低头身体右倾脸颊泛红" - 明确指出害羞表情、头部角度、身体倾斜、脸颊效果
   - "挥手同时侧头微笑眉毛上扬" - 明确指出手部动作、头部角度、表情、眉毛状态
3. 动作要有变化和节奏感，避免单调重复
4. 优先使用模型特色动作（如果语音内容适合）
5. 动作之间要有连贯性和过渡
6. 只返回 JSON，不要额外解释

注意：充分利用模型的所有参数能力，不要只使用基础的几个参数。每一帧都应该是独特且富有表现力的。
"""

        # 如果有模型专属 prompt，附加模型特色动作提示
        if self.custom_prompt:
            base_prompt += f"\n\n【模型专属动作提示】\n可以使用的特色动作包括：吃糖、歌、挥手、猫手、游戏、祈祷、比心、内裤、鞭子、碗、猫等。\n根据语音内容选择合适的动作，并结合头部、身体、表情等参数变化。"

        return base_prompt

    def _generate_tts_motion_prompt(self, frame_duration_ms: int) -> str:
        if not self.available_parameters:
            return "模型参数尚未加载，请稍后再试。"

        param_descriptions = self._build_parameter_descriptions(exclude_mouth=True)
        eye_rule = (
            "眼睛开闭类参数必须只输出最大值或最小值。"
            if self.eye_open_binary
            else "眼睛开闭类参数可以输出区间内连续值。"
        )
        base_prompt = f"""你是一个 Live2D 连续动作控制器。
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

        # 如果有模型专属 prompt，附加到末尾
        if self.custom_prompt:
            base_prompt += f"\n\n【模型专属规则】\n{self.custom_prompt}"

        return base_prompt

    async def _call_llm(self, request_body: dict, log_prefix: str = "🎭 [表情生成]") -> dict:
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
                print(f"{log_prefix} 完成 ⏱️ {elapsed:.0f}ms")
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

    async def generate_motion_plan(
        self,
        speech_text: str,
        total_frames: int,
        context: str = "",
    ) -> list:
        """生成整体动作规划序列"""
        if not self.available_parameters:
            raise ValueError("模型参数尚未加载")

        user_message = (
            f"语音内容：{speech_text}\n"
            f"总帧数：{total_frames}\n"
            f"请为这段语音规划 {total_frames} 帧的动作序列。"
        )
        if context:
            user_message = f"场景背景：{context}\n\n{user_message}"

        request_body = {
            "model": self.config.model,
            "messages": [
                {
                    "role": "system",
                    "content": self._generate_motion_plan_prompt(),
                },
                {"role": "user", "content": user_message},
            ],
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens * 2,  # 规划需要更多 token
        }

        print(f"📋 [动作规划] 调用 API ({self.config.model}) 规划 {total_frames} 帧...")
        result = await self._call_llm(request_body, log_prefix="📋 [动作规划]")
        frames = result.get("frames", [])
        print(f"📋 [动作规划] 共规划 {len(frames)} 帧")
        return frames

    async def generate_tts_motion_frame_with_plan(
        self,
        frame_index: int,
        total_frames: int,
        frame_plan: dict,
        context: str = "",
        frame_duration_ms: int = 1000,
    ) -> dict:
        """根据动作规划生成具体的参数值（复用单个表情生成逻辑）"""
        if not self.available_parameters:
            raise ValueError("模型参数尚未加载")

        action = frame_plan.get("action", "自然动作")

        # 直接使用动作描述作为输入，复用单个表情生成的系统提示词
        user_message = action
        if context:
            user_message = f"场景背景：{context}\n\n当前输入：{action}"

        request_body = {
            "model": self.config.model,
            "messages": [
                {
                    "role": "system",
                    "content": self._generate_system_prompt(),  # 复用单个表情的系统提示词
                },
                {"role": "user", "content": user_message},
            ],
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
        }

        print(
            f"🎬 [TTS连续动作] 调用 API ({self.config.model}) "
            f"frame={frame_index + 1}/{total_frames} action={action}"
        )
        result = await self._call_llm(request_body)
        # 根据配置决定是否过滤嘴部参数
        result["parameters"] = self._clamp_parameters(
            result.get("parameters", {}),
            exclude_mouth=self.tts_motion_keep_lip_sync,
        )
        result["duration"] = frame_duration_ms

        # 输出生成的参数内容
        params = result.get("parameters", {})
        if params:
            print(f"   📊 生成参数: {params}")
        else:
            print(f"   ⚠️ 未生成任何参数")

        return result

    async def generate_tts_motion_frame(
        self,
        speech_text: str,
        frame_index: int,
        total_frames: int,
        context: str = "",
        frame_duration_ms: int = 1000,
    ) -> dict:
        """旧版本的帧生成方法（保留兼容性）"""
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
