// ============================================
// SoulLink Live2D - Occlusion Mask System
// 遮罩蒙版核心：层级管理、多边形蒙版、节点编辑
// ============================================

console.log('🔧 occlusion-mask.js 已加载');

// 内部拖拽状态
let _handleDrag = null;
let _maskDrag = null;

/**
 * 初始化遮罩层级结构
 * 在 model-loader 中 model 加载后调用
 */
function initOcclusionLayers() {
    if (!app) return;

    // 启用 stage 排序
    app.stage.sortableChildren = true;

    // 创建 modelContainer 包裹 model
    if (!modelContainer) {
        modelContainer = new PIXI.Container();
        modelContainer.zIndex = 10;
        modelContainer.sortableChildren = true;
        app.stage.addChild(modelContainer);
    }

    // 创建遮罩 Graphics（不可见，仅作 mask 源）
    if (!occlusionMask) {
        occlusionMask = new PIXI.Graphics();
        occlusionMask.zIndex = 30;
        occlusionMask.renderable = false;
        app.stage.addChild(occlusionMask);
    }

    // 创建编辑器层
    if (!maskEditorLayer) {
        maskEditorLayer = new PIXI.Container();
        maskEditorLayer.zIndex = 40;
        maskEditorLayer.sortableChildren = true;
        app.stage.addChild(maskEditorLayer);

        // 蒙版拖拽区域
        maskDragArea = new PIXI.Graphics();
        maskDragArea.interactive = true;
        maskDragArea.cursor = 'move';
        maskDragArea.on('pointerdown', _onMaskDragDown);
        maskEditorLayer.addChild(maskDragArea);

        // 轮廓线
        maskOutline = new PIXI.Graphics();
        maskEditorLayer.addChild(maskOutline);
    }

    // 绑定 stage 级别的 pointer 事件（用于拖拽）
    app.stage.interactive = true;
    app.stage.hitArea = new PIXI.Rectangle(-100000, -100000, 200000, 200000);
    app.stage.on('pointermove', _onStagePointerMove);
    app.stage.on('pointerup', _onStagePointerUp);
    app.stage.on('pointerupoutside', _onStagePointerUp);

    console.log('[OcclusionMask] layers initialized');
}

/**
 * 创建/更新前景精灵（背景副本）
 */
function updateForegroundSprite(texture, width, height) {
    if (!app) return;

    if (foregroundSprite) {
        app.stage.removeChild(foregroundSprite);
        foregroundSprite.destroy();
    }

    foregroundSprite = new PIXI.Sprite(texture);
    foregroundSprite.width = width;
    foregroundSprite.height = height;
    foregroundSprite.anchor.set(0.5, 0.5);
    foregroundSprite.zIndex = 20;

    // 与 bgSprite 位置同步
    if (bgSprite) {
        foregroundSprite.x = bgSprite.x;
        foregroundSprite.y = bgSprite.y;
    }

    app.stage.addChild(foregroundSprite);

    // 如果当前有遮罩模式，应用 mask；否则隐藏前景避免遮挡模型
    if (occlusionMode === 'polygon' && occlusionMask) {
        foregroundSprite.mask = occlusionMask;
        foregroundSprite.visible = true;
    } else if (occlusionMode === 'ai' && occlusionState.extractedMaskTexture) {
        foregroundSprite.visible = true;
        if (typeof applyAIMask === 'function') applyAIMask();
    } else {
        foregroundSprite.visible = false;
    }
}

/**
 * 同步前景精灵位置/缩放到背景精灵
 */
function syncForegroundToBackground() {
    if (!foregroundSprite || !bgSprite) return;
    foregroundSprite.x = bgSprite.x;
    foregroundSprite.y = bgSprite.y;
    foregroundSprite.scale.set(bgSprite.scale.x, bgSprite.scale.y);
}
// PLACEHOLDER_OCCLUSION_2

/**
 * 启用遮罩模式
 * @param {'none'|'polygon'|'ai'} mode
 */
function enableOcclusionMode(mode) {
    if (!app || !foregroundSprite) {
        console.warn('[OcclusionMask] 需要先上传背景图');
        return;
    }

    // 清理旧模式
    disableOcclusion();

    occlusionMode = mode;

    if (mode === 'polygon') {
        // 初始化默认多边形（如果没有点）
        if (occlusionState.topEdgePoints.length < 2) {
            const container = document.getElementById('live2d-container');
            const cw = container ? container.clientWidth : 800;
            const ch = container ? container.clientHeight : 600;
            const midY = ch * 0.6;
            occlusionState.topEdgePoints = [
                [0, midY], [cw * 0.25, midY - 20],
                [cw * 0.5, midY - 30], [cw * 0.75, midY - 20], [cw, midY]
            ];
        }
        foregroundSprite.visible = true;
        foregroundSprite.mask = occlusionMask;
        redrawOcclusionMask(true);
        maskEditorLayer.visible = true;
    } else if (mode === 'ai') {
        // AI 模式：如果还没有提取蒙版，隐藏前景避免遮挡模型
        if (occlusionState.extractedMaskTexture) {
            foregroundSprite.visible = true;
            if (typeof applyAIMask === 'function') {
                applyAIMask();
            }
        } else {
            foregroundSprite.visible = false;
        }
        maskEditorLayer.visible = true;
    } else {
        foregroundSprite.visible = false;
        foregroundSprite.mask = null;
        maskEditorLayer.visible = false;
    }
}

/**
 * 禁用遮罩
 */
function disableOcclusion() {
    occlusionMode = 'none';

    if (foregroundSprite) {
        foregroundSprite.mask = null;
        foregroundSprite.visible = false;
    }

    // 清理 AI 蒙版精灵
    if (occlusionState.aiMaskSprite) {
        if (occlusionState.aiMaskSprite.parent) {
            occlusionState.aiMaskSprite.parent.removeChild(occlusionState.aiMaskSprite);
        }
        occlusionState.aiMaskSprite.destroy();
        occlusionState.aiMaskSprite = null;
    }

    // 清理多边形编辑器
    if (occlusionMask) occlusionMask.clear();
    if (maskOutline) maskOutline.clear();
    if (maskDragArea) {
        maskDragArea.clear();
        maskDragArea.interactive = false;
    }
    _clearHandleNodes();
    if (maskEditorLayer) maskEditorLayer.visible = false;
}
// PLACEHOLDER_OCCLUSION_3

/**
 * 构建蒙版多边形（上边缘点 + 底部闭合）
 */
function buildMaskPolygon() {
    const offset = occlusionState.offsetY;
    const container = document.getElementById('live2d-container');
    const ch = container ? container.clientHeight : 600;
    const cw = container ? container.clientWidth : 800;

    const top = occlusionState.topEdgePoints.map(p => [p[0], p[1] + offset]);
    return [...top, [cw, ch + offset], [0, ch + offset]];
}

/**
 * 重绘遮罩蒙版
 */
function redrawOcclusionMask(rebuildHandles) {
    if (!occlusionMask || occlusionMode !== 'polygon') return;

    const polygon = buildMaskPolygon();
    if (polygon.length < 3) return;

    occlusionMask.clear();
    occlusionMask.beginFill(0xffffff, 1);
    occlusionMask.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) {
        occlusionMask.lineTo(polygon[i][0], polygon[i][1]);
    }
    occlusionMask.closePath();
    occlusionMask.endFill();

    _redrawMaskEditor(rebuildHandles);
}

/**
 * 重绘编辑器（轮廓线 + 节点手柄 + 拖拽区域）
 */
function _redrawMaskEditor(rebuildHandles) {
    if (!maskDragArea || !maskOutline) return;

    const polygon = buildMaskPolygon();
    if (polygon.length < 3) return;

    // 拖拽区域
    maskDragArea.clear();
    if (occlusionState.enableMaskDrag) {
        maskDragArea.beginFill(0x000000, 0.001);
        maskDragArea.moveTo(polygon[0][0], polygon[0][1]);
        for (let i = 1; i < polygon.length; i++) {
            maskDragArea.lineTo(polygon[i][0], polygon[i][1]);
        }
        maskDragArea.closePath();
        maskDragArea.endFill();
        maskDragArea.interactive = true;
        maskDragArea.cursor = 'move';
    } else {
        maskDragArea.interactive = false;
    }

    // 轮廓线
    maskOutline.clear();
    if (occlusionState.showMaskLine) {
        maskOutline.lineStyle(2, 0x6dc2a2, 0.95);
        const shifted = _shiftedTopEdge();
        if (shifted.length > 0) {
            maskOutline.moveTo(shifted[0][0], shifted[0][1]);
            for (let i = 1; i < shifted.length; i++) {
                maskOutline.lineTo(shifted[i][0], shifted[i][1]);
            }
        }
    }

    // 节点手柄
    const shiftedTop = _shiftedTopEdge();
    if (rebuildHandles || maskHandleNodes.length !== shiftedTop.length) {
        _clearHandleNodes();
        for (let i = 0; i < shiftedTop.length; i++) {
            const handle = new PIXI.Graphics();
            handle.beginFill(0xffde7c, 0.95);
            handle.lineStyle(1, 0x19222d, 0.9);
            handle.drawCircle(0, 0, 7);
            handle.endFill();
            handle.interactive = true;
            handle.buttonMode = true;
            handle.cursor = 'pointer';
            handle.__pointIndex = i;
            handle.on('pointerdown', _onHandleDown);
            maskEditorLayer.addChild(handle);
            maskHandleNodes.push(handle);
        }
    }

    for (let i = 0; i < maskHandleNodes.length; i++) {
        maskHandleNodes[i].x = shiftedTop[i][0];
        maskHandleNodes[i].y = shiftedTop[i][1];
        maskHandleNodes[i].visible = occlusionState.showHandles;
    }
}
// PLACEHOLDER_OCCLUSION_4

function _shiftedTopEdge() {
    const offset = occlusionState.offsetY;
    return occlusionState.topEdgePoints.map(p => [p[0], p[1] + offset]);
}

function _clearHandleNodes() {
    for (const node of maskHandleNodes) {
        node.destroy();
    }
    maskHandleNodes = [];
}

/**
 * 在最近线段上插入新节点
 */
function tryInsertNodeAt(x, y) {
    const shifted = _shiftedTopEdge();
    if (shifted.length < 2) return false;

    let bestSeg = -1, bestDist = Infinity;
    for (let i = 0; i < shifted.length - 1; i++) {
        const d = _pointToSegDist(x, y, shifted[i][0], shifted[i][1], shifted[i + 1][0], shifted[i + 1][1]);
        if (d < bestDist) { bestDist = d; bestSeg = i; }
    }

    if (bestSeg < 0 || bestDist > 18) return false;

    const unshiftedY = y - occlusionState.offsetY;
    occlusionState.topEdgePoints.splice(bestSeg + 1, 0, [x, unshiftedY]);
    return true;
}

function _pointToSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * 自动估计蒙版边缘（基于亮度梯度）
 */
function autoEstimateTopEdge(nodeCount) {
    if (!bgSprite || !bgSprite.texture || !bgSprite.texture.baseTexture) {
        throw new Error('需要先上传背景图');
    }

    const source = bgSprite.texture.baseTexture.resource?.source;
    if (!source) throw new Error('背景图源不可用');

    const container = document.getElementById('live2d-container');
    const cw = container ? container.clientWidth : 800;
    const ch = container ? container.clientHeight : 600;

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, cw, ch);
    const imageData = ctx.getImageData(0, 0, cw, ch);
    const data = imageData.data;

    const lum = (x, y) => {
        const px = Math.max(0, Math.min(cw - 1, Math.round(x)));
        const py = Math.max(0, Math.min(ch - 1, Math.round(y)));
        const idx = (py * cw + px) * 4;
        return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    };
// PLACEHOLDER_OCCLUSION_5

    // 找到亮度梯度最大的行
    const rowStart = Math.floor(ch * 0.34);
    const rowEnd = Math.floor(ch * 0.78);
    let bestRow = rowStart, bestScore = -Infinity;

    for (let y = rowStart + 1; y < rowEnd - 1; y++) {
        let sum = 0, cnt = 0;
        for (let x = 0; x < cw; x += 4) {
            sum += Math.abs(lum(x, y + 1) - lum(x, y - 1));
            cnt++;
        }
        const score = sum / Math.max(cnt, 1);
        if (score > bestScore) { bestScore = score; bestRow = y; }
    }

    // 采样各列的局部最佳边缘
    const targetCount = Math.max(2, Math.min(300, nodeCount || 12));
    const segments = targetCount - 1;
    const sampled = [];

    for (let i = 0; i <= segments; i++) {
        const x = Math.round((i / segments) * (cw - 1));
        const searchStart = Math.max(10, bestRow - 120);
        const searchEnd = Math.min(ch - 10, bestRow + 120);

        let localBestY = bestRow, localBestScore = -Infinity;
        for (let y = searchStart; y <= searchEnd; y++) {
            let grad = 0;
            for (let dx = -6; dx <= 6; dx += 3) {
                grad += Math.abs(lum(x + dx, y + 1) - lum(x + dx, y - 1));
            }
            const centerBias = 1 - Math.abs(y - bestRow) / 160;
            const score = grad * Math.max(centerBias, 0.2);
            if (score > localBestScore) { localBestScore = score; localBestY = y; }
        }
        sampled.push(localBestY);
    }

    // 平滑
    const smooth = _smoothArray(sampled, 1).map(y => Math.max(40, Math.min(ch - 10, Math.round(y))));
    const topEdge = [];
    for (let i = 0; i <= segments; i++) {
        topEdge.push([Math.round((i / segments) * cw), smooth[i]]);
    }
    return topEdge;
}

function _smoothArray(arr, passes) {
    let result = [...arr];
    for (let p = 0; p < passes; p++) {
        const next = [...result];
        for (let i = 1; i < result.length - 1; i++) {
            next[i] = (result[i - 1] + result[i] + result[i + 1]) / 3;
        }
        result = next;
    }
    return result;
}

/**
 * 等距重采样多边形线
 */
function resamplePolyline(points, targetCount) {
    if (!points || points.length === 0) return [];
    if (targetCount <= 1) return [[points[0][0], points[0][1]]];
    if (points.length === 1) return Array.from({ length: targetCount }, () => [points[0][0], points[0][1]]);

    const cum = [0];
    for (let i = 1; i < points.length; i++) {
        cum[i] = cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }
    const total = cum[cum.length - 1];
    if (total <= 0) return Array.from({ length: targetCount }, () => [points[0][0], points[0][1]]);

    const sampled = [];
    for (let i = 0; i < targetCount; i++) {
        const dist = (i / (targetCount - 1)) * total;
        let seg = 1;
        while (seg < cum.length && cum[seg] < dist) seg++;
        seg = Math.min(seg, cum.length - 1);
        const t = cum[seg] === cum[seg - 1] ? 0 : (dist - cum[seg - 1]) / (cum[seg] - cum[seg - 1]);
        sampled.push([
            points[seg - 1][0] + (points[seg][0] - points[seg - 1][0]) * t,
            points[seg - 1][1] + (points[seg][1] - points[seg - 1][1]) * t,
        ]);
    }
    return sampled;
}
// PLACEHOLDER_OCCLUSION_6

// ============================================
// Pointer 事件处理
// ============================================

function _onHandleDown(event) {
    const button = event?.data?.originalEvent?.button ?? 0;
    // 右键删除节点
    if (button === 2) {
        const index = this.__pointIndex;
        if (occlusionState.topEdgePoints.length <= 2) return;
        occlusionState.topEdgePoints.splice(index, 1);
        redrawOcclusionMask(true);
        event.stopPropagation();
        return;
    }
    _handleDrag = {
        pointerId: event.data.pointerId,
        index: this.__pointIndex,
    };
    event.stopPropagation();
}

function _onMaskDragDown(event) {
    if (occlusionState.addNodeMode) {
        // 添加节点模式：尝试在点击位置插入节点
        const local = event.data.getLocalPosition(app.stage);
        if (tryInsertNodeAt(local.x, local.y)) {
            redrawOcclusionMask(true);
        }
        event.stopPropagation();
        return;
    }
    if (!occlusionState.enableMaskDrag) return;
    if (_handleDrag) return;

    const local = event.data.getLocalPosition(app.stage);
    _maskDrag = {
        pointerId: event.data.pointerId,
        startX: local.x,
        startY: local.y,
        startPoints: occlusionState.topEdgePoints.map(p => [p[0], p[1]]),
    };
    event.stopPropagation();
}

function _onStagePointerMove(event) {
    const local = event.data.getLocalPosition(app.stage);
    const pointerId = event.data.pointerId;

    if (_handleDrag && _handleDrag.pointerId === pointerId) {
        const idx = _handleDrag.index;
        occlusionState.topEdgePoints[idx][0] = local.x;
        occlusionState.topEdgePoints[idx][1] = local.y - occlusionState.offsetY;
        redrawOcclusionMask(false);
        return;
    }

    if (_maskDrag && _maskDrag.pointerId === pointerId) {
        const dx = local.x - _maskDrag.startX;
        const dy = local.y - _maskDrag.startY;
        occlusionState.topEdgePoints = _maskDrag.startPoints.map(p => [p[0] + dx, p[1] + dy]);
        redrawOcclusionMask(false);
        return;
    }
}

function _onStagePointerUp(event) {
    const pid = event.data.pointerId;
    if (_handleDrag && _handleDrag.pointerId === pid) _handleDrag = null;
    if (_maskDrag && _maskDrag.pointerId === pid) _maskDrag = null;
}

// ============================================
// 全局导出
// ============================================

window.initOcclusionLayers = initOcclusionLayers;
window.updateForegroundSprite = updateForegroundSprite;
window.syncForegroundToBackground = syncForegroundToBackground;
window.enableOcclusionMode = enableOcclusionMode;
window.disableOcclusion = disableOcclusion;
window.redrawOcclusionMask = redrawOcclusionMask;
window.autoEstimateTopEdge = autoEstimateTopEdge;
window.tryInsertNodeAt = tryInsertNodeAt;
window.resamplePolyline = resamplePolyline;
