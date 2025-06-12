const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { url, start, end, filename } = JSON.parse(event.body);
    
    if (!url || !start || !end || !filename) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }

    const duration = end - start;
    const tempDir = '/tmp';
    const outputPath = path.join(tempDir, filename);

    // FFmpeg command
    const command = `ffmpeg -ss ${start} -i "${url}" -t ${duration} -c copy -y "${outputPath}"`;
    
    console.log('Executing:', command);
    
    // Execute FFmpeg
    await execAsync(command);
    
    // Read the file and return as binary
    const videoBuffer = fs.readFileSync(outputPath);
    
    // Clean up
    fs.unlinkSync(outputPath);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': videoBuffer.length.toString()
      },
      body: videoBuffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Processing failed', 
        details: error.message 
      })
    };
  }
};