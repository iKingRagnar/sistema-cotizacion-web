import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          deep: 'rgb(2 6 23)',
          surface: 'rgb(15 23 42)',
          elevated: 'rgb(30 41 59)',
        },
        text: {
          DEFAULT: 'rgb(248 250 252)',
          soft: 'rgb(203 213 225)',
          muted: 'rgb(148 163 184)',
          dim: 'rgb(100 116 139)',
        },
        accent: {
          DEFAULT: 'rgb(59 130 246)',
          2: 'rgb(139 92 246)',
          3: 'rgb(6 182 212)',
        },
        success: 'rgb(34 197 94)',
        warning: 'rgb(245 158 11)',
        danger: 'rgb(239 68 68)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      transitionDuration: {
        fast: '120ms',
        normal: '200ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
