/**
 * Chat panel logic.
 */

let chatHistory = [];
let isWaitingResponse = false;
let voiceConfig = null;

function tr(key, fallback, params = null) {
    if (window.I18N && typeof window.I18N.t === 'function') {
        return window.I18N.t(key, params, fallback);
    }
    return fallback;
}

function initChat() {
    console.log('Chat module initialized');

    const input = document.getElementById('chat-input');
    if (input) {
        input.focus();
    }

    updateChatConnectionStatus();
    refreshChatLanguage();
    initVoiceServices();
}

async function initVoiceServices() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        voiceConfig = config.voice;

        if (voiceConfig?.asr && window.ASRService) {
            const asrEnabled = window.ASRService.init(voiceConfig.asr);
            if (asrEnabled) {
                setupASRButton();

                window.ASRService.onResult = (text, isFinal) => {
                    if (isFinal) {
                        handleASRResult(text);
                    } else {
                        const input = document.getElementById('chat-input');
                        if (input) input.value = text;
                    }
                };

                window.ASRService.onStateChange = (state) => {
                    updateVoiceButtonState(state);
                };

                window.ASRService.onError = (error) => {
                    console.error('ASR error:', error);
                    addMessageToUI(
                        `${tr('voice.asr_error', 'Speech recognition error')}: ${error}`,
                        'system'
                    );
                };
            }
        }

        if (voiceConfig?.tts && window.TTSService) {
            window.TTSService.init(voiceConfig.tts);
        }
    } catch (error) {
        console.error('Voice service initialization failed:', error);
    }
}

function setupASRButton() {
    const voiceBtn = document.getElementById('voice-btn');
    if (!voiceBtn) return;
    voiceBtn.style.display = 'flex';
    updateVoiceButtonState('idle');
}

async function toggleVoiceRecording() {
    if (!window.ASRService || !window.ASRService.isAvailable()) {
        addMessageToUI(tr('voice.unavailable', 'Speech recognition unavailable'), 'system');
        return;
    }

    if (window.ASRService.isRecording) {
        await window.ASRService.stop();
    } else {
        await window.ASRService.start();
    }
}

function updateVoiceButtonState(state) {
    const btn = document.getElementById('voice-btn');
    if (!btn) return;

    switch (state) {
        case 'recording':
            btn.textContent = 'Stop';
            btn.classList.add('recording');
            btn.title = tr('voice.stop_recording', 'Stop recording');
            break;
        case 'processing':
            btn.textContent = '...';
            btn.classList.remove('recording');
            btn.title = tr('voice.processing', 'Processing...');
            break;
        default:
            btn.textContent = 'Mic';
            btn.classList.remove('recording');
            btn.title = tr('voice.start_recording', 'Start voice input');
            break;
    }
}

function handleASRResult(text) {
    const input = document.getElementById('chat-input');
    if (input) input.value = text;

    if (voiceConfig?.asr?.autoSend) {
        sendChatMessage();
    }
}

function updateChatConnectionStatus() {
    const header = document.querySelector('.chat-header h3');
    if (!header || typeof wsClient === 'undefined') return;

    const statusDot = wsClient.connected ? '●' : '○';
    header.innerHTML = `${tr('chat.title', 'AI Chat')} <span style="font-size:12px;">${statusDot}</span>`;
}

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

function clearChat() {
    chatHistory = [];
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = `<div class="chat-message system">${tr('chat.cleared', 'Chat history cleared. Start a new conversation.')}</div>`;
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

function addMessageToUI(content, role = 'user') {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    messageDiv.textContent = content;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return messageDiv;
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message assistant typing';
    typingDiv.id = 'typing-indicator';
    typingDiv.textContent = tr('chat.thinking', 'AI is thinking...');
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeTypingIndicator() {
    const typingDiv = document.getElementById('typing-indicator');
    if (typingDiv) typingDiv.remove();
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const message = input.value.trim();

    if (!message || isWaitingResponse) return;

    addMessageToUI(message, 'user');
    chatHistory.push({ role: 'user', content: message });
    input.value = '';

    isWaitingResponse = true;
    sendBtn.disabled = true;
    sendBtn.textContent = tr('chat.sending', 'Sending...');
    showTypingIndicator();

    try {
        if (typeof wsClient !== 'undefined' && wsClient.connected) {
            wsClient.send({
                type: 'chat_with_reply',
                message,
                history: chatHistory.slice(-10),
                autoReset: true
            });
        } else {
            removeTypingIndicator();
            addMessageToUI(tr('chat.server_disconnected', 'Server disconnected. Refresh the page and retry.'), 'system');
        }
    } catch (error) {
        console.error('Send message failed:', error);
        removeTypingIndicator();
        addMessageToUI(`${tr('chat.send_failed', 'Send failed')}: ${error.message}`, 'system');
    }
}

function handleChatResponse(data) {
    const sendBtn = document.getElementById('chat-send');

    removeTypingIndicator();
    isWaitingResponse = false;
    sendBtn.disabled = false;
    sendBtn.textContent = tr('chat.send', 'Send');

    if (data.error) {
        addMessageToUI(`${tr('chat.error', 'Error')}: ${data.error}`, 'system');
        return;
    }

    if (data.reply) {
        addMessageToUI(data.reply, 'assistant');
        chatHistory.push({ role: 'assistant', content: data.reply });

        if (window.TTSService && window.TTSService.isEnabled()) {
            window.TTSService.speak(data.reply);
        }
    }
}

function handleChatError(error) {
    const sendBtn = document.getElementById('chat-send');
    removeTypingIndicator();
    isWaitingResponse = false;
    sendBtn.disabled = false;
    sendBtn.textContent = tr('chat.send', 'Send');
    addMessageToUI(`${tr('chat.error', 'Error')}: ${error}`, 'system');
}

function refreshChatLanguage() {
    if (window.I18N) {
        window.I18N.applyPageTranslations(document);
    }

    updateChatConnectionStatus();
    updateVoiceButtonState(window.ASRService?.isRecording ? 'recording' : 'idle');

    const sendBtn = document.getElementById('chat-send');
    if (sendBtn && !isWaitingResponse) {
        sendBtn.textContent = tr('chat.send', 'Send');
    }
}

window.initChat = initChat;
window.toggleChatPanel = toggleChatPanel;
window.clearChat = clearChat;
window.handleChatKeyPress = handleChatKeyPress;
window.sendChatMessage = sendChatMessage;
window.handleChatResponse = handleChatResponse;
window.handleChatError = handleChatError;
window.updateChatConnectionStatus = updateChatConnectionStatus;
window.refreshChatLanguage = refreshChatLanguage;
