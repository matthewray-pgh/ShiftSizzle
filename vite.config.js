
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Set base to repo name for GitHub Pages
export default defineConfig({
  base: '/ShiftSizzle/',
  plugins: [react()],
});