FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    unzip \
    && curl -fsSL https://deno.land/x/install/install.sh | DENO_INSTALL=/usr/local sh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
