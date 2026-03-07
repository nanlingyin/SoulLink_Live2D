# 贡献指南 (Contributing Guide)

感谢你对 SoulLink_Live2D 项目的关注！我们欢迎任何形式的贡献，包括但不限于：

- 🐛 报告 Bug
- 💡 提出新功能建议
- 📝 改进文档
- 🔧 提交代码修复或新功能
- 🌍 翻译和国际化

## 目录

- [开发环境设置](#开发环境设置)
- [项目结构](#项目结构)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)
- [问题反馈](#问题反馈)

## 开发环境设置

### 后端开发

1. **克隆仓库**
```bash
git clone https://github.com/nanlingyin/SoulLink_Live2D.git
cd SoulLink_Live2D
```

2. **安装 Python 依赖**
```bash
pip install -r requirements.txt
```

3. **配置环境**
```bash
# 复制配置文件模板
cp config.yaml.example config.yaml

# 编辑 config.yaml，填入你的 API Key
```

4. **启动后端服务**
```bash
python server.py
```

### 前端开发

1. **进入前端目录**
```bash
cd frontend-vue
```

2. **安装依赖**
```bash
npm install
```

3. **启动开发服务器**
```bash
npm run dev
```

前端将运行在 http://localhost:5173，并自动代理 API 请求到后端 http://localhost:3000。

## 项目结构

```
SoulLink_Live2D/
├── src/                    # 后端 Python 代码
│   ├── config/            # 配置管理
│   ├── generators/        # LLM 生成器
│   ├── models/            # 模型管理
│   ├── server/            # Web 服务器
│   └── asr/               # 语音识别
├── frontend-vue/          # Vue 3 前端
│   ├── src/               # Vue 组件
│   └── public/legacy/js/  # Live2D 核心脚本
├── l2d/                   # Live2D 模型目录
├── docs/                  # 文档
└── openspec/              # 项目规范和变更提案
```

## 代码规范

### Python 代码规范

- 使用 **snake_case** 命名变量和函数
- 使用 **PascalCase** 命名类
- 使用 **dataclass** 定义配置和数据结构
- 异步函数使用 `async/await`
- 每个模块顶部包含文档字符串

**示例：**
```python
from dataclasses import dataclass

@dataclass
class ModelConfig:
    """模型配置数据类"""
    name: str
    path: str

async def load_model(config: ModelConfig) -> Model:
    """异步加载模型"""
    # 实现代码
    pass
```

### JavaScript 代码规范

- 使用 **camelCase** 命名变量和函数
- 使用 **PascalCase** 命名类和构造函数
- 使用 **UPPER_SNAKE_CASE** 命名常量
- 优先使用 `const`，必要时使用 `let`
- 避免使用 `var`

**示例：**
```javascript
const MAX_RETRY_COUNT = 3;

class ModelLoader {
    async loadModel(modelPath) {
        // 实现代码
    }
}

function calculateDuration(startTime, endTime) {
    return endTime - startTime;
}
```

### 配置文件规范

- YAML 配置使用 **camelCase** 命名键
- 保持缩进一致（2 空格）
- 添加注释说明配置项用途

**示例：**
```yaml
llm:
  provider: openai        # LLM 服务提供商
  apiKey: "your-key"      # API 密钥
  model: "gpt-4o-mini"    # 模型名称
```

## 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范来管理提交信息。

### 提交格式

```
<类型>: <简短描述>

[可选的详细说明]

[可选的关联 Issue]
```

### 提交类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 添加 TTS 连续动作系统` |
| `fix` | Bug 修复 | `fix: 修复眨眼优先级过高的问题` |
| `docs` | 文档更新 | `docs: 更新 README 安装说明` |
| `style` | 代码格式调整（不影响功能） | `style: 统一代码缩进格式` |
| `refactor` | 代码重构 | `refactor: 重构参数覆盖系统` |
| `perf` | 性能优化 | `perf: 优化模型加载速度` |
| `test` | 测试相关 | `test: 添加表情生成单元测试` |
| `chore` | 构建/工具相关 | `chore: 更新依赖版本` |

### 提交示例

```bash
# 好的提交
git commit -m "feat: 添加模型专属 Prompt 支持"
git commit -m "fix: 修复 loader.js UTF-8 编码问题"
git commit -m "docs: 添加贡献指南文档"

# 不好的提交
git commit -m "update"
git commit -m "fix bug"
git commit -m "修改了一些代码"
```

## Pull Request 流程

### 1. Fork 项目

点击 GitHub 页面右上角的 "Fork" 按钮，将项目 fork 到你的账号下。

### 2. 创建分支

```bash
# 克隆你 fork 的仓库
git clone https://github.com/YOUR_USERNAME/SoulLink_Live2D.git
cd SoulLink_Live2D

# 创建新分支（使用描述性名称）
git checkout -b feature/add-new-animation
# 或
git checkout -b fix/parameter-control-issue
```

### 3. 进行开发

- 遵循代码规范
- 编写清晰的提交信息
- 确保代码能够正常运行
- 如果修改了功能，更新相关文档

### 4. 测试你的更改

```bash
# 后端测试
python server.py

# 前端测试
cd frontend-vue
npm run dev
```

确保：
- 后端服务能正常启动
- 前端界面能正常显示
- 新功能/修复按预期工作
- 没有引入新的 Bug

### 5. 提交更改

```bash
git add .
git commit -m "feat: 添加新的动画效果"
git push origin feature/add-new-animation
```

### 6. 创建 Pull Request

1. 访问你 fork 的仓库页面
2. 点击 "Pull Request" 按钮
3. 选择你的分支，目标分支为 `main`
4. 填写 PR 标题和描述

### PR 标题格式

```
<类型>: <简短描述>
```

示例：
- `feat: 添加模型热加载功能`
- `fix: 修复参数覆盖机制的冲突问题`
- `docs: 完善 API 使用文档`

### PR 描述模板

```markdown
## 变更类型
- [ ] 新功能 (feat)
- [ ] Bug 修复 (fix)
- [ ] 文档更新 (docs)
- [ ] 代码重构 (refactor)
- [ ] 性能优化 (perf)
- [ ] 其他

## 变更说明
简要描述你的更改内容和原因。

## 测试情况
- [ ] 已在本地测试
- [ ] 后端服务正常运行
- [ ] 前端界面正常显示
- [ ] 新功能按预期工作

## 相关 Issue
关联的 Issue 编号（如果有）：#123

## 截图/演示
如果是 UI 相关的更改，请提供截图或 GIF 演示。

## 其他说明
其他需要说明的内容。
```

### 7. 代码审查

- 维护者会审查你的 PR
- 可能会提出修改建议
- 根据反馈进行调整
- 保持沟通和耐心

### 8. 合并

PR 被批准后，维护者会将其合并到主分支。

## 问题反馈

### 报告 Bug

如果你发现了 Bug，请创建一个 Issue，并包含以下信息：

**Bug 描述**
清晰简洁地描述 Bug。

**复现步骤**
1. 执行 '...'
2. 点击 '...'
3. 看到错误 '...'

**预期行为**
描述你期望发生什么。

**实际行为**
描述实际发生了什么。

**环境信息**
- 操作系统：[如 Windows 11]
- Python 版本：[如 3.10]
- Node.js 版本：[如 18.x]
- 浏览器：[如 Chrome 120]

**截图/日志**
如果适用，添加截图或错误日志。

### 功能建议

如果你有新功能的想法，请创建一个 Issue，并包含：

**功能描述**
清晰描述你建议的功能。

**使用场景**
说明这个功能在什么场景下有用。

**实现思路**
如果有想法，可以简单描述实现方式。

**替代方案**
是否考虑过其他实现方式？

## 开发提示

### 调试技巧

**后端调试：**
```python
# 在代码中添加日志
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
logger.debug("调试信息")
```

**前端调试：**
```javascript
// 浏览器控制台
console.log('调试信息', variable);

// 测试表情生成
reactTo("测试文本");

// 查看模型参数
window.modelConfig.parameters;
```

### 常见问题

**Q: 如何添加新的 LLM 提供商支持？**
A: 在 `src/generators/expression.py` 中添加新的 API 调用逻辑，并在 `config.yaml` 中添加配置项。

**Q: 如何添加新的动画效果？**
A: 在 `frontend-vue/public/legacy/js/live2d/animation.js` 中添加新的缓动函数或动画逻辑。

**Q: 如何调试 WebSocket 通信？**
A: 在浏览器开发者工具的 Network 标签中查看 WS 连接，或在代码中添加日志。

## 行为准则

- 尊重所有贡献者
- 保持友好和专业的沟通
- 接受建设性的批评
- 关注项目的最佳利益

## 许可证

通过贡献代码，你同意你的贡献将在 MIT 许可证下发布。

## 联系方式

如果你有任何问题，可以通过以下方式联系：

- **Email**: [20241008398@stu.shzu.edu.cn](mailto:20241008398@stu.shzu.edu.cn)
- **QQ 群**: 704578889 (LynngNAN的项目群)
- **GitHub Issues**: [提交 Issue](https://github.com/nanlingyin/SoulLink_Live2D/issues)

---

再次感谢你的贡献！🎉
