const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const REPLICATE_API = 'https://api.replicate.com/v1';
const IMAGE_MODEL = 'black-forest-labs/flux-schnell';

async function generateImage(sceneVisual, sceneNum, jobDir) {
  console.log(`[IMG] Generating scene ${sceneNum}...`);
  const imgPath = path.join(jobDir, `scene_${String(sceneNum).padStart(2, '0')}.png`);
  
  try {
    // Try FREE Pollinations first
    const prompt = encodeURIComponent(`${sceneVisual}, cinematic lighting, high quality, professional`);
    const url = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&nologo=true&seed=${sceneNum}&t=${Date.now()}`;
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    await fs.outputFile(imgPath, res.data);
    console.log(`[IMG] ✅ Scene ${sceneNum} via FREE Pollinations`);
    return imgPath;
  } catch (err) {
    console.warn(`[IMG] ⚠️ Pollinations failed. Falling back to Replicate...`);
    if (!process.env.REPLICATE_API_TOKEN) throw new Error("Pollinations failed and REPLICATE_API_TOKEN is missing.");
    
    // Fallback to Replicate
    const startRes = await axios.post(`${REPLICATE_API}/models/${IMAGE_MODEL}/predictions`, {
      input: { prompt: `${sceneVisual}, vibrant colors, high quality, 9:16 vertical`, aspect_ratio: '9:16', output_format: 'png', num_inference_steps: 4 }
    }, { headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' } });
    
    const predictionId = startRes.data.id;
    let imageUrl;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const check = await axios.get(`${REPLICATE_API}/predictions/${predictionId}`, { headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` } });
      if (check.data.status === 'succeeded') { imageUrl = Array.isArray(check.data.output) ? check.data.output[0] : check.data.output; break; }
      if (check.data.status === 'failed') throw new Error("Replicate failed");
    }
    const fetch = require('node-fetch');
    const dl = await fetch(imageUrl);
    await fs.outputFile(imgPath, await dl.buffer());
    console.log(`[IMG] ✅ Scene ${sceneNum} via Replicate Fallback`);
    return imgPath;
  }
}
module.exports = { generateImage };