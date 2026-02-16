"""
AI Agent Orchestrator — 5-Step Analysis Pipeline
=================================================
Executes parallel-safe, retryable Gemini calls for:
  1. Summary + Key Points
  2. Decisions
  3. Action Items
  4. Risk Detection
  5. Sentiment Analysis

Each agent uses carefully crafted prompts with output schemas.
"""
import asyncio
import json
import logging
import time
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import google.generativeai as genai

from app.models.meeting import Meeting
from app.models.subtitle import Subtitle
from app.models.ai_result import AIResult
from app.core.config import settings

logger = logging.getLogger("meetingai.orchestrator")

# Configure Gemini once at module level
if settings.gemini_api_key:
    genai.configure(api_key=settings.gemini_api_key)


class AIAgentOrchestrator:
    """Runs a 5-step AI analysis pipeline on meeting transcripts (Async)."""

    def __init__(self, db: AsyncSession, meeting_id: int):
        self.db = db
        self.meeting_id = meeting_id
        self.transcript_text = ""
        self.model = genai.GenerativeModel(
            settings.gemini_model,
            generation_config=genai.types.GenerationConfig(
                temperature=settings.gemini_temperature,
            ),
        )

    # ── Transcript Reconstruction ─────────────────────
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

        lines = []
        for s in subtitles:
            ts = f"[{int(s.start_time)}s]"
            speaker = s.speaker_name or s.speaker_id or "Speaker"
            lines.append(f"{ts} {speaker}: {s.text}")

        self.transcript_text = "\n".join(lines)
        logger.info(
            "Transcript loaded for meeting %d: %d lines, %d chars",
            self.meeting_id, len(lines), len(self.transcript_text),
        )
        return self.transcript_text

    # ── Gemini Call with Retry ────────────────────────
    async def _call_gemini(self, task_prompt: str, schema_desc: str, fallback: dict | None = None) -> dict:
        """Call Gemini with retry logic and structured JSON extraction."""
        if not settings.gemini_api_key:
            logger.warning("Gemini API key not set — returning fallback")
            return fallback or {}

        full_prompt = f"""You are an expert meeting analyst AI. Analyze the meeting transcript below.

MEETING TRANSCRIPT:
---
{self.transcript_text}
---

YOUR TASK:
{task_prompt}

IMPORTANT RULES:
1. Return ONLY valid JSON — no markdown, no code blocks, no extra text.
2. Be thorough and extract every relevant detail.
3. Use exact speaker names from the transcript.
4. If information is not available, use empty arrays/null, never fabricate data.

EXPECTED JSON SCHEMA:
{schema_desc}"""

        for attempt in range(settings.gemini_max_retries + 1):
            try:
                # Async call to Gemini
                response = await self.model.generate_content_async(full_prompt)
                text = (response.text or "").strip()

                # Strip markdown code blocks if present
                if text.startswith("```"):
                    # Remove opening ```json or ```
                    first_newline = text.index("\n")
                    text = text[first_newline + 1:]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

                parsed = json.loads(text)
                return parsed

            except json.JSONDecodeError as e:
                logger.warning(
                    "JSON parse error on attempt %d for meeting %d: %s | raw: %s",
                    attempt + 1, self.meeting_id, e, text[:200] if 'text' in locals() else "no-text",
                )
                # Try to extract JSON from within the text
                try:
                    import re
                    match = re.search(r'(\{.*\})', text, re.DOTALL)
                    if match:
                        return json.loads(match.group(1))
                except Exception:
                    pass

            except Exception as e:
                logger.error(
                    "Gemini API error on attempt %d for meeting %d: %s",
                    attempt + 1, self.meeting_id, e,
                )

            if attempt < settings.gemini_max_retries:
                wait = 2 ** attempt  # exponential backoff: 1s, 2s
                logger.info("Retrying in %ds...", wait)
                await asyncio.sleep(wait)

        logger.error("All %d Gemini attempts failed for meeting %d", settings.gemini_max_retries + 1, self.meeting_id)
        return fallback or {}

    # ── Pipeline ──────────────────────────────────────
    async def run_pipeline(self) -> AIResult:
        """Execute the full 5-step analysis pipeline."""
        pipeline_start = time.perf_counter()
        logger.info("🚀 Starting AI Pipeline for Meeting %d", self.meeting_id)

        await self._fetch_transcript()

        # Run agents (Sequentially for safety, could be parallelized with asyncio.gather for speed)
        # Using gather for speed gains
        
        # 1. Summary Agent
        logger.info("  [1/5] Summary Agent...")
        summary_task = self._call_gemini(
            task_prompt=(
                "Generate a comprehensive meeting summary. Include:\n"
                "- An 'executive_summary': A 2-3 sentence overview of the entire meeting\n"
                "- 'key_points': Array of 3-8 important points discussed\n"
                "- 'topics_discussed': Array of main topics/themes\n"
                "- 'meeting_type': The type of meeting (standup, review, planning, brainstorm, etc.)"
            ),
            schema_desc='{ "executive_summary": "...", "key_points": ["..."], "topics_discussed": ["..."], "meeting_type": "..." }',
            fallback={"executive_summary": "", "key_points": [], "topics_discussed": [], "meeting_type": "general"},
        )
        
        # We can run these in parallel!
        # 2. Decision Agent
        decisions_task = self._call_gemini(
            task_prompt=(
                "Extract ALL decisions made during this meeting. For each decision:\n"
                "- 'decision': The actual decision made (clear statement)\n"
                "- 'context': Why this decision was made or what discussion led to it\n"
                "- 'stakeholders': Array of people involved in making this decision\n"
                "- 'impact': Brief note on the expected impact (high/medium/low)"
            ),
            schema_desc='{ "decisions": [{ "decision": "...", "context": "...", "stakeholders": ["..."], "impact": "..." }] }',
            fallback={"decisions": []},
        )
        
        # 3. Action Items Agent
        actions_task = self._call_gemini(
            task_prompt=(
                "Extract ALL action items and tasks from this meeting. For each:\n"
                "- 'task': Clear description of what needs to be done\n"
                "- 'owner': Person responsible (use exact name from transcript, or 'Unassigned')\n"
                "- 'deadline': Any mentioned deadline or timeframe (or null)\n"
                "- 'priority': 'high', 'medium', or 'low' based on urgency/importance\n"
                "- 'dependencies': Any blockers or prerequisites mentioned (or null)\n"
                "Be thorough — capture explicit tasks AND implied commitments."
            ),
            schema_desc='{ "action_items": [{ "task": "...", "owner": "...", "deadline": "...", "priority": "...", "dependencies": "..." }] }',
            fallback={"action_items": []},
        )

        # 4. Risk Detection Agent
        risks_task = self._call_gemini(
            task_prompt=(
                "Identify ALL risks, blockers, and concerns mentioned or implied. For each:\n"
                "- 'description': Clear description of the risk\n"
                "- 'severity': 'high', 'medium', or 'low'\n"
                "- 'type': Category (technical, resource, timeline, budget, dependency, communication)\n"
                "- 'mitigation': Any mitigation strategy discussed (or null)\n"
                "- 'owner': Who raised or is responsible for this risk\n"
                "Look for implicit risks too (tight timelines, resource constraints, unclear requirements)."
            ),
            schema_desc='{ "risks": [{ "description": "...", "severity": "...", "type": "...", "mitigation": "...", "owner": "..." }] }',
            fallback={"risks": []},
        )
        
        # 5. Sentiment Agent
        sentiment_task = self._call_gemini(
            task_prompt=(
                "Analyze the sentiment and emotional tone of each speaker and the meeting overall:\n"
                "- 'overall_tone': Overall meeting mood (positive, neutral, negative, mixed)\n"
                "- 'overall_score': Float from -1.0 (very negative) to 1.0 (very positive)\n"
                "- 'speakers': Array with per-speaker analysis:\n"
                "  - 'name': Speaker name\n"
                "  - 'sentiment': Their overall attitude (positive, neutral, negative, concerned, enthusiastic, etc.)\n"
                "  - 'confidence': Float 0.0-1.0 for how confident you are in this assessment\n"
                "  - 'key_emotions': Array of detected emotions (engaged, frustrated, excited, etc.)\n"
                "  - 'notable_moment': A brief quote or moment that captures their mood"
            ),
            schema_desc='{ "overall_tone": "...", "overall_score": 0.5, "speakers": [{ "name": "...", "sentiment": "...", "confidence": 0.8, "key_emotions": ["..."], "notable_moment": "..." }] }',
            fallback={"overall_tone": "neutral", "overall_score": 0.0, "speakers": []},
        )

        # Run all agents in parallel
        logger.info("  Running all agents in parallel...")
        summary_json, decisions_json, actions_json, risks_json, sentiment_json = await asyncio.gather(
            summary_task, decisions_task, actions_task, risks_task, sentiment_task
        )

        # ── Atomic Save ───────────────────────────────
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
        logger.info(
            "✅ AI Pipeline completed for Meeting %d in %.1fs",
            self.meeting_id, elapsed,
        )
        return ai_result
