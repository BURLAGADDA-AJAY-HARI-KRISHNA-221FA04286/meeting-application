import logging
import io
import os
import subprocess
import numpy as np
from app.core.config import settings

logger = logging.getLogger(__name__)

# Lazy imports for heavy ML dependencies
torch = None
Pipeline = None
WhisperModel = None

def _load_ml_deps():
    global torch, Pipeline, WhisperModel
    if WhisperModel is None:
        try:
            from faster_whisper import WhisperModel as _WhisperModel
            WhisperModel = _WhisperModel
        except ImportError as e:
            logger.warning(f"ML dependencies not available (faster_whisper): {e}")
            return False
            
    if torch is None:
        try:
            import torch as _torch
            torch = _torch
        except ImportError:
            pass
            
    if Pipeline is None:
        try:
            from pyannote.audio import Pipeline as _Pipeline
            Pipeline = _Pipeline
        except ImportError:
            logger.warning("pyannote.audio not available, diarization disabled")
            
    return WhisperModel is not None

class SpeechProcessor:
    def __init__(self):
        if not _load_ml_deps():
            raise RuntimeError("Required ML dependencies (faster_whisper) are not installed")

        # Initialize Faster-Whisper
        logger.info("Loading Faster-Whisper Model...")
        self.device = "cuda" if torch and torch.cuda.is_available() else "cpu"
        self.compute_type = "float16" if self.device == "cuda" else "int8"
        
        self.whisper_model = WhisperModel("base", device=self.device, compute_type=self.compute_type)
        logger.info(f"Faster-Whisper Model Loaded on {self.device}")

        # Initialize Pyannote Diarization (if token available)
        if settings.hf_api_key and Pipeline and torch:
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
            logger.warning("No Hugging Face Token, pyannote, or torch not installed. Skipping Diarization.")
            self.diarization_pipeline = None

    def process_chunk(self, audio_bytes: bytes) -> dict | None:
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
            
            # 13. Silence Detection logic - calculate RMS
            rms = np.sqrt(np.mean(samples**2))
            if rms < 0.005:  # Silence threshold
                logger.debug("Silence detected, skipping processing.")
                return None
            
            segments, info = self.whisper_model.transcribe(samples, beam_size=5)
            
            text = ""
            start_offset = None
            end_offset = 0.0
            for seg in segments:
                text += seg.text + " "
                if start_offset is None:
                    start_offset = seg.start
                end_offset = seg.end
                
            text = text.strip()
            if not text:
                return None

            speaker = "Speaker_Unknown"
            
            if self.diarization_pipeline and torch:
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
                "start_offset": start_offset or 0.0,
                "end_offset": end_offset,
                "speaker": speaker, 
                "confidence": 0.8 # Faster-whisper gives per-word probabilities, keeping simple here
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

