"""
统一配置管理器
所有配置从 config.yaml 读取，用户无需修改代码
"""

import os
import yaml
from typing import Dict, Any

from .models import (
    LLMConfig, APIConfig, ServerConfig, AnimationConfig, ModelConfig, UIConfig,
    ASRLocalConfig, ASRConfig, TTSConfig, VoiceConfig,
    ImageGenConfig, ExperimentalConfig
)


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
        self.voice = VoiceConfig()
        self.experimental = ExperimentalConfig()
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

                # 解析表情生成专用配置（从 api 下或 llm 下读取，继承 api 默认值）
                expression_data = api_data.get('expression', {}) or llm_data.get('expression', {})
                expression_config = None
                if expression_data:
                    expression_config = APIConfig(
                        provider=expression_data.get('provider', api_data.get('provider', 'openai')),
                        api_key=expression_data.get('apiKey', api_data.get('apiKey', '')),
                        base_url=expression_data.get('baseUrl', api_data.get('baseUrl', 'https://api.openai.com/v1')),
                        model=expression_data.get('model', api_data.get('model', 'gpt-4o-mini')),
                        temperature=expression_data.get('temperature', api_data.get('temperature', 0.7)),
                        max_tokens=expression_data.get('maxTokens', api_data.get('maxTokens', 500))
                    )

                # 解析聊天对话专用配置（从 api 下或 llm 下读取，继承 api 默认值）
                chat_data = api_data.get('chat', {}) or llm_data.get('chat', {})
                chat_config = None
                if chat_data:
                    chat_config = APIConfig(
                        provider=chat_data.get('provider', api_data.get('provider', 'openai')),
                        api_key=chat_data.get('apiKey', api_data.get('apiKey', '')),
                        base_url=chat_data.get('baseUrl', api_data.get('baseUrl', 'https://api.openai.com/v1')),
                        model=chat_data.get('model', api_data.get('model', 'gpt-4o-mini')),
                        temperature=chat_data.get('temperature', api_data.get('temperature', 0.7)),
                        max_tokens=chat_data.get('maxTokens', api_data.get('maxTokens', 500))
                    )

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
                    local_max_new_tokens=local_data.get('maxNewTokens', 512),
                    # 独立配置
                    expression=expression_config,
                    chat=chat_config
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
                    auto_reset_delay=anim_data.get('autoResetDelay', 1500),
                    eye_open_binary=anim_data.get('eyeOpenBinary', False),
                    joint_motion_boost=anim_data.get('jointMotionBoost', 1.25),
                    tts_motion_keep_lip_sync=anim_data.get('ttsMotionKeepLipSync', True)
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
                    default_background=ui_data.get('defaultBackground', 0),
                    language=ui_data.get('language', 'auto')
                )

                # 加载语音配置
                voice_data = self._raw_config.get('voice', {})
                asr_data = voice_data.get('asr', {})
                local_asr_data = asr_data.get('local', {})
                tts_data = voice_data.get('tts', {})

                asr_local_config = ASRLocalConfig(
                    model_path=local_asr_data.get('modelPath', './models/whisper'),
                    model_size=local_asr_data.get('modelSize', 'base')
                ) if local_asr_data else None

                asr_config = ASRConfig(
                    enabled=asr_data.get('enabled', True),
                    mode=asr_data.get('mode', 'browser'),
                    language=asr_data.get('language', 'zh-CN'),
                    auto_send=asr_data.get('autoSend', True),
                    local=asr_local_config
                )

                tts_config = TTSConfig(
                    enabled=tts_data.get('enabled', False),
                    base_url=tts_data.get('baseUrl', 'https://api.openai.com/v1'),
                    api_key=tts_data.get('apiKey', ''),
                    model=tts_data.get('model', 'tts-1'),
                    voice=tts_data.get('voice', 'alloy'),
                    speed=tts_data.get('speed', 1.0)
                )

                self.voice = VoiceConfig(
                    asr=asr_config,
                    tts=tts_config
                )

                # 加载实验性功能配置
                exp_data = self._raw_config.get('experimental', {})
                ig_data = exp_data.get('imageGen', {})
                image_gen_config = None
                if ig_data:
                    image_gen_config = ImageGenConfig(
                        provider=ig_data.get('provider', 'openai'),
                        api_key=ig_data.get('apiKey', ''),
                        base_url=ig_data.get('baseUrl', ''),
                        model=ig_data.get('model', ''),
                        temperature=ig_data.get('temperature', 0)
                    )
                self.experimental = ExperimentalConfig(
                    image_gen=image_gen_config
                )

                print(f"✅ 配置已加载: {self.config_path}")
                print(f"   🤖 LLM 模式: {self.llm.mode}")
                if self.llm.mode == "local":
                    print(f"   📦 本地模型: {self.llm.local_base_model_path}")
                    print(f"   🔧 LoRA: {self.llm.local_lora_model_path}")
                else:
                    # 显示表情生成配置
                    if self.llm.expression:
                        expr_model = self.llm.expression.model
                        expr_url = self.llm.expression.base_url
                        print(f"   🎭 表情API: {expr_model} @ {expr_url}")
                    else:
                        print(f"   🎭 表情API: {self.llm.model} @ {self.llm.base_url} (默认)")
                    # 显示聊天配置
                    if self.llm.chat:
                        chat_model = self.llm.chat.model
                        chat_url = self.llm.chat.base_url
                        print(f"   💬 聊天API: {chat_model} @ {chat_url}")
                    else:
                        print(f"   💬 聊天API: {self.llm.model} @ {self.llm.base_url} (默认)")
                print(f"   🎬 动画: duration={self.animation.default_duration}ms, easing={self.animation.easing}")
                print(
                    f"      eyeOpenBinary={self.animation.eye_open_binary}, "
                    f"jointMotionBoost={self.animation.joint_motion_boost}, "
                    f"ttsMotionKeepLipSync={self.animation.tts_motion_keep_lip_sync}"
                )
                # 显示语音配置
                if self.voice.asr:
                    asr_status = "启用" if self.voice.asr.enabled else "禁用"
                    asr_mode = self.voice.asr.mode
                    print(f"   🎤 ASR: {asr_status} ({asr_mode}模式)")
                if self.voice.tts:
                    tts_status = "启用" if self.voice.tts.enabled else "禁用"
                    if self.voice.tts.enabled:
                        print(f"   🔊 TTS: {tts_status} (voice={self.voice.tts.voice})")
                    else:
                        print(f"   🔊 TTS: {tts_status}")

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
                "autoResetDelay": self.animation.auto_reset_delay,
                "eyeOpenBinary": self.animation.eye_open_binary,
                "jointMotionBoost": self.animation.joint_motion_boost,
                "ttsMotionKeepLipSync": self.animation.tts_motion_keep_lip_sync
            },
            "model": {
                "directory": self.model.directory,
                "defaultScale": self.model.default_scale
            },
            "ui": {
                "showControlPanel": self.ui.show_control_panel,
                "showPhysicsParams": self.ui.show_physics_params,
                "defaultBackground": self.ui.default_background,
                "language": self.ui.language
            },
            "voice": {
                "asr": {
                    "enabled": self.voice.asr.enabled if self.voice.asr else True,
                    "mode": self.voice.asr.mode if self.voice.asr else "browser",
                    "language": self.voice.asr.language if self.voice.asr else "zh-CN",
                    "autoSend": self.voice.asr.auto_send if self.voice.asr else True
                },
                "tts": {
                    "enabled": self.voice.tts.enabled if self.voice.tts else False,
                    "model": self.voice.tts.model if self.voice.tts else "tts-1",
                    "voice": self.voice.tts.voice if self.voice.tts else "alloy",
                    "speed": self.voice.tts.speed if self.voice.tts else 1.0
                    # 不暴露 apiKey
                }
            },
            "experimental": {
                "imageGen": {
                    "provider": self.experimental.image_gen.provider if self.experimental.image_gen else "",
                    "model": self.experimental.image_gen.model if self.experimental.image_gen else "",
                    "configured": bool(self.experimental.image_gen and self.experimental.image_gen.api_key)
                    # 不暴露 apiKey 和 baseUrl
                }
            }
        }
