"""
Holiday service for checking public holidays.
Uses Nager.Date API (https://date.nager.at) for accurate holiday data.
Covers developed countries and Southeast Asian countries.
"""

import logging
import time
from datetime import datetime, date
from typing import Dict, List, Optional, Set, Tuple

import httpx

from app.schemas import HolidayStatusResponse, HolidayMapResponse


# Configure module logger
logger = logging.getLogger(__name__)


# Nager.Date API configuration
NAGER_API_BASE_URL = "https://date.nager.at/api/v3"
NAGER_HTTP_TIMEOUT = 5.0  # seconds


# Supported countries: Developed countries + Southeast Asia
# Note: Nager.Date uses ISO 3166-1 alpha-2 codes
SUPPORTED_COUNTRIES: Set[str] = {
    # North America
    "US", "CA",
    # Europe
    "GB", "DE", "FR", "IT", "ES", "NL", "BE", "CH", "AT", "SE", "NO", "DK", "FI", "IE",
    # Asia Pacific - Developed
    "JP", "KR", "AU", "NZ", "SG", "HK",
    # Southeast Asia
    "TH", "VN", "MY", "ID", "PH",
    # Middle East - Developed
    "AE", "IL",
    # China (major trading partner)
    "CN",
}


# In-memory cache: {(country_code, year): {date_str: holiday_name}}
# Cache is per-year and persists for the lifetime of the process
_holiday_cache: Dict[tuple, Dict[str, str]] = {}


def is_weekend(d: date) -> bool:
    """Check if a date is a weekend (Saturday=5, Sunday=6)."""
    return d.weekday() >= 5


async def _fetch_holidays_from_nager(country_code: str, year: int) -> Dict[str, str]:
    """
    Fetch public holidays from Nager.Date API for a given country and year.
    
    Returns:
        Dict mapping date string (YYYY-MM-DD) to holiday name
    
    Raises:
        httpx.HTTPError: On network/API errors
    """
    url = f"{NAGER_API_BASE_URL}/PublicHolidays/{year}/{country_code}"
    start_time = time.monotonic()
    
    logger.info(
        "Nager.Date API request started",
        extra={"country": country_code, "year": year, "url": url}
    )
    
    try:
        async with httpx.AsyncClient(timeout=NAGER_HTTP_TIMEOUT) as client:
            response = await client.get(url)
            elapsed_ms = (time.monotonic() - start_time) * 1000
            
            logger.info(
                "Nager.Date API response received",
                extra={
                    "country": country_code,
                    "year": year,
                    "status_code": response.status_code,
                    "elapsed_ms": round(elapsed_ms, 2),
                }
            )
            
            response.raise_for_status()
            holidays_data = response.json()
            
            # Build date -> name mapping
            result: Dict[str, str] = {}
            for holiday in holidays_data:
                # Each holiday has: date, localName, name, countryCode, etc.
                date_str = holiday.get("date", "")
                # Prefer localName (native language), fallback to name (English)
                name = holiday.get("localName") or holiday.get("name") or "Holiday"
                if date_str:
                    result[date_str] = name
            
            logger.debug(
                "Nager.Date API parsed holidays",
                extra={"country": country_code, "year": year, "holiday_count": len(result)}
            )
            
            return result
            
    except httpx.TimeoutException as e:
        elapsed_ms = (time.monotonic() - start_time) * 1000
        logger.error(
            "Nager.Date API timeout",
            extra={
                "country": country_code,
                "year": year,
                "elapsed_ms": round(elapsed_ms, 2),
                "error_type": "TimeoutException",
            },
            exc_info=True,
        )
        raise
        
    except httpx.HTTPStatusError as e:
        elapsed_ms = (time.monotonic() - start_time) * 1000
        logger.error(
            "Nager.Date API HTTP error",
            extra={
                "country": country_code,
                "year": year,
                "status_code": e.response.status_code,
                "elapsed_ms": round(elapsed_ms, 2),
                "error_type": "HTTPStatusError",
            },
            exc_info=True,
        )
        raise
        
    except httpx.HTTPError as e:
        elapsed_ms = (time.monotonic() - start_time) * 1000
        logger.error(
            "Nager.Date API error",
            extra={
                "country": country_code,
                "year": year,
                "elapsed_ms": round(elapsed_ms, 2),
                "error_type": type(e).__name__,
            },
            exc_info=True,
        )
        raise


async def _get_holidays_for_year(country_code: str, year: int) -> Dict[str, str]:
    """
    Get holidays for a country/year, using cache if available.
    
    Returns:
        Dict mapping date string (YYYY-MM-DD) to holiday name
        
    Raises:
        httpx.HTTPError: On network/API errors (first fetch only)
    """
    cache_key = (country_code.upper(), year)
    
    if cache_key in _holiday_cache:
        logger.debug(
            "Holiday cache hit",
            extra={"country": country_code, "year": year}
        )
        return _holiday_cache[cache_key]
    
    logger.debug(
        "Holiday cache miss",
        extra={"country": country_code, "year": year}
    )
    
    # Fetch from API
    holidays = await _fetch_holidays_from_nager(country_code, year)
    
    # Cache the result
    _holiday_cache[cache_key] = holidays
    
    logger.info(
        "Holiday data cached",
        extra={"country": country_code, "year": year, "holiday_count": len(holidays)}
    )
    
    return holidays


async def get_holiday_status(country_code: str, date_str: str) -> HolidayStatusResponse:
    """
    Check if a date is a public holiday or weekend for a given country.
    Uses Nager.Date API with per-year caching.
    
    Args:
        country_code: ISO 2-letter country code (uppercase)
        date_str: Date string in YYYY-MM-DD format
    
    Returns:
        HolidayStatusResponse with holiday/weekend status
    
    Raises:
        ValueError: If date format is invalid
        httpx.HTTPError: If Nager.Date API call fails
    """
    # Normalize country code
    country = country_code.upper().strip()
    
    # Check if country is supported
    is_supported = country in SUPPORTED_COUNTRIES
    
    # Parse date
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"Invalid date format: {date_str}. Expected YYYY-MM-DD.")
    
    # Check weekend (always local calculation, no API needed)
    weekend = is_weekend(d)
    
    # Check holiday via Nager.Date API
    holiday_name: Optional[str] = None
    is_holiday = False
    
    if is_supported:
        try:
            year = d.year
            holidays = await _get_holidays_for_year(country, year)
            
            if date_str in holidays:
                is_holiday = True
                holiday_name = holidays[date_str]
        except httpx.HTTPError:
            # Re-raise to let caller handle (fail-open or fail-closed)
            raise
    
    return HolidayStatusResponse(
        is_holiday=is_holiday,
        is_weekend=weekend,
        holiday_name=holiday_name,
        is_supported_country=is_supported,
    )


async def get_holidays_for_dates(
    country_code: str, 
    dates: List[str]
) -> Tuple[Dict[str, str], bool]:
    """
    Get holidays for a list of dates (batch query).
    Uses per-year caching to minimize Nager.Date API calls.
    
    Args:
        country_code: ISO 2-letter country code
        dates: List of date strings in YYYY-MM-DD format
    
    Returns:
        Tuple of (holidays_dict, is_supported_country)
        - holidays_dict: Dict mapping date (YYYY-MM-DD) to holiday name, only for holidays
        - is_supported_country: Whether the country is in the supported list
    
    Raises:
        ValueError: If any date format is invalid
        httpx.HTTPError: If Nager.Date API call fails
    """
    # Normalize country code
    country = country_code.upper().strip()
    is_supported = country in SUPPORTED_COUNTRIES
    
    if not is_supported:
        logger.debug(
            "Batch holiday query: unsupported country",
            extra={"country": country_code, "dates_count": len(dates)}
        )
        return {}, False
    
    # Parse dates and group by year
    years_needed: Set[int] = set()
    parsed_dates: List[str] = []
    
    for date_str in dates:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
            years_needed.add(d.year)
            parsed_dates.append(date_str)
        except ValueError:
            raise ValueError(f"Invalid date format: {date_str}. Expected YYYY-MM-DD.")
    
    logger.info(
        "Batch holiday query started",
        extra={
            "country": country,
            "dates_count": len(parsed_dates),
            "years_needed": sorted(years_needed),
        }
    )
    
    # Fetch all needed years (will use cache when available)
    all_holidays: Dict[str, str] = {}
    for year in years_needed:
        year_holidays = await _get_holidays_for_year(country, year)
        all_holidays.update(year_holidays)
    
    # Filter to only requested dates that are holidays
    result: Dict[str, str] = {}
    for date_str in parsed_dates:
        if date_str in all_holidays:
            result[date_str] = all_holidays[date_str]
    
    logger.info(
        "Batch holiday query completed",
        extra={
            "country": country,
            "dates_requested": len(parsed_dates),
            "holidays_found": len(result),
        }
    )
    
    return result, True
