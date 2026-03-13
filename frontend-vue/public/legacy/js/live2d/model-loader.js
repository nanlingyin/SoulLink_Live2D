// ============================================
// SoulLink Live2D - Model Loader
// 模型加载、配置读取、参数提取、初始化
// ============================================

console.log('🔧 model-loader.js 已加载');

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

    console.log('参数范围已更新', modelConfig.parameters);
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
            resolution: devicePixelRatio,
            autoDensity: true,
            antialias: true
        });

        window.PIXI = PIXI;

        loading.textContent = t('loading.model', 'Loading model...');

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

        loading.textContent = t('loading.model', 'Loading model...');

        const loadOptions = {
            autoInteract: false,
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
        resetIdleMotionState();
        detectIdleMotionGroup();
        scheduleIdleResume(320);

        model.on('hit', (hitAreas) => {
            console.log('点击区域:', hitAreas);
        });

        console.log(`Live2D model [${modelConfig.name}] loaded`);

        enableDragging(model);
        enableZoom();
        hookIntoModelUpdate();
        generateControlPanel();

        // 通知 LLM 模块更新参数
        if (window.EmotionSync) {
            window.EmotionSync.updateModelConfig(modelConfig);
        }

        // 更新系统信息显示
        systemInfoState.modelName = modelConfig.name;
        systemInfoState.apiProvider = getConfig('llm.provider', 'openai');
        systemInfoState.connection = false;
        renderSystemInfo();

        console.log('SoulLink Live2D initialization complete');

    } catch (error) {
        console.error('加载 Live2D 模型失败:', error);
        loading.textContent = '模型加载失败: ' + error.message;
        loading.style.color = '#ff6b6b';
    }
}

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
        <div>SoulLink Live2D</div>
        <div style="margin-top: 10px; font-size: 14px;">${t('loading.model', 'Loading model...')} ${modelInfo.name}</div>
    `;

    try {
        // 如果已有模型，先移除
        if (model && app) {
            app.stage.removeChild(model);
            model.destroy();
            model = null;
        }

        // 确保 PIXI 应用已初始化
        if (!app) {
            const devicePixelRatio = window.devicePixelRatio || 1;
            app = new PIXI.Application({
                view: canvas,
                width: container.clientWidth,
                height: container.clientHeight,
                transparent: true,
                autoStart: true,
                resolution: devicePixelRatio,
                autoDensity: true,
                antialias: true
            });
            window.PIXI = PIXI;
        }

        // 构建模型路径 - path 已经是完整路径如 "l2d/amane.model3.json"
        const modelJsonUrl = modelInfo.path;
        console.log('模型 URL:', modelJsonUrl);

        // 加载 cdi3.json 配置
        const cdi3Url = modelJsonUrl.replace('.model3.json', '.cdi3.json');
        const cdi3Config = await loadModelConfig(cdi3Url);
        if (cdi3Config) {
            modelConfig.parameters = cdi3Config.parameters;
            modelConfig.parameterGroups = cdi3Config.parameterGroups;
            modelConfig.parts = cdi3Config.parts;
        }

        // 加载 Live2D 模型
        const loadOptions = {
            autoInteract: false,
        };
        model = await PIXI.live2d.Live2DModel.from(modelJsonUrl, loadOptions);
        modelConfig.name = modelInfo.name;

        // 设置纹理缩放模式为线性插值
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

        // 设置缩放和位置
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

        // Disable built-in animation controllers to avoid conflicts with generated motions
        if (model.internalModel) {
            if (model.internalModel.breath) {
                model.internalModel.breath.enabled = false;
                console.log('[OK] Disabled built-in breath animation');
            }
            if (model.internalModel.eyeBlink) {
                model.internalModel.eyeBlink.enabled = false;
                console.log('[OK] Disabled built-in eye blink animation');
            }
            if (model.internalModel.expressionManager) {
                model.internalModel.expressionManager.enabled = false;
                console.log('[OK] Disabled built-in expression manager');
            }
        }

        app.stage.addChild(model);

        // 提取参数范围
        parameterIndexCache = {};
        parameterOverrides = {};
        window.parameterOverrides = parameterOverrides;
        blinkLockValues = {};
        blinkLockActive = false;
        resetIdleMotionState();
        extractParameterRanges();
        detectIdleMotionGroup();
        scheduleIdleResume(320);

        // 启用交互
        enableDragging(model);
        enableZoom();
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
        systemInfoState.modelName = modelConfig.name;
        systemInfoState.apiProvider = getConfig('llm.provider', 'openai');
        systemInfoState.connection = !!window.wsClient?.connected;
        renderSystemInfo();

        console.log(`Model [${modelConfig.name}] loaded`);

        // 暴露全局引用
        window.model = model;

    } catch (error) {
        console.error('模型加载失败:', error);
        loading.textContent = '模型加载失败: ' + error.message;
        loading.style.color = '#ff6b6b';
    }
}

// ============================================
// 全局导出
// ============================================

window.initLive2D = initLive2D;
window.loadModelFromServer = loadModelFromServer;
window.model = model;
