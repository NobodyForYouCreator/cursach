import asyncio
import os

os.environ["DATABASE_URL"] = "postgresql+asyncpg://travel:travel@localhost:55432/travel"
os.environ["APP_CREATE_TABLES"] = "false"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["PLACES_PROVIDER_URL"] = "http://127.0.0.1:9/unavailable"
os.environ["PLACES_PROVIDER_TIMEOUT_SECONDS"] = "0.2"

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal, engine
from app.main import app
from app.models import Base, User
from app.security import hash_password


async def reset_db():
    await engine.dispose()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        admin = User(
            username="admin",
            email="admin@example.com",
            password_hash=hash_password("Admin123!"),
            role="admin",
        )
        session.add(admin)
        await session.commit()
    await engine.dispose()


def data(response):
    body = response.json()
    assert body["status"] == "success", body
    return body["data"]


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_main_user_author_admin_scenario():
    asyncio.run(reset_db())
    with TestClient(app) as client:
        registered = data(
            client.post(
                "/auth/register",
                json={"username": "denis_travel", "email": "user@example.com", "password": "Password1!"},
            )
        )
        user_token = registered["access_token"]
        admin_token = data(
            client.post("/auth/login", json={"login": "admin@example.com", "password": "Admin123!"})
        )["access_token"]

        route = data(
            client.post(
                "/routes",
                headers=auth_header(user_token),
                json={
                    "name": "Прогулка по центру Москвы",
                    "description": "Маршрут на два часа по основным точкам центра",
                    "cities": [{"external_city_id": "msk", "name": "Москва"}],
                    "duration_minutes": 120,
                },
            )
        )
        assert route["status"] == "draft"

        point = data(
            client.post(
                f"/routes/{route['id']}/points",
                headers=auth_header(user_token),
                json={
                    "name": "Красная площадь",
                    "latitude": 55.7539,
                    "longitude": 37.6208,
                    "description": "Стартовая точка маршрута",
                    "point_order": 1,
                    "stay_minutes": 20,
                },
            )
        )
        assert point["point_order"] == 1

        submitted_route = data(client.post(f"/routes/{route['id']}/submit", headers=auth_header(user_token)))
        assert submitted_route["status"] == "on_moderation"
        published_route = data(
            client.post(f"/moderation/routes/{route['id']}/publish", headers=auth_header(admin_token))
        )
        assert published_route["status"] == "published"

        impression = data(
            client.post(
                "/impressions",
                headers=auth_header(user_token),
                json={
                    "route_id": route["id"],
                    "name": "Историческая прогулка",
                    "description": "Готовое впечатление на основе городского маршрута",
                    "price": 499,
                },
            )
        )
        assert impression["rating"] == 0
        assert impression["popularity_score"] == 0

        submitted_impression = data(
            client.post(f"/impressions/{impression['id']}/submit", headers=auth_header(user_token))
        )
        assert submitted_impression["status"] == "on_moderation"
        published_impression = data(
            client.post(
                f"/moderation/impressions/{impression['id']}/publish",
                headers=auth_header(admin_token),
            )
        )
        assert published_impression["status"] == "published"

        showcase = data(client.get("/showcase/impressions", params={"city_external_id": "msk"}))
        assert showcase["total"] == 1

        purchase = data(
            client.post(
                "/purchases",
                headers=auth_header(user_token),
                json={"impression_id": impression["id"]},
            )
        )
        duplicate_purchase = client.post(
            "/purchases",
            headers=auth_header(user_token),
            json={"impression_id": impression["id"]},
        )
        assert duplicate_purchase.status_code == 409
        paid = data(
            client.post(
                f"/purchases/{purchase['id']}/pay",
                headers=auth_header(user_token),
                json={"success": True},
            )
        )
        assert paid["status"] == "paid"

        with client.websocket_connect(f"/ws/{impression['id']}?token={user_token}") as websocket:
            websocket.send_json({"latitude": 55.7539, "longitude": 37.6208})
            message = websocket.receive_json()
            assert message["status"] == "success"
            assert message["data"]["point_reached"] is True
            assert message["data"]["progress"]["is_completed"] is True

        review = data(
            client.post(
                f"/impressions/{impression['id']}/reviews",
                headers=auth_header(user_token),
                json={"rating": 5, "comment": "Очень понравился маршрут"},
            )
        )
        assert review["rating"] == 5

        detail = data(client.get(f"/impressions/{impression['id']}", headers=auth_header(user_token)))
        assert detail["rating"] == 5
        assert detail["purchase"]["status"] == "paid"
        bff_detail = data(client.get(f"/bff/impressions/{impression['id']}", headers=auth_header(user_token)))
        assert bff_detail["route"]["points"][0]["name"] == "Красная площадь"

        conflict = client.patch(
            f"/routes/{route['id']}",
            headers=auth_header(user_token),
            json={"name": "Новый маршрут"},
        )
        assert conflict.status_code == 409
        assert conflict.json()["error"]["message"] == (
            "Маршрут нельзя изменить, потому что у него есть опубликованные впечатления"
        )

        analytics = data(client.get("/analytics/summary", headers=auth_header(admin_token)))
        assert analytics["by_event_type"]["route_created"] == 1
        assert analytics["by_event_type"]["purchase_paid"] == 1
        assert analytics["by_event_type"]["impression_completed"] == 1
        assert analytics["by_event_type"]["impression_viewed"] >= 2


def test_contract_validation_access_and_author_rules():
    asyncio.run(reset_db())
    with TestClient(app) as client:
        registered = data(
            client.post(
                "/auth/register",
                json={"username": "contract_user", "email": "contract@example.com", "password": "Password1!"},
            )
        )
        user_token = data(
            client.post("/auth/login", json={"email": "contract@example.com", "password": "Password1!"})
        )["access_token"]
        assert user_token
        admin_token = data(
            client.post("/auth/login", json={"username": "admin", "password": "Admin123!"})
        )["access_token"]

        negative_id = client.get("/routes/-1")
        assert negative_id.status_code == 422
        assert negative_id.json()["error"]["code"] == 422
        unknown_path = client.get("/does-not-exist")
        assert unknown_path.status_code == 404
        assert unknown_path.json()["status"] == "error"

        too_short_after_trim = client.post(
            "/routes",
            headers=auth_header(user_token),
            json={
                "name": "  ab  ",
                "description": "Нормальное описание маршрута",
                "cities": [{"external_city_id": "msk", "name": "Москва"}],
                "duration_minutes": 60,
            },
        )
        assert too_short_after_trim.status_code == 422

        unknown_city = client.post(
            "/routes",
            headers=auth_header(user_token),
            json={
                "name": "Маршрут",
                "description": "Нормальное описание маршрута",
                "cities": [{"external_city_id": "unknown", "name": "Город"}],
                "duration_minutes": 60,
            },
        )
        assert unknown_city.status_code == 422
        assert "Неизвестный external_city_id города" in unknown_city.json()["error"]["message"]

        blocked = data(
            client.patch(
                f"/admin/users/{registered['user_id']}/block",
                headers=auth_header(admin_token),
                json={"is_blocked": True},
            )
        )
        assert blocked["is_blocked"] is True
        blocked_me = client.get("/users/me", headers=auth_header(user_token))
        assert blocked_me.status_code == 403

        data(
            client.patch(
                f"/admin/users/{registered['user_id']}/block",
                headers=auth_header(admin_token),
                json={"is_blocked": False},
            )
        )
        verified = data(
            client.patch(
                f"/admin/users/{registered['user_id']}/verify-author",
                headers=auth_header(admin_token),
            )
        )
        assert verified["role"] == "author"

        author_route = data(
            client.post(
                "/routes",
                headers=auth_header(user_token),
                json={
                    "name": "Авторский маршрут",
                    "description": "Описание авторского маршрута",
                    "cities": [{"external_city_id": "spb", "name": "Санкт-Петербург"}],
                    "duration_minutes": 90,
                },
            )
        )
        no_point_submit = client.post(f"/routes/{author_route['id']}/submit", headers=auth_header(user_token))
        assert no_point_submit.status_code == 409
        data(
            client.post(
                f"/routes/{author_route['id']}/points",
                headers=auth_header(user_token),
                json={
                    "name": "Дворцовая площадь",
                    "latitude": 59.9398,
                    "longitude": 30.3146,
                    "description": "Главная точка маршрута",
                    "point_order": 1,
                    "stay_minutes": 15,
                },
            )
        )
        submitted = data(client.post(f"/routes/{author_route['id']}/submit", headers=auth_header(user_token)))
        assert submitted["status"] == "published"
        admin_routes = data(
            client.get(
                "/routes",
                headers=auth_header(admin_token),
                params={"author_id": registered["user_id"]},
            )
        )
        assert admin_routes["total"] == 1

        free_impression = data(
            client.post(
                "/impressions",
                headers=auth_header(user_token),
                json={
                    "route_id": author_route["id"],
                    "name": "Бесплатное впечатление",
                    "description": "Описание бесплатного впечатления",
                    "price": 0,
                },
            )
        )
        free_impression = data(
            client.post(f"/impressions/{free_impression['id']}/submit", headers=auth_header(user_token))
        )
        assert free_impression["status"] == "published"
        free_progress = data(
            client.get(f"/progress/{free_impression['id']}", headers=auth_header(user_token))
        )
        assert free_progress["is_completed"] is False

        draft_impression = data(
            client.post(
                "/impressions",
                headers=auth_header(user_token),
                json={
                    "route_id": author_route["id"],
                    "name": "Черновик впечатления",
                    "description": "Описание черновика впечатления",
                    "price": 100,
                },
            )
        )
        unpublished_purchase = client.post(
            "/purchases",
            headers=auth_header(user_token),
            json={"impression_id": draft_impression["id"]},
        )
        assert unpublished_purchase.status_code == 404
        draft_route = data(
            client.post(
                "/routes",
                headers=auth_header(user_token),
                json={
                    "name": "Черновой маршрут",
                    "description": "Описание чернового маршрута",
                    "cities": [{"external_city_id": "msk", "name": "Москва"}],
                    "duration_minutes": 45,
                },
            )
        )
        publish_draft_route_by_admin = client.post(
            f"/moderation/routes/{draft_route['id']}/publish",
            headers=auth_header(admin_token),
        )
        assert publish_draft_route_by_admin.status_code == 409
        own_routes = data(client.get("/routes", headers=auth_header(user_token)))
        assert any(item["id"] == draft_route["id"] and item["status"] == "draft" for item in own_routes["items"])
        data(
            client.post(
                f"/routes/{draft_route['id']}/points",
                headers=auth_header(user_token),
                json={
                    "name": "Черновая точка",
                    "latitude": 55.75,
                    "longitude": 37.61,
                    "description": "Точка чернового маршрута",
                    "point_order": 1,
                    "stay_minutes": 10,
                },
            )
        )
        draft_route_impression = data(
            client.post(
                "/impressions",
                headers=auth_header(user_token),
                json={
                    "route_id": draft_route["id"],
                    "name": "Впечатление чернового маршрута",
                    "description": "Описание впечатления чернового маршрута",
                    "price": 0,
                },
            )
        )
        publish_draft_impression_by_admin = client.post(
            f"/moderation/impressions/{draft_route_impression['id']}/publish",
            headers=auth_header(admin_token),
        )
        assert publish_draft_impression_by_admin.status_code == 409
        submit_draft_route_impression = client.post(
            f"/impressions/{draft_route_impression['id']}/submit",
            headers=auth_header(user_token),
        )
        assert submit_draft_route_impression.status_code == 409
        missing_city_recommendations = client.get("/recommendations", headers=auth_header(user_token))
        assert missing_city_recommendations.status_code == 422
        places = data(client.get("/places/search", params={"q": "Москва"}))
        assert places[0]["city_external_id"] in {"msk", "12345"}
        invalid_places = client.get("/places/search", params={"q": "Москва", "latitude": 55.75})
        assert invalid_places.status_code == 422
