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
