"""
配置数据类定义
"""

from dataclasses import dataclass, field
from typing import List


@dataclass
class LLMConfig:
    """LLM API 配置"""
    mode: str = "api"  # "local" 或 "api"
    provider: str = "openai"
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    max_tokens: int = 500
    # 本地模型配置
    local_base_model_path: str = ""
    local_lora_model_path: str = ""
    local_device: str = "auto"
    local_temperature: float = 0.1
    local_max_new_tokens: int = 512


@dataclass
class ServerConfig:
    """服务器配置"""
    host: str = "0.0.0.0"
    port: int = 3000
    model_dirs: List[str] = field(default_factory=lambda: ["./l2d"])


@dataclass
class AnimationConfig:
    """动画配置"""
    default_duration: int = 1000
    easing: str = "easeInOutCubic"
    auto_reset_delay: int = 1500


@dataclass
class ModelConfig:
    """模型配置"""
    directory: str = "./l2d"
    default_scale: float = 0.8


@dataclass
class UIConfig:
    """界面配置"""
    show_control_panel: bool = True
    show_physics_params: bool = False
    default_background: int = 0
