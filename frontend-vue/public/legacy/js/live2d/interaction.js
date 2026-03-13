// ============================================
// SoulLink Live2D - Interaction
// 模型拖拽、缩放、重置、背景切换、窗口缩放
// ============================================

console.log('🔧 interaction.js 已加载');

/**
 * 启用模型拖拽
 */
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
    const container = document.getElementById('live2d-container');

    if (!container) {
        console.log('enableZoom: container not found');
        return;
    }

    // 移除之前的事件监听器
    if (container._zoomHandler) {
        container.removeEventListener('wheel', container._zoomHandler);
    }

    container._zoomHandler = (event) => {
        event.preventDefault();

        const currentModel = window.model;

        if (!currentModel) {
            return;
        }

        // 缩放速度
        const zoomSpeed = 0.1;
        let newScale = currentModel.scale.x;

        if (event.deltaY < 0) {
            newScale += zoomSpeed;
        } else {
            newScale -= zoomSpeed;
        }

        // 不限制缩放范围
        newScale = Math.max(newScale, 0.01);

        // 应用缩放
        currentModel.scale.set(newScale);
        syncPositionControlsFromModel();
    };

    container.addEventListener('wheel', container._zoomHandler, { passive: false });
    console.log('Zoom support enabled');
}

/**
 * 重置模型位置和缩放
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
}

/**
 * 切换背景
 */
function toggleBackground() {
    currentBgIndex = (currentBgIndex + 1) % backgrounds.length;
    document.body.style.background = backgrounds[currentBgIndex];
}

/**
 * 切换控制面板显示
 */
function toggleControlPanel() {
    const panel = document.getElementById('control-panel');
    controlPanelVisible = !controlPanelVisible;
    panel.style.display = controlPanelVisible ? 'block' : 'none';
}

/**
 * 更新滑块UI
 */
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

/**
 * 调试模型信息
 */
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
// 窗口缩放响应
// ============================================

window.addEventListener('resize', () => {
    if (app && model) {
        const container = document.getElementById('live2d-container');
        const devicePixelRatio = window.devicePixelRatio || 1;

        app.renderer.resize(container.clientWidth, container.clientHeight);

        if (app.renderer.resolution !== devicePixelRatio) {
            app.renderer.resolution = devicePixelRatio;
        }
    }
});

// ============================================
// 全局导出
// ============================================

window.resetModel = resetModel;
window.toggleBackground = toggleBackground;
window.toggleControlPanel = toggleControlPanel;
window.updateSliderUI = updateSliderUI;
window.debugModel = debugModel;
