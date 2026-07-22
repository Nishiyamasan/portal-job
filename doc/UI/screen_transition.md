# portal-job 画面状態遷移図

## 1. 目的

本書は、Next.js App Router で実装される portal-job の画面遷移を、ログイン前後、ユーザー権限、店舗管理権限、管理者権限の観点から可視化する。

商用開発レベルのレビュー観点として、未ログイン時の遷移、認証後の遷移、権限不足時の戻り先、管理画面への到達条件を明確にする。

## 2. 全体画面遷移

```mermaid
flowchart TD
    entry["入口: /[locale]"]
    top["トップ /[locale]"]
    shopList["店舗一覧 /[locale]/shop"]
    shopDetail["店舗詳細 /[locale]/shop/[slug]"]
    jobs["求人一覧 /[locale]/jobs"]
    jobDetail["求人詳細 /[locale]/jobs/[id]"]
    contact["問い合わせ /[locale]/contact"]
    signin["サインイン /[locale]/signin"]
    reset["パスワードリセット /[locale]/reset-password"]

    profile["プロフィール /[locale]/profile"]
    jobSeeker["サポータープロフィール /[locale]/profile/job-seeker"]
    messages["会話一覧 /[locale]/messages"]
    chat["チャット /[locale]/chat/[shopId]/[userId]"]
    ownerApply["オーナー申請 /[locale]/onboarding/owner"]

    ownerHome["オーナーダッシュボード /[locale]/owner"]
    ownerEdit["店舗編集 /[locale]/owner/shops/[id]/edit"]
    ownerJobs["求人管理 /[locale]/owner/shops/[id]/jobs"]
    ownerApplications["応募管理 /[locale]/owner/shops/[id]/applications"]

    adminCreate["管理者店舗登録 /[locale]/admin"]
    adminShops["管理者店舗一覧 /[locale]/admin/shops"]
    adminShopDetail["店舗管理詳細 /[locale]/admin/shops/[id]"]
    memberSettings["メンバー公開設定 /[locale]/admin/shops/[id]/members/[memberId]/settings"]
    adminOwnerApps["オーナー申請管理 /[locale]/admin/owner-applications"]
    supervisor["スーパーバイザー /[locale]/n2-supervisor-portal-xyz"]

    entry --> top
    top --> shopList
    top --> shopDetail
    top --> jobs
    top --> contact
    shopList --> shopDetail
    jobs --> jobDetail

    shopDetail --> signin
    jobDetail --> signin
    signin --> reset
    signin --> profile

    profile --> jobSeeker
    profile --> messages
    messages --> chat
    shopDetail --> chat
    shopDetail --> ownerApply
    ownerApply --> ownerHome

    ownerHome --> ownerEdit
    ownerHome --> ownerJobs
    ownerHome --> ownerApplications

    adminCreate --> adminShops
    adminShops --> adminShopDetail
    adminShopDetail --> memberSettings
    adminCreate --> adminOwnerApps
    supervisor --> adminShopDetail
    supervisor --> adminOwnerApps
```

## 3. ログイン状態による画面遷移

```mermaid
stateDiagram-v2
    [*] --> Anonymous

    Anonymous --> PublicBrowsing: トップ/店舗/求人/問い合わせ
    PublicBrowsing --> Anonymous: 公開ページ回遊
    Anonymous --> SignIn: お気に入り/応募/メッセージ/プロフィール操作
    SignIn --> Authenticated: Supabase認証成功 + profile sync成功
    SignIn --> SignInError: 認証失敗
    SignInError --> SignIn: 再入力
    SignIn --> PasswordReset: パスワードリセット
    PasswordReset --> SignIn: 再ログイン

    Authenticated --> UserArea: profile取得成功
    UserArea --> Profile: プロフィール編集
    UserArea --> Favorites: お気に入り登録/解除
    UserArea --> JobApply: 求人応募
    UserArea --> Messages: メッセージ一覧/チャット
    UserArea --> OwnerApplication: オーナー申請
    UserArea --> SignOut: ログアウト
    SignOut --> Anonymous
```

## 4. 権限別の管理画面遷移

```mermaid
stateDiagram-v2
    [*] --> AuthenticatedUser

    AuthenticatedUser --> GeneralUser: role=user かつ 管理店舗なし
    AuthenticatedUser --> ShopManager: owner_id一致 または shop_members.can_manage_shop=true
    AuthenticatedUser --> AdminUser: role=admin
    AuthenticatedUser --> SupervisorUser: role=supervisor

    GeneralUser --> OwnerApplication: オーナー申請
    OwnerApplication --> PendingReview: 申請作成
    PendingReview --> ShopManager: 管理者承認後
    PendingReview --> GeneralUser: 却下/再申請

    ShopManager --> OwnerDashboard: /owner
    ShopManager --> ShopEdit: /owner/shops/[id]/edit
    ShopManager --> JobManagement: /owner/shops/[id]/jobs
    ShopManager --> ApplicationReview: /owner/shops/[id]/applications
    ShopManager --> AdminShopDetail: /admin/shops/[id]
    ShopManager --> MemberSettings: /admin/shops/[id]/members/[memberId]/settings

    AdminUser --> AdminCreateShop: /admin
    AdminUser --> AdminShopList: /admin/shops
    AdminUser --> OwnerApplicationReview: /admin/owner-applications
    AdminUser --> AdminShopDetail

    SupervisorUser --> SupervisorPortal: /n2-supervisor-portal-xyz
    SupervisorUser --> OwnerApplicationReview
    SupervisorUser --> AdminShopDetail
```

## 5. 代表画面ごとの遷移条件

| 遷移元 | 遷移先 | 条件 | 権限不足/異常時 |
| --- | --- | --- | --- |
| 店舗詳細 | チャット | ログイン済み、送信先ユーザー/店舗が存在 | サインインへ誘導、またはエラー通知 |
| 店舗詳細 | オーナー申請 | ログイン済み | 未ログインならサインイン |
| 求人詳細 | 求人応募 | ログイン済み、求人 status=open | サインイン誘導、受付終了表示 |
| プロフィール | サポータープロフィール | ログイン済み | サインインへ誘導 |
| オーナーダッシュボード | 店舗編集 | 対象店舗の owner または can_manage_shop | 403 表示または一覧へ戻す |
| オーナーダッシュボード | 求人管理 | 対象店舗の管理権限あり | 403 表示または一覧へ戻す |
| 管理者店舗一覧 | 店舗管理詳細 | admin/supervisor または対象店舗管理者 | 403 表示 |
| 店舗管理詳細 | メンバー公開設定 | 対象店舗管理権限あり | 403 表示 |
| 管理者トップ | オーナー申請管理 | admin/supervisor | 403 表示 |
| スーパーバイザー | 店舗承認 | supervisor/admin | 403 表示 |

## 6. 主要業務フロー別の画面遷移

### 6.1 店舗登録から公開まで

```mermaid
flowchart TD
    start["管理者/店舗管理者が店舗登録画面を開く"]
    input["店舗情報を入力"]
    validate["フロント入力検証"]
    submit["POST /api/v1/shops/admin または PUT /api/v1/shops/{id}"]
    pending["店舗は未承認/審査中"]
    review["管理者/スーパーバイザーが確認"]
    approve["承認"]
    public["公開店舗一覧/詳細に表示"]
    reject["差し戻し/非公開"]

    start --> input
    input --> validate
    validate -->|OK| submit
    validate -->|NG| input
    submit --> pending
    pending --> review
    review --> approve
    approve --> public
    review --> reject
    reject --> input
```

### 6.2 求人応募から応募管理まで

```mermaid
flowchart TD
    jobView["ユーザーが求人詳細を閲覧"]
    authCheck["ログイン確認"]
    apply["応募メッセージを入力"]
    submit["POST /api/v1/jobs/{jobId}/apply"]
    saved["応募 pending 保存"]
    ownerList["店舗管理者が応募一覧を確認"]
    review["ステータス更新"]
    result["reviewing/accepted/rejected"]

    jobView --> authCheck
    authCheck -->|未ログイン| signin["サインインへ"]
    authCheck -->|ログイン済み| apply
    apply --> submit
    submit --> saved
    saved --> ownerList
    ownerList --> review
    review --> result
```

## 7. 設計上の考慮事項（セキュリティやデータ整合性のリスク）

- 画面遷移上は管理画面リンクを非表示にできるが、API は直接呼び出される前提で必ずサーバー側認可を行う必要がある。
- ログイン直後に Supabase セッションはあるが `profiles` 同期に失敗した場合、画面はログイン済みでも API が 401/404 になるため、リトライまたは再同期導線が必要である。
- 権限不足時の UI は画面ごとにバラつくとユーザーが迷うため、403/404/未ログインの表示ポリシーを共通化する必要がある。
- 店舗登録/編集画面は管理者と店舗オーナーが共有するため、表示項目と送信可能項目を権限別に制限する必要がある。
- 求人応募、メッセージ、お気に入りはログイン状態の変化に影響されやすいため、送信直前にも session/token を再確認する必要がある。
- 多言語ルーティングでは locale 切替時に認証必須ページの戻り先が崩れないよう、redirect URL に locale を含める必要がある。
- Cloudflare Pages などフロント配信環境が変わる場合、API URL、CORS、Cookie、Supabase redirect URL の差分でログイン遷移が壊れる可能性がある。
