// Vercel Serverless Function - 항공기 사진 프록시
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { hex, reg } = req.query;

  if (!hex && !reg) {
    return res.status(400).json({ error: 'hex or reg parameter required' });
  }

  try {
    // 1차: Planespotters.net API (registration으로 검색 - 가장 정확함)
    if (reg) {
      try {
        const psRes = await fetch(`https://api.planespotters.net/pub/photos/reg/${reg.toUpperCase()}`, {
          headers: { 'User-Agent': 'RKPU-Viewer/1.0' }
        });
        if (psRes.ok) {
          const psData = await psRes.json();
          if (psData.photos && psData.photos.length > 0) {
            const photo = psData.photos[0];
            return res.status(200).json({
              source: 'planespotters',
              image: photo.thumbnail_large?.src || photo.thumbnail?.src,
              photographer: photo.photographer,
              link: photo.link
            });
          }
        }
      } catch (e) {
        console.warn('Planespotters reg API error:', e);
      }
    }

    // 2차: Planespotters.net API (hex로 검색)
    if (hex) {
      try {
        const psRes = await fetch(`https://api.planespotters.net/pub/photos/hex/${hex.toUpperCase()}`, {
          headers: { 'User-Agent': 'RKPU-Viewer/1.0' }
        });
        if (psRes.ok) {
          const psData = await psRes.json();
          if (psData.photos && psData.photos.length > 0) {
            const photo = psData.photos[0];
            return res.status(200).json({
              source: 'planespotters',
              image: photo.thumbnail_large?.src || photo.thumbnail?.src,
              photographer: photo.photographer,
              link: photo.link
            });
          }
        }
      } catch (e) {
        console.warn('Planespotters hex API error:', e);
      }
    }

    // 3차: JetPhotos.com API (registration으로 검색)
    if (reg) {
      try {
        // JetPhotos는 scraping이 필요하므로 airport-data로 대체
        const adRes = await fetch(`https://www.airport-data.com/api/ac_thumb.json?r=${reg.replace(/-/g, '')}&n=1`, {
          headers: { 'User-Agent': 'RKPU-Viewer/1.0' }
        });
        if (adRes.ok) {
          const adData = await adRes.json();
          if (adData.data && adData.data.length > 0 && adData.data[0].image) {
            return res.status(200).json({
              source: 'airport-data',
              image: adData.data[0].image,
              photographer: adData.data[0].photographer
            });
          }
        }
      } catch (e) {
        console.warn('airport-data reg API error:', e);
      }
    }

    // 4차: airport-data.com (hex로 검색)
    if (hex) {
      try {
        const adRes = await fetch(`https://www.airport-data.com/api/ac_thumb.json?m=${hex.toUpperCase()}&n=1`, {
          headers: { 'User-Agent': 'RKPU-Viewer/1.0' }
        });
        if (adRes.ok) {
          const adData = await adRes.json();
          if (adData.data && adData.data.length > 0 && adData.data[0].image) {
            return res.status(200).json({
              source: 'airport-data',
              image: adData.data[0].image,
              photographer: adData.data[0].photographer
            });
          }
        }
      } catch (e) {
        console.warn('airport-data hex API error:', e);
      }
    }

    // 사진 없음
    return res.status(200).json({ source: null, image: null });

  } catch (error) {
    console.error('Photo API error:', error);
    return res.status(500).json({ error: 'Failed to fetch aircraft photo' });
  }
}
