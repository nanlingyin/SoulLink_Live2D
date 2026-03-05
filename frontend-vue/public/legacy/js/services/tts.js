/**
 * TTS service
 * - fetches audio from backend
 * - plays audio
 * - runs lip sync
 * - coordinates TTS-only continuous motion frames from websocket
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

        this.currentAudioUrl = null;

        this.motionSessionId = null;
        this.motionFrameTimers = [];
        this.motionStartTime = 0;
        this.motionCallbacksBound = false;
        this.idleMotionToken = null;

        // 预生成的连续动作帧
        this.preGeneratedMotionFrames = null;
    }

    /**
     * @param {Object} config voice.tts config
     */
    init(config) {
        this.config = config;

        if (!config.enabled) {
            console.log('🔰 TTS 已禁用');
            return false;
        }

        this.audio = new Audio();
        this._bindMotionCallbacks();

        this.audio.onplay = () => {
            this.isPlaying = true;
            this.motionStartTime = performance.now();
            this._setState('playing');

            // Pause auto-reset while speech is playing.
            if (window.cancelAutoReset) {
                window.cancelAutoReset();
            }
            this._lockIdleMotion();
            this._setBlinkLock(true);
            this._startLipSync();
        };

        this.audio.onended = () => {
            this.isPlaying = false;
            this._setState('idle');
            this._stopLipSync();
            this._setBlinkLock(false);
            this._stopTTSMotionSession(true);
            this._releaseIdleMotion();

            if (this.config.resetAfterTTS !== false) {
                const animConfig = window.SoulLinkConfig?.animation || {};
                const resetDelay = animConfig.autoResetDelay || 1500;
                setTimeout(() => {
                    if (window.resetExpression) {
                        console.log('🔰 TTS 播放完成，重置表情');
                        window.resetExpression();
                    }
                }, resetDelay);
            }

            if (this.onPlayEnd) {
                this.onPlayEnd();
            }
        };

        this.audio.onerror = (e) => {
            console.error('🔰 TTS 播放错误:', e);
            this.isPlaying = false;
            this._setState('error');
            this._stopLipSync();
            this._setBlinkLock(false);
            this._stopTTSMotionSession(true);
            this._releaseIdleMotion();
        };

        console.log('🔰 TTS 服务已初始化');
        return true;
    }

    /**
     * @param {string} text
     * @param {string|null} voice
     */
    async speak(text, voice = null) {
        if (!this.config || !this.config.enabled) {
            console.log('🔰 TTS 未启用');
            return;
        }

        if (this.isPlaying) {
            this.stop();
        }

        this._setState('loading');

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    voice: voice || this.config.voice
                })
            });

            if (!response.ok) {
                throw new Error(`TTS 请求失败: ${response.status}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            this._replaceAudioSource(audioUrl);

            await this._waitForMetadata();
            const durationSec = this._resolveDurationSeconds(text);

            // Lock blink before first streamed frame arrives.
            this._setBlinkLock(true);
            await this._startTTSMotionSession(text, durationSec);
            await this.audio.play();
        } catch (error) {
            console.error('🔰 TTS 合成失败:', error);
            this._setState('error');
            this._setBlinkLock(false);
            this._stopTTSMotionSession(true);
            this._releaseIdleMotion();
        }
    }

    stop() {
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
        }
        this.isPlaying = false;
        this._setState('idle');
        this._stopLipSync();
        this._setBlinkLock(false);
        this._stopTTSMotionSession(true);
        this._releaseIdleMotion();
    }

    pause() {
        if (this.audio && this.isPlaying) {
            this.audio.pause();
            this._setState('paused');
            this._stopLipSync();
            this._setBlinkLock(false);
            this._stopTTSMotionSession(true);
            this._releaseIdleMotion();
        }
    }

    resume() {
        if (this.audio && !this.isPlaying) {
            this.audio.play();
        }
    }

    _replaceAudioSource(audioUrl) {
        if (this.currentAudioUrl) {
            URL.revokeObjectURL(this.currentAudioUrl);
            this.currentAudioUrl = null;
        }
        this.currentAudioUrl = audioUrl;
        this.audio.src = audioUrl;
    }

    async _waitForMetadata() {
        if (this.audio && this.audio.readyState >= 1 && Number.isFinite(this.audio.duration)) {
            return;
        }

        await new Promise((resolve) => {
            if (!this.audio) {
                resolve();
                return;
            }

            let settled = false;
            const cleanup = () => {
                if (settled) return;
                settled = true;
                this.audio.removeEventListener('loadedmetadata', onReady);
                this.audio.removeEventListener('error', onReady);
                clearTimeout(timeoutId);
            };
            const onReady = () => {
                cleanup();
                resolve();
            };

            const timeoutId = setTimeout(() => {
                cleanup();
                resolve();
            }, 1500);

            this.audio.addEventListener('loadedmetadata', onReady, { once: true });
            this.audio.addEventListener('error', onReady, { once: true });
        });
    }

    _resolveDurationSeconds(text) {
        if (this.audio && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
            return this.audio.duration;
        }
        // Fallback estimation to keep motion flow usable.
        return Math.max(1, Math.ceil((text || '').length / 10));
    }

    _bindMotionCallbacks() {
        if (this.motionCallbacksBound) return;
        if (!window.wsClient) return;

        window.wsClient.onTTSMotionStart = (msg) => {
            if (!msg || msg.sessionId !== this.motionSessionId) return;
            console.log(
                `🎬 连续动作会话已启动: ${msg.sessionId} frames=${msg.frameCount || '?'}`
            );
        };

        window.wsClient.onTTSMotionFrame = (msg) => {
            if (!msg || msg.sessionId !== this.motionSessionId) return;
            this._scheduleMotionFrame(msg);
        };

        window.wsClient.onTTSMotionDone = (msg) => {
            if (!msg || msg.sessionId !== this.motionSessionId) return;
            console.log(`🎬 连续动作会话结束: ${msg.sessionId}`);
            this._clearMotionFrameTimers();
            this.motionSessionId = null;
        };

        window.wsClient.onTTSMotionError = (msg) => {
            if (!msg || msg.sessionId !== this.motionSessionId) return;
            console.warn('🎬 连续动作帧生成失败:', msg);
        };

        this.motionCallbacksBound = true;
    }

    /**
     * 设置预生成的连续动作帧
     * @param {Array} frames - 预生成的动作帧数组
     */
    setPreGeneratedMotionFrames(frames) {
        this.preGeneratedMotionFrames = frames;
        console.log('🎬 已缓存预生成的连续动作帧:', frames.length);
    }

    async _startTTSMotionSession(text, durationSec) {
        // 如果有预生成的动作帧，直接使用它们
        if (this.preGeneratedMotionFrames && this.preGeneratedMotionFrames.length > 0) {
            console.log('🎬 使用预生成的连续动作帧:', this.preGeneratedMotionFrames.length);
            this._lockIdleMotion();
            this.motionStartTime = performance.now();
            this._clearMotionFrameTimers();

            // 直接调度所有预生成的帧
            for (const frame of this.preGeneratedMotionFrames) {
                this._scheduleMotionFrame(frame);
            }

            // 清除缓存
            this.preGeneratedMotionFrames = null;
            return;
        }

        // 否则使用原来的 WebSocket 流式生成方式
        if (!window.wsClient || !window.wsClient.connected) return;
        this._lockIdleMotion();

        const sessionId = `tts-motion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.motionSessionId = sessionId;
        this.motionStartTime = performance.now();
        this._clearMotionFrameTimers();

        window.wsClient.startTTSMotion(sessionId, text, durationSec, '');
    }

    _stopTTSMotionSession(sendStop = true) {
        this._clearMotionFrameTimers();

        if (sendStop && this.motionSessionId && window.wsClient?.connected) {
            window.wsClient.stopTTSMotion(this.motionSessionId);
        }

        this.motionSessionId = null;
    }

    _clearMotionFrameTimers() {
        for (const timer of this.motionFrameTimers) {
            clearTimeout(timer);
        }
        this.motionFrameTimers = [];
    }

    _scheduleMotionFrame(msg) {
        const secondIndex = Number.isFinite(msg.secondIndex) ? msg.secondIndex : (msg.frameIndex || 0);
        const targetMs = Math.max(0, secondIndex * 1000);
        const elapsedMs = this.audio ? this.audio.currentTime * 1000 : 0;
        const delayMs = Math.max(0, targetMs - elapsedMs);

        const timer = setTimeout(() => {
            this._applyMotionFrame(msg);
        }, delayMs);

        this.motionFrameTimers.push(timer);
    }

    _applyMotionFrame(msg) {
        if (!this.motionSessionId || msg.sessionId !== this.motionSessionId) return;

        const filteredParams = this._filterMotionParameters(msg.parameters || {});
        if (Object.keys(filteredParams).length === 0) return;

        const duration = msg.duration || 900;
        if (window.transitionToExpression) {
            window.transitionToExpression(filteredParams, duration, null, false);
            return;
        }

        // Fallback to direct write.
        if (window.setParameter) {
            for (const [paramId, value] of Object.entries(filteredParams)) {
                window.setParameter(paramId, value);
            }
        }
    }

    _filterMotionParameters(parameters) {
        const result = {};
        for (const [paramId, value] of Object.entries(parameters || {})) {
            if (this._isMouthParam(paramId)) continue;
            result[paramId] = value;
        }
        return result;
    }

    _isMouthParam(paramId) {
        const id = String(paramId || '').toLowerCase();
        return id.includes('mouth') || id.includes('parammouth');
    }

    _findMouthParams() {
        const candidates = {
            open: ['ParamMouthOpenY', 'ParamMouth_OpenY', 'MouthOpenY', 'ParamMouthOpen', 'MouthOpen'],
            form: ['ParamMouthForm', 'ParamMouth_Form', 'MouthForm']
        };

        const availableParams = window.SoulLink?.availableParameters || {};
        const result = { open: null, form: null };

        for (const id of candidates.open) {
            if (availableParams[id] !== undefined) {
                result.open = id;
                break;
            }
        }
        for (const id of candidates.form) {
            if (availableParams[id] !== undefined) {
                result.form = id;
                break;
            }
        }

        return result;
    }

    _getParameterInfo(paramId, fallbackMin = 0, fallbackMax = 1, fallbackDefault = 0) {
        const availableParams = window.SoulLink?.availableParameters || {};
        const info = availableParams[paramId] || {};
        const min = Number.isFinite(info.min) ? info.min : fallbackMin;
        const max = Number.isFinite(info.max) ? info.max : fallbackMax;
        const defaultValue = Number.isFinite(info.default) ? info.default : fallbackDefault;
        return { min, max, defaultValue };
    }

    _startLipSync() {
        const setParam = window.setParameter;
        if (!setParam) {
            console.warn('🔰 未找到 setParameter，口型同步不可用');
            return;
        }

        const mouthParams = this._findMouthParams();
        if (!mouthParams.open) {
            console.warn('🔰 未找到嘴巴开合参数，回退到 ParamMouthOpenY');
            mouthParams.open = 'ParamMouthOpenY';
        }

        const openInfo = this._getParameterInfo(mouthParams.open, 0, 1, 0);
        const openRange = Math.max(0.0001, openInfo.max - openInfo.min);
        const openFloor = openInfo.min + openRange * 0.32;
        const openCeil = openInfo.min + openRange * 0.98;

        const formInfo = mouthParams.form
            ? this._getParameterInfo(mouthParams.form, -1, 1, 0)
            : null;
        const formAmplitude = formInfo
            ? Math.max((formInfo.max - formInfo.min) * 0.42, 0.2)
            : 0;

        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
        let time = 0;
        const baseFrequency = 9.5;

        this.lipSyncInterval = setInterval(() => {
            time += 0.05;
            const wave1 = Math.sin(time * baseFrequency) * 0.6 + 0.6;
            const wave2 = Math.sin(time * baseFrequency * 1.9) * 0.32;
            const wave3 = Math.sin(time * baseFrequency * 0.73) * 0.2;
            const jitter = (Math.random() - 0.5) * 0.16;

            const normalized = clamp(wave1 + wave2 + wave3 + jitter, 0, 1);
            const mouthValue = openFloor + (openCeil - openFloor) * normalized;
            setParam(mouthParams.open, mouthValue);

            if (mouthParams.form) {
                const formWave = Math.sin(time * 2.6) + Math.sin(time * 4.9) * 0.25;
                const formValue = clamp(
                    formInfo.defaultValue + formWave * formAmplitude,
                    formInfo.min,
                    formInfo.max
                );
                setParam(mouthParams.form, formValue);
            }
        }, 50);
    }

    _stopLipSync() {
        if (this.lipSyncInterval) {
            clearInterval(this.lipSyncInterval);
            this.lipSyncInterval = null;
        }

        const setParam = window.setParameter;
        if (setParam) {
            const mouthParams = this._findMouthParams();
            const openParamId = mouthParams.open || 'ParamMouthOpenY';
            const openInfo = this._getParameterInfo(openParamId, 0, 1, 0);
            setParam(openParamId, openInfo.defaultValue);
            if (mouthParams.form) {
                const formInfo = this._getParameterInfo(mouthParams.form, -1, 1, 0);
                setParam(mouthParams.form, formInfo.defaultValue);
            }
        }
    }

    _setBlinkLock(active) {
        if (typeof window.setBlinkLock === 'function') {
            window.setBlinkLock(!!active);
        }
    }

    _lockIdleMotion() {
        if (this.idleMotionToken) return;
        this.idleMotionToken = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (typeof window.pauseIdleForGeneratedMotion === 'function') {
            window.pauseIdleForGeneratedMotion(this.idleMotionToken);
        }
    }

    _releaseIdleMotion() {
        if (!this.idleMotionToken) return;
        if (typeof window.resumeIdleForGeneratedMotion === 'function') {
            window.resumeIdleForGeneratedMotion(this.idleMotionToken);
        }
        this.idleMotionToken = null;
    }

    _setState(state) {
        if (this.onStateChange) {
            this.onStateChange(state);
        }
    }

    isEnabled() {
        return this.config && this.config.enabled;
    }
}

window.TTSService = new TTSService();
