data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# AWS が公開している、最新の Amazon Linux 2023(arm64)
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_security_group" "app" {
  name        = "kokuban-ec2"
  description = "Kokuban EC2. HTTP from owner PC only. No SSH."
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "kokuban-ec2"
  }
}

resource "aws_vpc_security_group_ingress_rule" "http_from_owner" {
  for_each = toset(var.allowed_cidrs)

  security_group_id = aws_security_group.app.id
  description       = "HTTP from owner PC only"
  cidr_ipv4         = each.value
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "all_ipv4" {
  security_group_id = aws_security_group.app.id
  description       = "Allow all outbound IPv4"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_iam_role" "ec2" {
  name = "kokuban-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = aws_iam_role.ec2.name
  role = aws_iam_role.ec2.name
}

resource "aws_instance" "app" {
  ami                         = data.aws_ssm_parameter.al2023.value
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.app.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = true

  credit_specification {
    cpu_credits = "standard"
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 8
    encrypted             = true
    delete_on_termination = true
  }

  # アプリのデプロイはしない。EC2 が起きたことと、自分の PC から 80 が届くことだけ確かめる。
  user_data = <<-EOF
    #!/bin/bash
    set -euxo pipefail
    dnf update -y
    dnf install -y docker nginx
    systemctl enable --now docker
    echo '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>Kokuban EC2</title></head><body><p>Kokuban EC2 OK</p></body></html>' > /usr/share/nginx/html/index.html
    systemctl enable --now nginx
  EOF

  user_data_replace_on_change = true

  # インスタンスプロファイルの権限が付く前に起動しないようにする
  depends_on = [aws_iam_role_policy_attachment.ssm]

  tags = {
    Name = "kokuban"
  }
}
