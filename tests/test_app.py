"""
End-to-end API tests for the FastAPI backend.
Uses TestClient with mocked external dependencies (OpenAI, Nager.Date).
"""

import json
import os
import sys
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Add backend to path so we can import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

# Set test environment variables BEFORE importing app modules
os.environ["OPENAI_API_KEY"] = "test-key-for-testing"

# Now import app modules (after env var is set)
from app.core.config import get_settings

# Clear settings cache to pick up test env vars
get_settings.cache_clear()

from fastapi.testclient import TestClient
from app.main import app


# =============================================================================
# Test Client Fixture
# =============================================================================

@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


# =============================================================================
# Mock Data
# =============================================================================

MOCK_HOLIDAYS = {
    "2026-01-01": "New Year's Day",
    "2026-07-04": "Independence Day",
    "2026-12-25": "Christmas Day",
}

MOCK_DRAFT_RESPONSE = {
    "subject": "Follow-up on Our Recent Discussion",
    "content": "Dear {{CUSTOMER_NAME}},\n\nThank you for your time...\n\nBest regards,\n{{SENDER_NAME}}"
}

MOCK_PREFERENCES_RESPONSE = {
    "preferred_time_windows": [{"start": "09:00", "end": "11:00"}],
    "avoid_time_windows": [],
    "preferred_weekdays": ["MON", "TUE", "WED", "THU"],
    "avoid_weekdays": ["FRI"],
    "preferred_dates": [],
    "avoid_dates": ["2026-03-01"],
    "preferred_date_ranges": [],
    "avoid_date_ranges": [],
    "confidence": 0.85,
    "notes_language": "en"
}


# =============================================================================
# Mock Helpers
# =============================================================================

def create_mock_openai_response(content: str) -> MagicMock:
    """Create a mock OpenAI API response object."""
    mock_message = MagicMock()
    mock_message.content = content
    
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    
    return mock_response


def create_mock_openai_client(response_content: str) -> MagicMock:
    """Create a mock OpenAI client that returns the specified content."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = create_mock_openai_response(response_content)
    return mock_client


# =============================================================================
# Tests: Health Check
# =============================================================================

def test_health_ok(client):
    """Test that /api/health returns 200 with status=ok."""
    response = client.get("/api/health")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "message" in data


# =============================================================================
# Tests: Holiday Status (Mocked Nager.Date)
# =============================================================================

def test_holiday_status_mocked(client):
    """Test /api/holiday_status with mocked Nager.Date API."""
    
    async def mock_fetch_holidays(country_code: str, year: int) -> Dict[str, str]:
        """Return mock holiday data."""
        return MOCK_HOLIDAYS
    
    with patch(
        "app.services.holiday_service._fetch_holidays_from_nager",
        new=mock_fetch_holidays
    ):
        # Clear the holiday cache to ensure our mock is used
        from app.services.holiday_service import _holiday_cache
        _holiday_cache.clear()
        
        response = client.post(
            "/api/holiday_status",
            json={"country_code": "US", "date": "2026-01-01"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["is_holiday"] is True
        assert data["holiday_name"] == "New Year's Day"
        assert data["is_weekend"] is False  # 2026-01-01 is Thursday
        assert data["is_supported_country"] is True


def test_holiday_status_weekend(client):
    """Test /api/holiday_status correctly identifies weekends."""
    
    async def mock_fetch_holidays(country_code: str, year: int) -> Dict[str, str]:
        return {}  # No holidays
    
    with patch(
        "app.services.holiday_service._fetch_holidays_from_nager",
        new=mock_fetch_holidays
    ):
        from app.services.holiday_service import _holiday_cache
        _holiday_cache.clear()
        
        # 2026-01-03 is a Saturday
        response = client.post(
            "/api/holiday_status",
            json={"country_code": "US", "date": "2026-01-03"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["is_weekend"] is True
        assert data["is_holiday"] is False


def test_holiday_status_invalid_date_format(client):
    """Test /api/holiday_status with invalid date format (fails Pydantic validation)."""
    response = client.post(
        "/api/holiday_status",
        json={"country_code": "US", "date": "invalid-date"}
    )
    
    # Pydantic pattern validation rejects malformed dates with 422
    assert response.status_code == 422


def test_holiday_status_invalid_date_value(client):
    """Test /api/holiday_status with valid format but invalid date value."""
    
    async def mock_fetch_holidays(country_code: str, year: int) -> Dict[str, str]:
        return {}
    
    with patch(
        "app.services.holiday_service._fetch_holidays_from_nager",
        new=mock_fetch_holidays
    ):
        from app.services.holiday_service import _holiday_cache
        _holiday_cache.clear()
        
        # Valid format but invalid month (99)
        response = client.post(
            "/api/holiday_status",
            json={"country_code": "US", "date": "2026-99-01"}
        )
        
        # Backend ValueError converted to 400
        assert response.status_code == 400


# =============================================================================
# Tests: Holiday Status Batch (Mocked Nager.Date)
# =============================================================================

def test_holiday_status_batch_returns_only_holidays(client):
    """Test /api/holiday_status_batch returns only dates that are holidays."""
    
    async def mock_fetch_holidays(country_code: str, year: int) -> Dict[str, str]:
        """Return mock holiday data."""
        return MOCK_HOLIDAYS
    
    with patch(
        "app.services.holiday_service._fetch_holidays_from_nager",
        new=mock_fetch_holidays
    ):
        from app.services.holiday_service import _holiday_cache
        _holiday_cache.clear()
        
        # Request 4 dates: 2 holidays (01-01, 07-04) and 2 non-holidays (01-02, 01-05)
        response = client.post(
            "/api/holiday_status_batch",
            json={
                "country_code": "US",
                "dates": ["2026-01-01", "2026-01-02", "2026-01-05", "2026-07-04"]
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "holidays" in data
        assert "is_supported_country" in data
        
        # Only holidays should be returned
        assert data["is_supported_country"] is True
        assert len(data["holidays"]) == 2
        assert data["holidays"]["2026-01-01"] == "New Year's Day"
        assert data["holidays"]["2026-07-04"] == "Independence Day"
        
        # Non-holidays should NOT be in the response
        assert "2026-01-02" not in data["holidays"]
        assert "2026-01-05" not in data["holidays"]


def test_holiday_status_batch_no_holidays(client):
    """Test /api/holiday_status_batch returns empty holidays dict when no holidays in dates."""
    
    async def mock_fetch_holidays(country_code: str, year: int) -> Dict[str, str]:
        return MOCK_HOLIDAYS  # Has holidays, but not for the dates we'll query
    
    with patch(
        "app.services.holiday_service._fetch_holidays_from_nager",
        new=mock_fetch_holidays
    ):
        from app.services.holiday_service import _holiday_cache
        _holiday_cache.clear()
        
        # Request dates that are not holidays
        response = client.post(
            "/api/holiday_status_batch",
            json={
                "country_code": "US",
                "dates": ["2026-01-02", "2026-01-05", "2026-02-10"]
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Empty holidays dict
        assert data["holidays"] == {}
        assert data["is_supported_country"] is True


def test_holiday_status_batch_unsupported_country(client):
    """Test /api/holiday_status_batch with unsupported country returns empty holidays."""
    
    # No need to mock - unsupported countries don't make API calls
    response = client.post(
        "/api/holiday_status_batch",
        json={
            "country_code": "XX",  # Invalid/unsupported country
            "dates": ["2026-01-01", "2026-07-04"]
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Empty holidays, unsupported country flag
    assert data["holidays"] == {}
    assert data["is_supported_country"] is False


def test_holiday_status_batch_empty_dates_rejected(client):
    """Test /api/holiday_status_batch rejects empty dates list."""
    response = client.post(
        "/api/holiday_status_batch",
        json={
            "country_code": "US",
            "dates": []  # Empty list, violates min_length=1
        }
    )
    
    # Pydantic validation should reject with 422
    assert response.status_code == 422


def test_holiday_status_batch_invalid_date_format(client):
    """Test /api/holiday_status_batch with invalid date format returns 400."""
    
    async def mock_fetch_holidays(country_code: str, year: int) -> Dict[str, str]:
        return {}
    
    with patch(
        "app.services.holiday_service._fetch_holidays_from_nager",
        new=mock_fetch_holidays
    ):
        from app.services.holiday_service import _holiday_cache
        _holiday_cache.clear()
        
        # Note: the batch endpoint validates date format in the service layer
        # (not via Pydantic regex for each item in the list for simplicity)
        response = client.post(
            "/api/holiday_status_batch",
            json={
                "country_code": "US",
                "dates": ["2026-01-01", "invalid-date", "2026-02-02"]
            }
        )
        
        # Backend ValueError from parsing invalid date -> 400
        assert response.status_code == 400


def test_holiday_status_batch_cross_year(client):
    """Test /api/holiday_status_batch correctly handles dates across multiple years."""
    
    mock_holidays_multi_year = {
        "2025-12-25": "Christmas Day 2025",
        "2026-01-01": "New Year's Day",
        "2026-12-25": "Christmas Day 2026",
    }
    
    async def mock_fetch_holidays(country_code: str, year: int) -> Dict[str, str]:
        """Return holidays for the requested year only."""
        return {k: v for k, v in mock_holidays_multi_year.items() if k.startswith(str(year))}
    
    with patch(
        "app.services.holiday_service._fetch_holidays_from_nager",
        new=mock_fetch_holidays
    ):
        from app.services.holiday_service import _holiday_cache
        _holiday_cache.clear()
        
        # Request dates across 2025 and 2026
        response = client.post(
            "/api/holiday_status_batch",
            json={
                "country_code": "US",
                "dates": ["2025-12-25", "2025-12-26", "2026-01-01", "2026-01-02"]
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should find holidays from both years
        assert len(data["holidays"]) == 2
        assert data["holidays"]["2025-12-25"] == "Christmas Day 2025"
        assert data["holidays"]["2026-01-01"] == "New Year's Day"


# =============================================================================
# Tests: Generate Draft (Mocked OpenAI)
# =============================================================================

def test_generate_draft_mocked_openai(client):
    """Test /api/generate_draft with mocked OpenAI API."""
    
    mock_client = create_mock_openai_client(json.dumps(MOCK_DRAFT_RESPONSE))
    
    with patch("app.services.openai_client.OpenAI", return_value=mock_client):
        response = client.post(
            "/api/generate_draft",
            json={
                "user_intent": "Follow up on the sales meeting",
                "communication_channel": "Email",
                "crm_notes": "Customer interested in product X",
                "target_language": "US English",
                "customer_name": "",
                "sender_name": ""
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "subject" in data
        assert "content" in data
        assert data["subject"] == MOCK_DRAFT_RESPONSE["subject"]
        assert data["content"] == MOCK_DRAFT_RESPONSE["content"]


def test_generate_draft_im_channel(client):
    """Test /api/generate_draft with instant messaging channel."""
    
    mock_response = {
        "subject": "Quick follow-up",
        "content": "Hi! Just checking in about our discussion. Let me know if you have questions!"
    }
    mock_client = create_mock_openai_client(json.dumps(mock_response))
    
    with patch("app.services.openai_client.OpenAI", return_value=mock_client):
        response = client.post(
            "/api/generate_draft",
            json={
                "user_intent": "Quick follow up",
                "communication_channel": "WhatsApp",
                "crm_notes": "",
                "target_language": "",
                "customer_name": "John",
                "sender_name": "Alice"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "subject" in data
        assert "content" in data


def test_generate_draft_substitutes_names(client):
    """When real names are provided, {{CUSTOMER_NAME}}/{{SENDER_NAME}} are replaced server-side."""

    mock_client = create_mock_openai_client(json.dumps(MOCK_DRAFT_RESPONSE))

    with patch("app.services.openai_client.OpenAI", return_value=mock_client):
        response = client.post(
            "/api/generate_draft",
            json={
                "user_intent": "Follow up on samples",
                "communication_channel": "Email",
                "crm_notes": "",
                "target_language": "US English",
                "customer_name": "John",
                "sender_name": "Jane"
            }
        )

        assert response.status_code == 200
        data = response.json()
        # Placeholders must be replaced
        assert "{{CUSTOMER_NAME}}" not in data["content"]
        assert "{{SENDER_NAME}}" not in data["content"]
        assert "John" in data["content"]
        assert "Jane" in data["content"]


def test_generate_draft_keeps_placeholders_when_names_empty(client):
    """When names are empty, placeholders remain so the user can fill them in."""

    mock_client = create_mock_openai_client(json.dumps(MOCK_DRAFT_RESPONSE))

    with patch("app.services.openai_client.OpenAI", return_value=mock_client):
        response = client.post(
            "/api/generate_draft",
            json={
                "user_intent": "Follow up on samples",
                "communication_channel": "Email",
                "crm_notes": "",
                "target_language": "US English",
                "customer_name": "",
                "sender_name": ""
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "{{CUSTOMER_NAME}}" in data["content"]
        assert "{{SENDER_NAME}}" in data["content"]


def test_generate_draft_names_not_sent_to_openai(client):
    """Verify the system prompt sent to OpenAI does NOT contain the real names."""

    mock_client = create_mock_openai_client(json.dumps(MOCK_DRAFT_RESPONSE))

    with patch("app.services.openai_client.OpenAI", return_value=mock_client):
        response = client.post(
            "/api/generate_draft",
            json={
                "user_intent": "Follow up on samples",
                "communication_channel": "Email",
                "crm_notes": "",
                "target_language": "US English",
                "customer_name": "Alejandro",
                "sender_name": "Beatrix"
            }
        )

        assert response.status_code == 200

        # Inspect what was sent to the mock OpenAI client
        call_args = mock_client.chat.completions.create.call_args
        messages = call_args.kwargs.get("messages") or call_args[1].get("messages")
        all_message_text = " ".join(m["content"] for m in messages)

        assert "Alejandro" not in all_message_text, "Real customer name leaked to OpenAI"
        assert "Beatrix" not in all_message_text, "Real sender name leaked to OpenAI"


def test_generate_draft_missing_intent(client):
    """Test /api/generate_draft with missing required field."""
    response = client.post(
        "/api/generate_draft",
        json={
            "communication_channel": "Email",
            "crm_notes": "",
            "target_language": "",
            "customer_name": "",
            "sender_name": ""
        }
    )
    
    # FastAPI should return 422 for validation error
    assert response.status_code == 422


# =============================================================================
# Tests: Extract Preferences (Mocked OpenAI)
# =============================================================================

def test_extract_preferences_mocked_openai(client):
    """Test /api/extract_preferences with mocked OpenAI API."""
    
    mock_client = create_mock_openai_client(json.dumps(MOCK_PREFERENCES_RESPONSE))
    
    with patch("app.services.preferences_client.OpenAI", return_value=mock_client):
        response = client.post(
            "/api/extract_preferences",
            json={
                "crm_notes": "Customer prefers mornings, Mon-Thu. Avoid Friday. Will be on vacation March 1st.",
                "customer_country": "US",
                "customer_timezone": "America/New_York",
                "today_local_date": "2026-02-01"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "preferred_time_windows" in data
        assert "avoid_time_windows" in data
        assert "preferred_weekdays" in data
        assert "avoid_weekdays" in data
        assert "preferred_dates" in data
        assert "avoid_dates" in data
        assert "preferred_date_ranges" in data
        assert "avoid_date_ranges" in data
        assert "confidence" in data
        assert "notes_language" in data
        
        # Check values from mock
        assert data["confidence"] == 0.85
        assert "FRI" in data["avoid_weekdays"]
        assert "2026-03-01" in data["avoid_dates"]


def test_extract_preferences_empty_notes_rejected(client):
    """Test /api/extract_preferences rejects empty CRM notes (min_length=1)."""
    response = client.post(
        "/api/extract_preferences",
        json={
            "crm_notes": "",
            "customer_country": "",
            "customer_timezone": "",
            "today_local_date": ""
        }
    )
    
    # Pydantic min_length validation rejects empty string with 422
    assert response.status_code == 422


def test_extract_preferences_minimal_notes(client):
    """Test /api/extract_preferences with minimal (no preferences) CRM notes."""
    
    empty_response = {
        "preferred_time_windows": [],
        "avoid_time_windows": [],
        "preferred_weekdays": [],
        "avoid_weekdays": [],
        "preferred_dates": [],
        "avoid_dates": [],
        "preferred_date_ranges": [],
        "avoid_date_ranges": [],
        "confidence": 0.0,
        "notes_language": "unknown"
    }
    mock_client = create_mock_openai_client(json.dumps(empty_response))
    
    with patch("app.services.preferences_client.OpenAI", return_value=mock_client):
        response = client.post(
            "/api/extract_preferences",
            json={
                "crm_notes": "No specific preferences mentioned.",
                "customer_country": "",
                "customer_timezone": "",
                "today_local_date": ""
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["confidence"] == 0.0


# =============================================================================
# Tests: Dev Mode Root (No Static Files)
# =============================================================================

def test_root_dev_mode(client):
    """Test that / returns dev mode response when no static files exist."""
    response = client.get("/")
    
    # In test environment, static directory doesn't exist, so we get dev mode response
    assert response.status_code == 200
    data = response.json()
    assert "status" in data or "api_docs" in data


# =============================================================================
# Tests: API Docs Accessibility
# =============================================================================

def test_api_docs_accessible(client):
    """Test that API docs are accessible at /api/docs."""
    response = client.get("/api/docs")
    
    # Docs should return HTML
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")


def test_openapi_json_accessible(client):
    """Test that OpenAPI JSON is accessible at /api/openapi.json."""
    response = client.get("/api/openapi.json")
    
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data
    assert "paths" in data
