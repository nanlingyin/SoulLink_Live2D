## ADDED Requirements

### Requirement: 后端模块化目录结构

系统 SHALL 采用模块化的后端目录结构，将代码按功能域划分为独立模块。

后端代码 SHALL 组织在 `src/` 目录下，包含以下子模块：
- `config/` - 配置管理
- `models/` - Live2D 模型管理
- `generators/` - LLM 生成器
- `server/` - Web 服务器
- `utils/` - 工具函数

每个模块 SHALL 包含 `__init__.py` 文件，导出该模块的主要类和函数。

#### Scenario: 开发者定位配置相关代码
- **WHEN** 开发者需要修改配置管理逻辑
- **THEN** 可以直接在 `src/config/` 目录下找到所有配置相关代码

#### Scenario: 开发者添加新的 LLM 生成器
- **WHEN** 开发者需要添加新的 LLM 提供商支持
- **THEN** 可以在 `src/generators/` 目录下创建新的生成器模块
- **AND** 通过 `src/generators/__init__.py` 导出新类

#### Scenario: 项目启动方式保持不变
- **WHEN** 用户执行 `python server.py`
- **THEN** 服务器正常启动
- **AND** 所有功能正常工作

---

### Requirement: 前端模块化目录结构

系统 SHALL 采用模块化的前端目录结构，将代码按功能域划分。

前端代码 SHALL 组织在 `frontend/` 目录下，包含以下结构：
- `index.html` - 主页面
- `js/components/` - UI 组件
- `js/services/` - 服务层（与后端通信）
- `js/live2d/` - Live2D 相关功能
- `js/utils/` - 工具函数

#### Scenario: 开发者定位 WebSocket 通信代码
- **WHEN** 开发者需要修改 WebSocket 通信逻辑
- **THEN** 可以在 `frontend/js/services/websocket.js` 找到相关代码

#### Scenario: 开发者修改 Live2D 动画效果
- **WHEN** 开发者需要调整表情动画过渡效果
- **THEN** 可以在 `frontend/js/live2d/animation.js` 找到相关代码

#### Scenario: 前端页面正常加载
- **WHEN** 用户访问服务器地址
- **THEN** `frontend/index.html` 正常加载
- **AND** 所有 JavaScript 模块正常执行

---

### Requirement: 静态资源统一管理

系统 SHALL 将静态资源统一管理在 `static/` 目录下。

静态资源目录结构 SHALL 包含：
- `static/background/` - 背景图片
- `static/images/` - 其他图片资源（如需）

#### Scenario: 开发者添加新背景图片
- **WHEN** 开发者需要添加新的背景选项
- **THEN** 可以将图片放入 `static/background/` 目录
- **AND** 前端自动识别新背景

#### Scenario: 静态资源正确服务
- **WHEN** 前端请求 `/static/background/bg1.jpg`
- **THEN** 服务器返回正确的图片文件

---

### Requirement: Live2D 模型目录保持不变

系统 SHALL 保持现有的 Live2D 模型目录结构不变。

模型目录 SHALL 保持在项目根目录：
- `l2d/` - 默认 Live2D 模型目录
- `models/` - 额外测试模型

#### Scenario: 用户添加新模型
- **WHEN** 用户将 Live2D 模型放入 `l2d/` 目录
- **THEN** 服务器自动扫描并加载新模型
- **AND** 前端模型列表自动更新

#### Scenario: 配置文件兼容
- **WHEN** 用户使用现有的 `config.yaml` 配置
- **THEN** `modelDirs` 配置正常工作
- **AND** 无需修改配置文件
