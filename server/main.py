import os
import requests
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional
from dotenv import load_dotenv

# Load local environment configuration for backend development fallback metrics
load_dotenv()

app = FastAPI(
    title="LinkedIn Integration Agent API",
    description="Multi-tenant backend engine routing automated social platform shares safely.",
    version="1.0.0"
)

# Enable CORS for local cross-origin development testing with your UX engine
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this to your specific domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic data contract classes to enforce typing structures on inputs
class CampaignExecutionRequest(BaseModel):
    message: str = Field(..., description="Plain-text formatted commentary data string.")
    link: Optional[str] = Field(None, description="Optional destination URL tracking metadata link attachment.")
    tenant_id: str = Field(..., description="Unique workspace mapping identifier.")
    custom_token: Optional[str] = Field(None, description="User-specific LinkedIn OAuth access token.")
    custom_urn: Optional[str] = Field(None, description="User-specific LinkedIn profile Person URN.")
    is_test_mode: bool = Field(False, description="Flag indicating if execution is a sandbox dry-run.")
    media_data: Optional[str] = Field(None, description="Base64 encoded media string.")
    media_type: Optional[str] = Field(None, description="Media type: 'image' or 'video'.")
    media_filename: Optional[str] = Field(None, description="Original filename.")

class DraftGenerationRequest(BaseModel):
    prompt: str = Field(..., description="User prompt or topic for content generation.")
    goal: str = Field(..., description="Campaign goal such as Product Launch or Thought Leadership.")
    tone: str = Field(..., description="Desired tone such as Conversational or Technical.")
    cta: Optional[str] = Field(None, description="Optional call to action. The UI may omit this for simpler generation.")
    style_format: Optional[str] = Field(None, description="Optional style hint like story or list.")

class LLMInvocationRequest(BaseModel):
    provider: str = Field(..., description="Provider name such as gemini, openai, anthropic, groq, mistral, deepseek, xai.")
    model: Optional[str] = Field(None, description="Model name for the selected provider.")
    prompt: str = Field(..., description="Input prompt text.")
    api_key: Optional[str] = Field(None, description="User-supplied API key. Never required in demo mode.")
    demo_mode: bool = Field(False, description="Use the server-side provider key configured in environment variables.")
    params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional generation parameters.")
    prefer_browser: bool = Field(False, description="Whether to prefer browser AI if available.")
    prefer_local: bool = Field(False, description="Whether to prefer local installed models.")
    prefer_cloud: bool = Field(True, description="Whether to allow cloud fallback.")

class LLMInvocationResponse(BaseModel):
    success: bool
    provider: str
    model: Optional[str]
    text: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None
    rate_limit: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

def ensure_complete_sentences(text: str) -> str:
    """Trims incomplete trailing sentence fragments to guarantee clean completions."""
    trimmed = text.strip()
    if not trimmed:
        return trimmed

    # If already ending with proper sentence-ending punctuation, return as-is
    if trimmed[-1] in ".!?\"'":
        return trimmed

    # Locate the last valid sentence-ending punctuation mark
    last_punc = max(trimmed.rfind('.'), trimmed.rfind('!'), trimmed.rfind('?'))
    if last_punc != -1:
        return trimmed[:last_punc + 1]

    return trimmed

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "linkedin-agent-backend"}

@app.get("/api/v1/llm/config")
async def llm_config():
    """Public capability check. Never exposes API keys."""
    server_providers = []
    for provider, env_names in {
        "gemini": ("GOOGLE_API_KEY", "GEMINI_API_KEY"),
        "openai": ("OPENAI_API_KEY",),
        "anthropic": ("ANTHROPIC_API_KEY",),
        "groq": ("GROQ_API_KEY",),
        "mistral": ("MISTRAL_API_KEY",),
        "deepseek": ("DEEPSEEK_API_KEY",),
        "xai": ("XAI_API_KEY",),
    }.items():
        if any(os.getenv(name) for name in env_names):
            server_providers.append(provider)
    return {
        "demo_available": bool(server_providers),
        "demo_providers": server_providers,
        "message": "Demo Mode uses server-side provider quota." if server_providers else "Demo Mode is not configured on this server.",
    }

def build_template_fallback(payload: DraftGenerationRequest) -> str:
    topic = payload.prompt.strip() or "your latest update"
    return (
        f"Exciting news for {payload.goal.lower()}: {topic}. "
        f"We are building momentum with a {payload.tone.lower()} approach that keeps the message clear and useful. "
        f"{payload.cta.lower()} to learn more and join the conversation."
    )

def build_generation_prompt(payload: DraftGenerationRequest) -> str:
    goal_prompt = payload.goal if payload.goal != "General / Custom" else "update"
    tone_prompt = payload.tone if payload.tone != "General / Custom" else "authentic"
    style_format = payload.style_format or "story"

    if style_format == "story":
        format_instructions = (
            "Write as a polished narrative LinkedIn post. "
            "Start with a strong, curiosity-driven hook, develop one clear idea, "
            "use short readable paragraphs, and finish with a natural closing sentence. "
            "Do not use headings or bullet points."
        )
    else:
        format_instructions = (
            "Write a polished LinkedIn post with a strong opening hook, "
            "followed by exactly 3 concise takeaway bullets. "
            'Each takeaway must start with "🔹 ". '
            "Finish with a concise, natural closing line."
        )

    cta_instruction = (
        f"Optional call to action: {payload.cta}. "
        "Use it naturally only if it improves the post."
        if payload.cta
        else "Do not force a call to action; end naturally with a complete closing sentence."
    )

    return f"""
You are an expert LinkedIn thought-leadership and enterprise content writer.

Create a high-quality LinkedIn post based on the user's context.

Goal/context category: {goal_prompt}
Tone: {tone_prompt}
User context / key points:
{payload.prompt or "General industry insight"}

{cta_instruction}

Formatting:
{format_instructions}

CRITICAL RULES FOR COMPLETION & LENGTH:
- IMPORTANT: You MUST complete your thought. ALWAYS conclude with proper sentence punctuation ('.', '!', or '?'). NEVER stop mid-sentence.
- Keep total character length strictly between 1,200 and 2,000 characters (max 2,500 characters) to fit comfortably within LinkedIn's 3,000 character limit.
- Make the content specific and useful rather than generic.
- Preserve important facts and ideas from the user's context.
- Add thoughtful interpretation where appropriate, but do not invent claims, statistics, customers, or results.
- Use a confident human voice suitable for an experienced technology/business leader.
- Avoid filler such as "In today's rapidly changing world".
- Avoid excessive emojis and marketing clichés.
- Return plain text only.
""".strip()

def get_model_candidates() -> list[str]:
    preferred = os.getenv("GEMINI_MODEL", "").strip()
    fallback_models = [
        "gemini-2.5-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-2.0-flash",
    ]

    candidates = []
    if preferred:
        candidates.append(preferred)

    for model in fallback_models:
        if model not in candidates:
            candidates.append(model)

    return candidates

def try_gemini_generation(api_key: str, prompt: str, model_candidates: list[str]) -> tuple[bool, str, Optional[str], Optional[str]]:
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "topP": 0.95,
            "maxOutputTokens": 1200,  # Generous headroom for natural finish (~4,800 chars capacity)
        },
    }

    last_error = None
    for model_name in model_candidates:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        try:
            response = requests.post(url, json=body, headers={"Content-Type": "application/json"}, timeout=60)
            if response.status_code == 200:
                payload_json = response.json()
                parts = payload_json.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                text = "".join(part.get("text", "") for part in parts if isinstance(part, dict) and "text" in part)
                if text:
                    cleaned_text = ensure_complete_sentences(text)
                    return True, cleaned_text, model_name, None
                last_error = "Gemini returned an empty response."
                continue
            payload_json = response.json() if response.content else {}
            error_detail = payload_json.get("error", {}).get("message", response.text)
            last_error = f"{model_name}: {error_detail}"
            if response.status_code in (400, 404):
                continue
            if response.status_code in (401, 403, 429, 503):
                break
        except (requests.RequestException, ValueError) as exc:
            last_error = f"{model_name}: {str(exc)}"
            continue

    return False, "", None, last_error

def build_generic_llm_response(success: bool, provider: str, model: Optional[str], text: Optional[str] = None, usage: Optional[Dict[str, Any]] = None, rate_limit: Optional[Dict[str, Any]] = None, meta: Optional[Dict[str, Any]] = None, error: Optional[str] = None) -> LLMInvocationResponse:
    return LLMInvocationResponse(
        success=success,
        provider=provider,
        model=model,
        text=text,
        usage=usage,
        rate_limit=rate_limit,
        meta=meta,
        error=error,
    )

async def invoke_litellm_cloud(payload: LLMInvocationRequest) -> LLMInvocationResponse:
    provider = payload.provider.lower()

    if not provider or provider == "browser":
        return build_generic_llm_response(False, "cloud", payload.model, error="Browser execution must be handled on client-side.")

    api_key = _resolve_cloud_api_key(provider, payload.api_key, payload.demo_mode)
    if not api_key:
        return build_generic_llm_response(False, provider, payload.model, error=f"No API key provided for {provider}. Please enter a valid key.")

    # Direct REST fallback for Gemini
    if provider in ("gemini", "google"):
        requested_model = payload.model or "gemini-2.5-flash"
        candidates = [requested_model] + [m for m in get_model_candidates() if m != requested_model]
        success, text, used_model, err = try_gemini_generation(api_key, payload.prompt, candidates)
        if success:
            return build_generic_llm_response(
                True,
                provider="gemini",
                model=used_model,
                text=text,
                meta={
                    "source": "gemini-rest",
                    "character_count": len(text),
                },
            )

    # Universal Multi-Provider execution via LiteLLM
    try:
        import litellm

        formatted_model = payload.model
        if formatted_model and not formatted_model.startswith(f"{provider}/"):
            formatted_model = f"{provider}/{payload.model}"
        elif not formatted_model:
            formatted_model = provider

        call_params = dict(payload.params or {})
        call_params.setdefault("max_tokens", 1000)
        call_params.setdefault("temperature", 0.7)

        response = litellm.completion(
            model=formatted_model,
            messages=[{"role": "user", "content": payload.prompt}],
            api_key=api_key,
            **call_params,
        )

        text = ""
        if getattr(response, "choices", None):
            text = response.choices[0].message.content or ""

        text = ensure_complete_sentences(text)

        usage = getattr(response, "usage", None)
        usage_payload = None
        if usage is not None:
            usage_payload = {
                "prompt_tokens": getattr(usage, "prompt_tokens", None),
                "completion_tokens": getattr(usage, "completion_tokens", None),
                "total_tokens": getattr(usage, "total_tokens", None),
            }

        return build_generic_llm_response(
            True,
            provider=provider,
            model=payload.model,
            text=text,
            usage=usage_payload,
            meta={"source": "litellm", "provider": provider},
        )
    except Exception as exc:
        return build_generic_llm_response(False, provider, payload.model, error=str(exc))

def _resolve_server_api_key(provider: str) -> Optional[str]:
    provider = (provider or "").lower()
    env_keys = {
        "gemini": ("GOOGLE_API_KEY", "GEMINI_API_KEY"),
        "google": ("GOOGLE_API_KEY", "GEMINI_API_KEY"),
        "openai": ("OPENAI_API_KEY",),
        "anthropic": ("ANTHROPIC_API_KEY",),
        "groq": ("GROQ_API_KEY",),
        "mistral": ("MISTRAL_API_KEY",),
        "deepseek": ("DEEPSEEK_API_KEY",),
        "xai": ("XAI_API_KEY",),
    }

    for env_name in env_keys.get(provider, ()):
        value = os.getenv(env_name)
        if value:
            return value
    return None

def _resolve_cloud_api_key(provider: str, supplied_key: Optional[str], demo_mode: bool = False) -> Optional[str]:
    if demo_mode:
        return _resolve_server_api_key(provider)
    return supplied_key.strip() if supplied_key else None

def _litellm_model_name(provider: str, model: Optional[str]) -> str:
    provider = provider.strip().lower()
    if model:
        model = model.strip()
        if "/" in model:
            return model
        return f"{provider}/{model}"
    return provider

@app.post("/api/v1/llm/stream")
async def stream_llm(payload: LLMInvocationRequest):
    """Server-Sent Event stream for Cloud AI."""
    from fastapi.responses import StreamingResponse
    import json

    provider = (payload.provider or "").strip().lower()

    async def event_stream():
        if payload.prefer_browser:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Browser AI is handled client-side.'})}\n\n"
            return

        if payload.prefer_local:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Local model execution is not implemented.'})}\n\n"
            return

        if not payload.prefer_cloud:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Cloud execution is disabled.'})}\n\n"
            return

        if not provider or provider in ("browser", "local"):
            yield f"data: {json.dumps({'type': 'error', 'error': 'A valid cloud provider is required.'})}\n\n"
            return

        api_key = _resolve_cloud_api_key(provider, payload.api_key, payload.demo_mode)
        if not api_key:
            yield f"data: {json.dumps({'type': 'error', 'error': f'No API key provided for {provider}.'})}\n\n"
            return

        model_name = _litellm_model_name(provider, payload.model)
        started = __import__("time").perf_counter()

        yield f"data: {json.dumps({'type': 'start', 'provider': provider, 'model': payload.model, 'formatted_model': model_name})}\n\n"

        try:
            import litellm

            params = dict(payload.params or {})
            params.setdefault("max_tokens", 1000)
            params.setdefault("temperature", 0.7)
            params.setdefault("stream_options", {"include_usage": True})

            response = litellm.completion(
                model=model_name,
                messages=[{"role": "user", "content": payload.prompt}],
                api_key=api_key,
                stream=True,
                **params,
            )

            accumulated = ""
            usage_payload = None
            finish_reason = None

            for chunk in response:
                choices = getattr(chunk, "choices", None) or []

                if choices:
                    choice = choices[0]
                    delta = getattr(choice, "delta", None) or (choice.get("delta") if isinstance(choice, dict) else None)
                    token = None

                    if delta:
                        if isinstance(delta, dict):
                            token = delta.get("content") or delta.get("text")
                        else:
                            token = getattr(delta, "content", None) or getattr(delta, "text", None)
                    elif hasattr(choice, "text"):
                        token = choice.text

                    if token:
                        accumulated += token
                        yield f"data: {json.dumps({'type': 'token', 'text': token})}\n\n"

                    finish_reason = getattr(choice, "finish_reason", None) or (choice.get("finish_reason") if isinstance(choice, dict) else finish_reason)

                usage = getattr(chunk, "usage", None)
                if usage is not None:
                    usage_payload = {
                        "prompt_tokens": getattr(usage, "prompt_tokens", None),
                        "completion_tokens": getattr(usage, "completion_tokens", None),
                        "total_tokens": getattr(usage, "total_tokens", None),
                    }

            elapsed_ms = round((__import__("time").perf_counter() - started) * 1000)

            # Ensure final streamed text has complete sentences
            cleaned_text = ensure_complete_sentences(accumulated)

            meta = {
                "source": "litellm-stream",
                "provider": provider,
                "formatted_model": model_name,
                "finish_reason": finish_reason,
                "time_ms": elapsed_ms,
                "character_count": len(cleaned_text),
            }

            yield f"data: {json.dumps({'type': 'complete', 'text': cleaned_text, 'usage': usage_payload, 'meta': meta, 'provider': provider, 'model': payload.model})}\n\n"

        except Exception as exc:
            print(f"[LLM STREAM ERROR] provider={provider} model={model_name}: {exc}", flush=True)
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc), 'provider': provider, 'model': payload.model})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@app.post("/api/v1/llm/invoke", response_model=LLMInvocationResponse)
async def invoke_llm(payload: LLMInvocationRequest):
    if payload.prefer_browser:
        return build_generic_llm_response(False, "browser", payload.model, error="Browser AI is handled client-side.")

    if payload.prefer_local:
        return build_generic_llm_response(False, "local", payload.model, error="Local model execution is not implemented.")

    if not payload.prefer_cloud:
        return build_generic_llm_response(False, payload.provider, payload.model, error="Cloud execution is disabled.")

    return await invoke_litellm_cloud(payload)

@app.post("/api/v1/drafts/generate")
async def generate_draft(payload: DraftGenerationRequest):
    api_key = os.getenv("GOOGLE_API_KEY")
    fallback_text = build_template_fallback(payload)

    if not api_key:
        return {
            "status": "fallback",
            "provider": "template",
            "text": fallback_text,
            "warning": "GOOGLE_API_KEY is not configured on the server."
        }

    prompt = build_generation_prompt(payload)
    success, text, model_name, error_detail = try_gemini_generation(api_key, prompt, get_model_candidates())
    if success and text:
        return {
            "status": "success",
            "provider": model_name or "gemini",
            "text": text,
        }

    return {
        "status": "fallback",
        "provider": "template",
        "text": fallback_text,
        "warning": error_detail or "Gemini generation failed.",
    }

@app.post("/api/v1/campaigns/execute", status_code=status.HTTP_200_OK)
async def run_linkedin_campaign(payload: CampaignExecutionRequest):
    active_token = payload.custom_token or os.getenv("LINKEDIN_ACCESS_TOKEN")
    active_urn = payload.custom_urn or os.getenv("LINKEDIN_PERSON_URN")
        
    if not active_token or not active_urn:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LinkedIn authentication credentials missing. Please configure integration tokens."
        )

    from app.agent.linkedin_agent import LinkedInAgent
    agent = LinkedInAgent()

    result = await agent.send(
        message=payload.message,
        link=payload.link,
        token=active_token,
        urn=active_urn,
        is_test_mode=payload.is_test_mode
    )

    if result["status"] == "failed":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LinkedIn API Integration Error: {result['error']}"
        )

    return {
        "status": "success",
        "channel": "linkedin",
        "tenant_id": payload.tenant_id,
        "meta": "Message posted successfully."
    }