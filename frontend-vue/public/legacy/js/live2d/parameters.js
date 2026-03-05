/**
 * Model Parameter Loader - L2D 模型参数加载器
 * 
 * 核心功能：从 Live2D 模型配置文件中读取参数定义
 * 
 * 工作流程：
 * 1. 读取 .cdi3.json 文件获取参数显示名称
 * 2. 读取 .model3.json 文件获取参数引用
 * 3. 从实际模型中提取参数范围
 * 4. 合并生成完整的参数配置
 */

// ============ 配置 ============

/**
 * 物理参数关键词 - 这些参数通常由物理引擎控制，不应该直接操作
 */
const PHYSICS_PARAM_KEYWORDS = [
    'Hair', 'Ribbon', 'Skirt', 'Bust', 'Sway',
    'Rotation_', 'Skinning', '摇动', '辫子', '侧发',
    'Breath'
];

/**
 * 判断是否为物理参数
 * @param {string} paramId - 参数ID
 * @returns {boolean}
 */
function isPhysicsParam(paramId) {
    return PHYSICS_PARAM_KEYWORDS.some(keyword => paramId.includes(keyword));
}

// ============ 参数加载 ============

/**
 * 从 .cdi3.json 文件加载参数显示名称
 * 
 * @param {string} cdiPath - cdi3.json 文件路径
 * @returns {Promise<Object>} 参数ID到显示名称的映射
 * 
 * @example
 * const names = await loadParameterNames('./shizuku.cdi3.json');
 * // 返回: { "ParamEyeLOpen": "左眼开合", "ParamAngleX": "头部X轴" }
 */
async function loadParameterNames(cdiPath) {
    try {
        const response = await fetch(cdiPath);
        if (!response.ok) {
            console.warn(`无法加载 cdi3.json: ${cdiPath}`);
            return {};
        }
        
        const cdiData = await response.json();
        const paramNames = {};
        
        // cdi3.json 中的参数定义
        if (cdiData.Parameters && Array.isArray(cdiData.Parameters)) {
            for (const param of cdiData.Parameters) {
                if (param.Id && param.Name) {
                    paramNames[param.Id] = param.Name;
                }
            }
        }
        
        return paramNames;
    } catch (error) {
        console.error('加载参数名称失败:', error);
        return {};
    }
}

/**
 * 从 Live2D 模型实例中提取参数范围
 * 
 * @param {Object} model - Cubism 模型实例
 * @returns {Object} 参数配置对象
 * 
 * @example
 * const params = extractParameterRanges(cubismModel);
 * // 返回: {
 * //   "ParamEyeLOpen": { min: 0, max: 1, default: 1 },
 * //   "ParamAngleX": { min: -30, max: 30, default: 0 }
 * // }
 */
function extractParameterRanges(model) {
    const parameters = {};
    
    if (!model || !model.internalModel) {
        console.warn('模型实例无效');
        return parameters;
    }
    
    const coreModel = model.internalModel.coreModel;
    if (!coreModel) {
        console.warn('无法获取核心模型');
        return parameters;
    }
    
    const paramCount = coreModel.getParameterCount();
    
    for (let i = 0; i < paramCount; i++) {
        const paramId = coreModel.getParameterId(i);
        
        // 跳过物理参数
        if (isPhysicsParam(paramId)) continue;
        
        const minValue = coreModel.getParameterMinimumValue(i);
        const maxValue = coreModel.getParameterMaximumValue(i);
        const defaultValue = coreModel.getParameterDefaultValue(i);
        
        parameters[paramId] = {
            min: minValue,
            max: maxValue,
            default: defaultValue
        };
    }
    
    return parameters;
}

/**
 * 加载完整的模型参数配置
 * 
 * 合并 cdi3.json 中的显示名称和模型实例中的参数范围
 * 
 * @param {Object} model - Cubism 模型实例
 * @param {string} cdiPath - cdi3.json 文件路径 (可选)
 * @returns {Promise<Object>} 完整的参数配置
 * 
 * @example
 * const config = await loadModelParameters(model, './shizuku.cdi3.json');
 * // 返回: {
 * //   "ParamEyeLOpen": { min: 0, max: 1, default: 1, name: "左眼开合" },
 * //   "ParamAngleX": { min: -30, max: 30, default: 0, name: "头部X轴旋转" }
 * // }
 */
async function loadModelParameters(model, cdiPath = null) {
    // 从模型实例提取参数范围
    const paramRanges = extractParameterRanges(model);
    
    // 如果提供了 cdi 文件，加载显示名称
    let paramNames = {};
    if (cdiPath) {
        paramNames = await loadParameterNames(cdiPath);
    }
    
    // 合并参数信息
    const fullConfig = {};
    for (const [paramId, rangeInfo] of Object.entries(paramRanges)) {
        fullConfig[paramId] = {
            ...rangeInfo,
            name: paramNames[paramId] || paramId
        };
    }
    
    return fullConfig;
}

/**
 * 从 model3.json 获取关联的 cdi3.json 路径
 * 
 * @param {string} modelJsonPath - model3.json 文件路径
 * @returns {Promise<string|null>} cdi3.json 文件路径
 */
async function getCdiPathFromModel(modelJsonPath) {
    try {
        const response = await fetch(modelJsonPath);
        const modelData = await response.json();
        
        // 获取模型目录
        const modelDir = modelJsonPath.substring(0, modelJsonPath.lastIndexOf('/') + 1);
        
        // 查找 cdi 文件引用
        if (modelData.FileReferences && modelData.FileReferences.DisplayInfo) {
            return modelDir + modelData.FileReferences.DisplayInfo;
        }
        
        // 尝试默认命名规则
        const modelName = modelJsonPath.split('/').pop().replace('.model3.json', '');
        return modelDir + modelName + '.cdi3.json';
        
    } catch (error) {
        console.error('获取 cdi 路径失败:', error);
        return null;
    }
}

// ============ 参数过滤 ============

/**
 * 过滤参数，只保留表情相关的参数
 * 
 * @param {Object} parameters - 完整参数配置
 * @param {Object} options - 过滤选项
 * @returns {Object} 过滤后的参数
 */
function filterExpressionParameters(parameters, options = {}) {
    const {
        includePhysics = false,
        includeBody = true,
        includeEyes = true,
        includeMouth = true,
        includeBrows = true
    } = options;
    
    const filtered = {};
    
    for (const [paramId, info] of Object.entries(parameters)) {
        // 物理参数过滤
        if (!includePhysics && isPhysicsParam(paramId)) continue;
        
        // 按类别过滤
        const isEye = /Eye|Pupil/i.test(paramId);
        const isMouth = /Mouth/i.test(paramId);
        const isBrow = /Brow/i.test(paramId);
        const isBody = /Body|Arm/i.test(paramId);
        
        if (!includeEyes && isEye) continue;
        if (!includeMouth && isMouth) continue;
        if (!includeBrows && isBrow) continue;
        if (!includeBody && isBody) continue;
        
        filtered[paramId] = info;
    }
    
    return filtered;
}

// ============ 导出 ============

// 浏览器环境
if (typeof window !== 'undefined') {
    window.ModelParameterLoader = {
        loadParameterNames,
        extractParameterRanges,
        loadModelParameters,
        getCdiPathFromModel,
        filterExpressionParameters,
        isPhysicsParam,
        PHYSICS_PARAM_KEYWORDS
    };
}

// ES Module 导出
export {
    loadParameterNames,
    extractParameterRanges,
    loadModelParameters,
    getCdiPathFromModel,
    filterExpressionParameters,
    isPhysicsParam,
    PHYSICS_PARAM_KEYWORDS
};
