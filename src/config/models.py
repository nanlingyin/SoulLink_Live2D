"""
Config dataclass models.
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class APIConfig:
    """Single OpenAI-compatible endpoint config."""

    provider: str = "openai"
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    max_tokens: int = 500


@dataclass
class LLMConfig:
    """LLM config."""

    mode: str = "api"  # "local" or "api"
    provider: str = "openai"
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    max_tokens: int = 500

    # Local model mode
    local_base_model_path: str = ""
    local_lora_model_path: str = ""
    local_device: str = "auto"
    local_temperature: float = 0.1
    local_max_new_tokens: int = 512

    # Dedicated endpoint overrides
    expression: Optional[APIConfig] = None
    chat: Optional[APIConfig] = None


@dataclass
class ServerConfig:
    """Server config."""

    host: str = "0.0.0.0"
    port: int = 3000
    model_dirs: List[str] = field(default_factory=lambda: ["./l2d"])


@dataclass
class AnimationConfig:
    """Animation config."""

    default_duration: int = 1000
    easing: str = "easeInOutCubic"
    auto_reset_delay: int = 1500
    # When enabled, eye-open parameters are snapped to min/max only.
    eye_open_binary: bool = False
    # Amplifies head/body/hand/etc joint-like params in generated motion.
    joint_motion_boost: float = 1.25


@dataclass
class ModelConfig:
    """Model config."""

    directory: str = "./l2d"
    default_scale: float = 0.8


@dataclass
class UIConfig:
    """UI config."""

    show_control_panel: bool = True
    show_physics_params: bool = False
    default_background: int = 0
    language: str = "auto"  # auto/zh/en


@dataclass
class ASRLocalConfig:
    """Local Whisper ASR config."""

    model_path: str = "./models/whisper"
    model_size: str = "base"  # tiny/base/small/medium/large


@dataclass
class ASRConfig:
    """ASR config."""

    enabled: bool = True
    mode: str = "browser"  # "browser" or "local"
    language: str = "zh-CN"
    auto_send: bool = True
    local: Optional[ASRLocalConfig] = None


@dataclass
class TTSConfig:
    """TTS config."""

    enabled: bool = False
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    model: str = "tts-1"
    voice: str = "alloy"  # alloy/echo/fable/onyx/nova/shimmer
    speed: float = 1.0


@dataclass
class VoiceConfig:
    """Voice config bundle."""

    asr: Optional[ASRConfig] = None
    tts: Optional[TTSConfig] = None
