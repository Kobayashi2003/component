import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const savedTheme = localStorage.getItem('component-atlas-theme')
const initialTheme = savedTheme === 'light' || savedTheme === 'dark'
  ? savedTheme
  : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'

document.documentElement.dataset.theme = initialTheme
document.documentElement.style.colorScheme = initialTheme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
