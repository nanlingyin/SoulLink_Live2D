/**
 * ASR 语音识别服务
 * 支持浏览器 Web Speech API 和本地 Whisper 模式
 */

class ASRService {
    constructor() {
        this.config = null;
        this.recognition = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.onResult = null;
        this.onError = null;
        this.onStateChange = null;
    }

    /**
     * 初始化 ASR 服务
     * @param {Object} config - voice.asr 配置
     */
    init(config) {
        this.config = config;

        if (!config.enabled) {
            console.log('🎤 ASR 已禁用');
            return false;
        }

        if (config.mode === 'browser') {
            return this._initBrowserASR();
        } else if (config.mode === 'local') {
            return this._initLocalASR();
        }

        return false;
    }

    /**
     * 初始化浏览器 Web Speech API
     */
    _initBrowserASR() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn('⚠️ 浏览器不支持 Web Speech API');
            return false;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = this.config.language || 'zh-CN';

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript && this.onResult) {
                this.onResult(finalTranscript, true);
            } else if (interimTranscript && this.onResult) {
                this.onResult(interimTranscript, false);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('🎤 ASR 错误:', event.error);
            if (this.onError) {
                this.onError(event.error);
            }
            this._setState('idle');
        };

        this.recognition.onend = () => {
            this.isRecording = false;
            this._setState('idle');
        };

        console.log('🎤 浏览器 ASR 已初始化');
        return true;
    }

    /**
     * 初始化本地 ASR（录音后上传）
     */
    _initLocalASR() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('⚠️ 浏览器不支持录音');
            return false;
        }

        console.log('🎤 本地 ASR 已初始化');
        return true;
    }

    /**
     * 开始录音/识别
     */
    async start() {
        if (this.isRecording) {
            return;
        }

        this.isRecording = true;
        this._setState('recording');

        if (this.config.mode === 'browser') {
            this.recognition.start();
        } else {
            await this._startLocalRecording();
        }
    }

    /**
     * 停止录音/识别
     */
    async stop() {
        if (!this.isRecording) {
            return;
        }

        this.isRecording = false;

        if (this.config.mode === 'browser') {
            this.recognition.stop();
        } else {
            await this._stopLocalRecording();
        }
    }

    /**
     * 开始本地录音
     */
    async _startLocalRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];

            this.mediaRecorder = new MediaRecorder(stream);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                this._setState('processing');

                // 合并音频数据
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });

                // 上传到后端识别
                try {
                    const text = await this._uploadForRecognition(audioBlob);
                    if (this.onResult) {
                        this.onResult(text, true);
                    }
                } catch (error) {
                    console.error('🎤 本地 ASR 识别失败:', error);
                    if (this.onError) {
                        this.onError(error.message);
                    }
                }

                this._setState('idle');

                // 停止所有音轨
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();
        } catch (error) {
            console.error('🎤 录音启动失败:', error);
            if (this.onError) {
                this.onError(error.message);
            }
            this._setState('idle');
        }
    }

    /**
     * 停止本地录音
     */
    async _stopLocalRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
    }

    /**
     * 上传音频到后端进行识别
     */
    async _uploadForRecognition(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');

        const response = await fetch('/api/asr', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`ASR 请求失败: ${response.status}`);
        }

        const data = await response.json();
        return data.text;
    }

    /**
     * 更新状态
     */
    _setState(state) {
        if (this.onStateChange) {
            this.onStateChange(state);
        }
    }

    /**
     * 检查是否可用
     */
    isAvailable() {
        if (!this.config || !this.config.enabled) {
            return false;
        }

        if (this.config.mode === 'browser') {
            return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        }

        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
}

// 导出单例
window.ASRService = new ASRService();
