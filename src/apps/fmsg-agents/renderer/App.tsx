import React from 'react';
import ProfileBar from './components/ProfileBar';
import LiveLog from './components/LiveLog';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  return (
    <div className="app-container">
      <ProfileBar />
      <LiveLog />
      <SettingsPanel />
    </div>
  );
}
