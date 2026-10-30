/** @type {import('tailwindcss').Config} */
const color = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: color('background'),
        surface: color('surface'),
        border: color('border'),
        foreground: color('foreground'),
        muted: color('muted'),
        primary: color('primary'),
        'primary-foreground': color('primary-foreground'),
        success: color('success'),
        warning: color('warning'),
        danger: color('danger'),
        reserved: color('reserved'),
      },
    },
  },
  plugins: [],
};
