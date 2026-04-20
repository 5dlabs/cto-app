/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"SF Pro Text"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          950: '#07070a',
          900: '#0b0b10',
          850: '#101018',
          800: '#16161f',
          750: '#1c1c27',
          700: '#24242f',
          600: '#363646',
          500: '#4e4e60',
          400: '#73738a',
          300: '#9d9daf',
          200: '#c7c7d2',
          100: '#e8e8ee',
        },
        accent: {
          DEFAULT: '#7c6aff',
          soft: '#a195ff',
          glow: '#5a4bff',
        },
        signal: {
          ok: '#4ade80',
          warn: '#fbbf24',
          err: '#f87171',
          info: '#60a5fa',
        },
      },
      letterSpacing: {
        tightest: '-0.03em',
        caps: '0.14em',
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(255,255,255,0.04)',
        panel: '0 24px 48px -24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
      },
      backgroundImage: {
        'grid-fade':
          'radial-gradient(ellipse at top, rgba(124,106,255,0.08), transparent 60%)',
      },
    },
  },
  plugins: [],
};
