#!/usr/bin/env python3
"""
Whisper ASR 模型下载脚本
下载 OpenAI Whisper 模型用于本地语音识别
"""

import argparse
import os
import sys
from pathlib import Path

# 模型大小和对应的参数
MODEL_SIZES = {
    "tiny": {"params": "39M", "vram": "~1GB", "speed": "~32x"},
    "base": {"params": "74M", "vram": "~1GB", "speed": "~16x"},
    "small": {"params": "244M", "vram": "~2GB", "speed": "~6x"},
    "medium": {"params": "769M", "vram": "~5GB", "speed": "~2x"},
    "large": {"params": "1550M", "vram": "~10GB", "speed": "~1x"},
}


def check_dependencies():
    """检查依赖是否安装"""
    try:
        import whisper
        return True
    except ImportError:
        return False


def install_whisper():
    """安装 whisper 库"""
    print("📦 正在安装 openai-whisper...")
    import subprocess
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "openai-whisper"],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"❌ 安装失败: {result.stderr}")
        return False
    print("✅ openai-whisper 安装成功")
    return True


def download_model(model_size: str, model_path: str):
    """下载指定大小的 Whisper 模型"""
    import whisper

    print(f"\n🔽 正在下载 Whisper {model_size} 模型...")
    print(f"   参数量: {MODEL_SIZES[model_size]['params']}")
    print(f"   显存需求: {MODEL_SIZES[model_size]['vram']}")
    print(f"   相对速度: {MODEL_SIZES[model_size]['speed']}")
    print(f"   保存路径: {model_path}")
    print()

    # 设置下载目录
    os.makedirs(model_path, exist_ok=True)

    # 下载模型（whisper 会自动缓存）
    try:
        model = whisper.load_model(model_size, download_root=model_path)
        print(f"\n✅ 模型下载完成！")
        print(f"   模型已保存到: {model_path}")
        return True
    except Exception as e:
        print(f"\n❌ 下载失败: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="下载 Whisper ASR 模型用于本地语音识别",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python download_asr_model.py                    # 下载默认的 base 模型
  python download_asr_model.py --size small       # 下载 small 模型
  python download_asr_model.py --size tiny --path ./my_models  # 指定路径

模型大小说明:
  tiny   - 39M 参数, ~1GB显存, 最快但准确度最低
  base   - 74M 参数, ~1GB显存, 速度和准确度平衡 (推荐)
  small  - 244M 参数, ~2GB显存, 准确度较好
  medium - 769M 参数, ~5GB显存, 准确度高
  large  - 1550M 参数, ~10GB显存, 准确度最高但最慢
        """
    )

    parser.add_argument(
        "--size", "-s",
        choices=list(MODEL_SIZES.keys()),
        default="base",
        help="模型大小 (默认: base)"
    )

    parser.add_argument(
        "--path", "-p",
        default="./models/whisper",
        help="模型保存路径 (默认: ./models/whisper)"
    )

    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="列出所有可用的模型大小"
    )

    args = parser.parse_args()

    if args.list:
        print("\n可用的 Whisper 模型:\n")
        print(f"{'大小':<8} {'参数量':<10} {'显存需求':<12} {'相对速度':<10}")
        print("-" * 45)
        for size, info in MODEL_SIZES.items():
            print(f"{size:<8} {info['params']:<10} {info['vram']:<12} {info['speed']:<10}")
        print()
        return

    print("""
╔═══════════════════════════════════════════════════════════╗
║           Whisper ASR 模型下载工具                        ║
╚═══════════════════════════════════════════════════════════╝
    """)

    # 检查依赖
    if not check_dependencies():
        print("⚠️ 未安装 openai-whisper 库")
        response = input("是否现在安装？(y/n): ").strip().lower()
        if response == 'y':
            if not install_whisper():
                sys.exit(1)
        else:
            print("请先安装: pip install openai-whisper")
            sys.exit(1)

    # 下载模型
    model_path = Path(args.path).resolve()
    success = download_model(args.size, str(model_path))

    if success:
        print(f"""
╔═══════════════════════════════════════════════════════════╗
║  ✅ 下载完成！                                            ║
╠═══════════════════════════════════════════════════════════╣
║  在 config.yaml 中配置:                                   ║
║                                                           ║
║  voice:                                                   ║
║    asr:                                                   ║
║      mode: "local"                                        ║
║      local:                                               ║
║        modelPath: "{model_path}"
║        modelSize: "{args.size}"
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        """)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
