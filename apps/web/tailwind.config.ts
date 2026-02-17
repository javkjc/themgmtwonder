import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Monochrome scale (pure grays)
        mono: {
          '0': '#000000',
          '50': '#111111',
          '100': '#1a1a1a',
          '200': '#262626',
          '300': '#404040',
          '400': '#525252',
          '500': '#737373',
          '600': '#a3a3a3',
          '700': '#d4d4d4',
          '800': '#e5e5e5',
          '900': '#f5f5f5',
          '950': '#fafafa',
          '1000': '#ffffff',
        },
        // Coral accent scale
        coral: {
          '50': '#FFF1F2',
          '100': '#FFE4E6',
          '200': '#FECDD3',
          '300': '#FDA4AF',
          '400': '#FB7185',
          '500': '#F43F5E',
          '600': '#E11D48',
          '700': '#BE123C',
        },
        terminal: {
          bg: '#0a0a0a',
          surface: '#141414',
          'surface-hover': '#1a1a1a',
          border: '#262626',
        },
        text: {
          primary: '#fafafa',
          secondary: '#a3a3a3',
          muted: '#737373',
        },
        accent: {
          amber: '#f59e0b',
          cyan: '#06b6d4',
        },
        status: {
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
        },
      },
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        tight: ['"Inter Tight"', 'sans-serif'],
        code: ['"JetBrains Mono"', 'monospace'],
        serif: ['"Crimson Pro"', 'serif'],
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        'subtle': 'none',
        'card': 'none',
        'elevated': '0 4px 12px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
