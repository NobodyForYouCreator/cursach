from typing import Annotated

import httpx
from fastapi import APIRouter, Query

from app.config import get_settings
from app.errors import ApiError, success
from app.schemas import PlaceRead
from app.services import KNOWN_CITIES


router = APIRouter()


def local_places(query: str, city_external_id: str | None) -> list[dict]:
    places = []
    for city in KNOWN_CITIES.values():
        if city_external_id and city["external_city_id"] != city_external_id:
            continue
        if query not in city["name"].lower() and query not in "достопримечательность место парк музей":
            continue
        places.append(
            PlaceRead(
                external_place_id=f"{city['external_city_id']}:center",
                name=f"{city['name']}: центр",
                city_external_id=city["external_city_id"],
                city_name=city["name"],
                latitude=None,
                longitude=None,
            ).model_dump(mode="json")
        )
    return places


def normalize_nominatim_place(item: dict, fallback_city_id: str | None) -> dict:
    address = item.get("address") or {}
    city_name = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or ""
    )
    city_external_id = fallback_city_id or city_name.lower().replace(" ", "_") or "unknown"
    return PlaceRead(
        external_place_id=str(item.get("osm_id") or item.get("place_id") or item.get("display_name")),
        name=str(item.get("name") or item.get("display_name") or "Unnamed place"),
        city_external_id=city_external_id,
        city_name=city_name or city_external_id,
        latitude=float(item["lat"]) if item.get("lat") is not None else None,
        longitude=float(item["lon"]) if item.get("lon") is not None else None,
    ).model_dump(mode="json")


@router.get("/places/search")
async def places_search(
    q: Annotated[str, Query(min_length=1, max_length=80)],
    city_external_id: str | None = None,
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
):
    if (latitude is None) != (longitude is None):
        raise ApiError(422, "Необходимо передать latitude и longitude вместе")
    query = q.strip().lower()
    settings = get_settings()
    params = {"q": q.strip(), "format": "jsonv2", "addressdetails": 1, "limit": 10}
    if latitude is not None and longitude is not None:
        params["viewbox"] = f"{longitude - 0.2},{latitude + 0.2},{longitude + 0.2},{latitude - 0.2}"
        params["bounded"] = 0
    try:
        async with httpx.AsyncClient(timeout=settings.places_provider_timeout_seconds) as client:
            response = await client.get(
                settings.places_provider_url,
                params=params,
                headers={"User-Agent": "travel-backend-coursework/1.0"},
            )
            response.raise_for_status()
            items = response.json()
        normalized = [normalize_nominatim_place(item, city_external_id) for item in items]
        if city_external_id:
            known_city = KNOWN_CITIES.get(city_external_id)
            if known_city:
                normalized = [
                    item for item in normalized if item["city_name"].lower() == known_city["name"].lower()
                ] or local_places(query, city_external_id)
        return success(normalized)
    except Exception:
        return success(local_places(query, city_external_id))
