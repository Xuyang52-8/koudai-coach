/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* 《口袋私教》设计 token → 工具类
           bg-bg / bg-raised / bg-inset / border-line / border-line-strong
           text-1 / text-2 / text-3 / text-accent / bg-accent-dim … */
        bg: 'var(--bg)',
        raised: 'var(--bg-raised)',
        inset: 'var(--bg-inset)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        1: 'var(--text-1)',
        2: 'var(--text-2)',
        3: 'var(--text-3)',
        accent: {
          DEFAULT: 'var(--accent)',
          hi: 'var(--accent-hi)',
          dim: 'var(--accent-dim)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          dim: 'var(--warn-dim)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          dim: 'var(--danger-dim)',
        },
      },
      fontFamily: {
        display: [
          'Oswald',
          'PingFang SC',
          'Hiragino Sans GB',
          'Noto Sans SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
        body: ['Inter', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '4px',
        md: '4px',
        lg: '4px',
        xl: '12px',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.72' },
        },
      },
      animation: {
        flicker: 'flicker 150ms infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
