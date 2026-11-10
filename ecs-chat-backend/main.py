from fastapi import FastAPI
from pydantic import BaseModel
import openai
import boto3
from schemas import ECSSpecChange
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Connect to AWS (Uses the credentials you set up with 'aws configure')
ecs_client = boto3.client('ecs', region_name='us-east-1')
CLUSTER_NAME = "demo-ecs-cluster"
SERVICE_NAME = "target-service"

class ChatRequest(BaseModel):
    prompt: str

@app.post("/api/chat")
async def process_chat(request: ChatRequest):
    # 1. Parse intent using OpenAI
    response = openai.beta.chat.completions.parse(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a DevOps assistant. Parse user text to extract AWS ECS Fargate specification changes."},
            {"role": "user", "content": request.prompt}
        ],
        response_format=ECSSpecChange
    )
    
    spec: ECSSpecChange = response.choices[0].message.parsed

    # 2. Check if the AI understood the request
    if not spec.is_valid_request:
        return {"status": "error", "message": spec.message_to_user}

    if spec.desired_count is not None and spec.desired_count < 1:
        return {
            "status": "error", 
            "message": "Safety Guardrail Triggered: I cannot scale the service below 1 instance to prevent downtime."
        }

    # 3. Execute Real AWS Updates
    try:
        # Handle scaling (Number of instances)
        if spec.desired_count is not None:
            ecs_client.update_service(
                cluster=CLUSTER_NAME,
                service=SERVICE_NAME,
                desiredCount=spec.desired_count
            )
        
        # Handle resizing (CPU / Memory changes)
        if spec.cpu or spec.memory:
            # Fetch current task definition details
            current_svc = ecs_client.describe_services(cluster=CLUSTER_NAME, services=[SERVICE_NAME])['services'][0]
            task_def_arn = current_svc['taskDefinition']
            task_def = ecs_client.describe_task_definition(taskDefinition=task_def_arn)['taskDefinition']
            
            # Register new revision with updated CPU/Memory (preserving the IAM execution role)
            new_task_def = ecs_client.register_task_definition(
                family=task_def['family'],
                networkMode=task_def['networkMode'],
                requiresCompatibilities=task_def['requiresCompatibilities'],
                containerDefinitions=task_def['containerDefinitions'],
                cpu=spec.cpu or task_def['cpu'],
                memory=spec.memory or task_def['memory'],
                executionRoleArn=task_def.get('executionRoleArn', '')
            )
            
            # Apply new task definition revision to service
            ecs_client.update_service(
                cluster=CLUSTER_NAME,
                service=SERVICE_NAME,
                taskDefinition=new_task_def['taskDefinition']['taskDefinitionArn']
            )

        return {"status": "success", "message": f"AWS Update Triggered: {spec.message_to_user}"}

    except Exception as e:
        return {"status": "error", "message": f"AWS Update Failed: {str(e)}"}