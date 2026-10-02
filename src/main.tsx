import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import HomePage from './HomePage';
import '../app/globals.css';

const editor = location.pathname === '/editor' || location.hash.startsWith('#draft=');
createRoot(document.getElementById('root')!).render(editor ? <Home /> : <HomePage />);
