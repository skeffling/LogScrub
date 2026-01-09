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
        pii: {
          email: '#3b82f6',
          ip: '#22c55e',
          financial: '#ef4444',
          name: '#a855f7',
          secret: '#f97316',
        }
      }
    },
  },
  plugins: [],
}
