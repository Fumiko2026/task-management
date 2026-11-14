variable "region" {
  description = "AWS のリージョン(東京)"
  type        = string
  default     = "ap-northeast-1"
}

variable "instance_type" {
  description = "EC2 の種類。arm64 の Amazon Linux 2023 と組み合わせる"
  type        = string
  default     = "t4g.small"
}

variable "allowed_cidrs" {
  description = "HTTP(80)を許可する住所(自分の PC のグローバル IP/32)。空だと、外からは届かない"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.allowed_cidrs : can(cidrhost(c, 0))])
    error_message = "allowed_cidrs は CIDR(例: 203.0.113.10/32)で指定してください。"
  }
}

variable "db_engine_version" {
  description = "PostgreSQL のバージョン。開発(PostgreSQL 17)と、そろえる"
  type        = string
  default     = "17"
}

variable "db_instance_class" {
  description = "RDS のインスタンスの種類。学習用の最小の型"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS のディスク(GB)。PostgreSQL の gp3 の最小は 20"
  type        = number
  default     = 20
}
