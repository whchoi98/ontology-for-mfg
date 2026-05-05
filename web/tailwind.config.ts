import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-pretendard)', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f5f7fb',
          100: '#e8edf6',
          500: '#3b5bdb',
          600: '#2f49b2',
          900: '#1a2447',
        },
        ink: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        accent: {
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        wow: '#ff6b35',
      },
      keyframes: {
        pulse_soft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'pulse-soft': 'pulse_soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
