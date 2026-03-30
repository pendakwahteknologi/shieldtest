/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#1a1a2e',
          800: '#16213e',
          700: '#1b2a4a',
          600: '#243356',
          500: '#3a4a6b',
        },
        accent: {
          blue: '#3b82f6',
          orange: '#f97316',
          green: '#22c55e',
          red: '#ef4444',
          yellow: '#eab308',
        },
      },
    },
  },
  plugins: [],
};
