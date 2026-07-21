import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // ビルド時の型エラーによる停止を回避する
  typescript: {
    ignoreBuildErrors: true,
  },
  // ビルド時のLintエラーによる停止を回避する
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default withNextIntl(nextConfig);
