/**
 * LLM Prompt Builder - LLM 提示词构建器
 * 
 * 核心功能：根据 L2D 模型参数配置生成 LLM 系统提示词
 * 
 * 工作流程：
 * 1. 接收模型参数配置 (参数ID、范围、名称)
 * 2. 构建结构化的系统提示词
 * 3. 定义 JSON 输出格式规范
 */

// ============ 通用表情参数映射 ============

/**
 * 通用表情参数到具体模型参数的映射
 * 用于将通用描述映射到不同模型的实际参数名
 */
const EXPRESSION_PARAM_MAPPING = {
    // 眼睛
    eyeOpenL: ['ParamEyeLOpen', 'ParamEyeL_Open', 'EyeLOpen'],
    eyeOpenR: ['ParamEyeROpen', 'ParamEyeR_Open', 'EyeROpen'],
    eyeSmileL: ['ParamEyeLSmile', 'ParamEyeL_Smile', 'EyeLSmile'],
    eyeSmileR: ['ParamEyeRSmile', 'ParamEyeR_Smile', 'EyeRSmile'],
    eyeBallX: ['ParamEyeBallX', 'ParamEyeBall_X', 'EyeBallX'],
    eyeBallY: ['ParamEyeBallY', 'ParamEyeBall_Y', 'EyeBallY'],
    
    // 眉毛
    browLY: ['ParamBrowLY', 'ParamBrowL_Y', 'BrowLY'],
    browRY: ['ParamBrowRY', 'ParamBrowR_Y', 'BrowRY'],
    browLAngle: ['ParamBrowLAngle', 'ParamBrowL_Angle', 'BrowLAngle'],
    browRAngle: ['ParamBrowRAngle', 'ParamBrowR_Angle', 'BrowRAngle'],
    
    // 嘴巴
    mouthOpen: ['ParamMouthOpenY', 'ParamMouth_OpenY', 'MouthOpenY'],
    mouthForm: ['ParamMouthForm', 'ParamMouth_Form', 'MouthForm'],
    
    // 脸颊
    cheek: ['ParamCheek', 'Cheek'],
    
    // 头部角度
    angleX: ['ParamAngleX', 'ParamAngleX2', 'AngleX'],
    angleY: ['ParamAngleY', 'ParamAngleY2', 'AngleY'],
    angleZ: ['ParamAngleZ', 'AngleZ'],
    
    // 身体角度
    bodyAngleX: ['ParamBodyAngleX', 'BodyAngleX'],
    bodyAngleY: ['ParamBodyAngleY', 'BodyAngleY'],
    bodyAngleZ: ['ParamBodyAngleZ', 'BodyAngleZ']
};

// ============ 提示词模板 ============

/**
 * 默认系统提示词模板
 */
const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `你是一个 Live2D 虚拟形象的表情控制器。根据场景、对话或情感描述，生成表情参数。

当前模型可用参数：
{PARAMETERS}

返回JSON格式：
{
  "expression": "表情描述",
  "parameters": {
    "参数ID": 数值,
    ...
  },
  "duration": 过渡时间毫秒数
}

要求：
1. 参数值要足够大，让表情变化明显可见
2. 充分组合多个参数来表达丰富表情
3. 眼睛、眉毛、嘴巴的配合对表情很重要
4. 只返回JSON，不要其他文字`;

/**
 * 详细版系统提示词模板 (包含表情建议)
 */
const DETAILED_SYSTEM_PROMPT_TEMPLATE = `你是一个 Live2D 虚拟形象的表情控制器。你需要根据输入的场景、对话或情感描述，生成精确的表情参数。

## 当前模型可用参数
{PARAMETERS}

## 表情参考指南
- **开心/微笑**: 眼睛略微眯起 (EyeSmile提高)，嘴角上扬 (MouthForm正值)，眉毛略微上挑
- **悲伤**: 眼睛下垂 (EyeOpen降低)，眉毛下压 (BrowY负值)，嘴角下垂 (MouthForm负值)
- **惊讶**: 眼睛睁大 (EyeOpen最大)，眉毛上挑 (BrowY正值)，嘴巴张开 (MouthOpenY提高)
- **生气**: 眉毛皱起向下 (BrowAngle调整)，眼睛略微睁大，嘴角下沉
- **害羞/脸红**: 脸颊泛红 (Cheek提高)，眼神闪躲 (EyeBall偏移)，表情柔和

## 输出格式
返回纯 JSON，格式如下：
{
  "expression": "一句话描述当前表情",
  "parameters": {
    "参数ID": 数值
  },
  "duration": 过渡动画时长(毫秒)
}

## 注意事项
1. 参数值必须在给定范围内
2. 组合多个参数创造丰富表情
3. duration 建议 500-1500ms
4. 只输出 JSON，不要其他文字`;

// ============ 提示词构建 ============

/**
 * 格式化参数列表为字符串
 * 
 * @param {Object} parameters - 参数配置对象
 * @returns {string} 格式化后的参数描述
 */
function formatParameterList(parameters) {
    if (!parameters || Object.keys(parameters).length === 0) {
        return '(无可用参数)';
    }
    
    return Object.entries(parameters)
        .map(([id, info]) => {
            const name = info.name || id;
            const min = info.min ?? -30;
            const max = info.max ?? 30;
            return `  - ${id}: ${name}, 范围[${min}, ${max}]`;
        })
        .join('\n');
}

/**
 * 构建 LLM 系统提示词
 * 
 * @param {Object} parameters - 参数配置对象
 * @param {Object} options - 构建选项
 * @returns {string} 系统提示词
 * 
 * @example
 * const prompt = buildSystemPrompt(modelParams, { detailed: true });
 */
function buildSystemPrompt(parameters, options = {}) {
    const {
        detailed = false,
        template = null,
        additionalInstructions = ''
    } = options;
    
    // 选择模板
    let promptTemplate = template;
    if (!promptTemplate) {
        promptTemplate = detailed ? DETAILED_SYSTEM_PROMPT_TEMPLATE : DEFAULT_SYSTEM_PROMPT_TEMPLATE;
    }
    
    // 格式化参数列表
    const paramList = formatParameterList(parameters);
    
    // 替换占位符
    let prompt = promptTemplate.replace('{PARAMETERS}', paramList);
    
    // 添加额外指令
    if (additionalInstructions) {
        prompt += `\n\n额外要求：\n${additionalInstructions}`;
    }
    
    return prompt;
}

/**
 * 构建用户消息
 * 
 * @param {string} input - 用户输入
 * @param {string} context - 上下文信息
 * @returns {string} 格式化后的用户消息
 */
function buildUserMessage(input, context = '') {
    if (context) {
        return `场景背景：${context}\n\n当前输入：${input}`;
    }
    return input;
}

/**
 * 构建特定类型的表情请求
 * 
 * @param {string} type - 请求类型: 'emotion', 'reaction', 'dialogue'
 * @param {string} content - 内容
 * @param {Object} options - 额外选项
 * @returns {string} 格式化后的请求消息
 */
function buildExpressionRequest(type, content, options = {}) {
    const { emotion = '', context = '' } = options;
    
    switch (type) {
        case 'emotion':
            return `请生成表达"${content}"情感的表情`;
            
        case 'reaction':
            return `角色听到/看到了这句话，请生成合适的表情反应: "${content}"`;
            
        case 'dialogue':
            if (emotion) {
                return `角色正在说这句话: "${content}"，情感是: ${emotion}`;
            }
            return `角色正在说这句话: "${content}"，请推断合适的表情`;
            
        default:
            return content;
    }
}

// ============ 参数映射工具 ============

/**
 * 查找通用参数名对应的实际参数ID
 * 
 * @param {string} genericName - 通用参数名
 * @param {Object} availableParams - 可用参数配置
 * @returns {string|null} 实际参数ID
 */
function findParamId(genericName, availableParams) {
    const possibleIds = EXPRESSION_PARAM_MAPPING[genericName] || [genericName];
    
    for (const id of possibleIds) {
        if (availableParams[id]) {
            return id;
        }
    }
    
    // 直接查找
    if (availableParams[genericName]) {
        return genericName;
    }
    
    return null;
}

/**
 * 将通用表情配置转换为模型特定参数
 * 
 * @param {Object} genericConfig - 通用表情配置
 * @param {Object} availableParams - 可用参数配置
 * @returns {Object} 模型特定的参数配置
 * 
 * @example
 * const params = mapToModelParams(
 *   { eyeOpenL: 0.9, mouthForm: 0.8 },
 *   availableParameters
 * );
 */
function mapToModelParams(genericConfig, availableParams) {
    const result = {};
    
    for (const [genericName, value] of Object.entries(genericConfig)) {
        const paramId = findParamId(genericName, availableParams);
        if (paramId) {
            result[paramId] = value;
        }
    }
    
    return result;
}

// ============ 导出 ============

// 浏览器环境
if (typeof window !== 'undefined') {
    window.LLMPromptBuilder = {
        buildSystemPrompt,
        buildUserMessage,
        buildExpressionRequest,
        formatParameterList,
        findParamId,
        mapToModelParams,
        EXPRESSION_PARAM_MAPPING,
        DEFAULT_SYSTEM_PROMPT_TEMPLATE,
        DETAILED_SYSTEM_PROMPT_TEMPLATE
    };
}

// ES Module 导出
export {
    buildSystemPrompt,
    buildUserMessage,
    buildExpressionRequest,
    formatParameterList,
    findParamId,
    mapToModelParams,
    EXPRESSION_PARAM_MAPPING,
    DEFAULT_SYSTEM_PROMPT_TEMPLATE,
    DETAILED_SYSTEM_PROMPT_TEMPLATE
};
