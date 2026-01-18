"""
Live2D Agent - 外部控制模块
通过 WebSocket 与前端 SoulLink 通信
"""

import asyncio
import json
import logging
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum

import websockets
from websockets.server import WebSocketServerProtocol
import httpx

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('L2DAgent')


# ============================================
# 数据结构
# ============================================

class MessageType(str, Enum):
    """WebSocket 消息类型"""
    # 客户端 -> 服务器
    REGISTER = "register"           # 前端注册
    USER_INPUT = "user_input"       # 用户输入（文字）
    VOICE_INPUT = "voice_input"     # 语音输入
    GET_STATUS = "get_status"       # 获取状态
    
    # 服务器 -> 客户端
    EXPRESSION = "expression"       # 表情指令
    PARAMETER = "parameter"         # 单个参数控制
    PARAMETERS = "parameters"       # 批量参数控制
    MOTION = "motion"               # 动作指令
    SPEAK = "speak"                 # 语音合成指令
    STATUS = "status"               # 状态信息
    ERROR = "error"                 # 错误信息
    HEARTBEAT = "heartbeat"


@dataclass
class ExpressionCommand:
    """表情指令"""
    parameters: Dict[str, float]
    duration: int = 800
    easing: str = "easeInOutCubic"
    auto_reset: bool = False
    reset_delay: int = 1500


@dataclass
class AgentResponse:
    """Agent 响应"""
    text: str                                    # 回复文字
    expression: Optional[ExpressionCommand] = None  # 表情
    emotion: str = ""                            # 情感标签
    should_speak: bool = True                    # 是否需要语音合成


# ============================================
# 配置管理
# ============================================

class Config:
    """配置管理器"""
    
    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = Path(config_path)
        self.data = self._load_config()
    
    def _load_config(self) -> dict:
        if self.config_path.exists():
            with open(self.config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        return {}
    
    def get(self, key: str, default=None):
        """获取配置，支持点号分隔的路径"""
        keys = key.split('.')
        value = self.data
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
            else:
                return default
            if value is None:
                return default
        return value


# ============================================
# LLM 表情生成器
# ============================================

class ExpressionGenerator:
    """LLM 表情生成器"""
    
    # 通用表情参数映射
    EXPRESSION_PARAM_MAPPING = {
        "eyeOpenL": ["ParamEyeLOpen", "ParamEyeL_Open", "EyeLOpen"],
        "eyeOpenR": ["ParamEyeROpen", "ParamEyeR_Open", "EyeROpen"],
        "eyeSmileL": ["ParamEyeLSmile", "ParamEyeL_Smile", "EyeLSmile"],
        "eyeSmileR": ["ParamEyeRSmile", "ParamEyeR_Smile", "EyeRSmile"],
        "eyeBallX": ["ParamEyeBallX", "ParamEyeBall_X", "EyeBallX"],
        "eyeBallY": ["ParamEyeBallY", "ParamEyeBall_Y", "EyeBallY"],
        "browLY": ["ParamBrowLY", "ParamBrowL_Y", "BrowLY"],
        "browRY": ["ParamBrowRY", "ParamBrowR_Y", "BrowRY"],
        "browLAngle": ["ParamBrowLAngle", "ParamBrowL_Angle", "BrowLAngle"],
        "browRAngle": ["ParamBrowRAngle", "ParamBrowR_Angle", "BrowRAngle"],
        "mouthOpen": ["ParamMouthOpenY", "ParamMouth_OpenY", "MouthOpenY"],
        "mouthForm": ["ParamMouthForm", "ParamMouth_Form", "MouthForm"],
        "cheek": ["ParamCheek", "Cheek"],
        "angleX": ["ParamAngleX", "ParamAngleX2", "AngleX"],
        "angleY": ["ParamAngleY", "ParamAngleY2", "AngleY"],
        "angleZ": ["ParamAngleZ", "AngleZ"],
        "bodyAngleX": ["ParamBodyAngleX", "BodyAngleX"],
        "bodyAngleY": ["ParamBodyAngleY", "BodyAngleY"],
        "bodyAngleZ": ["ParamBodyAngleZ", "BodyAngleZ"],
    }
    
    # 本地预设表情
    LOCAL_EXPRESSIONS = {
        "happy": {
            "eyeOpenL": 0.9, "eyeOpenR": 0.9,
            "eyeSmileL": 0.7, "eyeSmileR": 0.7,
            "mouthForm": 0.8,
            "browLY": 0.3, "browRY": 0.3
        },
        "sad": {
            "eyeOpenL": 0.6, "eyeOpenR": 0.6,
            "eyeSmileL": 0, "eyeSmileR": 0,
            "mouthForm": -0.5,
            "browLY": -0.5, "browRY": -0.5
        },
        "angry": {
            "eyeOpenL": 0.8, "eyeOpenR": 0.8,
            "mouthForm": -0.3,
            "browLY": -0.7, "browRY": -0.7,
            "browLAngle": -0.5, "browRAngle": -0.5
        },
        "surprised": {
            "eyeOpenL": 1, "eyeOpenR": 1,
            "mouthOpen": 0.6,
            "browLY": 0.8, "browRY": 0.8
        },
        "shy": {
            "eyeOpenL": 0.7, "eyeOpenR": 0.7,
            "eyeSmileL": 0.4, "eyeSmileR": 0.4,
            "mouthForm": 0.3,
            "cheek": 0.8,
            "angleZ": -5
        },
        "thinking": {
            "eyeOpenL": 0.8, "eyeOpenR": 0.8,
            "eyeBallX": 0.5, "eyeBallY": 0.3,
            "browLY": 0.2, "browRY": -0.1,
            "angleZ": 5
        },
        "neutral": {
            "eyeOpenL": 1, "eyeOpenR": 1,
            "eyeSmileL": 0, "eyeSmileR": 0,
            "mouthForm": 0, "mouthOpen": 0,
            "browLY": 0, "browRY": 0
        }
    }
    
    def __init__(self, config: Config):
        self.config = config
        self.available_parameters: Dict[str, dict] = {}
        self.http_client = httpx.AsyncClient(timeout=30.0)
    
    def update_available_parameters(self, parameters: Dict[str, dict]):
        """更新可用参数（从前端接收）"""
        self.available_parameters = parameters
        logger.info(f"已更新模型参数: {len(parameters)} 个")
    
    def _find_param_id(self, generic_name: str) -> Optional[str]:
        """查找实际参数ID"""
        possible_ids = self.EXPRESSION_PARAM_MAPPING.get(generic_name, [generic_name])
        
        for param_id in possible_ids:
            if param_id in self.available_parameters:
                return param_id
        
        if generic_name in self.available_parameters:
            return generic_name
        
        return None
    
    def _build_expression(self, generic_params: Dict[str, float]) -> Dict[str, float]:
        """将通用参数映射到实际模型参数"""
        result = {}
        for generic_name, value in generic_params.items():
            param_id = self._find_param_id(generic_name)
            if param_id:
                result[param_id] = value
        return result
    
    def get_local_expression(self, expression_name: str) -> Optional[ExpressionCommand]:
        """获取本地预设表情"""
        if expression_name not in self.LOCAL_EXPRESSIONS:
            return None
        
        generic_params = self.LOCAL_EXPRESSIONS[expression_name]
        params = self._build_expression(generic_params)
        
        if not params:
            logger.warning(f"表情 {expression_name} 无法映射到当前模型参数")
            return None
        
        return ExpressionCommand(
            parameters=params,
            duration=self.config.get('animation.defaultDuration', 800)
        )
    
    def _generate_system_prompt(self) -> str:
        """生成系统提示词"""
        if not self.available_parameters:
            return "模型参数尚未加载，请稍后再试。"
        
        param_descriptions = "\n".join([
            f"  - {pid}: {info.get('description', pid)}, 范围[{info.get('min', -30)}, {info.get('max', 30)}]"
            for pid, info in self.available_parameters.items()
        ])
        
        return f"""你是一个 Live2D 虚拟形象的 AI 助手。你需要：
1. 用友好、活泼的语气回复用户
2. 同时生成匹配的表情参数

当前模型可用参数：
{param_descriptions}

返回严格的 JSON 格式：
{{
  "reply": "你的回复文字",
  "emotion": "情感标签(happy/sad/angry/surprised/shy/thinking/neutral)",
  "expression": {{
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
    
    async def generate_from_llm(self, user_input: str, context: str = "") -> AgentResponse:
        """调用 LLM 生成回复和表情"""
        api_key = self.config.get('llm.apiKey', '')
        base_url = self.config.get('llm.baseUrl', 'https://api.openai.com/v1')
        model = self.config.get('llm.model', 'gpt-4o-mini')
        temperature = self.config.get('llm.temperature', 0.7)
        max_tokens = self.config.get('llm.maxTokens', 500)
        
        if not api_key or api_key == 'your-api-key-here':
            raise ValueError("请在 config.yaml 中设置 API Key")
        
        if not self.available_parameters:
            raise ValueError("模型参数尚未加载")
        
        user_message = f"场景背景：{context}\n\n用户说：{user_input}" if context else f"用户说：{user_input}"
        
        request_body = {
            "model": model,
            "messages": [
                {"role": "system", "content": self._generate_system_prompt()},
                {"role": "user", "content": user_message}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        logger.info(f"调用 LLM API ({model})...")
        
        response = await self.http_client.post(
            f"{base_url}/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            json=request_body
        )
        
        if response.status_code != 200:
            raise Exception(f"API 请求失败: {response.status_code} - {response.text}")
        
        data = response.json()
        content = data['choices'][0]['message']['content']
        
        logger.info(f"LLM 返回: {content}")
        
        # 解析 JSON
        import re
        json_match = re.search(r'\{[\s\S]*\}', content)
        if not json_match:
            raise ValueError("无法解析 LLM 返回的 JSON")
        
        result = json.loads(json_match.group())
        
        # 验证参数
        validated_params = {}
        for param_id, value in result.get('expression', {}).items():
            if param_id in self.available_parameters:
                info = self.available_parameters[param_id]
                validated_params[param_id] = max(
                    info.get('min', -30),
                    min(info.get('max', 30), value)
                )
        
        expression_cmd = ExpressionCommand(
            parameters=validated_params,
            duration=result.get('duration', self.config.get('animation.defaultDuration', 800))
        ) if validated_params else None
        
        return AgentResponse(
            text=result.get('reply', ''),
            expression=expression_cmd,
            emotion=result.get('emotion', 'neutral'),
            should_speak=True
        )
    
    async def close(self):
        await self.http_client.aclose()


# ============================================
# WebSocket 服务器
# ============================================

class L2DAgentServer:
    """L2DAgent WebSocket 服务器"""
    
    def __init__(self, config: Config):
        self.config = config
        self.expression_generator = ExpressionGenerator(config)
        self.clients: Dict[str, WebSocketServerProtocol] = {}
        self.client_info: Dict[str, dict] = {}
    
    async def send_to_client(self, client_id: str, message_type: MessageType, data: dict):
        """发送消息给指定客户端"""
        if client_id not in self.clients:
            logger.warning(f"客户端 {client_id} 不存在")
            return
        
        ws = self.clients[client_id]
        message = {
            "type": message_type.value,
            "data": data,
            "timestamp": asyncio.get_event_loop().time()
        }
        
        try:
            await ws.send(json.dumps(message, ensure_ascii=False))
            logger.debug(f"发送消息给 {client_id}: {message_type.value}")
        except Exception as e:
            logger.error(f"发送消息失败: {e}")
    
    async def broadcast(self, message_type: MessageType, data: dict):
        """广播消息给所有客户端"""
        for client_id in list(self.clients.keys()):
            await self.send_to_client(client_id, message_type, data)
    
    async def send_expression(self, client_id: str, expression: ExpressionCommand):
        """发送表情指令"""
        await self.send_to_client(client_id, MessageType.EXPRESSION, {
            "parameters": expression.parameters,
            "duration": expression.duration,
            "easing": expression.easing,
            "autoReset": expression.auto_reset,
            "resetDelay": expression.reset_delay
        })
    
    async def send_parameter(self, client_id: str, param_id: str, value: float, duration: int = 300):
        """发送单个参数控制"""
        await self.send_to_client(client_id, MessageType.PARAMETER, {
            "id": param_id,
            "value": value,
            "duration": duration
        })
    
    async def send_speak(self, client_id: str, text: str, emotion: str = ""):
        """发送语音合成指令"""
        await self.send_to_client(client_id, MessageType.SPEAK, {
            "text": text,
            "emotion": emotion
        })
    
    async def handle_register(self, ws: WebSocketServerProtocol, client_id: str, data: dict):
        """处理客户端注册"""
        self.clients[client_id] = ws
        self.client_info[client_id] = {
            "model_name": data.get("modelName", "unknown"),
            "parameters": data.get("parameters", {})
        }
        
        # 更新表情生成器的可用参数
        if data.get("parameters"):
            self.expression_generator.update_available_parameters(data["parameters"])
        
        logger.info(f"客户端注册: {client_id}, 模型: {data.get('modelName')}")
        
        await self.send_to_client(client_id, MessageType.STATUS, {
            "status": "connected",
            "message": "已连接到 L2DAgent 服务器"
        })
    
    async def handle_user_input(self, client_id: str, data: dict):
        """处理用户输入"""
        text = data.get("text", "")
        context = data.get("context", "")
        use_local = data.get("useLocal", False)
        local_expression = data.get("localExpression", "")
        
        if not text:
            await self.send_to_client(client_id, MessageType.ERROR, {
                "message": "输入文字不能为空"
            })
            return
        
        try:
            if use_local and local_expression:
                # 使用本地预设表情
                expression = self.expression_generator.get_local_expression(local_expression)
                response = AgentResponse(
                    text="",
                    expression=expression,
                    emotion=local_expression
                )
            else:
                # 调用 LLM 生成
                response = await self.expression_generator.generate_from_llm(text, context)
            
            # 发送表情指令
            if response.expression:
                await self.send_expression(client_id, response.expression)
            
            # 发送回复文字（如果需要语音合成）
            if response.text and response.should_speak:
                await self.send_speak(client_id, response.text, response.emotion)
            
            # 发送状态
            await self.send_to_client(client_id, MessageType.STATUS, {
                "status": "success",
                "reply": response.text,
                "emotion": response.emotion
            })
            
        except Exception as e:
            logger.error(f"处理用户输入失败: {e}")
            await self.send_to_client(client_id, MessageType.ERROR, {
                "message": str(e)
            })
    
    async def handle_message(self, ws: WebSocketServerProtocol, message: str):
        """处理收到的消息"""
        try:
            data = json.loads(message)
            msg_type = data.get("type", "")
            msg_data = data.get("data", {})
            client_id = data.get("clientId", str(id(ws)))
            
            logger.debug(f"收到消息: {msg_type} from {client_id}")
            
            if msg_type == MessageType.REGISTER.value:
                await self.handle_register(ws, client_id, msg_data)
            
            elif msg_type == MessageType.USER_INPUT.value:
                await self.handle_user_input(client_id, msg_data)
            
            elif msg_type == MessageType.GET_STATUS.value:
                await self.send_to_client(client_id, MessageType.STATUS, {
                    "status": "ok",
                    "clients": len(self.clients),
                    "hasParameters": bool(self.expression_generator.available_parameters)
                })
            
            else:
                logger.warning(f"未知消息类型: {msg_type}")
                
        except json.JSONDecodeError as e:
            logger.error(f"JSON 解析失败: {e}")
        except Exception as e:
            logger.error(f"处理消息失败: {e}")
    
    async def handle_client(self, ws: WebSocketServerProtocol, path: str):
        """处理客户端连接"""
        client_id = str(id(ws))
        logger.info(f"新客户端连接: {client_id}")
        
        try:
            async for message in ws:
                await self.handle_message(ws, message)
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"客户端断开连接: {client_id}")
        finally:
            if client_id in self.clients:
                del self.clients[client_id]
            if client_id in self.client_info:
                del self.client_info[client_id]
    
    async def start(self, host: str = "0.0.0.0", port: int = 8765):
        """启动服务器"""
        logger.info(f"L2DAgent WebSocket 服务器启动在 ws://{host}:{port}")
        
        async with websockets.serve(self.handle_client, host, port):
            await asyncio.Future()  # 永久运行
    
    async def close(self):
        await self.expression_generator.close()


# ============================================
# 命令行接口
# ============================================

class L2DAgentCLI:
    """命令行交互接口"""
    
    def __init__(self, server: L2DAgentServer):
        self.server = server
        self.running = True
    
    async def run(self):
        """运行命令行接口"""
        print("\n" + "=" * 50)
        print("L2DAgent 命令行接口")
        print("=" * 50)
        print("命令:")
        print("  say <文字>     - 发送文字并生成表情")
        print("  expr <表情名>  - 应用本地表情 (happy/sad/angry/surprised/shy/thinking)")
        print("  param <ID> <值> - 设置单个参数")
        print("  reset          - 重置表情")
        print("  status         - 查看状态")
        print("  quit           - 退出")
        print("=" * 50 + "\n")
        
        while self.running:
            try:
                cmd = await asyncio.get_event_loop().run_in_executor(
                    None, input, "L2DAgent> "
                )
                await self.process_command(cmd.strip())
            except EOFError:
                break
            except KeyboardInterrupt:
                break
    
    async def process_command(self, cmd: str):
        """处理命令"""
        if not cmd:
            return
        
        parts = cmd.split(maxsplit=1)
        action = parts[0].lower()
        args = parts[1] if len(parts) > 1 else ""
        
        if action == "quit" or action == "exit":
            self.running = False
            print("再见！")
            return
        
        # 获取第一个连接的客户端
        if not self.server.clients:
            print("错误: 没有连接的客户端")
            return
        
        client_id = list(self.server.clients.keys())[0]
        
        if action == "say":
            if not args:
                print("用法: say <文字>")
                return
            print(f"发送: {args}")
            await self.server.handle_user_input(client_id, {"text": args})
        
        elif action == "expr":
            if not args:
                print(f"可用表情: {', '.join(self.server.expression_generator.LOCAL_EXPRESSIONS.keys())}")
                return
            expression = self.server.expression_generator.get_local_expression(args)
            if expression:
                await self.server.send_expression(client_id, expression)
                print(f"已应用表情: {args}")
            else:
                print(f"未知表情: {args}")
        
        elif action == "param":
            param_parts = args.split()
            if len(param_parts) < 2:
                print("用法: param <参数ID> <值>")
                return
            param_id = param_parts[0]
            try:
                value = float(param_parts[1])
                await self.server.send_parameter(client_id, param_id, value)
                print(f"已设置 {param_id} = {value}")
            except ValueError:
                print("错误: 值必须是数字")
        
        elif action == "reset":
            expression = self.server.expression_generator.get_local_expression("neutral")
            if expression:
                await self.server.send_expression(client_id, expression)
                print("已重置表情")
        
        elif action == "status":
            print(f"连接的客户端: {len(self.server.clients)}")
            for cid, info in self.server.client_info.items():
                print(f"  - {cid}: {info.get('model_name', 'unknown')}")
            print(f"可用参数数量: {len(self.server.expression_generator.available_parameters)}")
        
        else:
            print(f"未知命令: {action}")


# ============================================
# 主入口
# ============================================

async def main():
    """主函数"""
    config = Config("config.yaml")
    
    # WebSocket 配置
    ws_host = config.get('websocket.host', '0.0.0.0')
    ws_port = config.get('websocket.port', 8765)
    
    # 创建服务器
    server = L2DAgentServer(config)
    
    # 创建 CLI
    cli = L2DAgentCLI(server)
    
    print(r"""
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║     ██╗     ██████╗ ██████╗  █████╗  ██████╗ ███████╗    ║
    ║     ██║     ╚════██╗██╔══██╗██╔══██╗██╔════╝ ██╔════╝    ║
    ║     ██║      █████╔╝██║  ██║███████║██║  ███╗█████╗      ║
    ║     ██║     ██╔═══╝ ██║  ██║██╔══██║██║   ██║██╔══╝      ║
    ║     ███████╗███████╗██████╔╝██║  ██║╚██████╔╝███████╗    ║
    ║     ╚══════╝╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝    ║
    ║                                                           ║
    ║           AI-Powered Live2D Expression Control            ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    """)
    
    print(f"WebSocket 服务器: ws://{ws_host}:{ws_port}")
    print("等待前端连接...\n")
    
    # 同时运行服务器和 CLI
    try:
        await asyncio.gather(
            server.start(ws_host, ws_port),
            cli.run()
        )
    except KeyboardInterrupt:
        print("\n正在关闭...")
    finally:
        await server.close()


if __name__ == "__main__":
    asyncio.run(main())
