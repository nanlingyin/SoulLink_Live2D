// ============================================
// SoulLink Live2D - Ambient Lighting Plugin
// 环境光照分析与融合（从 pc_l2d_demo 简化移植）
// ============================================

console.log('🔧 ambient-lighting.js 已加载');

class AmbientLightingPlugin {
    constructor(options = {}) {
        this.enabled = false;
        this.config = {
            updateInterval: options.updateInterval || 100,
            intensity: options.intensity || 0.5,
            smoothing: options.smoothing || 0.3,
            enableColorTemp: options.enableColorTemp !== false,
            enableBrightness: options.enableBrightness !== false,
        };

        this.colorTempStrength = options.colorTempStrength || 1.0;
        this.brightnessStrength = options.brightnessStrength || 1.0;
        this.brightnessRange = options.brightnessRange || 1.5;
        this.enableContrast = options.enableContrast || false;
        this.contrastStrength = options.contrastStrength || 0.3;
        this.enableSaturation = options.enableSaturation || false;
        this.saturationStrength = options.saturationStrength || 0.2;

        this.currentLighting = {
            brightness: 1.0,
            colorTemp: 6500,
            colorTint: { r: 1, g: 1, b: 1 },
        };
        this.targetLighting = {
            brightness: 1.0,
            colorTemp: 6500,
            colorTint: { r: 1, g: 1, b: 1 },
        };

        this.analysisCanvas = null;
        this.analysisCtx = null;
        this.updateTimer = null;
        this.colorMatrixFilter = null;
        this.app = null;
        this.modelContainer = null;
    }

    initialize(pixiApp, container) {
        this.app = pixiApp;
        this.modelContainer = container;

        this.analysisCanvas = document.createElement('canvas');
        this.analysisCanvas.width = 256;
        this.analysisCanvas.height = 192;
        this.analysisCtx = this.analysisCanvas.getContext('2d', { willReadFrequently: true });

        this.colorMatrixFilter = new PIXI.filters.ColorMatrixFilter();
        console.log('[AmbientLighting] initialized');
    }

    enable() {
        if (this.enabled) return;
        this.enabled = true;

        if (this.modelContainer) {
            const filters = this.modelContainer.filters || [];
            if (!filters.includes(this.colorMatrixFilter)) {
                filters.push(this.colorMatrixFilter);
                this.modelContainer.filters = filters;
            }
        }

        this.startUpdateLoop();
        console.log('[AmbientLighting] enabled');
    }

    disable() {
        if (!this.enabled) return;
        this.enabled = false;
        this.stopUpdateLoop();

        if (this.modelContainer && this.modelContainer.filters) {
            this.modelContainer.filters = this.modelContainer.filters.filter(
                f => f !== this.colorMatrixFilter
            );
        }
        if (this.colorMatrixFilter) this.colorMatrixFilter.reset();
        console.log('[AmbientLighting] disabled');
    }

    analyzeImage(imageSource) {
        if (!this.analysisCtx) return;
        try {
            this.analysisCtx.clearRect(0, 0, 256, 192);
            this.analysisCtx.drawImage(imageSource, 0, 0, 256, 192);

            const imageData = this.analysisCtx.getImageData(0, 0, 256, 192);
            const data = imageData.data;

            let totalR = 0, totalG = 0, totalB = 0, totalLum = 0, count = 0;

            for (let i = 0; i < data.length; i += 4) {
                totalR += data[i];
                totalG += data[i + 1];
                totalB += data[i + 2];
                totalLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                count++;
            }

            const avgR = totalR / count;
            const avgG = totalG / count;
            const avgB = totalB / count;
            const avgLum = totalLum / count;

            const brightness = Math.max(0.2, Math.min(2.0, avgLum / 128));
            const { colorTemp, colorTint } = this._calcColorTemp(avgR, avgG, avgB);

            this.targetLighting = { brightness, colorTemp, colorTint };
        } catch (e) {
            console.warn('[AmbientLighting] analysis failed:', e);
        }
    }
// PLACEHOLDER_AMBIENT_2

    _calcColorTemp(r, g, b) {
        const max = Math.max(r, g, b, 1);
        const nr = r / max, ng = g / max, nb = b / max;

        let colorTemp = 6500;
        if (nb > ng && nb > nr) {
            colorTemp = 6500 + (nb - Math.max(nr, ng)) * 3500;
        } else if (nr > nb && nr > ng) {
            colorTemp = 6500 - (nr - Math.max(ng, nb)) * 4500;
        }
        colorTemp = Math.max(2000, Math.min(10000, colorTemp));

        const colorTint = this._kelvinToRGB(colorTemp);
        return { colorTemp, colorTint };
    }

    _kelvinToRGB(kelvin) {
        const temp = kelvin / 100;
        let r, g, b;

        if (temp <= 66) {
            r = 255;
        } else {
            r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
            r = Math.max(0, Math.min(255, r));
        }

        if (temp <= 66) {
            g = 99.4708025861 * Math.log(temp) - 161.1195681661;
        } else {
            g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
        }
        g = Math.max(0, Math.min(255, g));

        if (temp >= 66) {
            b = 255;
        } else if (temp <= 19) {
            b = 0;
        } else {
            b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
            b = Math.max(0, Math.min(255, b));
        }

        return { r: r / 255, g: g / 255, b: b / 255 };
    }

    smoothTransition() {
        const a = this.config.smoothing;
        const cur = this.currentLighting;
        const tgt = this.targetLighting;

        cur.brightness += (tgt.brightness - cur.brightness) * a;
        cur.colorTemp += (tgt.colorTemp - cur.colorTemp) * a;
        cur.colorTint.r += (tgt.colorTint.r - cur.colorTint.r) * a;
        cur.colorTint.g += (tgt.colorTint.g - cur.colorTint.g) * a;
        cur.colorTint.b += (tgt.colorTint.b - cur.colorTint.b) * a;
    }
// PLACEHOLDER_AMBIENT_3

    applyFilter() {
        if (!this.colorMatrixFilter) return;

        const intensity = this.config.intensity;
        const lit = this.currentLighting;

        this.colorMatrixFilter.reset();

        // 亮度
        if (this.config.enableBrightness) {
            const bStr = this.brightnessStrength;
            const bRange = this.brightnessRange;
            const raw = 1 + (lit.brightness - 1) * intensity * bStr;
            const factor = Math.max(1 / bRange, Math.min(bRange, raw));
            this.colorMatrixFilter.brightness(factor, false);
        }

        // 色温
        if (this.config.enableColorTemp) {
            const tStr = this.colorTempStrength;
            const tint = lit.colorTint;
            const tintR = 1 + (tint.r - 1) * intensity * tStr;
            const tintG = 1 + (tint.g - 1) * intensity * tStr;
            const tintB = 1 + (tint.b - 1) * intensity * tStr;

            const m = this.colorMatrixFilter.matrix;
            m[0] *= tintR;
            m[6] *= tintG;
            m[12] *= tintB;
        }

        // 对比度
        if (this.enableContrast) {
            this.colorMatrixFilter.contrast(this.contrastStrength * intensity, false);
        }

        // 饱和度
        if (this.enableSaturation) {
            const satVal = 1 + this.saturationStrength * intensity;
            this.colorMatrixFilter.saturate(satVal - 1, false);
        }
    }

    startUpdateLoop() {
        this.stopUpdateLoop();
        this.updateTimer = setInterval(() => this.update(), this.config.updateInterval);
    }

    stopUpdateLoop() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    update() {
        if (!this.enabled) return;
        this.smoothTransition();
        this.applyFilter();
    }

    analyzeBackground(element) {
        if (!this.enabled) return;
        this.analyzeImage(element);
    }

    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        if (newConfig.updateInterval !== undefined && this.enabled) {
            this.startUpdateLoop();
        }
    }

    getLightingData() {
        return {
            current: { ...this.currentLighting },
            target: { ...this.targetLighting },
            config: { ...this.config }
        };
    }

    destroy() {
        this.disable();
        this.analysisCanvas = null;
        this.analysisCtx = null;
        this.colorMatrixFilter = null;
    }
}

// ============================================
// 全局导出
// ============================================

window.AmbientLightingPlugin = AmbientLightingPlugin;
