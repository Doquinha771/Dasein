"""Compatibilidade: a antiga suíte de reservas foi substituída pelo smoke operacional."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('operations-ui-smoke.py')), run_name='__main__')
