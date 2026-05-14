<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { loadLegacyCore } from './services/legacy-loader';
import { SoulLinkWsClient } from './services/ws-client';
import SettingsPage from './components/SettingsPage.vue';

const wsClient = new SoulLinkWsClient();
window.wsClient = wsClient;

const booting = ref(true);
const bootMessage = ref('正在初始化前端资源...');
const connectionState = ref('connecting');

const models = ref([]);
const currentModel = ref('');

const messages = ref([]);
const chatInput = ref('');
const isSending = ref(false);
const chatHistory = ref([]);
const chatViewport = ref(null);

const quickPrompts = [
  { label: '你今天过得怎么样', text: '你今天过得怎么样？' },
  { label: '陪我聊聊天', text: '我有点累，陪我聊聊天好吗？' },
  { label: '推荐点开心的', text: '推荐点能让我开心的事情吧。' },
  { label: '夸夸我', text: '今天心情不太好，夸夸我吧。' }
];

const voiceEnabled = ref(false);
const ttsEnabled = ref(false);
const voiceState = ref('idle');
const asrAutoSend = ref(false);

const language = ref('zh');
const mobileMode = ref(false);
const mobileTab = ref('chat');

const showControlPanel = ref(false);
const showChatPanel = ref(true);
const showSystemInfo = ref(false);
const showSettings = ref(false);

const backgroundOptions = ref([]);
const activeBackgroundIndex = ref(0);

function tr(key, fallback, params = null) {
  if (window.I18N && typeof window.I18N.t === 'function') {
    return window.I18N.t(key, params, fallback);
  }
  return fallback;
}

const connectionBadgeText = computed(() => {
  if (connectionState.value === 'connected') {
    return '在线';
  }
  if (connectionState.value === 'local') {
    return '本地模式';
  }
  if (connectionState.value === 'disconnected') {
    return '断开';
  }
  return '连接中';
});

const voiceButtonText = computed(() => {
  if (voiceState.value === 'recording') {
    return 'Stop';
  }
  if (voiceState.value === 'processing') {
    return '...';
  }
  return 'Mic';
});

const currentBackgroundLabel = computed(() => {
  if (!backgroundOptions.value.length) {
    return '背景';
  }
  return backgroundOptions.value[activeBackgroundIndex.value]?.label || '背景';
});

const assistantInitial = computed(() => {
  const name = (currentModel.value || 'AI').trim();
  if (!name) {
    return 'AI';
  }
  const cleaned = name.replace(/[^\p{L}\p{N}]/gu, '');
  return (cleaned.slice(0, 2) || 'AI').toUpperCase();
});

const backgroundStyle = computed(() => {
  const active = backgroundOptions.value[activeBackgroundIndex.value];
  if (!active) {
    return {
      background:
        'radial-gradient(ellipse at 22% 18%, rgba(252,200,165,0.26), transparent 70%), radial-gradient(ellipse at 78% 22%, rgba(237,169,179,0.22), transparent 70%), linear-gradient(135deg, #2e1d27 0%, #3a2330 50%, #2a1922 100%)'
    };
  }

  if (active.type === 'image') {
    return {
      backgroundImage: `url(${active.value})`
    };
  }

  return {
    background: active.value
  };
});

function updateResponsiveState() {
  mobileMode.value = window.innerWidth <= 960;
  if (!mobileMode.value) {
    mobileTab.value = 'chat';
  }
}

function toModelPath(path) {
  if (!path) {
    return path;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const sanitized = String(path)
    .replace(/^\.\//, '')
    .replace(/^\//, '');

  return `/${sanitized}`;
}

function addMessage(content, role = 'system') {
  messages.value.push({
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content
  });

  nextTick(() => {
    if (chatViewport.value) {
      chatViewport.value.scrollTop = chatViewport.value.scrollHeight;
    }
  });
}

function clearChat() {
  messages.value = [];
  chatHistory.value = [];
}

function sendQuickPrompt(text) {
  if (isSending.value) {
    return;
  }
  chatInput.value = text;
  sendChatMessage();
}

async function discoverBackgrounds() {
  const wallpaperCandidates = ['wallpaper.png', 'wallpaper.jpg', 'wallpaper.jpeg'];
  const availableWallpapers = [];

  await Promise.all(
    wallpaperCandidates.map(async (name) => {
      const path = `/static/background/${name}`;
      try {
        const response = await fetch(path, { method: 'HEAD' });
        if (response.ok && !availableWallpapers.find((item) => item.value === path)) {
          availableWallpapers.push({
            label: `壁纸 · ${name}`,
            type: 'image',
            value: path
          });
        }
      } catch (error) {
        // Ignore probing errors and keep fallback gradients.
      }
    })
  );

  const warmGradients = [
    {
      label: '暖夜默认',
      type: 'gradient',
      value: 'radial-gradient(ellipse at 22% 18%, rgba(252,200,165,0.26), transparent 70%), radial-gradient(ellipse at 78% 22%, rgba(237,169,179,0.22), transparent 70%), linear-gradient(135deg, #2e1d27 0%, #3a2330 50%, #2a1922 100%)'
    },
    {
      label: '黄昏铜橙',
      type: 'gradient',
      value: 'radial-gradient(ellipse at 50% 95%, rgba(255,170,110,0.34), transparent 55%), linear-gradient(180deg, #2a1820 0%, #4a2630 45%, #6e3322 100%)'
    },
    {
      label: '古董玫瑰',
      type: 'gradient',
      value: 'radial-gradient(ellipse at 30% 30%, rgba(237,169,179,0.32), transparent 60%), linear-gradient(160deg, #2a1820 0%, #4a2832 55%, #5e2c3a 100%)'
    },
    {
      label: '夜灯琥珀',
      type: 'gradient',
      value: 'radial-gradient(circle at 80% 20%, rgba(255,196,150,0.32), transparent 50%), radial-gradient(circle at 20% 80%, rgba(210,136,152,0.22), transparent 50%), linear-gradient(135deg, #2a1922 0%, #3a2230 100%)'
    },
    {
      label: '森林夜色',
      type: 'gradient',
      value: 'radial-gradient(ellipse at 40% 70%, rgba(170,200,160,0.18), transparent 65%), linear-gradient(160deg, #1e2924 0%, #2c3530 50%, #25282a 100%)'
    }
  ];

  backgroundOptions.value = [...warmGradients, ...availableWallpapers];

  const configuredDefault = Number(window.getConfig?.('ui.defaultBackground', 0) || 0);
  if (backgroundOptions.value.length > 0) {
    activeBackgroundIndex.value = Math.max(
      0,
      Math.min(configuredDefault, backgroundOptions.value.length - 1)
    );
  }
}

function cycleBackground() {
  if (!backgroundOptions.value.length) {
    return;
  }
  activeBackgroundIndex.value =
    (activeBackgroundIndex.value + 1) % backgroundOptions.value.length;
}

function setupVoice(config) {
  const voiceConfig = config?.voice || {};

  if (voiceConfig.asr && window.ASRService) {
    const asrAvailable = window.ASRService.init(voiceConfig.asr);
    voiceEnabled.value = Boolean(asrAvailable);
    asrAutoSend.value = Boolean(voiceConfig.asr.autoSend);

    if (voiceEnabled.value) {
      window.ASRService.onResult = (text, isFinal) => {
        if (isFinal) {
          chatInput.value = text;
          if (asrAutoSend.value) {
            sendChatMessage();
          }
          return;
        }
        chatInput.value = text;
      };

      window.ASRService.onError = (error) => {
        addMessage(`${tr('voice.asr_error', '语音识别错误')}: ${error}`, 'system');
      };

      window.ASRService.onStateChange = (state) => {
        voiceState.value = state;
      };
    }
  }

  if (voiceConfig.tts && window.TTSService) {
    ttsEnabled.value = Boolean(window.TTSService.init(voiceConfig.tts));
  }
}

function applyExpression(payload) {
  if (!payload?.parameters || typeof window.transitionToExpression !== 'function') {
    return;
  }

  if (typeof window.cancelAutoReset === 'function') {
    window.cancelAutoReset();
  }

  window.transitionToExpression(
    payload.parameters,
    payload.duration || 800,
    null,
    payload.autoReset ?? true
  );
}

function handleChatResponse(payload) {
  isSending.value = false;

  if (payload?.error) {
    addMessage(`${tr('chat.error', '错误')}: ${payload.error}`, 'system');
    return;
  }

  if (payload?.reply) {
    addMessage(payload.reply, 'assistant');
    chatHistory.value.push({ role: 'assistant', content: payload.reply });

    if (payload.ttsMotionReady && payload.ttsMotionFrames && window.TTSService) {
      window.TTSService.setPreGeneratedMotionFrames(payload.ttsMotionFrames);
    }

    if (ttsEnabled.value && window.TTSService?.isEnabled()) {
      window.TTSService.speak(payload.reply);
    }
  }

  applyExpression(payload);
}

function handleChatError(error) {
  isSending.value = false;
  addMessage(`${tr('chat.error', '错误')}: ${error}`, 'system');
}

function setupWebSocketHandlers() {
  wsClient.onConnected = () => {
    connectionState.value = 'connected';
    if (typeof window.setSystemConnectionState === 'function') {
      window.setSystemConnectionState(true);
    }
  };

  wsClient.onDisconnected = () => {
    connectionState.value = 'disconnected';
    if (typeof window.setSystemConnectionState === 'function') {
      window.setSystemConnectionState(false);
    }
  };

  wsClient.onModelList = (serverModels, current) => {
    models.value = Array.isArray(serverModels) ? serverModels : [];
    currentModel.value = current || '';

    if (models.value.length > 0 && !window.model) {
      const nextModel = currentModel.value || models.value[0].name;
      currentModel.value = nextModel;
      wsClient.loadModel(nextModel);
    }
  };

  wsClient.onLoadModel = async (modelInfo) => {
    if (!modelInfo || typeof window.loadModelFromServer !== 'function') {
      return;
    }

    const normalized = {
      ...modelInfo,
      path: toModelPath(modelInfo.path)
    };

    await window.loadModelFromServer(normalized);
  };

  wsClient.onExpression = (payload) => {
    applyExpression(payload);
  };

  wsClient.onChatResponse = (payload) => {
    handleChatResponse(payload);
  };

  wsClient.onChatError = (payload) => {
    handleChatError(payload?.error || '未知错误');
  };

  wsClient.onError = (error) => {
    console.error('WebSocket error:', error);
  };
}

function onModelSwitch() {
  if (!currentModel.value) {
    return;
  }
  wsClient.loadModel(currentModel.value);
}

async function sendChatMessage() {
  const text = chatInput.value.trim();

  if (!text || isSending.value) {
    return;
  }

  addMessage(text, 'user');
  chatHistory.value.push({ role: 'user', content: text });
  chatInput.value = '';

  if (!wsClient.connected) {
    addMessage(tr('chat.server_disconnected', '服务器未连接，请稍后重试。'), 'system');
    return;
  }

  isSending.value = true;

  const sent = wsClient.send({
    type: 'chat_with_reply',
    message: text,
    history: chatHistory.value.slice(-10),
    autoReset: true,
    prepareTtsMotion: ttsEnabled.value
  });

  if (!sent) {
    isSending.value = false;
    addMessage(tr('chat.send_failed', '消息发送失败。'), 'system');
  }
}

function onInputEnter(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

async function toggleVoiceRecording() {
  if (!voiceEnabled.value || !window.ASRService || !window.ASRService.isAvailable()) {
    addMessage(tr('voice.unavailable', '语音识别不可用'), 'system');
    return;
  }

  if (window.ASRService.isRecording) {
    await window.ASRService.stop();
  } else {
    await window.ASRService.start();
  }
}

function resetModelPose() {
  if (typeof window.resetModel === 'function') {
    window.resetModel();
  }
}

function toggleControlDock() {
  showControlPanel.value = !showControlPanel.value;
  // 等待 CSS 过渡完成后触发 Live2D 重新布局
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 350);
}

function toggleChatPanel() {
  showChatPanel.value = !showChatPanel.value;
  // 等待 CSS 过渡完成后触发 Live2D 重新布局
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 350);
}

function toggleSystemInfo() {
  showSystemInfo.value = !showSystemInfo.value;
}

function setLanguage(nextLanguage) {
  if (window.I18N && typeof window.I18N.setLanguage === 'function') {
    window.I18N.setLanguage(nextLanguage);
  }
  language.value = nextLanguage;
}

function openSettings() {
  showSettings.value = true;
}

function closeSettings() {
  showSettings.value = false;
}

async function bootstrap() {
  booting.value = true;

  try {
    bootMessage.value = '加载 Live2D 与核心模块...';
    await loadLegacyCore();

    bootMessage.value = '同步配置与语音服务...';
    if (typeof window.loadConfig === 'function') {
      await window.loadConfig();
    }

    if (window.I18N && typeof window.I18N.syncLanguageFromConfig === 'function') {
      window.I18N.syncLanguageFromConfig();
      language.value = window.I18N.getLanguage();
    }

    showControlPanel.value = false;

    const configResponse = await fetch('/api/config');
    if (configResponse.ok) {
      const config = await configResponse.json();
      setupVoice(config);
    }

    await discoverBackgrounds();

    if (typeof window.setSystemConnectionState === 'function') {
      window.setSystemConnectionState(null);
    }

    bootMessage.value = '连接后端 WebSocket...';
    setupWebSocketHandlers();

    try {
      await wsClient.connect();
      connectionState.value = 'connected';
    } catch (error) {
      console.warn('WebSocket unavailable, fallback to local mode:', error);
      connectionState.value = 'local';

      if (typeof window.initLive2D === 'function') {
        await window.initLive2D();
      }

      addMessage('未连接到实时服务，已切换为本地模式。', 'system');
    }
  } catch (error) {
    console.error('Bootstrap failed:', error);
    addMessage(`初始化失败: ${error.message}`, 'system');
  } finally {
    booting.value = false;
  }
}

onMounted(() => {
  updateResponsiveState();
  window.addEventListener('resize', updateResponsiveState);
  bootstrap();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateResponsiveState);
  wsClient.disconnect();

  if (window.TTSService?.isEnabled()) {
    window.TTSService.stop();
  }

  if (window.ASRService?.isRecording) {
    window.ASRService.stop();
  }
});
</script>

<template>
  <div class="app-shell">
    <div class="background-layer" :style="backgroundStyle"></div>
    <div class="background-mask"></div>

    <!-- Stage: Live2D 占满整个屏幕 -->
    <section class="stage">
      <div id="live2d-container" class="live2d-container">
        <canvas id="live2d-canvas"></canvas>
      </div>

      <div id="loading" class="loading-card" v-show="booting">
        <div class="loading-logo">SL</div>
        <div>{{ bootMessage }}</div>
      </div>

      <!-- 舞台左下：角色身份卡 -->
      <div class="stage-id-card">
        <div class="stage-id-avatar" aria-hidden="true">{{ assistantInitial }}</div>
        <div class="stage-id-meta">
          <span class="stage-id-name">{{ currentModel || '等待模型' }}</span>
          <span class="stage-id-mood">{{ tr('stage.mood', '在你身边') }}</span>
        </div>
      </div>

      <!-- 舞台右下：浮动操作 -->
      <div class="stage-fab-stack">
        <button type="button" class="stage-fab" @click="cycleBackground" :title="currentBackgroundLabel">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="1.6" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span class="stage-fab-label">{{ currentBackgroundLabel }}</span>
        </button>
        <button type="button" class="stage-fab" @click="resetModelPose">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <polyline points="3 4 3 10 9 10" />
          </svg>
          <span class="stage-fab-label">{{ tr('controls.reset_position', '重置位置') }}</span>
        </button>
      </div>
    </section>

    <!-- Top Bar -->
    <header class="top-bar">
      <div class="brand-block">
        <div class="brand-icon"><span class="brand-icon-text">SL</span></div>
        <div class="brand-text">
          <div class="brand-title">SoulLink</div>
          <div class="brand-subtitle">陪你聊天的虚拟伙伴</div>
        </div>
      </div>

      <div class="top-bar-actions">
        <span class="connection-chip" :class="`is-${connectionState}`">
          <span class="connection-dot" aria-hidden="true"></span>
          {{ connectionBadgeText }}
        </span>

        <select v-model="currentModel" @change="onModelSwitch" :title="tr('toolbar.model', '陪伴对象')">
          <option value="">加载模型中</option>
          <option v-for="model in models" :key="model.name" :value="model.name">
            {{ model.name }}
          </option>
        </select>

        <select v-model="language" @change="setLanguage(language)" :title="tr('toolbar.language', '语言')">
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>

        <button
          type="button"
          class="icon-btn"
          :class="{ 'is-active': showControlPanel }"
          :title="showControlPanel ? '关闭控制台' : '打开控制台'"
          :aria-pressed="showControlPanel"
          @click="toggleControlDock"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
            <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
            <circle cx="7" cy="18" r="2" fill="currentColor" stroke="none" />
          </svg>
        </button>

        <button
          type="button"
          class="icon-btn"
          :class="{ 'is-active': showSystemInfo }"
          :title="showSystemInfo ? '隐藏信息' : '显示信息'"
          :aria-pressed="showSystemInfo"
          @click="toggleSystemInfo"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="11" x2="12" y2="16" />
            <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" />
          </svg>
        </button>

        <button type="button" class="icon-btn settings-button" @click="openSettings" title="系统设置" aria-label="系统设置">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Chat Dock: 浮在屏幕底部 -->
    <div class="chat-dock">
      <div ref="chatViewport" class="chat-stream" v-if="messages.length > 0 || isSending">
        <article
          v-for="message in messages"
          :key="message.id"
          class="chat-message"
          :class="`is-${message.role}`"
        >
          <div v-if="message.role === 'assistant'" class="chat-avatar" aria-hidden="true">
            {{ assistantInitial }}
          </div>
          <div class="chat-bubble">{{ message.content }}</div>
        </article>

        <article v-if="isSending" class="chat-message is-assistant">
          <div class="chat-avatar" aria-hidden="true">{{ assistantInitial }}</div>
          <div class="chat-bubble">
            <span class="typing-dots" aria-label="正在思考">
              <span></span><span></span><span></span>
            </span>
          </div>
        </article>
      </div>

      <div class="chat-welcome" v-else>
        <div class="chat-welcome-text">
          <div class="chat-avatar" aria-hidden="true">{{ assistantInitial }}</div>
          <div>你好呀，我在这里陪你。<strong>挑一句开个话头</strong>，或者直接说点什么都好。</div>
        </div>
        <div class="chat-quick-chips">
          <button
            v-for="prompt in quickPrompts"
            :key="prompt.label"
            type="button"
            class="chat-quick-chip"
            :disabled="isSending"
            @click="sendQuickPrompt(prompt.text)"
          >
            {{ prompt.label }}
          </button>
        </div>
      </div>

      <div class="chat-compose">
        <button
          v-if="messages.length > 0"
          type="button"
          class="chat-compose-clear"
          :title="tr('chat.clear', '清空对话')"
          @click="clearChat"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
        <span v-else class="chat-compose-clear" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </span>

        <input
          v-model="chatInput"
          type="text"
          :placeholder="tr('chat.input_placeholder', '想说点什么...')"
          @keydown="onInputEnter"
        />

        <button
          v-if="voiceEnabled"
          type="button"
          class="compose-mic"
          :class="{ recording: voiceState === 'recording' }"
          :title="tr('voice.input', '语音输入')"
          @click="toggleVoiceRecording"
        >
          <svg v-if="voiceState !== 'recording'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>

        <button type="button" class="compose-send" :disabled="isSending" @click="sendChatMessage">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          {{ isSending ? tr('chat.sending', '发送中') : tr('chat.send', '发送') }}
        </button>
      </div>
    </div>

    <!-- Right Drawer: 控制面板（DOM 始终存在，让 legacy JS 能注入） -->
    <transition name="drawer-fade">
      <div v-if="showControlPanel" class="drawer-overlay" @click="toggleControlDock"></div>
    </transition>
    <aside class="drawer" :class="{ 'is-open': showControlPanel }">
      <header class="drawer-header">
        <h3 class="drawer-title">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" />
            <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
            <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
            <circle cx="7" cy="18" r="2" fill="currentColor" stroke="none" />
          </svg>
          表情控制台
        </h3>
        <button type="button" class="drawer-close" @click="toggleControlDock" title="关闭">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      </header>
      <div class="drawer-body">
        <div id="control-panel" class="control-panel"></div>
      </div>
    </aside>

    <!-- System Info Drawer -->
    <transition name="drawer-fade">
      <div v-if="showSystemInfo" class="drawer-overlay" @click="toggleSystemInfo"></div>
    </transition>
    <aside class="drawer" :class="{ 'is-open': showSystemInfo }">
      <header class="drawer-header">
        <h3 class="drawer-title">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="11" x2="12" y2="16" />
            <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" />
          </svg>
          系统信息
        </h3>
        <button type="button" class="drawer-close" @click="toggleSystemInfo" title="关闭">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      </header>
      <div class="drawer-body">
        <div id="system-info" class="system-info-card"></div>
      </div>
    </aside>

    <SettingsPage v-if="showSettings" @close="closeSettings" />
  </div>
</template>
