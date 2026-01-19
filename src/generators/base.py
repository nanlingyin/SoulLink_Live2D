"""
生成器基类/接口定义
"""

from abc import ABC, abstractmethod
from typing import Dict


class BaseGenerator(ABC):
    """生成器基类"""

    @abstractmethod
    async def generate(self, input_text: str, context: str = "") -> dict:
        """生成内容"""
        pass

    def update_parameters(self, parameters: Dict[str, dict]) -> None:
        """更新可用参数列表（可选实现）"""
        pass
