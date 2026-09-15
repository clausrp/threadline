"""
Threadline — AI layer
Transcription : faster-whisper (local, offline)
Summarisation : Ollama (local, offline)
"""

import json
import os
import tempfile
from pathlib import Path
from typing import Optional

# ── Configuration ──────────────────────────────────────────────────────────────

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL",    "llama3.1:8b")
WHISPER_MODEL   = os.getenv("WHISPER_MODEL",   "base")   # tiny|base|small|medium|large

# ── Whisper transcription ─────────────────────────────────────────────────────

_whisper_model = None   # lazy-loaded on first use


def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel(WHISPER_MODEL, device="auto", compute_type="auto")
        except ImportError:
            raise RuntimeError(
                "faster-whisper is not installed. "
                "Run the install script or: pip install faster-whisper"
            )
    return _whisper_model


def transcribe_audio(audio_bytes: bytes, filename: str) -> str:
    """
    Transcribe audio bytes using faster-whisper.
    Returns the full transcript as a single string.
    """
    suffix = Path(filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        model = _get_whisper()
        segments, _info = model.transcribe(tmp_path, beam_size=5)
        transcript = " ".join(segment.text.strip() for segment in segments)
        return transcript.strip()
    finally:
        os.unlink(tmp_path)


# ── Ollama summarisation ──────────────────────────────────────────────────────

def _ollama_generate(prompt: str) -> str:
    """Call the local Ollama API and return the response text."""
    try:
        import urllib.request
        payload = json.dumps({
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
        }).encode()
        req = urllib.request.Request(
            f"{OLLAMA_BASE_URL}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode())
            return result.get("response", "").strip()
    except Exception as exc:
        raise RuntimeError(
            f"Could not reach Ollama at {OLLAMA_BASE_URL}. "
            "Make sure Ollama is running. "
            f"Details: {exc}"
        )


def summarise_entry(
    title: str,
    transcript: str,
    process_name: str,
    entry_type: str,
) -> dict:
    """
    Produce a structured summary for a single timeline entry.
    Returns {"summary": str, "key_points": [str], "action_items": [str]}
    """
    prompt = f"""You are a precise assistant helping someone track an important process.
A {entry_type} called "{title}" was recorded as part of the process "{process_name}".

Here is the transcript:
---
{transcript}
---

Produce a structured summary with three sections:
1. SUMMARY: Two to four sentences capturing the most important information.
2. KEY POINTS: Up to five bullet points of the key facts or decisions.
3. ACTION ITEMS: Up to five bullet points of any follow-up actions or next steps mentioned.

Respond ONLY with valid JSON in this exact format:
{{
  "summary": "...",
  "key_points": ["...", "..."],
  "action_items": ["...", "..."]
}}"""

    raw = _ollama_generate(prompt)

    # Extract JSON even if Ollama wraps it in markdown fences
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        # Fallback: return the raw text as the summary
        return {"summary": raw, "key_points": [], "action_items": []}


def summarise_process(process_name: str, entries: list[dict]) -> dict:
    """
    Produce a high-level process summary across all entries.
    Returns {"summary": str, "key_themes": [str], "next_steps": [str]}
    """
    entries_text = "\n".join(
        f"- [{e['entry_type'].upper()}] {e['entry_date']}: {e['title']} — {e.get('description', '')}"
        for e in entries
    )

    prompt = f"""You are a precise assistant helping someone review an important process.
The process is called "{process_name}" and has {len(entries)} recorded entries.

Here is the timeline of events:
---
{entries_text}
---

Produce a structured overview with three sections:
1. SUMMARY: Three to five sentences summarising the overall story and current status.
2. KEY THEMES: Up to five bullet points of the main themes or threads.
3. NEXT STEPS: Up to five bullet points of recommended next steps based on the history.

Respond ONLY with valid JSON in this exact format:
{{
  "summary": "...",
  "key_themes": ["...", "..."],
  "next_steps": ["...", "..."]
}}"""

    raw = _ollama_generate(prompt)

    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        return {"summary": raw, "key_themes": [], "next_steps": []}


def check_ollama() -> dict:
    """Return Ollama status for the /api/ai/status health endpoint."""
    try:
        import urllib.request
        with urllib.request.urlopen(f"{OLLAMA_BASE_URL}/api/tags", timeout=5) as resp:
            data = json.loads(resp.read().decode())
            models = [m["name"] for m in data.get("models", [])]
            return {
                "available": True,
                "model": OLLAMA_MODEL,
                "model_installed": any(OLLAMA_MODEL in m for m in models),
                "available_models": models,
            }
    except Exception as exc:
        return {"available": False, "model": OLLAMA_MODEL, "error": str(exc)}


def check_whisper() -> dict:
    """Return Whisper status for the /api/ai/status health endpoint."""
    try:
        from faster_whisper import WhisperModel  # noqa: F401
        return {"available": True, "model": WHISPER_MODEL}
    except ImportError:
        return {"available": False, "model": WHISPER_MODEL, "error": "faster-whisper not installed"}
