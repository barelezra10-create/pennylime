FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

# Install deps first (layer cache)
COPY requirements.lock ./
RUN uv pip install --system --require-hashes -r requirements.lock --no-cache

# Then app source
COPY . .

RUN useradd --create-home --uid 10001 pennylime && chown -R pennylime:pennylime /app
USER pennylime

CMD ["python", "main.py"]
