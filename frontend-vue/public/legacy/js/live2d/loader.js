// ============================================
// SoulLink Live2D - Module Entry Point
// v3.0.0 - 模块化重构
// ============================================

console.log('🎯 SoulLink Live2D v3.0.0 - 模块化架构');
console.log('📦 模块加载顺序:');
console.log('  1. shared-state.js   - 全局状态声明');
console.log('  2. helpers.js        - 辅助函数');
console.log('  3. idle-motion.js    - 空闲动画管理');
console.log('  4. param-control.js  - 参数控制');
console.log('  5. model-loader.js   - 模型加载');
console.log('  6. control-panel.js  - 控制面板UI');
console.log('  7. background.js     - 背景管理');
console.log('  8. interaction.js    - 交互功能');
console.log('  9. loader.js         - 入口文件 (当前)');

// ============================================
// 全局 API 导出汇总
// ============================================

// 以下函数由各模块导出到 window 对象:

// helpers.js:
//   - window.refreshSystemInfoLanguage
//   - window.setSystemConnectionState

// idle-motion.js:
//   - window.pauseIdleForGeneratedMotion
//   - window.resumeIdleForGeneratedMotion

// param-control.js:
//   - window.setParameter
//   - window.getParameterValue
//   - window.getAvailableParameters
//   - window.clearAllOverrides
//   - window.setBlinkLock
//   - window.parameterOverrides

// model-loader.js:
//   - window.initLive2D
//   - window.loadModelFromServer
//   - window.model

// control-panel.js:
//   - window.syncPositionControlsFromModel
//   - window.refreshControlPanelLanguage

// background.js:
//   - window.removeBgSprite
//   - window.resetBgPosition

// interaction.js:
//   - window.resetModel
//   - window.toggleBackground
//   - window.toggleControlPanel
//   - window.updateSliderUI
//   - window.debugModel

// 导出 modelConfig（由 shared-state.js 声明）
window.modelConfig = modelConfig;

console.log('✅ SoulLink Live2D 模块化加载完成');
