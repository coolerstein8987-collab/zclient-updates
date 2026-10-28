import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/pacifico';
import '@fontsource/press-start-2p';
import '@fontsource/permanent-marker';
import './styles/base.css';
import './styles/layout.css';
import './styles/chat.css';
import './styles/components.css';
import './styles/effects.css';
import './styles/social.css';
import './styles/features.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
