// ============================================
// SoulLink Live2D - Shared State
// 全局变量和常量声明
// ============================================

console.log('🔧 shared-state.js 已加载');

// PIXI 应用和模型实例
let app = null;
let model = null;

// UI 状态
let currentBgIndex = 0;
let controlPanelVisible = true;
let bgSprite = null;  // PIXI 背景精灵

// 模型配置（自动从 cdi3.json 加载）
let modelConfig = {
    name: '',
    parameters: {},
    parameterGroups: {},
    parts: {}
};

// 参数索引缓存
let parameterIndexCache = {};

// 当前参数覆盖状态
let parameterOverrides = {};
let blinkLockActive = false;
let blinkLockValues = {};
const EYE_OPEN_PARAM_HINTS = ['eye', 'open'];

// 空闲动画状态
let idleMotionGroup = null;
let idleResumeTimer = null;
let lastIdleStartTime = 0;
const generatedMotionLocks = new Set();

// 系统信息状态
const systemInfoState = {
    modelName: '',
    apiProvider: '',
    connection: null
};

// 背景颜色列表
const backgrounds = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    '#000000',
    '#ffffff'
];

// 遮罩系统状态
let modelContainer = null;       // PIXI.Container 包裹 model
let foregroundSprite = null;     // 前景精灵（背景副本，被蒙版裁剪）
let occlusionMask = null;        // PIXI.Graphics 多边形蒙版
let maskEditorLayer = null;      // 编辑器层容器
let maskOutline = null;          // 蒙版轮廓线
let maskDragArea = null;         // 蒙版拖拽区域
let maskHandleNodes = [];        // 节点手柄数组
let occlusionMode = 'none';      // 'none' | 'polygon' | 'ai'
let occlusionState = {
    topEdgePoints: [],            // 多边形上边缘点 [[x,y], ...]
    offsetY: 0,                   // Y偏移
    showHandles: true,            // 显示节点
    showMaskLine: true,           // 显示轮廓线
    enableMaskDrag: false,        // 启用蒙版拖拽
    addNodeMode: false,           // 添加节点模式
    extractedMaskTexture: null,   // AI提取的蒙版纹理
    aiMaskSprite: null,           // AI蒙版精灵（用作 mask）
    showAIOutline: true,          // 显示AI蒙版轮廓线
};

// 环境光照
let ambientLightingPlugin = null;
