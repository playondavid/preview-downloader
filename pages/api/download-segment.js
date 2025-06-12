export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, start, end, filename } = req.body;
    
    if (!url || start === undefined || end === undefined || !filename) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Fetch the M3U8 playlist
    const playlistResponse = await fetch(url);
    if (!playlistResponse.ok) {
      throw new Error('Failed to fetch playlist');
    }
    
    const playlistText = await playlistResponse.text();
    
    // Parse playlist and find segments
    const lines = playlistText.split('\n');
    const segments = [];
    let segmentDuration = 0;
    let currentTime = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        segmentDuration = parseFloat(line.split(':')[1].split(',')[0]);
      } else if (line && !line.startsWith('#')) {
        const segmentStart = currentTime;
        const segmentEnd = currentTime + segmentDuration;
        
        if (segmentEnd > start && segmentStart < end) {
          const segmentUrl = line.startsWith('http') ? line : new URL(line, url).href;
          segments.push({ url: segmentUrl });
        }
        
        currentTime += segmentDuration;
        if (currentTime > end + 10) break;
      }
    }
    
    // Download and concatenate segments
    const segmentBuffers = [];
    for (const segment of segments) {
      try {
        const segmentResponse = await fetch(segment.url);
        if (segmentResponse.ok) {
          const buffer = await segmentResponse.arrayBuffer();
          segmentBuffers.push(Buffer.from(buffer));
        }
      } catch (error) {
        console.warn('Failed to download segment:', error);
      }
    }
    
    if (segmentBuffers.length === 0) {
      throw new Error('No segments downloaded');
    }
    
    // Concatenate all buffers
    const result = Buffer.concat(segmentBuffers);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace('.mp4', '.ts')}"`);
    res.setHeader('Content-Length', result.length);
    
    return res.send(result);
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Increase body size limit for large requests
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: '100mb', // Allow large video responses
  },
}