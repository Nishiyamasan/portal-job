from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(tags=["ai"])

class GenerateDescriptionRequest(BaseModel):
    shop_name: str
    tags: List[str]
    concept: Optional[str] = None

class GenerateDescriptionResponse(BaseModel):
    description: str

async def translate_text(text: str, target_lang: str) -> str:
    """AI translation is intentionally disabled for the initial release."""
    return text

@router.post("/generate-description", response_model=GenerateDescriptionResponse)
async def generate_description(request: GenerateDescriptionRequest):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="AI description generation is not implemented for the initial release"
    )
