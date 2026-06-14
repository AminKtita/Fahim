"""Ollama client wrapper for FitCoach.

This module keeps the model interface small and predictable:
- one chat function for normal coaching replies
- one structured helper for extracting [LOG_DATA] blocks
- conservative generation defaults to reduce drift and hallucination

Env vars:
- OLLAMA_HOST   defaults to http://localhost:11434
- OLLAMA_MODEL  defaults to Agen/gemma-4-26B-A4B-it-uncensored-heretic
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests

## for Dockeer : http://host.docker.internal:11434

DEFAULT_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "Agen/gemma-4-26B-A4B-it-uncensored-heretic")
DEFAULT_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "120"))

# Conservative defaults: keep the model factual and stable.
DEFAULT_OPTIONS: Dict[str, Any] = {
    "temperature": 0.2,
    "top_p": 0.9,
    "top_k": 40,
    "repeat_penalty": 1.1,
    "num_ctx": 8192,
}

LOG_DATA_RE = re.compile(r"\[LOG_DATA\]\s*(\{.*?\})\s*\[/LOG_DATA\]", re.DOTALL)


class OllamaError(RuntimeError):
    """Raised when the Ollama server returns an error or bad payload."""


@dataclass
class ChatResult:
    """Unified response object for the chat API."""

    text: str
    raw: Dict[str, Any]
    log_data: Optional[Dict[str, Any]] = None
    thinking: Optional[str] = None


def _merge_options(options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    merged = dict(DEFAULT_OPTIONS)
    if options:
        merged.update(options)
    return merged


def _post(path: str, payload: Dict[str, Any], timeout: Optional[float] = None) -> Dict[str, Any]:
    url = f"{DEFAULT_HOST}{path}"
    try:
        response = requests.post(url, json=payload, timeout=timeout or DEFAULT_TIMEOUT)
    except requests.RequestException as exc:
        raise OllamaError(f"Failed to reach Ollama at {url}: {exc}") from exc

    if response.status_code >= 400:
        raise OllamaError(f"Ollama error {response.status_code} from {url}: {response.text}")

    try:
        return response.json()
    except ValueError as exc:
        raise OllamaError(f"Invalid JSON response from Ollama at {url}") from exc


def _post_stream(path: str, payload: Dict[str, Any], timeout: Optional[float] = None) -> Iterable[Dict[str, Any]]:
    url = f"{DEFAULT_HOST}{path}"
    try:
        response = requests.post(
            url,
            json=payload,
            timeout=timeout or DEFAULT_TIMEOUT,
            stream=True,
        )
    except requests.RequestException as exc:
        raise OllamaError(f"Failed to reach Ollama at {url}: {exc}") from exc

    if response.status_code >= 400:
        raise OllamaError(f"Ollama error {response.status_code} from {url}: {response.text}")

    for line in response.iter_lines(decode_unicode=True):
        if not line:
            continue
        try:
            yield json.loads(line)
        except ValueError:
            continue


def extract_log_data(text: str) -> Tuple[str, Optional[Dict[str, Any]]]:
    """Extract the first [LOG_DATA] JSON block from a model response.

    Returns:
        (clean_text, parsed_json_or_none)
    """
    match = LOG_DATA_RE.search(text)
    if not match:
        return text.strip(), None

    raw_json = match.group(1)
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError:
        parsed = None

    cleaned = LOG_DATA_RE.sub("", text).strip()
    return cleaned, parsed


def chat(
    messages: List[Dict[str, str]],
    *,
    model: Optional[str] = None,
    options: Optional[Dict[str, Any]] = None,
    stream: bool = False,
    timeout: Optional[float] = None,
) -> ChatResult:
    """Send a chat request to Ollama.

    Args:
        messages: list of dicts in Ollama chat format.
        model: override default model name.
        options: generation options merged with conservative defaults.
        stream: if True, consume streamed chunks and return the final text.
        timeout: request timeout in seconds.
    """
    payload = {
        "model": model or DEFAULT_MODEL,
        "messages": messages,
        "options": _merge_options(options),
        "stream": stream,
        "think": True,
    }

    if not stream:
        data = _post("/api/chat", payload, timeout=timeout)
        message = data.get("message") or {}
                
        text = (message.get("content") or "").strip()
        thinking = (message.get("thinking") or "").strip() or None
        clean_text, log_data = extract_log_data(text)
        return ChatResult(text=clean_text, raw=data,
                        log_data=log_data, thinking=thinking)
    

    parts: List[str] = []
    think_parts: List[str] = []
    raw_events: List[Dict[str, Any]] = []
    thinking_started = False
    reply_started    = False
    for event in _post_stream("/api/chat", payload, timeout=timeout):
        raw_events.append(event)
        msg         = event.get("message", {})
        chunk       = msg.get("content", "")
        think_chunk = msg.get("thinking", "")

        # ── THINKING STREAM ──
        if think_chunk:
            if not thinking_started:
                # Print thinking header once
                print("\n\033[90m━━━ thinking ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                thinking_started = True
            # Print each thinking token live as it arrives
            print(f"\033[90m{think_chunk}\033[0m", end="", flush=True)
            think_parts.append(think_chunk)

        # ── REPLY STREAM ──
        if chunk:
            if not reply_started:
                # Close thinking block and open reply block
                if thinking_started:
                    print("\n\033[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m")
                print(f"\n\033[96mCoach:\033[0m ", end="", flush=True)
                reply_started = True
            # Print each reply token live
            print(chunk, end="", flush=True)
            parts.append(chunk)

    # Final newline after streamed reply
    if reply_started:
        print("\n")

    text     = "".join(parts).strip()
    thinking = "".join(think_parts).strip() or None
    clean_text, log_data = extract_log_data(text)
    return ChatResult(text=clean_text, raw={"events": raw_events},
                      log_data=log_data, thinking=thinking)


def generate(
    prompt: str,
    *,
    system: Optional[str] = None,
    model: Optional[str] = None,
    options: Optional[Dict[str, Any]] = None,
    stream: bool = False,
    timeout: Optional[float] = None,
) -> ChatResult:
    """Convenience wrapper for single-turn generation."""
    messages: List[Dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return chat(messages, model=model, options=options, stream=stream, timeout=timeout)


def chat_with_context(
    user_message: str,
    system_prompt: str,
    *,
    model: Optional[str] = None,
    options: Optional[Dict[str, Any]] = None,
    stream: bool = False,
    timeout: Optional[float] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> ChatResult:
    """High-level helper for FitCoach.

    Pass in the full system prompt built from context_builder, plus an optional
    list of prior messages.
    """
    messages: List[Dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_message})
    return chat(messages, model=model, options=options, stream=stream, timeout=timeout)


def healthcheck(timeout: float = 5.0) -> bool:
    """Return True if Ollama is reachable."""
    try:
        response = requests.get(f"{DEFAULT_HOST}/api/tags", timeout=timeout)
        return response.status_code == 200
    except requests.RequestException:
        return False


def list_models(timeout: Optional[float] = None) -> Dict[str, Any]:
    url = f"{DEFAULT_HOST}/api/tags"

    try:
        response = requests.get(
            url,
            timeout=timeout or DEFAULT_TIMEOUT
        )
        response.raise_for_status()
        return response.json()

    except requests.RequestException as exc:
        raise OllamaError(
            f"Failed to get model list from {url}: {exc}"
        ) from exc



if __name__ == "__main__":
    print("Healthcheck:", healthcheck())

    if healthcheck():
        print("\nAvailable models:")
        print(json.dumps(list_models(), indent=2))

        result = generate(
            prompt="What is 2 + 2?",
            system="Answer in one sentence."
        )
        print("\nModel response:")
        print(result.text)
    else:
        print("Ollama is not running. Start it with: ollama serve")