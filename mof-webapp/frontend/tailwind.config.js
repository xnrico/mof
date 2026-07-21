/** @type {import('tailwindcss').Config} */
// Soviet-constructivist theme: the app leans on `blue` as its primary accent
// and `purple` for the shared "Daixu" pool. We remap those two palettes to a
// Soviet red and a propaganda-poster gold so the whole UI reskins centrally
// without touching every component. Reds are kept legible (600/700 for solid
// buttons, white text) so it stays modern and readable on PC and mobile.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Display: condensed constructivist caps. Body: condensed sans so all
        // ordinary text reads poster-like too (not the neutral Roboto).
        display: ['Oswald', 'Roboto Condensed', 'sans-serif'],
        sans: ['Roboto Condensed', 'Oswald', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Soviet red ramp (replaces blue as the primary accent everywhere).
        blue: {
          50: '#fbeaea',
          100: '#f6d0d0',
          200: '#ec9f9f',
          300: '#e06d6d',
          400: '#d23f3f',
          500: '#c1201a',
          600: '#a01410',
          700: '#7d0f0c',
          800: '#5c0b09',
          900: '#3d0706',
        },
        // Propaganda gold (replaces purple, used for the shared Daixu pool).
        purple: {
          50: '#fdf6e3',
          100: '#fae9bd',
          200: '#f3d585',
          300: '#eabf4d',
          400: '#e0a92a',
          500: '#c8901a',
          600: '#a67214',
          700: '#835811',
          800: '#5f3f0d',
          900: '#3f2a09',
        },
        // Aged-paper background for the constructivist look.
        paper: '#f4efe6',
        ink: '#1a1512',
      },
    },
  },
  plugins: [],
}
