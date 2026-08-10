import React from 'react';
import './index.css'; // Holds visual layouts across both viewport scopes

import LinkedInWorkspace from './components/LinkedInWorkspace';

export default function App() {
  return (
    <div style={{ margin: 0, padding: 0, boxSizing: 'border-box' }}>
      <LinkedInWorkspace />
    </div>
  );
}
