terraform {
  backend "pg" {
    # 接続文字列は環境変数 PG_CONN_STR から注入されます
  }

  required_providers {
    render = {
      source  = "render-oss/render"
      version = "~> 1.8.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "render" {
  # APIキーとオーナーIDは環境変数 RENDER_API_KEY, RENDER_OWNER_ID から読み込まれます
}

provider "cloudflare" {
  # APIトークンは環境変数 CLOUDFLARE_API_TOKEN から読み込まれます
}

# input variables for secure secrets management (No hardcoded values)
variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare Zone ID (Optional - only used when custom domain is set)"
  default     = ""
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare Account ID (Required for Cloudflare Pages)"
  default     = ""
}

variable "supabase_url" {
  type        = string
  description = "Supabase Project URL"
}

variable "supabase_anon_key" {
  type        = string
  description = "Supabase Anonymous Key"
  sensitive   = true
}

variable "cloudinary_api_key" {
  type        = string
  description = "Cloudinary API Key"
  sensitive   = true
}

variable "database_url" {
  type        = string
  description = "Database URL for Go API"
  sensitive   = true
}

variable "supabase_jwt_secret" {
  type        = string
  description = "Supabase JWT Secret"
  sensitive   = true
}

variable "cloudinary_api_secret" {
  type        = string
  description = "Cloudinary API Secret"
  sensitive   = true
}

variable "vapid_public_key" {
  type        = string
  description = "VAPID Public Key for WebPush"
  sensitive   = true
}

variable "vapid_private_key" {
  type        = string
  description = "VAPID Private Key for WebPush"
  sensitive   = true
}

# Next.js Frontend on Cloudflare Pages (デフォルトドメイン: portal-job-frontend.pages.dev を使用)
resource "cloudflare_pages_project" "frontend" {
  count             = var.cloudflare_account_id != "" ? 1 : 0
  account_id        = var.cloudflare_account_id
  name              = "portal-job-frontend"
  production_branch = "main"

  source {
    type = "github"
    config {
      owner               = "Nishiyamasan"
      repo_name           = "portal-job"
      production_branch   = "main"
      pr_comments_enabled = true
      deployments_enabled = true
    }
  }

  build_config {
    build_command   = "npx --legacy-peer-deps @cloudflare/next-on-pages@1"
    destination_dir = ".vercel/output/static"
  }

  deployment_configs {
    production {
      compatibility_flags = ["nodejs_compat"]
      environment_variables = {
        "NODE_ENV"                          = "production"
        "NEXT_PUBLIC_SITE_URL"              = "https://portal-job-frontend.pages.dev"
        "NEXT_PUBLIC_API_URL"               = "https://portal-job-go-api.onrender.com"
        "NEXT_PUBLIC_GO_API_URL"            = "https://portal-job-go-api.onrender.com"
        "NEXT_PUBLIC_PUBLIC_READ_API_URL"   = "https://portal-job-go-api.onrender.com"
        "NEXT_PUBLIC_SUPABASE_URL"          = var.supabase_url
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"     = var.supabase_anon_key
        "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME" = "du4iobijv"
        "NEXT_PUBLIC_CLOUDINARY_API_KEY"    = var.cloudinary_api_key
      }
    }
    preview {
      compatibility_flags = ["nodejs_compat"]
      environment_variables = {
        "NODE_ENV"                          = "development"
        "NEXT_PUBLIC_SITE_URL"              = "https://portal-job-frontend.pages.dev"
        "NEXT_PUBLIC_API_URL"               = "https://portal-job-go-api.onrender.com"
        "NEXT_PUBLIC_GO_API_URL"            = "https://portal-job-go-api.onrender.com"
        "NEXT_PUBLIC_PUBLIC_READ_API_URL"   = "https://portal-job-go-api.onrender.com"
        "NEXT_PUBLIC_SUPABASE_URL"          = var.supabase_url
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"     = var.supabase_anon_key
        "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME" = "du4iobijv"
        "NEXT_PUBLIC_CLOUDINARY_API_KEY"    = var.cloudinary_api_key
      }
    }
  }
}

# Go API Service on Render (デフォルトドメイン: portal-job-go-api.onrender.com を使用)
resource "render_web_service" "go_api" {
  name          = "portal-job-go-api"
  plan          = "free"
  region        = "singapore"
  start_command = "./main"

  runtime_source = {
    native_runtime = {
      auto_deploy   = true
      branch        = "main"
      build_command = "cd go-api && go build -o ../main cmd/api/main.go"
      build_filter = {
        paths = ["go-api/**"]
      }
      repo_url = "https://github.com/Nishiyamasan/portal-job"
      runtime  = "go"
    }
  }

  env_vars = {
    "PORT" = {
      value = "10001"
    }
    "DATABASE_URL" = {
      value = var.database_url
    }
    "ALLOWED_ORIGINS" = {
      value = "https://portal-job-frontend.pages.dev,http://localhost:3000"
    }
    "SUPABASE_URL" = {
      value = var.supabase_url
    }
    "SUPABASE_JWKS_URL" = {
      value = "${var.supabase_url}/auth/v1/.well-known/jwks.json"
    }
    "SUPABASE_JWT_SECRET" = {
      value = var.supabase_jwt_secret
    }
    "CLOUDINARY_CLOUD_NAME" = {
      value = "du4iobijv"
    }
    "CLOUDINARY_API_KEY" = {
      value = var.cloudinary_api_key
    }
    "CLOUDINARY_API_SECRET" = {
      value = var.cloudinary_api_secret
    }
    "VAPID_PUBLIC_KEY" = {
      value = var.vapid_public_key
    }
    "VAPID_PRIVATE_KEY" = {
      value = var.vapid_private_key
    }
    "VAPID_SUBJECT" = {
      value = "mailto:admin@portal-job.com"
    }
  }
}

# Cloudflare DNS records (カスタムドメインがある場合のみ動作)
resource "cloudflare_record" "frontend_cname" {
  count           = var.cloudflare_zone_id != "" ? 1 : 0
  zone_id         = var.cloudflare_zone_id
  name            = "@"
  content         = "portal-job-frontend.pages.dev"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "api_cname" {
  count           = var.cloudflare_zone_id != "" ? 1 : 0
  zone_id         = var.cloudflare_zone_id
  name            = "api"
  content         = "portal-job-go-api.onrender.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}
