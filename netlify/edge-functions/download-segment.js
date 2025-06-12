export default async (request, context) => {
  // Add CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const { url, start, end, filename } = await request.json();
    
    if (!url || start === undefined || end === undefined || !filename) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Processing segment: ${start}s to ${end}s from ${url}`);

    // Fetch the M3U8 playlist
    const playlistResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HLS-Downloader/1.0)'
      }
    });
    
    if (!playlistResponse.ok) {
      throw new Error(`Failed to fetch playlist: ${playlistResponse.status}`);
    }
    
    const playlistText = await playlistResponse.text();
    console.log('Playlist fetched successfully');
    
    // Parse the playlist to find segments
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
        
        // Check if this segment is in our time range
        if (segmentEnd > start && segmentStart < end) {
          const segmentUrl = line.startsWith('http') ? line : new URL(line, url).href;
          segments.push({
            url: segmentUrl,
            start: segmentStart,
            end: segmentEnd
          });
        }
        
        currentTime += segmentDuration;
        if (currentTime > end + 10) break; // Add buffer
      }
    }
    
    console.log(`Found ${segments.length} segments to download`);
    
    if (segments.length === 0) {
      throw new Error('No segments found for the specified time range');
    }
    
    // Download segments
    const segmentBuffers = [];
    for (let i = 0; i < segments.length; i++) {
      try {
        console.log(`Downloading segment ${i + 1}/${segments.length}`);
        const segmentResponse = await fetch(segments[i].url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; HLS-Downloader/1.0)'
          }
        });
        
        if (segmentResponse.ok) {
          const buffer = await segmentResponse.arrayBuffer();
          segmentBuffers.push(new Uint8Array(buffer));
        } else {
          console.warn(`Failed to download segment ${i + 1}: ${segmentResponse.status}`);
        }
      } catch (error) {
        console.warn(`Error downloading segment ${i + 1}:`, error);
      }
    }
    
    if (segmentBuffers.length === 0) {
      throw new Error('Failed to download any segments');
    }
    
    // Concatenate buffers
    const totalLength = segmentBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const buffer of segmentBuffers) {
      result.set(buffer, offset);
      offset += buffer.length;
    }
    
    console.log(`Successfully processed ${segmentBuffers.length} segments, total size: ${totalLength} bytes`);
    
    return new Response(result, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'video/mp2t',
        'Content-Disposition': `attachment; filename="${filename.replace('.mp4', '.ts')}"`,
        'Content-Length': result.length.toString(),
      },
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    return new Response(JSON.stringify({ 
      error: 'Processing failed', 
      details: error.message 
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};