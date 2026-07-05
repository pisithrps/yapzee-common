import os
from openai import OpenAI
from anthropic import Anthropic
from google import genai
from google.genai import types as genai_types
from typing import Generator
from yapzee_common.config import settings

def stream_llm(prompt: str, model_info: dict) -> Generator[str, None, None]:
    provider = model_info["provider"]
    model_name = model_info["value"]
    
    if provider in ["openai", "xai"]:
        api_key = settings.XAI_API_KEY if provider == "xai" else settings.OPENAI_API_KEY
        client = OpenAI(api_key=api_key, base_url=model_info.get("base_url"))
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
            stream=True
        )
        for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    elif provider == "anthropic":
        client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        with client.messages.stream(
            model=model_name,
            max_tokens=8192,
            temperature=0.6,
            messages=[{"role": "user", "content": prompt}]
        ) as stream:
            for text in stream.text_stream:
                if text:
                    yield text

    elif provider == "gemini":
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        response = client.models.generate_content_stream(
            model=model_name,
            contents=[genai_types.Content(role="user", parts=[genai_types.Part(text=prompt)])],
            config=genai_types.GenerateContentConfig(temperature=0.6)
        )
        for chunk in response:
            if hasattr(chunk, "text") and chunk.text:
                yield chunk.text
    elif provider == "openrouter":
        client = OpenAI(api_key=settings.OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
            stream=True,
            extra_body={"provider": {"order": ["DeepInfra"]}}
        )
        for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    else:
        raise ValueError(f"Unknown provider: {provider}")
