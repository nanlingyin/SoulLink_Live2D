// ============================================
// SoulLink Live2D - AI 驱动的 Live2D 表情控制系统
// 通用版本 - 自动适配任意 Live2D 模型
// 版本: 2.0.1 - 滚轮缩放修复
// ============================================

console.log('🎮 loader.js v2.0.1 已加载 - 支持滚轮缩放');

// 全局变量
let app = null;
let model = null;
let currentBgIndex = 0;
let controlPanelVisible = true;
let bgSprite = null;  // PIXI 背景精灵

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
let blinkLockActive = false;
let blinkLockValues = {};
const EYE_OPEN_PARAM_HINTS = ['eye', 'open'];
let idleMotionGroup = null;
let idleResumeTimer = null;
let lastIdleStartTime = 0;
const generatedMotionLocks = new Set();
const systemInfoState = {
    modelName: '',
    apiProvider: '',
    connection: null
};

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

function t(key, fallback, params = null) {
    if (window.I18N && typeof window.I18N.t === 'function') {
        return window.I18N.t(key, params, fallback);
    }
    return fallback;
}

function getMotionMap() {
    if (!model || !model.internalModel) return null;

    const candidates = [
        model.internalModel.settings?.motions,
        model.internalModel.settings?.json?.FileReferences?.Motions,
        model.internalModel.motionManager?.definitions
    ];

    for (const candidate of candidates) {
        if (candidate && typeof candidate === 'object') {
            return candidate;
        }
    }
    return null;
}

function detectIdleMotionGroup() {
    const motionMap = getMotionMap();
    if (!motionMap) {
        idleMotionGroup = null;
        return null;
    }

    const groups = motionMap instanceof Map ? [...motionMap.keys()] : Object.keys(motionMap);
    const normalized = groups.map((name) => ({ raw: name, norm: String(name).toLowerCase() }));
    const exact = normalized.find((entry) => entry.norm === 'idle');
    const fuzzy = normalized.find((entry) => entry.norm.includes('idle'));

    idleMotionGroup = (exact || fuzzy || {}).raw || null;
    return idleMotionGroup;
}

function stopIdleMotion() {
    if (!model || !model.internalModel) return;

    const motionManager = model.internalModel.motionManager;
    if (motionManager && typeof motionManager.stopAllMotions === 'function') {
        motionManager.stopAllMotions();
        return;
    }
    if (typeof model.stopMotions === 'function') {
        model.stopMotions();
    }
}

function startIdleMotionIfAvailable() {
    if (!model || !model.internalModel) return false;
    if (generatedMotionLocks.size > 0) return false;

    // Debounce: prevent starting idle motion too frequently (within 500ms)
    const now = Date.now();
    if (now - lastIdleStartTime < 500) {
        console.log('[Idle] Debounced: too soon since last idle start');
        return false;
    }

    const group = idleMotionGroup || detectIdleMotionGroup();
    if (!group) return false;

    const motionMap = getMotionMap();
    const motionList = motionMap
        ? (motionMap instanceof Map ? motionMap.get(group) : motionMap[group])
        : null;
    const motionCount = Array.isArray(motionList) ? motionList.length : 0;
    const randomIndex = motionCount > 0 ? Math.floor(Math.random() * motionCount) : 0;

    try {
        const motionManager = model.internalModel.motionManager;
        if (motionManager && typeof motionManager.startRandomMotion === 'function') {
            motionManager.startRandomMotion(group, 1);
            lastIdleStartTime = now;
            console.log('[Idle] Started idle motion');
            return true;
        }
        if (motionManager && typeof motionManager.startMotion === 'function') {
            motionManager.startMotion(group, randomIndex, 1);
            lastIdleStartTime = now;
            console.log('[Idle] Started idle motion');
            return true;
        }
        if (typeof model.motion === 'function') {
            model.motion(group, randomIndex, 1);
            lastIdleStartTime = now;
            console.log('[Idle] Started idle motion');
            return true;
        }
    } catch (error) {
        console.warn('Failed to start idle motion:', error);
    }

    return false;
}

function scheduleIdleResume(delayMs = 120) {
    if (idleResumeTimer) {
        clearTimeout(idleResumeTimer);
        idleResumeTimer = null;
    }
    idleResumeTimer = setTimeout(() => {
        if (generatedMotionLocks.size === 0) {
            startIdleMotionIfAvailable();
        }
    }, Math.max(0, delayMs));
}

function pauseIdleForGeneratedMotion(token = 'default') {
    const key = String(token || 'default');
    generatedMotionLocks.add(key);
    if (idleResumeTimer) {
        clearTimeout(idleResumeTimer);
        idleResumeTimer = null;
    }

    // Don't immediately stop idle motion - let it fade out naturally
    // The first motion frame will smoothly transition from idle state
    // Only stop idle motion after a short delay to allow smooth transition
    setTimeout(() => {
        if (generatedMotionLocks.size > 0) {
            stopIdleMotion();
            console.log('[Motion] Stopped idle motion after transition delay');
        }
    }, 200);

    // Disable auto eye blink during generated motion
    if (model?.internalModel?.eyeBlink) {
        delete model.internalModel.eyeBlink;
        console.log('[Motion] Disabled auto eye blink');
    }
}

function resumeIdleForGeneratedMotion(token = 'default') {
    const key = String(token || 'default');
    generatedMotionLocks.delete(key);
    if (generatedMotionLocks.size === 0) {
        scheduleIdleResume(180);

        // Re-enable auto eye blink after generated motion ends
        // Note: eyeBlink will be automatically recreated by Live2D on next model update
        // We just need to ensure it's not explicitly disabled
        console.log('[Motion] Auto eye blink will resume on next update');
    }
}

function resetIdleMotionState() {
    generatedMotionLocks.clear();
    idleMotionGroup = null;
    if (idleResumeTimer) {
        clearTimeout(idleResumeTimer);
        idleResumeTimer = null;
    }
}

function renderSystemInfo() {
    const systemInfo = document.getElementById('system-info');
    if (!systemInfo) return;

    const connectionText = systemInfoState.connection === true
        ? t('system.connection.connected', 'Connected to server')
        : systemInfoState.connection === false
            ? t('system.connection.local', 'Local mode')
            : t('system.connection.waiting', 'Waiting');

    systemInfo.innerHTML = `
        <strong>SoulLink Live2D</strong> - ${t('system.title', 'AI-driven Live2D expression control')}<br>
        ${t('system.model', 'Model')}: <code>${systemInfoState.modelName || '-'}</code><br>
        ${t('system.connection', 'Connection')}: <code>${connectionText}</code><br>
        ${t('system.api', 'API')}: <code>${systemInfoState.apiProvider || '-'}</code>
    `;
}

function setSystemConnectionState(isConnected) {
    systemInfoState.connection = isConnected === null ? null : !!isConnected;
    renderSystemInfo();
}

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
        resetIdleMotionState();
        detectIdleMotionGroup();
        scheduleIdleResume(320);

        model.on('hit', (hitAreas) => {
            console.log('点击区域:', hitAreas);
        });

        console.log(`Live2D model [${modelConfig.name}] loaded`);

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

function isEyeOpenParameter(paramId) {
    const id = String(paramId || '').toLowerCase();
    return EYE_OPEN_PARAM_HINTS.every(hint => id.includes(hint));
}

function captureBlinkLockValues() {
    const next = {};
    for (const [paramId, info] of Object.entries(modelConfig.parameters || {})) {
        if (!isEyeOpenParameter(paramId)) continue;

        const current = getParameterValue(paramId);
        if (typeof current === 'number' && !Number.isNaN(current)) {
            next[paramId] = current;
        } else {
            next[paramId] = info?.default ?? 0;
        }
    }
    blinkLockValues = next;
}

function setBlinkLock(enabled = true) {
    blinkLockActive = !!enabled;
    if (blinkLockActive) {
        captureBlinkLockValues();
        console.log('Blink lock enabled');
    } else {
        blinkLockValues = {};
        console.log('Blink lock disabled');
    }
}

function setParameter(paramId, value) {
    const numValue = parseFloat(value);
    
    const index = getParameterIndex(paramId);
    if (index < 0) {
        console.warn(`?????: ${paramId}`);
        return false;
    }
    
    const paramInfo = modelConfig.parameters[paramId];
    const clampedValue = paramInfo 
        ? Math.max(paramInfo.min, Math.min(paramInfo.max, numValue))
        : numValue;
    
    parameterOverrides[paramId] = clampedValue;

    if (blinkLockActive && isEyeOpenParameter(paramId)) {
        blinkLockValues[paramId] = clampedValue;
    }
    
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
    if (!model) return;

    // Hook into model.update() instead of internalModel.updateParameters
    // This ensures our parameter overrides are applied AFTER all internal updates
    const originalUpdate = model.update.bind(model);

    model.update = function(deltaTime) {
        // Call original update (this includes motionManager, physics, etc.)
        originalUpdate(deltaTime);

        // Apply our parameter overrides AFTER all internal updates
        applyParameterOverrides();
    };

    console.log('Hooked into model.update()');
}

function applyParameterOverrides() {
    const hasGeneratedMotionLock = generatedMotionLocks.size > 0;
    if (Object.keys(parameterOverrides).length === 0 && !blinkLockActive && !hasGeneratedMotionLock) return;
    
    const coreModel = model?.internalModel?.coreModel;
    if (!coreModel || !coreModel._model) return;
    
    const values = coreModel._model.parameters.values;

    // Keep suppressing idle motions while generated-motion lock is active.
    if (hasGeneratedMotionLock) {
        stopIdleMotion();
    }
    
    for (const [paramId, value] of Object.entries(parameterOverrides)) {
        const index = getParameterIndex(paramId);
        if (index >= 0 && index < values.length) {
            values[index] = value;
        }
    }

    if (blinkLockActive) {
        if (Object.keys(blinkLockValues).length === 0) {
            captureBlinkLockValues();
        }

        for (const [paramId, value] of Object.entries(blinkLockValues)) {
            const index = getParameterIndex(paramId);
            if (index >= 0 && index < values.length) {
                values[index] = value;
            }
        }
    }
}

function clearAllOverrides() {
    parameterOverrides = {};
    window.parameterOverrides = parameterOverrides;
    console.log('🧹 已清理全部参数覆盖');
}

function getAvailableParameters() {
    return Object.values(modelConfig.parameters);
}

// ============================================
// ????????
// ============================================

function generateControlPanel() {
    const panel = document.getElementById('control-panel');
    if (!panel) return;

    if (!getConfig('ui.showControlPanel', true)) {
        panel.style.display = 'none';
        return;
    }

    panel.innerHTML = `<h3>${t('controls.expression_panel_title', 'Expression Controls')}: ${modelConfig.name || 'Live2D'}</h3>`;

    const presetDiv = document.createElement('div');
    presetDiv.className = 'preset-buttons';
    presetDiv.innerHTML = `
        <button onclick="resetExpression()">${t('controls.preset.reset', 'Reset')}</button>
    `;
    panel.appendChild(presetDiv);

    // === 位置控制栏目 ===
    panel.appendChild(createPositionControlSection());

    // === 表情控制（顶级可折叠，包含所有参数组） ===
    const expressionSection = createCollapsibleSection(t('controls.expression_section', '表情控制'), false);

    const showPhysicsParams = getConfig('ui.showPhysicsParams', false);
    const groupedParams = {};

    for (const [paramId, paramInfo] of Object.entries(modelConfig.parameters)) {
        if (!showPhysicsParams && isPhysicsParam(paramId)) continue;
        const groupId = paramInfo.groupId || 'other';
        if (!groupedParams[groupId]) groupedParams[groupId] = [];
        groupedParams[groupId].push(paramInfo);
    }

    for (const [groupId, params] of Object.entries(groupedParams)) {
        const groupName = modelConfig.parameterGroups[groupId]?.name || getGroupDisplayName(groupId);
        const subSection = createCollapsibleSection(groupName, false);

        for (const param of params) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'param-item';
            const defaultValue = param.default ?? 0;
            const step = (param.max - param.min) <= 2 ? 0.01 : 0.1;
            itemDiv.innerHTML = `
                <label>${param.name} <span class="param-value" id="val-${param.id}">${defaultValue.toFixed(2)}</span></label>
                <input type="range"
                       id="slider-${param.id}"
                       min="${param.min}" max="${param.max}" step="${step}"
                       value="${defaultValue}"
                       onchange="setParameter('${param.id}', this.value)"
                       oninput="setParameter('${param.id}', this.value)">
            `;
            subSection.content.appendChild(itemDiv);
        }

        expressionSection.content.appendChild(subSection.wrapper);
    }

    panel.appendChild(expressionSection.wrapper);

    // === 试验性功能（顶级可折叠） ===
    panel.appendChild(createExperimentalSection());
}

// ============================================
// 可折叠区域组件
// ============================================

function createCollapsibleSection(title, defaultOpen = true) {
    const wrapper = document.createElement('div');
    wrapper.className = 'collapsible-section';
    if (defaultOpen) wrapper.classList.add('open');

    const header = document.createElement('div');
    header.className = 'collapsible-header';
    header.innerHTML = `<span class="collapsible-arrow">▶</span><span>${title}</span>`;

    const content = document.createElement('div');
    content.className = 'collapsible-content';

    header.addEventListener('click', () => {
        wrapper.classList.toggle('open');
    });

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    return { wrapper, content };
}

// ============================================
// 位置控制
// ============================================

function createPositionControlSection() {
    const section = createCollapsibleSection(t('controls.position_title', '位置控制'), true);

    const fields = [
        { id: 'pos-x', label: 'X', step: 1 },
        { id: 'pos-y', label: 'Y', step: 1 },
        { id: 'pos-scale', label: t('controls.scale', '缩放'), step: 0.01 },
        { id: 'pos-rotation', label: t('controls.rotation', '旋转°'), step: 1 },
    ];

    for (const field of fields) {
        const row = document.createElement('div');
        row.className = 'pos-control-row';
        row.innerHTML = `
            <label>${field.label}</label>
            <div class="drag-input-wrap">
                <input type="number" id="${field.id}" step="${field.step}" value="0"
                       class="drag-input" data-step="${field.step}">
            </div>
        `;
        section.content.appendChild(row);
    }

    const resetBtn = document.createElement('button');
    resetBtn.className = 'pos-reset-btn';
    resetBtn.textContent = t('controls.preset.reset', 'Reset');
    resetBtn.addEventListener('click', () => {
        resetModel();
        syncPositionControlsFromModel();
    });
    section.content.appendChild(resetBtn);

    // 初始化拖拽输入和值同步
    setTimeout(() => {
        initDragInputs();
        initPositionInputListeners();
        syncPositionControlsFromModel();
    }, 0);

    return section.wrapper;
}

function syncPositionControlsFromModel() {
    const m = window.model;
    if (!m) return;
    const posX = document.getElementById('pos-x');
    const posY = document.getElementById('pos-y');
    const posScale = document.getElementById('pos-scale');
    const posRotation = document.getElementById('pos-rotation');
    if (posX) posX.value = Math.round(m.x);
    if (posY) posY.value = Math.round(m.y);
    if (posScale) posScale.value = m.scale.x.toFixed(2);
    if (posRotation) posRotation.value = Math.round((m.angle || 0));
}

function initPositionInputListeners() {
    const posX = document.getElementById('pos-x');
    const posY = document.getElementById('pos-y');
    const posScale = document.getElementById('pos-scale');
    const posRotation = document.getElementById('pos-rotation');

    const apply = () => {
        const m = window.model;
        if (!m) return;
        if (posX) m.x = parseFloat(posX.value) || 0;
        if (posY) m.y = parseFloat(posY.value) || 0;
        if (posScale) {
            const s = parseFloat(posScale.value) || 0.1;
            m.scale.set(s);
        }
        if (posRotation) m.angle = parseFloat(posRotation.value) || 0;
    };

    [posX, posY, posScale, posRotation].forEach(el => {
        if (!el) return;
        el.addEventListener('input', apply);
        el.addEventListener('change', apply);
    });
}

// ============================================
// 拖拽输入框（按住左右拖动调整数值）
// ============================================

function initDragInputs() {
    document.querySelectorAll('.drag-input').forEach(input => {
        if (input._dragBound) return;
        input._dragBound = true;

        let dragging = false;
        let startX = 0;
        let startVal = 0;
        const step = parseFloat(input.dataset.step) || 1;

        input.addEventListener('mousedown', (e) => {
            // 如果输入框已聚焦（用户在编辑），不启动拖拽
            if (document.activeElement === input) return;
            e.preventDefault();
            dragging = true;
            startX = e.clientX;
            startVal = parseFloat(input.value) || 0;
            input.classList.add('dragging');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const sensitivity = step < 0.1 ? 0.5 : (step < 1 ? 1 : 2);
            const newVal = startVal + dx * step * sensitivity;
            input.value = step < 1 ? newVal.toFixed(2) : Math.round(newVal);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const stopDrag = () => {
            if (!dragging) return;
            dragging = false;
            input.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('mouseleave', stopDrag);
    });
}

// ============================================
// 试验性功能 - 背景上传与控制
// ============================================

function createExperimentalSection() {
    const section = createCollapsibleSection(t('controls.experimental', '试验性功能'), true);

    // 背景上传按钮
    const uploadRow = document.createElement('div');
    uploadRow.className = 'bg-upload-row';
    uploadRow.innerHTML = `
        <input type="file" id="bg-upload-input" accept="image/*" style="display:none">
        <button class="bg-upload-btn" id="bg-upload-btn">${t('controls.upload_bg', '上传背景')}</button>
        <button class="bg-remove-btn" id="bg-remove-btn" style="display:none">${t('controls.remove_bg', '移除背景')}</button>
    `;
    section.content.appendChild(uploadRow);

    // 背景控制子栏目
    const bgControlSection = createCollapsibleSection(t('controls.bg_controls', '背景控制'), true);
    const bgFields = [
        { id: 'bg-x', label: 'X', step: 1 },
        { id: 'bg-y', label: 'Y', step: 1 },
        { id: 'bg-scale', label: t('controls.scale', '缩放'), step: 0.01 },
    ];

    for (const field of bgFields) {
        const row = document.createElement('div');
        row.className = 'pos-control-row';
        row.innerHTML = `
            <label>${field.label}</label>
            <div class="drag-input-wrap">
                <input type="number" id="${field.id}" step="${field.step}" value="0"
                       class="drag-input" data-step="${field.step}">
            </div>
        `;
        bgControlSection.content.appendChild(row);
    }

    const bgResetBtn = document.createElement('button');
    bgResetBtn.className = 'pos-reset-btn';
    bgResetBtn.textContent = t('controls.reset_bg', '重置背景位置');
    bgResetBtn.addEventListener('click', () => resetBgPosition());
    bgControlSection.content.appendChild(bgResetBtn);

    section.content.appendChild(bgControlSection.wrapper);

    // 延迟绑定事件
    setTimeout(() => {
        const fileInput = document.getElementById('bg-upload-input');
        const uploadBtn = document.getElementById('bg-upload-btn');
        const removeBtn = document.getElementById('bg-remove-btn');

        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleBgUpload(file);
        });
        removeBtn.addEventListener('click', () => removeBgSprite());

        initBgControlListeners();
        initDragInputs(); // 重新绑定新增的 drag-input
    }, 0);

    return section.wrapper;
}

function handleBgUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        createBgSprite(dataUrl);
    };
    reader.readAsDataURL(file);
}

function createBgSprite(dataUrl) {
    if (!app) return;

    // 移除旧背景
    if (bgSprite) {
        app.stage.removeChild(bgSprite);
        bgSprite.destroy();
        bgSprite = null;
    }

    const texture = PIXI.Texture.from(dataUrl);
    bgSprite = new PIXI.Sprite(texture);
    bgSprite.anchor.set(0.5, 0.5);

    // 等纹理加载完成后设置尺寸
    const onLoaded = () => {
        const container = document.getElementById('live2d-container');
        const cw = container.clientWidth;
        const ch = container.clientHeight;

        // 默认 cover 适配
        const scaleX = cw / bgSprite.texture.width;
        const scaleY = ch / bgSprite.texture.height;
        const fitScale = Math.max(scaleX, scaleY);
        bgSprite.scale.set(fitScale);
        bgSprite.x = cw / 2;
        bgSprite.y = ch / 2;

        syncBgControlsFromSprite();
    };

    if (texture.baseTexture.valid) {
        onLoaded();
    } else {
        texture.baseTexture.on('loaded', onLoaded);
    }

    bgSprite.interactive = true;
    bgSprite.buttonMode = true;
    bgSprite.cursor = 'grab';
    enableBgDragging(bgSprite);

    // 插入到最底层（模型之前）
    app.stage.addChildAt(bgSprite, 0);

    // 让 PIXI 背景不透明，关闭 transparent
    app.renderer.backgroundAlpha = 0;

    // 显示移除按钮
    const removeBtn = document.getElementById('bg-remove-btn');
    if (removeBtn) removeBtn.style.display = '';
}

function removeBgSprite() {
    if (bgSprite && app) {
        app.stage.removeChild(bgSprite);
        bgSprite.destroy();
        bgSprite = null;
    }
    const removeBtn = document.getElementById('bg-remove-btn');
    if (removeBtn) removeBtn.style.display = 'none';

    // 清空控制值
    const bgX = document.getElementById('bg-x');
    const bgY = document.getElementById('bg-y');
    const bgScale = document.getElementById('bg-scale');
    if (bgX) bgX.value = 0;
    if (bgY) bgY.value = 0;
    if (bgScale) bgScale.value = 0;
}

function enableBgDragging(sprite) {
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    sprite.on('pointerdown', (event) => {
        isDragging = true;
        sprite.cursor = 'grabbing';
        const pos = event.data.global;
        dragOffset.x = sprite.x - pos.x;
        dragOffset.y = sprite.y - pos.y;
        event.stopPropagation();
    });

    sprite.on('pointermove', (event) => {
        if (isDragging) {
            const pos = event.data.global;
            sprite.x = pos.x + dragOffset.x;
            sprite.y = pos.y + dragOffset.y;
            syncBgControlsFromSprite();
        }
    });

    sprite.on('pointerup', () => {
        isDragging = false;
        sprite.cursor = 'grab';
        syncBgControlsFromSprite();
    });
    sprite.on('pointerupoutside', () => {
        isDragging = false;
        sprite.cursor = 'grab';
        syncBgControlsFromSprite();
    });
}

function syncBgControlsFromSprite() {
    if (!bgSprite) return;
    const bgX = document.getElementById('bg-x');
    const bgY = document.getElementById('bg-y');
    const bgScale = document.getElementById('bg-scale');
    if (bgX) bgX.value = Math.round(bgSprite.x);
    if (bgY) bgY.value = Math.round(bgSprite.y);
    if (bgScale) bgScale.value = bgSprite.scale.x.toFixed(2);
}

function initBgControlListeners() {
    const bgX = document.getElementById('bg-x');
    const bgY = document.getElementById('bg-y');
    const bgScale = document.getElementById('bg-scale');

    const apply = () => {
        if (!bgSprite) return;
        if (bgX) bgSprite.x = parseFloat(bgX.value) || 0;
        if (bgY) bgSprite.y = parseFloat(bgY.value) || 0;
        if (bgScale) {
            const s = parseFloat(bgScale.value) || 0.1;
            bgSprite.scale.set(s);
        }
    };

    [bgX, bgY, bgScale].forEach(el => {
        if (!el) return;
        el.addEventListener('input', apply);
        el.addEventListener('change', apply);
    });
}

function resetBgPosition() {
    if (!bgSprite || !app) return;
    const container = document.getElementById('live2d-container');
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const scaleX = cw / bgSprite.texture.width;
    const scaleY = ch / bgSprite.texture.height;
    const fitScale = Math.max(scaleX, scaleY);
    bgSprite.scale.set(fitScale);
    bgSprite.x = cw / 2;
    bgSprite.y = ch / 2;
    syncBgControlsFromSprite();
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
        'ParamGroupFace': t('groups.face', 'Face'),
        'ParamGroupEyes': t('groups.eyes', 'Eyes'),
        'ParamGroupEyeballs': t('groups.eyeballs', 'Eyeballs'),
        'ParamGroupBrows': t('groups.brows', 'Brows'),
        'ParamGroupMouth': t('groups.mouth', 'Mouth'),
        'ParamGroupBody': t('groups.body', 'Body'),
        'ParamGroupArms': t('groups.arms', 'Arms'),
        'ParamGroup': t('groups.eyes', 'Eyes'),
        'ParamGroup2': t('groups.head', 'Head'),
        'other': t('groups.other', 'Other')
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
            syncPositionControlsFromModel();
        }
    });

    targetModel.on('pointerup', () => {
        isDragging = false;
        targetModel.cursor = 'grab';
        syncPositionControlsFromModel();
    });
    targetModel.on('pointerupoutside', () => {
        isDragging = false;
        targetModel.cursor = 'grab';
        syncPositionControlsFromModel();
    });

    console.log('Drag support enabled');
}

/**
 * 启用滚轮缩放功能
 */
function enableZoom() {
    console.log('========== enableZoom ?????? ==========');

    // ???????? canvas??? PIXI ??? canvas ???
    const container = document.getElementById('live2d-container');

    console.log('enableZoom called');
    console.log('🔧 container:', container);

    if (!container) {
        console.log('? container ???????????????');
        return;
    }

    // 移除之前的事件监听器
    if (container._zoomHandler) {
        console.log('Removed previous wheel listener');
        container.removeEventListener('wheel', container._zoomHandler);
    }

    container._zoomHandler = (event) => {
        event.preventDefault();

        const currentModel = window.model;
        console.log('🔍 滚轮事件触发, deltaY:', event.deltaY);

        if (!currentModel) {
            console.log('Model is not available');
            return;
        }

        // 缩放速度
        const zoomSpeed = 0.1;
        let newScale = currentModel.scale.x;

        if (event.deltaY < 0) {
            // ???????
            newScale += zoomSpeed;
        } else {
            // ???????
            newScale -= zoomSpeed;
        }

        // 不限制缩放范围
        newScale = Math.max(newScale, 0.01);

        // 应用缩放
        currentModel.scale.set(newScale);
        syncPositionControlsFromModel();

        console.log(`🔍 缩放完成: ${newScale.toFixed(2)}`);
    };

    container.addEventListener('wheel', container._zoomHandler, { passive: false });

    console.log('?? ????????? (bind to container)');
    console.log('========== enableZoom 函数执行完毕 ==========');
}

/**
 * ??????????????
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

    // 重置位置
    currentModel.x = container.clientWidth / 2;
    currentModel.y = container.clientHeight / 2;

    // 重置旋转
    currentModel.angle = 0;

    console.log('?? ?????: ????, ??=' + scale.toFixed(3));
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
    console.log('=== SoulLink Live2D 调试信息 ===');
    console.log('配置:', window.EmotionSyncConfig);
    console.log('模型名称:', modelConfig.name);
    console.log('参数数量:', Object.keys(modelConfig.parameters).length);
    console.log('参数列表:', modelConfig.parameters);
    console.log('当前覆盖:', parameterOverrides);
    console.log('============================');
}

// ============================================
// 
// ============================================

// 注意：不要在这里自动调用 initLive2D
// 初始化由 index.html 统一控制，以支持 WebSocket 模式
// window.addEventListener('DOMContentLoaded', initLive2D);

window.addEventListener('resize', () => {
    if (app && model) {
        const container = document.getElementById('live2d-container');
        const devicePixelRatio = window.devicePixelRatio || 1;

        // ???????
        app.renderer.resize(container.clientWidth, container.clientHeight);

        // ???????
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
window.setBlinkLock = setBlinkLock;
window.pauseIdleForGeneratedMotion = pauseIdleForGeneratedMotion;
window.resumeIdleForGeneratedMotion = resumeIdleForGeneratedMotion;
window.refreshSystemInfoLanguage = renderSystemInfo;
window.setSystemConnectionState = setSystemConnectionState;
window.refreshControlPanelLanguage = () => {
    if (Object.keys(modelConfig.parameters || {}).length > 0) {
        generateControlPanel();
    }
};
window.updateSliderUI = updateSliderUI;
window.debugModel = debugModel;
window.resetModel = resetModel;
window.syncPositionControlsFromModel = syncPositionControlsFromModel;
window.toggleBackground = toggleBackground;
window.toggleControlPanel = toggleControlPanel;
window.initLive2D = initLive2D;
window.removeBgSprite = removeBgSprite;
window.resetBgPosition = resetBgPosition;

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
        
        // ??? PIXI ?????????
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
                antialias: true                // ???
            });
            window.PIXI = PIXI;
        }
        
        // 构建模型路径 - path 已经是完整路径如 "l2d/amane.model3.json"
        const modelJsonUrl = modelInfo.path;
        console.log('模型 URL:', modelJsonUrl);
        
        // ?? cdi3.json ?? - ?? directory + ???????
        const cdi3Url = modelJsonUrl.replace('.model3.json', '.cdi3.json');
        const cdi3Config = await loadModelConfig(cdi3Url);
        if (cdi3Config) {
            modelConfig.parameters = cdi3Config.parameters;
            modelConfig.parameterGroups = cdi3Config.parameterGroups;
            modelConfig.parts = cdi3Config.parts;
        }
        
        // ?? Live2D ????????????
        const loadOptions = {
            autoInteract: false,
        };
        model = await PIXI.live2d.Live2DModel.from(modelJsonUrl, loadOptions);
        modelConfig.name = modelInfo.name;

        // ???????????????????
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

        // ?????????
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
            // Disable auto breath animation
            if (model.internalModel.breath) {
                model.internalModel.breath.enabled = false;
                console.log('[OK] Disabled built-in breath animation');
            }
            // Disable auto eye blink animation
            if (model.internalModel.eyeBlink) {
                model.internalModel.eyeBlink.enabled = false;
                console.log('[OK] Disabled built-in eye blink animation');
            }
            // Disable expression manager auto update
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
        console.log('>>> [loadModelFromServer] 准备调用 enableDragging');
        enableDragging(model);
        console.log('>>> [loadModelFromServer] enableDragging ????????? enableZoom');
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
        systemInfoState.modelName = modelConfig.name;
        systemInfoState.apiProvider = getConfig('llm.provider', 'openai');
        systemInfoState.connection = !!window.wsClient?.connected;
        renderSystemInfo();
        
        console.log(`Model [${modelConfig.name}] loaded`);
        
        // 暴露全局引用
        window.model = model;
        
    } catch (error) {
        console.error('? ??????:', error);
        loading.textContent = '模型加载失败: ' + error.message;
        loading.style.color = '#ff6b6b';
    }
}

window.loadModelFromServer = loadModelFromServer;
window.model = model;

