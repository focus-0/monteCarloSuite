"""Central env config for Python example agents — mirrors server/config.js defaults."""
import os

try:
    from dotenv import load_dotenv

    _repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    load_dotenv(os.path.join(_repo_root, "server", ".env"))
except ImportError:
    pass


def _env(key: str, default: str = "") -> str:
    value = os.environ.get(key)
    if value is not None and value != "":
        return value
    return default


OLLAMA_BASE = _env("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_CHAT_URL = f"{OLLAMA_BASE}/api/chat"
MODEL_NAME = _env("OLLAMA_MODEL", _env("GEMMA_MODEL", "gemma4:12b"))
