FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/app/data

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . /app/

# Ensure data directory exists
RUN mkdir -p /app/data

EXPOSE 5000

# By default, start the web server. docker-compose will override this command for the bot service.
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "app:app"]
