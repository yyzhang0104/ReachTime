"""
Pydantic schemas for request and response validation.
"""

from typing import List, Optional, Literal, Dict
from pydantic import BaseModel, Field


# ============ Time/Date Types for Preferences ============

Weekday = Literal["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


class TimeWindow(BaseModel):
    """A time window in HH:MM format (24h, customer's local time)."""
    start: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="Start time in HH:MM format")
    end: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="End time in HH:MM format")


class DateRange(BaseModel):
    """A date range in YYYY-MM-DD format (customer's local date)."""
    start: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Start date in YYYY-MM-DD format")
    end: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="End date in YYYY-MM-DD format")


# ============ Preferences Extraction ============

class ExtractPreferencesRequest(BaseModel):
    """Request schema for extracting customer preferences from CRM notes."""
    
    crm_notes: str = Field(
        ...,
        min_length=1,
        description="Customer CRM notes to extract preferences from",
    )
    customer_country: str = Field(
        default="",
        description="ISO country code (e.g., 'CN', 'US') to help interpret dates/context",
    )
    customer_timezone: str = Field(
        default="",
        description="IANA timezone (e.g., 'Asia/Shanghai') for interpreting times",
    )
    today_local_date: str = Field(
        default="",
        description="Today's date in customer's local timezone (YYYY-MM-DD) for relative date interpretation",
    )


class ExtractPreferencesResponse(BaseModel):
    """Response schema containing extracted customer preferences."""
    
    preferred_time_windows: List[TimeWindow] = Field(
        default_factory=list,
        description="Preferred contact time windows (customer's local time)",
    )
    avoid_time_windows: List[TimeWindow] = Field(
        default_factory=list,
        description="Time windows to avoid (customer's local time)",
    )
    preferred_weekdays: List[Weekday] = Field(
        default_factory=list,
        description="Preferred weekdays for contact",
    )
    avoid_weekdays: List[Weekday] = Field(
        default_factory=list,
        description="Weekdays to avoid for contact",
    )
    preferred_dates: List[str] = Field(
        default_factory=list,
        description="Specific preferred dates (YYYY-MM-DD format)",
    )
    avoid_dates: List[str] = Field(
        default_factory=list,
        description="Specific dates to avoid (YYYY-MM-DD format)",
    )
    preferred_date_ranges: List[DateRange] = Field(
        default_factory=list,
        description="Preferred date ranges for contact",
    )
    avoid_date_ranges: List[DateRange] = Field(
        default_factory=list,
        description="Date ranges to avoid (e.g., vacations)",
    )
    confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Confidence score of extraction (0-1)",
    )
    notes_language: str = Field(
        default="unknown",
        description="Detected language of notes: 'zh', 'en', 'mixed', or 'unknown'",
    )


# ============ Holiday Status ============

class HolidayStatusRequest(BaseModel):
    """Request schema for checking holiday status."""
    
    country_code: str = Field(
        ...,
        min_length=2,
        max_length=2,
        description="ISO 2-letter country code (e.g., 'US', 'CN', 'JP')",
    )
    date: str = Field(
        ...,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Date to check in YYYY-MM-DD format (customer's local date)",
    )


class HolidayStatusResponse(BaseModel):
    """Response schema for holiday status."""
    
    is_holiday: bool = Field(
        ...,
        description="Whether the date is a public holiday",
    )
    is_weekend: bool = Field(
        ...,
        description="Whether the date is a weekend",
    )
    holiday_name: Optional[str] = Field(
        default=None,
        description="Name of the holiday if applicable",
    )
    is_supported_country: bool = Field(
        default=True,
        description="Whether the country is in the supported list",
    )


class HolidayStatusBatchRequest(BaseModel):
    """Request schema for batch checking holiday status of multiple dates."""
    
    country_code: str = Field(
        ...,
        min_length=2,
        max_length=2,
        description="ISO 2-letter country code (e.g., 'US', 'CN', 'JP')",
    )
    dates: List[str] = Field(
        ...,
        min_length=1,
        max_length=60,
        description="List of dates to check in YYYY-MM-DD format (max 60)",
    )


class HolidayMapResponse(BaseModel):
    """Response schema for batch holiday status - only returns holidays (date->name mapping)."""
    
    holidays: Dict[str, str] = Field(
        default_factory=dict,
        description="Map of date (YYYY-MM-DD) to holiday name; only holidays are included",
    )
    is_supported_country: bool = Field(
        default=True,
        description="Whether the country is in the supported list",
    )


# ============ Draft Generation ============

class GenerateDraftRequest(BaseModel):
    """Request schema for generating a communication draft."""

    user_intent: str = Field(
        ...,
        min_length=1,
        description="用户的核心沟通目的（例如：'跟进上次销售情况，询问反馈'）",
    )
    communication_channel: str = Field(
        default="",
        description="沟通渠道（Email/WhatsApp/WeChat/SMS 等），空则默认 Email",
    )
    crm_notes: str = Field(
        default="",
        description="客户备注信息，用于个性化文案",
    )
    target_language: str = Field(
        default="",
        description="目标语言风格（例如：'British English', 'US English', 'Japanese'），空则使用 professional business English",
    )
    customer_name: str = Field(
        default="",
        description="客户姓名，空则使用占位符 [Customer Name]",
    )
    sender_name: str = Field(
        default="",
        description="发送者姓名，空则使用占位符 [Your Name]",
    )


class GenerateDraftResponse(BaseModel):
    """Response schema containing the generated draft."""

    subject: str = Field(
        ...,
        description="建议的邮件标题或沟通主题",
    )
    content: str = Field(
        ...,
        description="生成的正式文案正文",
    )


class ErrorResponse(BaseModel):
    """Schema for error responses."""

    detail: str = Field(
        ...,
        description="错误信息描述",
    )
