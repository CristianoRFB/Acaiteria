const response = await fetch('http://127.0.0.1:5000/');
const html = await response.text();
if (!response.ok || !html.includes('Monte do seu jeito')) throw new Error(`Hosting check falhou: HTTP ${response.status}`);
process.stdout.write(`Hosting emulator respondeu HTTP ${response.status} com a aplicação.\n`);
