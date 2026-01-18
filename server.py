"""
SoulLink_Live2D - AI 驱动的 Live2D 表情控制系统
Python 后端服务器

功能：
1. 自动扫描 l2d 目录，发现所有 Live2D 模型
2. 监听文件夹变化，实时通知前端
3. WebSocket 服务，与前端双向通信
4. LLM 调用，生成表情参数（支持本地模型和远程API）
5. 统一配置管理 - 所有配置从 config.yaml 读取
"""

import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Dict, List, Set, Optional, Any
from dataclasses import dataclass, asdict, field
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import aiohttp
from aiohttp import web
import aiohttp_cors
import yaml

# 本地模型支持（延迟导入，避免未安装时报错）
try:
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import PeftModel
    LOCAL_MODEL_AVAILABLE = True
except ImportError:
    LOCAL_MODEL_AVAILABLE = False
    print("⚠️ 本地模型依赖未安装 (torch/transformers/peft)，将使用 API 模式")

# ============================================
# 配置管理 - 所有配置从 config.yaml 统一读取
# ============================================

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
        self._raw_config = {}  # 保存原始配置用于前端
        self.load()
    
    def load(self):
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

# ============================================
# 模型扫描器
# ============================================

@dataclass
class Live2DModel:
    name: str
    path: str
    directory: str
    model_file: str
    cdi_file: Optional[str] = None
    physics_file: Optional[str] = None
    pose_file: Optional[str] = None
    motions: List[str] = None
    
    def __post_init__(self):
        if self.motions is None:
            self.motions = []

class ModelScanner:
    def __init__(self, base_dirs: List[str]):
        self.base_dirs = [Path(d).resolve() for d in base_dirs]
        self.models: Dict[str, Live2DModel] = {}
    
    def scan_all(self) -> Dict[str, Live2DModel]:
        """扫描所有目录，发现 Live2D 模型"""
        self.models.clear()
        
        for base_dir in self.base_dirs:
            if not base_dir.exists():
                print(f"⚠️ 目录不存在: {base_dir}")
                continue
            
            self._scan_directory(base_dir, base_dir)
        
        print(f"🔍 扫描完成，发现 {len(self.models)} 个模型")
        for name, model in self.models.items():
            print(f"   - {name}: {model.path}")
        
        return self.models
    
    def _scan_directory(self, directory: Path, base_dir: Path):
        """递归扫描目录"""
        try:
            for item in directory.iterdir():
                if item.is_file() and item.suffix == '.json' and item.name.endswith('.model3.json'):
                    model = self._parse_model(item, base_dir)
                    if model:
                        self.models[model.name] = model
                elif item.is_dir() and not item.name.startswith('.'):
                    self._scan_directory(item, base_dir)
        except PermissionError:
            pass
    
    def _parse_model(self, model_file: Path, base_dir: Path) -> Optional[Live2DModel]:
        """解析模型文件"""
        try:
            model_dir = model_file.parent
            model_name = model_file.name.replace('.model3.json', '')
            
            # 查找相关文件
            cdi_file = None
            physics_file = None
            pose_file = None
            motions = []
            
            for f in model_dir.iterdir():
                if f.suffix == '.json':
                    if f.name.endswith('.cdi3.json'):
                        cdi_file = f.name
                    elif f.name.endswith('.physics3.json'):
                        physics_file = f.name
                    elif f.name.endswith('.pose3.json'):
                        pose_file = f.name
            
            # 查找动作文件
            motions_dir = model_dir / 'motions'
            if motions_dir.exists():
                motions = [f.name for f in motions_dir.iterdir() 
                          if f.suffix == '.json' and f.name.endswith('.motion3.json')]
            
            # 计算相对路径 - 使用 base_dir 的目录名作为前缀
            # 例如: base_dir = F:\ai_controlled_l2d\l2d
            # model_file = F:\ai_controlled_l2d\l2d\amane.model3.json
            # 结果: l2d/amane.model3.json
            dir_name = base_dir.name  # "l2d"
            relative_model_path = model_file.relative_to(base_dir)
            relative_dir_path = model_dir.relative_to(base_dir)
            
            # 构建完整的相对路径（包含目录名）
            full_path = f"{dir_name}/{relative_model_path}".replace('\\', '/')
            full_dir = f"{dir_name}/{relative_dir_path}".replace('\\', '/') if str(relative_dir_path) != '.' else dir_name
            
            return Live2DModel(
                name=model_name,
                path=full_path,
                directory=full_dir,
                model_file=model_file.name,
                cdi_file=cdi_file,
                physics_file=physics_file,
                pose_file=pose_file,
                motions=motions
            )
        except Exception as e:
            print(f"⚠️ 解析模型失败 {model_file}: {e}")
            return None

# ============================================
# 文件监听器
# ============================================

class ModelWatcher(FileSystemEventHandler):
    def __init__(self, scanner: ModelScanner, on_change_callback):
        self.scanner = scanner
        self.on_change = on_change_callback
        self._debounce_task = None
    
    def on_any_event(self, event):
        if event.is_directory:
            return
        
        # 只关注 model3.json 文件的变化
        if event.src_path.endswith('.model3.json'):
            # 防抖：避免短时间内多次触发
            if self._debounce_task:
                self._debounce_task.cancel()
            
            loop = asyncio.get_event_loop()
            self._debounce_task = loop.call_later(1.0, self._handle_change)
    
    def _handle_change(self):
        print("📁 检测到模型文件变化，重新扫描...")
        self.scanner.scan_all()
        if self.on_change:
            asyncio.create_task(self.on_change())

# ============================================
# 本地模型表情生成器
# ============================================

class LocalExpressionGenerator:
    """使用本地 Qwen + LoRA 模型生成表情参数"""

    def __init__(self, config: LLMConfig):
        self.config = config
        self.available_parameters: Dict[str, dict] = {}
        self.model = None
        self.tokenizer = None
        self._initialized = False

    def _lazy_init(self):
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

    def update_parameters(self, parameters: Dict[str, dict]):
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

    def _extract_emotion(self, text: str) -> tuple:
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


# ============================================
# LLM 表情生成器 (API 模式)
# ============================================

class ExpressionGenerator:
    def __init__(self, config: LLMConfig):
        self.config = config
        self.available_parameters: Dict[str, dict] = {}
    
    def update_parameters(self, parameters: Dict[str, dict]):
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
                        info = self.available_parameters
                        validated_params[param_id] = max(
                            info.get("min", -30),
                            min(info.get("max", 30), value)
                        )

                result["parameters"] = validated_params
                return result


# ============================================
# LLM 聊天生成器
# ============================================

class ChatGenerator:
    """聊天对话生成器"""
    def __init__(self, config: LLMConfig):
        self.config = config
        self.system_prompt = """你是一个可爱、活泼的虚拟助手。请用简洁、友好的方式回复用户。
回复要求：
1. 语言自然、有个性
2. 适当使用语气词和表情
3. 回复不要太长，控制在50字以内
4. 根据对话情绪给出相应的回复风格"""
    
    async def generate(self, message: str, history: list = None) -> str:
        """生成聊天回复"""
        if not self.config.api_key or self.config.api_key == "your-api-key-here":
            raise ValueError("请先在 config.yaml 中设置 API Key")

        messages = [{"role": "system", "content": self.system_prompt}]

        # 添加历史对话
        if history:
            for h in history[-6:]:  # 只保留最近6条
                messages.append({
                    "role": h.get("role", "user"),
                    "content": h.get("content", "")
                })

        # 添加当前消息（如果不在历史中）
        if not history or history[-1].get("content") != message:
            messages.append({"role": "user", "content": message})

        request_body = {
            "model": self.config.model,
            "messages": messages,
            "temperature": self.config.temperature,
            "max_tokens": 200
        }

        print(f"💬 [聊天回复] 调用 API ({self.config.model})...")
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
                    raise Exception(f"聊天 API 请求失败: {response.status} - {error}")

                data = await response.json()
                reply = data["choices"][0]["message"]["content"]

                elapsed_time = (time.time() - start_time) * 1000
                print(f"💬 [聊天回复] 完成 ⏱️ {elapsed_time:.0f}ms | 回复: {reply[:30]}...")

                return reply

# ============================================
# WebSocket 服务器
# ============================================

class SoulLinkServer:
    def __init__(self, config: ConfigManager):
        self.config = config
        self.scanner = ModelScanner(config.server.model_dirs)

        # 根据配置选择表情生成器
        if config.llm.mode == "local":
            local_gen = LocalExpressionGenerator(config.llm)
            if local_gen.is_available():
                self.expression_generator = local_gen
                print("🏠 使用本地模型生成表情")
            else:
                print("⚠️ 本地模型不可用，回退到 API 模式")
                self.expression_generator = ExpressionGenerator(config.llm)
        else:
            self.expression_generator = ExpressionGenerator(config.llm)
            print("🌐 使用远程 API 生成表情")

        self.chat_generator = ChatGenerator(config.llm)  # 聊天生成器
        self.clients: Set[web.WebSocketResponse] = set()
        self.current_model: Optional[str] = None
        self.app = web.Application()
        self._setup_routes()
    
    def _setup_routes(self):
        """设置路由"""
        # 根路由 - 提供 index.html
        self.app.router.add_get('/', self.serve_index)
        self.app.router.add_get('/ws', self.websocket_handler)
        self.app.router.add_get('/api/models', self.get_models)
        self.app.router.add_get('/api/config', self.get_config)
        
        # 为每个模型目录添加静态文件服务
        for model_dir in self.config.server.model_dirs:
            dir_path = Path(model_dir).resolve()
            dir_name = dir_path.name  # 获取目录名，如 "l2d", "hiyori"
            if dir_path.exists():
                self.app.router.add_static(f'/{dir_name}', str(dir_path))
                print(f"📂 静态文件路由: /{dir_name} -> {dir_path}")
        
        # JS 文件
        self.app.router.add_static('/js', './js')
        
        # 背景图片目录
        background_path = Path('./background').resolve()
        if background_path.exists():
            self.app.router.add_static('/background', str(background_path))
            print(f"🖼️ 背景图片路由: /background -> {background_path}")
        
        # 配置 CORS
        cors = aiohttp_cors.setup(self.app, defaults={
            "*": aiohttp_cors.ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*"
            )
        })
        
        for route in list(self.app.router.routes()):
            cors.add(route)
    
    async def serve_index(self, request):
        """提供 index.html 首页"""
        return web.FileResponse('./index.html')
    
    async def get_models(self, request):
        """HTTP API: 获取模型列表"""
        models = [asdict(m) for m in self.scanner.models.values()]
        return web.json_response({"models": models})
    
    async def get_config(self, request):
        """HTTP API: 获取前端配置"""
        return web.json_response(self.config.get_frontend_config())
    
    async def websocket_handler(self, request):
        """WebSocket 连接处理"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        
        self.clients.add(ws)
        client_ip = request.remote
        print(f"🔗 WebSocket 客户端连接: {client_ip} (当前 {len(self.clients)} 个)")
        
        # 发送模型列表
        await self._send_model_list(ws)
        
        try:
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    await self._handle_message(ws, msg.data)
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    print(f"❌ WebSocket 错误: {ws.exception()}")
        finally:
            self.clients.discard(ws)
            print(f"🔌 WebSocket 客户端断开: {client_ip} (剩余 {len(self.clients)} 个)")
        
        return ws
    
    async def _send_model_list(self, ws: web.WebSocketResponse):
        """发送模型列表给客户端"""
        models = [asdict(m) for m in self.scanner.models.values()]
        await ws.send_json({
            "type": "model_list",
            "models": models,
            "current": self.current_model
        })
    
    async def _handle_message(self, ws: web.WebSocketResponse, data: str):
        """处理客户端消息"""
        try:
            msg = json.loads(data)
            msg_type = msg.get("type")
            
            if msg_type == "load_model":
                # 加载指定模型
                model_name = msg.get("model")
                if model_name in self.scanner.models:
                    self.current_model = model_name
                    model = self.scanner.models[model_name]
                    await self._broadcast({
                        "type": "load_model",
                        "model": asdict(model)
                    })
                    print(f"📦 加载模型: {model_name}")
                else:
                    await ws.send_json({
                        "type": "error",
                        "message": f"模型不存在: {model_name}"
                    })
            
            elif msg_type == "update_parameters":
                # 更新可用参数（前端加载模型后发送）
                parameters = msg.get("parameters", {})
                self.expression_generator.update_parameters(parameters)
                await ws.send_json({
                    "type": "parameters_updated",
                    "count": len(parameters)
                })
            
            elif msg_type == "chat":
                # 聊天消息，触发 LLM 生成表情
                text = msg.get("message", "")
                context = msg.get("context", "")
                auto_reset = msg.get("autoReset", True)
                
                try:
                    result = await self.expression_generator.generate(text, context)
                    
                    # 广播表情指令给所有客户端
                    await self._broadcast({
                        "type": "expression",
                        "expression": result.get("expression", ""),
                        "parameters": result.get("parameters", {}),
                        "duration": result.get("duration", 800),
                        "autoReset": auto_reset
                    })
                    
                    print(f"🎭 生成表情: {result.get('expression')}")
                    
                except Exception as e:
                    await ws.send_json({
                        "type": "error",
                        "message": str(e)
                    })
            
            elif msg_type == "chat_with_reply":
                # 完整聊天：并发生成对话回复和表情
                text = msg.get("message", "")
                context = msg.get("context", "")
                history = msg.get("history", [])
                auto_reset = msg.get("autoReset", True)

                try:
                    total_start_time = time.time()
                    print(f"\n{'='*50}")
                    print(f"📨 收到聊天请求: {text[:50]}...")

                    # 并发调用聊天和表情生成
                    chat_task = self.chat_generator.generate(text, history)
                    expression_task = self.expression_generator.generate(text, context)

                    # 等待两个任务完成
                    results = await asyncio.gather(
                        chat_task,
                        expression_task,
                        return_exceptions=True
                    )

                    chat_reply = results[0] if not isinstance(results[0], Exception) else f"聊天生成失败: {results[0]}"
                    expression_result = results[1] if not isinstance(results[1], Exception) else {}

                    total_elapsed = (time.time() - total_start_time) * 1000

                    # 构建响应
                    response = {
                        "type": "chat_response",
                        "reply": chat_reply,
                        "expression": expression_result.get("expression", "") if isinstance(expression_result, dict) else "",
                        "parameters": expression_result.get("parameters", {}) if isinstance(expression_result, dict) else {},
                        "duration": expression_result.get("duration", 800) if isinstance(expression_result, dict) else 800,
                        "autoReset": auto_reset
                    }

                    # 发送给请求的客户端
                    await ws.send_json(response)

                    # 打印统计信息
                    print(f"{'='*50}")
                    print(f"✅ 请求处理完成 | 总耗时: {total_elapsed:.0f}ms")
                    if isinstance(expression_result, dict):
                        print(f"   🎭 表情: {expression_result.get('expression', '未知')}")
                    print(f"{'='*50}\n")

                except Exception as e:
                    print(f"❌ 聊天处理错误: {e}")
                    await ws.send_json({
                        "type": "chat_error",
                        "error": str(e)
                    })
            
            elif msg_type == "expression":
                # 直接设置表情参数
                await self._broadcast({
                    "type": "expression",
                    "parameters": msg.get("parameters", {}),
                    "duration": msg.get("duration", 800),
                    "autoReset": msg.get("autoReset", False)
                })
            
            elif msg_type == "reset":
                # 重置表情
                await self._broadcast({
                    "type": "reset",
                    "duration": msg.get("duration", 800)
                })
            
            elif msg_type == "ping":
                await ws.send_json({"type": "pong"})
                
        except json.JSONDecodeError:
            await ws.send_json({
                "type": "error", 
                "message": "无效的 JSON 格式"
            })
        except Exception as e:
            print(f"❌ 处理消息错误: {e}")
            await ws.send_json({
                "type": "error",
                "message": str(e)
            })
    
    async def _broadcast(self, message: dict):
        """广播消息给所有客户端"""
        if not self.clients:
            return
        
        dead_clients = set()
        for ws in self.clients:
            try:
                await ws.send_json(message)
            except Exception:
                dead_clients.add(ws)
        
        self.clients -= dead_clients
    
    async def _on_model_change(self):
        """模型文件变化回调"""
        await self._broadcast({
            "type": "model_list",
            "models": [asdict(m) for m in self.scanner.models.values()],
            "current": self.current_model
        })
    
    def start_watcher(self):
        """启动文件监听"""
        event_handler = ModelWatcher(self.scanner, self._on_model_change)
        observer = Observer()
        
        for base_dir in self.scanner.base_dirs:
            if base_dir.exists():
                observer.schedule(event_handler, str(base_dir), recursive=True)
                print(f"👁️ 监听目录: {base_dir}")
        
        observer.start()
        return observer
    
    async def run(self):
        """启动服务器"""
        # 初始扫描
        self.scanner.scan_all()
        
        # 启动文件监听
        observer = self.start_watcher()
        
        # 启动 Web 服务器
        runner = web.AppRunner(self.app)
        await runner.setup()
        
        site = web.TCPSite(
            runner, 
            self.config.server.host, 
            self.config.server.port
        )
        
        await site.start()

        # 确定 LLM 模式显示信息
        if self.config.llm.mode == "local":
            llm_info = "本地模型 (Qwen2.5 + LoRA)"
        else:
            llm_info = f"API ({self.config.llm.model})"

        print(f"""
╔════════════════════════════════════════════════════════════╗
║           SoulLink_Live2D Server 已启动                    ║
╠════════════════════════════════════════════════════════════╣
║  🌐 Web 界面:  http://localhost:{self.config.server.port:<24}║
║  🔌 WebSocket: ws://localhost:{self.config.server.port}/ws{' ' * 21}║
║  📁 模型目录:  {str(self.config.server.model_dirs[0]):<31}║
║  🎭 已发现模型: {len(self.scanner.models):<30}║
║  🤖 表情生成:  {llm_info:<31}║
╚════════════════════════════════════════════════════════════╝

💡 提示:
   - 将 Live2D 模型放入模型目录，服务器会自动发现
   - 在浏览器控制台使用 SoulLink.chat("你好") 测试
   - 按 Ctrl+C 停止服务器
   - 切换模式: 修改 config.yaml 中 llm.mode 为 "local" 或 "api"
        """)
        
        try:
            while True:
                await asyncio.sleep(3600)
        except asyncio.CancelledError:
            pass
        finally:
            observer.stop()
            observer.join()
            await runner.cleanup()

# ============================================
# 主入口
# ============================================

def main():
    print("🚀 SoulLink Server 启动中...")
    
    config = ConfigManager("config.yaml")
    server = SoulLinkServer(config)
    
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        print("\n👋 服务器已停止")

if __name__ == "__main__":
    main()
