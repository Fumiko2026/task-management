# AWS へのデプロイ手順書(AWS CLI + Terraform)

| 項目 | 内容 |
|---|---|
| 状態 | 版 0.4(**無料の範囲に絞った最小構成**。Terraform は **EC2 まで**。S3・Budgets・RDS・アプリのデプロイは、Terraform の対象外) |
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
| 3 | Terraform の準備(`terraform init`。state はローカルに置く。S3 は作らない) | AI(人が内容を確認) |
| 4 | Terraform で、サーバーなどを作る(`plan` → 確認 → `apply`) | AI が `plan`、**人が確認して** `apply` |
| 5 | アプリをのせて、動作を確かめる | AI |
| 6 | 公開前のチェック(§7)・片づけ(§9) | 人と AI |

**コンソールを触るのは、段階 0 の、アカウント作成・MFA だけ**(アカウントそのものは、コマンドでは作れないため)。それ以降は、すべてコマンドです。

---

## 2. 構成案(おすすめ)

学習・個人利用なので、**安く、シンプルな構成**から始めます。

```
 あなたのパソコン ──(自分の IP だけ許可・HTTP 80)──▶ EC2(1台)
                                                      ├─ nginx    … いまは「Kokuban EC2 OK」の確認ページ。あとで画面(React)と /api の中継
                                                      ├─ backend  … あとで同じサーバーに載せる(Spring Boot)
                                                      └─ db       … いまは作らない。次の段階で検討(まずは EC2 の動作確認)
```

**いま Terraform で作るもの(EC2 まで):**

| 部品 | 内容 | 理由 |
|---|---|---|
| EC2(`t4g.small`、Amazon Linux 2023 arm64) | サーバー 1 台。フロントとバックエンドを、**同じサーバー**に載せる前提 | いちばん単純。無料枠・使うときだけ、に合わせやすい |
| デフォルト VPC | 新しい VPC は作らない。公開 IP は起動時に自動で付く | 部品を増やさない |
| セキュリティグループ | **自分の PC の IP だけ**から 80。SSH(22)は開けない | ログインが無いため。自分以外は届かない |
| SSM Session Manager | サーバーへの入り方。**SSH の鍵は作らない** | 鍵の管理が要らず、安全 |
| state(Terraform の記録) | **ローカル**(`infra/terraform.tfstate`)。S3 は作らない。Git には上げない | 部品を増やさない。一人で使うので、ロックも要らない |

**いま作らないもの:** S3(state 用を含む)、Budgets(予算は CLI で 1 回だけ作る。§6-2)、RDS、Elastic IP、ALB、NAT Gateway、ECR、CloudFront、Route 53。アプリの Docker イメージも、まだ載せない。

**進め方(順番):**
1. Terraform で EC2 を作り、自分の PC から `http://<公開 IP>/` が「Kokuban EC2 OK」になることを確かめる
2. 次に DB(RDS にするか、同じサーバーのコンテナにするか)を決めて足す
3. 最後に、フロントとバックエンドを同じサーバーへ載せる

使わないときは `terraform destroy` で消してよい(データも消える)。

**あとで本格的にするなら**(今は作らない): 画面を S3 + CloudFront、バックエンドを ECS(Fargate)または App Runner、DB を RDS に分ける。壊れにくく、運用は楽になりますが、**費用が上がり、部品が増えます**。

### アカウントの分け方(管理用と作業用)
AWS のアカウントは、1 つの「組織」の中に、複数持てます(アカウントを増やしても、**それだけでは費用はかかりません**。請求は、管理用にまとまります)。

| アカウント | 役割 | Kokuban のサーバーを作るか |
|---|---|---|
| 管理用(Management Account) | 組織・請求・ログインの設定をまとめる、大事なアカウント | **作らない** |
| AWS が自動で作ったもの(例: Identity Delegated Admin、Greenfield Adventures) | ログイン管理や見本用 | **触らない** |
| **作業用(Kokuban)** | Kokuban のサーバーなどを、Terraform で作る場所 | **ここに作る** |

**作業用アカウントを分ける理由:** AI がコマンドを実行するので、間違えたときの影響を、**そのアカウントの中だけ**に閉じ込めるためです。片づけも、アカウントごと閉じれば、すっきりします。

> **作業用アカウントを作る前の確認(未確認):** 組織の中の新しいアカウントに、**クレジットや無料の枠が使えるか**は、まだ確認できていません。管理用アカウントの「クレジット」の画面と、上のコマンドで確認してから決めます。使えない場合は、**管理用アカウントには作らず**、少額で済むことを確認したうえで、作業用アカウントを作ります。

作り方(管理用のログインで、一度だけ。メールアドレスは、**管理用とは別**のものが必要です。Gmail なら、`@` の前に `+kokuban` をつけた別名が、同じ受信箱に届くので使えます):
```
aws organizations create-account --account-name Kokuban --email <メールアドレス> --role-name OrganizationAccountAccessRole
aws organizations list-accounts --query 'Accounts[].{Name:Name,Id:Id,Status:Status}' --output table   # 作れたか確認
```
- 作ったアカウントへは、管理用のログインから、`OrganizationAccountAccessRole`(作成時に自動でできる役割)で入ります。Identity Center の割り当ては、要りません。
- **注意:** アカウントは、作るのは簡単でも、**閉じるのには制限があります**(閉じたあとも、しばらく残り、閉じられる数にも上限があります)。名前とメールアドレスは、決めてから作ります。

### 「無料」の正確な意味(2026 年 11 月に、AWS の公式ページで確認)
> 「請求がゼロ」を**約束する構成ではありません**。「クレジットの範囲で、少額に収まる構成」です。

| 項目 | 内容 |
|---|---|
| 新しいアカウントのクレジット | 最初に **$100**、さらに活動(使い方の課題)で **最大 $100**。[公式](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html) |
| **無料プラン**(Free plan) | **請求は発生しない**が、**6 か月、またはクレジットを使い切ると、アカウントが自動で閉じる**。使えるサービスも限られる |
| **組織(AWS Organizations)に入ると** | 無料プランは、**自動で有料プランに変わる**(公式に明記)。**いまのアカウントは組織(MainTeam)に入っているため、有料プランの可能性が高い**(下の確認方法) |
| **有料プラン**(Paid plan) | クレジットを使い切るまでは請求されない。**使い切ったあとは、通常の料金が請求される**(アカウントは閉じない) |
| EC2 `t4g.small` の無料トライアル | **2026 年末まで**(第三者の調査記事。[参考](https://dev.classmethod.jp/en/articles/ec2-t4g-small-free-tier-2026/))。**年が明けたあとは、通常料金**(目安: 起動しっぱなしで月 2,000 円前後) |
| ディスク(EBS)・公開 IPv4 | 課金の対象(クレジットで相殺される)。公開 IPv4 は EC2 で月 750 時間まで無料の枠があるが、条件は変わる |

**いまのプランの確認方法(読むだけ。`aws login` のあと):**
```
aws freetier get-account-plan-state --region us-east-1
```
Billing and Cost Management の「クレジット」の画面でも、**残りのクレジットと期限**が見られます。

**費用を抑えるやり方(この構成の前提):**
1. 使うときだけ作り、**終わったら `terraform destroy`**(§9)。
2. 作ったままにするときは、**使わない間は EC2 を停止**する(停止中は、サーバーの料金がかからない。ディスクの料金は、少しかかる)。
3. **予算アラート**(月 5 ドル)を、CLI で 1 回だけ作る(§6-2)。
4. CPU クレジットは `standard`(追加料金が出ない設定)にしてある(`infra/main.tf`)。

### 費用の目安(東京・概算。料金は変わるので、必ず公式で確認する)
| 項目 | 目安(月) |
|---|---|
| EC2 `t4g.small`(起動している時間だけ) | 有料なら 1 時間あたり数円(目安) |
| ディスク(EBS 8GB) | 起動中・残している間だけ |
| 公開 IPv4(自動割り当て。Elastic IP は使わない) | 起動している時間だけ |
| **合計** | **使う時間だけ。使わないときは destroy で止める** |

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
- **Terraform も動くことを確認ずみ**です(**AWS プロバイダは 6 系が必要**。`infra/versions.tf` は `~> 6.0`)(`provider "aws" { profile = "kokuban" }` で、アカウント番号を読む試験。何も作らず、費用もかからない)。`AWS_PROFILE` を見るので、別の設定は要りません。

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
| Terraform が `No valid credential sources found` で止まる(`aws login` はできているのに) | Terraform の **AWS プロバイダが古い(5 系)**。`aws login` の資格情報を読めるのは **6 系**。`infra/versions.tf` を `version = "~> 6.0"` にして `terraform init -upgrade` |
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
4. **予算の上限を作る**(AWS Budgets。月 5 ドルなど。超えそうなときにメールが届く)。**Terraform ではなく、CLI で 1 回だけ**作ります(§6-2)。
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
├─ main.tf                   # EC2、セキュリティグループ、IAM(RDS や Elastic IP は書かない)
├─ variables.tf              # 変更できる値(自分の IP、インスタンスの種類など)
├─ outputs.tf                # 作ったあとに表示する値(サーバーの住所など)
├─ versions.tf               # Terraform と AWS プロバイダのバージョン(state はローカル)
├─ terraform.tfvars.example  # 自分の値のひな形
└─ terraform.tfvars          # 自分の IP など。※ Git に上げない
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

### 6-2. state はローカルに置く。予算は CLI で作る
**state**(今 AWS に何があるかの記録)は、`infra/terraform.tfstate` に、自分のパソコンへ置きます(S3 は作りません)。
- 一人で、短い間だけ使うので、これで足ります。
- **Git には上げません**(`.gitignore` の `*.tfstate`)。**消したりなくしたりすると、Terraform が、作ったものを忘れてしまいます**(AWS にサーバーが残り、費用がかかり続けます)。**`terraform destroy` を終えるまで、残してください**。
- 万一なくしたときは、AWS のサーバー(EC2、セキュリティグループ、IAM の役割)を、コンソールではなく CLI で探して、手で消します。

**予算アラート(月 5 ドル)は、Terraform ではなく、CLI で 1 回だけ作ります**(Terraform は EC2 までにするため)。メールアドレスは、自分のものを入れます。
```
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws budgets create-budget --account-id "$ACCOUNT_ID" \
  --budget '{"BudgetName":"kokuban-monthly","BudgetLimit":{"Amount":"5","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
  --notifications-with-subscribers '[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80,"ThresholdType":"PERCENTAGE"},"Subscribers":[{"SubscriptionType":"EMAIL","Address":"<自分のメールアドレス>"}]}]'
```
> 予算は、最初の 2 つまで無料です。作る場所は、**サーバーを作るアカウント**(いま使っているプロファイルのアカウント)です。

### 6-3. 日常の流れ
```
cd infra
terraform init        # 初回、部品(プロバイダ)をダウンロードする
terraform fmt         # 書き方をそろえる
terraform validate    # 書き間違いが無いか検査する
terraform plan        # 何を作る・変える・消すかを表示(何も変えない) ← 人が読む
terraform apply       # plan どおりに作る(確認の入力が出る。人が yes と答える)
```

### 6-4. Terraform で作るもの(最初の版 = EC2 まで)
| 部品 | 内容 |
|---|---|
| `aws_instance` | EC2(`t4g.small`)。AMI は、AWS が公開している「最新の Amazon Linux 2023(arm64)」を、SSM のパラメータから取得する。CPU クレジットは `standard`。ディスクは gp3 8GB(暗号化)。起動時に Docker と nginx を入れ、確認用のページだけ出す |
| `aws_security_group` | 入ってくる通信: **自分の PC の IP だけ**から 80。出る通信: すべて可。**22(SSH)は作らない** |
| `aws_iam_role` + instance profile | EC2 が SSM で接続するための役割。`AmazonSSMManagedInstanceCore` を付ける |

**S3・Budgets・RDS・Elastic IP・DB のパスワード置き場は、Terraform では作らない。** DB は、EC2 の動作確認のあとに足す。

---

## 7. アプリをのせる(段階 5)と、公開の前のチェック

### 7-1. のせ方(案。**最後の段階**)
EC2 の動作確認が終わってから行う。フロントとバックエンドは、**同じ EC2** に載せる。
1. バックエンドを Docker イメージにする(`backend/Dockerfile`。Java 21 で `./mvnw package` した jar を動かす)。
2. 画面を `npm run build` して、nginx で配る(`frontend/dist`)。nginx は `/api` と `/actuator/health` を backend へ中継する。
3. サーバー上の `docker compose` で、nginx・backend・(決めた DB)を動かす。
4. サーバーへは、**SSM Session Manager**(`aws ssm start-session --target <インスタンス ID>`)で入る。SSH は使わない。
5. 自分の PC から確かめる: `curl http://<公開 IP>/` が確認ページ(のちほどアプリ)。他のネットワークからは届かない。

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
2. 【確認】いまのプラン・クレジットを確認し(§2)、作業用アカウントを作るかを決める。予算アラートを CLI で作る(§6-2)
3. 【Terraform の土台】`infra/`(state はローカル)、`terraform plan` が通る(EC2 まで。S3・Budgets・RDS は書かない)
4. 【サーバー】EC2・セキュリティグループ(自分の PC の IP だけ)・SSM を `apply` し、確認ページを見る
5. 【DB】RDS にするか、同じサーバーのコンテナにするかを決めて足す
6. 【コンテナ化】`backend/Dockerfile`、nginx、本番用の `docker-compose`、設定の分け方
7. 【デプロイ】同じサーバーにフロントとバックエンドをのせて確認
8. 【公開の前】ログイン、HTTPS、バックアップ、チェックリスト(§7-2)

各段階で、AI は「何をするか → `plan` → 人が確認 → `apply` → 確かめた結果」を報告します。

### AI(Claude Code)への頼み方の例
> `aws login --profile kokuban` でログインずみで、`AWS_PROFILE=kokuban` です。`docs/deploy-aws.md` の、Terraform の土台(§6)を進めてください。`infra/` に Terraform の土台を作り、`terraform plan` までを実行して、結果を、作る・変える・消すに分けて報告してください。`apply` は、私が確認してから指示します。

---

## 9. 片づけ(費用を止める)
- サーバーなどをすべて消す: `cd infra && terraform destroy`(**消えるものを、よく読んでから**。データも消える。先に、DB のバックアップを取る)。
- `infra/terraform.tfstate`(ローカルの記録)は、`destroy` が終わるまで消さない。終わったあとは、消して構わない。
- 予算アラートは、`aws budgets delete-budget --account-id <アカウント番号> --budget-name kokuban-monthly` で消せる(残しても、費用はかからない)。
- 請求のダッシュボードで、**翌日以降に、費用が増えていない**ことを確かめる。

---

## 10. 未決事項(ご相談)
| No. | 内容 | おすすめ |
|---|---|---|
| D-01 | 公開の範囲 | ログインができるまでは、**自分の PC の IP だけ**。スクールの講師に見せたい場合は、その人の IP を足す |
| D-02 | 独自ドメイン | 持っていなければ、まずは IP アドレスで動作確認。ログインを作る段階で、ドメインと HTTPS を用意する |
| D-03 | 月の予算の上限 | 5 ドル(超えそうなときにメール)。CLI で 1 回だけ作る(§6-2) |
| D-04 | 権限セット | 最初は `AdministratorAccess`(学習用)。サーバーが動いたら、絞る |
| D-05 | 構成 | まず EC2 1 台(フロントとバックエンドは同じサーバー)。RDS は EC2 の確認のあと |
| D-06 | 作業用アカウントのメールアドレス | 管理用とは別のアドレスが必要。Gmail の `+kokuban` の別名が使える(§2 の「アカウントの分け方」) |
| D-07 | 無料枠 | 利用者が確認済み。使うときだけ作り、終わったら消してよい |
