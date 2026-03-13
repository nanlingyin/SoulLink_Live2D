// ============================================
// SoulLink Live2D - Parameter Control
// 参数索引、获取、设置、覆盖、眨眼锁定
// ============================================

console.log('🔧 param-control.js 已加载');

/**
 * 获取参数索引
 */
function getParameterIndex(paramId) {
    if (paramId in parameterIndexCache) {
        return parameterIndexCache[paramId];
    }
    return -1;
}

/**
 * 获取参数当前值
 */
function getParameterValue(paramId) {
    const coreModel = model?.internalModel?.coreModel;
    if (!coreModel || !coreModel._model) return null;

    const index = getParameterIndex(paramId);
    if (index < 0) return null;

    return coreModel._model.parameters.values[index];
}

/**
 * 判断是否为眼睛睁开参数
 */
function isEyeOpenParameter(paramId) {
    const id = String(paramId || '').toLowerCase();
    return EYE_OPEN_PARAM_HINTS.every(hint => id.includes(hint));
}

/**
 * 捕获眨眼锁定值
 */
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

/**
 * 设置眨眼锁定
 */
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

/**
 * 设置参数值
 */
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

/**
 * 钩入模型更新
 */
function hookIntoModelUpdate() {
    if (!model) return;

    // 钩入 model.update() 而不是 internalModel.updateParameters
    // 这确保我们的参数覆盖在所有内部更新之后应用
    const originalUpdate = model.update.bind(model);

    model.update = function(deltaTime) {
        // 调用原始更新（包括 motionManager、physics 等）
        originalUpdate(deltaTime);

        // 在所有内部更新之后应用我们的参数覆盖
        applyParameterOverrides();
    };

    console.log('Hooked into model.update()');
}

/**
 * 应用参数覆盖
 */
function applyParameterOverrides() {
    const hasGeneratedMotionLock = generatedMotionLocks.size > 0;
    if (Object.keys(parameterOverrides).length === 0 && !blinkLockActive && !hasGeneratedMotionLock) return;

    const coreModel = model?.internalModel?.coreModel;
    if (!coreModel || !coreModel._model) return;

    const values = coreModel._model.parameters.values;

    // 在生成的动画锁定激活时保持抑制空闲动画
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

/**
 * 清除所有覆盖
 */
function clearAllOverrides() {
    parameterOverrides = {};
    window.parameterOverrides = parameterOverrides;
    console.log('🧹 已清理全部参数覆盖');
}

/**
 * 获取可用参数列表
 */
function getAvailableParameters() {
    return Object.values(modelConfig.parameters);
}

// ============================================
// 全局导出
// ============================================

window.setParameter = setParameter;
window.getParameterValue = getParameterValue;
window.getAvailableParameters = getAvailableParameters;
window.clearAllOverrides = clearAllOverrides;
window.setBlinkLock = setBlinkLock;
window.parameterOverrides = parameterOverrides;
