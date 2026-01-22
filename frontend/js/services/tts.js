/**
 * TTS 语音合成服务
 * 通过后端代理调用 OpenAI 格式 TTS API
 */

class TTSService {
    constructor() {
        this.config = null;
        this.audio = null;
        this.isPlaying = false;
        this.onStateChange = null;
        this.onPlayEnd = null;
        this.lipSyncInterval = null;
        this.audioContext = null;
        this.analyser = null;
    }

    /**
     * 初始化 TTS 服务
     * @param {Object} config - voice.tts 配置
     */
    init(config) {
        this.config = config;

        if (!config.enabled) {
            console.log('🔊 TTS 已禁用');
            return false;
        }

        this.audio = new Audio();

        this.audio.onplay = () => {
            this.isPlaying = true;
            this._setState('playing');
            // TTS 播放期间暂停表情自动重置
            if (window.cancelAutoReset) {
                window.cancelAutoReset();
            }
            this._startLipSync();
        };

        this.audio.onended = () => {
            this.isPlaying = false;
            this._setState('idle');
            this._stopLipSync();

            // TTS 播放完成后，触发表情重置（如果配置了 resetAfterTTS）
            if (this.config.resetAfterTTS !== false) {
                const animConfig = window.SoulLinkConfig?.animation || {};
                const resetDelay = animConfig.autoResetDelay || 1500;
                setTimeout(() => {
                    if (window.resetExpression) {
                        console.log('🔊 TTS 播放完成，重置表情');
                        window.resetExpression();
                    }
                }, resetDelay);
            }

            if (this.onPlayEnd) {
                this.onPlayEnd();
            }
        };

        this.audio.onerror = (e) => {
            console.error('🔊 TTS 播放错误:', e);
            this.isPlaying = false;
            this._setState('error');
            this._stopLipSync();
        };

        console.log('🔊 TTS 服务已初始化');
        return true;
    }

    /**
     * 合成并播放语音
     * @param {string} text - 要合成的文字
     * @param {string} voice - 声音选择（可选）
     */
    async speak(text, voice = null) {
        if (!this.config || !this.config.enabled) {
            console.log('🔊 TTS 未启用');
            return;
        }

        // 如果正在播放，先停止
        if (this.isPlaying) {
            this.stop();
        }

        this._setState('loading');

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voice: voice || this.config.voice
                })
            });

            if (!response.ok) {
                throw new Error(`TTS 请求失败: ${response.status}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            this.audio.src = audioUrl;
            await this.audio.play();

        } catch (error) {
            console.error('🔊 TTS 合成失败:', error);
            this._setState('error');
        }
    }

    /**
     * 停止播放
     */
    stop() {
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
        }
        this.isPlaying = false;
        this._setState('idle');
        this._stopLipSync();
    }

    /**
     * 暂停播放
     */
    pause() {
        if (this.audio && this.isPlaying) {
            this.audio.pause();
            this._setState('paused');
            this._stopLipSync();
        }
    }

    /**
     * 恢复播放
     */
    resume() {
        if (this.audio && !this.isPlaying) {
            this.audio.play();
        }
    }

    /**
     * 查找嘴巴参数
     */
    _findMouthParams() {
        const candidates = {
            open: ['ParamMouthOpenY', 'ParamMouth_OpenY', 'MouthOpenY', 'ParamMouthOpen', 'MouthOpen'],
            form: ['ParamMouthForm', 'ParamMouth_Form', 'MouthForm']
        };

        const availableParams = window.SoulLink?.availableParameters || {};
        const result = { open: null, form: null };

        // 查找开合参数
        for (const id of candidates.open) {
            if (availableParams[id] !== undefined) {
                result.open = id;
                break;
            }
        }

        // 查找变形参数
        for (const id of candidates.form) {
            if (availableParams[id] !== undefined) {
                result.form = id;
                break;
            }
        }

        return result;
    }

    /**
     * 开始口型同步
     * 使用更自然的口型动画
     */
    _startLipSync() {
        // 尝试使用 setParameter 函数（Live2D 控制器）
        const setParam = window.setParameter;
        if (!setParam) {
            console.warn('🔊 未找到 setParameter 函数，口型同步不可用');
            return;
        }

        // 查找正确的参数名
        const mouthParams = this._findMouthParams();
        if (!mouthParams.open) {
            console.warn('🔊 未找到嘴巴开合参数，尝试使用默认 ParamMouthOpenY');
            mouthParams.open = 'ParamMouthOpenY';
        }

        console.log(`🔊 启动口型同步: Open=${mouthParams.open}, Form=${mouthParams.form || '无'}`);

        // 使用正弦波模拟更自然的口型开合
        let time = 0;
        const baseFrequency = 8; // 基础频率 (Hz)

        this.lipSyncInterval = setInterval(() => {
            time += 0.05;

            // 组合多个正弦波产生更自然的口型
            const wave1 = Math.sin(time * baseFrequency) * 0.5 + 0.5;
            const wave2 = Math.sin(time * baseFrequency * 1.5) * 0.3;
            const wave3 = Math.sin(time * baseFrequency * 0.5) * 0.2;

            // 合成口型值 (0-1)
            let mouthValue = (wave1 + wave2 + wave3) * 0.6;
            mouthValue = Math.max(0.1, Math.min(1, mouthValue));

            // 设置嘴巴参数
            setParam(mouthParams.open, mouthValue);

            // 可选：轻微的嘴型变化
            if (mouthParams.form) {
                const formValue = Math.sin(time * 2) * 0.2;
                setParam(mouthParams.form, formValue);
            }

        }, 50); // 20fps
    }

    /**
     * 停止口型同步
     */
    _stopLipSync() {
        if (this.lipSyncInterval) {
            clearInterval(this.lipSyncInterval);
            this.lipSyncInterval = null;
        }

        // 恢复嘴巴默认状态
        const setParam = window.setParameter;
        if (setParam) {
            const mouthParams = this._findMouthParams();
            // 即使没找到，也尝试重置默认名
            setParam(mouthParams.open || 'ParamMouthOpenY', 0);
            if (mouthParams.form) {
                setParam(mouthParams.form, 0);
            }
        }

        console.log('🔊 口型同步已停止');
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
     * 检查是否启用
     */
    isEnabled() {
        return this.config && this.config.enabled;
    }
}

// 导出单例
window.TTSService = new TTSService();
