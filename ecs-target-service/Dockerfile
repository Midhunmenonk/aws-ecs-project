# Use a lightweight official Python runtime base image
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging (critical for CloudWatch)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies in a separate layer to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY main.py .

# Expose port 8080 (Matches standard container target port for ECS task mapping)
EXPOSE 8080

# Run uvicorn using exec form (Array syntax) to handle OS termination signals cleanly
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]