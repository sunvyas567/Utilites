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
    cta: str = Field(..., description="Desired call to action.")
    style_format: Optional[str] = Field(None, description="Optional style hint like story or list.")

class LLMInvocationRequest(BaseModel):
    provider: str = Field(..., description="Provider name such as gemini, openai, anthropic, ollama, browser, local.")
    model: Optional[str] = Field(None, description="Model name for the selected provider.")
    prompt: str = Field(..., description="Input prompt text.")
    api_key: Optional[str] = Field(None, description="User-supplied API key for cloud providers.")
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

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "linkedin-agent-backend"}

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

    format_instructions = (
        'Write in clear narrative paragraph form with strong hook sentences. Do not use bullet points.'
        if style_format == 'story'
        else 'Format post with: 1) Opening hook paragraph, 2) 3 key takeaway bullet points starting with "🔹 ", 3) Closing call-to-action line.'
    )

    return f"Write a high-converting LinkedIn {goal_prompt} post.\nTone: {tone_prompt}.\nCall to Action: {payload.cta}.\nContext / Key Points: {payload.prompt or 'General industry insight'}.\nFormatting Rule: {format_instructions}\nKeep total length under 1500 characters. Return plain text only."

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
            "maxOutputTokens": 800,
        },
    }

    last_error = None
    for model_name in model_candidates:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        try:
            response = requests.post(url, json=body, headers={"Content-Type": "application/json"}, timeout=60)
            if response.status_code == 200:
                payload_json = response.json()
                text = payload_json.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if text:
                    return True, text, model_name, None
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

    # 1. Resolve API Key: User key takes priority, then env vars
    api_key = payload.api_key
    if not api_key:
        if provider in ("gemini", "google"):
            api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        elif provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
        elif provider == "anthropic":
            api_key = os.getenv("ANTHROPIC_API_KEY")

    if not api_key:
        return build_generic_llm_response(False, provider, payload.model, error=f"No API key provided for {provider}. Please enter a valid key.")

    # 2. Gemini direct REST fallback (Fastest & direct path for Gemini)
    if provider in ("gemini", "google"):
        requested_model = payload.model or "gemini-2.5-flash"
        candidates = [requested_model] + [m for m in get_model_candidates() if m != requested_model]
        success, text, used_model, err = try_gemini_generation(api_key, payload.prompt, candidates)
        if success:
            return build_generic_llm_response(
                True, provider="gemini", model=used_model, text=text, meta={"source": "gemini-rest"}
            )

    # 3. Universal Multi-Provider execution via LiteLLM
    try:
        import litellm

        formatted_model = payload.model
        if formatted_model and not formatted_model.startswith(f"{provider}/"):
            formatted_model = f"{provider}/{payload.model}"
        elif not formatted_model:
            formatted_model = provider

        response = litellm.completion(
            model=formatted_model,
            messages=[{"role": "user", "content": payload.prompt}],
            api_key=api_key,
            **(payload.params or {}),
        )

        text = ""
        if getattr(response, "choices", None):
            text = response.choices[0].message.content or ""

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