"""
本地模型表情生成器
使用本地 Qwen + LoRA 模型生成表情参数
"""

import re
import json
import time
from pathlib import Path
from typing import Dict, Tuple

from ..config import LLMConfig
from .base import BaseGenerator

# 本地模型支持（延迟导入，避免未安装时报错）
try:
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import PeftModel
    LOCAL_MODEL_AVAILABLE = True
except ImportError:
    LOCAL_MODEL_AVAILABLE = False


class LocalExpressionGenerator(BaseGenerator):
    """使用本地 Qwen + LoRA 模型生成表情参数"""

    def __init__(self, config: LLMConfig):
        self.config = config
        self.available_parameters: Dict[str, dict] = {}
        self.model = None
        self.tokenizer = None
        self._initialized = False

    def _lazy_init(self) -> None:
        """延迟初始化（首次调用时才加载模型）"""
        if self._initialized:
            return

        if not LOCAL_MODEL_AVAILABLE:
            raise RuntimeError("本地模型依赖未安装，请运行: pip install torch transformers peft")

        base_path = Path(self.config.local_base_model_path).resolve()
        lora_path = Path(self.config.local_lora_model_path).resolve()

        print(f"🔄 加载本地模型...")
        print(f"   基础模型: {base_path}")
        print(f"   LoRA 权重: {lora_path}")

        if not base_path.exists():
            raise FileNotFoundError(f"基础模型不存在: {base_path}")
        if not lora_path.exists():
            raise FileNotFoundError(f"LoRA 模型不存在: {lora_path}")

        # 加载 tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(
            str(base_path),
            trust_remote_code=True
        )

        # 加载基础模型
        base_model = AutoModelForCausalLM.from_pretrained(
            str(base_path),
            trust_remote_code=True,
            torch_dtype=torch.float16,
            device_map=self.config.local_device
        )

        # 加载 LoRA 权重
        self.model = PeftModel.from_pretrained(
            base_model,
            str(lora_path),
            torch_dtype=torch.float16
        )

        self.model.eval()
        self._initialized = True
        print(f"✅ 本地模型加载完成")

    def update_parameters(self, parameters: Dict[str, dict]) -> None:
        """更新可用参数列表"""
        self.available_parameters = parameters
        print(f"🎭 参数已更新: {len(parameters)} 个参数")

    def _build_prompt(self, emotion: str, intensity: float = 0.8) -> str:
        """构建推理提示"""
        param_desc = ", ".join([
            f"{pid}[{info.get('min', -30)},{info.get('max', 30)}]"
            for pid, info in list(self.available_parameters.items())[:8]
        ])
        if len(self.available_parameters) > 8:
            param_desc += f" ...共{len(self.available_parameters)}个参数"

        system_prompt = f"""你是 Live2D 参数映射专家。根据情感生成参数JSON。
可用参数: {param_desc}
只返回JSON格式。"""

        user_input = json.dumps({
            "emotion": emotion,
            "intensity": intensity,
            "params": list(self.available_parameters.keys())
        }, ensure_ascii=False)

        return f"""<|im_start|>system
{system_prompt}<|im_end|>
<|im_start|>user
{user_input}<|im_end|>
<|im_start|>assistant
"""

    def _extract_emotion(self, text: str) -> Tuple[str, float]:
        """从文本中提取情感和强度"""
        # 简单的情感映射
        emotion_keywords = {
            "开心": ("happy", 0.8),
            "高兴": ("happy", 0.7),
            "快乐": ("happy", 0.8),
            "哈哈": ("happy", 0.9),
            "悲伤": ("sad", 0.7),
            "难过": ("sad", 0.6),
            "伤心": ("sad", 0.8),
            "哭": ("sad", 0.9),
            "生气": ("angry", 0.8),
            "愤怒": ("angry", 0.9),
            "烦": ("annoyed", 0.6),
            "惊讶": ("surprised", 0.8),
            "吃惊": ("surprised", 0.7),
            "害羞": ("shy", 0.7),
            "不好意思": ("shy", 0.5),
            "脸红": ("shy", 0.8),
            "思考": ("thinking", 0.6),
            "嗯": ("thinking", 0.5),
            "困": ("sleepy", 0.7),
            "累": ("sleepy", 0.6),
            "兴奋": ("excited", 0.8),
            "担心": ("worried", 0.6),
            "紧张": ("worried", 0.7),
            "困惑": ("confused", 0.6),
            "疑惑": ("confused", 0.5),
        }

        text_lower = text.lower()
        for keyword, (emotion, intensity) in emotion_keywords.items():
            if keyword in text_lower:
                return emotion, intensity

        # 默认返回中性/平静
        return "neutral", 0.5

    async def generate(self, input_text: str, context: str = "") -> dict:
        """生成表情参数"""
        self._lazy_init()

        if not self.available_parameters:
            raise ValueError("模型参数尚未加载")

        # 从输入文本提取情感
        emotion, intensity = self._extract_emotion(input_text)
        print(f"🎭 [本地模型] 检测情感: {emotion} (强度: {intensity})")

        # 构建提示
        prompt = self._build_prompt(emotion, intensity)

        # Tokenize
        inputs = self.tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=2048
        ).to(self.model.device)

        # 生成
        start_time = time.time()

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=self.config.local_max_new_tokens,
                temperature=self.config.local_temperature,
                top_p=0.9,
                do_sample=True,
                pad_token_id=self.tokenizer.pad_token_id,
                eos_token_id=self.tokenizer.eos_token_id
            )

        inference_time = (time.time() - start_time) * 1000
        print(f"🎭 [本地模型] 推理完成 ⏱️ {inference_time:.0f}ms")

        # 解码
        generated_text = self.tokenizer.decode(
            outputs[0][inputs['input_ids'].shape[1]:],
            skip_special_tokens=True
        )

        # 解析 JSON
        try:
            result = json.loads(generated_text)
        except json.JSONDecodeError:
            # 尝试提取 JSON
            json_match = re.search(r'\{[\s\S]*\}', generated_text)
            if json_match:
                try:
                    result = json.loads(json_match.group(0))
                except:
                    result = {"expression": emotion, "parameters": {}, "duration": 600}
            else:
                result = {"expression": emotion, "parameters": {}, "duration": 600}

        # 验证参数范围
        validated_params = {}
        for param_id, value in result.get('parameters', {}).items():
            if param_id in self.available_parameters:
                param_info = self.available_parameters[param_id]
                try:
                    num_value = float(value)
                    num_value = max(param_info.get('min', -30), min(param_info.get('max', 30), num_value))
                    validated_params[param_id] = round(num_value, 3)
                except (ValueError, TypeError):
                    continue

        result['parameters'] = validated_params
        result['expression'] = result.get('expression', emotion)
        result['duration'] = result.get('duration', 600)

        return result

    def is_available(self) -> bool:
        """检查本地模型是否可用"""
        if not LOCAL_MODEL_AVAILABLE:
            return False
        base_path = Path(self.config.local_base_model_path).resolve()
        lora_path = Path(self.config.local_lora_model_path).resolve()
        return base_path.exists() and lora_path.exists()
