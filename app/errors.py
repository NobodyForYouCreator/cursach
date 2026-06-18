from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def success(data):
    return {"status": "success", "data": data, "error": None}


def error_payload(code: int, message: str, details=None):
    error = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"status": "error", "data": None, "error": error}


class ApiError(HTTPException):
    def __init__(self, status_code: int, message: str, details=None):
        super().__init__(status_code=status_code, detail={"message": message, "details": details})


def translate_http_message(message: str) -> str:
    return {
        "Not Found": "Не найдено",
        "Method Not Allowed": "Метод не разрешён",
        "Unauthorized": "Требуется авторизация",
        "Forbidden": "Доступ запрещён",
    }.get(message, message)


def translate_validation_error(err: dict) -> str:
    error_type = err.get("type")
    ctx = err.get("ctx") or {}
    if error_type == "value_error":
        if "valid email address" in err.get("msg", ""):
            return "Некорректный формат email"
        if ctx.get("error"):
            return str(ctx["error"])
    if error_type == "missing":
        return "Поле обязательно"
    if error_type == "string_too_short":
        return f"Длина строки должна быть не меньше {ctx.get('min_length')} символов"
    if error_type == "string_too_long":
        return f"Длина строки должна быть не больше {ctx.get('max_length')} символов"
    if error_type == "too_short":
        return f"Количество элементов должно быть не меньше {ctx.get('min_length')}"
    if error_type == "too_long":
        return f"Количество элементов должно быть не больше {ctx.get('max_length')}"
    if error_type == "greater_than":
        return f"Значение должно быть больше {ctx.get('gt')}"
    if error_type == "greater_than_equal":
        return f"Значение должно быть не меньше {ctx.get('ge')}"
    if error_type == "less_than":
        return f"Значение должно быть меньше {ctx.get('lt')}"
    if error_type == "less_than_equal":
        return f"Значение должно быть не больше {ctx.get('le')}"
    if error_type == "int_parsing":
        return "Значение должно быть целым числом"
    if error_type == "float_parsing":
        return "Значение должно быть числом"
    if error_type == "bool_parsing":
        return "Значение должно быть true или false"
    if error_type == "literal_error":
        return "Значение не входит в список допустимых"
    if error_type == "url_parsing":
        return "Некорректный URL"
    return err.get("msg", "Некорректное значение")


async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict):
        message = exc.detail.get("message") or exc.detail.get("detail") or "Ошибка"
        details = exc.detail.get("details")
    else:
        message = str(exc.detail)
        details = None
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(exc.status_code, translate_http_message(message), details),
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    details = []
    for err in exc.errors():
        field = ".".join(str(x) for x in err.get("loc", []) if x != "body")
        details.append({"field": field or "body", "message": translate_validation_error(err)})
    return JSONResponse(status_code=422, content=error_payload(422, "Ошибка валидации", details))


async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content=error_payload(500, "Внутренняя ошибка сервера"))
