/**
 * SoulLink_Live2D - AI 驱动的 Live2D 表情控制系统
 * LLM 表情生成模块 - 通用版本
 */

// ============ 配置（从 config.yaml 加载） ============

// 动态参数配置（从模型加载后更新）
let AVAILABLE_PARAMETERS = {};

// 通用表情参数映射（用于将通用表情映射到具体模型参数）
const EXPRESSION_PARAM_MAPPING = {
    eyeOpenL: ['ParamEyeLOpen', 'ParamEyeL_Open', 'EyeLOpen'],
    eyeOpenR: ['ParamEyeROpen', 'ParamEyeR_Open', 'EyeROpen'],
    eyeSmileL: ['ParamEyeLSmile', 'ParamEyeL_Smile', 'EyeLSmile'],
    eyeSmileR: ['ParamEyeRSmile', 'ParamEyeR_Smile', 'EyeRSmile'],
    eyeBallX: ['ParamEyeBallX', 'ParamEyeBall_X', 'EyeBallX'],
    eyeBallY: ['ParamEyeBallY', 'ParamEyeBall_Y', 'EyeBallY'],
    browLY: ['ParamBrowLY', 'ParamBrowL_Y', 'BrowLY'],
    browRY: ['ParamBrowRY', 'ParamBrowR_Y', 'BrowRY'],
    browLAngle: ['ParamBrowLAngle', 'ParamBrowL_Angle', 'BrowLAngle'],
    browRAngle: ['ParamBrowRAngle', 'ParamBrowR_Angle', 'BrowRAngle'],
    mouthOpen: ['ParamMouthOpenY', 'ParamMouth_OpenY', 'MouthOpenY'],
    mouthForm: ['ParamMouthForm', 'ParamMouth_Form', 'MouthForm'],
    cheek: ['ParamCheek', 'Cheek'],
    angleX: ['ParamAngleX', 'ParamAngleX2', 'AngleX'],
    angleY: ['ParamAngleY', 'ParamAngleY2', 'AngleY'],
    angleZ: ['ParamAngleZ', 'AngleZ'],
    bodyAngleX: ['ParamBodyAngleX', 'BodyAngleX'],
    bodyAngleY: ['ParamBodyAngleY', 'BodyAngleY'],
    bodyAngleZ: ['ParamBodyAngleZ', 'BodyAngleZ']
};

/**
 * 获取 LLM 配置（从全局配置读取）
 */
function getLLMConfig() {
    const config = window.SoulLinkConfig?.llm || {};
    return {
        apiKey: config.apiKey || '',
        baseUrl: config.baseUrl || 'https://api.openai.com/v1',
        model: config.model || 'gpt-4o-mini',
        temperature: config.temperature || 0.7,
        maxTokens: config.maxTokens || 500
    };
}

/**
 * 获取动画配置
 */
function getAnimationConfig() {
    const config = window.SoulLinkConfig?.animation || {};
    return {
        defaultDuration: config.defaultDuration || 800,
        easing: config.easing || 'easeInOutCubic',
        autoResetDelay: config.autoResetDelay || 1500
    };
}

/**
 * 从模型配置更新可用参数
 */
function updateModelConfig(config) {
    if (!config || !config.parameters) return;
    
    AVAILABLE_PARAMETERS = {};
    
    for (const [paramId, paramInfo] of Object.entries(config.parameters)) {
        if (isPhysicsParam(paramId)) continue;
        
        AVAILABLE_PARAMETERS[paramId] = {
            min: paramInfo.min ?? -30,
            max: paramInfo.max ?? 30,
            default: paramInfo.default ?? 0,
            description: paramInfo.name || paramId
        };
    }
    
    console.log('SoulLink: 参数配置已更新', AVAILABLE_PARAMETERS);
}

function isPhysicsParam(paramId) {
    const physicsKeywords = [
        'Hair', 'Ribbon', 'Skirt', 'Bust', 'Sway', 
        'Rotation_', 'Skinning', '摇动', '辫子', '侧发',
        'Breath'
    ];
    return physicsKeywords.some(keyword => paramId.includes(keyword));
}

function findParamId(genericName) {
    const possibleIds = EXPRESSION_PARAM_MAPPING[genericName] || [genericName];
    
    for (const id of possibleIds) {
        if (AVAILABLE_PARAMETERS[id]) {
            return id;
        }
    }
    
    if (AVAILABLE_PARAMETERS[genericName]) {
        return genericName;
    }
    
    return null;
}

function generateSystemPrompt() {
    const paramDescriptions = Object.entries(AVAILABLE_PARAMETERS)
        .map(([id, info]) => `  - ${id}: ${info.description}, 范围[${info.min}, ${info.max}]`)
        .join('\n');
    
    if (!paramDescriptions) {
        return '模型参数尚未加载，请稍后再试。';
    }
    
    return `你是一个 Live2D 虚拟形象的表情控制器。根据场景、对话或情感描述，生成表情参数。

当前模型可用参数：
${paramDescriptions}

返回JSON格式：
{
  "expression": "表情描述",
  "parameters": {
    "参数ID": 数值,
    ...
  },
  "duration": 过渡时间毫秒数
}

要求：
1. 参数值要足够大，让表情变化明显可见
2. 充分组合多个参数来表达丰富表情
3. 眼睛、眉毛、嘴巴的配合对表情很重要
4. 只返回JSON，不要其他文字`;
}

// ============ API 调用 ============

function setApiKey(apiKey) {
    if (window.SoulLinkConfig) {
        window.SoulLinkConfig.llm.apiKey = apiKey;
    }
    console.log('已设置 API Key');
}

function setApiBaseUrl(baseUrl) {
    if (window.SoulLinkConfig) {
        window.SoulLinkConfig.llm.baseUrl = baseUrl;
    }
    console.log(`已设置 API Base URL: ${baseUrl}`);
}

function setModel(modelName) {
    if (window.SoulLinkConfig) {
        window.SoulLinkConfig.llm.model = modelName;
    }
    console.log(`已设置模型: ${modelName}`);
}

async function callLLMForExpression(input, context = '') {
    const config = getLLMConfig();
    
    if (!config.apiKey || config.apiKey === 'your-api-key-here') {
        throw new Error('请先在 config.yaml 中设置 API Key，或使用 setApiKey("your-api-key")');
    }
    
    if (Object.keys(AVAILABLE_PARAMETERS).length === 0) {
        throw new Error('模型参数尚未加载，请等待模型加载完成');
    }
    
    const userMessage = context 
        ? `场景背景：${context}\n\n当前输入：${input}`
        : input;
    
    const requestBody = {
        model: config.model,
        messages: [
            { role: 'system', content: generateSystemPrompt() },
            { role: 'user', content: userMessage }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens
    };
    
    console.log(`正在调用 LLM API (${config.model})...`);
    
    try {
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API 请求失败: ${response.status} - ${error}`);
        }
        
        const data = await response.json();
        const content = data.choices[0].message.content;
        
        console.log('LLM 返回:', content);
        
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('无法解析 LLM 返回的 JSON');
        }
        
        return JSON.parse(jsonMatch[0]);
        
    } catch (error) {
        console.error('LLM API 调用失败:', error);
        throw error;
    }
}

// ============ 动画系统 ============

const easingFunctions = {
    linear: t => t,
    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: t => t * t * t,
    easeOutCubic: t => (--t) * t * t + 1,
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2
};

let currentAnimation = null;
let autoResetTimer = null;

async function transitionToExpression(targetParams, duration = null, easing = null, autoReset = false, resetDelay = null) {
    const animConfig = getAnimationConfig();
    
    // 使用传入值或配置文件中的默认值
    duration = duration ?? animConfig.defaultDuration;
    easing = easing ?? animConfig.easing;
    resetDelay = resetDelay ?? animConfig.autoResetDelay;
    
    if (currentAnimation) {
        currentAnimation.cancelled = true;
    }
    if (autoResetTimer) {
        clearTimeout(autoResetTimer);
        autoResetTimer = null;
    }
    
    const animation = { cancelled: false };
    currentAnimation = animation;
    
    const startParams = {};
    for (const paramId of Object.keys(targetParams)) {
        startParams[paramId] = window.getParameterValue?.(paramId) 
            ?? window.parameterOverrides?.[paramId] 
            ?? AVAILABLE_PARAMETERS[paramId]?.default 
            ?? 0;
    }
    
    const easingFn = easingFunctions[easing] || easingFunctions.easeInOutCubic;
    const startTime = performance.now();
    
    return new Promise((resolve) => {
        function animate(currentTime) {
            if (animation.cancelled) {
                resolve(false);
                return;
            }
            
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easingFn(progress);
            
            for (const [paramId, targetValue] of Object.entries(targetParams)) {
                const startValue = startParams[paramId];
                const currentValue = startValue + (targetValue - startValue) * easedProgress;
                
                if (window.setParameter) {
                    window.setParameter(paramId, currentValue);
                }
                if (window.updateSliderUI) {
                    window.updateSliderUI(paramId, currentValue);
                }
            }
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                currentAnimation = null;
                
                if (autoReset) {
                    autoResetTimer = setTimeout(() => {
                        console.log('自动重置表情');
                        resetToDefault(duration);
                    }, resetDelay);
                }
                
                resolve(true);
            }
        }
        
        requestAnimationFrame(animate);
    });
}

// ============ 主要接口 ============

/**
 * 通过服务器 WebSocket 调用 LLM（推荐方式，无需在前端暴露 API Key）
 */
async function callLLMViaServer(message, context = '', autoReset = true) {
    if (window.wsClient && window.wsClient.connected) {
        return new Promise((resolve, reject) => {
            // 保存原回调
            const originalExpressionCallback = window.wsClient.onExpression;
            const originalErrorCallback = window.wsClient.onError;
            let timeoutId = null;
            let settled = false;
            
            // 清理函数
            const cleanup = () => {
                if (settled) return;
                settled = true;
                if (timeoutId) clearTimeout(timeoutId);
                window.wsClient.onExpression = originalExpressionCallback;
                window.wsClient.onError = originalErrorCallback;
            };
            
            // 设置表情回调
            window.wsClient.onExpression = (msg) => {
                cleanup();
                
                if (msg.parameters) {
                    // 应用表情
                    const animConfig = getAnimationConfig();
                    transitionToExpression(
                        msg.parameters,
                        msg.duration || animConfig.defaultDuration,
                        null,
                        msg.autoReset ?? autoReset
                    );
                    resolve({
                        expression: msg.expression || '',
                        parameters: msg.parameters,
                        duration: msg.duration
                    });
                } else {
                    reject(new Error('服务器返回的表情数据无效'));
                }
            };
            
            // 设置错误回调
            window.wsClient.onError = (error) => {
                cleanup();
                const errorMsg = error instanceof Error ? error.message : String(error);
                reject(new Error(`服务器错误: ${errorMsg}`));
            };
            
            // 发送聊天请求
            const sent = window.wsClient.chat(message, context, autoReset);
            if (!sent) {
                cleanup();
                reject(new Error('WebSocket 发送失败'));
                return;
            }
            
            // 超时处理
            timeoutId = setTimeout(() => {
                if (!settled) {
                    cleanup();
                    reject(new Error('LLM 调用超时（30秒）'));
                }
            }, 30000);
        });
    }
    return null; // 表示没有通过服务器调用
}

async function generateAndApplyExpression(input, context = '', autoReset = true) {
    try {
        // 优先通过服务器调用（推荐，无需暴露 API Key）
        const serverResult = await callLLMViaServer(input, context, autoReset);
        if (serverResult) {
            console.log(`[服务器] 应用表情: ${serverResult.expression}`);
            return serverResult;
        }
        
        // 回退到前端直接调用（需要 API Key）
        console.log('[前端] 直接调用 LLM API...');
        const result = await callLLMForExpression(input, context);
        
        console.log(`应用表情: ${result.expression}`);
        console.log('参数:', result.parameters);
        
        const validatedParams = {};
        for (const [paramId, value] of Object.entries(result.parameters)) {
            const paramInfo = AVAILABLE_PARAMETERS[paramId];
            if (paramInfo) {
                validatedParams[paramId] = Math.max(paramInfo.min, Math.min(paramInfo.max, value));
            } else {
                console.warn(`未知参数: ${paramId}`);
            }
        }
        
        const animConfig = getAnimationConfig();
        const duration = result.duration || animConfig.defaultDuration;
        await transitionToExpression(validatedParams, duration, null, autoReset);
        
        return result;
        
    } catch (error) {
        console.error('生成表情失败:', error);
        throw error;
    }
}

async function reactTo(text, autoReset = true) {
    const message = `角色听到/看到了这句话，请生成合适的表情反应: "${text}"`;
    return generateAndApplyExpression(message, '', autoReset);
}

async function showEmotion(emotion, autoReset = true) {
    return generateAndApplyExpression(`请生成表达"${emotion}"情感的表情`, '', autoReset);
}

async function speakWithEmotion(dialogue, emotion = '', autoReset = true) {
    const input = emotion 
        ? `角色正在说这句话: "${dialogue}"，情感是: ${emotion}`
        : `角色正在说这句话: "${dialogue}"，请推断合适的表情`;
    return generateAndApplyExpression(input, '', autoReset);
}

async function resetToDefault(duration = null) {
    const animConfig = getAnimationConfig();
    duration = duration ?? animConfig.defaultDuration;
    
    const defaultParams = {};
    for (const [paramId, info] of Object.entries(AVAILABLE_PARAMETERS)) {
        defaultParams[paramId] = info.default;
    }
    
    if (window.clearAllOverrides) {
        window.clearAllOverrides();
    }
    
    return transitionToExpression(defaultParams, duration);
}

// ============ 本地预设表情 ============

function buildExpression(config) {
    const params = {};
    
    for (const [genericName, value] of Object.entries(config)) {
        const paramId = findParamId(genericName);
        if (paramId) {
            params[paramId] = value;
        }
    }
    
    return params;
}

const LOCAL_EXPRESSIONS = {
    happy: () => buildExpression({
        eyeOpenL: 0.9, eyeOpenR: 0.9,
        eyeSmileL: 0.7, eyeSmileR: 0.7,
        mouthForm: 0.8,
        browLY: 0.3, browRY: 0.3
    }),
    sad: () => buildExpression({
        eyeOpenL: 0.6, eyeOpenR: 0.6,
        eyeSmileL: 0, eyeSmileR: 0,
        mouthForm: -0.5,
        browLY: -0.5, browRY: -0.5
    }),
    angry: () => buildExpression({
        eyeOpenL: 0.8, eyeOpenR: 0.8,
        mouthForm: -0.3,
        browLY: -0.7, browRY: -0.7,
        browLAngle: -0.5, browRAngle: -0.5
    }),
    surprised: () => buildExpression({
        eyeOpenL: 1, eyeOpenR: 1,
        mouthOpen: 0.6,
        browLY: 0.8, browRY: 0.8
    }),
    shy: () => buildExpression({
        eyeOpenL: 0.7, eyeOpenR: 0.7,
        eyeSmileL: 0.4, eyeSmileR: 0.4,
        mouthForm: 0.3,
        cheek: 0.8,
        angleZ: -5
    }),
    thinking: () => buildExpression({
        eyeOpenL: 0.8, eyeOpenR: 0.8,
        eyeBallX: 0.5, eyeBallY: 0.3,
        browLY: 0.2, browRY: -0.1,
        angleZ: 5
    }),
    sleepy: () => buildExpression({
        eyeOpenL: 0.3, eyeOpenR: 0.3,
        mouthOpen: 0.4,
        browLY: -0.2, browRY: -0.2,
        angleY: -5
    }),
    wink: () => buildExpression({
        eyeOpenL: 0, eyeOpenR: 1,
        eyeSmileL: 1,
        mouthForm: 0.5
    })
};

async function applyLocalExpression(expressionName, duration = null, autoReset = false, resetDelay = null) {
    const exprBuilder = LOCAL_EXPRESSIONS[expressionName];
    if (!exprBuilder) {
        console.error(`未知表情: ${expressionName}`);
        console.log('可用表情:', Object.keys(LOCAL_EXPRESSIONS).join(', '));
        return;
    }
    
    const params = exprBuilder();
    if (Object.keys(params).length === 0) {
        console.warn('当前模型不支持此表情的参数');
        return;
    }
    
    console.log(`应用本地表情: ${expressionName}`, params);
    return transitionToExpression(params, duration, null, autoReset, resetDelay);
}

function cancelAutoReset() {
    if (autoResetTimer) {
        clearTimeout(autoResetTimer);
        autoResetTimer = null;
        console.log('已取消自动重置');
    }
}

// ============ 导出 ============

window.SoulLink = {
    setApiKey,
    setApiBaseUrl,
    setModel,
    updateModelConfig,
    get config() { return getLLMConfig(); },
    
    generateAndApplyExpression,
    reactTo,
    showEmotion,
    speakWithEmotion,
    
    transitionToExpression,
    resetToDefault,
    cancelAutoReset,
    
    applyLocalExpression,
    localExpressions: Object.keys(LOCAL_EXPRESSIONS),
    
    get availableParameters() { return AVAILABLE_PARAMETERS; }
};

window.setApiKey = setApiKey;
window.reactTo = reactTo;
window.showEmotion = showEmotion;
window.speakWithEmotion = speakWithEmotion;
window.applyLocalExpression = applyLocalExpression;
window.transitionToExpression = transitionToExpression;
window.resetExpression = resetToDefault;
window.cancelAutoReset = cancelAutoReset;

console.log('SoulLink LLM 模块已加载');
console.log('配置文件: config.yaml');
console.log('使用方法:');
console.log('  1. 在 config.yaml 中设置 API Key');
console.log('  2. 生成表情: reactTo("你好呀！") 或 showEmotion("开心")');
console.log('  3. 本地表情: applyLocalExpression("happy")');
