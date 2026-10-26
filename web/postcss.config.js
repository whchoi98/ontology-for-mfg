// Tailwind 4 ships its own PostCSS plugin and does vendor prefixing itself
// (Lightning CSS), so autoprefixer is no longer needed.
module.exports = { plugins: { '@tailwindcss/postcss': {} } };
