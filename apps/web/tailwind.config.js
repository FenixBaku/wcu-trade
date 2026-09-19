/** WCU TRADE institutional dark theme. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Graphite-black family
        base: '#0B0E11',
        panel: '#12161C',
        'panel-2': '#161B22',
        elevated: '#1B222B',
        border: '#232A34',
        'border-soft': '#1C222B',
        // WCU institutional blue / electric
        wcu: {
          DEFAULT: '#2D6BFF',
          bright: '#4C86FF',
          dim: '#1E4CBF',
        },
        cyan: { DEFAULT: '#22D3EE', dim: '#0E7490' },
        profit: { DEFAULT: '#16C784', soft: '#0E9E68' },
        loss: { DEFAULT: '#EA3943', soft: '#C42B34' },
        txt: { DEFAULT: '#EAECEF', muted: '#8B93A1', faint: '#5A616C' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': '0.6875rem',
      },
      keyframes: {
        flashUp: { '0%': { backgroundColor: 'rgba(22,199,132,0.25)' }, '100%': { backgroundColor: 'transparent' } },
        flashDown: { '0%': { backgroundColor: 'rgba(234,57,67,0.25)' }, '100%': { backgroundColor: 'transparent' } },
      },
      animation: {
        flashUp: 'flashUp 0.5s ease-out',
        flashDown: 'flashDown 0.5s ease-out',
      },
    },
  },
  plugins: [],
};
