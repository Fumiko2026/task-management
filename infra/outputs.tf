output "account_id" {
  description = "いま使っている AWS アカウント番号"
  value       = data.aws_caller_identity.current.account_id
}

output "instance_id" {
  description = "EC2 の ID。SSM で入るときに使う"
  value       = aws_instance.app.id
}

output "public_ip" {
  description = "起動中の住所。止める・消すと変わる(Elastic IP は作っていない)"
  value       = aws_instance.app.public_ip
}

output "http_url" {
  description = "自分の PC のブラウザで開く先(セキュリティグループが許可した IP だけ)"
  value       = "http://${aws_instance.app.public_ip}/"
}

output "ssm_start_session" {
  description = "サーバーへ入るコマンド(SSH は使わない)"
  value       = "aws ssm start-session --target ${aws_instance.app.id} --region ${var.region}"
}

output "db_address" {
  description = "RDS の接続先(ホスト名)。外には公開していない。EC2 からだけ届く"
  value       = aws_db_instance.app.address
}

output "db_port" {
  description = "RDS のポート"
  value       = aws_db_instance.app.port
}

output "db_name" {
  description = "最初に作られる DB の名前"
  value       = aws_db_instance.app.db_name
}

output "db_secret_arn" {
  description = "RDS のパスワードが入っている Secrets Manager のシークレット(中身は、ここには出さない)"
  value       = aws_db_instance.app.master_user_secret[0].secret_arn
}
