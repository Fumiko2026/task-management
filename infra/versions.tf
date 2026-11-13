terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # state(今 AWS に何があるかの記録)は、ローカルの infra/terraform.tfstate に置く(S3 は使わない)。
  # *.tfstate は Git に上げない(.gitignore)。なくさないよう、使い終わるまで消さない。
}

provider "aws" {
  region = var.region
  # profile は書かない。使うプロファイルは、環境変数 AWS_PROFILE(例: export AWS_PROFILE=kokuban)で決める。
}
