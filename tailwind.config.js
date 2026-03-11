/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Blue Duolingo Palette
        primary: {
          DEFAULT: '#3B82F6', // Blue-500
          hover: '#2563EB',   // Blue-600
          active: '#1D4ED8',  // Blue-700
          light: '#EFF6FF',   // Blue-50
        },
        secondary: {
          DEFAULT: '#4F46E5', // Indigo-600
          hover: '#4338CA',   // Indigo-700
          light: '#EEF2FF',   // Indigo-50
        },
        success: {
          DEFAULT: '#10B981', // Emerald-500
          hover: '#059669',   // Emerald-600
          light: '#ECFDF5',   // Emerald-50
        },
        warning: {
          DEFAULT: '#F59E0B', // Amber-500
          hover: '#D97706',   // Amber-600
          light: '#FFFBEB',   // Amber-50
        },
        error: {
          DEFAULT: '#EF4444', // Red-500
          hover: '#DC2626',   // Red-600
          light: '#FEF2F2',   // Red-50
        },
        slate: {
          850: '#1e293b', // Custom darker slate for cards
          900: '#0f172a', // Dark background
          950: '#151D29', // Deep dark slate background
        }
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
        '5xl': '40px',
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(59, 130, 246, 0.3)',
        'card': '0 6px 20px rgba(0,0,0,0.04)',
        'card-hover': '0 12px 30px rgba(0,0,0,0.08)',
      },
      keyframes: {
        'bounce-in': {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        }
      },
      animation: {
        'bounce-in': 'bounce-in 0.5s cubic-bezier(0.215, 0.610, 0.355, 1.000) both',
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

