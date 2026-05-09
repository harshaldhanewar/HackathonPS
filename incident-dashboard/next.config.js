/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the dashboard to call the backend API from the browser
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
