from pydantic import BaseModel, Field
from typing import Optional

class ECSSpecChange(BaseModel):
    is_valid_request: bool = Field(
        description="True if the user is asking to change valid AWS ECS parameters (desired instances, CPU, or memory). False if the request is unrelated or malicious."
    )
    desired_count: Optional[int] = Field(
        default=None, 
        description="The desired number of running container instances (e.g., 1, 2, 3)."
    )
    cpu: Optional[str] = Field(
        default=None, 
        description="The CPU units to allocate. Valid Fargate values: '256', '512', '1024', '2048', '4096'."
    )
    memory: Optional[str] = Field(
        default=None, 
        description="The memory to allocate in MB. Valid Fargate values: '512', '1024', '2048', '4096', '8192'."
    )
    message_to_user: str = Field(
        description="A clear, friendly explanation of what will be updated, OR an error message explaining why the request was invalid."
    )