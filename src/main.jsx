import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Dark mode : applique la classe .dark sur <html> selon la préférence système
// puis gère le toggle manuel via window.__setTheme()
const root = document.documentElement

const applyTheme = (dark) => {
  root.classList.toggle('dark', dark)
}

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
applyTheme(prefersDark)

// Exposé globalement pour le bouton toggle dans App.jsx
window.__themeIsDark = prefersDark
window.__setTheme = (dark) => {
  window.__themeIsDark = dark
  applyTheme(dark)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
