"""
Meeting Analysis Agents — Specialized AI agents for different analysis tasks.
Each agent uses carefully crafted prompts for optimal output quality.
"""
from app.ai.gemini_client import GeminiClient


class MeetingAgents:
    """Collection of specialized AI agents for meeting analysis."""

    def __init__(self):
        self.client = GeminiClient()

    def summarize(self, transcript: str) -> dict:
        """Extract executive summary, decisions, and key points."""
        return self.client.run_json_prompt(
            instruction=(
                "Analyze this meeting transcript and produce a comprehensive summary. "
                "Return JSON with these keys:\n"
                "- 'executive_summary': A 2-3 sentence overview\n"
                "- 'decisions': Array of decisions made (strings)\n"
                "- 'key_points': Array of important discussion points (strings)\n"
                "- 'topics': Array of main topics discussed (strings)\n"
                "Be specific and use names/details from the transcript."
            ),
            transcript=transcript,
            fallback={"executive_summary": "", "decisions": [], "key_points": [], "topics": []},
        )

    def extract_actions(self, transcript: str) -> dict:
        """Extract action items with owners, deadlines, and priorities."""
        return self.client.run_json_prompt(
            instruction=(
                "Extract ALL action items from this meeting. "
                "Look for explicit commitments AND implied tasks. "
                "Return JSON with key 'tasks' containing an array where each item has:\n"
                "- 'description': Clear task description\n"
                "- 'owner': Person responsible (from transcript, or 'Unassigned')\n"
                "- 'deadline': Mentioned deadline (or null)\n"
                "- 'priority': 'high', 'medium', or 'low'\n"
                "- 'context': Brief context of why this task was created"
            ),
            transcript=transcript,
            fallback={"tasks": []},
        )

    def detect_risks(self, transcript: str) -> dict:
        """Identify risks, blockers, and concerns."""
        return self.client.run_json_prompt(
            instruction=(
                "Identify ALL risks, blockers, and concerns mentioned or implied. "
                "Return JSON with key 'risks' containing an array where each item has:\n"
                "- 'description': Clear risk description\n"
                "- 'severity': 'high', 'medium', or 'low'\n"
                "- 'type': Category (technical, resource, timeline, budget, etc.)\n"
                "- 'mitigation': Any discussed mitigation (or null)\n"
                "Include implicit risks like tight timelines or unclear requirements."
            ),
            transcript=transcript,
            fallback={"risks": []},
        )

    def sentiment(self, transcript: str) -> dict:
        """Analyze per-speaker sentiment and overall tone."""
        return self.client.run_json_prompt(
            instruction=(
                "Analyze the sentiment and emotional tone of each speaker. "
                "Return JSON with:\n"
                "- 'overall_tone': Meeting mood (positive, neutral, negative, mixed)\n"
                "- 'speakers': Array where each item has:\n"
                "  - 'name': Speaker name\n"
                "  - 'sentiment': Their attitude (positive, neutral, negative, etc.)\n"
                "  - 'confidence': Float 0.0-1.0\n"
                "  - 'notable_quote': A brief representative quote"
            ),
            transcript=transcript,
            fallback={"overall_tone": "neutral", "speakers": []},
        )


class Orchestrator:
    """Run all agents in sequence and combine results."""

    def __init__(self):
        self.agents = MeetingAgents()

    def analyze(self, transcript: str) -> dict:
        summary = self.agents.summarize(transcript)
        actions = self.agents.extract_actions(transcript)
        risks = self.agents.detect_risks(transcript)
        sentiment = self.agents.sentiment(transcript)
        return {
            "summary": summary,
            "actions": actions,
            "risks": risks,
            "sentiment": sentiment,
        }
