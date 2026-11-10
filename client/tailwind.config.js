const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: withAlpha('--bg'),
        panel: withAlpha('--panel'),
        raised: withAlpha('--raised'),
        line: withAlpha('--line'),
        fg: withAlpha('--fg'),
        muted: withAlpha('--muted'),
        accent: withAlpha('--accent'),
        'accent-fg': withAlpha('--accent-fg'),
        danger: withAlpha('--danger'),
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        slideIn: { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-in': 'fadeIn .18s ease-out',
        'slide-in': 'slideIn .22s ease-out',
      },
    },
  },
  plugins: [],
};
