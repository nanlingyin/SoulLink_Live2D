const DEFAULT_RECONNECT_DELAY_MS = 2000;

export class SoulLinkWsClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.manualClose = false;

    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = DEFAULT_RECONNECT_DELAY_MS;

    this.models = [];
    this.currentModel = null;

    this.onConnected = null;
    this.onDisconnected = null;
    this.onModelList = null;
    this.onLoadModel = null;
    this.onExpression = null;
    this.onChatResponse = null;
    this.onChatError = null;
    this.onTTSMotionStart = null;
    this.onTTSMotionFrame = null;
    this.onTTSMotionDone = null;
    this.onTTSMotionError = null;
    this.onError = null;

    this.pingTimer = null;
  }

  _buildDefaultUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:3000';
    return `${protocol}//${host}/ws`;
  }

  async connect(url = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true;
    }

    const wsUrl = url || this._buildDefaultUrl();
    this.manualClose = false;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);
      } catch (error) {
        reject(error);
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this._startHeartbeat();
        if (typeof this.onConnected === 'function') {
          this.onConnected();
        }
        resolve(true);
      };

      this.ws.onclose = () => {
        this.connected = false;
        this._stopHeartbeat();
        if (typeof this.onDisconnected === 'function') {
          this.onDisconnected();
        }

        if (!this.manualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts += 1;
          setTimeout(() => {
            this.connect(wsUrl).catch(() => {});
          }, this.reconnectDelay);
        }
      };

      this.ws.onerror = (event) => {
        if (typeof this.onError === 'function') {
          this.onError(event);
        }
        reject(new Error('WebSocket connection error'));
      };

      this.ws.onmessage = (event) => {
        this._handleMessage(event.data);
      };
    });
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.pingTimer = window.setInterval(() => {
      if (this.connected) {
        this.ping();
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  _handleMessage(payload) {
    let message;

    try {
      message = JSON.parse(payload);
    } catch (error) {
      if (typeof this.onError === 'function') {
        this.onError(error);
      }
      return;
    }

    switch (message.type) {
      case 'model_list':
        this.models = message.models || [];
        this.currentModel = message.current || null;
        if (typeof this.onModelList === 'function') {
          this.onModelList(this.models, this.currentModel);
        }
        break;
      case 'load_model':
        if (typeof this.onLoadModel === 'function') {
          this.onLoadModel(message.model);
        }
        break;
      case 'expression':
        if (typeof this.onExpression === 'function') {
          this.onExpression(message);
        }
        break;
      case 'chat_response':
        if (typeof this.onChatResponse === 'function') {
          this.onChatResponse(message);
        }
        break;
      case 'chat_error':
        if (typeof this.onChatError === 'function') {
          this.onChatError(message);
        }
        break;
      case 'tts_motion_start':
        if (typeof this.onTTSMotionStart === 'function') {
          this.onTTSMotionStart(message);
        }
        break;
      case 'tts_motion_frame':
        if (typeof this.onTTSMotionFrame === 'function') {
          this.onTTSMotionFrame(message);
        }
        break;
      case 'tts_motion_done':
        if (typeof this.onTTSMotionDone === 'function') {
          this.onTTSMotionDone(message);
        }
        break;
      case 'tts_motion_error':
        if (typeof this.onTTSMotionError === 'function') {
          this.onTTSMotionError(message);
        }
        break;
      case 'reset':
        if (typeof window.resetExpression === 'function') {
          window.resetExpression(message.duration || 800);
        }
        break;
      case 'error':
        if (typeof this.onError === 'function') {
          this.onError(new Error(message.message || 'Server error'));
        }
        break;
      case 'pong':
        break;
      default:
        break;
    }
  }

  send(message) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.ws.send(JSON.stringify(message));
    return true;
  }

  loadModel(modelName) {
    return this.send({
      type: 'load_model',
      model: modelName
    });
  }

  updateParameters(parameters) {
    return this.send({
      type: 'update_parameters',
      parameters
    });
  }

  chat(message, context = '', autoReset = true) {
    return this.send({
      type: 'chat',
      message,
      context,
      autoReset
    });
  }

  startTTSMotion(sessionId, text, durationSec, context = '') {
    return this.send({
      type: 'tts_motion_start',
      sessionId,
      text,
      durationSec,
      context
    });
  }

  stopTTSMotion(sessionId) {
    return this.send({
      type: 'tts_motion_stop',
      sessionId
    });
  }

  setExpression(parameters, duration = 800, autoReset = false) {
    return this.send({
      type: 'expression',
      parameters,
      duration,
      autoReset
    });
  }

  reset(duration = 800) {
    return this.send({
      type: 'reset',
      duration
    });
  }

  ping() {
    return this.send({ type: 'ping' });
  }

  disconnect() {
    this.manualClose = true;
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}
