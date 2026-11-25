// src/services/bhoonidhiService.js

/**
 * Curated list of Bhoonidhi ISRO STAC Collections relevant to LODESTAR
 */
export const BHOONIDHI_COLLECTIONS = [
  {
    id: 'EOS-04_SAR-MRS_L2A',
    name: 'EOS-04 (RISAT-1A) SAR Medium Resolution',
    category: 'Flood Radar',
    resolution: '33m',
    description: 'C-band all-weather SAR for flood inundation mapping during heavy monsoon cloud cover.',
    relevantSites: ['Guwahati', 'Bengaluru']
  },
  {
    id: 'EOS-04_SAR-MRS_SM',
    name: 'EOS-04 SAR Soil Moisture (MRS-SM)',
    category: 'Soil Moisture',
    resolution: '1km grid',
    description: 'Direct radar-derived soil saturation index for flash flood and drought onset analysis.',
    relevantSites: ['Anantapur', 'Guwahati']
  },
  {
    id: 'EOS-06_OCM-LAC_NDVI_8day_360m',
    name: 'EOS-06 (Oceansat-3) 8-Day NDVI Composite',
    category: 'Vegetation & Drought',
    resolution: '360m',
    description: '8-day Normalized Difference Vegetation Index for regional agricultural drought surveillance.',
    relevantSites: ['Anantapur', 'Bengaluru']
  },
  {
    id: 'ResourceSat-2A_AWIFS_L2',
    name: 'ResourceSat-2A AWiFS Orthorectified',
    category: 'Land & Water Cover',
    resolution: '56m',
    description: 'Wide-swath multispectral imagery for regional waterbody extent and land cover changes.',
    relevantSites: ['Guwahati', 'Bengaluru', 'Anantapur']
  },
  {
    id: 'Sentinel-1A_SAR-IW_GRD',
    name: 'Sentinel-1A SAR Ground Range Detected (ISRO Mirror)',
    category: 'High-Res Flood SAR',
    resolution: '10m',
    description: 'Dual-pol SAR imagery mirrored by NRSC for detailed urban floodline demarcation.',
    relevantSites: ['Guwahati', 'Bengaluru']
  },
  {
    id: 'CartoSat-1_PAN_CartoDEM_30m',
    name: 'CartoSat-1 Digital Elevation Model (CartoDEM)',
    category: 'Terrain Elevation',
    resolution: '30m',
    description: 'High-accuracy national DEM for catchment slope modeling and drainage sink identification.',
    relevantSites: ['Guwahati', 'Bengaluru', 'Anantapur']
  }
];

// In-memory token cache
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Determine API Base URL (Proxy in dev or direct)
 */
const getApiBase = () => {
  if (import.meta.env.DEV) {
    return '/bhoonidhi-api';
  }
  return 'https://bhoonidhi-api.nrsc.gov.in';
};

/**
 * Retrieve saved credentials (Env variables first, then localStorage)
 */
export const getStoredCredentials = () => {
  const envUser = import.meta.env.VITE_BHOONIDHI_USER_ID || '';
  const envPass = import.meta.env.VITE_BHOONIDHI_PASSWORD || '';

  if (envUser && envPass) {
    return { userId: envUser, password: envPass, source: 'env' };
  }

  const localUser = localStorage.getItem('bhoonidhi_user_id') || '';
  const localPass = localStorage.getItem('bhoonidhi_password') || '';

  return {
    userId: localUser,
    password: localPass,
    source: localUser ? 'localStorage' : 'none'
  };
};

/**
 * Save credentials locally in browser for convenience
 */
export const saveCredentialsLocally = (userId, password) => {
  if (userId && password) {
    localStorage.setItem('bhoonidhi_user_id', userId);
    localStorage.setItem('bhoonidhi_password', password);
  } else {
    localStorage.removeItem('bhoonidhi_user_id');
    localStorage.removeItem('bhoonidhi_password');
  }
};

/**
 * Authenticate against Bhoonidhi /auth/token
 */
export const authenticateBhoonidhi = async (userId, password) => {
  if (!userId || !password) {
    return { success: false, error: 'User ID and Password are required.' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiry > now + 60) {
    return { success: true, token: cachedToken, expiresIn: tokenExpiry - now, cached: true };
  }

  try {
    const response = await fetch(`${getApiBase()}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        password,
        grant_type: 'password'
      })
    });

    const data = await response.json();

    if (!response.ok || data.ErrorCode) {
      return {
        success: false,
        error: data.Description || `Authentication failed (HTTP ${response.status})`
      };
    }

    if (data.access_token) {
      cachedToken = data.access_token;
      tokenExpiry = now + (data.expires_in || 1200);
      return {
        success: true,
        token: cachedToken,
        expiresIn: data.expires_in || 1200,
        userId: data.userId
      };
    }

    return { success: false, error: 'Token missing in server response.' };
  } catch (err) {
    return {
      success: false,
      error: `Network/CORS error: ${err.message}. If running remotely, ensure CORS proxy is configured.`
    };
  }
};

/**
 * Fallback Simulated STAC Items for offline / unauthenticated demo testing
 */
export const getSimulatedStacItems = (siteName, collectionId) => {
  const coordinatesBySite = {
    Guwahati: [91.7362, 26.1445],
    Bengaluru: [77.5946, 12.9716],
    Anantapur: [77.6000, 14.6819]
  };

  const center = coordinatesBySite[siteName] || [91.7362, 26.1445];
  const delta = 0.35; // ~35km bounding box

  const bbox = [
    center[0] - delta,
    center[1] - delta,
    center[0] + delta,
    center[1] + delta
  ];

  const now = new Date();
  const d1 = new Date(now.getTime() - 2 * 86400000).toISOString().split('T')[0];
  const d2 = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const d3 = new Date(now.getTime() - 15 * 86400000).toISOString().split('T')[0];

  return [
    {
      id: `${collectionId.slice(0, 7)}_${siteName.toUpperCase()}_${d1.replace(/-/g, '')}_PASS_01`,
      collection: collectionId,
      date_time: `${d1}T04:22:18.000Z`,
      bbox,
      thumbnail: 'https://bhoonidhi.nrsc.gov.in/stac/PRODUCTJPGS/E04/SAR-FRS1/2026/OCT/11/E04_SAR_FR1_11OCT2026_25712_2522_34_S63_STUC00ETD_H_HV_A_F.jpg',
      properties: {
        satellite: collectionId.includes('EOS-04') ? 'EOS-04' : collectionId.includes('EOS-06') ? 'EOS-06' : 'ResourceSat-2A',
        polarization: collectionId.includes('SAR') ? 'DH (Dual-Pol VV+VH)' : 'Multispectral',
        pass: 'Descending',
        cloud_cover_percent: collectionId.includes('SAR') ? 0 : 12.4,
        online_status: 'Available',
        file_size_mb: collectionId.includes('SAR') ? 485 : 120
      },
      download_url: `https://bhoonidhi-api.nrsc.gov.in/download?id=${collectionId}_SAMPLE_01&collection=${collectionId}`,
      portal_url: 'https://bhoonidhi.nrsc.gov.in/'
    },
    {
      id: `${collectionId.slice(0, 7)}_${siteName.toUpperCase()}_${d2.replace(/-/g, '')}_PASS_02`,
      collection: collectionId,
      date_time: `${d2}T10:15:40.000Z`,
      bbox,
      thumbnail: 'https://bhoonidhi.nrsc.gov.in/stac/PRODUCTJPGS/E04/SAR-FRS1/2026/OCT/11/E04_SAR_FR1_11OCT2026_25712_2522_34_S63_STUC00ETD_H_HV_A_F.jpg',
      properties: {
        satellite: collectionId.includes('EOS-04') ? 'EOS-04' : collectionId.includes('EOS-06') ? 'EOS-06' : 'ResourceSat-2A',
        polarization: collectionId.includes('SAR') ? 'DH (Dual-Pol VV+VH)' : 'Multispectral',
        pass: 'Ascending',
        cloud_cover_percent: collectionId.includes('SAR') ? 0 : 8.1,
        online_status: 'Available',
        file_size_mb: collectionId.includes('SAR') ? 512 : 115
      },
      download_url: `https://bhoonidhi-api.nrsc.gov.in/download?id=${collectionId}_SAMPLE_02&collection=${collectionId}`,
      portal_url: 'https://bhoonidhi.nrsc.gov.in/'
    },
    {
      id: `${collectionId.slice(0, 7)}_${siteName.toUpperCase()}_${d3.replace(/-/g, '')}_PASS_03`,
      collection: collectionId,
      date_time: `${d3}T04:21:05.000Z`,
      bbox,
      thumbnail: 'https://bhoonidhi.nrsc.gov.in/stac/PRODUCTJPGS/E04/SAR-FRS1/2026/OCT/11/E04_SAR_FR1_11OCT2026_25712_2522_34_S63_STUC00ETD_H_HV_A_F.jpg',
      properties: {
        satellite: collectionId.includes('EOS-04') ? 'EOS-04' : collectionId.includes('EOS-06') ? 'EOS-06' : 'ResourceSat-2A',
        polarization: collectionId.includes('SAR') ? 'DH (Dual-Pol VV+VH)' : 'Multispectral',
        pass: 'Descending',
        cloud_cover_percent: collectionId.includes('SAR') ? 0 : 22.0,
        online_status: 'Available',
        file_size_mb: collectionId.includes('SAR') ? 490 : 128
      },
      download_url: `https://bhoonidhi-api.nrsc.gov.in/download?id=${collectionId}_SAMPLE_03&collection=${collectionId}`,
      portal_url: 'https://bhoonidhi.nrsc.gov.in/'
    }
  ];
};

/**
 * Search Bhoonidhi STAC API for satellite passes over a given coordinate
 */
export const searchBhoonidhiCatalog = async ({
  collectionId,
  siteName,
  coordinates,
  daysBack = 30,
  token
}) => {
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - daysBack * 86400000).toISOString();

  // If no auth token is available, return simulated demo passes
  if (!token) {
    return {
      success: true,
      isDemo: true,
      items: getSimulatedStacItems(siteName, collectionId)
    };
  }

  try {
    const delta = 0.5;
    const minLon = (coordinates[0] - delta).toFixed(4);
    const minLat = (coordinates[1] - delta).toFixed(4);
    const maxLon = (coordinates[0] + delta).toFixed(4);
    const maxLat = (coordinates[1] + delta).toFixed(4);

    const url = `${getApiBase()}/data/search?collections=${encodeURIComponent(collectionId)}&bbox=${minLon},${minLat},${maxLon},${maxLat}&limit=25`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok || data.ErrorCode) {
      console.warn('[Bhoonidhi] Live search returned an error, falling back to demo catalog', data);
      return {
        success: true,
        isDemo: true,
        error: data.Description,
        items: getSimulatedStacItems(siteName, collectionId)
      };
    }

    if (data.features && Array.isArray(data.features)) {
      const items = data.features.map(f => ({
        id: f.id,
        collection: f.collection || collectionId,
        date_time: f.properties?.datetime || f.properties?.date_time || 'N/A',
        bbox: f.bbox,
        thumbnail: f.assets?.thumbnail?.href || f.assets?.preview?.href || null,
        properties: {
          satellite: f.properties?.satellite || collectionId.split('_')[0],
          polarization: f.properties?.Polarization || 'N/A',
          pass: f.properties?.Node || 'N/A',
          cloud_cover_percent: f.properties?.cloud_cover ?? 'N/A',
          online_status: f.properties?.Online === 'Y' ? 'Available' : 'Archived',
          file_size_mb: f.properties?.file_size_mb || 'N/A'
        },
        download_url: `https://bhoonidhi-api.nrsc.gov.in/download?id=${f.id}&collection=${collectionId}`,
        portal_url: `https://bhoonidhi.nrsc.gov.in/`
      }));

      return {
        success: true,
        isDemo: false,
        items
      };
    }

    return {
      success: true,
      isDemo: true,
      items: getSimulatedStacItems(siteName, collectionId)
    };
  } catch (err) {
    console.warn('[Bhoonidhi] Live STAC query failed, showing offline demo items:', err);
    return {
      success: true,
      isDemo: true,
      items: getSimulatedStacItems(siteName, collectionId)
    };
  }
};
