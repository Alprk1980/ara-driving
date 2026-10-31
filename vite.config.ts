// ARA Driving: deployed under /ara-driving/ on the same Pages host as the hub, so it shares the player profile.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { game: 'index.html', labs: 'labs.html', photovox: 'photovox.html' } } }, // the labs bench ships beside the game, linked from its title screen and Menu
  test: { include: ['schemas/**/*.test.ts', 'src/**/*.test.ts'] },
});
