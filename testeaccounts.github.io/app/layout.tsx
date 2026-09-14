import type { Metadata } from 'next';
import './globals.css';

const title='Açaí + Sabor | Gestão da loja';
const description='Gestão de pedidos, produtos, complementos e delivery do Açaí + Sabor.';

export const metadata:Metadata={
  metadataBase:new URL('https://demonstracaoonline.github.io'),
  title,
  description,
  openGraph:{title,description,images:[{url:'/og.png',width:1200,height:630,alt:'Açaí + Sabor — gestão da loja'}]},
  twitter:{card:'summary_large_image',title,description,images:['/og.png']},
};

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="pt-BR"><body>{children}</body></html>}
