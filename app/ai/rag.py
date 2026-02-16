"""
RAG (Retrieval-Augmented Generation) System
============================================
Built on the subtitle timeline as the single source of truth.
Features:
  - Sliding window chunking for better context
  - FAISS vector similarity search
  - Evidence-cited Gemini answer generation
  - Configurable chunk size and top-K
  - Async execution for non-blocking I/O and ML ops
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import google.generativeai as genai

from app.core.config import settings
from app.models.subtitle import Subtitle

logger = logging.getLogger("meetingai.rag")

# Configure Gemini for RAG answer generation
if settings.gemini_api_key:
    genai.configure(api_key=settings.gemini_api_key)


class RAGStore:
    """In-memory FAISS vector store keyed by meeting_id with sliding window chunks."""

    def __init__(self):
        self._encoder: SentenceTransformer | None = None
        self.indexes: dict[int, faiss.IndexFlatL2] = {}
        self.chunks: dict[int, list[dict]] = defaultdict(list)

    # ── Encoder (lazy loaded) ─────────────────────────
    def _get_encoder(self) -> SentenceTransformer:
        if self._encoder is None:
            logger.info("Loading sentence transformer: %s", settings.rag_model_name)
            self._encoder = SentenceTransformer(settings.rag_model_name)
            logger.info("Sentence transformer loaded")
        return self._encoder

    # ── Build Index from Subtitles ────────────────────
    async def build_from_subtitles(self, meeting_id: int, db: AsyncSession) -> int:
        """
        Fetch all subtitles for a meeting and build a FAISS index.
        Uses sliding window chunking to combine nearby subtitles
        for better semantic context.

        Returns the number of chunks indexed.
        """
        stmt = (
            select(Subtitle)
            .where(Subtitle.meeting_id == meeting_id)
            .order_by(Subtitle.start_time)
        )
        result = await db.execute(stmt)
        subtitles = result.scalars().all()

        if not subtitles:
            raise ValueError("No subtitles found for this meeting. Cannot build RAG index.")

        # Sliding window: combine N consecutive subtitles into one chunk
        window_size = settings.rag_chunk_size
        chunks = []
        texts_for_embedding = []

        # Logic is fast enough to run in main thread, but encoding is slow
        for i in range(0, len(subtitles), max(1, window_size // 2)):  # 50% overlap
            window = subtitles[i : i + window_size]
            if not window:
                continue

            # Combine text with speaker attribution
            combined_text = " ".join(
                f"{s.speaker_name or s.speaker_id}: {s.text}" for s in window
            )

            chunk = {
                "text": combined_text,
                "speakers": list({s.speaker_name or s.speaker_id for s in window}),
                "start": window[0].start_time,
                "end": window[-1].end_time,
                "subtitle_count": len(window),
            }
            chunks.append(chunk)
            texts_for_embedding.append(combined_text)

        # Offload encoding and indexing to a thread
        await asyncio.to_thread(self._build_index_sync, meeting_id, chunks, texts_for_embedding)

        return len(chunks)

    def _build_index_sync(self, meeting_id: int, chunks: list[dict], texts: list[str]):
        """Synchronous part of building index (CPU bound)."""
        encoder = self._get_encoder()
        vectors = encoder.encode(texts, show_progress_bar=False)
        vectors = np.array(vectors).astype("float32")

        # Normalize for cosine similarity
        faiss.normalize_L2(vectors)

        index = faiss.IndexFlatIP(vectors.shape[1])  # Inner product for cosine sim
        index.add(vectors)

        self.indexes[meeting_id] = index
        self.chunks[meeting_id] = chunks

        logger.info(
            "RAG index built for meeting %d: %d chunks",
            meeting_id, len(chunks)
        )

    # ── Invalidate Cache ──────────────────────────────
    def invalidate(self, meeting_id: int):
        """Remove cached index for a meeting (e.g., after re-analysis)."""
        self.indexes.pop(meeting_id, None)
        self.chunks.pop(meeting_id, None)
        logger.info("RAG cache invalidated for meeting %d", meeting_id)

    # ── Retrieve Top-K Evidence ───────────────────────
    async def retrieve(self, meeting_id: int, query: str, k: int | None = None) -> list[dict]:
        """Return the k most relevant subtitle chunks for the query."""
        if meeting_id not in self.indexes:
            return []

        k = k or settings.rag_top_k
        
        # Offload search to thread
        return await asyncio.to_thread(self._retrieve_sync, meeting_id, query, k)

    def _retrieve_sync(self, meeting_id: int, query: str, k: int) -> list[dict]:
        encoder = self._get_encoder()
        query_vec = np.array(encoder.encode([query])).astype("float32")
        faiss.normalize_L2(query_vec)

        if meeting_id not in self.indexes:
             return []

        distances, indices = self.indexes[meeting_id].search(query_vec, k)

        results = []
        for i, idx in enumerate(indices[0]):
            if 0 <= idx < len(self.chunks[meeting_id]):
                chunk = self.chunks[meeting_id][idx]
                results.append({
                    **chunk,
                    "relevance_score": float(distances[0][i]),
                })

        # Sort by relevance (highest first for inner product)
        results.sort(key=lambda x: x["relevance_score"], reverse=True)
        return results

    # ── Full RAG Query ────────────────────────────────
    async def query(self, meeting_id: int, question: str, db: AsyncSession | None = None) -> dict:
        """
        End-to-end RAG pipeline:
        1. Build index if not cached
        2. Retrieve evidence chunks
        3. Generate answer with Gemini using evidence
        4. Return answer + cited evidence
        """
        # Auto-build if not cached
        if meeting_id not in self.indexes and db is not None:
            await self.build_from_subtitles(meeting_id, db)

        evidence = await self.retrieve(meeting_id, question)

        if not evidence:
            return {
                "answer": "No relevant information found in this meeting transcript.",
                "evidence": [],
                "confidence": 0.0,
            }

        # Format evidence for Gemini
        evidence_text = "\n\n".join(
            f"[{int(e['start'])}s–{int(e['end'])}s] ({', '.join(e.get('speakers', []))})\n{e['text']}"
            for e in evidence
        )

        prompt = f"""You are an AI assistant answering questions about a meeting based on transcript evidence.

EVIDENCE FROM TRANSCRIPT:
{evidence_text}

QUESTION: {question}

INSTRUCTIONS:
1. Answer ONLY based on the evidence provided above.
2. Cite specific speakers and timestamps in your answer (e.g., "According to John at [45s]...").
3. If the evidence doesn't contain enough information to fully answer, say so clearly.
4. Be concise but thorough.
5. If multiple speakers discuss the topic, mention all relevant perspectives."""

        try:
            model = genai.GenerativeModel(settings.gemini_model)
            response = await model.generate_content_async(prompt)
            answer = (response.text or "").strip()
        except Exception as e:
            logger.error("Gemini RAG answer generation failed: %s", e)
            answer = "I could not generate an answer at this time. Please try again."

        return {
            "answer": answer,
            "evidence": [
                {
                    "text": e["text"],
                    "speakers": e.get("speakers", []),
                    "start_time": e["start"],
                    "end_time": e["end"],
                    "relevance": round(e.get("relevance_score", 0), 3),
                }
                for e in evidence
            ],
            "chunks_searched": len(self.chunks.get(meeting_id, [])),
        }

rag_store = RAGStore()
