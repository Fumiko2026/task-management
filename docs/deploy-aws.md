# AWS へのデプロイ手順書(AWS CLI + Terraform)

| 項目 | 内容 |
|---|---|
| 状態 | 版 0.2(準備と認証は、実際に試して確認ずみ。Terraform のコードは、これから作る) |
| 目的 | Kokuban を AWS 上で動かす。**マネジメントコンソール(ブラウザの管理画面)は手で触らず**、コマンド(AWS CLI と Terraform)だけで作る。AI(Claude Code)にコマンドを実行させる |
| 対象 | 初心者。専門用語には一言の説明をつける |
| リージョン | 東京(`ap-northeast-1`) |

> **この手順書で、いちばん大事な注意(先に読む)**
> いまの Kokuban には、**ログインがありません**。インターネットに公開すると、URL を知った人は、だれでもカードを見たり、消したりできます。
> したがって、**ログインを作るまでは、自分の IP アドレスだけを許可して公開する**(または公開しない)ことにします(§7)。

---

## 1. 全体の流れ

| 段階 | 内容 | だれが |
|---|---|---|
| 0 | AWS のアカウントを作る・守る(ブラウザで、一度だけ) | **人** |
| 1 | AWS CLI と Terraform を Mac に入れる | 人(または AI) |
| 2 | 認証する(`aws login`。§4) | **人** |
| 2.5 | 作業用のアカウントを作る(§2 の「アカウントの分け方」) | AI(人が内容を確認) |
| 3 | Terraform の置き場(state 用の S3)を作る | AI(人が内容を確認) |
| 4 | Terraform で、サーバーなどを作る(`plan` → 確認 → `apply`) | AI が `plan`、**人が確認して** `apply` |
| 5 | アプリをのせて、動作を確かめる | AI |
| 6 | 公開前のチェック(§7)・片づけ(§9) | 人と AI |

**コンソールを触るのは、段階 0 の、アカウント作成・MFA だけ**(アカウントそのものは、コマンドでは作れないため)。それ以降は、すべてコマンドです。

---

## 2. 構成案(おすすめ)

学習・個人利用なので、**安く、シンプルな構成**から始めます。

```
 あなたのパソコン ──(自分の IP だけ許可)──▶ EC2(1台)
                                              ├─ nginx    … 画面(React)を配り、/api をバックエンドへ中継
                                              ├─ backend  … Spring Boot(コンテナ)
                                              └─ db       … PostgreSQL 17(コンテナ。データはディスクに保存)
```

| 部品 | 内容 | 理由 |
|---|---|---|
| EC2(`t4g.small`、Amazon Linux 2023) | サーバー 1 台。Docker Compose で、今の `docker-compose.yml` に近い形で動かす | いちばん安く、いまの作りに近い。仕組みを学びやすい |
| Elastic IP | 変わらない住所(IP アドレス) | 再起動しても、住所が変わらない |
| セキュリティグループ | 通信の許可の表。**自分の IP だけ** 80/443 を許可。SSH(22)は開けない | ログインが無いため |
| SSM Session Manager | サーバーへの接続方法。**SSH の鍵を作らずに**、AWS CLI で接続できる | 鍵の管理が要らず、安全 |
| SSM Parameter Store(SecureString) | DB のパスワードの保管場所 | パスワードを、コードや Git に置かない |
| S3(Terraform の state 用) | Terraform の記録(今何を作っているか)の保管場所 | 次回以降も、続きから作業できる |

**あとで本格的にするなら**(今は作らない): 画面を S3 + CloudFront、バックエンドを ECS(Fargate)または App Runner、DB を RDS に分ける。壊れにくく、運用は楽になりますが、**費用が上がり、部品が増えます**(目安として、月 1 万円前後から)。学習の段階では、EC2 1 台で十分です。

### アカウントの分け方(管理用と作業用)
AWS のアカウントは、1 つの「組織」の中に、複数持てます(アカウントを増やしても、**それだけでは費用はかかりません**。請求は、管理用にまとまります)。

| アカウント | 役割 | Kokuban のサーバーを作るか |
|---|---|---|
| 管理用(Management Account) | 組織・請求・ログインの設定をまとめる、大事なアカウント | **作らない** |
| AWS が自動で作ったもの(例: Identity Delegated Admin、Greenfield Adventures) | ログイン管理や見本用 | **触らない** |
| **作業用(Kokuban)** | Kokuban のサーバーなどを、Terraform で作る場所 | **ここに作る** |

**作業用アカウントを分ける理由:** AI がコマンドを実行するので、間違えたときの影響を、**そのアカウントの中だけ**に閉じ込めるためです。片づけも、アカウントごと閉じれば、すっきりします。

作り方(管理用のログインで、一度だけ。メールアドレスは、**管理用とは別**のものが必要です。Gmail なら、`@` の前に `+kokuban` をつけた別名が、同じ受信箱に届くので使えます):
```
aws organizations create-account --account-name Kokuban --email <メールアドレス> --role-name OrganizationAccountAccessRole
aws organizations list-accounts --query 'Accounts[].{Name:Name,Id:Id,Status:Status}' --output table   # 作れたか確認
```
- 作ったアカウントへは、管理用のログインから、`OrganizationAccountAccessRole`(作成時に自動でできる役割)で入ります。Identity Center の割り当ては、要りません。
- **注意:** アカウントは、作るのは簡単でも、**閉じるのには制限があります**(閉じたあとも、しばらく残り、閉じられる数にも上限があります)。名前とメールアドレスは、決めてから作ります。

### 費用の目安(東京・概算。料金は変わるので、必ず公式で確認する)
| 項目 | 目安(月) |
|---|---|
| EC2 `t4g.small`(つけっぱなし) | 約 2,000 円 |
| ディスク(EBS 20GB) | 約 300 円 |
| 公開 IPv4 アドレス(Elastic IP) | 約 600 円 |
| **合計** | **月 3,000 円前後** |

- 使わないときは `terraform destroy`(すべて消す)で、費用を止められます(§9)。
- 新しいアカウントには、無料枠がつく場合があります。条件は変わるので、AWS の公式ページで確認してください。
- 正確な計算は、AWS Pricing Calculator で行います。

---

## 3. 準備(段階 0・1)

### 3-1. AWS アカウントを作る・守る(ブラウザ、一度だけ)
1. AWS アカウントを作る(メールアドレス、クレジットカードが要ります)。このアカウントの最初のユーザーを**ルートユーザー**といい、**何でもできる最強の権限**を持ちます。**ふだんは使いません**。
2. **ルートユーザーに MFA(多要素認証。パスワードに加えて、スマホのアプリなどの 2 つ目の確認)を設定する。**
3. 請求の通知を有効にする(請求ダッシュボードで、請求アラートの設定)。
4. ルートユーザーのパスワードと MFA は、パスワード管理アプリなど、安全な場所に保管する。

### 3-2. (代替の方法)日常用のユーザーを作る(IAM Identity Center。ブラウザ、一度だけ)
> **今回は、この方法を使わず、§4 の `aws login` で進めました。** 次の場合に、この方法を使います: `aws login` が使えない、複数の人で使う、など。
**IAM Identity Center**(以前の名前は AWS SSO)は、**一時的な資格情報**(数時間で切れる鍵)で AWS CLI を使えるようにする仕組みです。**長期のアクセスキー(消えない鍵)を作らずに済む**ので、いまの標準の方法です。

1. IAM Identity Center を有効にする(**組織インスタンス**で有効にする。「アカウントインスタンス」では、AWS アカウントへの割り当てができません)。
2. ユーザーを 1 人作る(自分用。メールアドレスで招待が届く)。**このユーザーにも MFA を設定する。**
3. 権限セット(どこまでできるか)を作る。
   - 学習中は `AdministratorAccess` でも構いません。ただし、**慣れたら、EC2・S3・SSM・IAM(必要な範囲)だけに絞る**(§5)。
4. 自分のアカウントに、そのユーザー + 権限セットを**割り当てる**。**これを忘れると、`aws configure sso` で `No AWS accounts are available to you` と出ます**(ユーザーを作っただけでは、アカウントを使う権限は、つきません)。
5. 画面に出る **「AWS アクセスポータルの URL」**(`https://xxxx.awsapps.com/start`)を控える。次の §4 で使います。

### 3-3. Mac に道具を入れる(段階 1)
お使いの Mac は Apple Silicon(arm64)で、Homebrew が入っています。
```
brew install awscli                              # AWS CLI v2
brew tap hashicorp/tap
brew install hashicorp/tap/terraform             # Terraform(公式の配布元から)
brew install --cask session-manager-plugin       # サーバーへ接続する部品(SSM)※下の注意
```
確認:
```
aws --version
terraform version
```
> `brew install terraform` では、古いバージョンが入ることがあります。上のように、HashiCorp の配布元から入れます。
> `session-manager-plugin` のインストールでは、**Mac のログインパスワード**を聞かれます。AI は、パスワードを扱わないので、**自分のターミナルで**実行してください(サーバーができるまでは、不要です)。
> 確認ずみのバージョン: AWS CLI 2.40.0、Terraform 1.17.1(Apple Silicon)。

---

## 4. 認証する(段階 2)

### 4-1. ログインする(`aws login`。おすすめ)
**`aws login`** は、ブラウザの管理画面と同じログインで、AWS CLI を使えるようにします(資格情報は、数時間で切れる一時的なものです)。長期のアクセスキーは、作りません。Google などで、管理画面にサインインしている場合も使えます。
```
aws login --profile kokuban
```
聞かれる内容と、答え方:
| 場面 | 答え |
|---|---|
| `AWS Region [us-east-1]:` | **`ap-northeast-1`** と**自分で入力**して Enter(`[ ]` の中は、初期値です) |
| ブラウザで、サインインするアカウントを選ぶ画面 | **「Account: root」と書かれていない方**を選ぶ(権限つきの役割のもの)。**ルートは選ばない** |
| ブラウザの確認文(「AWS CLI などが認証情報を使うことを許可」) | 自分のパソコンの CLI への許可なので、進めてよい |
| 成功のあとの `Configure AWS skills and the AWS MCP server for your AI coding agent(s)? [y/n/never]` | **`n`**(AI ツールの設定には、いまは手を加えない) |

成功すると、`Updated profile kokuban to use arn:aws:sts::…:assumed-role/… credentials.` と出ます。

### 4-2. ふだんのログインと確認(作業を始めるたびに)
```
aws login --profile kokuban              # 切れていたら、もう一度ログイン(数時間で切れる)
export AWS_PROFILE=kokuban               # このターミナルでは、このプロファイルを使う
aws sts get-caller-identity              # 「自分は誰か」を表示。アカウント番号が出れば成功
```
- `aws sts get-caller-identity` の結果に、**自分のアカウント番号**と、**ルートではなく、役割(`assumed-role/…`)**が出ることを、毎回確かめる。
- **Terraform も動くことを確認ずみ**です(`provider "aws" { profile = "kokuban" }` で、アカウント番号を読む試験。何も作らず、費用もかからない)。`AWS_PROFILE` を見るので、別の設定は要りません。

### 4-2b. (代替)`aws configure sso`(IAM Identity Center を使う場合)
§3-2 の準備ができているときだけ使えます。
```
aws configure sso
aws sso login --profile kokuban
```
| 質問 | 答え |
|---|---|
| SSO session name | `kokuban`(好きな名前) |
| SSO start URL | Identity Center の「AWS access portal URL」 |
| SSO region | **Identity Center を作ったリージョン**(`us-east-1` のことが多い) |
| registration scopes | そのまま Enter |
| アカウント・ロール | 割り当てた、自分のアカウントと権限セット |
| default client Region | `ap-northeast-1` |
| default output format | `json` |
| profile name | `kokuban` |

### 4-2c. つまずいたとき(実際にあったこと)
| 症状 | 原因と対処 |
|---|---|
| `No AWS accounts are available to you` | Identity Center の**ユーザーに、アカウントが割り当てられていない**。割り当てるか、`aws login`(§4-1)を使う |
| アクセスポータルに「AWS アカウントを持っていません」と出る | 同上。**検索欄にメールアドレスが自動入力されて、0 件に見える**こともある(×で消して確かめる) |
| 左のメニューに「マルチアカウント権限(AWS アカウント・権限セット)」が無い | 「アカウントインスタンス」で作った、または委任された管理者が設定されている。無理に直さず、`aws login` を使う |
| `The config profile (kokuban) could not be found` | まだ設定が終わっていない。`aws login --profile kokuban` を最後まで実行する |
| 質問の入力欄に、**コマンドを貼り付けてしまった**(`Invalid response` と出る) | 質問に答える途中で、別のコマンドを貼らない。`Control + C` で止めて、やり直す |
| `AWS Region [us-east-1]:` で止まる | エラーではない。`ap-northeast-1` と入力する |
| Cursor の「問題」に、`schemastore.org からスキーマを読み込めません` と出る | エディタの警告。AWS とは無関係なので、無視してよい |
| 「Account: root」と書かれたログインの選択肢 | ルートユーザー。**CLI には使わない**。使い終わったら、ブラウザからサインアウトする |

### 4-3. やってはいけないこと
- **ルートユーザーの資格情報で、CLI を使わない。**
- **長期のアクセスキー(`AKIA…`)を作らない。** 作ってしまったら、すぐ無効にして削除する。
- アクセスキー、パスワード、`terraform.tfstate`(中に秘密が入ることがある)、`*.tfvars` を、**Git に上げない**(§6 の `.gitignore`)。
- 資格情報を、チャット・スクリーンショット・AI への入力に**貼らない**。

---

## 5. AI(Claude Code)に任せるときの安全のルール

AI は便利ですが、**権限が大きいほど、間違いの被害も大きく**なります。次のルールを守ります。

1. **`terraform plan` は AI がしてよい。`terraform apply` と `destroy` は、人が `plan` の結果を読んでから。** `-auto-approve` は付けない。
   - `plan` は「これから何を作る・消すか」の一覧で、何も変えません。**「destroy(消す)」や「replace(作り直す)」が含まれていないか**を、必ず読みます。
2. AI に渡すのは、**`AWS_PROFILE=kokuban` だけ**。アクセスキーは渡さない(そもそも作らない)。
3. 権限は、**必要な範囲に、だんだん絞る**(最初は広くても、慣れたら絞る)。
4. **予算の上限を作る**(AWS Budgets。月 3,000〜5,000 円など。超えそうなときにメールが届く)。Terraform の `aws_budgets_budget` で作れます。
5. Claude Code の許可設定(`.claude/settings.json`)で、**確認なしに実行してよいコマンド**と、**必ず確認するコマンド**を分ける。
   - 確認なしでよい(読むだけ): `aws sts get-caller-identity`、`terraform fmt`、`terraform validate`、`terraform plan`、`aws ... describe-*` / `list-*`。
   - **必ず確認する**: `terraform apply`、`terraform destroy`、`aws ... delete-*`、`aws iam ...`、`aws s3 rm`。
6. **何を作ったか、いくらかかりそうかを、AI に毎回報告させる。** 使い終わったら、片づける(§9)。
7. 変更は、これまでと同じく、**イシュー → ブランチ → PR**(`CLAUDE.md`)。Terraform のコードは、PR で確認してから `main` へ。

---

## 6. Terraform の進め方(段階 3・4)

### 6-1. 置き場所とファイル(案)
```
infra/
├─ main.tf          # EC2、セキュリティグループ、Elastic IP、IAM など
├─ variables.tf     # 変更できる値(自分の IP、インスタンスの種類など)
├─ outputs.tf       # 作ったあとに表示する値(サーバーの住所など)
├─ versions.tf      # Terraform と AWS プロバイダのバージョン、state の置き場所
└─ terraform.tfvars # 自分の値(例: 自分の IP)。※ Git に上げない
```
**`.gitignore` に追加する**(このイシューで追加ずみ):
```
# Terraform
.terraform/
*.tfstate
*.tfstate.*
*.tfvars
crash.log
```
`.terraform.lock.hcl`(部品のバージョンの記録)は、**Git に上げる**。

### 6-2. state の置き場(S3)を、先に作る
Terraform の **state**(今 AWS に何があるかの記録)を、自分のパソコンだけに置くと、なくしたときに困ります。**S3 に置き**、バージョンを残し、暗号化し、公開しないようにします。
```
# バケット名は、世界で 1 つだけの名前にする(例: kokuban-tfstate-<アカウント番号>)
aws s3api create-bucket --bucket <バケット名> --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1
aws s3api put-bucket-versioning --bucket <バケット名> --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket <バケット名> \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket <バケット名> \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```
`versions.tf` に、この場所を書きます(Terraform 1.10 以降は、S3 だけで「同時に 2 人が実行しない」ための鍵(ロック)も使えます)。
```hcl
terraform {
  required_version = ">= 1.10"
  backend "s3" {
    bucket       = "<バケット名>"
    key          = "kokuban/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
    encrypt      = true
  }
}
```
> この state 用バケットだけは、Terraform の管理の外(コマンドで直接)で作ります。**`terraform destroy` で消えない**ように、別にしておくためです。

### 6-3. 日常の流れ
```
cd infra
terraform init        # 初回、部品(プロバイダ)をダウンロードして、state の置き場につなぐ
terraform fmt         # 書き方をそろえる
terraform validate    # 書き間違いが無いか検査する
terraform plan        # 何を作る・変える・消すかを表示(何も変えない) ← 人が読む
terraform apply       # plan どおりに作る(確認の入力が出る。人が yes と答える)
```

### 6-4. Terraform で作るもの(最初の版)
| 部品 | 内容 |
|---|---|
| `aws_instance` | EC2(`t4g.small`)。AMI は、AWS が公開している「最新の Amazon Linux 2023(arm64)」を、SSM のパラメータから取得する |
| `aws_security_group` | 入ってくる通信: **自分の IP だけ**から 80(後で 443)。出る通信: すべて可。**22(SSH)は作らない** |
| `aws_eip` | 変わらない IP アドレス |
| `aws_iam_role` + instance profile | EC2 が、SSM(接続)と Parameter Store(パスワード)を使うための役割。`AmazonSSMManagedInstanceCore` を付ける |
| `aws_ssm_parameter`(SecureString) | DB のパスワード。値は、`terraform.tfvars` ではなく、コマンドで入れる(下記) |
| `aws_budgets_budget` | 予算の上限と、メール通知 |

DB のパスワードは、Terraform のコードに値を書かず、先にコマンドで入れます。
```
aws ssm put-parameter --name /kokuban/db_password --type SecureString --value '<強いパスワード>'
```
> コマンドの履歴にパスワードが残ります。入れたら、`history` から消すか、パスワード管理アプリで生成した使い捨ての値にします。Terraform で作る場合も、state に値が入る点に注意が要ります(state は暗号化した S3 に置く)。

---

## 7. アプリをのせる(段階 5)と、公開の前のチェック

### 7-1. のせ方(案)
1. バックエンドを Docker イメージにする(`backend/Dockerfile`。Java 21 で `./mvnw package` した jar を動かす)。
2. 画面を `npm run build` して、nginx で配る(`frontend/dist`)。nginx は `/api` と `/actuator/health` を backend へ中継する。
3. サーバー上の `docker compose` で、nginx・backend・db を動かす。
4. サーバーへは、**SSM Session Manager**(`aws ssm start-session --target <インスタンス ID>`)で入る。SSH は使わない。
5. 確かめる: `curl http://<Elastic IP>/actuator/health` が `{"status":"UP"}`。ブラウザで、ボードが出る。

**守ること(`CLAUDE.md` の「公開の範囲」との関係)**
- DB(5432)は、**コンテナの中の通信だけ**にする(`ports:` で、サーバーの外に出さない)。
- backend(8080)も、**外に出さない**。外から入れるのは、nginx の 80/443 だけ。
- コンテナの中で、backend が待ち受ける住所は、`127.0.0.1` ではなく `0.0.0.0`(コンテナの中の別の部品から届くため)にする必要があります。**その代わり、`ports:` で外へ公開しない**ことで、守ります。本番用の設定(プロファイル)を分けて、ここだけ変える。

### 7-2. 公開の前のチェックリスト
- [ ] **ログインを作った**(M-06 の決定が先)。作るまでは、**自分の IP だけ**を許可する。IP が変わったら、`terraform.tfvars` を直して `apply`
- [ ] **HTTPS にした**(独自ドメイン + 証明書。Caddy や、CloudFront + ACM など)。ログインを作ったら、HTTPS は必須
- [ ] DB のバックアップ(`pg_dump` を毎日 S3 へ、または EBS のスナップショット)。**復元の練習をしておく**
- [ ] 予算の上限(Budgets)と通知
- [ ] 22(SSH)も、5432、8080 も、外から届かない(`nmap` などで確かめる)
- [ ] `terraform destroy` で、全部消せる(練習しておく)
- [ ] パスワードなどの秘密が、Git・イメージ・ログに入っていない

---

## 8. 進め方(イシューの分け方・案)
1. 【準備】アカウント・MFA・道具・`aws login`(この手順書の §3・§4)← **まず人が行う(完了)**
2. 【作業用アカウント】`Kokuban` アカウントを作り、予算の上限(Budgets)を作る(§2)
3. 【Terraform の土台】`infra/`、state 用 S3、`.gitignore`、`terraform plan` が通る
4. 【サーバー】EC2・セキュリティグループ(自分の IP だけ)・SSM・Budgets を `apply`
5. 【コンテナ化】`backend/Dockerfile`、nginx、本番用の `docker-compose`、設定の分け方
6. 【デプロイ】サーバーへのせて、`/actuator/health` と画面を確認
7. 【公開の前】ログイン、HTTPS、バックアップ、チェックリスト(§7-2)

各段階で、AI は「何をするか → `plan` → 人が確認 → `apply` → 確かめた結果」を報告します。

### AI(Claude Code)への頼み方の例
> `aws login --profile kokuban` でログインずみで、`AWS_PROFILE=kokuban` です。`docs/deploy-aws.md` の、Terraform の土台(§6)を進めてください。`infra/` に Terraform の土台を作り、`terraform plan` までを実行して、結果を、作る・変える・消すに分けて報告してください。`apply` は、私が確認してから指示します。

---

## 9. 片づけ(費用を止める)
- サーバーなどをすべて消す: `cd infra && terraform destroy`(**消えるものを、よく読んでから**。データも消える。先に、DB のバックアップを取る)。
- state 用の S3 バケットは、`destroy` では消えない。不要になったら、中身(全バージョン)を空にしてから、コマンドで消す。
- 請求のダッシュボードで、**翌日以降に、費用が増えていない**ことを確かめる。

---

## 10. 未決事項(ご相談)
| No. | 内容 | おすすめ |
|---|---|---|
| D-01 | 公開の範囲 | ログインができるまでは、**自分の IP だけ**。スクールの講師に見せたい場合は、その人の IP を足すか、一時的に公開して、すぐ止める |
| D-02 | 独自ドメイン | 持っていなければ、まずは IP アドレスで動作確認。ログインを作る段階で、ドメインと HTTPS を用意する |
| D-03 | 月の予算の上限 | 5,000 円(超えそうなときにメール) |
| D-04 | 権限セット | 最初は `AdministratorAccess`(学習用)。サーバーが動いたら、絞る |
| D-05 | 構成 | まず EC2 1 台。慣れたら、画面を S3 + CloudFront、DB を RDS に分けるか検討 |
| D-06 | 作業用アカウントのメールアドレス | 管理用とは別のアドレスが必要。Gmail の `+kokuban` の別名が使える(§2 の「アカウントの分け方」) |
