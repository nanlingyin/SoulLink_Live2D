"""
Generator base interface.
"""

from abc import ABC, abstractmethod
from typing import Dict


class BaseGenerator(ABC):
    """Base class for all generators."""

    @abstractmethod
    async def generate(self, input_text: str, context: str = "") -> dict:
        """Generate a result payload."""
        raise NotImplementedError

    async def generate_tts_motion_frame(
        self,
        speech_text: str,
        frame_index: int,
        total_frames: int,
        context: str = "",
        frame_duration_ms: int = 1000,
    ) -> dict:
        """
        Generate one TTS motion frame.
        Default behavior falls back to `generate` for compatibility.
        """
        prompt = (
            "角色正在进行语音播报。\n"
            f"播报内容: {speech_text}\n"
            f"当前帧: {frame_index + 1}/{total_frames}\n"
            "请生成这一秒的自然动作参数。"
        )
        result = await self.generate(prompt, context)
        if isinstance(result, dict) and "duration" not in result:
            result["duration"] = frame_duration_ms
        return result

    def update_parameters(self, parameters: Dict[str, dict]) -> None:
        """Optional hook for available parameter metadata."""
        return None
