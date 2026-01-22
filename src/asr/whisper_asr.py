"""
Whisper ASR 本地语音识别
"""

import os
import tempfile
from pathlib import Path
from typing import Optional

from ..config import ASRConfig


class WhisperASR:
    """Whisper 本地语音识别器"""

    def __init__(self, config: ASRConfig):
        self.config = config
        self.model = None
        self._available = False
        self._load_model()

    def _load_model(self) -> None:
        """加载 Whisper 模型"""
        if not self.config.local:
            print("⚠️ ASR 本地配置未设置")
            return

        try:
            import whisper

            model_path = self.config.local.model_path
            model_size = self.config.local.model_size

            print(f"🎤 正在加载 Whisper {model_size} 模型...")

            # 检查模型路径是否存在
            if os.path.exists(model_path):
                self.model = whisper.load_model(model_size, download_root=model_path)
            else:
                # 使用默认缓存位置
                self.model = whisper.load_model(model_size)

            self._available = True
            print(f"✅ Whisper 模型加载成功")

        except ImportError:
            print("⚠️ 未安装 openai-whisper，请运行: pip install openai-whisper")
            self._available = False
        except Exception as e:
            print(f"⚠️ Whisper 模型加载失败: {e}")
            self._available = False

    def is_available(self) -> bool:
        """检查 ASR 是否可用"""
        return self._available

    async def transcribe(self, audio_data: bytes, language: Optional[str] = None) -> str:
        """
        将音频数据转换为文字

        Args:
            audio_data: 音频文件的二进制数据
            language: 语言代码 (如 "zh", "en")，None 则自动检测

        Returns:
            识别出的文字
        """
        if not self._available:
            raise RuntimeError("Whisper 模型未加载")

        # 将音频数据写入临时文件
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            tmp_file.write(audio_data)
            tmp_path = tmp_file.name

        try:
            # 转换语言代码格式 (zh-CN -> zh)
            lang = None
            if language:
                lang = language.split("-")[0]

            # 执行识别
            result = self.model.transcribe(
                tmp_path,
                language=lang,
                fp16=False  # 某些 CPU 不支持 fp16
            )

            text = result.get("text", "").strip()
            print(f"🎤 [ASR] 识别结果: {text[:50]}..." if len(text) > 50 else f"🎤 [ASR] 识别结果: {text}")

            return text

        finally:
            # 清理临时文件
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def transcribe_file(self, file_path: str, language: Optional[str] = None) -> str:
        """
        从文件识别语音（同步版本）

        Args:
            file_path: 音频文件路径
            language: 语言代码

        Returns:
            识别出的文字
        """
        if not self._available:
            raise RuntimeError("Whisper 模型未加载")

        lang = None
        if language:
            lang = language.split("-")[0]

        result = self.model.transcribe(
            file_path,
            language=lang,
            fp16=False
        )

        return result.get("text", "").strip()
