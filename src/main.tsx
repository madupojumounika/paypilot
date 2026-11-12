import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// PayPal's SDK owns iframe/button DOM inside its container. Avoid the
// development-only StrictMode effect replay which can mount the SDK twice.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
