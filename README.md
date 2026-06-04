# Travel backend

Асинхронный FastAPI backend по `description/desc.md`.

## Запуск

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
docker-compose up -d postgres
cp .env.example .env
uvicorn app.main:app --reload
```

При `APP_CREATE_TABLES=true` таблицы создаются автоматически при старте.
Администратор создаётся из `ADMIN_*`, если пользователя с таким email ещё нет.

## Проверки

```bash
pytest
```
