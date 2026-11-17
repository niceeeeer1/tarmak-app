import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { bg: 'var(--bg)', fg: 'var(--fg)', muted: 'var(--muted)', line: 'var(--line)', surface: 'var(--surface)' },
    },
  },
  plugins: [],
} satisfies Config;
