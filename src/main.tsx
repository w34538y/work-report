import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { api } from './types'

if (api.platform === 'darwin') {
  document.documentElement.dataset.platform = 'darwin'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
