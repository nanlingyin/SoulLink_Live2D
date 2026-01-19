"""
通用辅助函数
"""

import re
import json
from typing import Optional


def extract_json_from_text(text: str) -> Optional[dict]:
    """从文本中提取 JSON 对象"""
    try:
        # 尝试直接解析
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 尝试提取 JSON 块
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    return None


def clamp(value: float, min_val: float, max_val: float) -> float:
    """将值限制在指定范围内"""
    return max(min_val, min(max_val, value))


def is_physics_param(param_id: str) -> bool:
    """判断是否为物理模拟参数（头发、裙子等）"""
    physics_keywords = [
        'Hair', 'Ribbon', 'Skirt', 'Bust', 'Sway',
        'Rotation_', 'Skinning', 'Breath'
    ]
    return any(keyword in param_id for keyword in physics_keywords)
