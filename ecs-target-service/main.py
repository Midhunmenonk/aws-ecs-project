from fastapi import FastAPI, status
import os

app = FastAPI(
    title="Target Web Service",
    description="Service deployed on AWS ECS for spec alteration demo.",
    version="1.0.0",
)

@app.get("/", status_code=status.HTTP_200_OK)
def readroot():
    return {
        "service": "AWS ECS Target Service",
        "status": "running",
        "custom_env": os.getenv("APP_ENV", "default-production")
    }

@app.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """Requirement: GET /health returns HTTP 200 OK when working."""
    return {"status": "healthy"}