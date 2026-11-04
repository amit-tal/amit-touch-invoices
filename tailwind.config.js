/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rose: {
          light: '#E4AEA3',
          muted: '#D49B90',
          dusty: '#C9877C',
          terracotta: '#BC796F',
          mauve: '#A46A69',
        },
        warm: {
          50: '#FDF8F7',
          100: '#FAF2F0',
          200: '#F5E4E1',
          300: '#EBD2CE',
          400: '#DDBABA',
          500: '#C9877C',
          600: '#945853',
          700: '#683F3B',
          800: '#462724',
          900: '#2A1614',
          950: '#1C0D0C',
        }
      },
      fontFamily: {
        sans: ['Heebo', 'system-ui', 'sans-serif'],
        heebo: ['Heebo', 'system-ui', 'sans-serif'],
        mono: ['Heebo', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(188, 121, 111, 0.08), 0 2px 8px 0 rgba(164, 106, 105, 0.05), inset 0 1px 1px 0 rgba(255, 255, 255, 0.8)',
        'glass-hover': '0 12px 36px 0 rgba(188, 121, 111, 0.14), 0 4px 12px 0 rgba(164, 106, 105, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)',
        'glass-button': '0 4px 16px 0 rgba(188, 121, 111, 0.35), inset 0 1px 1px 0 rgba(255, 255, 255, 0.5)',
        'glass-subtle': '0 4px 20px 0 rgba(188, 121, 111, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.7)',
        'inner-light': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.7)',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}
