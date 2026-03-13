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
