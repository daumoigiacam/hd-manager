const palette = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

module.exports = {
  content: ['./index.html', './src/App.jsx', './src/main.jsx'],
  safelist: [
    {
      pattern: new RegExp(`^(bg|text|border|ring|from|via|to)-(${palette.join('|')})-(${shades.join('|')})$`),
      variants: ['hover', 'focus', 'active', 'disabled'],
    },
    {
      pattern: /^(grid-cols|col-span|row-span)-([1-9]|1[0-2])$/,
      variants: ['sm', 'md', 'lg'],
    },
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
