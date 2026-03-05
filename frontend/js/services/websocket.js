/**
 * SoulLink - WebSocket 客户端
 * 与后端服务器通信
 */

class SoulLinkClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.models = [];
        this.currentModel = null;
        
        // 事件回调
        this.onConnected = null;
        this.onDisconnected = null;
        this.onModelList = null;
        this.onLoadModel = null;
        this.onExpression = null;
        this.onTTSMotionStart = null;
        this.onTTSMotionFrame = null;
        this.onTTSMotionDone = null;
        this.onTTSMotionError = null;
        this.onError = null;
    }
    
    /**
     * 连接到 WebSocket 服务器
     */
    connect(url = null) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('WebSocket 已连接');
            return Promise.resolve();
        }
        
        // 自动构建 WebSocket URL
        if (!url) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.hostname || 'localhost';
            const port = window.location.port || '3000';
            url = `${protocol}//${host}:${port}/ws`;
        }
        
        return new Promise((resolve, reject) => {
            console.log(`🔌 连接 WebSocket: ${url}`);
            
            try {
                this.ws = new WebSocket(url);
            } catch (e) {
                console.warn('WebSocket 连接失败，使用本地模式');
                reject(e);
                return;
            }
            
            this.ws.onopen = () => {
                console.log('✅ WebSocket 已连接');
                this.connected = true;
                this.reconnectAttempts = 0;
                if (typeof window.setSystemConnectionState === 'function') {
                    window.setSystemConnectionState(true);
                }
                
                if (this.onConnected) this.onConnected();
                resolve();
            };
            
            this.ws.onclose = (event) => {
                console.log(`🔌 WebSocket 断开: ${event.code}`);
                this.connected = false;
                if (typeof window.setSystemConnectionState === 'function') {
                    window.setSystemConnectionState(false);
                }
                
                if (this.onDisconnected) this.onDisconnected();
                
                // 自动重连
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`⏳ ${this.reconnectDelay/1000}秒后重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                    setTimeout(() => this.connect(url), this.reconnectDelay);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('❌ WebSocket 错误:', error);
                if (this.onError) this.onError(error);
                reject(error);
            };
            
            this.ws.onmessage = (event) => {
                this._handleMessage(event.data);
            };
        });
    }
    
    /**
     * 处理服务器消息
     */
    _handleMessage(data) {
        try {
            const msg = JSON.parse(data);
            console.log('📨 收到消息:', msg.type, msg);
            
            switch (msg.type) {
                case 'model_list':
                    this.models = msg.models || [];
                    this.currentModel = msg.current;
                    console.log(`📦 发现 ${this.models.length} 个模型:`, this.models.map(m => m.name));
                    if (this.onModelList) this.onModelList(this.models, this.currentModel);
                    break;
                    
                case 'load_model':
                    console.log('📦 加载模型:', msg.model);
                    if (this.onLoadModel) this.onLoadModel(msg.model);
                    break;
                    
                case 'expression':
                    console.log('🎭 收到表情指令:', msg);
                    if (this.onExpression) this.onExpression(msg);
                    break;

                case 'tts_motion_start':
                    if (this.onTTSMotionStart) this.onTTSMotionStart(msg);
                    break;

                case 'tts_motion_frame':
                    if (this.onTTSMotionFrame) this.onTTSMotionFrame(msg);
                    break;

                case 'tts_motion_done':
                    if (this.onTTSMotionDone) this.onTTSMotionDone(msg);
                    break;

                case 'tts_motion_error':
                    if (this.onTTSMotionError) this.onTTSMotionError(msg);
                    break;
                    
                case 'reset':
                    console.log('🔄 重置表情');
                    if (window.resetExpression) {
                        window.resetExpression(msg.duration || 800);
                    }
                    break;
                    
                case 'parameters_updated':
                    console.log(`✅ 参数已同步: ${msg.count} 个`);
                    break;
                
                case 'chat_response':
                    // 聊天回复（包含回复文本和表情）
                    console.log('💬 收到聊天回复:', msg);

                    // 先取消之前的自动重置，防止冲突
                    if (window.cancelAutoReset) {
                        window.cancelAutoReset();
                    }

                    if (window.handleChatResponse) {
                        window.handleChatResponse(msg);
                    }

                    // 同时应用表情
                    console.log('🔍 检查表情应用条件:');
                    console.log('  - msg.parameters 存在:', !!msg.parameters);
                    console.log('  - msg.parameters 内容:', msg.parameters);
                    console.log('  - window.transitionToExpression 存在:', typeof window.transitionToExpression);

                    if (msg.parameters && window.transitionToExpression) {
                        console.log('✅ 准备调用 transitionToExpression');
                        window.transitionToExpression(
                            msg.parameters,
                            msg.duration || 800,
                            null,
                            msg.autoReset || false
                        );
                    } else {
                        console.warn('❌ 表情应用条件不满足');
                    }
                    break;
                
                case 'chat_error':
                    // 聊天错误
                    console.error('💬 聊天错误:', msg.error);
                    if (window.handleChatError) {
                        window.handleChatError(msg.error);
                    }
                    break;
                    
                case 'error':
                    console.error('❌ 服务器错误:', msg.message);
                    if (this.onError) this.onError(new Error(msg.message));
                    break;
                    
                case 'pong':
                    // 心跳响应
                    break;
                    
                default:
                    console.log('未知消息类型:', msg.type);
            }
        } catch (e) {
            console.error('解析消息失败:', e, data);
        }
    }
    
    /**
     * 发送消息到服务器
     */
    send(message) {
        if (!this.connected || !this.ws) {
            console.warn('WebSocket 未连接');
            return false;
        }
        
        this.ws.send(JSON.stringify(message));
        return true;
    }
    
    /**
     * 请求加载指定模型
     */
    loadModel(modelName) {
        return this.send({
            type: 'load_model',
            model: modelName
        });
    }
    
    /**
     * 上报模型参数给服务器
     */
    updateParameters(parameters) {
        return this.send({
            type: 'update_parameters',
            parameters: parameters
        });
    }
    
    /**
     * 发送聊天消息，触发 LLM 生成表情
     */
    chat(message, context = '', autoReset = true) {
        return this.send({
            type: 'chat',
            message: message,
            context: context,
            autoReset: autoReset
        });
    }

    /**
     * 启动 TTS 播放期连续动作会话
     */
    startTTSMotion(sessionId, text, durationSec, context = '') {
        return this.send({
            type: 'tts_motion_start',
            sessionId,
            text,
            durationSec,
            context
        });
    }

    /**
     * 停止 TTS 播放期连续动作会话
     */
    stopTTSMotion(sessionId) {
        return this.send({
            type: 'tts_motion_stop',
            sessionId
        });
    }
    
    /**
     * 直接发送表情参数
     */
    setExpression(parameters, duration = 800, autoReset = false) {
        return this.send({
            type: 'expression',
            parameters: parameters,
            duration: duration,
            autoReset: autoReset
        });
    }
    
    /**
     * 重置表情
     */
    reset(duration = 800) {
        return this.send({
            type: 'reset',
            duration: duration
        });
    }
    
    /**
     * 心跳检测
     */
    ping() {
        return this.send({ type: 'ping' });
    }
    
    /**
     * 断开连接
     */
    disconnect() {
        if (this.ws) {
            this.maxReconnectAttempts = 0; // 禁止重连
            this.ws.close();
            this.ws = null;
        }
    }
}

// ============================================
// 全局实例和初始化
// ============================================

const wsClient = new SoulLinkClient();

// 模型列表更新回调
wsClient.onModelList = (models, current) => {
    updateModelSelector(models, current);
    
    // 如果有模型但未加载，自动加载第一个
    if (models.length > 0 && !current && !window.model) {
        console.log('🚀 自动加载第一个模型:', models[0].name);
        wsClient.loadModel(models[0].name);
    }
};

// 加载模型回调
wsClient.onLoadModel = async (modelInfo) => {
    if (window.loadModelFromServer) {
        await window.loadModelFromServer(modelInfo);
    }
};

// 表情指令回调
wsClient.onExpression = (msg) => {
    if (window.transitionToExpression && msg.parameters) {
        window.transitionToExpression(
            msg.parameters,
            msg.duration || 800,
            null,
            msg.autoReset || false
        );
    }
};

// 错误回调
wsClient.onError = (error) => {
    console.error('WebSocket 错误:', error);
};

/**
 * 更新模型选择器 UI
 */
function updateModelSelector(models, currentModel) {
    let selector = document.getElementById('model-selector');
    
    if (!selector) {
        // 创建模型选择器
        const container = document.createElement('div');
        container.id = 'model-selector-container';
        container.innerHTML = `
            <label>📦 模型: </label>
            <select id="model-selector" onchange="onModelSelect(this.value)">
                <option value="">选择模型...</option>
            </select>
            <span id="ws-status" style="margin-left: 10px;">🔴</span>
        `;
        container.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 1000;
            background: rgba(0,0,0,0.7);
            padding: 8px 12px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
        `;
        document.body.appendChild(container);
        selector = document.getElementById('model-selector');
    }
    
    // 更新选项
    selector.innerHTML = '<option value="">选择模型...</option>';
    for (const model of models) {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.name;
        if (model.name === currentModel) {
            option.selected = true;
        }
        selector.appendChild(option);
    }
    
    // 更新连接状态
    const status = document.getElementById('ws-status');
    if (status) {
        status.textContent = wsClient.connected ? '🟢' : '🔴';
        status.title = wsClient.connected ? '已连接服务器' : '未连接';
    }
}

/**
 * 模型选择回调
 */
function onModelSelect(modelName) {
    if (modelName) {
        wsClient.loadModel(modelName);
    }
}

/**
 * 初始化 WebSocket 连接
 */
async function initWebSocket() {
    try {
        await wsClient.connect();
        
        // 连接状态更新
        wsClient.onConnected = () => {
            const status = document.getElementById('ws-status');
            if (status) {
                status.textContent = '🟢';
                status.title = '已连接服务器';
            }
        };
        
        wsClient.onDisconnected = () => {
            const status = document.getElementById('ws-status');
            if (status) {
                status.textContent = '🔴';
                status.title = '未连接';
            }
        };
        
        // 心跳保活
        setInterval(() => {
            if (wsClient.connected) {
                wsClient.ping();
            }
        }, 30000);
        
        return true;
    } catch (e) {
        console.warn('WebSocket 连接失败，使用本地模式:', e.message);
        return false;
    }
}

// ============================================
// 导出
// ============================================

window.wsClient = wsClient;
window.initWebSocket = initWebSocket;
window.onModelSelect = onModelSelect;

// 扩展 SoulLink 接口
if (window.SoulLink) {
    window.SoulLink.ws = wsClient;
    window.SoulLink.chat = (msg, ctx, autoReset) => {
        if (wsClient.connected) {
            return wsClient.chat(msg, ctx, autoReset);
        } else {
            // 回退到本地 LLM 调用
            return window.SoulLink.generateAndApplyExpression(msg, ctx, autoReset);
        }
    };
}

console.log('📡 WebSocket 客户端模块已加载');
