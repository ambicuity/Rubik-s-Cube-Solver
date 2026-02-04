/**
 * Cloudflare Worker Proxy for Google Gemini API
 * 
 * Deployment Instructions:
 * 1. Sign up for Cloudflare Workers (free tier available)
 * 2. Create a new Worker
 * 3. Copy this code into the Worker editor
 * 4. Set environment variable: GEMINI_API_KEY (in Worker settings)
 * 5. Deploy the Worker
 * 6. Update geminiClient.js with your Worker URL
 * 
 * Security Features:
 * - API key stored securely in Worker environment
 * - CORS configured for your domain
 * - Rate limiting can be added
 * - Request validation
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

async function handleRequest(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleCORS();
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Parse request body
    const body = await request.json();
    const { prompt, maxTokens = 1000 } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get API key from environment variable
    const apiKey = GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.7
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      return new Response(JSON.stringify({ error: 'Gemini API error' }), {
        status: geminiResponse.status,
        headers: corsHeaders()
      });
    }

    const geminiData = await geminiResponse.json();
    
    // Extract text from response
    const explanation = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 
                       'No response generated';

    return new Response(JSON.stringify({ 
      explanation,
      success: true 
    }), {
      status: 200,
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Worker error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // In production, replace with your domain
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
