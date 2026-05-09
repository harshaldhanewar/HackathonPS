import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // HackSys platform palette — dark observability theme
        background: {
          DEFAULT: '#0a0d14',
          card: '#111827',
          elevated: '#1a2035',
        },
        border: {
          DEFAULT: '#1f2937',
          subtle: '#111827',
        },
        primary: {
          DEFAULT: '#6366f1',
          hover: '#4f46e5',
          muted: '#6366f120',
        },
        severity: {
          critical: '#ef4444',
          high:     '#f97316',
          medium:   '#f59e0b',
          low:      '#22c55e',
        },
        status: {
          open:      '#3b82f6',
          analyzing: '#a855f7',
          resolved:  '#22c55e',
        },
        text: {
          primary:   '#f1f5f9',
          secondary: '#94a3b8',
          muted:     '#475569',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in':   'slideIn 0.3s ease-out',
        'fade-in':    'fadeIn 0.4s ease-out',
        'glow':       'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        slideIn: {
          '0%':   { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',      opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        glow: {
          '0%':   { boxShadow: '0 0 5px #6366f140' },
          '100%': { boxShadow: '0 0 20px #6366f180, 0 0 40px #6366f140' },
        },
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.875rem',
      },
    },
  },
  plugins: [],
};

export default config;
