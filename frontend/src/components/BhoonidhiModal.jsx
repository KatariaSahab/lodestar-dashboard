// src/components/BhoonidhiModal.jsx
import React, { useState, useEffect } from 'react';
import {
  FaTimes,
  FaSatellite,
  FaCheckCircle,
  FaExclamationTriangle,
  FaSearch,
  FaDownload,
  FaEye,
  FaInfoCircle,
  FaPlay,
  FaClock,
  FaSyncAlt
} from 'react-icons/fa';
import {
  BHOONIDHI_COLLECTIONS,
  getStoredCredentials,
  authenticateBhoonidhi,
  searchBhoonidhiCatalog
} from '../services/bhoonidhiService';
import './BhoonidhiModal.css';

const siteCoordinates = {
  Guwahati: [91.7362, 26.1445],
  Bengaluru: [77.5946, 12.9716],
  Anantapur: [77.6000, 14.6819]
};

export default function BhoonidhiModal({ isOpen, onClose, activeSite = 'Guwahati', mapRef, onOverlayScene }) {
  const [authStatus, setAuthStatus] = useState({ state: 'idle', message: '', token: null });
  const [authLoading, setAuthLoading] = useState(false);
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(0);

  const [selectedSite, setSelectedSite] = useState(activeSite || 'Guwahati');
  const [selectedCollection, setSelectedCollection] = useState('EOS-04_SAR-MRS_L2A');
  const [timeRange, setTimeRange] = useState(30);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // Live countdown timer for active session
  useEffect(() => {
    if (sessionSecondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSessionSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setAuthStatus((prevStatus) => ({
            ...prevStatus,
            state: 'idle',
            message: 'Session timed out. Click "Start Satellite Feed" to refresh.',
            token: null
          }));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionSecondsLeft]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const downloadSatelliteImage = async (imageUrl, sceneId) => {
    try {
      let fetchUrl = imageUrl;
      if (import.meta.env.DEV && imageUrl.startsWith('https://bhoonidhi.nrsc.gov.in')) {
        fetchUrl = imageUrl.replace('https://bhoonidhi.nrsc.gov.in', '/bhoonidhi-media');
      }
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error('Fetch failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sceneId}_satellite.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      window.open(imageUrl, '_blank');
    }
  };

  // Sync selected site if activeSite changes
  useEffect(() => {
    if (activeSite && siteCoordinates[activeSite]) {
      setSelectedSite(activeSite);
    }
  }, [activeSite]);

  if (!isOpen) return null;

  // Handle Start / Renew Live Feed using secure background credentials
  const handleStartFeed = async () => {
    setAuthLoading(true);
    setAuthStatus({ state: 'loading', message: 'Connecting to ISRO Bhoonidhi nodes...', token: null });

    const creds = getStoredCredentials();
    if (!creds.userId || !creds.password) {
      setAuthLoading(false);
      setAuthStatus({
        state: 'error',
        message: 'Credentials missing in environment configuration (VITE_BHOONIDHI_USER_ID / VITE_BHOONIDHI_PASSWORD).',
        token: null
      });
      return;
    }

    const result = await authenticateBhoonidhi(creds.userId, creds.password);
    setAuthLoading(false);

    if (result.success) {
      const remainingSeconds = result.expiresIn || 1200;
      setSessionSecondsLeft(remainingSeconds);
      setAuthStatus({
        state: 'success',
        message: 'Live satellite session initialized.',
        token: result.token
      });
      setIsDemoMode(false);
      handleSearch(result.token);
    } else {
      setAuthStatus({
        state: 'error',
        message: result.error || 'Failed to initialize feed. Verify environment variables.',
        token: null
      });
    }
  };

  // Handle STAC Search
  const handleSearch = async (tokenOverride) => {
    setSearchLoading(true);
    let token = tokenOverride !== undefined ? tokenOverride : authStatus.token;

    // Auto-connect if token not yet present
    if (!token) {
      const creds = getStoredCredentials();
      if (creds.userId && creds.password) {
        const authRes = await authenticateBhoonidhi(creds.userId, creds.password);
        if (authRes.success) {
          token = authRes.token;
          setSessionSecondsLeft(authRes.expiresIn || 1200);
          setAuthStatus({
            state: 'success',
            message: 'Live satellite session initialized.',
            token: authRes.token
          });
          setIsDemoMode(false);
        }
      }
    }

    const coords = siteCoordinates[selectedSite] || [91.7362, 26.1445];
    const result = await searchBhoonidhiCatalog({
      collectionId: selectedCollection,
      siteName: selectedSite,
      coordinates: coords,
      daysBack: timeRange,
      token
    });

    setSearchLoading(false);
    setSearchResults(result.items);
    setIsDemoMode(result.isDemo);
  };

  // Overlay scene satellite image and boundary directly onto map coordinates
  const highlightSceneOnMap = (item) => {
    if (!mapRef || !mapRef.current || !item.bbox) return;

    const map = mapRef.current;
    const [minX, minY, maxX, maxY] = item.bbox;

    const applyLayers = () => {
      // 1. Remove existing Bhoonidhi layers & sources
      if (map.getLayer('bhoonidhi-footprint-outline')) map.removeLayer('bhoonidhi-footprint-outline');
      if (map.getLayer('bhoonidhi-footprint-layer')) map.removeLayer('bhoonidhi-footprint-layer');
      if (map.getLayer('bhoonidhi-image-layer')) map.removeLayer('bhoonidhi-image-layer');
      if (map.getSource('bhoonidhi-image-source')) map.removeSource('bhoonidhi-image-source');
      if (map.getSource('bhoonidhi-footprint-source')) map.removeSource('bhoonidhi-footprint-source');

      // 2. Add satellite imagery raster overlay directly onto map coordinates
      if (item.thumbnail) {
        let imageUrl = item.thumbnail;
        if (import.meta.env.DEV && imageUrl.startsWith('https://bhoonidhi.nrsc.gov.in')) {
          imageUrl = imageUrl.replace('https://bhoonidhi.nrsc.gov.in', '/bhoonidhi-media');
        }

        // MapLibre Image coordinates order: [top-left, top-right, bottom-right, bottom-left]
        const imageCoordinates = [
          [minX, maxY], // NW (top-left)
          [maxX, maxY], // NE (top-right)
          [maxX, minY], // SE (bottom-right)
          [minX, minY]  // SW (bottom-left)
        ];

        try {
          map.addSource('bhoonidhi-image-source', {
            type: 'image',
            url: imageUrl,
            coordinates: imageCoordinates
          });

          map.addLayer({
            id: 'bhoonidhi-image-layer',
            type: 'raster',
            source: 'bhoonidhi-image-source',
            paint: {
              'raster-opacity': 0.88,
              'raster-fade-duration': 300
            }
          });
        } catch (err) {
          console.warn('[Bhoonidhi] Error adding satellite raster overlay:', err);
        }
      }

      // 3. Add glowing geo-boundary outline
      const geojson = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minX, minY],
              [maxX, minY],
              [maxX, maxY],
              [minX, maxY],
              [minX, minY]
            ]
          ]
        },
        properties: { name: item.id }
      };

      map.addSource('bhoonidhi-footprint-source', {
        type: 'geojson',
        data: geojson
      });

      map.addLayer({
        id: 'bhoonidhi-footprint-outline',
        type: 'line',
        source: 'bhoonidhi-footprint-source',
        paint: {
          'line-color': '#00f0ff',
          'line-width': 2.5,
          'line-dasharray': [3, 2]
        }
      });

      // 4. Smooth camera flight to the scene footprint
      map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, duration: 1500 });
    };

    if (!map.isStyleLoaded()) {
      map.once('style.load', applyLayers);
    } else {
      applyLayers();
    }

    if (onOverlayScene) {
      onOverlayScene(item);
    }
    onClose();
  };

  return (
    <div className="bhoonidhi-modal-overlay" onClick={onClose}>
      <div className="bhoonidhi-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bhoonidhi-modal-header">
          <div className="bhoonidhi-title-group">
            <FaSatellite className="bhoonidhi-icon" />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                ISRO Bhoonidhi Satellite Catalog (Free Tier)
              </h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
                Direct STAC v1.0 Earth Observation Data Ingestion &amp; Scene Discovery
              </p>
            </div>
          </div>
          <button className="bhoonidhi-close-btn" onClick={onClose} title="Close Explorer">
            <FaTimes />
          </button>
        </div>

        <div className="bhoonidhi-modal-body">
          {/* Section 1: Live Feed Engine Control */}
          <div className="bhoonidhi-card bhoonidhi-engine-card">
            <div className="bhoonidhi-engine-content">
              <div className="bhoonidhi-engine-info">
                <div className="bhoonidhi-engine-header">
                  <FaSatellite className="bhoonidhi-engine-pulse-icon" />
                  <div>
                    <h3 className="bhoonidhi-engine-title">ISRO Bhoonidhi Live Feed Engine</h3>
                    <p className="bhoonidhi-engine-subtitle">
                      Direct STAC v1.0 pipeline connected via secure environment credentials
                    </p>
                  </div>
                </div>
              </div>

              <div className="bhoonidhi-engine-actions">
                {authStatus.state === 'success' && sessionSecondsLeft > 0 ? (
                  <div className="bhoonidhi-active-session-group">
                    <span className="bhoonidhi-status-pill online">
                      <FaCheckCircle /> Feed Active
                    </span>
                    <div className="bhoonidhi-timer-pill" title="Active session token countdown">
                      <FaClock className="bhoonidhi-timer-icon" />
                      <span>{formatTimer(sessionSecondsLeft)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartFeed}
                      disabled={authLoading}
                      className="bhoonidhi-btn-restart"
                      title="Renew or restart feed session"
                    >
                      <FaSyncAlt className={authLoading ? 'bhoonidhi-spin' : ''} />
                      <span>Restart</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartFeed}
                    disabled={authLoading}
                    className="bhoonidhi-btn-start"
                  >
                    <FaPlay />
                    <span>{authLoading ? 'Connecting to ISRO...' : 'Start Satellite Feed'}</span>
                  </button>
                )}
              </div>
            </div>

            {authStatus.message && (
              <div className={`bhoonidhi-alert ${authStatus.state}`} style={{ marginTop: '12px' }}>
                {authStatus.state === 'success' ? (
                  <FaCheckCircle />
                ) : authStatus.state === 'loading' ? (
                  <div className="bhoonidhi-mini-spinner" />
                ) : (
                  <FaExclamationTriangle />
                )}
                <span>{authStatus.message}</span>
              </div>
            )}
          </div>

          {/* Section 2: Catalog Query Controls */}
          <div className="bhoonidhi-card">
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem' }}>Select Target &amp; Mission Collection</h4>
            <div className="bhoonidhi-query-grid">
              <div>
                <label className="bhoonidhi-label">Study Site</label>
                <select
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="bhoonidhi-select"
                >
                  <option value="Guwahati">Guwahati (Flood Plain)</option>
                  <option value="Bengaluru">Bengaluru (Urban Lakes &amp; Drainage)</option>
                  <option value="Anantapur">Anantapur (Drought &amp; Agriculture)</option>
                </select>
              </div>

              <div>
                <label className="bhoonidhi-label">Mission / Sensor Collection</label>
                <select
                  value={selectedCollection}
                  onChange={(e) => setSelectedCollection(e.target.value)}
                  className="bhoonidhi-select"
                >
                  {BHOONIDHI_COLLECTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.resolution})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="bhoonidhi-label">Acquisition Timeframe</label>
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(Number(e.target.value))}
                  className="bhoonidhi-select"
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={90}>Last 90 Days</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => handleSearch()}
                  disabled={searchLoading}
                  className="bhoonidhi-btn-search"
                >
                  <FaSearch /> {searchLoading ? 'Searching...' : 'Search Passes'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: STAC Results Listing */}
          <div className="bhoonidhi-results-container">
            <div className="bhoonidhi-results-header">
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                Matching Satellite Passes ({searchResults ? searchResults.length : 0})
              </h4>
              {isDemoMode && (
                <span className="bhoonidhi-demo-tag">
                  Simulated Catalog Preview (Click &quot;Start Satellite Feed&quot; to connect live)
                </span>
              )}
            </div>

            {!searchResults && !searchLoading && (
              <div className="bhoonidhi-empty-state">
                <FaSatellite style={{ fontSize: '2.5rem', opacity: 0.3 }} />
                <p>Click &quot;Start Satellite Feed&quot; or &quot;Search Passes&quot; to discover recent satellite passes over {selectedSite}.</p>
              </div>
            )}

            {searchLoading && (
              <div className="bhoonidhi-loading-state">
                <div className="bhoonidhi-spinner"></div>
                <p>Querying STAC catalogue items for {selectedCollection}...</p>
              </div>
            )}

            {searchResults && searchResults.length === 0 && !searchLoading && (
              <div className="bhoonidhi-empty-state">
                <p>No matching passes found in the selected timeframe. Try expanding to 90 days.</p>
              </div>
            )}

            {searchResults && searchResults.length > 0 && !searchLoading && (
              <div className="bhoonidhi-cards-grid">
                {searchResults.map((item) => (
                  <div key={item.id} className="bhoonidhi-scene-card">
                    <div className="bhoonidhi-card-top">
                      <span className="bhoonidhi-scene-badge">{item.properties.satellite}</span>
                      <span className="bhoonidhi-scene-date">
                        {new Date(item.date_time).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>

                    <h5 className="bhoonidhi-scene-id" title={item.id}>
                      {item.id}
                    </h5>

                    <div className="bhoonidhi-meta-table">
                      <div>
                        <span>Mode / Pol:</span>
                        <strong>{item.properties.polarization}</strong>
                      </div>
                      <div>
                        <span>Orbit Pass:</span>
                        <strong>{item.properties.pass}</strong>
                      </div>
                      <div>
                        <span>Cloud Cover:</span>
                        <strong>{item.properties.cloud_cover_percent}%</strong>
                      </div>
                      <div>
                        <span>File Size:</span>
                        <strong>~{item.properties.file_size_mb} MB</strong>
                      </div>
                    </div>

                    {item.thumbnail && (
                      <div
                        className="bhoonidhi-thumbnail-container"
                        onClick={() => setPreviewImage(item.thumbnail)}
                        title="Click to inspect full satellite image"
                      >
                        <img
                          src={item.thumbnail}
                          alt={item.id}
                          className="bhoonidhi-thumb-img"
                          loading="lazy"
                        />
                        <div className="bhoonidhi-thumb-overlay">
                          <FaEye /> Inspect Satellite Image
                        </div>
                      </div>
                    )}

                    <div className="bhoonidhi-card-actions">
                      {item.thumbnail && (
                        <button
                          onClick={() => downloadSatelliteImage(item.thumbnail, item.id)}
                          className="bhoonidhi-action-btn download"
                          title="Directly download this satellite image file (.jpg)"
                        >
                          <FaDownload /> Image
                        </button>
                      )}
                      <a
                        href={item.portal_url || 'https://bhoonidhi.nrsc.gov.in/'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bhoonidhi-action-btn portal"
                        title="Open Bhoonidhi Portal to download full raw dataset (.tar)"
                      >
                        Full Data
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Download Explanation Banner */}
          <div className="bhoonidhi-download-notice">
            <FaInfoCircle style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Satellite Image &amp; Raw Data Download Notice:</strong>
              <p style={{ margin: '2px 0 0 0', opacity: 0.9 }}>
                Direct satellite imagery can be viewed on the map or downloaded (.jpg) right from your dashboard cards above. For raw multi-gigabyte sensor archives (.tar.gz), click <strong>Full Data</strong> to download via your logged-in portal account (<code>MannuIITT</code>), or request static IP whitelisting from NRSC for automated script downloads.
              </p>
            </div>
          </div>
        </div>

        {/* Lightbox Modal for Full Satellite Image Preview */}
        {previewImage && (
          <div className="bhoonidhi-lightbox-overlay" onClick={() => setPreviewImage(null)}>
            <div className="bhoonidhi-lightbox-content" onClick={(e) => e.stopPropagation()}>
              <div className="bhoonidhi-lightbox-header">
                <span style={{ fontWeight: 700 }}>🛰️ High-Resolution Satellite Scene Preview</span>
                <button className="bhoonidhi-close-btn" onClick={() => setPreviewImage(null)}>
                  <FaTimes />
                </button>
              </div>
              <img src={previewImage} alt="Satellite Scene" className="bhoonidhi-lightbox-img" />
              <div className="bhoonidhi-lightbox-footer">
                <button
                  className="bhoonidhi-btn-primary"
                  onClick={() => downloadSatelliteImage(previewImage, 'satellite_scene')}
                >
                  <FaDownload /> Download Image File (.jpg)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
