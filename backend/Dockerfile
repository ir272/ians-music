FROM python:3.11-slim

# Install system deps: ffmpeg, curl/unzip for Deno, Node.js + build tools for bgutil canvas
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    unzip \
    git \
    nodejs \
    npm \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && curl -fsSL https://deno.land/x/install/install.sh | DENO_INSTALL=/usr/local sh \
    && rm -rf /var/lib/apt/lists/*

# Clone bgutil directly to the path the pip package expects (no symlink = no Deno permission issues)
RUN git clone --depth=1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /root/bgutil-ytdlp-pot-provider \
    && cd /root/bgutil-ytdlp-pot-provider/server \
    && npm ci --omit=dev --no-audit --no-fund

# Pre-cache all Deno dependencies (main.ts = HTTP server, generate_once.ts = script mode fallback)
RUN cd /root/bgutil-ytdlp-pot-provider/server \
    && DENO_DIR=/root/bgutil-ytdlp-pot-provider/.deno deno cache src/main.ts src/generate_once.ts

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x /app/start.sh

EXPOSE 8000

CMD ["/app/start.sh"]
