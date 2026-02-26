import type { Config } from 'tailwindcss';

export default {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            colors: {
                background: '#09090b',
                foreground: '#fafafa',
                primary: {
                    DEFAULT: '#3b82f6',
                    foreground: '#ffffff',
                },
                muted: {
                    DEFAULT: '#27272a',
                    foreground: '#a1a1aa',
                }
            }
        },
    },
    plugins: [],
} satisfies Config;
