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
