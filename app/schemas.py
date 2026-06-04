from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.security import PASSWORD_RE, USERNAME_RE


Role = Literal["user", "author", "admin"]
EntityStatus = Literal["draft", "on_moderation", "published", "rejected", "archived"]
PurchaseStatus = Literal["created", "paid", "failed"]
EventType = Literal[
    "impression_viewed",
    "impression_started",
    "impression_completed",
    "purchase_created",
    "purchase_paid",
    "route_created",
    "impression_published",
]
EntityType = Literal["user", "route", "impression", "purchase", "progress"]


def trim_text(value: str) -> str:
    return " ".join(value.strip().split())


def reject_control_chars(value: str) -> str:
    if any(ord(ch) < 32 for ch in value):
        raise ValueError("Управляющие символы запрещены")
    return value


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def normalize_required_text(value: str, min_length: int, max_length: int) -> str:
    value = reject_control_chars(trim_text(value))
    if not (min_length <= len(value) <= max_length):
        raise ValueError(f"Длина текста должна быть от {min_length} до {max_length} символов")
    return value


def normalize_optional_text_value(value: str | None, min_length: int, max_length: int) -> str | None:
    if value is None:
        return None
    return normalize_required_text(value, min_length, max_length)


class CityIn(ApiModel):
    external_city_id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=2, max_length=80)

    @field_validator("external_city_id")
    @classmethod
    def normalize_external_city_id(cls, value: str) -> str:
        return normalize_required_text(value, 1, 120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_required_text(value, 2, 80)


class UserRead(ApiModel):
    id: int
    username: str
    email: EmailStr
    role: Role
    is_blocked: bool
    created_at: datetime
    updated_at: datetime


class AuthRegister(ApiModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def valid_username(cls, value: str) -> str:
        value = value.strip()
        if not USERNAME_RE.fullmatch(value):
            raise ValueError("Имя пользователя должно содержать 3-30 латинских букв, цифр или подчёркиваний")
        return value

    @field_validator("password")
    @classmethod
    def valid_password(cls, value: str) -> str:
        if not PASSWORD_RE.fullmatch(value):
            raise ValueError("Пароль должен быть длиной 8-64 символа и содержать букву, цифру и спецсимвол")
        return value


class AuthLogin(ApiModel):
    login: str | None = Field(default=None, min_length=3, max_length=255, description="email or username")
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=3, max_length=30)
    password: str

    @field_validator("login")
    @classmethod
    def normalize_login(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not USERNAME_RE.fullmatch(value):
            raise ValueError("Имя пользователя должно содержать 3-30 латинских букв, цифр или подчёркиваний")
        return value

    @model_validator(mode="after")
    def choose_identifier(self):
        identifiers = [value for value in (self.login, str(self.email) if self.email else None, self.username) if value]
        if len(identifiers) != 1:
            raise ValueError("Нужно передать ровно одно поле: login, email или username")
        self.login = identifiers[0]
        return self


class TokenRead(ApiModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    email: EmailStr
    role: Role


class BlockUserIn(ApiModel):
    is_blocked: bool


class RouteBase(ApiModel):
    name: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=2000)
    cities: list[CityIn] = Field(min_length=1, max_length=10)
    duration_minutes: int = Field(ge=1, le=1440)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_required_text(value, 3, 120)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return normalize_required_text(value, 10, 2000)

    @field_validator("cities")
    @classmethod
    def unique_cities(cls, value: list[CityIn]) -> list[CityIn]:
        ids = [city.external_city_id for city in value]
        if len(ids) != len(set(ids)):
            raise ValueError("external_city_id города не должен повторяться")
        return value


class RouteCreate(RouteBase):
    pass


class RouteUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=3, max_length=120)
    description: str | None = Field(default=None, min_length=10, max_length=2000)
    cities: list[CityIn] | None = Field(default=None, min_length=1, max_length=10)
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)

    @field_validator("name")
    @classmethod
    def normalize_optional_name(cls, value: str | None) -> str | None:
        return normalize_optional_text_value(value, 3, 120)

    @field_validator("description")
    @classmethod
    def normalize_optional_description(cls, value: str | None) -> str | None:
        return normalize_optional_text_value(value, 10, 2000)

    @field_validator("cities")
    @classmethod
    def unique_optional_cities(cls, value: list[CityIn] | None) -> list[CityIn] | None:
        if value is None:
            return None
        ids = [city.external_city_id for city in value]
        if len(ids) != len(set(ids)):
            raise ValueError("external_city_id города не должен повторяться")
        return value


class RouteRead(ApiModel):
    id: int
    user_id: int
    name: str
    description: str
    cities: list[dict[str, str]]
    duration_minutes: int
    status: EntityStatus
    moderation_comment: str | None
    created_at: datetime
    updated_at: datetime


class RoutePointCreate(ApiModel):
    name: str = Field(min_length=3, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    description: str = Field(default="", max_length=1000)
    point_order: int = Field(ge=1)
    stay_minutes: int = Field(ge=0, le=1440)

    @field_validator("name")
    @classmethod
    def normalize_point_name(cls, value: str) -> str:
        return normalize_required_text(value, 3, 120)

    @field_validator("description")
    @classmethod
    def normalize_point_description(cls, value: str) -> str:
        value = reject_control_chars(trim_text(value)) if value else ""
        if len(value) > 1000:
            raise ValueError("Длина текста должна быть от 0 до 1000 символов")
        return value


class RoutePointUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=3, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    description: str | None = Field(default=None, max_length=1000)
    point_order: int | None = Field(default=None, ge=1)
    stay_minutes: int | None = Field(default=None, ge=0, le=1440)

    @field_validator("name")
    @classmethod
    def normalize_optional_point_name(cls, value: str | None) -> str | None:
        return normalize_optional_text_value(value, 3, 120)

    @field_validator("description")
    @classmethod
    def normalize_optional_point_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = reject_control_chars(trim_text(value)) if value else ""
        if len(value) > 1000:
            raise ValueError("Длина текста должна быть от 0 до 1000 символов")
        return value


class RoutePointRead(ApiModel):
    id: int
    route_id: int
    name: str
    latitude: float
    longitude: float
    description: str
    point_order: int
    stay_minutes: int


class RouteDetail(RouteRead):
    points: list[RoutePointRead]


class ModerationReject(ApiModel):
    moderation_comment: str = Field(min_length=1, max_length=1000)

    @field_validator("moderation_comment")
    @classmethod
    def normalize_comment(cls, value: str) -> str:
        return normalize_required_text(value, 1, 1000)


class ImpressionCreate(ApiModel):
    route_id: int = Field(gt=0)
    name: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=2000)
    price: float = Field(ge=0, le=1_000_000)

    @field_validator("name")
    @classmethod
    def normalize_impression_name(cls, value: str) -> str:
        return normalize_required_text(value, 3, 120)

    @field_validator("description")
    @classmethod
    def normalize_impression_description(cls, value: str) -> str:
        return normalize_required_text(value, 10, 2000)


class ImpressionUpdate(ApiModel):
    route_id: int | None = Field(default=None, gt=0)
    name: str | None = Field(default=None, min_length=3, max_length=120)
    description: str | None = Field(default=None, min_length=10, max_length=2000)
    price: float | None = Field(default=None, ge=0, le=1_000_000)

    @field_validator("name")
    @classmethod
    def normalize_optional_impression_name(cls, value: str | None) -> str | None:
        return normalize_optional_text_value(value, 3, 120)

    @field_validator("description")
    @classmethod
    def normalize_optional_impression_description(cls, value: str | None) -> str | None:
        return normalize_optional_text_value(value, 10, 2000)


class ImpressionRead(ApiModel):
    id: int
    route_id: int
    author_id: int
    name: str
    description: str
    price: float
    status: EntityStatus
    rating: float
    popularity_score: float
    moderation_comment: str | None
    created_at: datetime
    updated_at: datetime


class PurchaseCreate(ApiModel):
    impression_id: int = Field(gt=0)


class PaymentRequest(ApiModel):
    success: bool = True


class PurchaseRead(ApiModel):
    id: int
    user_id: int
    impression_id: int
    status: PurchaseStatus
    price_at_purchase: float
    created_at: datetime
    updated_at: datetime


class ReviewCreate(ApiModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=1000)

    @field_validator("comment")
    @classmethod
    def normalize_review_comment(cls, value: str) -> str:
        return normalize_required_text(value, 1, 1000)


class ReviewRead(ApiModel):
    id: int
    user_id: int
    impression_id: int
    rating: int
    comment: str
    created_at: datetime


class ProgressRead(ApiModel):
    id: int
    user_id: int
    impression_id: int
    current_point: int
    is_completed: bool
    updated_at: datetime


class CoordinateMessage(ApiModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AnalyticsEventRead(ApiModel):
    id: int
    user_id: int | None
    event_type: EventType
    entity_type: EntityType
    entity_id: int
    metadata: dict[str, Any] = Field(alias="event_metadata")
    timestamp: datetime


class Page(ApiModel):
    items: list[Any]
    page: int
    page_size: int
    total: int


class ImpressionDetail(ImpressionRead):
    route: RouteDetail
    reviews: list[ReviewRead]
    purchase: PurchaseRead | None = None


class RecommendationItem(ImpressionRead):
    score: float


class AnalyticsSummary(ApiModel):
    total: int
    by_event_type: dict[str, int]


class PlaceRead(ApiModel):
    external_place_id: str
    name: str
    city_external_id: str
    city_name: str
    latitude: float | None = None
    longitude: float | None = None


class RangeQuery(ApiModel):
    min_value: float | None = None
    max_value: float | None = None

    @model_validator(mode="after")
    def valid_range(self):
        if self.min_value is not None and self.max_value is not None and self.min_value > self.max_value:
            raise ValueError("Минимальное значение не может быть больше максимального")
        return self
