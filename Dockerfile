FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY . .

# Create and activate virtual environment
RUN python -m venv .venv
ENV PATH="/app/.venv/bin:$PATH"

# Install project dependencies
RUN pip install --no-cache-dir -e ".[dev]"

# Expose Socket.IO port
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8765/ || exit 1

# Command to run the server
CMD ["python", "supatest/server.py"] 