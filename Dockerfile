FROM python:3.11-slim as base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create virtual environment
RUN python -m venv .venv
ENV PATH="/app/.venv/bin:$PATH"

# Production stage
FROM base as production

# Copy only necessary files for installation
COPY pyproject.toml ./
COPY README.md ./

# Install only production dependencies
RUN pip install --no-cache-dir -e .

# Copy application code
COPY browser_use/ ./browser_use/
COPY supatest/ ./supatest/

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash app
USER app

# Expose Socket.IO port
EXPOSE 8765

# Use Python health check instead of curl
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8765/health')" || exit 1

# Command to run the server
CMD ["python", "supatest/server.py"] 