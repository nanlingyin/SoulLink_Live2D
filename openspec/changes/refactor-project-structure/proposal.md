# Change: 重构项目结构以提升可维护性和模块化

## Why

当前项目结构较为扁平，核心代码分散在 `server.py`、`js/`、`core/` 等多个位置，随着项目功能增加，难以快速定位和维护各功能模块。需要重新组织项目结构，使其更加模块化、易于扩展和维护。

**当前问题：**
- `server.py` 单文件包含 1000+ 行代码，职责过多
- `js/` 和 `core/` 目录功能划分不清晰
- 配置、模型、生成器等逻辑混杂在一起
- 缺乏清晰的包结构，不利于单元测试

## What Changes

### 后端重构 (Python)
- **BREAKING**: 将 `server.py` 拆分为多个模块
- 新建 `src/` 目录作为后端代码根目录
- 按功能划分子模块：`config/`, `models/`, `generators/`, `server/`, `utils/`
- 保持入口文件 `server.py` 作为启动脚本

### 前端重构 (JavaScript)
- 合并 `js/` 和 `core/` 目录
- 新建 `frontend/` 目录作为前端代码根目录
- 按功能划分：`components/`, `services/`, `utils/`

### 资源目录整理
- 统一静态资源到 `static/` 目录
- 保持 `l2d/` 和 `models/` 作为 Live2D 模型目录

## Impact

- Affected specs: 新建 `project-structure` 规范
- Affected code:
  - `server.py` → 拆分为多个模块
  - `js/*.js` → 移动到 `frontend/`
  - `core/*.js` → 合并到 `frontend/`
  - `index.html` → 移动到 `frontend/`
- **Breaking**: 需要更新所有导入路径和静态文件引用
