// ============================================
// EmotionSync - AI 椹卞姩鐨?Live2D 琛ㄦ儏鎺у埗绯荤粺
// 閫氱敤鐗堟湰 - 鑷姩閫傞厤浠绘剰 Live2D 妯″瀷
// 鐗堟湰: 2.0.1 - 婊氳疆缂╂斁淇
// ============================================

console.log('馃幃 loader.js v2.0.1 宸插姞杞?- 鏀寔婊氳疆缂╂斁');

// 鍏ㄥ眬鍙橀噺
let app = null;
let model = null;
let currentBgIndex = 0;
let controlPanelVisible = true;

// 妯″瀷閰嶇疆锛堣嚜鍔ㄤ粠 cdi3.json 鍔犺浇锛?
let modelConfig = {
    name: '',
    parameters: {},
    parameterGroups: {},
    parts: {}
};

// 鍙傛暟绱㈠紩缂撳瓨
let parameterIndexCache = {};

// 褰撳墠鍙傛暟瑕嗙洊鐘舵€?
let parameterOverrides = {};
let blinkLockActive = false;
let blinkLockValues = {};
const EYE_OPEN_PARAM_HINTS = ['eye', 'open'];
let idleMotionGroup = null;
let idleResumeTimer = null;
const generatedMotionLocks = new Set();
const systemInfoState = {
    modelName: '',
    apiProvider: '',
    connection: null
};

// 鑳屾櫙棰滆壊鍒楄〃
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
            return true;
        }
        if (motionManager && typeof motionManager.startMotion === 'function') {
            motionManager.startMotion(group, randomIndex, 1);
            return true;
        }
        if (typeof model.motion === 'function') {
            model.motion(group, randomIndex, 1);
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
    stopIdleMotion();
}

function resumeIdleForGeneratedMotion(token = 'default') {
    const key = String(token || 'default');
    generatedMotionLocks.delete(key);
    if (generatedMotionLocks.size === 0) {
        scheduleIdleResume(180);
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
        <strong>EmotionSync</strong> - ${t('system.title', 'AI-driven Live2D expression control')}<br>
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
// 妯″瀷鍔犺浇涓庡垵濮嬪寲
// ============================================

/**
 * 鍒濆鍖?Live2D锛堢瓑寰呴厤缃姞杞藉悗璋冪敤锛?
 */
async function initLive2D() {
    // 鍏堝姞杞介厤缃?
    await loadConfig();
    
    const canvas = document.getElementById('live2d-canvas');
    const container = document.getElementById('live2d-container');
    const loading = document.getElementById('loading');
    
    // 搴旂敤UI閰嶇疆
    const uiConfig = getConfig('ui', {});
    controlPanelVisible = uiConfig.showControlPanel !== false;
    currentBgIndex = uiConfig.defaultBackground || 0;
    document.body.style.background = backgrounds[currentBgIndex];
    
    // 鑾峰彇妯″瀷鐩綍
    const MODEL_DIR = getConfig('model.directory', './l2d');
    
    try {
        // 鑾峰彇璁惧鍍忕礌姣旓紝鐢ㄤ簬楂樺垎杈ㄧ巼鏄剧ず
        const devicePixelRatio = window.devicePixelRatio || 1;

        app = new PIXI.Application({
            view: canvas,
            width: container.clientWidth,
            height: container.clientHeight,
            transparent: true,
            autoStart: true,
            resolution: devicePixelRatio,  // 楂樺垎杈ㄧ巼鏀寔
            autoDensity: true,             // 鑷姩璋冩暣CSS灏哄
            antialias: true                // 鎶楅敮榻?
        });

        window.PIXI = PIXI;

        loading.textContent = t('loading.model', 'Loading model...');
        
        const modelJsonUrl = await findModel3Json(MODEL_DIR);
        if (!modelJsonUrl) {
            throw new Error(`鍦?${MODEL_DIR} 鐩綍涓湭鎵惧埌 model3.json 鏂囦欢`);
        }
        
        console.log('鎵惧埌妯″瀷鏂囦欢:', modelJsonUrl);
        
        const cdi3Url = modelJsonUrl.replace('.model3.json', '.cdi3.json');
        const cdi3Config = await loadModelConfig(cdi3Url);
        if (cdi3Config) {
            modelConfig.parameters = cdi3Config.parameters;
            modelConfig.parameterGroups = cdi3Config.parameterGroups;
            modelConfig.parts = cdi3Config.parts;
        }
        
        loading.textContent = t('loading.model', 'Loading model...');

        // 閰嶇疆楂樺垎杈ㄧ巼绾圭悊鍔犺浇閫夐」
        const loadOptions = {
            autoInteract: false,  // 绂佺敤鑷姩浜や簰锛屾垜浠嚜宸卞鐞?
        };

        model = await PIXI.live2d.Live2DModel.from(modelJsonUrl, loadOptions);

        // 璁剧疆绾圭悊缂╂斁妯″紡涓虹嚎鎬ф彃鍊硷紝鎻愰珮娓呮櫚搴?
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

        // 浣跨敤閰嶇疆涓殑缂╂斁姣斾緥
        const defaultScale = getConfig('model.defaultScale', 0.8);
        const scale = Math.min(
            container.clientWidth / model.width,
            container.clientHeight / model.height
        ) * defaultScale;

        model.scale.set(scale);
        model.anchor.set(0.5, 0.5);
        model.x = container.clientWidth / 2;
        model.y = container.clientHeight / 2;

        // 鏆撮湶鍏ㄥ眬寮曠敤
        window.model = model;

        app.stage.addChild(model);
        extractParameterRanges();
        resetIdleMotionState();
        detectIdleMotionGroup();
        scheduleIdleResume(320);
        
        model.on('hit', (hitAreas) => {
            console.log('鐐瑰嚮鍖哄煙:', hitAreas);
        });
        
        console.log(`Live2D model [${modelConfig.name}] loaded`);

        console.log('>>> 鍑嗗璋冪敤 enableDragging');
        enableDragging(model);
        console.log('>>> enableDragging 璋冪敤瀹屾垚锛屽噯澶囪皟鐢?enableZoom');
        enableZoom();
        console.log('>>> enableZoom 璋冪敤瀹屾垚');
        hookIntoModelUpdate();
        generateControlPanel();
        
        // 閫氱煡 LLM 妯″潡鏇存柊鍙傛暟
        if (window.EmotionSync) {
            window.EmotionSync.updateModelConfig(modelConfig);
        }
        
        // 鏇存柊绯荤粺淇℃伅鏄剧ず
        systemInfoState.modelName = modelConfig.name;
        systemInfoState.apiProvider = getConfig('llm.provider', 'openai');
        systemInfoState.connection = false;
        renderSystemInfo();
        
        console.log('EmotionSync initialization complete');
        
    } catch (error) {
        console.error('鍔犺浇 Live2D 妯″瀷澶辫触:', error);
        loading.textContent = '妯″瀷鍔犺浇澶辫触: ' + error.message;
        loading.style.color = '#ff6b6b';
    }
}

/**
 * 鍔犺浇妯″瀷閰嶇疆锛堜粠 cdi3.json锛?
 */
async function loadModelConfig(cdi3Url) {
    try {
        const response = await fetch(cdi3Url);
        if (!response.ok) {
            console.warn('鏃犳硶鍔犺浇 cdi3.json锛屽皢浣跨敤妯″瀷榛樿鍙傛暟');
            return null;
        }
        
        const cdi3Data = await response.json();
        console.log('宸插姞杞?cdi3.json:', cdi3Data);
        
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
        console.error('鍔犺浇 cdi3.json 澶辫触:', error);
        return null;
    }
}

/**
 * 浠庢ā鍨嬩腑鎻愬彇瀹為檯鍙傛暟鑼冨洿
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
    
    console.log('鍙傛暟鑼冨洿宸叉洿鏂?', modelConfig.parameters);
}

/**
 * 鏌ユ壘 model3.json 鏂囦欢
 * 浼樺厛浣跨敤 files.json 鍒楄〃锛屽惁鍒欏皾璇曞父瑙佸懡鍚?
 */
async function findModel3Json(baseDir) {
    // 鏂规硶1: 灏濊瘯璇诲彇 files.json锛堟帹鑽愭柟寮忥級
    try {
        const response = await fetch(`${baseDir}/files.json`);
        if (response.ok) {
            const files = await response.json();
            const modelFile = files.find(f => f.endsWith('.model3.json'));
            if (modelFile) {
                console.log('浠?files.json 鎵惧埌妯″瀷:', modelFile);
                return `${baseDir}/${modelFile}`;
            }
        }
    } catch (e) {
        console.log('files.json 涓嶅瓨鍦紝灏濊瘯鍏朵粬鏂瑰紡...');
    }
    
    // 鏂规硶2: 灏濊瘯閫氱敤鍚嶇О
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
    
    // 鏂规硶3: 灏濊瘯鎵弿甯歌妯″瀷鍚嶏紙鎸夊瓧姣嶉『搴忥紝閬垮厤浼樺厛绾ч棶棰橈級
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
// 鍙傛暟鎺у埗
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
        console.warn(`鍙傛暟涓嶅瓨鍦? ${paramId}`);
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
    if (!model || !model.internalModel) return;
    
    const internalModel = model.internalModel;
    const originalUpdateParams = internalModel.updateParameters?.bind(internalModel);
    
    if (originalUpdateParams) {
        internalModel.updateParameters = function(dt, now) {
            originalUpdateParams(dt, now);
            applyParameterOverrides();
        };
        console.log('宸查挬鍏?updateParameters');
    } else {
        app.ticker.add(() => {
            applyParameterOverrides();
        }, null, PIXI.UPDATE_PRIORITY.HIGH);
        console.log('浣跨敤 ticker 杩涜鍙傛暟鏇存柊');
    }
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
// 鍔ㄦ€佺敓鎴愭帶鍒堕潰鏉?
// ============================================

function generateControlPanel() {
    const panel = document.getElementById('control-panel');
    if (!panel) return;
    
    // 鏍规嵁閰嶇疆鍐冲畾鏄惁鏄剧ず
    if (!getConfig('ui.showControlPanel', true)) {
        panel.style.display = 'none';
        return;
    }
    
    panel.innerHTML = `<h3>${t('controls.expression_panel_title', 'Expression Controls')}: ${modelConfig.name || 'Live2D'}</h3>`;
    
    const presetDiv = document.createElement('div');
    presetDiv.className = 'preset-buttons';
    presetDiv.innerHTML = `
        <button onclick="applyLocalExpression('happy')">${t('controls.preset.happy', 'Happy')}</button>
        <button onclick="applyLocalExpression('sad')">${t('controls.preset.sad', 'Sad')}</button>
        <button onclick="applyLocalExpression('surprised')">${t('controls.preset.surprised', 'Surprised')}</button>
        <button onclick="applyLocalExpression('shy')">${t('controls.preset.shy', 'Shy')}</button>
        <button onclick="applyLocalExpression('angry')">${t('controls.preset.angry', 'Angry')}</button>
        <button onclick="resetExpression()">${t('controls.preset.reset', 'Reset')}</button>
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
        'Rotation_', 'Skinning', '鎽囧姩', '杈瓙', '渚у彂'
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
// UI 浜や簰
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

    console.log('Drag support enabled');
}

/**
 * 鍚敤婊氳疆缂╂斁鍔熻兘
 */
function enableZoom() {
    console.log('========== enableZoom 鍑芥暟寮€濮嬫墽琛?==========');

    // 缁戝畾鍒板鍣ㄨ€屼笉鏄?canvas锛屽洜涓?PIXI 浼氭帴绠?canvas 鐨勪氦浜?
    const container = document.getElementById('live2d-container');

    console.log('enableZoom called');
    console.log('馃敡 container:', container);

    if (!container) {
        console.log('鉂?container 涓嶅瓨鍦紝鏃犳硶缁戝畾缂╂斁浜嬩欢');
        return;
    }

    // 绉婚櫎涔嬪墠鐨勪簨浠剁洃鍚櫒
    if (container._zoomHandler) {
        console.log('Removed previous wheel listener');
        container.removeEventListener('wheel', container._zoomHandler);
    }

    container._zoomHandler = (event) => {
        event.preventDefault();

        const currentModel = window.model;
        console.log('馃攳 婊氳疆浜嬩欢瑙﹀彂, deltaY:', event.deltaY);

        if (!currentModel) {
            console.log('Model is not available');
            return;
        }

        // 缂╂斁閫熷害
        const zoomSpeed = 0.1;
        let newScale = currentModel.scale.x;

        if (event.deltaY < 0) {
            // 鍚戜笂婊氬姩锛屾斁澶?
            newScale += zoomSpeed;
        } else {
            // 鍚戜笅婊氬姩锛岀缉灏?
            newScale -= zoomSpeed;
        }

        // 闄愬埗缂╂斁鑼冨洿 (0.1 鍒?5 鍊?
        newScale = Math.min(Math.max(newScale, 0.1), 5.0);

        // 搴旂敤缂╂斁
        currentModel.scale.set(newScale);

        console.log(`馃攳 缂╂斁瀹屾垚: ${newScale.toFixed(2)}`);
    };

    container.addEventListener('wheel', container._zoomHandler, { passive: false });

    console.log('鉁?婊氳疆缂╂斁鍔熻兘宸插惎鐢?(bindto container)');
    console.log('========== enableZoom 鍑芥暟鎵ц瀹屾瘯 ==========');
}

/**
 * 閲嶇疆妯″瀷浣嶇疆鍜岀缉鏀惧埌鍒濆鐘舵€?
 */
function resetModel() {
    const currentModel = window.model;
    if (!currentModel || !app) return;

    const container = document.getElementById('live2d-container');
    const defaultScale = getConfig('model.defaultScale', 0.8);

    // 璁＄畻鍒濆缂╂斁
    const scale = Math.min(
        container.clientWidth / currentModel.internalModel.width,
        container.clientHeight / currentModel.internalModel.height
    ) * defaultScale;

    // 閲嶇疆缂╂斁
    currentModel.scale.set(scale);

    // 閲嶇疆浣嶇疆鍒颁腑蹇?
    currentModel.x = container.clientWidth / 2;
    currentModel.y = container.clientHeight / 2;

    console.log('馃攧 妯″瀷宸查噸缃? 浣嶇疆灞呬腑, 缂╂斁=' + scale.toFixed(3));
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
    console.log('=== EmotionSync 璋冭瘯淇℃伅 ===');
    console.log('閰嶇疆:', window.EmotionSyncConfig);
    console.log('妯″瀷鍚嶇О:', modelConfig.name);
    console.log('鍙傛暟鏁伴噺:', Object.keys(modelConfig.parameters).length);
    console.log('鍙傛暟鍒楄〃:', modelConfig.parameters);
    console.log('褰撳墠瑕嗙洊:', parameterOverrides);
    console.log('============================');
}

// ============================================
// 鍒濆鍖?
// ============================================

// 娉ㄦ剰锛氫笉瑕佸湪杩欓噷鑷姩璋冪敤 initLive2D
// 鍒濆鍖栫敱 index.html 缁熶竴鎺у埗锛屼互鏀寔 WebSocket 妯″紡
// window.addEventListener('DOMContentLoaded', initLive2D);

window.addEventListener('resize', () => {
    if (app && model) {
        const container = document.getElementById('live2d-container');
        const devicePixelRatio = window.devicePixelRatio || 1;

        // 鏇存柊娓叉煋鍣ㄥ昂瀵?
        app.renderer.resize(container.clientWidth, container.clientHeight);

        // 纭繚鍒嗚鲸鐜囨纭?
        if (app.renderer.resolution !== devicePixelRatio) {
            app.renderer.resolution = devicePixelRatio;
        }
    }
});

// ============================================
// 瀵煎嚭鍏ㄥ眬 API
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
window.toggleBackground = toggleBackground;
window.toggleControlPanel = toggleControlPanel;
window.initLive2D = initLive2D;

// ============================================
// 浠庢湇鍔″櫒鍔犺浇妯″瀷
// ============================================

/**
 * 浠庢湇鍔″櫒鍔犺浇鎸囧畾妯″瀷
 * @param {Object} modelInfo - 妯″瀷淇℃伅 { name, path, directory, model_file }
 */
async function loadModelFromServer(modelInfo) {
    console.log('馃摝 浠庢湇鍔″櫒鍔犺浇妯″瀷:', modelInfo);
    
    const canvas = document.getElementById('live2d-canvas');
    const container = document.getElementById('live2d-container');
    const loading = document.getElementById('loading');
    
    // 鏄剧ず鍔犺浇鎻愮ず
    loading.style.display = 'block';
    loading.style.color = 'white';
    loading.innerHTML = `
        <div>EmotionSync</div>
        <div style="margin-top: 10px; font-size: 14px;">${t('loading.model', 'Loading model...')} ${modelInfo.name}</div>
    `;
    
    try {
        // 濡傛灉宸叉湁妯″瀷锛屽厛绉婚櫎
        if (model && app) {
            app.stage.removeChild(model);
            model.destroy();
            model = null;
        }
        
        // 鍒濆鍖?PIXI 搴旂敤锛堝鏋滆繕娌℃湁锛?
        if (!app) {
            const devicePixelRatio = window.devicePixelRatio || 1;
            app = new PIXI.Application({
                view: canvas,
                width: container.clientWidth,
                height: container.clientHeight,
                transparent: true,
                autoStart: true,
                resolution: devicePixelRatio,  // 楂樺垎杈ㄧ巼鏀寔
                autoDensity: true,             // 鑷姩璋冩暣CSS灏哄
                antialias: true                // 鎶楅敮榻?
            });
            window.PIXI = PIXI;
        }
        
        // 鏋勫缓妯″瀷璺緞 - path 宸茬粡鏄畬鏁磋矾寰勫 "l2d/amane.model3.json"
        const modelJsonUrl = modelInfo.path;
        console.log('妯″瀷 URL:', modelJsonUrl);
        
        // 鍔犺浇 cdi3.json 閰嶇疆 - 浣跨敤 directory + 鏇挎崲鍚庣紑鐨勬柟寮?
        const cdi3Url = modelJsonUrl.replace('.model3.json', '.cdi3.json');
        const cdi3Config = await loadModelConfig(cdi3Url);
        if (cdi3Config) {
            modelConfig.parameters = cdi3Config.parameters;
            modelConfig.parameterGroups = cdi3Config.parameterGroups;
            modelConfig.parts = cdi3Config.parts;
        }
        
        // 鍔犺浇 Live2D 妯″瀷锛堥厤缃珮鍒嗚鲸鐜囬€夐」锛?
        const loadOptions = {
            autoInteract: false,
        };
        model = await PIXI.live2d.Live2DModel.from(modelJsonUrl, loadOptions);
        modelConfig.name = modelInfo.name;

        // 璁剧疆绾圭悊缂╂斁妯″紡涓虹嚎鎬ф彃鍊硷紝鎻愰珮娓呮櫚搴?
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

        // 闅愯棌鍔犺浇鎻愮ず
        loading.style.display = 'none';

        // 璁剧疆妯″瀷浣嶇疆鍜岀缉鏀?
        const defaultScale = getConfig('model.defaultScale', 0.8);
        const scale = Math.min(
            container.clientWidth / model.width,
            container.clientHeight / model.height
        ) * defaultScale;

        model.scale.set(scale);
        model.anchor.set(0.5, 0.5);
        model.x = container.clientWidth / 2;
        model.y = container.clientHeight / 2;

        // 鏆撮湶鍏ㄥ眬寮曠敤
        window.model = model;

        app.stage.addChild(model);

        // 鎻愬彇鍙傛暟鑼冨洿
        parameterIndexCache = {};
        parameterOverrides = {};
        window.parameterOverrides = parameterOverrides;
        blinkLockValues = {};
        blinkLockActive = false;
        resetIdleMotionState();
        extractParameterRanges();
        detectIdleMotionGroup();
        scheduleIdleResume(320);

        // 鍚敤浜や簰
        console.log('>>> [loadModelFromServer] 鍑嗗璋冪敤 enableDragging');
        enableDragging(model);
        console.log('>>> [loadModelFromServer] enableDragging 璋冪敤瀹屾垚锛屽噯澶囪皟鐢?enableZoom');
        enableZoom();
        console.log('>>> [loadModelFromServer] enableZoom 璋冪敤瀹屾垚');
        hookIntoModelUpdate();
        
        // 鐢熸垚鎺у埗闈㈡澘
        generateControlPanel();
        
        // 閫氱煡 LLM 妯″潡鏇存柊鍙傛暟
        if (typeof updateModelConfig === 'function') {
            updateModelConfig(modelConfig);
        }
        
        // 鍚屾鍙傛暟鍒版湇鍔″櫒
        if (window.wsClient && window.wsClient.connected) {
            window.wsClient.updateParameters(modelConfig.parameters);
        }
        
        // 鏇存柊绯荤粺淇℃伅鏄剧ず
        systemInfoState.modelName = modelConfig.name;
        systemInfoState.apiProvider = getConfig('llm.provider', 'openai');
        systemInfoState.connection = !!window.wsClient?.connected;
        renderSystemInfo();
        
        console.log(`Model [${modelConfig.name}] loaded`);
        
        // 鏆撮湶鍏ㄥ眬寮曠敤
        window.model = model;
        
    } catch (error) {
        console.error('鉂?鍔犺浇妯″瀷澶辫触:', error);
        loading.textContent = '妯″瀷鍔犺浇澶辫触: ' + error.message;
        loading.style.color = '#ff6b6b';
    }
}

window.loadModelFromServer = loadModelFromServer;
window.model = model;

