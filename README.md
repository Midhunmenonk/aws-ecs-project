# AWS ECS Service Deployment and Chat Assistant

This project demonstrates deploying a small FastAPI service on Amazon ECS with
Terraform and using a React chat page to request ECS service changes in plain
English.

## Project layout

```text
AWS_ECS/
├── chat-frontend/       React and Vite chat interface
├── ecs-chat-backend/    Local FastAPI API that interprets requests and calls ECS
├── ecs-target-service/  FastAPI service deployed to ECS
└── terraform/           ECR, networking, IAM, ECS cluster, task, and service
```

The chat backend and the target service are separate applications. In this
project the chat backend runs locally; it uses your local OpenAI and AWS
credentials. Terraform deploys only the target service.

## Requirements

- Windows PowerShell, or a terminal with equivalent Node, Python, AWS CLI,
  Docker, and Terraform commands
- Node.js and npm
- Python 3.11
- Docker Desktop (or another Docker-compatible engine)
- AWS CLI configured for an AWS account where you can create the resources
  listed below
- Terraform 1.5 or later
- An OpenAI API key with access to `gpt-4o-mini`

Terraform is configured for `us-east-1`. The chat backend also sends ECS API
requests to `us-east-1`; use that region consistently.

## AWS permissions and costs

Terraform needs permission to manage the ECR repository, VPC, subnet, internet
gateway, route table, security group, ECS cluster/task/service, and ECS task
execution IAM role and policy attachment. The identity used by the local chat
backend needs permission to describe and update the `target-service`, describe
its task definition, and register a task definition revision.

These resources can incur AWS charges while running. The security group in
this demo allows inbound TCP port 8080 from `0.0.0.0/0`, and the target service
does not provide HTTPS. Use a test account and do not send sensitive data to
the public endpoint.

## 1. Configure AWS

In PowerShell, configure the AWS CLI and check that it uses the intended
account:

```powershell
aws configure
aws sts get-caller-identity
aws configure get region
```

Use `us-east-1`. Terraform's AWS provider and the backend's ECS client use that
region.

## 2. Create the AWS infrastructure

In PowerShell:

```powershell
Set-Location .\terraform
terraform init
terraform validate
terraform plan
terraform apply
```

Review the plan before confirming `terraform apply`. The configuration creates
the ECR repository and ECS service with a task definition that refers to the
image tag `latest`. The image is not built or pushed by Terraform; complete the
next step to publish it.

The current Terraform output is the ECR repository URL:

```powershell
$EcrUri = (terraform output -raw ecr_repository_url).Trim()
```

## 3. Build and deploy the target service image

From the project root, build the image and push it to the repository created
above:

```powershell
Set-Location .\ecs-target-service
docker build -t ecs-target-service:latest .
$EcrUri = (terraform -chdir=..\terraform output -raw ecr_repository_url).Trim()
aws ecr get-login-password --region us-east-1 |
  docker login --username AWS --password-stdin $EcrUri
docker tag ecs-target-service:latest "$($EcrUri):latest"
docker push "$($EcrUri):latest"
```

If the ECS service was created before the image was pushed, it may initially
fail to start. Tell ECS to pull the now-published image and wait for the service
to stabilize:

```powershell
aws ecs update-service `
  --cluster demo-ecs-cluster `
  --service target-service `
  --force-new-deployment
aws ecs wait services-stable `
  --cluster demo-ecs-cluster `
  --services target-service
```

The task is assigned a public IP, but Terraform does not provision a load
balancer, DNS name, or stable service URL. To find the current task's public IP
in PowerShell:

```powershell
$TaskArn = aws ecs list-tasks `
  --cluster demo-ecs-cluster `
  --service-name target-service `
  --desired-status RUNNING `
  --query "taskArns[0]" `
  --output text

$Task = aws ecs describe-tasks `
  --cluster demo-ecs-cluster `
  --tasks $TaskArn `
  --query "tasks[0]" `
  --output json | ConvertFrom-Json

$EniId = ($Task.attachments[0].details |
  Where-Object { $_.name -eq "networkInterfaceId" }).value
$PublicIp = aws ec2 describe-network-interfaces `
  --network-interface-ids $EniId `
  --query "NetworkInterfaces[0].Association.PublicIp" `
  --output text
$ServiceUrl = "http://${PublicIp}:8080"

Invoke-RestMethod "$ServiceUrl/health"
Invoke-RestMethod $ServiceUrl
```

The health endpoint should return `{"status":"healthy"}`. The public IP can
change when ECS replaces the task.

## 4. Set up and run the chat backend

The chat backend uses the OpenAI API to translate requests into ECS changes.
It also uses your local AWS credential chain (for example, the profile
configured by `aws configure`) to make the changes. It is not deployed by
Terraform.

In a new PowerShell terminal:

```powershell
Set-Location .\ecs-chat-backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install fastapi uvicorn openai boto3 python-dotenv
```

Create `ecs-chat-backend\.env` locally with your API key:

```text
OPENAI_API_KEY=your-openai-api-key
```

Do not commit this file or share the key. Start the API:

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The Vite development server proxies `/api` requests to
`http://127.0.0.1:8000`.

## 5. Run the chat frontend

In another PowerShell terminal:

```powershell
Set-Location .\chat-frontend
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Keep
both the chat backend and frontend running while using the page.

The Vite proxy is for local development. This repository does not currently
include production hosting or a production proxy for the chat frontend/backend.

## Example chat requests

The assistant supports service desired-count and Fargate task CPU/memory
requests. Examples:

- `Scale the target service to 3 running tasks.`
- `Set the task CPU to 512 and memory to 1024 MiB.`
- `Change the task memory to 2048 MiB.`
- `Scale the service down to 1 task.`

Requests are sent to ECS as soon as the assistant interprets them; there is no
confirmation step. Choose CPU/memory combinations supported by AWS Fargate.
For example, 256 CPU units with 512 MiB, or 512 CPU units with 1024 MiB, are
valid combinations. ECS may reject unsupported values or combinations.

The assistant is intended for changes, not for querying the current deployment
status. An unclear or unrelated request should receive an error message rather
than an ECS update. A successful response means ECS accepted the update request;
it does not guarantee that the deployment has finished stabilizing.

## Local checks

Run the frontend lint and production build:

```powershell
Set-Location .\chat-frontend
npm run lint
npm run build
```

Validate Terraform without applying changes:

```powershell
Set-Location .\terraform
terraform fmt -check
terraform validate
```

## Cleanup

After you finish testing, remove the Terraform-managed AWS resources:

```powershell
Set-Location .\terraform
terraform destroy
```

Review the destruction plan before confirming. The ECR repository is configured
to allow Terraform to delete it along with its images.
