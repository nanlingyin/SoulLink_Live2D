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

const messages = ref([
  {
    id: `sys-${Date.now()}`,
    role: 'system',
    content: '欢迎使用 SoulLink，输入消息后将触发表情与语音联动。'
  }
]);
const chatInput = ref('');
const isSending = ref(false);
const chatHistory = ref([]);
const chatViewport = ref(null);

const voiceEnabled = ref(false);
const ttsEnabled = ref(false);
const voiceState = ref('idle');
const asrAutoSend = ref(false);

const language = ref('zh');
const mobileMode = ref(false);
const mobileTab = ref('chat');

const showControlPanel = ref(true);
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

const backgroundStyle = computed(() => {
  const active = backgroundOptions.value[activeBackgroundIndex.value];
  if (!active) {
    return {
      background:
        'linear-gradient(125deg, rgba(6, 25, 39, 0.95) 0%, rgba(12, 45, 66, 0.92) 45%, rgba(25, 52, 72, 0.9) 100%)'
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
  messages.value = [
    {
      id: `sys-${Date.now()}`,
      role: 'system',
      content: tr('chat.cleared', '聊天已清空，开始新的对话吧。')
    }
  ];
  chatHistory.value = [];
}

async function discoverBackgrounds() {
  const wallpaperCandidates = ['Lynn.png', 'Lynn.jpg', 'Lynn.jpeg', 'wallpaper.png', 'wallpaper.jpg'];
  const availableWallpapers = [
    {
      label: '壁纸 · Lynn.png',
      type: 'image',
      value: '/static/background/Lynn.png'
    }
  ];

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

  const scenicGradients = [
    {
      label: '暮海蓝调',
      type: 'gradient',
      value: 'linear-gradient(125deg, #081623 0%, #12344d 48%, #1d5268 100%)'
    },
    {
      label: '日落铜橙',
      type: 'gradient',
      value: 'linear-gradient(135deg, #1a1826 0%, #4d2d2d 45%, #9e5f35 100%)'
    },
    {
      label: '雨林雾绿',
      type: 'gradient',
      value: 'linear-gradient(135deg, #0f1b1d 0%, #1f3a3a 46%, #3b6b58 100%)'
    }
  ];

  backgroundOptions.value = [...availableWallpapers, ...scenicGradients];

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

    showControlPanel.value = window.getConfig?.('ui.showControlPanel', true) !== false;

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

    <header class="top-bar">
      <div class="brand-block">
        <div class="brand-icon">SL</div>
        <div>
          <div class="brand-title">SoulLink Live2D</div>
          <div class="brand-subtitle">Vue Frontend + Python Backend</div>
        </div>
      </div>

      <div class="toolbar-grid">
        <label class="toolbar-item">
          <span>连接状态</span>
          <strong :class="['connection-chip', `is-${connectionState}`]">{{ connectionBadgeText }}</strong>
        </label>

        <label class="toolbar-item">
          <span>模型</span>
          <select v-model="currentModel" @change="onModelSwitch">
            <option value="">等待模型...</option>
            <option v-for="model in models" :key="model.name" :value="model.name">
              {{ model.name }}
            </option>
          </select>
        </label>

        <label class="toolbar-item">
          <span>语言</span>
          <select v-model="language" @change="setLanguage(language)">
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>

        <button class="settings-button" @click="openSettings" title="系统设置">
          ⚙️
        </button>
      </div>
    </header>

    <main class="workspace" :class="{ mobile: mobileMode }">
      <aside class="panel chat-panel" :class="{ hidden: !showChatPanel }" v-show="showChatPanel && (!mobileMode || mobileTab === 'chat')">
        <div class="panel-header">
          <h3>{{ tr('chat.title', 'AI 对话') }}</h3>
          <button class="text-button" type="button" @click="clearChat">清空</button>
        </div>

        <div ref="chatViewport" class="chat-messages">
          <article
            v-for="message in messages"
            :key="message.id"
            class="chat-message"
            :class="`is-${message.role}`"
          >
            {{ message.content }}
          </article>

          <article v-if="isSending" class="chat-message is-assistant is-typing">AI 正在思考...</article>
        </div>

        <div class="chat-input-area">
          <input
            v-model="chatInput"
            type="text"
            :placeholder="tr('chat.input_placeholder', '输入你的消息...')"
            @keydown="onInputEnter"
          />

          <button
            v-if="voiceEnabled"
            type="button"
            class="icon-button"
            :class="{ recording: voiceState === 'recording' }"
            :title="tr('voice.input', '语音输入')"
            @click="toggleVoiceRecording"
          >
            {{ voiceButtonText }}
          </button>

          <button type="button" class="primary-button" :disabled="isSending" @click="sendChatMessage">
            {{ isSending ? tr('chat.sending', '发送中...') : tr('chat.send', '发送') }}
          </button>
        </div>
      </aside>

      <section class="stage-section">
        <div id="live2d-container" class="live2d-container">
          <div id="loading" class="loading-card">
            <div class="loading-logo">SL</div>
            <div>{{ booting ? bootMessage : tr('loading.model', '正在加载模型...') }}</div>
          </div>

          <canvas id="live2d-canvas"></canvas>

          <div class="stage-actions">
            <button type="button" class="ghost-button" @click="resetModelPose">
              {{ tr('controls.reset_position', '重置位置') }}
            </button>
            <button type="button" class="ghost-button" @click="cycleBackground">
              切换背景 · {{ currentBackgroundLabel }}
            </button>
            <button type="button" class="ghost-button" @click="toggleChatPanel">
              {{ showChatPanel ? '隐藏对话' : '显示对话' }}
            </button>
            <button type="button" class="ghost-button" @click="toggleControlDock">
              {{ showControlPanel ? '隐藏控制' : '显示控制' }}
            </button>
            <button type="button" class="ghost-button" @click="toggleSystemInfo">
              {{ showSystemInfo ? '隐藏信息' : '显示信息' }}
            </button>
          </div>
        </div>

        <div id="system-info" class="system-info-card" v-show="showSystemInfo"></div>
      </section>

      <aside
        class="panel control-panel-shell"
        :class="{ hidden: !showControlPanel }"
        v-show="showControlPanel && (!mobileMode || mobileTab === 'control')"
      >
        <div id="control-panel" class="control-panel"></div>
      </aside>
    </main>

    <div v-if="mobileMode" class="mobile-tabs">
      <button
        type="button"
        class="tab-button"
        :class="{ active: mobileTab === 'chat' }"
        @click="mobileTab = 'chat'"
      >
        对话
      </button>
      <button
        type="button"
        class="tab-button"
        :class="{ active: mobileTab === 'control' }"
        @click="mobileTab = 'control'"
      >
        控制
      </button>
    </div>

    <SettingsPage v-if="showSettings" @close="closeSettings" />
  </div>
</template>
