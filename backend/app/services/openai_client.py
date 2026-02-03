"""
OpenAI client service for generating communication drafts.
"""

import json
import logging
import time
from typing import Tuple

from openai import OpenAI, OpenAIError

from app.core.config import get_settings


# Configure module logger
logger = logging.getLogger(__name__)


# Instant messaging channels that require short messages
IM_CHANNELS = {"whatsapp", "wechat", "sms", "telegram", "line", "messenger"}


def _build_system_prompt(
    communication_channel: str,
    crm_notes: str,
    target_language: str,
    customer_name: str,
    sender_name: str,
) -> str:
    """Build the system prompt based on user inputs."""

    # Determine channel type
    channel_lower = communication_channel.lower().strip()
    is_im_channel = channel_lower in IM_CHANNELS

    # Build channel-specific instructions
    if is_im_channel:
        channel_instructions = f"""
- Communication Channel: {communication_channel} (Instant Messaging)
- Generate a SHORT, DIRECT instant message suitable for {communication_channel}.
- Keep the message within 3 short sentences maximum.
- Do NOT use formal email structure (no "Dear...", no formal sign-off).
- Be concise and conversational while maintaining professionalism."""
    else:
        channel_instructions = f"""
- Communication Channel: {communication_channel if communication_channel else 'Email'}
- Generate a standard professional business email format.
- Include: formal greeting, well-structured body paragraphs, and formal closing/sign-off."""

    # Build CRM notes instructions
    if crm_notes.strip():
        crm_instructions = f"""
- Customer CRM Notes (MUST incorporate relevant details naturally):
  {crm_notes}
- Weave the CRM information into the communication to make it highly personalized and contextual."""
    else:
        crm_instructions = "- No CRM notes provided. Keep the message general but professional."

    # Build language instructions
    if target_language.strip():
        language_instructions = f"- Target Language & Style: {target_language}. Adjust spelling, etiquette, and tone accordingly."
    else:
        language_instructions = "- Target Language & Style: Professional Business English."

    # Build name placeholder instructions
    name_instructions = []
    if not customer_name.strip():
        name_instructions.append("- Customer name is NOT provided. Use the placeholder **[Customer Name]** prominently in the text.")
    else:
        name_instructions.append(f"- Customer Name: {customer_name}")

    if not sender_name.strip():
        name_instructions.append("- Sender name is NOT provided. Use the placeholder **[Your Name]** prominently in the sign-off.")
    else:
        name_instructions.append(f"- Sender Name: {sender_name}")

    names_section = "\n".join(name_instructions)

    system_prompt = f"""You are a highly experienced global trade communication assistant with over 20 years of expertise in international business correspondence.

Your task is to generate professional, authentic, and personalized business communication content.

## Guidelines

{channel_instructions}

{crm_instructions}

{language_instructions}

{names_section}

## Critical Rules

1. **User Intent is Central**: The communication MUST directly address and achieve the user's stated intent.
2. **No Fabrication**: NEVER invent prices, discounts, contract terms, company names, or any specific details not provided by the user.
3. **Tone**: Professional, respectful, and appropriate. Avoid hollow sales pitches or generic filler content.
4. **Placeholders**: If customer name or sender name is missing, use **[Customer Name]** or **[Your Name]** as visible placeholders. Make these placeholders STAND OUT so they are easy to spot and replace.

## Output Format

You MUST respond with ONLY a valid JSON object in this exact format (no markdown, no explanation):
{{"subject": "Your suggested subject/topic line here", "content": "The full message body here"}}

For instant messaging channels, the "subject" should be a brief topic summary (can be shorter/informal).
For email, the "subject" should be a proper email subject line."""

    return system_prompt


def _build_user_prompt(user_intent: str) -> str:
    """Build the user prompt with the communication intent."""
    return f"""Please generate a communication draft for the following intent:

{user_intent}

Remember to output ONLY the JSON object with "subject" and "content" fields."""


def generate_draft(
    user_intent: str,
    communication_channel: str,
    crm_notes: str,
    target_language: str,
    customer_name: str,
    sender_name: str,
) -> Tuple[str, str]:
    """
    Generate a communication draft using OpenAI API.

    Args:
        user_intent: The core communication purpose
        communication_channel: Channel type (Email, WhatsApp, etc.)
        crm_notes: Customer CRM notes for personalization
        target_language: Target language style
        customer_name: Customer's name (or empty for placeholder)
        sender_name: Sender's name (or empty for placeholder)

    Returns:
        Tuple of (subject, content)

    Raises:
        ValueError: If API key is not configured or response parsing fails
        OpenAIError: If OpenAI API call fails
    """
    settings = get_settings()

    if not settings.openai_api_key or settings.openai_api_key == "your-openai-api-key-here":
        raise ValueError(
            "OpenAI API key is not configured. "
            "Please set OPENAI_API_KEY environment variable."
        )

    # Normalize communication_channel: empty/whitespace defaults to "Email"
    normalized_channel = communication_channel.strip() if communication_channel else "Email"
    if not normalized_channel:
        normalized_channel = "Email"
    
    channel_lower = normalized_channel.lower()
    is_im = channel_lower in IM_CHANNELS
    
    # Log request metadata (no sensitive content)
    log_context = {
        "channel": normalized_channel,
        "is_im": is_im,
        "has_crm_notes": bool(crm_notes and crm_notes.strip()),
        "target_language_provided": bool(target_language and target_language.strip()),
        "customer_name_provided": bool(customer_name and customer_name.strip()),
        "sender_name_provided": bool(sender_name and sender_name.strip()),
        "model": settings.openai_model,
    }
    
    logger.info("Draft generation started", extra=log_context)
    start_time = time.monotonic()

    # Build prompts
    system_prompt = _build_system_prompt(
        communication_channel=normalized_channel,
        crm_notes=crm_notes,
        target_language=target_language,
        customer_name=customer_name,
        sender_name=sender_name,
    )
    user_prompt = _build_user_prompt(user_intent)

    # Initialize OpenAI client
    client = OpenAI(api_key=settings.openai_api_key)

    try:
        # Call OpenAI API
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.5,
            max_tokens=2000,
        )
        
        elapsed_ms = (time.monotonic() - start_time) * 1000

        # Extract response content
        response_content = response.choices[0].message.content

        if not response_content:
            logger.error(
                "Draft generation failed: empty response",
                extra={**log_context, "elapsed_ms": round(elapsed_ms, 2), "error_type": "EmptyResponse"}
            )
            raise ValueError("OpenAI returned an empty response.")

        # Clean up potential markdown code blocks
        content_cleaned = response_content.strip()
        if content_cleaned.startswith("```json"):
            content_cleaned = content_cleaned[7:]
        if content_cleaned.startswith("```"):
            content_cleaned = content_cleaned[3:]
        if content_cleaned.endswith("```"):
            content_cleaned = content_cleaned[:-3]
        content_cleaned = content_cleaned.strip()

        # Parse JSON response
        try:
            result = json.loads(content_cleaned)
        except json.JSONDecodeError as e:
            logger.error(
                "Draft generation failed: JSON parse error",
                extra={
                    **log_context,
                    "elapsed_ms": round(elapsed_ms, 2),
                    "error_type": "JSONDecodeError",
                    "parse_error": str(e),
                }
            )
            raise ValueError(
                f"Failed to parse OpenAI response as JSON: {e}. "
                f"Raw response: {response_content[:500]}"
            )

        # Validate required fields
        if "subject" not in result or "content" not in result:
            logger.error(
                "Draft generation failed: missing fields",
                extra={
                    **log_context,
                    "elapsed_ms": round(elapsed_ms, 2),
                    "error_type": "MissingFields",
                    "received_keys": list(result.keys()),
                }
            )
            raise ValueError(
                f"OpenAI response missing required fields. "
                f"Expected 'subject' and 'content', got: {list(result.keys())}"
            )
        
        logger.info(
            "Draft generation completed",
            extra={
                **log_context,
                "elapsed_ms": round(elapsed_ms, 2),
                "subject_length": len(result["subject"]),
                "content_length": len(result["content"]),
            }
        )

        return result["subject"], result["content"]

    except OpenAIError as e:
        elapsed_ms = (time.monotonic() - start_time) * 1000
        logger.error(
            "Draft generation failed: OpenAI API error",
            extra={
                **log_context,
                "elapsed_ms": round(elapsed_ms, 2),
                "error_type": type(e).__name__,
            },
            exc_info=True,
        )
        raise OpenAIError(f"OpenAI API call failed: {str(e)}")
