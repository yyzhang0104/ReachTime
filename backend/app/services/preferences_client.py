"""
OpenAI client service for extracting customer preferences from CRM notes.
Uses structured JSON output with Pydantic validation.
"""

import json
import logging
import time
from typing import Dict, Any

from openai import OpenAI, OpenAIError
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas import ExtractPreferencesResponse


# Configure module logger
logger = logging.getLogger(__name__)


# Maximum retry attempts for LLM extraction
MAX_RETRIES = 2


def _build_extraction_system_prompt() -> str:
    """Build the system prompt for preferences extraction."""
    return """You are a structured information extraction assistant specialized in extracting scheduling preferences from CRM notes.

Your task is to extract contact scheduling preferences and constraints from customer notes.

## Output Format

You MUST respond with ONLY a valid JSON object (no markdown, no explanation) with these exact fields:

{
  "preferred_time_windows": [{"start": "HH:MM", "end": "HH:MM"}],
  "avoid_time_windows": [{"start": "HH:MM", "end": "HH:MM"}],
  "preferred_weekdays": ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
  "avoid_weekdays": ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
  "preferred_dates": ["YYYY-MM-DD"],
  "avoid_dates": ["YYYY-MM-DD"],
  "preferred_date_ranges": [{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}],
  "avoid_date_ranges": [{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}],
  "confidence": 0.0,
  "notes_language": "en"
}

## Rules

1. **Time format**: Always use 24-hour format "HH:MM" (e.g., "09:00", "14:30", "22:00")
2. **Date format**: Always use "YYYY-MM-DD" format (e.g., "2026-03-01")
3. **Weekdays**: Use exactly these values: "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"
4. **Language**: Set notes_language to "zh" for Chinese, "en" for English, "mixed" for both, or "unknown"
5. **Confidence**: Set between 0.0 (no preferences found) and 1.0 (very clear preferences)
6. **Empty arrays**: If no preferences of a type are found, use empty arrays []
7. **No guessing**: Only extract explicitly stated preferences. Do not infer or assume.
8. **Avoid > Prefer**: If something is mentioned as both preferred and to avoid, prioritize the "avoid" constraint.

## Examples of what to extract

- "不希望周五被打扰" → avoid_weekdays: ["FRI"]
- "周一到周四上午 9-11 比较好" → preferred_weekdays: ["MON","TUE","WED","THU"], preferred_time_windows: [{"start":"09:00","end":"11:00"}]
- "2026年3月1号休假" → avoid_dates: ["2026-03-01"]
- "下午联系比较方便" → preferred_time_windows: [{"start":"13:00","end":"18:00"}]
- "3月1号到3号出差" → avoid_date_ranges: [{"start":"2026-03-01","end":"2026-03-03"}]
- "早上不方便" → avoid_time_windows: [{"start":"06:00","end":"12:00"}]"""


def _build_extraction_user_prompt(
    crm_notes: str,
    customer_country: str,
    customer_timezone: str,
    today_local_date: str,
) -> str:
    """Build the user prompt for preferences extraction."""
    context_parts = []
    if customer_country:
        context_parts.append(f"Customer country: {customer_country}")
    if customer_timezone:
        context_parts.append(f"Customer timezone: {customer_timezone}")
    if today_local_date:
        context_parts.append(f"Today's date (customer local): {today_local_date}")
    
    context_str = "\n".join(context_parts) if context_parts else "No additional context provided."
    
    return f"""Extract scheduling preferences from these CRM notes.

Context (for interpreting relative dates like "next week", "tomorrow"):
{context_str}

CRM Notes:
{crm_notes}

Remember: Output ONLY the JSON object. All dates/times are interpreted in the customer's local timezone."""


def _parse_and_validate_response(response_content: str) -> ExtractPreferencesResponse:
    """Parse and validate the LLM response into a Pydantic model."""
    # Clean up potential markdown code blocks
    content_cleaned = response_content.strip()
    if content_cleaned.startswith("```json"):
        content_cleaned = content_cleaned[7:]
    if content_cleaned.startswith("```"):
        content_cleaned = content_cleaned[3:]
    if content_cleaned.endswith("```"):
        content_cleaned = content_cleaned[:-3]
    content_cleaned = content_cleaned.strip()
    
    # Parse JSON
    try:
        data = json.loads(content_cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse response as JSON: {e}")
    
    # Validate with Pydantic
    try:
        return ExtractPreferencesResponse(**data)
    except ValidationError as e:
        raise ValueError(f"Response validation failed: {e}")


def extract_preferences(
    crm_notes: str,
    customer_country: str = "",
    customer_timezone: str = "",
    today_local_date: str = "",
) -> ExtractPreferencesResponse:
    """
    Extract customer scheduling preferences from CRM notes using LLM.
    
    Args:
        crm_notes: The CRM notes text to extract from
        customer_country: ISO country code for context
        customer_timezone: IANA timezone for context
        today_local_date: Today's date in customer's local time (YYYY-MM-DD)
    
    Returns:
        ExtractPreferencesResponse with extracted preferences
    
    Raises:
        ValueError: If extraction fails after retries
        OpenAIError: If OpenAI API call fails
    """
    settings = get_settings()
    
    if not settings.openai_api_key or settings.openai_api_key == "your-openai-api-key-here":
        raise ValueError(
            "OpenAI API key is not configured. "
            "Please set OPENAI_API_KEY environment variable."
        )
    
    # Log context (no sensitive CRM content)
    log_context = {
        "customer_country": customer_country or "not_provided",
        "customer_timezone": customer_timezone or "not_provided",
        "today_local_date": today_local_date or "not_provided",
        "notes_length": len(crm_notes) if crm_notes else 0,
        "model": settings.openai_model,
    }
    
    logger.info("Preference extraction started", extra=log_context)
    start_time = time.monotonic()
    
    # Build prompts
    system_prompt = _build_extraction_system_prompt()
    user_prompt = _build_extraction_user_prompt(
        crm_notes=crm_notes,
        customer_country=customer_country,
        customer_timezone=customer_timezone,
        today_local_date=today_local_date,
    )
    
    # Initialize OpenAI client
    client = OpenAI(api_key=settings.openai_api_key)
    
    last_error = None
    
    for attempt in range(MAX_RETRIES + 1):
        attempt_start = time.monotonic()
        
        try:
            # Call OpenAI API with lower temperature for more deterministic output
            response = client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,  # Low temperature for structured extraction
                max_tokens=1000,
            )
            
            attempt_elapsed_ms = (time.monotonic() - attempt_start) * 1000
            response_content = response.choices[0].message.content
            
            if not response_content:
                logger.warning(
                    "Preference extraction: empty response",
                    extra={**log_context, "attempt": attempt + 1, "elapsed_ms": round(attempt_elapsed_ms, 2)}
                )
                raise ValueError("OpenAI returned an empty response.")
            
            # Parse and validate
            result = _parse_and_validate_response(response_content)
            
            total_elapsed_ms = (time.monotonic() - start_time) * 1000
            logger.info(
                "Preference extraction completed",
                extra={
                    **log_context,
                    "attempt": attempt + 1,
                    "elapsed_ms": round(total_elapsed_ms, 2),
                    "confidence": result.confidence,
                    "preferred_time_windows_count": len(result.preferred_time_windows),
                    "avoid_time_windows_count": len(result.avoid_time_windows),
                    "preferred_weekdays_count": len(result.preferred_weekdays),
                    "avoid_weekdays_count": len(result.avoid_weekdays),
                    "avoid_dates_count": len(result.avoid_dates),
                }
            )
            return result
            
        except (ValueError, json.JSONDecodeError) as e:
            attempt_elapsed_ms = (time.monotonic() - attempt_start) * 1000
            last_error = e
            
            logger.warning(
                "Preference extraction: parse/validation error",
                extra={
                    **log_context,
                    "attempt": attempt + 1,
                    "elapsed_ms": round(attempt_elapsed_ms, 2),
                    "error_type": type(e).__name__,
                    "will_retry": attempt < MAX_RETRIES,
                }
            )
            
            if attempt < MAX_RETRIES:
                # Retry
                continue
            
        except OpenAIError as e:
            total_elapsed_ms = (time.monotonic() - start_time) * 1000
            logger.error(
                "Preference extraction failed: OpenAI API error",
                extra={
                    **log_context,
                    "attempt": attempt + 1,
                    "elapsed_ms": round(total_elapsed_ms, 2),
                    "error_type": type(e).__name__,
                },
                exc_info=True,
            )
            raise OpenAIError(f"OpenAI API call failed: {str(e)}")
    
    # All retries failed - return empty preferences with zero confidence
    total_elapsed_ms = (time.monotonic() - start_time) * 1000
    logger.warning(
        "Preference extraction: all retries exhausted, returning empty preferences",
        extra={
            **log_context,
            "total_attempts": MAX_RETRIES + 1,
            "elapsed_ms": round(total_elapsed_ms, 2),
            "last_error_type": type(last_error).__name__ if last_error else None,
        }
    )
    
    # This allows the scheduling to continue without LLM preferences
    return ExtractPreferencesResponse(
        preferred_time_windows=[],
        avoid_time_windows=[],
        preferred_weekdays=[],
        avoid_weekdays=[],
        preferred_dates=[],
        avoid_dates=[],
        preferred_date_ranges=[],
        avoid_date_ranges=[],
        confidence=0.0,
        notes_language="unknown",
    )
