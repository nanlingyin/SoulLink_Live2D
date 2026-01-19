## 1. 后端重构 (Phase 1)

### 1.1 创建目录结构
- [x] 1.1.1 创建 `src/` 目录及子目录
- [x] 1.1.2 创建所有 `__init__.py` 文件

### 1.2 配置模块迁移
- [x] 1.2.1 创建 `src/config/models.py` - 迁移配置数据类
- [x] 1.2.2 创建 `src/config/manager.py` - 迁移 ConfigManager
- [x] 1.2.3 更新 `src/config/__init__.py` 导出

### 1.3 模型管理模块迁移
- [x] 1.3.1 创建 `src/models/types.py` - 迁移 Live2DModel 数据类
- [x] 1.3.2 创建 `src/models/scanner.py` - 迁移 ModelScanner
- [x] 1.3.3 创建 `src/models/watcher.py` - 迁移 ModelWatcher
- [x] 1.3.4 更新 `src/models/__init__.py` 导出

### 1.4 生成器模块迁移
- [x] 1.4.1 创建 `src/generators/base.py` - 定义生成器接口
- [x] 1.4.2 创建 `src/generators/expression.py` - 迁移 ExpressionGenerator
- [x] 1.4.3 创建 `src/generators/local_expression.py` - 迁移 LocalExpressionGenerator
- [x] 1.4.4 创建 `src/generators/chat.py` - 迁移 ChatGenerator
- [x] 1.4.5 更新 `src/generators/__init__.py` 导出

### 1.5 服务器模块迁移
- [x] 1.5.1 创建 `src/server/handlers.py` - 迁移 WebSocket 消息处理逻辑
- [x] 1.5.2 创建 `src/server/routes.py` - 迁移路由定义
- [x] 1.5.3 创建 `src/server/app.py` - 迁移 SoulLinkServer 主类
- [x] 1.5.4 更新 `src/server/__init__.py` 导出

### 1.6 入口文件更新
- [x] 1.6.1 更新 `server.py` 为轻量入口，导入 `src.server`
- [ ] 1.6.2 验证 `python server.py` 启动正常

### 1.7 后端功能验证
- [ ] 1.7.1 验证 WebSocket 连接正常
- [ ] 1.7.2 验证 LLM API 调用正常
- [ ] 1.7.3 验证模型扫描和加载正常

## 2. 前端重构 (Phase 2)

### 2.1 创建目录结构
- [x] 2.1.1 创建 `frontend/` 目录及子目录
- [x] 2.1.2 创建 `frontend/js/components/`
- [x] 2.1.3 创建 `frontend/js/services/`
- [x] 2.1.4 创建 `frontend/js/live2d/`
- [x] 2.1.5 创建 `frontend/js/utils/`

### 2.2 迁移核心文件
- [x] 2.2.1 迁移 `index.html` → `frontend/index.html`
- [x] 2.2.2 迁移 `js/main.js` → `frontend/js/live2d/loader.js`
- [x] 2.2.3 迁移 `js/websocket-client.js` → `frontend/js/services/websocket.js`
- [x] 2.2.4 迁移 `js/config-loader.js` → `frontend/js/services/config.js`
- [x] 2.2.5 迁移 `js/chat.js` → `frontend/js/components/chat-panel.js`
- [x] 2.2.6 迁移 `js/llm-expression.js` → `frontend/js/services/expression.js`

### 2.3 合并 core 目录
- [x] 2.3.1 迁移 `core/expression-controller.js` → `frontend/js/live2d/controller.js`
- [x] 2.3.2 迁移 `core/model-parameter-loader.js` → `frontend/js/live2d/parameters.js`
- [x] 2.3.3 迁移 `core/llm-prompt-builder.js` → `frontend/js/utils/prompt-builder.js`
- [x] 2.3.4 迁移 `core/llm-expression-generator.js` → `frontend/js/live2d/animation.js`

### 2.4 更新引用路径
- [x] 2.4.1 更新 `frontend/index.html` 中的脚本引用
- [x] 2.4.2 更新后端 `src/server/routes.py` 静态文件路由

### 2.5 前端功能验证
- [ ] 2.5.1 验证页面正常加载
- [ ] 2.5.2 验证 Live2D 模型渲染正常
- [ ] 2.5.3 验证聊天功能正常
- [ ] 2.5.4 验证表情控制正常

## 3. 资源整理 (Phase 3)

### 3.1 创建静态资源目录
- [x] 3.1.1 创建 `static/` 目录
- [x] 3.1.2 迁移 `background/` → `static/background/`

### 3.2 更新引用
- [x] 3.2.1 更新后端静态文件路由
- [x] 3.2.2 更新前端背景图片引用路径

### 3.3 最终验证
- [ ] 3.3.1 完整功能测试
- [ ] 3.3.2 更新 README.md 项目结构说明

## 4. 清理工作

- [ ] 4.1 删除旧的 `js/` 目录 (保留用于向后兼容)
- [ ] 4.2 删除旧的 `core/` 目录 (保留用于向后兼容)
- [ ] 4.3 删除旧的 `background/` 目录 (保留用于向后兼容)
- [x] 4.4 更新 `.gitignore` 如需要
- [x] 4.5 更新 `openspec/project.md` 项目结构说明

---

**注意**: 旧目录暂时保留以确保向后兼容。功能验证通过后可手动删除。
