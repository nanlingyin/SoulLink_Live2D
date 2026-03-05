/**
 * Lightweight i18n helper (zh / en).
 */

(function initI18N() {
    const DICT = {
        en: {
            'app.title': 'SoulLink_Live2D - AI Live2D Expression Control',
            'chat.title': 'AI Chat',
            'chat.clear': 'Clear chat',
            'chat.minimize': 'Minimize',
            'chat.welcome': 'Welcome. Type a message to chat with AI and trigger expressions.',
            'chat.input_placeholder': 'Type your message...',
            'chat.send': 'Send',
            'chat.sending': 'Sending...',
            'chat.open': 'Open Chat',
            'chat.cleared': 'Chat history cleared. Start a new conversation.',
            'chat.thinking': 'AI is thinking...',
            'chat.server_disconnected': 'Server disconnected. Refresh the page and retry.',
            'chat.send_failed': 'Send failed',
            'chat.error': 'Error',
            'voice.input': 'Voice input',
            'voice.unavailable': 'Speech recognition unavailable',
            'voice.asr_error': 'Speech recognition error',
            'voice.stop_recording': 'Stop recording',
            'voice.processing': 'Processing...',
            'voice.start_recording': 'Start voice input',
            'loading.model': 'Loading model...',
            'loading.waiting_model': 'Waiting for model initialization',
            'controls.reset_position': 'Reset Position',
            'controls.toggle_background': 'Toggle Background',
            'controls.panel': 'Controls',
            'controls.expression_panel_title': 'Expression Controls',
            'controls.preset.happy': 'Happy',
            'controls.preset.sad': 'Sad',
            'controls.preset.surprised': 'Surprised',
            'controls.preset.shy': 'Shy',
            'controls.preset.angry': 'Angry',
            'controls.preset.reset': 'Reset',
            'groups.face': 'Face',
            'groups.eyes': 'Eyes',
            'groups.eyeballs': 'Eyeballs',
            'groups.brows': 'Brows',
            'groups.mouth': 'Mouth',
            'groups.body': 'Body',
            'groups.arms': 'Arms',
            'groups.head': 'Head',
            'groups.other': 'Other',
            'system.title': 'AI-driven Live2D expression control',
            'system.model_directory': 'Model directory',
            'system.drag_zoom': 'Drag model | Mouse wheel zoom',
            'system.model': 'Model',
            'system.api': 'API',
            'system.connection': 'Connection',
            'system.connection.connected': 'Connected to server',
            'system.connection.local': 'Local mode',
            'system.connection.waiting': 'Waiting',
            'lang.label': 'Language'
        },
        zh: {
            'app.title': 'SoulLink_Live2D - AI Live2D 表情控制',
            'chat.title': 'AI 对话',
            'chat.clear': '清空对话',
            'chat.minimize': '最小化',
            'chat.welcome': '欢迎使用，输入消息与 AI 互动并触发表情动作。',
            'chat.input_placeholder': '输入你的消息...',
            'chat.send': '发送',
            'chat.sending': '发送中...',
            'chat.open': '打开对话',
            'chat.cleared': '聊天记录已清空，开始新的对话吧。',
            'chat.thinking': 'AI 正在思考...',
            'chat.server_disconnected': '未连接到服务器，请刷新页面后重试。',
            'chat.send_failed': '发送失败',
            'chat.error': '错误',
            'voice.input': '语音输入',
            'voice.unavailable': '语音识别不可用',
            'voice.asr_error': '语音识别错误',
            'voice.stop_recording': '停止录音',
            'voice.processing': '识别中...',
            'voice.start_recording': '开始语音输入',
            'loading.model': '正在加载模型...',
            'loading.waiting_model': '等待模型初始化完成',
            'controls.reset_position': '重置位置',
            'controls.toggle_background': '切换背景',
            'controls.panel': '控制面板',
            'controls.expression_panel_title': '表情控制',
            'controls.preset.happy': '开心',
            'controls.preset.sad': '难过',
            'controls.preset.surprised': '惊讶',
            'controls.preset.shy': '害羞',
            'controls.preset.angry': '生气',
            'controls.preset.reset': '重置',
            'groups.face': '脸部',
            'groups.eyes': '眼部',
            'groups.eyeballs': '眼球',
            'groups.brows': '眉毛',
            'groups.mouth': '嘴部',
            'groups.body': '身体',
            'groups.arms': '手臂',
            'groups.head': '头部',
            'groups.other': '其他',
            'system.title': 'AI 驱动的 Live2D 表情控制',
            'system.model_directory': '模型目录',
            'system.drag_zoom': '拖动模型 | 滚轮缩放',
            'system.model': '模型',
            'system.api': 'API',
            'system.connection': '连接',
            'system.connection.connected': '已连接服务器',
            'system.connection.local': '本地模式',
            'system.connection.waiting': '等待中',
            'lang.label': '语言'
        }
    };

    const STORAGE_KEY = 'soullink.language';

    function normalizeLanguage(value) {
        const source = String(value || '').toLowerCase();
        if (source.startsWith('zh')) return 'zh';
        if (source.startsWith('en')) return 'en';
        return 'en';
    }

    function resolveInitialLanguage() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return normalizeLanguage(stored);
        return normalizeLanguage(navigator.language || 'en');
    }

    let currentLanguage = resolveInitialLanguage();

    function formatTemplate(template, params) {
        if (!params) return template;
        return String(template).replace(/\{(\w+)\}/g, (_, key) => {
            if (params[key] === undefined || params[key] === null) return '';
            return String(params[key]);
        });
    }

    function t(key, params = null, fallback = '') {
        const table = DICT[currentLanguage] || DICT.en;
        const value = table[key] ?? DICT.en[key] ?? fallback ?? key;
        return formatTemplate(value, params);
    }

    function applyPageTranslations(root = document) {
        if (!root) return;

        if (root === document) {
            document.title = t('app.title', null, document.title);
        }

        root.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = t(el.getAttribute('data-i18n'), null, el.textContent || '');
        });

        root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.setAttribute('placeholder', t(key, null, el.getAttribute('placeholder') || ''));
        });

        root.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const key = el.getAttribute('data-i18n-title');
            el.setAttribute('title', t(key, null, el.getAttribute('title') || ''));
        });

        const selector = document.getElementById('language-select');
        if (selector) {
            selector.value = currentLanguage;
        }
    }

    function setLanguage(language) {
        currentLanguage = normalizeLanguage(language);
        localStorage.setItem(STORAGE_KEY, currentLanguage);
        applyPageTranslations(document);

        if (typeof window.refreshSystemInfoLanguage === 'function') {
            window.refreshSystemInfoLanguage();
        }
        if (typeof window.refreshControlPanelLanguage === 'function') {
            window.refreshControlPanelLanguage();
        }
        if (typeof window.refreshChatLanguage === 'function') {
            window.refreshChatLanguage();
        }
    }

    function syncLanguageFromConfig() {
        const configured = window.SoulLinkConfig?.ui?.language;
        if (!configured || configured === 'auto') {
            return;
        }
        setLanguage(configured);
    }

    window.I18N = {
        t,
        setLanguage,
        getLanguage: () => currentLanguage,
        applyPageTranslations,
        syncLanguageFromConfig
    };
})();
