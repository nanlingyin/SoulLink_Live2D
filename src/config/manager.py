"""
统一配置管理器
所有配置从 config.yaml 读取，用户无需修改代码
"""

import os
import yaml
from typing import Dict, Any

from .models import LLMConfig, ServerConfig, AnimationConfig, ModelConfig, UIConfig


class ConfigManager:
    """
    统一配置管理器
    所有配置从 config.yaml 读取，用户无需修改代码
    """

    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = config_path
        self.llm = LLMConfig()
        self.server = ServerConfig()
        self.animation = AnimationConfig()
        self.model = ModelConfig()
        self.ui = UIConfig()
        self._raw_config: Dict[str, Any] = {}  # 保存原始配置用于前端
        self.load()

    def load(self) -> None:
        """从 config.yaml 加载所有配置"""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    self._raw_config = yaml.safe_load(f) or {}

                # 加载 LLM 配置
                llm_data = self._raw_config.get('llm', {})
                api_data = llm_data.get('api', {})
                local_data = llm_data.get('local', {})

                self.llm = LLMConfig(
                    mode=llm_data.get('mode', 'api'),
                    provider=api_data.get('provider', 'openai'),
                    api_key=api_data.get('apiKey', ''),
                    base_url=api_data.get('baseUrl', 'https://api.openai.com/v1'),
                    model=api_data.get('model', 'gpt-4o-mini'),
                    temperature=api_data.get('temperature', 0.7),
                    max_tokens=api_data.get('maxTokens', 500),
                    # 本地模型配置
                    local_base_model_path=local_data.get('baseModelPath', './ct2model/models/qwen2.5-1.5b-instruct'),
                    local_lora_model_path=local_data.get('loraModelPath', './ct2model/output/l2d-motion-lora/final'),
                    local_device=local_data.get('device', 'auto'),
                    local_temperature=local_data.get('temperature', 0.1),
                    local_max_new_tokens=local_data.get('maxNewTokens', 512)
                )

                # 加载服务器配置
                server_data = self._raw_config.get('server', {})
                model_dir = self._raw_config.get('model', {}).get('directory', './l2d')
                self.server = ServerConfig(
                    host=server_data.get('host', '0.0.0.0'),
                    port=server_data.get('port', 3000),
                    model_dirs=server_data.get('modelDirs', [model_dir])
                )

                # 加载动画配置
                anim_data = self._raw_config.get('animation', {})
                self.animation = AnimationConfig(
                    default_duration=anim_data.get('defaultDuration', 1000),
                    easing=anim_data.get('easing', 'easeInOutCubic'),
                    auto_reset_delay=anim_data.get('autoResetDelay', 1500)
                )

                # 加载模型配置
                model_data = self._raw_config.get('model', {})
                self.model = ModelConfig(
                    directory=model_data.get('directory', './l2d'),
                    default_scale=model_data.get('defaultScale', 0.8)
                )

                # 加载 UI 配置
                ui_data = self._raw_config.get('ui', {})
                self.ui = UIConfig(
                    show_control_panel=ui_data.get('showControlPanel', True),
                    show_physics_params=ui_data.get('showPhysicsParams', False),
                    default_background=ui_data.get('defaultBackground', 0)
                )

                print(f"✅ 配置已加载: {self.config_path}")
                print(f"   🤖 LLM 模式: {self.llm.mode}")
                if self.llm.mode == "local":
                    print(f"   📦 本地模型: {self.llm.local_base_model_path}")
                    print(f"   🔧 LoRA: {self.llm.local_lora_model_path}")
                else:
                    print(f"   🌐 API: {self.llm.model} @ {self.llm.base_url}")
                print(f"   🎬 动画: duration={self.animation.default_duration}ms, easing={self.animation.easing}")

            except Exception as e:
                print(f"⚠️ 加载配置失败: {e}，使用默认配置")
        else:
            print(f"⚠️ 配置文件不存在: {self.config_path}，使用默认配置")

    def get_frontend_config(self) -> dict:
        """
        获取前端需要的配置（不包含敏感信息如 API Key）
        前端通过 /api/config 获取这些配置
        """
        return {
            "server": {
                "host": self.server.host,
                "port": self.server.port,
                "modelDirs": self.server.model_dirs
            },
            "llm": {
                "mode": self.llm.mode,
                "provider": self.llm.provider if self.llm.mode == "api" else "local",
                "model": self.llm.model if self.llm.mode == "api" else "qwen2.5-1.5b-lora",
                # 不暴露 api_key 和 base_url
            },
            "animation": {
                "defaultDuration": self.animation.default_duration,
                "easing": self.animation.easing,
                "autoResetDelay": self.animation.auto_reset_delay
            },
            "model": {
                "directory": self.model.directory,
                "defaultScale": self.model.default_scale
            },
            "ui": {
                "showControlPanel": self.ui.show_control_panel,
                "showPhysicsParams": self.ui.show_physics_params,
                "defaultBackground": self.ui.default_background
            }
        }
