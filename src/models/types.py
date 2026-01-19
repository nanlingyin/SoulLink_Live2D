"""
Live2D 模型数据类定义
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Live2DModel:
    """Live2D 模型信息"""
    name: str
    path: str
    directory: str
    model_file: str
    cdi_file: Optional[str] = None
    physics_file: Optional[str] = None
    pose_file: Optional[str] = None
    motions: List[str] = field(default_factory=list)

    def __post_init__(self):
        if self.motions is None:
            self.motions = []
