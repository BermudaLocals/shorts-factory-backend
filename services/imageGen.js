const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const REPLICATE_API = 'https://api.replicate.com/v1';

// Flux Schnell — fast, cheap, great quality for kids content
const IMAGE_MODEL = 'black-forest-labs/flux-schnell';

async function generateImage(sceneVisual, sceneNum, jobDir) {
  console.log(`[IMG] Generating scene ${sceneNum}: ${sceneVisual.slice(0, 60)}...`);

  // Enhance prompt for kids/YouTube Shorts style
  const enhancedPrompt = `${sceneVisual}, vibrant colors, cartoon style, kid-friendly, bright and cheerful, Pixar-inspired, high quality, 9:16 vertical format`;

  // Start prediction
  const startRes = await axios.post(
    `${REPLICATE_API}/models/${IMAGE_MODEL}/predictions`,
    {
      input: {
        prompt: enhancedPrompt,
        aspect_ratio: '9:16',
        output_format: 'png',
        output_quality: 90,
        num_inference_steps: 4
      }
    },
    {
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const predictionId = startRes.data.id;
  console.log(`[IMG] Prediction started: ${predictionId}`);

  // Poll until complete
  const imageUrl = await pollReplicate(predictionId);
  console.log(`[IMG] Scene ${sceneNum} complete: ${imageUrl}`);

  // Download image to disk
  const imgPath = path.join(jobDir, `scene_${String(sceneNum).padStart(2, '0')}.png`);
  await downloadFile(imageUrl, imgPath);

  return imgPath;
}

async function pollReplicate(predictionId, maxWait = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await sleep(2000);
    const res = await axios.get(
      `${REPLICATE_API}/predictions/${predictionId}`,
      { headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` } }
    );
    const { status, output, error } = res.data;
    if (status === 'succeeded') {
      return Array.isArray(output) ? output[0] : output;
    }
    if (status === 'failed') {
      throw new Error(`Replicate prediction failed: ${error}`);
    }
    console.log(`[IMG] Status: ${status}...`);
  }
  throw new Error('Replicate timed out after 2 minutes');
}

async function downloadFile(url, dest) {
  const fetch = require('node-fetch');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
  const buffer = await res.buffer();
  await fs.outputFile(dest, buffer);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { generateImage };
