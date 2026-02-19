"""
Live2D model file watcher.
"""

import asyncio
import threading
from typing import Callable, Optional

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from .scanner import ModelScanner


class ModelWatcher(FileSystemEventHandler):
    """Watch model files and debounce reload notifications."""

    def __init__(
        self,
        scanner: ModelScanner,
        on_change_callback: Optional[Callable] = None,
        loop: Optional[asyncio.AbstractEventLoop] = None,
    ):
        self.scanner = scanner
        self.on_change = on_change_callback
        self.loop = loop
        self._debounce_timer: Optional[threading.Timer] = None
        self._debounce_lock = threading.Lock()

    def on_any_event(self, event) -> None:
        if event.is_directory:
            return

        # Only react to model definition changes.
        if not event.src_path.endswith(".model3.json"):
            return

        with self._debounce_lock:
            if self._debounce_timer:
                self._debounce_timer.cancel()

            self._debounce_timer = threading.Timer(1.0, self._handle_change)
            self._debounce_timer.daemon = True
            self._debounce_timer.start()

    def _handle_change(self) -> None:
        print("Model file changed, rescanning...")
        self.scanner.scan_all()

        if not self.on_change:
            return

        callback_result = self.on_change()
        if not asyncio.iscoroutine(callback_result):
            return

        if self.loop and not self.loop.is_closed():
            asyncio.run_coroutine_threadsafe(callback_result, self.loop)
            return

        try:
            asyncio.run(callback_result)
        except RuntimeError:
            pass


def start_watcher(scanner: ModelScanner, on_change_callback: Optional[Callable] = None) -> Observer:
    """Start filesystem watcher for model directories."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    event_handler = ModelWatcher(scanner, on_change_callback, loop=loop)
    observer = Observer()

    for base_dir in scanner.base_dirs:
        if base_dir.exists():
            observer.schedule(event_handler, str(base_dir), recursive=True)
            print(f"Watching directory: {base_dir}")

    observer.start()
    return observer
