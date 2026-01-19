"""
Live2D 模型文件监听器
"""

import asyncio
from typing import Callable, Optional

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from .scanner import ModelScanner


class ModelWatcher(FileSystemEventHandler):
    """文件系统监听器，监听模型文件变化"""

    def __init__(self, scanner: ModelScanner, on_change_callback: Optional[Callable] = None):
        self.scanner = scanner
        self.on_change = on_change_callback
        self._debounce_task = None

    def on_any_event(self, event) -> None:
        if event.is_directory:
            return

        # 只关注 model3.json 文件的变化
        if event.src_path.endswith('.model3.json'):
            # 防抖：避免短时间内多次触发
            if self._debounce_task:
                self._debounce_task.cancel()

            loop = asyncio.get_event_loop()
            self._debounce_task = loop.call_later(1.0, self._handle_change)

    def _handle_change(self) -> None:
        print("📁 检测到模型文件变化，重新扫描...")
        self.scanner.scan_all()
        if self.on_change:
            asyncio.create_task(self.on_change())


def start_watcher(scanner: ModelScanner, on_change_callback: Optional[Callable] = None) -> Observer:
    """启动文件监听器"""
    event_handler = ModelWatcher(scanner, on_change_callback)
    observer = Observer()

    for base_dir in scanner.base_dirs:
        if base_dir.exists():
            observer.schedule(event_handler, str(base_dir), recursive=True)
            print(f"👁️ 监听目录: {base_dir}")

    observer.start()
    return observer
