# Design: 项目结构重构

## Context

SoulLink_Live2D 项目目前处于快速迭代阶段，代码结构较为扁平。随着功能增加（本地模型支持、多 LLM 提供商、聊天功能等），单文件架构已难以维护。需要在保持向后兼容的同时，建立清晰的模块化结构。

**约束条件：**
- 必须保持 `python server.py` 启动方式不变
- 必须保持 `config.yaml` 配置文件位置和格式不变
- 前端静态文件服务路由需要更新
- 不引入新的构建工具或框架依赖

## Goals / Non-Goals

### Goals
- 建立清晰的模块化目录结构
- 每个模块职责单一，易于理解
- 方便后续添加单元测试
- 保持启动方式和配置兼容

### Non-Goals
- 不引入 Python 包管理工具（如 Poetry）
- 不引入前端构建工具（如 Webpack/Vite）
- 不改变核心业务逻辑
- 不改变 API 接口

## Decisions

### Decision 1: 后端目录结构

采用按功能划分的扁平模块结构：

```
src/
├── __init__.py
├── config/                 # 配置管理
│   ├── __init__.py
│   ├── manager.py          # ConfigManager 类
│   └── models.py           # 配置数据类 (LLMConfig, ServerConfig 等)
├── models/                 # Live2D 模型管理
│   ├── __init__.py
│   ├── scanner.py          # ModelScanner 类
│   ├── watcher.py          # ModelWatcher 类
│   └── types.py            # Live2DModel 数据类
├── generators/             # LLM 生成器
│   ├── __init__.py
│   ├── base.py             # 生成器基类/接口
│   ├── expression.py       # ExpressionGenerator (API)
│   ├── local_expression.py # LocalExpressionGenerator
│   └── chat.py             # ChatGenerator
├── server/                 # Web 服务器
│   ├── __init__.py
│   ├── app.py              # SoulLinkServer 主类
│   ├── routes.py           # 路由定义
│   └── handlers.py         # WebSocket 消息处理
└── utils/                  # 工具函数
    ├── __init__.py
    └── helpers.py          # 通用辅助函数
```

**理由**：
- 比嵌套层级更扁平，符合 Python 项目惯例
- 每个目录对应一个功能域，易于定位
- `__init__.py` 导出主要类，方便导入

### Decision 2: 前端目录结构

采用功能分组结构：

```
frontend/
├── index.html              # 主页面
├── css/                    # 样式文件
│   └── styles.css
├── js/
│   ├── app.js              # 应用入口
│   ├── components/         # UI 组件
│   │   ├── chat-panel.js   # 聊天面板
│   │   └── control-panel.js # 控制面板
│   ├── services/           # 服务层
│   │   ├── websocket.js    # WebSocket 客户端
│   │   ├── config.js       # 配置加载
│   │   └── expression.js   # 表情控制
│   ├── live2d/             # Live2D 相关
│   │   ├── loader.js       # 模型加载
│   │   ├── controller.js   # 模型控制
│   │   └── animation.js    # 动画过渡
│   └── utils/              # 工具函数
│       └── helpers.js
└── lib/                    # 第三方库（如需本地化）
```

**理由**：
- 保持原生 JavaScript，不引入构建工具
- `components/` 存放 UI 相关代码
- `services/` 存放与后端通信的逻辑
- `live2d/` 集中 Live2D 相关功能

### Decision 3: 静态资源目录

```
static/
├── background/             # 背景图片
├── fonts/                  # 字体文件（如需）
└── images/                 # 其他图片资源
```

**理由**：
- 统一管理静态资源
- 与代码目录分离
- 便于 CDN 部署

### Decision 4: 保持模型目录不变

```
l2d/                        # 默认 Live2D 模型目录
models/                     # 额外测试模型
```

**理由**：
- 用户已熟悉此结构
- `config.yaml` 中 `modelDirs` 配置指向这些目录
- 避免破坏现有用户工作流

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 导入路径变化导致运行错误 | 高 | 分步重构，每步验证 |
| 静态文件路径变化导致前端加载失败 | 高 | 更新 server 路由配置 |
| 用户自定义代码失效 | 中 | 文档说明迁移步骤 |
| 重构过程中引入 bug | 中 | 保持功能测试覆盖 |

## Migration Plan

### Phase 1: 后端重构（优先）
1. 创建 `src/` 目录结构
2. 逐个模块迁移代码（从无依赖模块开始）
3. 更新 `server.py` 为入口脚本，导入 `src.server`
4. 验证所有功能正常

### Phase 2: 前端重构
1. 创建 `frontend/` 目录结构
2. 迁移并重组 JavaScript 文件
3. 更新 `index.html` 脚本引用
4. 更新后端静态文件路由
5. 验证前端功能正常

### Phase 3: 资源整理
1. 创建 `static/` 目录
2. 迁移背景图片等资源
3. 更新相关引用路径

### Rollback
如遇严重问题，可通过 Git 回滚到重构前状态。

## Open Questions

1. 是否需要添加 `pyproject.toml` 或 `setup.py` 使项目可安装？
2. 前端是否需要考虑 ES Modules 支持？
3. 是否需要添加 `Makefile` 或脚本简化开发流程？
