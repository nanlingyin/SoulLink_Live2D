/**
 * SoulLink 配置加载器
 * 从服务器 /api/config 获取统一配置
 * 所有配置都在 config.yaml 中管理，用户无需修改代码
 */

// 全局配置对象（默认值，会被服务器配置覆盖）
window.SoulLinkConfig = {
    server: {
        host: '0.0.0.0',
        port: 3000,
        modelDirs: ['./l2d']
    },
    llm: {
        provider: 'openai',
        model: 'gpt-4o-mini'
        // apiKey 和 baseUrl 由后端管理，不暴露给前端
    },
    animation: {
        defaultDuration: 1000,
        easing: 'easeInOutCubic',
        autoResetDelay: 1500
    },
    model: {
        directory: './l2d',
        defaultScale: 0.8
    },
    ui: {
        showControlPanel: true,
        showPhysicsParams: false,
        defaultBackground: 0
    }
};

/**
 * 深度合并对象
 */
function deepMerge(target, source) {
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

/**
 * 从服务器加载配置
 * 配置统一在 config.yaml 中管理，后端读取并通过 API 提供给前端
 */
async function loadConfig() {
    try {
        // 从服务器获取配置
        const response = await fetch('/api/config');
        if (!response.ok) {
            console.warn('⚠️ 无法从服务器获取配置，使用默认配置');
            return window.SoulLinkConfig;
        }
        
        const config = await response.json();
        
        // 合并到全局配置
        deepMerge(window.SoulLinkConfig, config);
        
        console.log('✅ 配置已从服务器加载:', window.SoulLinkConfig);
        return window.SoulLinkConfig;
        
    } catch (error) {
        console.warn('⚠️ 无法从服务器加载配置，使用默认配置:', error.message);
        return window.SoulLinkConfig;
    }
}

/**
 * 获取配置值
 * @param {string} path - 配置路径，如 'animation.defaultDuration'
 * @param {*} defaultValue - 默认值
 */
function getConfig(path, defaultValue = null) {
    const keys = path.split('.');
    let value = window.SoulLinkConfig;
    
    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            return defaultValue;
        }
    }
    
    return value;
}

// 导出
window.loadConfig = loadConfig;
window.getConfig = getConfig;
