"""
Gemini Client — Reusable LLM interface with JSON extraction and retry.
Uses the new google-genai SDK.
"""
import json
import re
import logging
import asyncio
from typing import Any

from google import genai

from app.core.config import settings

logger = logging.getLogger("meetingai.gemini")


class GeminiClient:
    def __init__(self):
        self.client = genai.Client(api_key=settings.gemini_api_key) if settings.gemini_api_key else None

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any] | None:
        """Extract JSON from model output, handling markdown blocks."""
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try extracting from markdown code block
        match = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        # Try finding any JSON object
        match = re.search(r"(\{.*\})", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        # Try finding any JSON array
        match = re.search(r"(\[.*\])", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        return None

    def run_json_prompt(
        self,
        instruction: str,
        transcript: str,
        fallback: dict[str, Any],
        retries: int | None = None,
    ) -> dict[str, Any]:
        """Run a prompt expecting JSON output with retry logic (sync)."""
        if not self.client:
            logger.warning("Gemini API key not configured")
            return fallback

        max_retries = retries or settings.gemini_max_retries

        prompt = (
            "Return ONLY valid JSON. No markdown, no code blocks, no explanation.\n"
            f"Instruction: {instruction}\n"
            f"Input:\n{transcript}"
        )

        import time
        for attempt in range(max_retries + 1):
            try:
                response = self.client.models.generate_content(
                    model=settings.gemini_model,
                    contents=prompt
                )
                text = (response.text or "").strip()
            except Exception as e:
                logger.error("Gemini API error (attempt %d): %s", attempt + 1, e)
                if attempt < max_retries:
                    time.sleep(2 ** attempt)
                    continue
                return fallback

            parsed = self._extract_json(text)
            if isinstance(parsed, dict):
                return parsed

            logger.warning(
                "Failed to parse JSON (attempt %d): %s",
                attempt + 1, text[:100],
            )
            if attempt < max_retries:
                time.sleep(2 ** attempt)

        return fallback
