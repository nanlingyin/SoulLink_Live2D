// ============================================
// SoulLink Live2D - AI Mask System
// AI蒙版：调用后端API提取前景，灰度转换，应用蒙版
// ============================================

console.log('🔧 ai-mask.js 已加载');

/**
 * 调用后端 /api/extract-mask 提取前景蒙版
 * @returns {Promise<string>} 蒙版图片 data URI
 */
async function extractForegroundViaAI() {
    if (!bgSprite || !bgSprite.texture || !bgSprite.texture.baseTexture) {
        throw new Error('需要先上传背景图');
    }

    const source = bgSprite.texture.baseTexture.resource?.source;
    if (!source) throw new Error('背景图源不可用');

    // 将背景图转为 base64 JPEG
    const canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth || source.width;
    canvas.height = source.naturalHeight || source.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0);
    const base64Image = canvas.toDataURL('image/jpeg', 0.9);

    // 调用后端代理
    const response = await fetch('/api/extract-mask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image }),
    });

    const result = await response.json();
    if (!response.ok || result.error) {
        throw new Error(result.error || `API error: ${response.status}`);
    }

    return result.mask;
}

/**
 * 将蒙版图片转为灰度纹理
 */
function convertToGrayscaleMask(maskDataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // ITU-R BT.601 灰度转换
            for (let i = 0; i < data.length; i += 4) {
                const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }
            ctx.putImageData(imageData, 0, 0);

            const baseTexture = new PIXI.BaseTexture(canvas);
            const texture = new PIXI.Texture(baseTexture);
            resolve(texture);
        };
        img.onerror = () => reject(new Error('Failed to load mask image'));
        img.src = maskDataUrl;
    });
}

/**
 * 从蒙版纹理提取上边缘点（用于显示轮廓）
 */
function extractTopEdgeFromMaskTexture(texture) {
    const src = texture?.baseTexture?.resource?.source;
    if (!src || !src.width || !src.height) {
        throw new Error('mask source unavailable');
    }

    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;

    const w = canvas.width, h = canvas.height;
    const topYs = new Array(w);
    let prevY = Math.round(h * 0.6);

    for (let x = 0; x < w; x++) {
        let foundY = -1;
        for (let y = 0; y < h; y++) {
            const idx = (y * w + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            if (data[idx + 3] > 12 && lum > 127) {
                foundY = y;
                break;
            }
        }
        topYs[x] = foundY < 0 ? prevY : foundY;
        prevY = topYs[x];
    }

    // 简化：每隔一定像素取一个点
    const step = Math.max(1, Math.floor(w / 60));
    const points = [];
    for (let x = 0; x < w; x += step) {
        points.push([x, topYs[x]]);
    }
    if (points[points.length - 1][0] !== w - 1) {
        points.push([w - 1, topYs[w - 1]]);
    }
    return points;
}
// PLACEHOLDER_AI_MASK_2

/**
 * 应用 AI 蒙版（直接使用纹理作为 sprite mask）
 * 蒙版精灵与前景精灵对齐，白色区域可见
 */
function applyAIMask() {
    if (!foregroundSprite || !occlusionState.extractedMaskTexture) {
        console.warn('[AIMask] 需要先提取蒙版');
        return;
    }

    // 清理旧的 AI 蒙版精灵
    if (occlusionState.aiMaskSprite) {
        if (occlusionState.aiMaskSprite.parent) {
            occlusionState.aiMaskSprite.parent.removeChild(occlusionState.aiMaskSprite);
        }
        occlusionState.aiMaskSprite.destroy();
    }

    // 创建蒙版精灵，与前景精灵同尺寸同位置
    const maskSprite = new PIXI.Sprite(occlusionState.extractedMaskTexture);
    maskSprite.anchor.set(0.5, 0.5);
    maskSprite.width = foregroundSprite.width;
    maskSprite.height = foregroundSprite.height;
    maskSprite.x = foregroundSprite.x;
    maskSprite.y = foregroundSprite.y;
    maskSprite.renderable = false;

    app.stage.addChild(maskSprite);
    foregroundSprite.mask = maskSprite;
    occlusionState.aiMaskSprite = maskSprite;

    // 绘制轮廓线（只读，不可编辑）
    _drawAIMaskOutline();

    console.log('[AIMask] AI mask applied');
}

/**
 * 绘制 AI 蒙版轮廓线（不可编辑）
 */
function _drawAIMaskOutline() {
    if (!maskOutline || !occlusionState.extractedMaskTexture) return;

    maskOutline.clear();

    // 检查是否显示 AI 轮廓线
    if (!occlusionState.showAIOutline) return;

    try {
        const edgePoints = extractTopEdgeFromMaskTexture(occlusionState.extractedMaskTexture);
        if (edgePoints.length < 2) return;

        // 将蒙版坐标映射到屏幕坐标
        const tex = occlusionState.extractedMaskTexture;
        const texW = tex.width;
        const texH = tex.height;
        const spriteW = foregroundSprite.width;
        const spriteH = foregroundSprite.height;
        const offsetX = foregroundSprite.x - spriteW / 2;
        const offsetY = foregroundSprite.y - spriteH / 2;

        const scaleX = spriteW / texW;
        const scaleY = spriteH / texH;

        maskOutline.lineStyle(2, 0x4facfe, 0.8);
        const sx = edgePoints[0][0] * scaleX + offsetX;
        const sy = edgePoints[0][1] * scaleY + offsetY;
        maskOutline.moveTo(sx, sy);

        for (let i = 1; i < edgePoints.length; i++) {
            const px = edgePoints[i][0] * scaleX + offsetX;
            const py = edgePoints[i][1] * scaleY + offsetY;
            maskOutline.lineTo(px, py);
        }
    } catch (e) {
        console.warn('[AIMask] outline draw failed:', e);
    }
}

/**
 * 完整的 AI 蒙版提取+应用流程
 */
async function extractAndApplyAIMask() {
    console.log('[AIMask] Starting extraction...');

    const maskDataUrl = await extractForegroundViaAI();
    console.log('[AIMask] Mask received, converting to grayscale...');

    const texture = await convertToGrayscaleMask(maskDataUrl);
    occlusionState.extractedMaskTexture = texture;
    console.log('[AIMask] Grayscale mask ready');

    // 切换到 AI 模式并应用
    occlusionMode = 'ai';
    if (maskEditorLayer) maskEditorLayer.visible = true;
    applyAIMask();
}

// ============================================
// 全局导出
// ============================================

window.extractForegroundViaAI = extractForegroundViaAI;
window.convertToGrayscaleMask = convertToGrayscaleMask;
window.extractTopEdgeFromMaskTexture = extractTopEdgeFromMaskTexture;
window.applyAIMask = applyAIMask;
window.extractAndApplyAIMask = extractAndApplyAIMask;
