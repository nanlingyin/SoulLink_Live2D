/**
 * Expression Controller - L2D 表情控制器
 * 
 * 核心功能：将 LLM 生成的表情 JSON 应用到 Live2D 模型
 * 
 * 工作流程：
 * 1. 接收表情 JSON (参数值和持续时间)
 * 2. 平滑过渡动画插值
 * 3. 应用参数到 L2D 模型
 * 4. 支持表情叠加和混合
 */

// ============ 配置 ============

/**
 * 默认动画配置
 */
const DEFAULT_ANIMATION_CONFIG = {
    defaultDuration: 800,       // 默认过渡时间 (ms)
    minDuration: 100,           // 最小过渡时间
    maxDuration: 3000,          // 最大过渡时间
    easingFunction: 'easeInOut', // 默认缓动函数
    fps: 60                     // 动画帧率
};

// ============ 缓动函数 ============

/**
 * 缓动函数集合
 */
const EASING_FUNCTIONS = {
    linear: t => t,
    easeIn: t => t * t,
    easeOut: t => t * (2 - t),
    easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: t => t * t * t,
    easeOutCubic: t => (--t) * t * t + 1,
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    bounce: t => {
        if (t < 1 / 2.75) return 7.5625 * t * t;
        if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    }
};

/**
 * 获取缓动函数
 * @param {string|Function} easing - 缓动函数名或函数
 * @returns {Function} 缓动函数
 */
function getEasing(easing) {
    if (typeof easing === 'function') return easing;
    return EASING_FUNCTIONS[easing] || EASING_FUNCTIONS.easeInOut;
}

// ============ 参数操作 ============

/**
 * 获取模型当前参数值
 * 
 * @param {Object} model - Live2D 模型实例
 * @param {string} paramId - 参数ID
 * @returns {number|null} 当前值
 */
function getParameterValue(model, paramId) {
    if (!model || !model.internalModel) return null;
    
    const coreModel = model.internalModel.coreModel;
    const paramIndex = coreModel.getParameterIndex(paramId);
    
    if (paramIndex < 0) return null;
    
    return coreModel.getParameterValue(paramIndex);
}

/**
 * 设置模型参数值
 * 
 * @param {Object} model - Live2D 模型实例
 * @param {string} paramId - 参数ID
 * @param {number} value - 目标值
 * @returns {boolean} 是否成功
 */
function setParameterValue(model, paramId, value) {
    if (!model || !model.internalModel) return false;
    
    const coreModel = model.internalModel.coreModel;
    const paramIndex = coreModel.getParameterIndex(paramId);
    
    if (paramIndex < 0) return false;
    
    coreModel.setParameterValue(paramIndex, value);
    return true;
}

/**
 * 批量设置参数值
 * 
 * @param {Object} model - Live2D 模型实例
 * @param {Object} parameters - 参数值映射 { paramId: value }
 * @returns {number} 成功设置的参数数量
 */
function setParameters(model, parameters) {
    let count = 0;
    for (const [paramId, value] of Object.entries(parameters)) {
        if (setParameterValue(model, paramId, value)) {
            count++;
        }
    }
    return count;
}

/**
 * 获取模型所有当前参数值
 * 
 * @param {Object} model - Live2D 模型实例
 * @param {Array<string>} paramIds - 要获取的参数ID列表
 * @returns {Object} 参数值映射
 */
function getCurrentParameters(model, paramIds) {
    const values = {};
    for (const paramId of paramIds) {
        const value = getParameterValue(model, paramId);
        if (value !== null) {
            values[paramId] = value;
        }
    }
    return values;
}

// ============ 动画控制 ============

/**
 * 活动动画存储
 */
const activeAnimations = new Map();
let animationIdCounter = 0;

/**
 * 创建参数过渡动画
 * 
 * @param {Object} model - Live2D 模型实例
 * @param {Object} targetParams - 目标参数值 { paramId: value }
 * @param {Object} options - 动画选项
 * @returns {Promise<void>} 动画完成的 Promise
 * 
 * @example
 * await animateParameters(model, { ParamEyeLOpen: 0.5, ParamMouthForm: 0.8 }, { duration: 500 });
 */
function animateParameters(model, targetParams, options = {}) {
    const {
        duration = DEFAULT_ANIMATION_CONFIG.defaultDuration,
        easing = DEFAULT_ANIMATION_CONFIG.easingFunction,
        onUpdate = null,
        onComplete = null
    } = options;
    
    return new Promise((resolve) => {
        // 获取当前值作为起始值
        const paramIds = Object.keys(targetParams);
        const startValues = getCurrentParameters(model, paramIds);
        
        // 计算终止值
        const endValues = { ...targetParams };
        
        const animationId = ++animationIdCounter;
        const startTime = performance.now();
        const easingFn = getEasing(easing);
        
        // 限制持续时间
        const clampedDuration = Math.max(
            DEFAULT_ANIMATION_CONFIG.minDuration,
            Math.min(DEFAULT_ANIMATION_CONFIG.maxDuration, duration)
        );
        
        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(1, elapsed / clampedDuration);
            const easedProgress = easingFn(progress);
            
            // 插值计算当前值
            const currentValues = {};
            for (const paramId of paramIds) {
                const start = startValues[paramId] ?? 0;
                const end = endValues[paramId];
                currentValues[paramId] = start + (end - start) * easedProgress;
            }
            
            // 应用参数
            setParameters(model, currentValues);
            
            // 回调
            if (onUpdate) {
                onUpdate(currentValues, progress);
            }
            
            // 继续动画或完成
            if (progress < 1) {
                const frameId = requestAnimationFrame(animate);
                activeAnimations.set(animationId, { frameId, model });
            } else {
                activeAnimations.delete(animationId);
                if (onComplete) onComplete();
                resolve();
            }
        }
        
        // 启动动画
        const frameId = requestAnimationFrame(animate);
        activeAnimations.set(animationId, { frameId, model });
    });
}

/**
 * 停止所有活动动画
 */
function stopAllAnimations() {
    for (const [id, animation] of activeAnimations) {
        cancelAnimationFrame(animation.frameId);
    }
    activeAnimations.clear();
}

/**
 * 停止指定模型的所有动画
 * 
 * @param {Object} model - Live2D 模型实例
 */
function stopModelAnimations(model) {
    for (const [id, animation] of activeAnimations) {
        if (animation.model === model) {
            cancelAnimationFrame(animation.frameId);
            activeAnimations.delete(id);
        }
    }
}

// ============ 表情应用 ============

/**
 * 应用表情 JSON 到模型
 * 
 * @param {Object} model - Live2D 模型实例
 * @param {Object} expressionJson - 表情 JSON
 * @param {Object} options - 额外选项
 * @returns {Promise<void>}
 * 
 * @example
 * await applyExpression(model, {
 *   expression: "开心",
 *   parameters: { ParamEyeLSmile: 0.8, ParamMouthForm: 0.6 },
 *   duration: 600
 * });
 */
async function applyExpression(model, expressionJson, options = {}) {
    if (!expressionJson || !expressionJson.parameters) {
        console.warn('无效的表情 JSON');
        return;
    }
    
    const {
        stopPrevious = true,
        easing = 'easeInOut'
    } = options;
    
    // 停止之前的动画
    if (stopPrevious) {
        stopModelAnimations(model);
    }
    
    const duration = expressionJson.duration || DEFAULT_ANIMATION_CONFIG.defaultDuration;
    
    await animateParameters(model, expressionJson.parameters, {
        duration,
        easing,
        ...options
    });
}

/**
 * 重置表情到默认值
 * 
 * @param {Object} model - Live2D 模型实例
 * @param {Object} defaultValues - 默认参数值映射
 * @param {Object} options - 动画选项
 * @returns {Promise<void>}
 */
async function resetExpression(model, defaultValues, options = {}) {
    const { duration = 500 } = options;
    
    stopModelAnimations(model);
    
    await animateParameters(model, defaultValues, {
        duration,
        easing: 'easeOut',
        ...options
    });
}

/**
 * 播放表情序列
 * 
 * @param {Object} model - Live2D 模型实例
 * @param {Array<Object>} expressions - 表情 JSON 序列
 * @param {Object} options - 额外选项
 * @returns {Promise<void>}
 */
async function playExpressionSequence(model, expressions, options = {}) {
    const { delayBetween = 100, loop = false } = options;
    
    do {
        for (const expr of expressions) {
            if (!expr) continue;
            
            await applyExpression(model, expr, options);
            
            // 表情之间的间隔
            if (delayBetween > 0) {
                await new Promise(resolve => setTimeout(resolve, delayBetween));
            }
        }
    } while (loop);
}

// ============ 表情混合 ============

/**
 * 混合两个表情
 * 
 * @param {Object} expr1 - 第一个表情 JSON
 * @param {Object} expr2 - 第二个表情 JSON
 * @param {number} weight - 混合权重 (0-1, 0为expr1, 1为expr2)
 * @returns {Object} 混合后的表情 JSON
 */
function blendExpressions(expr1, expr2, weight = 0.5) {
    const params1 = expr1?.parameters || {};
    const params2 = expr2?.parameters || {};
    
    // 获取所有参数
    const allParams = new Set([...Object.keys(params1), ...Object.keys(params2)]);
    
    const blended = {
        expression: `混合表情 (${weight.toFixed(2)})`,
        parameters: {},
        duration: Math.round(
            (expr1?.duration || 800) * (1 - weight) + 
            (expr2?.duration || 800) * weight
        )
    };
    
    for (const paramId of allParams) {
        const v1 = params1[paramId] ?? 0;
        const v2 = params2[paramId] ?? 0;
        blended.parameters[paramId] = v1 * (1 - weight) + v2 * weight;
    }
    
    return blended;
}

/**
 * 叠加表情 (在当前基础上添加)
 * 
 * @param {Object} baseExpr - 基础表情
 * @param {Object} overlayExpr - 叠加表情
 * @param {number} intensity - 叠加强度 (0-1)
 * @returns {Object} 叠加后的表情 JSON
 */
function overlayExpression(baseExpr, overlayExpr, intensity = 1.0) {
    const baseParams = baseExpr?.parameters || {};
    const overlayParams = overlayExpr?.parameters || {};
    
    const result = {
        expression: baseExpr?.expression || '叠加表情',
        parameters: { ...baseParams },
        duration: baseExpr?.duration || 800
    };
    
    for (const [paramId, value] of Object.entries(overlayParams)) {
        const baseValue = baseParams[paramId] ?? 0;
        result.parameters[paramId] = baseValue + (value - baseValue) * intensity;
    }
    
    return result;
}

// ============ 导出 ============

// 浏览器环境
if (typeof window !== 'undefined') {
    window.ExpressionController = {
        // 参数操作
        getParameterValue,
        setParameterValue,
        setParameters,
        getCurrentParameters,
        
        // 动画控制
        animateParameters,
        stopAllAnimations,
        stopModelAnimations,
        
        // 表情应用
        applyExpression,
        resetExpression,
        playExpressionSequence,
        
        // 表情混合
        blendExpressions,
        overlayExpression,
        
        // 缓动函数
        EASING_FUNCTIONS,
        getEasing,
        
        // 配置
        DEFAULT_ANIMATION_CONFIG
    };
}

// ES Module 导出
export {
    getParameterValue,
    setParameterValue,
    setParameters,
    getCurrentParameters,
    animateParameters,
    stopAllAnimations,
    stopModelAnimations,
    applyExpression,
    resetExpression,
    playExpressionSequence,
    blendExpressions,
    overlayExpression,
    EASING_FUNCTIONS,
    getEasing,
    DEFAULT_ANIMATION_CONFIG
};
