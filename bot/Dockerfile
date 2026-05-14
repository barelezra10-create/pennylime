FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

# Install deps first (layer cache)
COPY pyproject.toml ./
RUN uv pip install --system -r pyproject.toml --no-cache

# Then app source
COPY . .

CMD ["python", "main.py"]
