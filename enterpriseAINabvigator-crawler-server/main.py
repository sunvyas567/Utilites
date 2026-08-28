import os
from dotenv import load_dotenv
load_dotenv()
from typing import List
import httpx
import trafilatura
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, HttpUrl
from google import genai
from google.genai import types

app = FastAPI(
    title="Presales Architecture Auto-Mapper (Gemini)",
    description="Extracts vendor products using Google Gemini API and maps them to enterprise AI architecture layers.",
    version="1.0.0",
)

# Enable CORS for React frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------
# PYDANTIC SCHEMAS FOR STRUCTURED OUTPUTS
# ------------------------------------------------------------------

class ExtractedComponent(BaseModel):
    layer_name: str = Field(
        description="Exact match or closest fit from the target_layers list."
    )
    generic_role: str = Field(
        description="Functional architectural role (e.g., 'Vector Indexing', 'Relational DB', 'LLM Routing')."
    )
    vendor_product_name: str = Field(
        description="The specific commercial product, module, or feature name offered by the vendor."
    )
    description: str = Field(
        description="1-2 sentences summarizing value proposition and technical purpose."
    )
    key_capabilities: List[str] = Field(
        description="3-4 concise technical features or integrations."
    )


class VendorExtractRequest(BaseModel):
    url: HttpUrl
    target_layers: List[str] = Field(
        default=[
            "Data Ingestion & Connectors",
            "Storage & Vector Memory",
            "LLM & Agent Orchestration",
            "Guardrails & Security",
        ],
        description="List of current architecture layers to map products against.",
    )


class VendorExtractResponse(BaseModel):
    vendor_name: str = Field(description="Official company or platform name.")
    summary: str = Field(description="High-level overview of the vendor's technology stack.")
    components: List[ExtractedComponent]


# ------------------------------------------------------------------
# API ENDPOINT
# ------------------------------------------------------------------

@app.post(
    "/api/extract-vendor-components",
    response_model=VendorExtractResponse,
    status_code=status.HTTP_200_OK,
)
async def extract_vendor_components(req: VendorExtractRequest):
    #print("TEST REACHED", flush=True)
    url_str = str(req.url)
    #print("URL str : ", url_str, flush=True)
    # Step 1: Fetch web content asynchronously
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            )
        }
        try:
            response = await client.get(url_str, headers=headers)
            #print(f"response :, {response}")
            response.raise_for_status()
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to retrieve URL content: {str(err)}",
            )

    # Step 2: Strip HTML noise using trafilatura
    clean_text = trafilatura.extract(
        response.text, 
        include_links=False, 
        include_formatting=False
    )

    if not clean_text or len(clean_text.strip()) < 100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract readable text from the provided URL.",
        )

    truncated_text = clean_text[:7000]

    # Step 3: Initialize Google GenAI client using GOOGLE_API_KEY
    api_key = os.getenv("GOOGLE_API_KEY")
    #print(f"API Key :, {api_key}", flush=True)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GOOGLE_API_KEY environment variable is not set.",
        )

    client = genai.Client(api_key=api_key)

    system_instructions = (
        "You are a Principal Enterprise Solution Architect. "
        "Analyze product capability text from vendor websites and map their offerings "
        "into structured enterprise architecture components based on provided target layers."
    )

    user_prompt = f"""
Target URL: {url_str}

Target Architecture Layers Available for Mapping:
{", ".join(req.target_layers)}

Web Content:
---
{truncated_text}
---

Task:
Extract vendor product modules, identify their generic functional roles, map them to the most appropriate layer from the Target Architecture Layers list, and highlight 3-4 key technical features for each.
"""

    try:
        # Request structured JSON output using Gemini model
        gemini_response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instructions,
                response_mime_type="application/json",
                response_schema=VendorExtractResponse,
                temperature=0.2,
            ),
        )

        # Parse and return validated Pydantic model
        return VendorExtractResponse.model_validate_json(gemini_response.text)

    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gemini extraction pipeline failed: {str(err)}",
        )
