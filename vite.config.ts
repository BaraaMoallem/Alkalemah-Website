import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
        location: 'location.html',
        contact: 'contact.html',
      },
    },
  },
});
