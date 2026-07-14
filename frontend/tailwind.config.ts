/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e6fbff',
          100: '#b3f3ff',
          200: '#80ebff',
          300: '#4de3ff',
          400: '#1adaff',
          500: '#00d4ff',
          600: '#00a8cc',
          700: '#007d99',
          800: '#005166',
          900: '#002633',
        },
      },
      fontFamily: {
        sans: ['"Smiley Sans Web"', '"得意黑"', '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Microsoft YaHei UI"', 'system-ui', 'sans-serif'],
        display: ['"Smiley Sans Web"', '"得意黑"', '"PingFang SC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
    },
  },
  plugins: [],
};
