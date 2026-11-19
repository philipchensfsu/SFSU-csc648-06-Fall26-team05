# The Nautilus Discord bot as one long-running worker (no web port).
# Railway builds this when the service's root directory is app/discord-bot.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /bot
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY nautilus_bot ./nautilus_bot
RUN useradd --create-home bot
USER bot
CMD ["python", "-m", "nautilus_bot"]
