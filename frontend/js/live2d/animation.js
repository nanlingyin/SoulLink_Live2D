/**
 * LLM Expression Generator - LLM 表情生成器
 * 
 * 核心功能：调用 LLM API 生成 L2D 表情参数 JSON
 * 
 * 工作流程：
 * 1. 接收用户输入 (对话/情感/场景描述)
 * 2. 调用 LLM API (支持 OpenAI 兼容格式)
 * 3. 解析并验证返回的 JSON
 * 4. 返回可用于 L2D 控制的表情参数
 */

// ============ 配置 ============

/**
 * 默认 LLM 配置
 */
const DEFAULT_LLM_CONFIG = {
    apiUrl: 'http://localhost:11434/v1/chat/completions',  // Ollama 默认
    model: 'qwen2.5:7b',
    temperature: 0.7,
    maxTokens: 500,
    timeout: 30000
};

/**
 * 当前配置 (可通过 configure 方法修改)
 */
let currentConfig = { ...DEFAULT_LLM_CONFIG };

// ============ 配置管理 ============

/**
 * 配置 LLM 客户端
 * 
 * @param {Object} config - 配置对象
 * @returns {Object} 当前配置
 * 
 * @example
 * configure({
 *   apiUrl: 'https://api.openai.com/v1/chat/completions',
 *   model: 'gpt-4',
 *   apiKey: 'sk-xxx'
 * });
 */
function configure(config) {
    currentConfig = { ...currentConfig, ...config };
    return currentConfig;
}

/**
 * 获取当前配置
 * @returns {Object} 当前配置
 */
function getConfig() {
    return { ...currentConfig };
}

/**
 * 重置为默认配置
 */
function resetConfig() {
    currentConfig = { ...DEFAULT_LLM_CONFIG };
}

// ============ API 调用 ============

/**
 * 调用 LLM API
 * 
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userMessage - 用户消息
 * @param {Object} options - 额外选项
 * @returns {Promise<string>} LLM 返回的文本
 */
async function callLLMAPI(systemPrompt, userMessage, options = {}) {
    const config = { ...currentConfig, ...options };
    
    const requestBody = {
        model: config.model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens
    };
    
    // 如果要求 JSON 格式
    if (config.jsonMode) {
        requestBody.response_format = { type: 'json_object' };
    }
    
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // 添加 API Key (如果有)
    if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    
    try {
        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLM API 错误 (${response.status}): ${errorText}`);
        }
        
        const data = await response.json();
        
        // 提取回复内容
        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content;
        }
        
        throw new Error('LLM 返回格式异常');
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new Error('LLM 请求超时');
        }
        throw error;
    }
}

// ============ JSON 解析 ============

/**
 * 从 LLM 返回的文本中提取 JSON
 * 
 * @param {string} text - LLM 返回的文本
 * @returns {Object|null} 解析后的 JSON 对象
 */
function extractJSON(text) {
    if (!text) return null;
    
    // 尝试直接解析
    try {
        return JSON.parse(text);
    } catch (e) {
        // 继续尝试其他方法
    }
    
    // 尝试提取 ```json ... ``` 代码块
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
        try {
            return JSON.parse(jsonBlockMatch[1].trim());
        } catch (e) {
            // 继续尝试
        }
    }
    
    // 尝试提取 { ... } 部分
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            // 解析失败
        }
    }
    
    return null;
}

/**
 * 验证表情 JSON 格式
 * 
 * @param {Object} json - 待验证的 JSON
 * @param {Object} availableParams - 可用参数配置 (用于验证参数名)
 * @returns {Object} 验证结果 { valid, errors, data }
 */
function validateExpressionJSON(json, availableParams = null) {
    const errors = [];
    
    if (!json || typeof json !== 'object') {
        return { valid: false, errors: ['无效的 JSON 对象'], data: null };
    }
    
    // 检查必需字段
    if (!json.parameters || typeof json.parameters !== 'object') {
        errors.push('缺少 parameters 字段');
    }
    
    // 验证参数值
    if (json.parameters && availableParams) {
        for (const [paramId, value] of Object.entries(json.parameters)) {
            // 检查参数是否存在
            if (!availableParams[paramId]) {
                errors.push(`未知参数: ${paramId}`);
                continue;
            }
            
            // 检查值类型
            if (typeof value !== 'number') {
                errors.push(`参数 ${paramId} 的值必须是数字`);
                continue;
            }
            
            // 检查值范围
            const paramInfo = availableParams[paramId];
            if (value < paramInfo.min || value > paramInfo.max) {
                errors.push(`参数 ${paramId} 的值 ${value} 超出范围 [${paramInfo.min}, ${paramInfo.max}]`);
            }
        }
    }
    
    // 验证 duration
    if (json.duration !== undefined) {
        if (typeof json.duration !== 'number' || json.duration < 0) {
            errors.push('duration 必须是非负数');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        data: json
    };
}

/**
 * 修复并规范化表情 JSON
 * 
 * @param {Object} json - 原始 JSON
 * @param {Object} availableParams - 可用参数配置
 * @returns {Object} 修复后的 JSON
 */
function normalizeExpressionJSON(json, availableParams = null) {
    const normalized = {
        expression: json.expression || '未命名表情',
        parameters: {},
        duration: typeof json.duration === 'number' ? json.duration : 800
    };
    
    if (!json.parameters) return normalized;
    
    for (const [paramId, value] of Object.entries(json.parameters)) {
        // 跳过未知参数
        if (availableParams && !availableParams[paramId]) continue;
        
        // 确保值是数字
        let numValue = parseFloat(value);
        if (isNaN(numValue)) continue;
        
        // 限制在范围内
        if (availableParams && availableParams[paramId]) {
            const { min, max } = availableParams[paramId];
            numValue = Math.max(min, Math.min(max, numValue));
        }
        
        normalized.parameters[paramId] = numValue;
    }
    
    return normalized;
}

// ============ 表情生成 ============

/**
 * 生成表情 JSON
 * 
 * @param {string} input - 用户输入 (对话/情感/场景)
 * @param {string} systemPrompt - 系统提示词
 * @param {Object} options - 额外选项
 * @returns {Promise<Object>} 表情 JSON
 * 
 * @example
 * const expression = await generateExpression(
 *   "角色很开心地笑了",
 *   systemPrompt,
 *   { availableParams: modelParams }
 * );
 */
async function generateExpression(input, systemPrompt, options = {}) {
    const { availableParams = null, normalize = true } = options;
    
    // 调用 LLM
    const response = await callLLMAPI(systemPrompt, input, options);
    
    // 提取 JSON
    const json = extractJSON(response);
    if (!json) {
        throw new Error('无法从 LLM 返回中提取 JSON');
    }
    
    // 验证
    const validation = validateExpressionJSON(json, availableParams);
    if (!validation.valid) {
        console.warn('表情 JSON 验证警告:', validation.errors);
    }
    
    // 规范化
    if (normalize) {
        return normalizeExpressionJSON(json, availableParams);
    }
    
    return json;
}

/**
 * 批量生成表情序列
 * 
 * @param {Array<string>} inputs - 输入序列
 * @param {string} systemPrompt - 系统提示词
 * @param {Object} options - 额外选项
 * @returns {Promise<Array<Object>>} 表情 JSON 序列
 */
async function generateExpressionSequence(inputs, systemPrompt, options = {}) {
    const expressions = [];
    
    for (const input of inputs) {
        try {
            const expr = await generateExpression(input, systemPrompt, options);
            expressions.push(expr);
        } catch (error) {
            console.error(`生成表情失败: ${input}`, error);
            expressions.push(null);
        }
    }
    
    return expressions;
}

// ============ 预设表情 ============

/**
 * 预设表情模板
 */
const PRESET_EXPRESSIONS = {
    neutral: {
        expression: '平静',
        parameters: {},  // 使用默认值
        duration: 500
    },
    happy: {
        expression: '开心',
        parameters: {
            ParamEyeLSmile: 0.8,
            ParamEyeRSmile: 0.8,
            ParamMouthForm: 0.8,
            ParamBrowLY: 0.3,
            ParamBrowRY: 0.3
        },
        duration: 600
    },
    sad: {
        expression: '悲伤',
        parameters: {
            ParamEyeLOpen: 0.6,
            ParamEyeROpen: 0.6,
            ParamBrowLY: -0.5,
            ParamBrowRY: -0.5,
            ParamMouthForm: -0.5
        },
        duration: 800
    },
    surprised: {
        expression: '惊讶',
        parameters: {
            ParamEyeLOpen: 1.0,
            ParamEyeROpen: 1.0,
            ParamBrowLY: 0.8,
            ParamBrowRY: 0.8,
            ParamMouthOpenY: 0.6
        },
        duration: 400
    },
    angry: {
        expression: '生气',
        parameters: {
            ParamBrowLY: -0.7,
            ParamBrowRY: -0.7,
            ParamBrowLAngle: -0.5,
            ParamBrowRAngle: -0.5,
            ParamMouthForm: -0.6
        },
        duration: 500
    },
    shy: {
        expression: '害羞',
        parameters: {
            ParamCheek: 1.0,
            ParamEyeBallX: 0.3,
            ParamEyeLOpen: 0.7,
            ParamEyeROpen: 0.7,
            ParamAngleZ: -5
        },
        duration: 700
    }
};

/**
 * 获取预设表情
 * 
 * @param {string} name - 预设名称
 * @param {Object} availableParams - 可用参数配置
 * @returns {Object|null} 表情 JSON
 */
function getPresetExpression(name, availableParams = null) {
    const preset = PRESET_EXPRESSIONS[name];
    if (!preset) return null;
    
    if (availableParams) {
        return normalizeExpressionJSON(preset, availableParams);
    }
    
    return { ...preset };
}

// ============ 导出 ============

// 浏览器环境
if (typeof window !== 'undefined') {
    window.LLMExpressionGenerator = {
        configure,
        getConfig,
        resetConfig,
        callLLMAPI,
        extractJSON,
        validateExpressionJSON,
        normalizeExpressionJSON,
        generateExpression,
        generateExpressionSequence,
        getPresetExpression,
        PRESET_EXPRESSIONS,
        DEFAULT_LLM_CONFIG
    };
}

// ES Module 导出
export {
    configure,
    getConfig,
    resetConfig,
    callLLMAPI,
    extractJSON,
    validateExpressionJSON,
    normalizeExpressionJSON,
    generateExpression,
    generateExpressionSequence,
    getPresetExpression,
    PRESET_EXPRESSIONS,
    DEFAULT_LLM_CONFIG
};
