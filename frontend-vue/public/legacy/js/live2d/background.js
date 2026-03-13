// ============================================
// SoulLink Live2D - Background Management
// 背景精灵创建、移除、拖拽、上传、控制
// ============================================

console.log('🔧 background.js 已加载');

/**
 * 处理背景上传
 */
function handleBgUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        createBgSprite(dataUrl);
    };
    reader.readAsDataURL(file);
}

/**
 * 创建背景精灵
 */
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

/**
 * 移除背景精灵
 */
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

/**
 * 启用背景拖拽
 */
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

/**
 * 同步背景控制值从精灵
 */
function syncBgControlsFromSprite() {
    if (!bgSprite) return;
    const bgX = document.getElementById('bg-x');
    const bgY = document.getElementById('bg-y');
    const bgScale = document.getElementById('bg-scale');
    if (bgX) bgX.value = Math.round(bgSprite.x);
    if (bgY) bgY.value = Math.round(bgSprite.y);
    if (bgScale) bgScale.value = bgSprite.scale.x.toFixed(2);
}

/**
 * 初始化背景控制监听器
 */
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

/**
 * 重置背景位置
 */
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

// ============================================
// 全局导出
// ============================================

window.removeBgSprite = removeBgSprite;
window.resetBgPosition = resetBgPosition;
