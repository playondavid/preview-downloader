export default async (request, context) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { url, start, end, filename } = await request.json();
    
    if (!url || !start || !end || !filename) {
      return new Response('Missing required parameters', { status: 400 });
    }

    const duration = end - start;
    
    // Use a streaming approach to download the HLS segment
    const segmentUrl = `${url}?start=${start}&duration=${duration}`;
    
    // Fetch the M3U8 playlist first
    const playlistResponse = await fetch(url);
    if (!playlistResponse.ok) {
      throw new Error('Failed to fetch playlist');
    }
    
    const playlistText = await playlistResponse.text();
    
    // Parse the playlist to find the segment URLs we need
    const lines = playlistText.split('\n');
    const segments = [];
    let segmentDuration = 0;
    let currentTime = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        segmentDuration = parseFloat(line.split(':')[1].split(',')[0]);
      } else if (line && !line.startsWith('#')) {
        // This is a segment URL
        const segmentStart = currentTime;
        const segmentEnd = currentTime + segmentDuration;
        
        // Check if this segment overlaps with our desired time range
        if (segmentEnd > start && segmentStart < end) {
          const segmentUrl = line.startsWith('http') ? line : new URL(line, url).href;
          segments.push({
            url: segmentUrl,
            start: segmentStart,
            end: segmentEnd,
            duration: segmentDuration
          });
        }
        
        currentTime += segmentDuration;
        
        // Stop if we've passed our end time
        if (currentTime > end) break;
      }
    }
    
    if (segments.length === 0) {
      throw new Error('No segments found for the specified time range');
    }
    
    // Download and concatenate the segments
    const segmentBuffers = [];
    for (const segment of segments) {
      const segmentResponse = await fetch(segment.url);
      if (segmentResponse.ok) {
        const buffer = await segmentResponse.arrayBuffer();
        segmentBuffers.push(new Uint8Array(buffer));
      }
    }
    
    // Concatenate all segment buffers
    const totalLength = segmentBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const buffer of segmentBuffers) {
      result.set(buffer, offset);
      offset += buffer.length;
    }
    
    // Return the concatenated video
    return new Response(result, {
      headers: {
        'Content-Type': 'video/mp2t', // Transport Stream format
        'Content-Disposition': `attachment; filename="${filename.replace('.mp4', '.ts')}"`,
        'Content-Length': result.length.toString(),
      },
    });
    
  } catch (error) {
    console.error('Download error:', error);
    return new Response(JSON.stringify({ 
      error: 'Processing failed', 
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};