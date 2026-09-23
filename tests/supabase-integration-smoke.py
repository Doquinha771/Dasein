"""Compatibility entrypoint: current browser integration regressions."""
from pathlib import Path
from runpy import run_path
run_path(str(Path(__file__).with_name('028-connection-42501-smoke.py')))
