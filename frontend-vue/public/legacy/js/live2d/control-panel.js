// ============================================
// SoulLink Live2D - Control Panel UI
// 控制面板生成、可折叠区域、位置控制、拖拽输入
// ============================================

console.log('🔧 control-panel.js 已加载');

/**
 * 创建可折叠区域组件
 */
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

/**
 * 生成控制面板
 */
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

/**
 * 创建位置控制区域
 */
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

/**
 * 同步位置控制值从模型
 */
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

/**
 * 初始化位置输入监听器
 */
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

/**
 * 初始化拖拽输入框
 */
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

/**
 * 创建遮罩控制区域
 */
function createOcclusionControlSection() {
    const section = createCollapsibleSection('遮罩控制', false);

    // 模式切换（按钮组）
    const modeRow = document.createElement('div');
    modeRow.className = 'occlusion-mode-bar';
    modeRow.innerHTML = `
        <button class="mode-btn active" data-mode="none">关闭</button>
        <button class="mode-btn" data-mode="polygon">多边形</button>
        <button class="mode-btn" data-mode="ai">AI 蒙版</button>
    `;
    section.content.appendChild(modeRow);

    // 多边形模式控制
    const polyControls = document.createElement('div');
    polyControls.id = 'polygon-mask-controls';
    polyControls.className = 'occlusion-sub-panel';
    polyControls.style.display = 'none';
    polyControls.innerHTML = `
        <div class="param-item">
            <label>节点数量 <span id="node-count-val">12</span></label>
            <input type="range" id="node-count-slider" min="3" max="60" step="1" value="12">
        </div>
        <div class="param-item">
            <label>垂直偏移 <span id="mask-offset-val">0</span></label>
            <input type="range" id="mask-offset-slider" min="-300" max="300" step="1" value="0">
        </div>
        <div class="toggle-row">
            <label class="toggle-label"><input type="checkbox" id="mask-show-handles" checked> 节点</label>
            <label class="toggle-label"><input type="checkbox" id="mask-show-line" checked> 轮廓</label>
            <label class="toggle-label"><input type="checkbox" id="mask-enable-drag"> 拖拽</label>
            <label class="toggle-label"><input type="checkbox" id="mask-add-node-mode"> 加点</label>
        </div>
        <div class="action-btn-row">
            <button id="mask-auto-estimate-btn" class="action-btn">自动估计</button>
            <button id="mask-reset-btn" class="action-btn danger">重置</button>
        </div>
    `;
    section.content.appendChild(polyControls);

    // AI蒙版控制
    const aiControls = document.createElement('div');
    aiControls.id = 'ai-mask-controls';
    aiControls.className = 'occlusion-sub-panel';
    aiControls.style.display = 'none';
    aiControls.innerHTML = `
        <button id="ai-extract-btn" class="action-btn accent full-width">提取前景蒙版</button>
        <div id="ai-mask-status" class="status-text"></div>
        <div class="toggle-row">
            <label class="toggle-label"><input type="checkbox" id="ai-show-outline" checked> 显示轮廓线</label>
        </div>
    `;
    section.content.appendChild(aiControls);

    // 延迟绑定事件
    setTimeout(() => _bindOcclusionEvents(), 0);

    return section.wrapper;
}

/**
 * 绑定遮罩控制事件
 */
function _bindOcclusionEvents() {
    const modeBar = document.querySelector('.occlusion-mode-bar');
    const polyControls = document.getElementById('polygon-mask-controls');
    const aiControls = document.getElementById('ai-mask-controls');

    if (modeBar) {
        const modeBtns = modeBar.querySelectorAll('.mode-btn');
        // 恢复当前模式
        modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === (occlusionMode || 'none'));
            btn.addEventListener('click', () => {
                modeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const mode = btn.dataset.mode;
                polyControls.style.display = mode === 'polygon' ? '' : 'none';
                aiControls.style.display = mode === 'ai' ? '' : 'none';
                if (typeof enableOcclusionMode === 'function') {
                    enableOcclusionMode(mode);
                }
            });
        });
        // 初始状态
        polyControls.style.display = occlusionMode === 'polygon' ? '' : 'none';
        aiControls.style.display = occlusionMode === 'ai' ? '' : 'none';
    }

    // 多边形控制
    const nodeSlider = document.getElementById('node-count-slider');
    const nodeVal = document.getElementById('node-count-val');
    if (nodeSlider) {
        nodeSlider.addEventListener('input', () => {
            nodeVal.textContent = nodeSlider.value;
            const count = parseInt(nodeSlider.value);
            if (occlusionState.topEdgePoints.length >= 2) {
                occlusionState.topEdgePoints = resamplePolyline(occlusionState.topEdgePoints, count);
                redrawOcclusionMask(true);
            }
        });
    }

    const offsetSlider = document.getElementById('mask-offset-slider');
    const offsetVal = document.getElementById('mask-offset-val');
    if (offsetSlider) {
        offsetSlider.value = occlusionState.offsetY || 0;
        offsetSlider.addEventListener('input', () => {
            offsetVal.textContent = offsetSlider.value;
            occlusionState.offsetY = parseInt(offsetSlider.value);
            redrawOcclusionMask(false);
        });
    }

    const showHandles = document.getElementById('mask-show-handles');
    if (showHandles) {
        showHandles.checked = occlusionState.showHandles;
        showHandles.addEventListener('change', () => {
            occlusionState.showHandles = showHandles.checked;
            redrawOcclusionMask(false);
        });
    }

    const showLine = document.getElementById('mask-show-line');
    if (showLine) {
        showLine.checked = occlusionState.showMaskLine;
        showLine.addEventListener('change', () => {
            occlusionState.showMaskLine = showLine.checked;
            redrawOcclusionMask(false);
        });
    }

    const enableDrag = document.getElementById('mask-enable-drag');
    if (enableDrag) {
        enableDrag.checked = occlusionState.enableMaskDrag;
        enableDrag.addEventListener('change', () => {
            occlusionState.enableMaskDrag = enableDrag.checked;
            redrawOcclusionMask(false);
        });
    }

    const addNodeMode = document.getElementById('mask-add-node-mode');
    if (addNodeMode) {
        addNodeMode.checked = occlusionState.addNodeMode;
        addNodeMode.addEventListener('change', () => {
            occlusionState.addNodeMode = addNodeMode.checked;
        });
    }

    const autoBtn = document.getElementById('mask-auto-estimate-btn');
    if (autoBtn) {
        autoBtn.addEventListener('click', () => {
            try {
                const count = parseInt(nodeSlider?.value) || 12;
                const edge = autoEstimateTopEdge(count);
                occlusionState.topEdgePoints = edge;
                redrawOcclusionMask(true);
            } catch (e) {
                console.warn('自动估计失败:', e.message);
            }
        });
    }

    const resetBtn = document.getElementById('mask-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            occlusionState.topEdgePoints = [];
            occlusionState.offsetY = 0;
            if (offsetSlider) { offsetSlider.value = 0; offsetVal.textContent = '0'; }
            enableOcclusionMode('polygon');
        });
    }

    // AI蒙版
    const aiBtn = document.getElementById('ai-extract-btn');
    const aiStatus = document.getElementById('ai-mask-status');
    const aiShowOutline = document.getElementById('ai-show-outline');

    if (aiShowOutline) {
        aiShowOutline.checked = occlusionState.showAIOutline;
        aiShowOutline.addEventListener('change', () => {
            occlusionState.showAIOutline = aiShowOutline.checked;
            if (typeof _drawAIMaskOutline === 'function' && occlusionState.extractedMaskTexture) {
                _drawAIMaskOutline();
            }
        });
    }

    if (aiBtn) {
        aiBtn.addEventListener('click', async () => {
            if (!bgSprite) {
                if (aiStatus) aiStatus.textContent = '请先上传背景图';
                return;
            }
            aiBtn.disabled = true;
            if (aiStatus) aiStatus.textContent = '提取中...';
            try {
                await extractAndApplyAIMask();
                if (aiStatus) aiStatus.textContent = '蒙版已应用';
            } catch (e) {
                console.error('AI蒙版提取失败:', e);
                if (aiStatus) aiStatus.textContent = '失败: ' + e.message;
            } finally {
                aiBtn.disabled = false;
            }
        });
    }
}

// PLACEHOLDER_OCCLUSION_CONTROL_END

/**
 * 创建环境光照控制区域
 */
function createAmbientLightingSection() {
    const section = createCollapsibleSection('环境光照', false);

    section.content.innerHTML = `
        <div class="toggle-row" style="margin-bottom:8px;">
            <label class="toggle-label"><input type="checkbox" id="ambient-enabled"> 启用环境光照</label>
        </div>
        <div id="ambient-controls" class="occlusion-sub-panel" style="display:none;">
            <div class="param-item">
                <label>效果强度 <span id="ambient-intensity-val">0.50</span></label>
                <input type="range" id="ambient-intensity" min="0" max="1" step="0.05" value="0.5">
            </div>
            <div class="param-item">
                <label>平滑度 <span id="ambient-smoothing-val">0.30</span></label>
                <input type="range" id="ambient-smoothing" min="0.05" max="1" step="0.05" value="0.3">
            </div>
            <div class="ambient-grid">
                <div class="ambient-card">
                    <div class="toggle-row">
                        <label class="toggle-label"><input type="checkbox" id="ambient-colortemp" checked> 色温</label>
                    </div>
                    <div class="param-item compact">
                        <input type="range" id="ambient-colortemp-str" min="0" max="2" step="0.1" value="1.0">
                        <span class="range-val" id="ambient-colortemp-str-val">1.00</span>
                    </div>
                </div>
                <div class="ambient-card">
                    <div class="toggle-row">
                        <label class="toggle-label"><input type="checkbox" id="ambient-brightness" checked> 亮度</label>
                    </div>
                    <div class="param-item compact">
                        <input type="range" id="ambient-brightness-str" min="0" max="2" step="0.1" value="1.0">
                        <span class="range-val" id="ambient-brightness-str-val">1.00</span>
                    </div>
                </div>
                <div class="ambient-card">
                    <div class="toggle-row">
                        <label class="toggle-label"><input type="checkbox" id="ambient-contrast"> 对比度</label>
                    </div>
                    <div class="param-item compact">
                        <input type="range" id="ambient-contrast-str" min="0" max="1" step="0.05" value="0.3">
                        <span class="range-val" id="ambient-contrast-str-val">0.30</span>
                    </div>
                </div>
                <div class="ambient-card">
                    <div class="toggle-row">
                        <label class="toggle-label"><input type="checkbox" id="ambient-saturation"> 饱和度</label>
                    </div>
                    <div class="param-item compact">
                        <input type="range" id="ambient-saturation-str" min="0" max="1" step="0.05" value="0.2">
                        <span class="range-val" id="ambient-saturation-str-val">0.20</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => _bindAmbientEvents(), 0);

    return section.wrapper;
}

/**
 * 绑定环境光照事件
 */
function _bindAmbientEvents() {
    const enabled = document.getElementById('ambient-enabled');
    const controls = document.getElementById('ambient-controls');

    if (enabled) {
        enabled.addEventListener('change', () => {
            controls.style.display = enabled.checked ? '' : 'none';
            if (!ambientLightingPlugin) return;
            if (enabled.checked) {
                ambientLightingPlugin.enable();
                // 立即分析当前背景
                if (bgSprite) {
                    const src = bgSprite.texture.baseTexture.resource?.source;
                    if (src) ambientLightingPlugin.analyzeBackground(src);
                }
            } else {
                ambientLightingPlugin.disable();
            }
        });
    }

    // 强度
    _bindSlider('ambient-intensity', 'ambient-intensity-val', (v) => {
        if (ambientLightingPlugin) ambientLightingPlugin.updateConfig({ intensity: v });
    });
    _bindSlider('ambient-smoothing', 'ambient-smoothing-val', (v) => {
        if (ambientLightingPlugin) ambientLightingPlugin.updateConfig({ smoothing: v });
    });

    // 色温
    const colorTemp = document.getElementById('ambient-colortemp');
    if (colorTemp) {
        colorTemp.addEventListener('change', () => {
            if (ambientLightingPlugin) ambientLightingPlugin.updateConfig({ enableColorTemp: colorTemp.checked });
        });
    }
    _bindSlider('ambient-colortemp-str', 'ambient-colortemp-str-val', (v) => {
        if (ambientLightingPlugin) ambientLightingPlugin.colorTempStrength = v;
    });

    // 亮度
    const brightness = document.getElementById('ambient-brightness');
    if (brightness) {
        brightness.addEventListener('change', () => {
            if (ambientLightingPlugin) ambientLightingPlugin.updateConfig({ enableBrightness: brightness.checked });
        });
    }
    _bindSlider('ambient-brightness-str', 'ambient-brightness-str-val', (v) => {
        if (ambientLightingPlugin) ambientLightingPlugin.brightnessStrength = v;
    });

    // 对比度
    const contrast = document.getElementById('ambient-contrast');
    if (contrast) {
        contrast.addEventListener('change', () => {
            if (ambientLightingPlugin) ambientLightingPlugin.enableContrast = contrast.checked;
        });
    }
    _bindSlider('ambient-contrast-str', 'ambient-contrast-str-val', (v) => {
        if (ambientLightingPlugin) ambientLightingPlugin.contrastStrength = v;
    });

    // 饱和度
    const saturation = document.getElementById('ambient-saturation');
    if (saturation) {
        saturation.addEventListener('change', () => {
            if (ambientLightingPlugin) ambientLightingPlugin.enableSaturation = saturation.checked;
        });
    }
    _bindSlider('ambient-saturation-str', 'ambient-saturation-str-val', (v) => {
        if (ambientLightingPlugin) ambientLightingPlugin.saturationStrength = v;
    });
}

/**
 * 辅助：绑定 slider 的 input 事件
 */
function _bindSlider(sliderId, valId, onChange) {
    const slider = document.getElementById(sliderId);
    const valSpan = valId ? document.getElementById(valId) : null;
    if (!slider) return;
    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        if (valSpan) valSpan.textContent = v.toFixed(2);
        onChange(v);
    });
}

/**
 * 创建试验性功能区域
 */
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
    bgResetBtn.textContent = t('controls.preset.reset', 'Reset');
    bgResetBtn.addEventListener('click', () => resetBgPosition());
    bgControlSection.content.appendChild(bgResetBtn);

    section.content.appendChild(bgControlSection.wrapper);

    // === 遮罩控制子栏目 ===
    section.content.appendChild(createOcclusionControlSection());

    // === 环境光照控制子栏目 ===
    section.content.appendChild(createAmbientLightingSection());

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

// ============================================
// 全局导出
// ============================================

window.syncPositionControlsFromModel = syncPositionControlsFromModel;
window.refreshControlPanelLanguage = () => {
    if (Object.keys(modelConfig.parameters || {}).length > 0) {
        generateControlPanel();
    }
};
