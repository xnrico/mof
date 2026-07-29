/** @type {import('tailwindcss').Config} */
// Apple-style theme: a central reskin, not per-component. The app leans on the
// `blue` palette as its primary accent and `purple` for the shared "Daixu" pool,
// so we remap those two ramps to Apple's systemBlue and systemIndigo. Every
// existing `bg-blue-*/text-purple-*` class picks up the Apple hues automatically.
// `paper`/`ink` become the macOS/iOS light-mode canvas + label colours.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // The platform system font ships optical sizing, tracking tables and
        // legibility tuning for free — use it for both display and body.
        display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Apple systemBlue ramp (the primary accent everywhere).
        blue: {
          50: '#eef4ff',
          100: '#dbe8ff',
          200: '#b8d2ff',
          300: '#8ab6ff',
          400: '#5a97ff',
          500: '#0a84ff', // iOS systemBlue (dark-vibrant)
          600: '#007aff', // iOS systemBlue (light)
          700: '#0060df',
          800: '#0048ab',
          900: '#00337a',
        },
        // Apple systemIndigo ramp (the shared Daixu pool accent).
        purple: {
          50: '#eeeeff',
          100: '#e0e0ff',
          200: '#c6c6fb',
          300: '#a5a5f5',
          400: '#8080ec',
          500: '#5e5ce6', // iOS systemIndigo
          600: '#4b49d6',
          700: '#3d3bb8',
          800: '#302e92',
          900: '#232170',
        },
        // Light-mode canvas + label colours.
        paper: '#f5f5f7', // macOS window background
        ink: '#1d1d1f',   // near-black label colour
      },
      borderRadius: {
        // Apple's continuous-corner feel: generous, soft radii.
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
