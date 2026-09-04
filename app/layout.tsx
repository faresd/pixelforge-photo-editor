import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
const sans=Geist({variable:'--font-geist-sans',subsets:['latin']});
const mono=Geist_Mono({variable:'--font-geist-mono',subsets:['latin']});
export const metadata:Metadata={title:'PixelForge — Free Online Photo Editor',description:'A fast, private and free photo editor with essential creative tools.',openGraph:{title:'PixelForge — Free Online Photo Editor',description:'Powerful photo editing, made simple. Free and private in your browser.',type:'website',images:[{url:'/og.png',width:1200,height:630,alt:'PixelForge free photo editor'}]},twitter:{card:'summary_large_image',title:'PixelForge — Free Online Photo Editor',description:'Powerful photo editing, made simple.',images:['/og.png']}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>}
