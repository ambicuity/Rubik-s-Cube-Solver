/**
 * Google Cloud Function Proxy for Google Gemini API
 * 
 * Deployment Instructions:
 * 1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
 * 2. Create a new GCP project or use existing one
 * 3. Enable Cloud Functions API
 * 4. Save your Gemini API key in Secret Manager:
 *    gcloud secrets create gemini-api-key --data-file=<path-to-key-file>
 * 5. Deploy this function:
 *    gcloud functions deploy gemini-proxy \
 *      --runtime nodejs18 \
 *      --trigger-http \
 *      --allow-unauthenticated \
 *      --set-secrets 'GEMINI_API_KEY=gemini-api-key:latest'
 * 6. Update geminiClient.js with your function URL
 * 
 * package.json required:
 * {
 *   "name": "gemini-proxy",
 *   "version": "1.0.0",
 *   "dependencies": {
 *     "@google-cloud/functions-framework": "^3.0.0"
 *   }
 * }
 */

const functions = require('@google-cloud/functions-framework');

functions.http('geminiProxy', async (req, res) => {
  // Handle CORS
  res.set('Access-Control-Allow-Origin', '*'); // In production, replace with your domain
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { prompt, maxTokens = 1000 } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    // Get API key from environment (injected from Secret Manager)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('API key not configured');
      res.status(500).json({ error: 'API key not configured' });
      return;
    }

    // Call Gemini API
    const response = await fetch(
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      res.status(response.status).json({ error: 'Gemini API error' });
      return;
    }

    const data = await response.json();
    
    // Extract text from response
    const explanation = data.candidates?.[0]?.content?.parts?.[0]?.text || 
                       'No response generated';

    res.status(200).json({ 
      explanation,
      success: true 
    });

  } catch (error) {
    console.error('Function error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});
