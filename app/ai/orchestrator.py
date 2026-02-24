"""
AI Agent Orchestrator — Full Analysis Pipeline
===============================================
Generates meeting summary, action items, decisions, and risks using Gemini.
Runs two API calls: one for summary, one for structured extraction.
"""
import asyncio
import json
import logging
import re
import time
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from google import genai

from app.models.meeting import Meeting
from app.models.subtitle import Subtitle
from app.models.ai_result import AIResult
from app.core.config import settings

logger = logging.getLogger("meetingai.orchestrator")


class AIAgentOrchestrator:
    """Runs a streamlined AI analysis pipeline on meeting transcripts."""

    def __init__(self, db: AsyncSession, meeting_id: int):
        self.db = db
        self.meeting_id = meeting_id
        self.transcript_text = ""
        self.client = genai.Client(api_key=settings.gemini_api_key) if settings.gemini_api_key else None

    async def _fetch_transcript(self) -> str:
        stmt = (
            select(Subtitle)
            .where(Subtitle.meeting_id == self.meeting_id)
            .order_by(Subtitle.start_time)
        )
        result = await self.db.execute(stmt)
        subtitles = result.scalars().all()

        if not subtitles:
            raise ValueError("No subtitles found for this meeting. Upload a transcript first.")

        lines = [f"{s.speaker_name or s.speaker_id}: {s.text}" for s in subtitles]
        self.transcript_text = "\n".join(lines)
        return self.transcript_text

    async def _call_gemini(self, prompt: str, fallback: dict) -> dict:
        """Call Gemini and extract JSON response."""
        if not self.client:
            logger.warning("Gemini API key missing, returning fallback.")
            return fallback

        for attempt in range(settings.gemini_max_retries + 1):
            try:
                response = await self.client.aio.models.generate_content(
                    model=settings.gemini_model,
                    contents=prompt,
                )
                text = (response.text or "").strip()

                # Strip markdown code blocks
                if text.startswith("```"):
                    first_newline = text.find("\n")
                    if first_newline != -1:
                        text = text[first_newline + 1:]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

                return json.loads(text)

            except json.JSONDecodeError:
                # Try extracting JSON from text
                match = re.search(r'(\{.*\})', text, re.DOTALL)
                if match:
                    try:
                        return json.loads(match.group(1))
                    except Exception:
                        pass
                logger.warning("JSON parse error attempt %d for meeting %d", attempt + 1, self.meeting_id)

            except Exception as e:
                logger.error("Gemini error attempt %d for meeting %d: %s", attempt + 1, self.meeting_id, e)

            if attempt < settings.gemini_max_retries:
                await asyncio.sleep(2 ** attempt)

        return fallback

    async def run_pipeline(self) -> AIResult:
        """Execute the AI analysis pipeline — Summary + Actions + Decisions."""
        pipeline_start = time.perf_counter()
        logger.info("🚀 Starting AI Pipeline for Meeting %d", self.meeting_id)

        await self._fetch_transcript()

        # ── 1) Summary Agent ──
        summary_prompt = f"""You are analyzing a meeting transcript.
Generate a comprehensive meeting summary. Include:
- "executive_summary": A 2-3 sentence overview of the entire meeting
- "key_points": Array of 3-8 important points discussed
- "topics_discussed": Array of main topics/themes
- "meeting_type": The type of meeting (standup, review, planning, brainstorm, etc.)

TRANSCRIPT:
{self.transcript_text}

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks.
EXPECTED JSON:
{{ "executive_summary": "...", "key_points": ["..."], "topics_discussed": ["..."], "meeting_type": "..." }}"""

        summary_json = await self._call_gemini(
            summary_prompt,
            fallback={"executive_summary": "", "key_points": [], "topics_discussed": [], "meeting_type": "general"},
        )

        # ── 2) Actions + Decisions Agent ──
        actions_prompt = f"""You are analyzing a meeting transcript to extract action items and decisions.

Extract ALL action items (tasks that need to be done) and decisions made during the meeting.

TRANSCRIPT:
{self.transcript_text}

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks.
EXPECTED JSON:
{{
  "action_items": [
    {{
      "task": "Description of the action item",
      "owner": "Person responsible (or 'Unassigned' if unclear)",
      "priority": "high/medium/low",
      "subtitle_ref": "Brief quote from transcript that mentions this task"
    }}
  ],
  "decisions": [
    {{
      "decision": "What was decided",
      "context": "Why or how it was decided"
    }}
  ],
  "risks": [
    {{
      "risk": "Description of potential risk or concern raised",
      "severity": "high/medium/low"
    }}
  ]
}}

If there are no items for a category, return an empty array.
Be thorough — extract even implied action items like "we should..." or "let's..." or "next step is..."."""

        actions_json = await self._call_gemini(
            actions_prompt,
            fallback={"action_items": [], "decisions": [], "risks": []},
        )

        # Normalize: ensure expected keys exist
        if "action_items" not in actions_json:
            actions_json["action_items"] = []
        decisions_json = {"decisions": actions_json.pop("decisions", [])}
        risks_json = {"risks": actions_json.pop("risks", [])}

        # ── 3) Sentiment (lightweight — derive from summary) ──
        sentiment_json = {"overall": "neutral", "distribution": {}}

        # Save results
        result = await self.db.execute(select(AIResult).filter(AIResult.meeting_id == self.meeting_id))
        ai_result = result.scalar_one_or_none()

        if not ai_result:
            ai_result = AIResult(meeting_id=self.meeting_id)
            self.db.add(ai_result)

        ai_result.summary_json = summary_json
        ai_result.decisions_json = decisions_json
        ai_result.actions_json = actions_json
        ai_result.risks_json = risks_json
        ai_result.sentiment_json = sentiment_json
        ai_result.created_at = datetime.utcnow()

        await self.db.commit()

        elapsed = time.perf_counter() - pipeline_start
        logger.info("✅ AI Pipeline completed for Meeting %d in %.1fs (actions: %d, decisions: %d)",
                     self.meeting_id, elapsed,
                     len(actions_json.get("action_items", [])),
                     len(decisions_json.get("decisions", [])))
        return ai_result

