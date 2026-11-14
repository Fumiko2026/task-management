# RDS(PostgreSQL 17)。学習用の最小構成。
# 外には公開せず、EC2(aws_security_group.app)からの 5432 番だけを許可する。

# デフォルト VPC の、すべてのサブネット(RDS は、2 つ以上の AZ にまたがるサブネットが必要)
data "aws_subnets" "all_default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_db_subnet_group" "app" {
  name       = "kokuban-db"
  subnet_ids = data.aws_subnets.all_default.ids

  tags = {
    Name = "kokuban-db"
  }
}

# RDS 用のセキュリティグループ。入り口は、EC2 のセキュリティグループからの 5432 だけ。
# (IP アドレスでの許可は書かない。自分の PC や、ほかの場所からは届かない)
resource "aws_security_group" "db" {
  name        = "kokuban-db"
  description = "Kokuban RDS. PostgreSQL (5432) from the EC2 security group only."
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "kokuban-db"
  }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL from the app EC2 only"
}

resource "aws_db_instance" "app" {
  identifier = "kokuban-db"

  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "kokuban"
  username = "kokuban"

  # パスワードは、コードにも state にも書かない。RDS が作って、Secrets Manager に保管する。
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.app.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = 1
  auto_minor_version_upgrade = true
  apply_immediately          = true

  # 学習用: terraform destroy で、そのまま消せるようにする(データも消える)
  deletion_protection = false
  skip_final_snapshot = true

  tags = {
    Name = "kokuban-db"
  }
}

# EC2 が、RDS のパスワード(Secrets Manager のシークレット)を読むための権限。
# 読めるのは、この RDS のシークレット 1 つだけ。
resource "aws_iam_role_policy" "read_db_secret" {
  name = "read-db-secret"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_db_instance.app.master_user_secret[0].secret_arn
      }
    ]
  })
}
