<script setup>
import { ref, onMounted, computed } from 'vue';

const emit = defineEmits(['close']);

const loading = ref(true);
const saving = ref(false);
const viewMode = ref('form'); // 'form' or 'json'
const config = ref({});
const jsonText = ref('');
const saveMessage = ref('');
const saveError = ref('');

// 表单数据
const formData = ref({
  server: { host: '0.0.0.0', port: 3000, modelDirs: ['./l2d'] },
  llm: {
    mode: 'api',
    api: {
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 500,
      expression: {},
      chat: {}
    },
    local: {
      baseModelPath: './ct2model/models/qwen2.5-1.5b-instruct',
      loraModelPath: './ct2model/output/l2d-motion-lora/final',
      device: 'auto',
      temperature: 0.1,
      maxNewTokens: 512
    }
  },
  animation: {
    defaultDuration: 1000,
    easing: 'easeInOutCubic',
    autoResetDelay: 3000,
    eyeOpenBinary: false,
    jointMotionBoost: 1.25,
    layeredParameters: true,
    ttsMotionKeepLipSync: true
  },
  model: {
    directory: './l2d',
    defaultScale: 0.8
  },
  ui: {
    showControlPanel: true,
    showPhysicsParams: false,
    defaultBackground: 0,
    language: 'auto'
  },
  voice: {
    asr: {
      enabled: true,
      mode: 'browser',
      language: 'zh-CN',
      autoSend: true,
      local: {
        modelPath: './models/whisper',
        modelSize: 'base'
      }
    },
    tts: {
      enabled: false,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'tts-1',
      voice: 'alloy',
      speed: 1.0,
      lipSync: {
        mouthOpenIntensity: 0.6
      }
    }
  },
  experimental: {
    imageGen: {
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      temperature: 0
    }
  }
});

const easingOptions = [
  'linear',
  'easeInQuad',
  'easeOutQuad',
  'easeInOutQuad',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeInOutSine'
];

const languageOptions = [
  { value: 'auto', label: '自动 (Auto)' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' }
];

const llmProviders = ['openai', 'deepseek', 'claude', 'ollama', 'siliconflow', 'custom'];
const asrModes = ['browser', 'local'];
const ttsVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

const isJsonValid = computed(() => {
  if (viewMode.value !== 'json') return true;
  try {
    JSON.parse(jsonText.value);
    return true;
  } catch {
    return false;
  }
});

async function loadConfig() {
  loading.value = true;
  try {
    const response = await fetch('/api/config/full');
    if (response.ok) {
      config.value = await response.json();
      formData.value = JSON.parse(JSON.stringify(config.value));
      jsonText.value = JSON.stringify(config.value, null, 2);
    }
  } catch (error) {
    console.error('加载配置失败:', error);
    saveError.value = '加载配置失败: ' + error.message;
  } finally {
    loading.value = false;
  }
}

function switchToForm() {
  if (viewMode.value === 'json' && isJsonValid.value) {
    try {
      formData.value = JSON.parse(jsonText.value);
    } catch (error) {
      saveError.value = 'JSON 格式错误，无法切换到表单视图';
      return;
    }
  }
  viewMode.value = 'form';
  saveError.value = '';
}

function switchToJson() {
  jsonText.value = JSON.stringify(formData.value, null, 2);
  viewMode.value = 'json';
  saveError.value = '';
}

async function saveConfig() {
  saving.value = true;
  saveMessage.value = '';
  saveError.value = '';

  try {
    let configToSave = formData.value;

    if (viewMode.value === 'json') {
      if (!isJsonValid.value) {
        saveError.value = 'JSON 格式错误，请检查语法';
        saving.value = false;
        return;
      }
      configToSave = JSON.parse(jsonText.value);
    }

    const response = await fetch('/api/config/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configToSave)
    });

    const result = await response.json();

    if (result.success) {
      saveMessage.value = '配置已保存！页面将在 2 秒后刷新...';
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      saveError.value = '保存失败: ' + (result.error || '未知错误');
    }
  } catch (error) {
    saveError.value = '保存失败: ' + error.message;
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadConfig();
});
</script>

<template>
  <div class="settings-overlay">
    <div class="settings-modal">
      <div class="settings-header">
        <h2>系统设置</h2>
        <button class="close-button" @click="emit('close')" :disabled="saving" aria-label="关闭设置">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      <div class="settings-toolbar">
        <div class="view-switcher">
          <button
            :class="['view-button', { active: viewMode === 'form' }]"
            @click="switchToForm"
            :disabled="saving"
          >
            表单视图
          </button>
          <button
            :class="['view-button', { active: viewMode === 'json' }]"
            @click="switchToJson"
            :disabled="saving"
          >
            JSON 编辑器
          </button>
        </div>

        <div class="action-buttons">
          <button class="save-button" @click="saveConfig" :disabled="saving || !isJsonValid">
            {{ saving ? '保存中...' : '保存配置' }}
          </button>
        </div>
      </div>

      <div v-if="saveMessage" class="message success">{{ saveMessage }}</div>
      <div v-if="saveError" class="message error">{{ saveError }}</div>

      <div class="settings-content">
        <div v-if="loading" class="loading-state">加载配置中...</div>

        <!-- 表单视图 -->
        <div v-else-if="viewMode === 'form'" class="form-view">
          <!-- 服务器配置 -->
          <section class="config-section">
            <h3>服务器配置</h3>
            <div class="form-group">
              <label>主机地址</label>
              <input v-model="formData.server.host" type="text" />
            </div>
            <div class="form-group">
              <label>端口</label>
              <input v-model.number="formData.server.port" type="number" />
            </div>
            <div class="form-group">
              <label>模型目录（每行一个）</label>
              <textarea
                :value="formData.server.modelDirs.join('\n')"
                @input="formData.server.modelDirs = $event.target.value.split('\n').filter(Boolean)"
                rows="3"
              ></textarea>
            </div>
          </section>

          <!-- LLM 配置 -->
          <section class="config-section">
            <h3>LLM 配置</h3>
            <div class="form-group">
              <label>模式</label>
              <select v-model="formData.llm.mode">
                <option value="api">API 模式</option>
                <option value="local">本地模型</option>
              </select>
            </div>

            <div v-if="formData.llm.mode === 'api'">
              <!-- 基础 API 配置 -->
              <div class="subsection">
                <h4>基础 API 配置（默认配置）</h4>
                <div class="form-group">
                  <label>提供商</label>
                  <select v-model="formData.llm.api.provider">
                    <option v-for="p in llmProviders" :key="p" :value="p">{{ p }}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>API Key</label>
                  <input v-model="formData.llm.api.apiKey" type="password" />
                </div>
                <div class="form-group">
                  <label>Base URL</label>
                  <input v-model="formData.llm.api.baseUrl" type="text" />
                </div>
                <div class="form-group">
                  <label>模型</label>
                  <input v-model="formData.llm.api.model" type="text" />
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Temperature</label>
                    <input v-model.number="formData.llm.api.temperature" type="number" step="0.1" min="0" max="2" />
                  </div>
                  <div class="form-group">
                    <label>Max Tokens</label>
                    <input v-model.number="formData.llm.api.maxTokens" type="number" />
                  </div>
                </div>
              </div>

              <!-- 表情生成专用配置 -->
              <div class="subsection advanced-config">
                <h4>表情生成专用配置（可选）</h4>
                <p class="config-hint">配置后可以为表情生成使用不同的模型/API，不填则继承上面的基础配置</p>
                <div class="form-group">
                  <label>提供商</label>
                  <input v-model="formData.llm.api.expression.provider" type="text" placeholder="留空则继承基础配置" />
                </div>
                <div class="form-group">
                  <label>API Key</label>
                  <input v-model="formData.llm.api.expression.apiKey" type="password" placeholder="留空则继承基础配置" />
                </div>
                <div class="form-group">
                  <label>Base URL</label>
                  <input v-model="formData.llm.api.expression.baseUrl" type="text" placeholder="留空则继承基础配置" />
                </div>
                <div class="form-group">
                  <label>模型（推荐使用轻量模型，响应快）</label>
                  <input v-model="formData.llm.api.expression.model" type="text" placeholder="如: gpt-4o-mini" />
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Temperature</label>
                    <input v-model.number="formData.llm.api.expression.temperature" type="number" step="0.1" min="0" max="2" placeholder="留空则继承" />
                  </div>
                  <div class="form-group">
                    <label>Max Tokens</label>
                    <input v-model.number="formData.llm.api.expression.maxTokens" type="number" placeholder="留空则继承" />
                  </div>
                </div>
              </div>

              <!-- 聊天对话专用配置 -->
              <div class="subsection advanced-config">
                <h4>聊天对话专用配置（可选）</h4>
                <p class="config-hint">配置后可以为聊天对话使用不同的模型/API，可以使用更强大的模型获得更好的对话质量</p>
                <div class="form-group">
                  <label>提供商</label>
                  <input v-model="formData.llm.api.chat.provider" type="text" placeholder="留空则继承基础配置" />
                </div>
                <div class="form-group">
                  <label>API Key</label>
                  <input v-model="formData.llm.api.chat.apiKey" type="password" placeholder="留空则继承基础配置" />
                </div>
                <div class="form-group">
                  <label>Base URL</label>
                  <input v-model="formData.llm.api.chat.baseUrl" type="text" placeholder="留空则继承基础配置" />
                </div>
                <div class="form-group">
                  <label>模型</label>
                  <input v-model="formData.llm.api.chat.model" type="text" placeholder="如: gpt-4o" />
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Temperature</label>
                    <input v-model.number="formData.llm.api.chat.temperature" type="number" step="0.1" min="0" max="2" placeholder="留空则继承" />
                  </div>
                  <div class="form-group">
                    <label>Max Tokens</label>
                    <input v-model.number="formData.llm.api.chat.maxTokens" type="number" placeholder="留空则继承" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 动画配置 -->
          <section class="config-section">
            <h3>动画配置</h3>
            <div class="form-row">
              <div class="form-group">
                <label>过渡时间 (ms)</label>
                <input v-model.number="formData.animation.defaultDuration" type="number" />
              </div>
              <div class="form-group">
                <label>缓动函数</label>
                <select v-model="formData.animation.easing">
                  <option v-for="e in easingOptions" :key="e" :value="e">{{ e }}</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>自动重置延迟 (ms)</label>
                <input v-model.number="formData.animation.autoResetDelay" type="number" />
              </div>
              <div class="form-group">
                <label>关节动作增强</label>
                <input v-model.number="formData.animation.jointMotionBoost" type="number" step="0.05" />
              </div>
            </div>
            <div class="form-group checkbox-group">
              <label>
                <input v-model="formData.animation.eyeOpenBinary" type="checkbox" />
                眼睛开合二值化
              </label>
              <label>
                <input v-model="formData.animation.layeredParameters" type="checkbox" />
                启用分层参数管理系统
              </label>
              <label>
                <input v-model="formData.animation.ttsMotionKeepLipSync" type="checkbox" />
                TTS 期间保持口型同步
              </label>
            </div>
          </section>

          <!-- UI 配置 -->
          <section class="config-section">
            <h3>界面配置</h3>
            <div class="form-row">
              <div class="form-group">
                <label>语言</label>
                <select v-model="formData.ui.language">
                  <option v-for="lang in languageOptions" :key="lang.value" :value="lang.value">
                    {{ lang.label }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>默认背景索引</label>
                <input v-model.number="formData.ui.defaultBackground" type="number" min="0" />
              </div>
            </div>
            <div class="form-group checkbox-group">
              <label>
                <input v-model="formData.ui.showControlPanel" type="checkbox" />
                显示控制面板
              </label>
              <label>
                <input v-model="formData.ui.showPhysicsParams" type="checkbox" />
                显示物理参数
              </label>
            </div>
          </section>

          <!-- 语音配置 -->
          <section class="config-section">
            <h3>语音配置</h3>
            <div class="subsection">
              <h4>ASR (语音识别)</h4>
              <div class="form-group checkbox-group">
                <label>
                  <input v-model="formData.voice.asr.enabled" type="checkbox" />
                  启用 ASR
                </label>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>模式</label>
                  <select v-model="formData.voice.asr.mode">
                    <option v-for="m in asrModes" :key="m" :value="m">{{ m }}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>语言</label>
                  <input v-model="formData.voice.asr.language" type="text" />
                </div>
              </div>
              <div class="form-group checkbox-group">
                <label>
                  <input v-model="formData.voice.asr.autoSend" type="checkbox" />
                  识别后自动发送
                </label>
              </div>
            </div>

            <div class="subsection">
              <h4>TTS (语音合成)</h4>
              <div class="form-group checkbox-group">
                <label>
                  <input v-model="formData.voice.tts.enabled" type="checkbox" />
                  启用 TTS
                </label>
              </div>
              <div class="form-group">
                <label>Base URL</label>
                <input v-model="formData.voice.tts.baseUrl" type="text" />
              </div>
              <div class="form-group">
                <label>API Key</label>
                <input v-model="formData.voice.tts.apiKey" type="password" />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>模型</label>
                  <input v-model="formData.voice.tts.model" type="text" />
                </div>
                <div class="form-group">
                  <label>声音</label>
                  <select v-model="formData.voice.tts.voice">
                    <option v-for="v in ttsVoices" :key="v" :value="v">{{ v }}</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>语速 (0.25 - 4.0)</label>
                <input v-model.number="formData.voice.tts.speed" type="number" step="0.1" min="0.25" max="4" />
              </div>
              <div class="form-group">
                <label>口型同步 - 嘴巴开合幅度 (0.0 - 1.0)</label>
                <input v-model.number="formData.voice.tts.lipSync.mouthOpenIntensity" type="number" step="0.05" min="0" max="1" />
                <small style="color: #aaa; font-size: 0.85em; margin-top: 4px; display: block;">推荐值: 0.5-0.8 为较自然的开合幅度</small>
              </div>
            </div>
          </section>

          <!-- 实验性功能配置 -->
          <section class="config-section">
            <h3>实验性功能</h3>
            <div class="subsection">
              <h4>AI 图像生成 (用于前景蒙版提取)</h4>
              <div class="form-group">
                <label>提供商</label>
                <select v-model="formData.experimental.imageGen.provider">
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div class="form-group">
                <label>Base URL</label>
                <input v-model="formData.experimental.imageGen.baseUrl" type="text" placeholder="https://api.openai.com/v1" />
              </div>
              <div class="form-group">
                <label>API Key</label>
                <input v-model="formData.experimental.imageGen.apiKey" type="password" />
              </div>
              <div class="form-group">
                <label>模型</label>
                <input v-model="formData.experimental.imageGen.model" type="text" placeholder="gpt-4o" />
              </div>
              <div class="form-group">
                <label>Temperature</label>
                <input v-model.number="formData.experimental.imageGen.temperature" type="number" step="0.1" min="0" max="2" />
              </div>
            </div>
          </section>
        </div>

        <!-- JSON 视图 -->
        <div v-else-if="viewMode === 'json'" class="json-view">
          <textarea
            v-model="jsonText"
            class="json-editor"
            :class="{ invalid: !isJsonValid }"
            spellcheck="false"
          ></textarea>
          <div v-if="!isJsonValid" class="json-error">JSON 格式错误，请检查语法</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 6, 10, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.settings-modal {
  background: linear-gradient(135deg, #422b38 0%, #322028 100%);
  border-radius: 18px;
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px rgba(30, 12, 18, 0.55);
  border: 1px solid rgba(247, 199, 167, 0.24);
  color: #fef4ec;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(247, 199, 167, 0.14);
}

.settings-header h2 {
  margin: 0;
  font-size: 22px;
  color: #fef0e3;
  font-weight: 600;
}

.close-button {
  background: rgba(40, 22, 28, 0.8);
  border: 1px solid rgba(247, 199, 167, 0.18);
  color: rgba(245, 220, 200, 0.78);
  cursor: pointer;
  padding: 0;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.close-button:hover {
  background: rgba(244, 165, 116, 0.16);
  color: #f7c7a7;
  border-color: rgba(244, 165, 116, 0.5);
}

.settings-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(247, 199, 167, 0.14);
  gap: 16px;
}

.view-switcher {
  display: flex;
  gap: 8px;
}

.view-button {
  padding: 8px 18px;
  background: rgba(40, 22, 28, 0.7);
  border: 1px solid rgba(247, 199, 167, 0.18);
  color: rgba(245, 220, 200, 0.78);
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
  font-size: 14px;
}

.view-button:hover {
  background: rgba(244, 165, 116, 0.14);
  color: #f7c7a7;
  border-color: rgba(244, 165, 116, 0.42);
}

.view-button.active {
  background: linear-gradient(135deg, rgba(232, 137, 92, 0.42), rgba(232, 154, 166, 0.32));
  border-color: rgba(244, 165, 116, 0.6);
  color: #fef0e3;
}

.save-button {
  padding: 9px 22px;
  background: linear-gradient(135deg, #e8895c, #e89aa6);
  border: none;
  color: #fff8f0;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: transform 0.15s, box-shadow 0.2s, filter 0.2s;
  box-shadow: 0 6px 16px rgba(232, 137, 92, 0.3);
}

.save-button:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow: 0 10px 22px rgba(232, 137, 92, 0.42);
}

.save-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.message {
  padding: 12px 24px;
  margin: 0;
  font-size: 14px;
}

.message.success {
  background: rgba(168, 213, 159, 0.14);
  color: #b8db9e;
  border-bottom: 1px solid rgba(168, 213, 159, 0.28);
}

.message.error {
  background: rgba(232, 128, 128, 0.14);
  color: #f0a8a8;
  border-bottom: 1px solid rgba(232, 128, 128, 0.32);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.settings-content::-webkit-scrollbar {
  width: 6px;
}

.settings-content::-webkit-scrollbar-thumb {
  background: rgba(247, 199, 167, 0.32);
  border-radius: 999px;
}

.loading-state {
  text-align: center;
  padding: 40px;
  color: rgba(245, 220, 200, 0.7);
}

.form-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-section {
  background: rgba(58, 38, 50, 0.7);
  border: 1px solid rgba(247, 199, 167, 0.18);
  border-radius: 12px;
  padding: 20px;
}

.config-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #fce4d2;
  border-bottom: 1px solid rgba(247, 199, 167, 0.14);
  padding-bottom: 8px;
  font-weight: 600;
}

.subsection {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(247, 199, 167, 0.1);
}

.subsection h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: rgba(245, 220, 200, 0.78);
  font-weight: 600;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  color: rgba(245, 220, 200, 0.78);
  font-size: 13px;
}

.form-group input[type="text"],
.form-group input[type="password"],
.form-group input[type="number"],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 9px 12px;
  background: rgba(20, 10, 14, 0.8);
  border: 1px solid rgba(247, 199, 167, 0.18);
  border-radius: 8px;
  color: #fbf3ec;
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.form-group textarea {
  resize: vertical;
  font-family: 'Consolas', 'Monaco', monospace;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: rgba(244, 165, 116, 0.65);
  background: rgba(28, 14, 20, 0.9);
  box-shadow: 0 0 0 3px rgba(244, 165, 116, 0.14);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: rgba(245, 220, 200, 0.85);
}

.checkbox-group input[type="checkbox"] {
  width: auto;
  cursor: pointer;
  accent-color: #f4a574;
}

.json-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.json-editor {
  flex: 1;
  width: 100%;
  min-height: 500px;
  padding: 16px;
  background: rgba(20, 10, 14, 0.85);
  border: 1px solid rgba(247, 199, 167, 0.18);
  border-radius: 10px;
  color: #fbf3ec;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.json-editor.invalid {
  border-color: rgba(232, 128, 128, 0.6);
}

.json-editor:focus {
  outline: none;
  border-color: rgba(244, 165, 116, 0.65);
  box-shadow: 0 0 0 3px rgba(244, 165, 116, 0.14);
}

.json-error {
  margin-top: 8px;
  color: #f0a8a8;
  font-size: 13px;
}

@media (max-width: 768px) {
  .settings-modal {
    max-width: 100%;
    max-height: 100vh;
    border-radius: 0;
  }

  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
