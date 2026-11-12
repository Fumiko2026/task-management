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

variable "budget_usd" {
  description = "月の予算の上限(ドル)。超えそうなときにメールする"
  type        = number
  default     = 5
}

variable "budget_email" {
  description = "予算の通知先。空なら予算は作らない"
  type        = string
  default     = ""
}
