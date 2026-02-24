"""
RAG (Retrieval-Augmented Generation) System — Lightweight
==========================================================
Uses Gemini directly for Q&A on meeting transcripts.
No heavy ML dependencies (sentence-transformers, FAISS) needed.
Instant responses (<5 seconds) for any transcript size.
"""
from __future__ import annotations

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from google import genai

from app.core.config import settings
from app.models.subtitle import Subtitle

logger = logging.getLogger("meetingai.rag")


class RAGStore:
    """Lightweight RAG that sends transcript + question directly to Gemini."""

    def __init__(self):
        # Cache transcripts in memory to avoid repeated DB queries
        self._transcripts: dict[int, str] = {}

    def invalidate(self, meeting_id: int):
        """Remove cached transcript for a meeting."""
        self._transcripts.pop(meeting_id, None)
        logger.info("RAG cache invalidated for meeting %d", meeting_id)

    async def _get_transcript(self, meeting_id: int, db: AsyncSession) -> str:
        """Fetch and cache the full transcript for a meeting."""
        if meeting_id in self._transcripts:
            return self._transcripts[meeting_id]

        stmt = (
            select(Subtitle)
            .where(Subtitle.meeting_id == meeting_id)
            .order_by(Subtitle.start_time)
        )
        result = await db.execute(stmt)
        subtitles = result.scalars().all()

        if not subtitles:
            raise ValueError("No transcript found for this meeting.")

        # Build transcript text
        lines = []
        for s in subtitles:
            speaker = s.speaker_name or s.speaker_id or "Speaker"
            lines.append(f"{speaker}: {s.text}")

        transcript = "\n".join(lines)
        self._transcripts[meeting_id] = transcript
        logger.info("Transcript cached for meeting %d: %d lines", meeting_id, len(lines))
        return transcript

    async def query(self, meeting_id: int, question: str, db: AsyncSession | None = None) -> dict:
        """
        Answer a question about a meeting using Gemini directly.
        Fast (<5s) — no vector indexing needed.
        """
        if not settings.gemini_api_key:
            return {
                "answer": "AI is not configured. Please set the Gemini API key.",
                "evidence": [],
                "chunks_searched": 0,
            }

        if db is None:
            return {
                "answer": "Database session not available.",
                "evidence": [],
                "chunks_searched": 0,
            }

        try:
            transcript = await self._get_transcript(meeting_id, db)
        except ValueError as e:
            return {
                "answer": str(e),
                "evidence": [],
                "chunks_searched": 0,
            }

        prompt = f"""You are an AI assistant answering questions about a meeting based on its transcript.

MEETING TRANSCRIPT:
{transcript}

USER QUESTION: {question}

INSTRUCTIONS:
1. Answer ONLY based on the transcript above.
2. Cite specific speakers in your answer (e.g., "According to John...").
3. If the transcript doesn't contain enough information, say so clearly.
4. Be concise but thorough.
5. If multiple speakers discuss the topic, mention all relevant perspectives.
6. Format your answer in clear, readable paragraphs."""

        try:
            client = genai.Client(api_key=settings.gemini_api_key)
            response = await client.aio.models.generate_content(
                model=settings.gemini_model,
                contents=prompt,
            )
            answer = (response.text or "").strip()
        except Exception as e:
            logger.error("Gemini RAG query failed: %s", e)
            answer = f"I could not process your question right now. Error: {str(e)[:100]}"

        return {
            "answer": answer,
            "evidence": [],
            "chunks_searched": len(transcript.split("\n")),
        }


rag_store = RAGStore()
