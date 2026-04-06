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

# Clone bgutil server and install its Node deps (builds canvas native binary)
RUN git clone --depth=1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /bgutil \
    && cd /bgutil/server \
    && npm ci --omit=dev --no-audit --no-fund

# bgutil-ytdlp-pot-provider pip package looks for server code here
RUN mkdir -p /root/bgutil-ytdlp-pot-provider \
    && ln -s /bgutil/server /root/bgutil-ytdlp-pot-provider/server

# Pre-cache Deno dependencies so startup and per-request token generation are fast
RUN cd /bgutil/server && DENO_DIR=/bgutil/.deno deno cache src/main.ts src/generate_once.ts

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x /app/start.sh

EXPOSE 8000

CMD ["/app/start.sh"]
