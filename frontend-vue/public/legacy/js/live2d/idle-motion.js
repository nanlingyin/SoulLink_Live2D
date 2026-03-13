// ============================================
// SoulLink Live2D - Idle Motion Management
// 空闲动画检测、启动、停止、恢复管理
// ============================================

console.log('🔧 idle-motion.js 已加载');

/**
 * 获取动作映射表
 */
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

/**
 * 检测空闲动画组
 */
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

/**
 * 停止空闲动画
 */
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

/**
 * 启动空闲动画（如果可用）
 */
function startIdleMotionIfAvailable() {
    if (!model || !model.internalModel) return false;
    if (generatedMotionLocks.size > 0) return false;

    // 防抖：防止在500ms内频繁启动空闲动画
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

/**
 * 调度空闲动画恢复
 */
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

/**
 * 为生成的动画暂停空闲动画
 */
function pauseIdleForGeneratedMotion(token = 'default') {
    const key = String(token || 'default');
    generatedMotionLocks.add(key);
    if (idleResumeTimer) {
        clearTimeout(idleResumeTimer);
        idleResumeTimer = null;
    }

    // 不要立即停止空闲动画 - 让它自然淡出
    // 第一个动画帧将从空闲状态平滑过渡
    // 只在短暂延迟后停止空闲动画以允许平滑过渡
    setTimeout(() => {
        if (generatedMotionLocks.size > 0) {
            stopIdleMotion();
            console.log('[Motion] Stopped idle motion after transition delay');
        }
    }, 200);

    // 在生成的动画期间禁用自动眨眼
    if (model?.internalModel?.eyeBlink) {
        delete model.internalModel.eyeBlink;
        console.log('[Motion] Disabled auto eye blink');
    }
}

/**
 * 为生成的动画恢复空闲动画
 */
function resumeIdleForGeneratedMotion(token = 'default') {
    const key = String(token || 'default');
    generatedMotionLocks.delete(key);
    if (generatedMotionLocks.size === 0) {
        scheduleIdleResume(180);

        // 在生成的动画结束后重新启用自动眨眼
        // 注意：eyeBlink 将在下次模型更新时由 Live2D 自动重新创建
        // 我们只需要确保它没有被明确禁用
        console.log('[Motion] Auto eye blink will resume on next update');
    }
}

/**
 * 重置空闲动画状态
 */
function resetIdleMotionState() {
    generatedMotionLocks.clear();
    idleMotionGroup = null;
    if (idleResumeTimer) {
        clearTimeout(idleResumeTimer);
        idleResumeTimer = null;
    }
}

// ============================================
// 全局导出
// ============================================

window.pauseIdleForGeneratedMotion = pauseIdleForGeneratedMotion;
window.resumeIdleForGeneratedMotion = resumeIdleForGeneratedMotion;
