# ==========================================
# 1. ECR REPOSITORY (Docker Image Registry)
# ==========================================
resource "aws_ecr_repository" "app_repo" {
  name                 = "ecs-target-service"
  image_tag_mutability = "MUTABLE"
  force_delete        = true # Allows 'terraform destroy' to clean up ECR even if images exist
}

# ==========================================
# 2. NETWORKING (VPC & Public Subnet)
# ==========================================
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "ecs-demo-vpc" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true

  tags = { Name = "ecs-demo-public-subnet" }
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "ecs-demo-igw" }
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }
}

resource "aws_route_table_association" "public_assoc" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public_rt.id
}

# ==========================================
# 3. SECURITY GROUP (Firewall Rules)
# ==========================================
resource "aws_security_group" "ecs_sg" {
  name        = "ecs-target-service-sg"
  description = "Allow HTTP inbound traffic to container"
  vpc_id      = aws_vpc.main.id

  # Allow inbound HTTP requests on port 8080 (where FastAPI runs)
  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow container to initiate outbound traffic (e.g. pulling images, downloading updates)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ==========================================
# 4. ECS CLUSTER & TASK DEFINITION
# ==========================================
resource "aws_ecs_cluster" "cluster" {
  name = "demo-ecs-cluster"
}

resource "aws_ecs_task_definition" "task" {
  family                   = "target-service-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name      = "target-container"
    image     = "${aws_ecr_repository.app_repo.repository_url}:latest"
    essential = true
    portMappings = [{
      containerPort = 8080
      hostPort      = 8080
    }]
  }])
}

# ==========================================
# 5. ECS SERVICE (Fargate)
# ==========================================
resource "aws_ecs_service" "service" {
  name            = "target-service"
  cluster         = aws_ecs_cluster.cluster.id
  task_definition = aws_ecs_task_definition.task.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public.id]
    assign_public_ip = true
    security_groups  = [aws_security_group.ecs_sg.id]
  }

  depends_on = [aws_internet_gateway.gw]
}

# ==========================================
# OUTPUTS
# ==========================================
output "ecr_repository_url" {
  value       = aws_ecr_repository.app_repo.repository_url
  description = "The URL of the created Amazon ECR repository"
}


# Create the IAM Role for the ECS Task Execution
resource "aws_iam_role" "ecs_execution_role" {
  name = "ecs_execution_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# Attach the AWS managed policy to allow pulling from ECR and writing to CloudWatch
resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}