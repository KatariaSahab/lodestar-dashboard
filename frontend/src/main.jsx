import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import App from './App';
import './index.css';

const signature = `
    %c   ___  ____ __  __
    %c  |   \\| __|\\ \\ / /
    %c  | |) | _|  \\ V /    DHEERAJ PAPANI
    %c  |___/|___|  \\_/     Architect & Developer
    %c                      https://github.com/dheerajpapani
    `;
console.log(signature, 'color: #3b82f6', 'color: #3b82f6', 'color: #3b82f6', 'color: #3b82f6', 'color: gray; font-style: italic;');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
