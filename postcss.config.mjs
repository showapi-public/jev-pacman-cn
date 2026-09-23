/**
 * Tailwind v4 runs as a PostCSS plugin. Next 16 picks this file up on its own;
 * there is no tailwind.config.js any more — the theme lives in app/globals.css.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
