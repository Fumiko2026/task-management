terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.100"
    }
  }

  # バケットは infra/bootstrap-state.sh で先に作る(terraform destroy では消さない)。
  backend "s3" {
    bucket       = "kokuban-tfstate-973724508368"
    key          = "kokuban/terraform.tfstate"
    region       = "ap-northeast-1"
    profile      = "kokuban"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region  = var.region
  profile = "kokuban"
}

# Budgets の API は us-east-1
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = "kokuban"
}
