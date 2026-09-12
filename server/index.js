import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const server = createApp().listen(port, '127.0.0.1', () => {
  console.log(`TokenWise demo: http://127.0.0.1:${port}`);
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Set PORT to another port and retry.` : error.message);
  process.exitCode = 1;
});