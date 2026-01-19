# Project Context

## Purpose

**SoulLink_Live2D** 是一个创新的 LLM 驱动 Live2D 表情控制系统。

### 项目目标
- 通过大语言模型（LLM）理解对话内容和情感，实时控制 Live2D 虚拟形象的表情/动作变化
- 让数字人更加生动自然，不再依赖预定义的静态表情
- 提供简单易用的 Web 界面和 API，方便集成到各种应用场景

### 核心功能
- **AI 驱动表情** - 通过 LLM 理解文本情感，自动生成表情参数
- **实时对话** - 支持与 AI 实时对话，表情同步反应
- **多模型支持** - 自动扫描并加载多个 Live2D 模型
- **平滑过渡** - 表情参数平滑动画过渡，效果自然
- **可视化控制** - 提供参数滑块，手动微调表情
- **WebSocket 通信** - 前后端实时双向通信

## Tech Stack

### 后端 (Python)
- **Python 3.8+** - 主要后端语言
- **aiohttp** - 异步 HTTP/WebSocket 服务器框架
- **aiohttp-cors** - CORS 跨域支持
- **watchdog** - 文件系统监听（模型热加载）
- **PyYAML** - YAML 配置文件解析
- **torch / transformers / peft** - 本地模型推理支持（可选）

### 前端 (JavaScript)
- **PixiJS** - 2D 渲染引擎
- **pixi-live2d-display** - Live2D Cubism 4 模型加载与渲染
- **原生 JavaScript** - 无框架依赖，轻量化设计
- **WebSocket API** - 与后端实时通信

### Live2D
- **Live2D Cubism 4** - 仅支持 `.model3.json` 格式模型
- 支持物理模拟（头发、裙子等）
- 支持表情文件 (`.exp3.json`) 和动作文件 (`.motion3.json`)

### LLM 集成
- **OpenAI API** (GPT-4o, GPT-4o-mini)
- **DeepSeek API** (DeepSeek-V3)
- **SiliconFlow API** (国内代理)
- **Ollama** (本地部署)
- **自定义 API** (兼容 OpenAI 格式)
- **本地模型** (Qwen2.5 + LoRA 微调)

## Project Conventions

### Code Style

#### Python
- 使用 `snake_case` 命名变量和函数
- 使用 `PascalCase` 命名类
- 使用 `dataclass` 定义配置和数据结构
- 异步函数使用 `async/await`
- 文件顶部包含模块文档字符串

#### JavaScript
- 使用 `camelCase` 命名变量和函数
- 使用 `PascalCase` 命名类和构造函数
- 使用 `UPPER_SNAKE_CASE` 命名常量
- 优先使用 `const`，必要时使用 `let`
- 避免使用 `var`

#### 配置文件
- 使用 `camelCase` 命名 YAML 键（如 `apiKey`, `baseUrl`）
- 统一在 `config.yaml` 中管理所有配置

### Architecture Patterns

#### 整体架构
```
┌─────────────────┐     WebSocket     ┌─────────────────┐
│   前端 (浏览器)   │ ◄──────────────► │   后端 (Python)  │
│   PixiJS + L2D  │                   │   aiohttp       │
└─────────────────┘                   └────────┬────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │   LLM API       │
                                      │ (GPT/DeepSeek)  │
                                      └─────────────────┘
```

#### 核心模块
- **ConfigManager** - 统一配置管理，从 `config.yaml` 读取
- **ModelScanner** - Live2D 模型扫描与发现
- **ModelWatcher** - 文件监听，支持热加载
- **ExpressionGenerator** - LLM 表情参数生成（API 模式）
- **LocalExpressionGenerator** - 本地模型表情生成
- **ChatGenerator** - 对话回复生成
- **SoulLinkServer** - WebSocket 服务器主类

#### 设计原则
- **单一配置源** - 所有配置集中在 `config.yaml`
- **异步优先** - 使用 `asyncio` 处理 I/O 密集操作
- **并发调用** - 聊天回复和表情生成并行执行
- **平滑过渡** - 使用缓动函数实现自然的表情动画

### Testing Strategy

- 目前项目处于早期阶段，测试覆盖较少
- 可通过浏览器控制台手动测试：
  ```javascript
  SoulLink.chat("你好")  // 测试聊天
  reactTo("开心")        // 测试表情
  ```
- 建议后续添加：
  - 单元测试（pytest）
  - WebSocket 通信测试
  - LLM 响应解析测试

### Git Workflow

- 主分支: `main`
- 提交信息使用中文或英文均可
- 建议的提交格式：
  ```
  <类型>: <简短描述>

  [可选的详细说明]
  ```
- 类型包括：`feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Domain Context

### Live2D 核心概念
- **模型文件** (`.model3.json`) - 模型入口文件，定义纹理、动作、表情等
- **参数** (Parameters) - 控制模型各部位的数值，如眼睛睁开程度、嘴巴张合等
- **动作** (Motion) - 预定义的动画序列
- **表情** (Expression) - 预设的参数组合
- **物理模拟** (Physics) - 头发、裙子等的自然晃动

### 表情控制原理
1. 前端加载模型后，读取所有可用参数
2. 用户输入文本，通过 WebSocket 发送到后端
3. 后端构建 Prompt，调用 LLM 生成参数 JSON
4. 前端接收参数，使用缓动函数平滑过渡

### 常用表情参数
| 参数 | 作用 | 范围 |
|------|------|------|
| ParamEyeLOpen / ParamEyeROpen | 眼睛睁开 | 0-1 |
| ParamMouthOpenY | 嘴巴张开 | 0-1 |
| ParamMouthForm | 嘴型（笑/不笑） | -1 到 1 |
| ParamBrowLY / ParamBrowRY | 眉毛高低 | -1 到 1 |
| ParamCheek | 脸红程度 | 0-1 |
| ParamAngleX/Y/Z | 头部角度 | -30 到 30 |

## Important Constraints

### 技术限制
- 仅支持 **Cubism 4** 模型（`.model3.json`），不支持 Cubism 2/3
- 需要现代浏览器支持 WebGL 和 WebSocket
- LLM API 调用有延迟，通常 500-2000ms

### 安全约束
- API Key 不应暴露给前端
- `config.yaml` 中的敏感信息不应提交到公开仓库

### 性能考虑
- 避免频繁调用 LLM API（有速率限制和成本）
- 本地模型需要 GPU 支持才能流畅运行
- 大型 Live2D 模型可能影响渲染性能

## External Dependencies

### LLM API 服务
| 服务商 | Base URL | 模型示例 |
|--------|----------|----------|
| OpenAI | https://api.openai.com/v1 | gpt-4o-mini, gpt-4o |
| DeepSeek | https://api.deepseek.com/v1 | deepseek-chat |
| SiliconFlow | https://api.siliconflow.cn/v1 | deepseek-ai/DeepSeek-V3 |
| Ollama (本地) | http://localhost:11434/v1 | llama2, mistral |

### 前端 CDN 依赖
- PixiJS (pixi.js)
- pixi-live2d-display
- Live2D Cubism Core

### 项目目录结构
```
SoulLink_Live2D/
├── server.py               # 启动入口脚本
├── config.yaml             # 统一配置文件
├── requirements.txt        # Python 依赖
│
├── src/                    # 后端 Python 模块
│   ├── __init__.py
│   ├── config/             # 配置管理
│   │   ├── models.py       # 配置数据类
│   │   └── manager.py      # ConfigManager
│   ├── models/             # Live2D 模型管理
│   │   ├── types.py        # Live2DModel 数据类
│   │   ├── scanner.py      # ModelScanner
│   │   └── watcher.py      # ModelWatcher
│   ├── generators/         # LLM 生成器
│   │   ├── base.py         # 生成器基类
│   │   ├── expression.py   # ExpressionGenerator (API)
│   │   ├── local_expression.py  # LocalExpressionGenerator
│   │   └── chat.py         # ChatGenerator
│   ├── server/             # Web 服务器
│   │   ├── app.py          # SoulLinkServer 主类
│   │   ├── routes.py       # 路由定义
│   │   └── handlers.py     # WebSocket 消息处理
│   └── utils/              # 工具函数
│       └── helpers.py
│
├── frontend/               # 前端代码
│   ├── index.html          # 主页面
│   ├── css/
│   │   └── styles.css      # 样式文件
│   └── js/
│       ├── components/     # UI 组件
│       │   └── chat-panel.js
│       ├── services/       # 服务层
│       │   ├── config.js
│       │   ├── websocket.js
│       │   └── expression.js
│       ├── live2d/         # Live2D 相关
│       │   ├── loader.js
│       │   ├── controller.js
│       │   └── animation.js
│       └── utils/          # 工具函数
│
├── static/                 # 静态资源
│   └── background/         # 背景图片
│
├── l2d/                    # Live2D 模型目录
├── models/                 # 其他可供测试的模型
├── docs/                   # 文档
└── openspec/               # 项目规范
```

> **注意**: 旧的 `js/`、`core/`、`index.html` 等文件保留用于兼容，新代码请使用 `src/` 和 `frontend/` 目录。
