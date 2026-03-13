// ============================================
// SoulLink Live2D - Helper Functions
// 辅助函数：国际化、系统信息、参数判断等
// ============================================

console.log('🔧 helpers.js 已加载');

/**
 * 国际化翻译函数
 */
function t(key, fallback, params = null) {
    if (window.I18N && typeof window.I18N.t === 'function') {
        return window.I18N.t(key, params, fallback);
    }
    return fallback;
}

/**
 * 判断是否为物理参数
 */
function isPhysicsParam(paramId) {
    const physicsKeywords = [
        'Hair', 'Ribbon', 'Skirt', 'Bust', 'Sway',
        'Rotation_', 'Skinning', '摇动', '辫子', '侧发'
    ];
    return physicsKeywords.some(keyword => paramId.includes(keyword));
}

/**
 * 获取参数组显示名称
 */
function getGroupDisplayName(groupId) {
    const nameMap = {
        'ParamGroupFace': t('groups.face', 'Face'),
        'ParamGroupEyebrow': t('groups.eyebrow', 'Eyebrow'),
        'ParamGroupEye': t('groups.eye', 'Eye'),
        'ParamGroupMouth': t('groups.mouth', 'Mouth'),
        'ParamGroupBody': t('groups.body', 'Body'),
        'ParamGroupHair': t('groups.hair', 'Hair'),
        'ParamGroupAccessory': t('groups.accessory', 'Accessory'),
        'ParamGroup': t('groups.eyes', 'Eyes'),
        'ParamGroup2': t('groups.head', 'Head'),
        'other': t('groups.other', 'Other')
    };
    return nameMap[groupId] || groupId;
}

/**
 * 渲染系统信息
 */
function renderSystemInfo() {
    const systemInfo = document.getElementById('system-info');
    if (!systemInfo) return;

    const connectionText = systemInfoState.connection === true
        ? t('system.connection.connected', 'Connected to server')
        : systemInfoState.connection === false
            ? t('system.connection.local', 'Local mode')
            : t('system.connection.waiting', 'Waiting');

    systemInfo.innerHTML = `
        <strong>SoulLink Live2D</strong> - ${t('system.title', 'AI-driven Live2D expression control')}<br>
        ${t('system.model', 'Model')}: <code>${systemInfoState.modelName || '-'}</code><br>
        ${t('system.connection', 'Connection')}: <code>${connectionText}</code><br>
        ${t('system.api', 'API')}: <code>${systemInfoState.apiProvider || '-'}</code>
    `;
}

/**
 * 设置系统连接状态
 */
function setSystemConnectionState(isConnected) {
    systemInfoState.connection = isConnected === null ? null : !!isConnected;
    renderSystemInfo();
}

// ============================================
// 全局导出
// ============================================

window.refreshSystemInfoLanguage = renderSystemInfo;
window.setSystemConnectionState = setSystemConnectionState;
