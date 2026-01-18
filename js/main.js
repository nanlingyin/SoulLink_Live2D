// ============================================
// EmotionSync - AI 驱动的 Live2D 表情控制系统
// 通用版本 - 自动适配任意 Live2D 模型
// ============================================

// 全局变量
let app = null;
let model = null;
let currentBgIndex = 0;
let controlPanelVisible = true;

// 模型配置（自动从 cdi3.json 加载）
let modelConfig = {
    name: '',
    parameters: {},
    parameterGroups: {},
    parts: {}
};

// 参数索引缓存
let parameterIndexCache = {};

// 当前参数覆盖状态
let parameterOverrides = {};

// 背景颜色列表
const backgrounds = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    '#000000',
    '#ffffff'
];

// ============================================
// 模型加载与初始化
// ============================================

/**
 * 初始化 Live2D（等待配置加载后调用）
 */
async function initLive2D() {
    // 先加载配置
    await loadConfig();
    
    const canvas = document.getElementById('live2d-canvas');
    const container = document.getElementById('live2d-container');
    const loading = document.getElementById('loading');
    
    // 应用UI配置
    const uiConfig = getConfig('ui', {});
    controlPanelVisible = uiConfig.showControlPanel !== false;
    currentBgIndex = uiConfig.defaultBackground || 0;
    document.body.style.background = backgrounds[currentBgIndex];
    
    // 获取模型目录
    const MODEL_DIR = getConfig('model.directory', './l2d');
    
    try {
        // 获取设备像素比，用于高分辨率显示
        const devicePixelRatio = window.devicePixelRatio || 1;

        app = new PIXI.Application({
            view: canvas,
            width: container.clientWidth,
            height: container.clientHeight,
            transparent: true,
            autoStart: true,
            resolution: devicePixelRatio,  // 高分辨率支持
            autoDensity: true,             // 自动调整CSS尺寸
            antialias: true                // 抗锯齿
        });

        window.PIXI = PIXI;

        loading.textContent = '正在查找模型文件...';
        
        const modelJsonUrl = await findModel3Json(MODEL_DIR);
        if (!modelJsonUrl) {
            throw new Error(`在 ${MODEL_DIR} 目录中未找到 model3.json 文件`);
        }
        
        console.log('找到模型文件:', modelJsonUrl);
        
        const cdi3Url = modelJsonUrl.replace('.model3.json', '.cdi3.json');
        const cdi3Config = await loadModelConfig(cdi3Url);
        if (cdi3Config) {
            modelConfig.parameters = cdi3Config.parameters;
            modelConfig.parameterGroups = cdi3Config.parameterGroups;
            modelConfig.parts = cdi3Config.parts;
        }
        
        loading.textContent = '正在加载 Live2D 模型...';

        // 配置高分辨率纹理加载选项
        const loadOptions = {
            autoInteract: false,  // 禁用自动交互，我们自己处理
        };

        model = await PIXI.live2d.Live2DModel.from(modelJsonUrl, loadOptions);

        // 设置纹理缩放模式为线性插值，提高清晰度
        if (model.internalModel && model.internalModel.coreModel) {
            const textures = model.internalModel.textures;
            if (textures) {
                textures.forEach(texture => {
                    if (texture && texture.baseTexture) {
                        texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
                        texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;
                    }
                });
            }
        }

        const modelName = modelJsonUrl.split('/').pop().replace('.model3.json', '');
        modelConfig.name = modelName;
        
        loading.style.display = 'none';

        // 使用配置中的缩放比例
        const defaultScale = getConfig('model.defaultScale', 0.8);
        const scale = Math.min(
            container.clientWidth / model.width,
            container.clientHeight / model.height
        ) * defaultScale;

        model.scale.set(scale);
        model.anchor.set(0.5, 0.5);
        model.x = container.clientWidth / 2;
        model.y = container.clientHeight / 2;

        // 暴露全局引用
        window.model = model;

        app.stage.addChild(model);
        extractParameterRanges();
        
        model.on('hit', (hitAreas) => {
            console.log('点击区域:', hitAreas);
        });
        
        console.log(`Live2D 模型 [${modelConfig.name}] 加载成功！`);

        console.log('>>> 准备调用 enableDragging');
        enableDragging(model);
        console.log('>>> enableDragging 调用完成，准备调用 enableZoom');
        enableZoom();
        console.log('>>> enableZoom 调用完成');
        hookIntoModelUpdate();
        generateControlPanel();
        
        // 通知 LLM 模块更新参数
        if (window.EmotionSync) {
            window.EmotionSync.updateModelConfig(modelConfig);
        }
        
        // 更新系统信息显示
        const systemInfo = document.getElementById('system-info');
        if (systemInfo) {
            systemInfo.innerHTML = `
                <strong>EmotionSync</strong> - AI 驱动的 Live2D 表情控制<br>
                模型: <code>${modelConfig.name}</code><br>
                API: <code>${getConfig('llm.provider', 'openai')}</code>
            `;
        }
        
        console.log('EmotionSync 初始化完成');
        
    } catch (error) {
        console.error('加载 Live2D 模型失败:', error);
        loading.textContent = '模型加载失败: ' + error.message;
        loading.style.color = '#ff6b6b';
    }
}

/**
 * 加载模型配置（从 cdi3.json）
 */
async function loadModelConfig(cdi3Url) {
    try {
        const response = await fetch(cdi3Url);
        if (!response.ok) {
            console.warn('无法加载 cdi3.json，将使用模型默认参数');
            return null;
        }
        
        const cdi3Data = await response.json();
        console.log('已加载 cdi3.json:', cdi3Data);
        
        const parameters = {};
        if (cdi3Data.Parameters) {
            for (const param of cdi3Data.Parameters) {
                parameters[param.Id] = {
                    id: param.Id,
                    name: param.Name || param.Id,
                    groupId: param.GroupId || '',
                    min: -30,
                    max: 30,
                    default: 0
                };
            }
        }
        
        const parameterGroups = {};
        if (cdi3Data.ParameterGroups) {
            for (const group of cdi3Data.ParameterGroups) {
                parameterGroups[group.Id] = {
                    id: group.Id,
                    name: group.Name || group.Id
                };
            }
        }
        
        const parts = {};
        if (cdi3Data.Parts) {
            for (const part of cdi3Data.Parts) {
                parts[part.Id] = {
                    id: part.Id,
                    name: part.Name || part.Id
                };
            }
        }
        
        return { parameters, parameterGroups, parts };
        
    } catch (error) {
        console.error('加载 cdi3.json 失败:', error);
        return null;
    }
}

/**
 * 从模型中提取实际参数范围
 */
function extractParameterRanges() {
    if (!model || !model.internalModel || !model.internalModel.coreModel) {
        return;
    }
    
    const coreModel = model.internalModel.coreModel;
    const params = coreModel._model?.parameters;
    
    if (!params) return;
    
    const ids = params.ids || [];
    const minValues = params.minimumValues || [];
    const maxValues = params.maximumValues || [];
    const defaultValues = params.defaultValues || [];
    
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        
        if (!modelConfig.parameters[id]) {
            modelConfig.parameters[id] = {
                id: id,
                name: id,
                groupId: ''
            };
        }
        
        modelConfig.parameters[id].min = minValues[i] ?? -30;
        modelConfig.parameters[id].max = maxValues[i] ?? 30;
        modelConfig.parameters[id].default = defaultValues[i] ?? 0;
        modelConfig.parameters[id].index = i;
        
        parameterIndexCache[id] = i;
    }
    
    console.log('参数范围已更新:', modelConfig.parameters);
}

/**
 * 查找 model3.json 文件
 * 优先使用 files.json 列表，否则尝试常见命名
 */
async function findModel3Json(baseDir) {
    // 方法1: 尝试读取 files.json（推荐方式）
    try {
        const response = await fetch(`${baseDir}/files.json`);
        if (response.ok) {
            const files = await response.json();
            const modelFile = files.find(f => f.endsWith('.model3.json'));
            if (modelFile) {
                console.log('从 files.json 找到模型:', modelFile);
                return `${baseDir}/${modelFile}`;
            }
        }
    } catch (e) {
        console.log('files.json 不存在，尝试其他方式...');
    }
    
    // 方法2: 尝试通用名称
    const genericNames = ['model3.json', 'index.model3.json'];
    for (const name of genericNames) {
        try {
            const response = await fetch(`${baseDir}/${name}`, { method: 'HEAD' });
            if (response.ok) {
                return `${baseDir}/${name}`;
            }
        } catch (e) {
            continue;
        }
    }
    
    // 方法3: 尝试扫描常见模型名（按字母顺序，避免优先级问题）
    const commonModelNames = [
        'amane', 'amane0', 'hiyori', 'hiyori_pro_mic', 
        'mao', 'mark', 'natori', 'rice', 'model'
    ].sort();
    
    for (const name of commonModelNames) {
        try {
            const response = await fetch(`${baseDir}/${name}.model3.json`, { method: 'HEAD' });
            if (response.ok) {
                return `${baseDir}/${name}.model3.json`;
            }
        } catch (e) {
            continue;
        }
    }
    
    return null;
}

// ============================================
// 参数控制
// ============================================

function getParameterIndex(paramId) {
    if (paramId in parameterIndexCache) {
        return parameterIndexCache[paramId];
    }
    return -1;
}

function getParameterValue(paramId) {
    const coreModel = model?.internalModel?.coreModel;
    if (!coreModel || !coreModel._model) return null;
    
    const index = getParameterIndex(paramId);
    if (index < 0) return null;
    
    return coreModel._model.parameters.values[index];
}

function setParameter(paramId, value) {
    const numValue = parseFloat(value);
    
    const index = getParameterIndex(paramId);
    if (index < 0) {
        console.warn(`参数不存在: ${paramId}`);
        return false;
    }
    
    const paramInfo = modelConfig.parameters[paramId];
    const clampedValue = paramInfo 
        ? Math.max(paramInfo.min, Math.min(paramInfo.max, numValue))
        : numValue;
    
    parameterOverrides[paramId] = clampedValue;
    
    const valueDisplay = document.getElementById(`val-${paramId}`);
    if (valueDisplay) {
        valueDisplay.textContent = clampedValue.toFixed(2);
    }
    
    const slider = document.getElementById(`slider-${paramId}`);
    if (slider) {
        slider.value = clampedValue;
    }
    
    return true;
}

function hookIntoModelUpdate() {
    if (!model || !model.internalModel) return;
    
    const internalModel = model.internalModel;
    const originalUpdateParams = internalModel.updateParameters?.bind(internalModel);
    
    if (originalUpdateParams) {
        internalModel.updateParameters = function(dt, now) {
            originalUpdateParams(dt, now);
            applyParameterOverrides();
        };
        console.log('已钩入 updateParameters');
    } else {
        app.ticker.add(() => {
            applyParameterOverrides();
        }, null, PIXI.UPDATE_PRIORITY.HIGH);
        console.log('使用 ticker 进行参数更新');
    }
}

function applyParameterOverrides() {
    if (Object.keys(parameterOverrides).length === 0) return;
    
    const coreModel = model?.internalModel?.coreModel;
    if (!coreModel || !coreModel._model) return;
    
    const values = coreModel._model.parameters.values;
    
    for (const [paramId, value] of Object.entries(parameterOverrides)) {
        const index = getParameterIndex(paramId);
        if (index >= 0 && index < values.length) {
            values[index] = value;
        }
    }
}

function clearAllOverrides() {
    parameterOverrides = {};
    console.log('已清除所有参数覆盖');
}

function getAvailableParameters() {
    return Object.values(modelConfig.parameters);
}

// ============================================
// 动态生成控制面板
// ============================================

function generateControlPanel() {
    const panel = document.getElementById('control-panel');
    if (!panel) return;
    
    // 根据配置决定是否显示
    if (!getConfig('ui.showControlPanel', true)) {
        panel.style.display = 'none';
        return;
    }
    
    panel.innerHTML = `<h3>🎭 ${modelConfig.name || 'Live2D'} 表情控制</h3>`;
    
    const presetDiv = document.createElement('div');
    presetDiv.className = 'preset-buttons';
    presetDiv.innerHTML = `
        <button onclick="applyLocalExpression('happy')">开心</button>
        <button onclick="applyLocalExpression('sad')">难过</button>
        <button onclick="applyLocalExpression('surprised')">惊讶</button>
        <button onclick="applyLocalExpression('shy')">害羞</button>
        <button onclick="applyLocalExpression('angry')">生气</button>
        <button onclick="resetExpression()">重置</button>
    `;
    panel.appendChild(presetDiv);
    
    const showPhysicsParams = getConfig('ui.showPhysicsParams', false);
    const groupedParams = {};
    
    for (const [paramId, paramInfo] of Object.entries(modelConfig.parameters)) {
        if (!showPhysicsParams && isPhysicsParam(paramId)) continue;
        
        const groupId = paramInfo.groupId || 'other';
        if (!groupedParams[groupId]) {
            groupedParams[groupId] = [];
        }
        groupedParams[groupId].push(paramInfo);
    }
    
    for (const [groupId, params] of Object.entries(groupedParams)) {
        const groupName = modelConfig.parameterGroups[groupId]?.name || getGroupDisplayName(groupId);
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'param-group';
        groupDiv.innerHTML = `<h4>${groupName}</h4>`;
        
        for (const param of params) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'param-item';
            
            const defaultValue = param.default ?? 0;
            const step = (param.max - param.min) <= 2 ? 0.01 : 0.1;
            
            itemDiv.innerHTML = `
                <label>${param.name} <span class="param-value" id="val-${param.id}">${defaultValue.toFixed(2)}</span></label>
                <input type="range" 
                       id="slider-${param.id}"
                       min="${param.min}" 
                       max="${param.max}" 
                       step="${step}" 
                       value="${defaultValue}"
                       onchange="setParameter('${param.id}', this.value)"
                       oninput="setParameter('${param.id}', this.value)">
            `;
            
            groupDiv.appendChild(itemDiv);
        }
        
        panel.appendChild(groupDiv);
    }
}

function isPhysicsParam(paramId) {
    const physicsKeywords = [
        'Hair', 'Ribbon', 'Skirt', 'Bust', 'Sway', 
        'Rotation_', 'Skinning', '摇动', '辫子', '侧发'
    ];
    return physicsKeywords.some(keyword => paramId.includes(keyword));
}

function getGroupDisplayName(groupId) {
    const nameMap = {
        'ParamGroupFace': '🗣️ 脸部',
        'ParamGroupEyes': '👁️ 眼睛',
        'ParamGroupEyeballs': '👀 眼珠',
        'ParamGroupBrows': '🤨 眉毛',
        'ParamGroupMouth': '👄 嘴巴',
        'ParamGroupBody': '🧍 身体',
        'ParamGroupArms': '💪 手臂',
        'ParamGroup': '眼睛',
        'ParamGroup2': '头部',
        'other': '🎛️ 其他'
    };
    return nameMap[groupId] || groupId;
}

// ============================================
// UI 交互
// ============================================

function toggleControlPanel() {
    const panel = document.getElementById('control-panel');
    controlPanelVisible = !controlPanelVisible;
    panel.style.display = controlPanelVisible ? 'block' : 'none';
}

function enableDragging(targetModel) {
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    targetModel.interactive = true;
    targetModel.buttonMode = true;
    targetModel.cursor = 'grab';

    targetModel.on('pointerdown', (event) => {
        isDragging = true;
        targetModel.cursor = 'grabbing';
        const pos = event.data.global;
        dragOffset.x = targetModel.x - pos.x;
        dragOffset.y = targetModel.y - pos.y;
        event.stopPropagation();
    });

    targetModel.on('pointermove', (event) => {
        if (isDragging) {
            const pos = event.data.global;
            targetModel.x = pos.x + dragOffset.x;
            targetModel.y = pos.y + dragOffset.y;
        }
    });

    targetModel.on('pointerup', () => {
        isDragging = false;
        targetModel.cursor = 'grab';
    });
    targetModel.on('pointerupoutside', () => {
        isDragging = false;
        targetModel.cursor = 'grab';
    });

    console.log('✅ 拖动功能已启用');
}

/**
 * 启用滚轮缩放功能
 */
function enableZoom() {
    console.log('========== enableZoom 函数开始执行 ==========');

    // 绑定到容器而不是 canvas，因为 PIXI 会接管 canvas 的交互
    const container = document.getElementById('live2d-container');

    console.log('🔧 enableZoom 被调用');
    console.log('🔧 container:', container);

    if (!container) {
        console.log('❌ container 不存在，无法绑定缩放事件');
        return;
    }

    // 移除之前的事件监听器
    if (container._zoomHandler) {
        console.log('🔧 移除旧的滚轮事件监听器');
        container.removeEventListener('wheel', container._zoomHandler);
    }

    container._zoomHandler = (event) => {
        event.preventDefault();

        const currentModel = window.model;
        console.log('🔍 滚轮事件触发, deltaY:', event.deltaY);

        if (!currentModel) {
            console.log('❌ model 不存在');
            return;
        }

        // 缩放速度
        const zoomSpeed = 0.1;
        let newScale = currentModel.scale.x;

        if (event.deltaY < 0) {
            // 向上滚动，放大
            newScale += zoomSpeed;
        } else {
            // 向下滚动，缩小
            newScale -= zoomSpeed;
        }

        // 限制缩放范围 (0.1 到 5 倍)
        newScale = Math.min(Math.max(newScale, 0.1), 5.0);

        // 应用缩放
        currentModel.scale.set(newScale);

        console.log(`🔍 缩放完成: ${newScale.toFixed(2)}`);
    };

    container.addEventListener('wheel', container._zoomHandler, { passive: false });

    console.log('✅ 滚轮缩放功能已启用 (bindto container)');
    console.log('========== enableZoom 函数执行完毕 ==========');
}

/**
 * 重置模型位置和缩放到初始状态
 */
function resetModel() {
    const currentModel = window.model;
    if (!currentModel || !app) return;

    const container = document.getElementById('live2d-container');
    const defaultScale = getConfig('model.defaultScale', 0.8);

    // 计算初始缩放
    const scale = Math.min(
        container.clientWidth / currentModel.internalModel.width,
        container.clientHeight / currentModel.internalModel.height
    ) * defaultScale;

    // 重置缩放
    currentModel.scale.set(scale);

    // 重置位置到中心
    currentModel.x = container.clientWidth / 2;
    currentModel.y = container.clientHeight / 2;

    console.log('🔄 模型已重置: 位置居中, 缩放=' + scale.toFixed(3));
}

function toggleBackground() {
    currentBgIndex = (currentBgIndex + 1) % backgrounds.length;
    document.body.style.background = backgrounds[currentBgIndex];
}

function updateSliderUI(paramId, value) {
    const slider = document.getElementById(`slider-${paramId}`);
    if (slider) {
        slider.value = value;
    }
    
    const valueDisplay = document.getElementById(`val-${paramId}`);
    if (valueDisplay) {
        valueDisplay.textContent = parseFloat(value).toFixed(2);
    }
}

function debugModel() {
    console.log('=== EmotionSync 调试信息 ===');
    console.log('配置:', window.EmotionSyncConfig);
    console.log('模型名称:', modelConfig.name);
    console.log('参数数量:', Object.keys(modelConfig.parameters).length);
    console.log('参数列表:', modelConfig.parameters);
    console.log('当前覆盖:', parameterOverrides);
    console.log('============================');
}

// ============================================
// 初始化
// ============================================

// 注意：不要在这里自动调用 initLive2D
// 初始化由 index.html 统一控制，以支持 WebSocket 模式
// window.addEventListener('DOMContentLoaded', initLive2D);

window.addEventListener('resize', () => {
    if (app && model) {
        const container = document.getElementById('live2d-container');
        const devicePixelRatio = window.devicePixelRatio || 1;

        // 更新渲染器尺寸
        app.renderer.resize(container.clientWidth, container.clientHeight);

        // 确保分辨率正确
        if (app.renderer.resolution !== devicePixelRatio) {
            app.renderer.resolution = devicePixelRatio;
        }
    }
});

// ============================================
// 导出全局 API
// ============================================

window.modelConfig = modelConfig;
window.parameterOverrides = parameterOverrides;
window.setParameter = setParameter;
window.getParameterValue = getParameterValue;
window.getAvailableParameters = getAvailableParameters;
window.clearAllOverrides = clearAllOverrides;
window.updateSliderUI = updateSliderUI;
window.debugModel = debugModel;
window.resetModel = resetModel;
window.toggleBackground = toggleBackground;
window.toggleControlPanel = toggleControlPanel;
window.initLive2D = initLive2D;

// ============================================
// 从服务器加载模型
// ============================================

/**
 * 从服务器加载指定模型
 * @param {Object} modelInfo - 模型信息 { name, path, directory, model_file }
 */
async function loadModelFromServer(modelInfo) {
    console.log('📦 从服务器加载模型:', modelInfo);
    
    const canvas = document.getElementById('live2d-canvas');
    const container = document.getElementById('live2d-container');
    const loading = document.getElementById('loading');
    
    // 显示加载提示
    loading.style.display = 'block';
    loading.style.color = 'white';
    loading.innerHTML = `
        <div>🎭 EmotionSync</div>
        <div style="margin-top: 10px; font-size: 14px;">正在加载 ${modelInfo.name}...</div>
    `;
    
    try {
        // 如果已有模型，先移除
        if (model && app) {
            app.stage.removeChild(model);
            model.destroy();
            model = null;
        }
        
        // 初始化 PIXI 应用（如果还没有）
        if (!app) {
            const devicePixelRatio = window.devicePixelRatio || 1;
            app = new PIXI.Application({
                view: canvas,
                width: container.clientWidth,
                height: container.clientHeight,
                transparent: true,
                autoStart: true,
                resolution: devicePixelRatio,  // 高分辨率支持
                autoDensity: true,             // 自动调整CSS尺寸
                antialias: true                // 抗锯齿
            });
            window.PIXI = PIXI;
        }
        
        // 构建模型路径 - path 已经是完整路径如 "l2d/amane.model3.json"
        const modelJsonUrl = modelInfo.path;
        console.log('模型 URL:', modelJsonUrl);
        
        // 加载 cdi3.json 配置 - 使用 directory + 替换后缀的方式
        const cdi3Url = modelJsonUrl.replace('.model3.json', '.cdi3.json');
        const cdi3Config = await loadModelConfig(cdi3Url);
        if (cdi3Config) {
            modelConfig.parameters = cdi3Config.parameters;
            modelConfig.parameterGroups = cdi3Config.parameterGroups;
            modelConfig.parts = cdi3Config.parts;
        }
        
        // 加载 Live2D 模型（配置高分辨率选项）
        const loadOptions = {
            autoInteract: false,
        };
        model = await PIXI.live2d.Live2DModel.from(modelJsonUrl, loadOptions);
        modelConfig.name = modelInfo.name;

        // 设置纹理缩放模式为线性插值，提高清晰度
        if (model.internalModel && model.internalModel.coreModel) {
            const textures = model.internalModel.textures;
            if (textures) {
                textures.forEach(texture => {
                    if (texture && texture.baseTexture) {
                        texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
                        texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;
                    }
                });
            }
        }

        // 隐藏加载提示
        loading.style.display = 'none';

        // 设置模型位置和缩放
        const defaultScale = getConfig('model.defaultScale', 0.8);
        const scale = Math.min(
            container.clientWidth / model.width,
            container.clientHeight / model.height
        ) * defaultScale;

        model.scale.set(scale);
        model.anchor.set(0.5, 0.5);
        model.x = container.clientWidth / 2;
        model.y = container.clientHeight / 2;

        // 暴露全局引用
        window.model = model;

        app.stage.addChild(model);

        // 提取参数范围
        parameterIndexCache = {};
        parameterOverrides = {};
        extractParameterRanges();

        // 启用交互
        console.log('>>> [loadModelFromServer] 准备调用 enableDragging');
        enableDragging(model);
        console.log('>>> [loadModelFromServer] enableDragging 调用完成，准备调用 enableZoom');
        enableZoom();
        console.log('>>> [loadModelFromServer] enableZoom 调用完成');
        hookIntoModelUpdate();
        
        // 生成控制面板
        generateControlPanel();
        
        // 通知 LLM 模块更新参数
        if (typeof updateModelConfig === 'function') {
            updateModelConfig(modelConfig);
        }
        
        // 同步参数到服务器
        if (window.wsClient && window.wsClient.connected) {
            window.wsClient.updateParameters(modelConfig.parameters);
        }
        
        // 更新系统信息显示
        const systemInfo = document.getElementById('system-info');
        if (systemInfo) {
            systemInfo.innerHTML = `
                <strong>EmotionSync</strong> - AI 驱动的 Live2D 表情控制<br>
                模型: <code>${modelConfig.name}</code><br>
                连接: <code>${window.wsClient?.connected ? '✅ 已连接服务器' : '📦 本地模式'}</code>
            `;
        }
        
        console.log(`✅ 模型 [${modelConfig.name}] 加载成功！`);
        
        // 暴露全局引用
        window.model = model;
        
    } catch (error) {
        console.error('❌ 加载模型失败:', error);
        loading.textContent = '模型加载失败: ' + error.message;
        loading.style.color = '#ff6b6b';
    }
}

window.loadModelFromServer = loadModelFromServer;
window.model = model;
