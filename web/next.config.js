/** @type {import('next').NextConfig} */
module.exports = {
  output: "standalone",
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};
