import logging
import io
import os
import subprocess
import numpy as np
from app.core.config import settings

logger = logging.getLogger(__name__)

# Lazy imports for heavy ML dependencies
whisper = None
torch = None
Pipeline = None

def _load_ml_deps():
    global whisper, torch, Pipeline
    if torch is None:
        try:
            import torch as _torch
            import whisper as _whisper
            torch = _torch
            whisper = _whisper
        except ImportError as e:
            logger.warning(f"ML dependencies not available (whisper/torch): {e}")
            return False
    if Pipeline is None:
        try:
            from pyannote.audio import Pipeline as _Pipeline
            Pipeline = _Pipeline
        except ImportError:
            logger.warning("pyannote.audio not available, diarization disabled")
    return torch is not None and whisper is not None

class SpeechProcessor:
    def __init__(self):
        if not _load_ml_deps():
            raise RuntimeError("Required ML dependencies (torch, whisper) are not installed")

        # Initialize Whisper
        logger.info("Loading Whisper Model...")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.whisper_model = whisper.load_model("base", device=self.device)
        logger.info(f"Whisper Model Loaded on {self.device}")

        # Initialize Pyannote Diarization (if token available)
        if settings.hf_api_key and Pipeline:
            logger.info("Loading Pyannote Pipeline...")
            try:
                self.diarization_pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=settings.hf_api_key
                )
                self.diarization_pipeline.to(torch.device(self.device))
                logger.info("Pyannote Pipeline Loaded")
            except Exception as e:
                logger.error(f"Failed to load Pyannote Pipeline: {e}")
                self.diarization_pipeline = None
        else:
            logger.warning("No Hugging Face Token or pyannote not installed. Skipping Diarization.")
            self.diarization_pipeline = None

    def process_chunk(self, audio_bytes: bytes) -> dict | None:
        """
        Processes raw audio bytes:
        1. Convert/Normalize via FFmpeg (subprocess)
        2. Transcribe via Whisper
        3. Simple Diarization check (or integrate timestamps)
        Returns: { text, start, end, speaker, confidence } or None
        """
        try:
            process = subprocess.Popen(
                ["ffmpeg", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL
            )
            out, _ = process.communicate(input=audio_bytes)
            
            if process.returncode != 0 or not out:
                logger.error("FFmpeg conversion failed or empty output")
                return None

            samples = np.frombuffer(out, dtype=np.int16).astype(np.float32) / 32768.0
            
            result = self.whisper_model.transcribe(samples, fp16=False)
            text = result["text"].strip()
            
            if not text:
                return None

            speaker = "Speaker_Unknown"
            
            if self.diarization_pipeline:
                try:
                    waveform = torch.from_numpy(samples).unsqueeze(0) 
                    diarization = self.diarization_pipeline({"waveform": waveform, "sample_rate": 16000})
                    for turn, _, spk in diarization.itertracks(yield_label=True):
                         speaker = spk
                         break
                except Exception as d_err:
                    logger.warning(f"Diarization error: {d_err}")

            return {
                "text": text,
                "start_offset": result["segments"][0]["start"],
                "end_offset": result["segments"][-1]["end"],
                "speaker": speaker, 
                "confidence": 0.8
            }

        except Exception as e:
            logger.error(f"Speech Processing Error: {e}")
            return None

# Singleton-ish instance (loaded once)
processor = None

def get_speech_processor():
    global processor
    if processor is None:
        try:
            processor = SpeechProcessor()
        except RuntimeError as e:
            logger.error(f"Cannot initialize SpeechProcessor: {e}")
            return None
    return processor

