import React, { useState, useEffect } from 'react';

export default function ProfileBar() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    (window as any).electronAPI.loadProfiles().then((res: any) => {
      if (res.profiles) {
        setProfiles(res.profiles);
        if (res.profiles.length > 0) setSelectedId(res.profiles[0].id);
      }
    });
  }, []);

  const profile = profiles.find((p) => p.id === selectedId);

  return (
    <div className="profile-bar">
      <h2>FMSG Agents</h2>
      <span style={{ color: '#888', fontSize: 12 }}>Profile:</span>
      <select
        className="select-input"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.job_titles?.join(' → ') || 'No titles'}
          </option>
        ))}
      </select>
      {profile && (
        <>
          <span className="tag">{profile.industry || 'No industry'}</span>
          <span className="tag">{profile.location || 'No location'}</span>
          <span className="tag">Industry: {profile.industry_step_1 || '-'} → {profile.industry_step_2 || '-'}</span>
        </>
      )}
      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#666' }}>
        Profiles pulled from Supabase (service role)
      </span>
    </div>
  );
}
