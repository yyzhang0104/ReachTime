"""
FastAPI application entry point.
Provides endpoints for draft generation, preferences extraction, and holiday status.
Serves frontend static files at / for single-container deployment.
"""

import logging
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from openai import OpenAIError
import httpx

from app.core.config import get_settings


# Configure logging
# Use structured format suitable for Railway/cloud logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)

# Set log levels for our modules
logging.getLogger("app.services.holiday_service").setLevel(logging.INFO)
logging.getLogger("app.services.openai_client").setLevel(logging.INFO)
logging.getLogger("app.services.preferences_client").setLevel(logging.INFO)

# Reduce noise from external libraries
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)

from app.schemas import (
    GenerateDraftRequest,
    GenerateDraftResponse,
    ExtractPreferencesRequest,
    ExtractPreferencesResponse,
    HolidayStatusRequest,
    HolidayStatusResponse,
    ErrorResponse,
)
from app.services.openai_client import generate_draft
from app.services.preferences_client import extract_preferences
from app.services.holiday_service import get_holiday_status


# Initialize FastAPI app with /api prefix for docs
app = FastAPI(
    title="GlobalSync CRM API",
    description="基于 OpenAI 的商务沟通文案生成、偏好抽取与节假日查询服务",
    version="1.2.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Configure CORS middleware
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# API Routes (all under /api prefix)
# =============================================================================

@app.get("/api/health", tags=["Health"])
async def health_check():
    """Health check endpoint for Railway and monitoring."""
    return {"status": "ok", "message": "GlobalSync CRM API is running"}


@app.post(
    "/api/generate_draft",
    response_model=GenerateDraftResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request - Invalid input"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    },
    tags=["Draft Generation"],
    summary="生成商务沟通文案",
    description="""
    调用 OpenAI API 生成地道的、个性化的商务沟通文案。

    - **user_intent**: 用户的核心沟通目的（必填）
    - **communication_channel**: 沟通渠道，空则默认 Email。支持 Email/WhatsApp/WeChat/SMS 等
    - **crm_notes**: 客户备注，用于个性化文案
    - **target_language**: 目标语言风格，空则使用 professional business English
    - **customer_name**: 客户姓名，空则使用占位符 [Customer Name]
    - **sender_name**: 发送者姓名，空则使用占位符 [Your Name]
    """,
)
async def create_draft(request: GenerateDraftRequest) -> GenerateDraftResponse:
    """
    Generate a personalized business communication draft.

    This endpoint uses OpenAI to generate professional business communication
    content based on user intent, customer context, and channel preferences.
    """
    try:
        subject, content = generate_draft(
            user_intent=request.user_intent,
            communication_channel=request.communication_channel,
            crm_notes=request.crm_notes,
            target_language=request.target_language,
            customer_name=request.customer_name,
            sender_name=request.sender_name,
        )

        return GenerateDraftResponse(subject=subject, content=content)

    except ValueError as e:
        # Configuration or parsing errors
        error_message = str(e)
        if "API key is not configured" in error_message:
            raise HTTPException(
                status_code=500,
                detail="服务配置错误：OpenAI API Key 未配置。请联系管理员。",
            )
        elif "Failed to parse" in error_message or "missing required fields" in error_message:
            raise HTTPException(
                status_code=500,
                detail=f"AI 响应解析失败：{error_message}",
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"内部错误：{error_message}",
            )

    except OpenAIError as e:
        # OpenAI API errors
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI 服务调用失败：{str(e)}",
        )

    except Exception as e:
        # Catch-all for unexpected errors
        raise HTTPException(
            status_code=500,
            detail=f"发生未知错误：{str(e)}",
        )


@app.post(
    "/api/extract_preferences",
    response_model=ExtractPreferencesResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request - Invalid input"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    },
    tags=["Preferences Extraction"],
    summary="从 CRM 备注中抽取客户偏好",
    description="""
    使用 LLM 从客户 CRM 备注中抽取联系时间偏好与禁忌。

    - **crm_notes**: 客户备注文本（必填）
    - **customer_country**: 客户国家代码，用于上下文理解
    - **customer_timezone**: 客户时区，用于日期时间解释
    - **today_local_date**: 今日客户当地日期，用于相对日期解释
    
    返回结构化的偏好约束，包括时间窗口、星期、日期等。
    """,
)
async def extract_customer_preferences(
    request: ExtractPreferencesRequest,
) -> ExtractPreferencesResponse:
    """
    Extract customer scheduling preferences from CRM notes using LLM.
    """
    try:
        result = extract_preferences(
            crm_notes=request.crm_notes,
            customer_country=request.customer_country,
            customer_timezone=request.customer_timezone,
            today_local_date=request.today_local_date,
        )
        return result

    except ValueError as e:
        error_message = str(e)
        if "API key is not configured" in error_message:
            raise HTTPException(
                status_code=500,
                detail="服务配置错误：OpenAI API Key 未配置。请联系管理员。",
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"偏好抽取失败：{error_message}",
            )

    except OpenAIError as e:
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI 服务调用失败：{str(e)}",
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"发生未知错误：{str(e)}",
        )


@app.post(
    "/api/holiday_status",
    response_model=HolidayStatusResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Bad Request - Invalid input"},
        500: {"model": ErrorResponse, "description": "Internal Server Error"},
    },
    tags=["Holiday Status"],
    summary="查询指定日期是否为节假日",
    description="""
    查询客户所在国家的指定日期是否为公共节假日或周末。
    使用 Nager.Date API 获取准确的节假日数据。

    - **country_code**: ISO 2字母国家代码（必填，如 'US', 'CN', 'JP'）
    - **date**: 要查询的日期，格式 YYYY-MM-DD（必填）
    
    仅支持发达国家与东南亚国家的节假日查询。
    """,
)
async def check_holiday_status(
    request: HolidayStatusRequest,
) -> HolidayStatusResponse:
    """
    Check if a date is a public holiday or weekend for a given country.
    Uses Nager.Date API for accurate holiday data with per-year caching.
    """
    try:
        result = await get_holiday_status(
            country_code=request.country_code,
            date_str=request.date,
        )
        return result

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="节假日查询超时，请稍后重试。",
        )

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"节假日服务不可用：{e.response.status_code}",
        )

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"节假日服务连接失败：{str(e)}",
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"发生未知错误：{str(e)}",
        )


# =============================================================================
# Static Files & SPA Fallback (Frontend serving)
# =============================================================================

# Path to frontend static files (built by Vite, copied during Docker build)
STATIC_DIR = Path(__file__).parent / "static"

# Only mount static files if the directory exists (production container)
if STATIC_DIR.exists() and STATIC_DIR.is_dir():
    # Serve static assets (js, css, images, etc.)
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")
    
    # SPA fallback: serve index.html for all non-API, non-asset routes
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """
        Serve the SPA frontend.
        - For paths starting with /api, this won't match (handled by API routes above)
        - For static assets in /assets, those are handled by the StaticFiles mount
        - For everything else, return index.html (SPA client-side routing)
        """
        # Check if it's a request for a specific static file (e.g., favicon.ico)
        file_path = STATIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        # Otherwise, serve index.html for SPA routing
        index_path = STATIC_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        
        # Fallback if index.html doesn't exist
        raise HTTPException(status_code=404, detail="Frontend not found")
else:
    # Development mode: no static files, just API
    @app.get("/")
    async def root():
        """Development mode root endpoint."""
        return {
            "status": "ok",
            "message": "GlobalSync CRM API (dev mode - no frontend)",
            "api_docs": "/api/docs",
        }
