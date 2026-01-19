/**
 * SoulLink - 聊天模块
 * 处理用户与 AI 的对话交互
 */

// 聊天历史记录
let chatHistory = [];
let isWaitingResponse = false;

/**
 * 初始化聊天模块
 */
function initChat() {
    console.log('💬 聊天模块初始化');
    
    // 设置输入框焦点
    const input = document.getElementById('chat-input');
    if (input) {
        input.focus();
    }
    
    // 检查连接状态并更新UI
    updateChatConnectionStatus();
}

/**
 * 更新聊天连接状态
 */
function updateChatConnectionStatus() {
    const header = document.querySelector('.chat-header h3');
    if (header && typeof wsClient !== 'undefined') {
        const statusDot = wsClient.connected ? '🟢' : '🔴';
        header.innerHTML = `💬 AI 对话 <span style="font-size:12px;">${statusDot}</span>`;
    }
}

/**
 * 切换聊天面板显示/隐藏
 */
function toggleChatPanel() {
    const panel = document.getElementById('chat-panel');
    const toggleBtn = document.getElementById('toggle-chat');
    
    if (panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed');
        toggleBtn.style.display = 'none';
    } else {
        panel.classList.add('collapsed');
        toggleBtn.style.display = 'block';
    }
}

/**
 * 清空聊天记录
 */
function clearChat() {
    chatHistory = [];
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '<div class="chat-message system">聊天记录已清空，开始新的对话 😊</div>';
}

/**
 * 处理键盘事件
 */
function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

/**
 * 添加消息到聊天界面
 */
function addMessageToUI(content, role = 'user') {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    messageDiv.textContent = content;
    messagesContainer.appendChild(messageDiv);
    
    // 滚动到底部
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return messageDiv;
}

/**
 * 显示正在输入指示器
 */
function showTypingIndicator() {
    const messagesContainer = document.getElementById('chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message assistant typing';
    typingDiv.id = 'typing-indicator';
    typingDiv.textContent = 'AI 正在思考';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * 移除正在输入指示器
 */
function removeTypingIndicator() {
    const typingDiv = document.getElementById('typing-indicator');
    if (typingDiv) {
        typingDiv.remove();
    }
}

/**
 * 发送聊天消息
 */
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const message = input.value.trim();
    
    if (!message || isWaitingResponse) {
        return;
    }
    
    // 添加用户消息到UI
    addMessageToUI(message, 'user');
    chatHistory.push({ role: 'user', content: message });
    
    // 清空输入框
    input.value = '';
    
    // 禁用发送按钮
    isWaitingResponse = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '发送中...';
    
    // 显示输入指示器
    showTypingIndicator();
    
    try {
        // 检查 WebSocket 连接
        if (typeof wsClient !== 'undefined' && wsClient.connected) {
            // 通过 WebSocket 发送（使用新的 chat_with_reply 类型）
            wsClient.send({
                type: 'chat_with_reply',
                message: message,
                history: chatHistory.slice(-10), // 发送最近10条历史
                autoReset: true
            });
        } else {
            // WebSocket 未连接，显示错误
            removeTypingIndicator();
            addMessageToUI('⚠️ 未连接到服务器，请刷新页面重试', 'system');
        }
    } catch (error) {
        console.error('发送消息失败:', error);
        removeTypingIndicator();
        addMessageToUI(`❌ 发送失败: ${error.message}`, 'system');
    } finally {
        // 注意：响应处理在 WebSocket 回调中完成
    }
}

/**
 * 处理服务器返回的聊天响应
 * 这个函数会被 websocket-client.js 调用
 */
function handleChatResponse(data) {
    const sendBtn = document.getElementById('chat-send');
    
    // 移除输入指示器
    removeTypingIndicator();
    
    // 重新启用发送按钮
    isWaitingResponse = false;
    sendBtn.disabled = false;
    sendBtn.textContent = '发送';
    
    if (data.error) {
        addMessageToUI(`❌ ${data.error}`, 'system');
        return;
    }
    
    // 添加 AI 回复到聊天
    if (data.reply) {
        addMessageToUI(data.reply, 'assistant');
        chatHistory.push({ role: 'assistant', content: data.reply });
    }
    
    // 表情动作会通过单独的 expression 消息处理
    if (data.expression) {
        console.log('🎭 表情:', data.expression);
    }
}

/**
 * 处理聊天错误
 */
function handleChatError(error) {
    const sendBtn = document.getElementById('chat-send');
    
    removeTypingIndicator();
    isWaitingResponse = false;
    sendBtn.disabled = false;
    sendBtn.textContent = '发送';
    
    addMessageToUI(`❌ 错误: ${error}`, 'system');
}

// 导出到全局
window.initChat = initChat;
window.toggleChatPanel = toggleChatPanel;
window.clearChat = clearChat;
window.handleChatKeyPress = handleChatKeyPress;
window.sendChatMessage = sendChatMessage;
window.handleChatResponse = handleChatResponse;
window.handleChatError = handleChatError;
window.updateChatConnectionStatus = updateChatConnectionStatus;
