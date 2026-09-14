import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const port='4179';
const child=spawn(process.execPath,['node_modules/vinext/dist/cli.js','start','--host','127.0.0.1','--port',port],{
  cwd:process.cwd(),
  env:{...process.env,PORT:port},
  stdio:['ignore','pipe','pipe'],
});

let html='';
try{
  for(let attempt=0;attempt<60;attempt+=1){
    try{
      const response=await fetch(`http://127.0.0.1:${port}/`);
      if(response.ok){html=await response.text();break;}
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!html)throw new Error('Não foi possível renderizar a rota raiz para o GitHub Pages.');
  await writeFile(join(process.cwd(),'dist','client','index.html'),html,'utf8');
  await writeFile(join(process.cwd(),'dist','client','.nojekyll'),'','utf8');
  await writeFile(join(process.cwd(),'dist','client','404.html'),html,'utf8');
  process.stdout.write('Static GitHub Pages entry generated.\n');
}finally{
  child.kill();
}
