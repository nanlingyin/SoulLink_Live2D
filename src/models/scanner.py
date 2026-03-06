"""
Live2D 模型扫描器
"""

from pathlib import Path
from typing import Dict, List, Optional

from .types import Live2DModel


class ModelScanner:
    """Live2D 模型目录扫描器"""

    def __init__(self, base_dirs: List[str]):
        self.base_dirs = [Path(d).resolve() for d in base_dirs]
        self.models: Dict[str, Live2DModel] = {}

    def scan_all(self) -> Dict[str, Live2DModel]:
        """扫描所有目录，发现 Live2D 模型"""
        self.models.clear()

        for base_dir in self.base_dirs:
            if not base_dir.exists():
                print(f"⚠️ 目录不存在: {base_dir}")
                continue

            self._scan_directory(base_dir, base_dir)

        print(f"🔍 扫描完成，发现 {len(self.models)} 个模型")
        for name, model in self.models.items():
            print(f"   - {name}: {model.path}")

        return self.models

    def _scan_directory(self, directory: Path, base_dir: Path) -> None:
        """递归扫描目录"""
        try:
            for item in directory.iterdir():
                if item.is_file() and item.suffix == '.json' and item.name.endswith('.model3.json'):
                    model = self._parse_model(item, base_dir)
                    if model:
                        self.models[model.name] = model
                elif item.is_dir() and not item.name.startswith('.'):
                    self._scan_directory(item, base_dir)
        except PermissionError:
            pass

    def _parse_model(self, model_file: Path, base_dir: Path) -> Optional[Live2DModel]:
        """解析模型文件"""
        try:
            model_dir = model_file.parent
            model_name = model_file.name.replace('.model3.json', '')

            # 查找相关文件
            cdi_file = None
            physics_file = None
            pose_file = None
            motions = []
            custom_prompt = None

            for f in model_dir.iterdir():
                if f.suffix == '.json':
                    if f.name.endswith('.cdi3.json'):
                        cdi_file = f.name
                    elif f.name.endswith('.physics3.json'):
                        physics_file = f.name
                    elif f.name.endswith('.pose3.json'):
                        pose_file = f.name
                elif f.suffix == '.txt' and f.name == 'model_prompt.txt':
                    # 读取模型专属 prompt
                    try:
                        custom_prompt = f.read_text(encoding='utf-8').strip()
                        if custom_prompt:
                            print(f"   📝 发现模型专属 prompt: {model_name}")
                    except Exception as e:
                        print(f"   ⚠️ 读取 model_prompt.txt 失败: {e}")

            # 查找动作文件
            motions_dir = model_dir / 'motions'
            if motions_dir.exists():
                motions = [f.name for f in motions_dir.iterdir()
                           if f.suffix == '.json' and f.name.endswith('.motion3.json')]

            # 计算相对路径 - 使用 base_dir 的目录名作为前缀
            # 例如: base_dir = F:\ai_controlled_l2d\l2d
            # model_file = F:\ai_controlled_l2d\l2d\amane.model3.json
            # 结果: l2d/amane.model3.json
            dir_name = base_dir.name  # "l2d"
            relative_model_path = model_file.relative_to(base_dir)
            relative_dir_path = model_dir.relative_to(base_dir)

            # 构建完整的相对路径（包含目录名）
            full_path = f"{dir_name}/{relative_model_path}".replace('\\', '/')
            full_dir = f"{dir_name}/{relative_dir_path}".replace('\\', '/') if str(relative_dir_path) != '.' else dir_name

            return Live2DModel(
                name=model_name,
                path=full_path,
                directory=full_dir,
                model_file=model_file.name,
                cdi_file=cdi_file,
                physics_file=physics_file,
                pose_file=pose_file,
                motions=motions,
                custom_prompt=custom_prompt
            )
        except Exception as e:
            print(f"⚠️ 解析模型失败 {model_file}: {e}")
            return None
