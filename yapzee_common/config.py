import os
from dotenv import load_dotenv

# Ensure we load from the backend directory
load_dotenv()

class Settings:
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    XAI_API_KEY = os.getenv("XAI_API_KEY")
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
    AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY")
    AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION")

settings = Settings()

# Shared Model Options for all services
MODELS = [
    {"label": "Gemini 3 Flash", "provider": "gemini", "value": "gemini-3-flash-preview"},
    {"label": "Sonnet 4.6", "provider": "anthropic", "value": "claude-sonnet-4-6"},
    {"label": "GPT-5.4", "provider": "openai", "value": "gpt-5.4"},
    {"label": "Grok 4.1 Fast Reasoning", "provider": "xai", "value": "grok-4-1-fast-reasoning", "base_url": "https://api.x.ai/v1"},
    {"label": "Llama 4 Maverick (Deepinfra)", "provider": "openrouter", "value": "meta-llama/llama-4-maverick", "base_url": "https://openrouter.ai/api/v1"}
]

# JWT configuration for Auth module
JWT_SECRET = os.getenv("YAPZEE_JWT_SECRET")
JWT_TTL_DAYS = int(os.getenv("YAPZEE_JWT_TTL_DAYS", "30"))
JWT_ALGORITHM = "HS256"
